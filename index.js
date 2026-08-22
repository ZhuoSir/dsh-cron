// dsh-cron: scheduled tasks for DeepSeek Harness.
//
// Tasks fire by injecting a plugin-sourced user message into the most
// recently active root agent via agent.followup(), which queues an ordinary
// turn and wakes the driver — the same delivery path dsh-schedule uses.
//
// Task sources:
//   - config.tasks in cordis.yml (static, origin "config")
//   - cron_add tool calls and POST /cron/api/add (dynamic, origin "dynamic",
//     persisted to storagePath)
//
// Run stamps (lastRunAt / firedAt), enabled overrides, and execution history
// are persisted so a restart never refires a consumed slot and the UI can
// show what ran. Under `dsh web` the plugin additionally serves
// POST /cron/api/<method> for its client-half panel (optional webServer
// injection: headless profiles keep full scheduling without the API).

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

import Schema from '@deepseek-ai/schemastery'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'cron'

export const inject = ['agents', 'tools']

// Minimum fixed-interval seconds. Deliberately small-but-nonzero: every fire
// is a full agent turn (a real model call), so sub-10s loops burn tokens and
// can starve the session; 10s leaves room for testing and near-realtime use.
const MIN_EVERY_SECONDS = 10
const TASK_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/
const DAILY_RE = /^([01]\d|2[0-3]):([0-5]\d)$/
const STORAGE_VERSION = 1
const MAX_HISTORY = 500
const EXCERPT_LENGTH = 300

const TaskSchema = Schema.object({
  id: Schema.string().description('Task id, unique across config and dynamic tasks.'),
  prompt: Schema.string().description('The prompt the agent executes when the task fires.'),
  at: Schema.string().description('ISO 8601 instant for a one-shot task, e.g. 2026-08-23T09:00:00+08:00.'),
  every: Schema.number().description(`Fixed interval in seconds (min ${MIN_EVERY_SECONDS}).`),
  daily: Schema.string().description('Local wall-clock time "HH:MM", fires once per day.'),
  cron: Schema.string().description('Standard 5-field cron expression (minute hour day month weekday), local time.'),
  sessionId: Schema.string().description('Bind the task to one session id: runs are delivered there instead of the most recently active session.'),
  enabled: Schema.boolean().default(true),
})

export const Config = Schema.object({
  storagePath: Schema.string().default(''),
  historyPath: Schema.string().default(''),
  tickSeconds: Schema.number().default(15),
  tasks: Schema.array(TaskSchema).default([]),
})

// --- scheduling ------------------------------------------------------------

/** Count how many schedule rules one task carries. */
function ruleCount(task) {
  return (task.at ? 1 : 0) + (task.every != null ? 1 : 0) + (task.daily ? 1 : 0) + (task.cron ? 1 : 0)
}

// --- cron expressions (standard 5 fields, local time) ------------------------

const CRON_RANGES = [
  [0, 59], // minute
  [0, 23], // hour
  [1, 31], // day of month
  [1, 12], // month
  [0, 7], // day of week (0 and 7 are Sunday)
]

/** Parse one cron field into a set of allowed values, or null when invalid. */
function parseCronField(field, [min, max]) {
  const values = new Set()
  for (const part of field.split(',')) {
    const m = /^(\*|\d+)(?:-(\d+))?(?:\/(\d+))?$/.exec(part)
    if (!m) return null
    const step = m[3] != null ? Number(m[3]) : 1
    if (step < 1) return null
    let lo
    let hi
    if (m[1] === '*') {
      lo = min
      hi = max
    } else if (m[2] != null) {
      lo = Number(m[1])
      hi = Number(m[2])
    } else if (m[3] != null) {
      // "a/n" means a..max with step n (Vixie cron behavior).
      lo = Number(m[1])
      hi = max
    } else {
      lo = Number(m[1])
      hi = lo
    }
    if (lo < min || hi > max || lo > hi) return null
    for (let v = lo; v <= hi; v += step) values.add(v)
  }
  return values.size > 0 ? values : null
}

/**
 * Parse a standard 5-field cron expression ("分 时 日 月 周"), or return null.
 * Supports *, lists (a,b), ranges (a-b), and steps (*\/n, a-b/n, a/n).
 */
function parseCron(expr) {
  if (typeof expr !== 'string') return null
  const fields = expr.trim().split(/\s+/)
  if (fields.length !== 5) return null
  const parsed = []
  for (let i = 0; i < 5; i++) {
    const set = parseCronField(fields[i], CRON_RANGES[i])
    if (!set) return null
    parsed.push(set)
  }
  // Normalize Sunday: 7 is an alias of 0.
  if (parsed[4].has(7)) {
    parsed[4].delete(7)
    parsed[4].add(0)
  }
  return {
    minute: parsed[0],
    hour: parsed[1],
    dom: parsed[2],
    month: parsed[3],
    dow: parsed[4],
    domStar: fields[2] === '*',
    dowStar: fields[4] === '*',
  }
}

function cronMatches(cron, date) {
  if (!cron.minute.has(date.getMinutes())) return false
  if (!cron.hour.has(date.getHours())) return false
  if (!cron.month.has(date.getMonth() + 1)) return false
  const domMatch = cron.dom.has(date.getDate())
  const dowMatch = cron.dow.has(date.getDay())
  // Standard cron: when BOTH dom and dow are restricted, either may match.
  if (!cron.domStar && !cron.dowStar) return domMatch || dowMatch
  return domMatch && dowMatch
}

/** First matching local minute strictly after `afterMs`, or null within 4 years. */
function nextCronSlot(cron, afterMs) {
  let t = Math.floor(afterMs / 60_000) * 60_000 + 60_000
  const limit = t + 4 * 366 * 24 * 60 * 60_000
  while (t < limit) {
    if (cronMatches(cron, new Date(t))) return t
    t += 60_000
  }
  return null
}

/** Validate a raw task record; returns an error string or null. */
function validateTask(task) {
  if (!task || typeof task !== 'object') return 'task must be an object'
  if (typeof task.id !== 'string' || !TASK_ID.test(task.id)) return `invalid task id: ${JSON.stringify(task.id)}`
  if (typeof task.prompt !== 'string' || task.prompt.trim() === '') return `task "${task.id}" needs a non-empty prompt`
  if (ruleCount(task) !== 1) return `task "${task.id}" must set exactly one of at / every / daily`
  if (task.at && !Number.isFinite(Date.parse(task.at))) return `task "${task.id}" has an unparseable at value`
  if (task.every != null && (!Number.isFinite(task.every) || task.every < MIN_EVERY_SECONDS)) {
    return `task "${task.id}" every must be a number >= ${MIN_EVERY_SECONDS}`
  }
  if (task.daily && !DAILY_RE.test(task.daily)) return `task "${task.id}" daily must be "HH:MM" (24h)`
  if (task.cron && !parseCron(task.cron)) return `task "${task.id}" has an invalid cron expression (want 5 fields: minute hour day month weekday)`
  return null
}

/** Generate a unique task id: time-ordered base36 plus a random suffix. */
function generateTaskId(tasks) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const id = `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
    if (!tasks.has(id)) return id
  }
  throw new Error('could not allocate a task id')
}

/** Today's local occurrence of a "HH:MM" rule at or before `now`, as epoch ms. */
function dailySlotToday(daily, now) {
  const m = DAILY_RE.exec(daily)
  if (!m) return null
  const d = new Date(now)
  d.setHours(Number(m[1]), Number(m[2]), 0, 0)
  return d.getTime()
}

/** Effective enabled state: a runtime override wins over the declared flag. */
function isEnabled(task) {
  return task.enabledOverride ?? task.enabled !== false
}

/**
 * Cached next cron slot for one task. Recomputed only after a successful
 * fire (which sets lastRunAt) or an edit, so ticks stay cheap.
 */
function cronNext(task, startedAt) {
  if (task.cronNext == null) {
    task.cronNext = nextCronSlot(task.cronParsed, task.lastRunAt ?? startedAt - 60_000)
  }
  return task.cronNext
}

/**
 * The scheduled slot a task is due for right now, or null when not due.
 * `startedAt` anchors `every`/`cron` tasks that have never run.
 */
function dueSlot(task, now, startedAt) {
  if (!isEnabled(task)) return null
  if (task.at) {
    if (task.firedAt) return null
    const t = Date.parse(task.at)
    return Number.isFinite(t) && now >= t ? t : null
  }
  if (task.every != null) {
    const slot = (task.lastRunAt ?? startedAt) + task.every * 1000
    return now >= slot ? slot : null
  }
  if (task.daily) {
    const slot = dailySlotToday(task.daily, now)
    if (slot == null || slot > now) return null
    // Already consumed today's slot (covers catch-up runs too).
    if ((task.lastRunAt ?? 0) >= slot) return null
    return slot
  }
  if (task.cron) {
    const slot = cronNext(task, startedAt)
    return slot != null && now >= slot ? slot : null
  }
  return null
}

/** Next scheduled fire time for display, or null when nothing is pending. */
function nextRunAt(task, now, startedAt) {
  if (!isEnabled(task)) return null
  if (task.at) return task.firedAt ? null : Date.parse(task.at)
  if (task.every != null) return (task.lastRunAt ?? startedAt) + task.every * 1000
  if (task.daily) {
    const slot = dailySlotToday(task.daily, now)
    if (slot == null) return null
    // Today's slot still ahead, or missed and not yet caught up -> today.
    if (slot > now || (task.lastRunAt ?? 0) < slot) return slot
    return slot + 86_400_000
  }
  if (task.cron) return cronNext(task, startedAt)
  return null
}

/** Public view of one task for tools, the HTTP API, and logs. */
function taskView(task, now, startedAt) {
  const next = nextRunAt(task, now, startedAt)
  return {
    id: task.id,
    prompt: task.prompt,
    schedule: task.at ? { at: task.at } : task.every != null ? { everySeconds: task.every } : task.daily ? { daily: task.daily } : { cron: task.cron },
    enabled: isEnabled(task),
    origin: task.origin,
    sessionId: task.sessionId ?? null,
    lastRunAt: task.lastRunAt ? new Date(task.lastRunAt).toISOString() : null,
    firedAt: task.firedAt ? new Date(task.firedAt).toISOString() : null,
    nextRunAt: next ? new Date(next).toISOString() : null,
  }
}

/** Injection-resistant framing: the model must see this is automation, not the user. */
function renderTaskMessage(task, slot) {
  return [
    `[cron] Scheduled task "${task.id}" fired.`,
    `Scheduled for: ${new Date(slot).toISOString()}`,
    `Fired at: ${new Date().toISOString()}`,
    '',
    'This is an automated task submitted by the cron plugin, not a message from the user.',
    'Execute the task inside <task> now, then report the result concisely.',
    '',
    '<task>',
    task.prompt,
    '</task>',
  ].join('\n')
}

/** Concatenated text blocks of one assistant message, for history excerpts. */
function messageText(message) {
  if (!message || !Array.isArray(message.content)) return ''
  return message.content
    .filter((block) => block && block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n')
    .trim()
}

// --- trust fence -----------------------------------------------------------
//
// Behaviorally identical to the /api gateway's fence in
// @deepseek-ai/dsh-client-connection (BSD-3-Clause), copied here the same way
// dsh-better-sidebar copies it: the package does not export these helpers and
// a plugin must not depend on its internals. Host-header loopback or a
// configured trusted authority passes; cross-site browser markers refuse.
// This is a DNS-rebinding / cross-site defense, not authentication.

function headerValue(headers, name) {
  const value = headers[name]
  return typeof value === 'string' ? value : undefined
}

function parseAuthority(authority) {
  try {
    return new URL(`http://${authority}`)
  } catch {
    return undefined
  }
}

function isLoopbackHostname(hostname) {
  if (hostname === 'localhost' || hostname === '[::1]') return true
  const parts = hostname.split('.')
  return parts.length === 4
    && parts[0] === '127'
    && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)
}

function canonicalAuthority(entry, entryUrl) {
  const port = entryUrl.port !== '' ? entryUrl.port : new URL(`https://${entry}`).port
  return port === '' ? entryUrl.hostname : `${entryUrl.hostname}:${port}`
}

function isTrustedAuthority(hostUrl, trustedHosts) {
  return trustedHosts.some((entry) => {
    const entryUrl = parseAuthority(entry)
    if (entryUrl === undefined) return false
    return canonicalAuthority(entry, entryUrl) === entryUrl.hostname
      ? entryUrl.hostname === hostUrl.hostname
      : entryUrl.host === hostUrl.host
  })
}

function isTrustedApiRequest(req, trustedHosts) {
  const host = headerValue(req.headers, 'host')
  if (host === undefined) return false
  const hostUrl = parseAuthority(host)
  if (hostUrl === undefined) return false
  if (!isLoopbackHostname(hostUrl.hostname) && !isTrustedAuthority(hostUrl, trustedHosts ?? [])) return false
  // Browser cross-site markers never appear on same-origin page fetches.
  if (headerValue(req.headers, 'sec-fetch-site') === 'cross-site') return false
  return true
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > 1024 * 1024) {
        reject(new Error('request body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        resolve(chunks.length === 0 ? {} : JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(new Error('invalid JSON body'))
      }
    })
    req.on('error', reject)
  })
}

function writeJson(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(payload)
}

// --- plugin ------------------------------------------------------------------

export function apply(ctx, config) {
  const logger = ctx.logger
  const startedAt = Date.now()
  const dshHome = process.env.DSH_HOME || join(homedir(), '.dsh')
  const storagePath = config.storagePath || join(dshHome, 'cron-tasks.json')
  const historyPath = config.historyPath || join(dshHome, 'cron-history.jsonl')

  /** @type {Map<string, object>} live task records keyed by id */
  const tasks = new Map()

  // --- task storage --------------------------------------------------------

  function save() {
    // Explicit field list: internal caches (cronParsed Sets, cronNext) never
    // reach the file and are rebuilt on load.
    const dynamic = [...tasks.values()]
      .filter((t) => t.origin === 'dynamic')
      .map((t) => ({ id: t.id, prompt: t.prompt, at: t.at, every: t.every, daily: t.daily, cron: t.cron, sessionId: t.sessionId, enabled: t.enabled }))
    const runs = {}
    const overrides = {}
    for (const t of tasks.values()) {
      if (t.lastRunAt || t.firedAt) runs[t.id] = { lastRunAt: t.lastRunAt ?? null, firedAt: t.firedAt ?? null }
      if (t.enabledOverride != null) overrides[t.id] = t.enabledOverride
    }
    const payload = JSON.stringify({ version: STORAGE_VERSION, tasks: dynamic, runs, overrides }, null, 2)
    try {
      mkdirSync(dirname(storagePath), { recursive: true })
      const tmp = `${storagePath}.tmp`
      writeFileSync(tmp, payload)
      renameSync(tmp, storagePath)
    } catch (error) {
      logger.warn(`cron: failed to write ${storagePath}: ${error?.message ?? error}`)
    }
  }

  function load() {
    if (!existsSync(storagePath)) return { dynamic: [], runs: {}, overrides: {} }
    try {
      const data = JSON.parse(readFileSync(storagePath, 'utf8'))
      return {
        dynamic: Array.isArray(data.tasks) ? data.tasks : [],
        runs: data.runs && typeof data.runs === 'object' ? data.runs : {},
        overrides: data.overrides && typeof data.overrides === 'object' ? data.overrides : {},
      }
    } catch (error) {
      logger.warn(`cron: ignoring unreadable storage ${storagePath}: ${error?.message ?? error}`)
      return { dynamic: [], runs: {}, overrides: {} }
    }
  }

  function addTask(raw, origin) {
    const invalid = validateTask(raw)
    if (invalid) return invalid
    if (tasks.has(raw.id)) return `task "${raw.id}" already exists`
    tasks.set(raw.id, {
      id: raw.id,
      prompt: raw.prompt,
      at: raw.at,
      every: raw.every,
      daily: raw.daily,
      cron: raw.cron,
      cronParsed: raw.cron ? parseCron(raw.cron) : null,
      cronNext: null,
      // The session the task was created in: fires deliver back there.
      sessionId: typeof raw.sessionId === 'string' && raw.sessionId !== '' ? raw.sessionId : null,
      enabled: raw.enabled !== false,
      enabledOverride: null,
      origin,
      lastRunAt: null,
      firedAt: null,
    })
    return null
  }

  // Boot: persisted dynamic tasks + run stamps, then config tasks on top.
  const stored = load()
  for (const raw of stored.dynamic) {
    const invalid = addTask(raw, 'dynamic')
    if (invalid) logger.warn(`cron: skipping stored task: ${invalid}`)
  }
  for (const raw of config.tasks ?? []) {
    const invalid = addTask(raw, 'config')
    if (invalid) logger.warn(`cron: skipping config task: ${invalid}`)
  }
  for (const [id, run] of Object.entries(stored.runs)) {
    const task = tasks.get(id)
    if (!task) continue
    if (Number.isFinite(run?.lastRunAt)) task.lastRunAt = run.lastRunAt
    if (Number.isFinite(run?.firedAt)) task.firedAt = run.firedAt
  }
  for (const [id, enabled] of Object.entries(stored.overrides)) {
    const task = tasks.get(id)
    if (task && typeof enabled === 'boolean') task.enabledOverride = enabled
  }

  // --- execution history -----------------------------------------------------

  /** Newest-last in-memory history, persisted as JSONL. */
  let history = []
  let historyLoaded = false
  let historySeq = 0

  function loadHistory() {
    if (historyLoaded) return
    historyLoaded = true
    if (!existsSync(historyPath)) return
    try {
      const lines = readFileSync(historyPath, 'utf8').split('\n')
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const record = JSON.parse(line)
          if (record && typeof record.id === 'string') {
            history.push(record)
            const seq = Number(record.seq)
            if (Number.isFinite(seq) && seq >= historySeq) historySeq = seq + 1
          }
        } catch { /* skip a torn line */ }
      }
      if (history.length > MAX_HISTORY) history = history.slice(-MAX_HISTORY)
    } catch (error) {
      logger.warn(`cron: ignoring unreadable history ${historyPath}: ${error?.message ?? error}`)
      history = []
    }
  }

  function persistHistory() {
    try {
      mkdirSync(dirname(historyPath), { recursive: true })
      const tmp = `${historyPath}.tmp`
      writeFileSync(tmp, history.map((record) => JSON.stringify(record)).join('\n') + (history.length > 0 ? '\n' : ''))
      renameSync(tmp, historyPath)
    } catch (error) {
      logger.warn(`cron: failed to write ${historyPath}: ${error?.message ?? error}`)
    }
  }

  function appendHistory(record) {
    loadHistory()
    history.push(record)
    if (history.length > MAX_HISTORY) history = history.slice(-MAX_HISTORY)
    persistHistory()
    return record
  }

  function updateHistory(id, patch) {
    const record = history.find((r) => r.id === id)
    if (!record) return
    Object.assign(record, patch)
    persistHistory()
  }

  /**
   * Runs awaiting their execution outcome, keyed by injected message id.
   * A run closes when a turn ends on the same session after its message
   * entered the surface.
   * @type {Map<string, { recordId: string, session: object, seen: boolean }>}
   */
  const pendingRuns = new Map()

  /**
   * Every callback entry point (timers, event listeners, HTTP handlers) is
   * wrapped so a plugin bug can NEVER escape as an uncaughtException /
   * unhandledRejection and take the host process down. The plugin does not
   * install process-level handlers — those belong to the host.
   */
  function guarded(label, fn) {
    return (...args) => {
      try {
        return fn(...args)
      } catch (error) {
        logger.warn(`cron: ${label} failed: ${error?.message ?? error}`)
        return undefined
      }
    }
  }

  ctx.on('session/event', guarded('session/event listener', (session, event) => {
    if (pendingRuns.size === 0) return
    // SessionEvent is an envelope: { type, seq, time, data } — the payload
    // (the message, the turn reason, …) lives under `data`.
    const data = event?.data ?? {}
    if (event.type === 'user/message') {
      const run = pendingRuns.get(data.id)
      if (run && !run.seen) {
        run.seen = true
        updateHistory(run.recordId, { status: 'running', startedAt: Date.now() })
      }
      return
    }
    if (event.type === 'assistant/message') {
      const text = messageText(data.message)
      if (!text) return
      for (const run of pendingRuns.values()) {
        if (run.seen && run.session === session) {
          updateHistory(run.recordId, { excerpt: text.slice(0, EXCERPT_LENGTH) })
        }
      }
      return
    }
    if (event.type === 'turn/end') {
      const reason = data.reason
      const kind = typeof reason?.kind === 'string' ? reason.kind : 'unknown'
      for (const [messageId, run] of pendingRuns) {
        if (!run.seen || run.session !== session) continue
        pendingRuns.delete(messageId)
        updateHistory(run.recordId, {
          status: kind === 'completed' ? 'completed' : 'failed',
          endReason: kind,
          completedAt: Date.now(),
        })
      }
    }
  }))

  // --- delivery --------------------------------------------------------------

  // The web UI may host several root agents (one per open session); deliver
  // to the one that most recently showed life.
  let lastActiveRoot = null
  ctx.on('agent/created', guarded('agent/created listener', ({ agent }) => {
    if (ctx.agents.roots().includes(agent)) lastActiveRoot = agent
  }))
  ctx.on('agent/status', guarded('agent/status listener', ({ agent }) => {
    if (agent && ctx.agents.roots().includes(agent)) lastActiveRoot = agent
  }))

  /**
   * Pick the delivery target for one task. A task created inside a session
   * (tool call or panel) is bound to that session and fires back into it, so
   * scheduled replies stay in the window the user created them from — not in
   * whatever window happens to be open. Only when the bound session is gone
   * (closed) do we fall back to the most recently active root.
   */
  function pickAgent(task) {
    const roots = ctx.agents.roots()
    if (task?.sessionId) {
      const bound = roots.find((agent) => agent.session?.id === task.sessionId)
      if (bound) return bound
      logger.warn(`cron: task "${task.id}" is bound to session "${task.sessionId}" which no longer exists; falling back to the active session`)
    }
    if (lastActiveRoot && roots.includes(lastActiveRoot)) return lastActiveRoot
    return roots.length > 0 ? roots[roots.length - 1] : null
  }

  /**
   * Deliver one task. Returns the history record when the message was
   * accepted, null when no agent could take it (retry next tick).
   */
  function fire(task, slot) {
    const agent = pickAgent(task)
    if (!agent) {
      logger.warn(`cron: task "${task.id}" is due but no root agent exists yet; will retry next tick`)
      return null
    }
    let message
    try {
      message = createUserMessage({
        content: [{ type: 'text', text: renderTaskMessage(task, slot) }],
        source: { kind: 'plugin', plugin: 'cron' },
      })
      // Queues an ordinary turn and wakes the driver; when the agent is
      // busy the turn waits behind the current one, so tasks never overlap.
      agent.followup(message)
    } catch (error) {
      logger.warn(`cron: followup failed for task "${task.id}": ${error?.message ?? error}`)
      return null
    }
    const now = Date.now()
    task.lastRunAt = now
    if (task.at) task.firedAt = now
    task.cronNext = null // recompute the cron slot from this run
    save()
    const record = appendHistory({
      id: `run-${historySeq}-${now.toString(36)}`,
      seq: historySeq++,
      taskId: task.id,
      prompt: task.prompt,
      sessionId: agent.session?.id ?? null,
      scheduledFor: new Date(slot).toISOString(),
      firedAt: new Date(now).toISOString(),
      status: 'delivered',
    })
    pendingRuns.set(message.id, { recordId: record.id, session: agent.session, seen: false })
    logger.info(`cron: fired task "${task.id}" (scheduled ${new Date(slot).toISOString()})`)
    return record
  }

  function tick() {
    const now = Date.now()
    for (const task of tasks.values()) {
      // Per-task isolation: one malformed task must not block the others,
      // and nothing here may ever escape the timer callback.
      try {
        const slot = dueSlot(task, now, startedAt)
        if (slot != null) fire(task, slot)
      } catch (error) {
        logger.warn(`cron: tick failed for task "${task?.id}": ${error?.message ?? error}`)
      }
    }
  }

  // One interval owns the whole schedule; cleared automatically on unload.
  ctx.effect(() => {
    const safeTick = guarded('tick', tick)
    // A short first delay lets the surrounding composition finish booting
    // so due tasks find a live root agent on the first tick.
    const first = setTimeout(safeTick, 3000)
    const timer = setInterval(safeTick, Math.max(1, config.tickSeconds) * 1000)
    return () => {
      clearTimeout(first)
      clearInterval(timer)
    }
  })

  // --- shared operations (tools + HTTP API) -----------------------------------

  function listTasks() {
    const now = Date.now()
    return [...tasks.values()].map((t) => taskView(t, now, startedAt))
  }

  function addDynamicTask(raw, sessionId) {
    const input = { ...raw }
    // The id is optional for callers: the web form never asks for one and
    // the model may omit it — allocate a unique id instead.
    if (input.id == null || input.id === '') input.id = generateTaskId(tasks)
    // Bind to the caller's session so the task fires back into the window
    // it was created from. An explicit payload sessionId wins (panel add).
    if (sessionId && (input.sessionId == null || input.sessionId === '')) input.sessionId = sessionId
    const invalid = validateTask(input)
    if (invalid) throw new Error(invalid)
    const added = addTask(input, 'dynamic')
    if (added) throw new Error(added)
    save()
    const task = tasks.get(input.id)
    return taskView(task, Date.now(), startedAt)
  }

  function removeDynamicTask(id) {
    const task = tasks.get(id)
    if (!task) throw new Error(`no task with id "${id}"`)
    if (task.origin !== 'dynamic') throw new Error(`task "${id}" comes from cordis.yml config; remove it there`)
    tasks.delete(id)
    save()
    return { removed: id }
  }

  const RULE_KEYS = ['at', 'every', 'daily', 'cron']

  /**
   * Edit a dynamic task. Prompt updates in place; when any schedule rule key
   * is present in the patch the whole schedule is replaced (the other rules
   * are cleared) and the run stamps reset so the new rule takes effect now.
   */
  function updateDynamicTask(id, patch) {
    const task = tasks.get(id)
    if (!task) throw new Error(`no task with id "${id}"`)
    if (task.origin !== 'dynamic') throw new Error(`task "${id}" comes from cordis.yml config; edit it there`)
    const merged = { id, prompt: task.prompt }
    for (const k of RULE_KEYS) if (task[k] != null) merged[k] = task[k]
    if (typeof patch.prompt === 'string' && patch.prompt.trim() !== '') merged.prompt = patch.prompt.trim()
    const scheduleTouched = RULE_KEYS.some((k) => patch[k] !== undefined && patch[k] !== null)
    if (scheduleTouched) {
      for (const k of RULE_KEYS) delete merged[k]
      for (const k of RULE_KEYS) if (patch[k] !== undefined && patch[k] !== null) merged[k] = patch[k]
    }
    const invalid = validateTask(merged)
    if (invalid) throw new Error(invalid)
    task.prompt = merged.prompt
    for (const k of RULE_KEYS) task[k] = merged[k]
    if (scheduleTouched) {
      task.lastRunAt = null
      task.firedAt = null
      task.cronNext = null
      task.cronParsed = task.cron ? parseCron(task.cron) : null
    }
    save()
    return taskView(task, Date.now(), startedAt)
  }

  function setTaskEnabled(id, enabled) {
    const task = tasks.get(id)
    if (!task) throw new Error(`no task with id "${id}"`)
    if (typeof enabled !== 'boolean') throw new Error('enabled must be a boolean')
    // null clears the override when it matches the declared flag again.
    task.enabledOverride = enabled === (task.enabled !== false) ? null : enabled
    save()
    return taskView(task, Date.now(), startedAt)
  }

  function runTaskNow(id) {
    const task = tasks.get(id)
    if (!task) throw new Error(`no task with id "${id}"`)
    const record = fire(task, Date.now())
    if (!record) throw new Error('no root agent is available to receive the task')
    return { fired: id, run: record }
  }

  function listHistory(limit) {
    loadHistory()
    const cap = Number.isFinite(limit) && limit > 0 ? Math.min(limit, MAX_HISTORY) : 100
    return history.slice(-cap).reverse()
  }

  // --- management tools --------------------------------------------------------

  ctx.tools.register(defineTool({
    name: 'cron_list',
    description: 'List all scheduled tasks (from config and added at runtime) with their state and next run time.',
    parameters: {},
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute() {
      return JSON.stringify(listTasks(), null, 2)
    },
  }))

  ctx.tools.register(defineTool({
    name: 'cron_add',
    description: 'Add a scheduled task. Set exactly one rule: at (ISO instant, one-shot), every (interval seconds, min 60), daily ("HH:MM" local time), or cron (standard 5-field expression "minute hour day month weekday", local time — e.g. "0 9 * * *" = daily 09:00, "*/30 * * * *" = every 30 min, "0 9 * * 1" = Mondays 09:00). Convert the user\'s natural-language schedule into one of these rules. The task prompt is delivered to the agent automatically when due and the result is replied in the conversation. Dynamic tasks persist across restarts.',
    parameters: {
      id: { type: 'string', description: 'Optional unique task id (letters, digits, -, _). One is generated when omitted.' },
      prompt: { type: 'string', required: true, description: 'What the agent should do when the task fires.' },
      at: { type: 'string', description: 'ISO 8601 instant for a one-shot task.' },
      every: { type: 'number', description: `Fixed interval in seconds (min ${MIN_EVERY_SECONDS}).` },
      daily: { type: 'string', description: 'Local wall-clock "HH:MM" for a daily task.' },
      cron: { type: 'string', description: 'Standard 5-field cron expression (minute hour day month weekday), local time.' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args, exec) {
      // Bind to the calling session: the task's runs reply in this window.
      const view = addDynamicTask(args, exec?.agent?.session?.id)
      return `Task "${view.id}" added. Next run: ${view.nextRunAt}`
    },
  }))

  ctx.tools.register(defineTool({
    name: 'cron_update',
    description: 'Edit a dynamically added scheduled task: change its prompt and/or replace its schedule rule. Pass exactly one rule (at / every / daily / cron) to change the schedule; omitted fields stay unchanged. Tasks declared in cordis.yml config cannot be edited at runtime.',
    parameters: {
      id: { type: 'string', required: true, description: 'Id of the task to edit.' },
      prompt: { type: 'string', description: 'New task prompt.' },
      at: { type: 'string', description: 'Replace the schedule with a one-shot ISO 8601 instant.' },
      every: { type: 'number', description: `Replace the schedule with a fixed interval in seconds (min ${MIN_EVERY_SECONDS}).` },
      daily: { type: 'string', description: 'Replace the schedule with a daily local "HH:MM".' },
      cron: { type: 'string', description: 'Replace the schedule with a standard 5-field cron expression.' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      const view = updateDynamicTask(args.id, args)
      return `Task "${view.id}" updated. Next run: ${view.nextRunAt}`
    },
  }))

  ctx.tools.register(defineTool({
    name: 'cron_remove',
    description: 'Remove a dynamically added scheduled task by id. Tasks declared in cordis.yml config cannot be removed at runtime.',
    parameters: {
      id: { type: 'string', required: true, description: 'Id of the task to remove.' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      removeDynamicTask(args.id)
      return `Task "${args.id}" removed.`
    },
  }))

  ctx.tools.register(defineTool({
    name: 'cron_history',
    description: 'Show recent scheduled-task execution records: when each task fired, whether it completed, and a short result excerpt.',
    parameters: {
      limit: { type: 'number', description: 'Max records to return (default 20, newest first).' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      return JSON.stringify(listHistory(args.limit ?? 20), null, 2)
    },
  }))

  // --- HTTP API for the web client half -----------------------------------------
  //
  // Optional injection: profiles without the web stack (headless) never
  // activate this block and keep full scheduling.

  ctx.inject(['webServer', 'webRuntime'], (webCtx) => {
    const fence = (req) => isTrustedApiRequest(req, webCtx.webRuntime.trustedHosts)

    const api = {
      list: () => ({ tasks: listTasks() }),
      add: (payload) => ({ task: addDynamicTask(payload) }),
      update: (payload) => ({ task: updateDynamicTask(payload?.id, payload ?? {}) }),
      remove: (payload) => removeDynamicTask(payload?.id),
      toggle: (payload) => ({ task: setTaskEnabled(payload?.id, payload?.enabled) }),
      run: (payload) => runTaskNow(payload?.id),
      history: (payload) => ({ records: listHistory(payload?.limit) }),
    }

    webCtx.effect(() => webCtx.webServer.register({
      kind: 'prefix',
      path: '/cron/api',
      handler: async (req, res) => {
        try {
          if (!fence(req)) {
            writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'forbidden' } })
            return
          }
          if (req.method !== 'POST') {
            writeJson(res, 405, { ok: false, error: { code: 'method-error', message: 'method not allowed' } })
            return
          }
          const pathname = new URL(req.url ?? '/', 'http://dsh.internal').pathname
          const method = pathname.startsWith('/cron/api/') ? pathname.slice('/cron/api/'.length) : undefined
          if (method === undefined || method.includes('/')) {
            writeJson(res, 404, { ok: false, error: { code: 'not-found', message: 'unknown cron API method' } })
            return
          }
          const payload = await readJsonBody(req)
          const handler = api[method]
          if (handler === undefined) {
            writeJson(res, 404, { ok: false, error: { code: 'not-found', message: `unknown cron API method "${method}"` } })
            return
          }
          writeJson(res, 200, { ok: true, result: handler(payload) })
        } catch (error) {
          // Last line of defense: a rejected handler promise must never
          // escape into the webserver as an unhandledRejection.
          try {
            if (!res.headersSent) writeJson(res, 400, { ok: false, error: { code: 'bad-request', message: error?.message ?? String(error) } })
            else res.end()
          } catch { /* socket already gone */ }
        }
      },
    }), 'dsh-cron: /cron/api routes')

    logger.info('cron: HTTP API mounted at /cron/api')
  })

  logger.info(`cron: loaded ${tasks.size} task(s), storage at ${storagePath}`)
}
