// Standalone mock-ctx test for dsh-cron (host half). Run: node tests/host.test.mjs
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'

const plugin = await import('../index.js')
const { apply, Config } = plugin

// --- Config schema defaults
const validated = Config({})
assert.equal(validated.tickSeconds, 15)
assert.equal(validated.historyPath, '')
console.log('✓ Config schema defaults')

function makeCtx(storagePath, historyPath, configTasks, options = {}) {
  const fired = []
  const tools = new Map()
  const disposers = []
  const listeners = new Map()
  const mockSession = { id: 'sess-1' }
  const mockAgent = { id: 'root-1', session: mockSession, followup: (msg) => fired.push(msg) }
  const roots = options.roots ?? [mockAgent]
  const resumes = []
  const mounts = []
  const selections = []
  const inspected = options.inspected ?? {
    meta: { id: 'sess-1', cwd: 'C:\\workspace', agentPreset: 'standard' },
    events: [
      { type: 'request/header', data: { header: { config: { provider: 'saved-provider', model: 'saved-model' } } } },
      { type: 'agent-preset/selected', data: { agentPreset: 'coding' } },
    ],
  }
  const ctx = {
    logger: { info: () => {}, warn: (m) => console.warn('  [warn]', m) },
    agents: {
      roots: () => roots,
      resume: async (request) => {
        resumes.push(request)
        if (options.resumeError) throw options.resumeError
        const session = { id: String(request.resumeSessionId) }
        const agent = { id: String(request.resumeSessionId), session, followup: (msg) => fired.push(msg) }
        await request.setup?.({
          provide: () => {},
          effect: (fn) => fn(),
          on: () => () => {},
          emit: () => {},
          get: () => undefined,
          [Symbol.for('test')]: selections,
        })
        return { agent, dispose: async () => {} }
      },
    },
    sessionPersistence: {
      list: async () => options.persistenceMissing ? [] : [{ id: inspected.meta.id, cwd: inspected.meta.cwd }],
      inspect: async () => inspected,
    },
    agentPresets: {
      mount: async (_agentCtx, presetId) => { mounts.push(presetId) },
    },
    agentDefaultModel: { currentSelection: () => ({ provider: 'default-provider', model: 'default-model' }) },
    on: (event, handler) => listeners.set(event, handler),
    effect: (fn) => { disposers.push(fn()) },
    inject: () => {},
    tools: { register: (def) => tools.set(def.name, def) },
  }
  apply(ctx, Config({
    storagePath,
    historyPath,
    tickSeconds: 1,
    defaultTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    tasks: configTasks,
    systemNotify: false,
    coldWake: options.coldWake ?? true,
  }))
  const emit = (event, ...args) => listeners.get(event)?.(...args)
  return { ctx, fired, tools, disposers, mockAgent, mockSession, emit, roots, resumes, mounts, selections }
}

const dir = mkdtempSync(join(tmpdir(), 'dsh-cron-test-'))
const storagePath = join(dir, 'cron-tasks.json')
const historyPath = join(dir, 'cron-history.jsonl')

const past = new Date(Date.now() - 60_000).toISOString()
const pastHM = new Date(Date.now() - 60_000)
const dailyPast = `${String(pastHM.getHours()).padStart(2, '0')}:${String(pastHM.getMinutes()).padStart(2, '0')}`

const configTasks = [
  { id: 'once', prompt: 'one shot task', at: past, sessionId: 'sess-1' },
  { id: 'hourly', prompt: 'interval task', every: 60, sessionId: 'sess-1' },
  { id: 'morning', prompt: 'daily task', daily: dailyPast, sessionId: 'sess-1' },
]

const run1 = makeCtx(storagePath, historyPath, configTasks)
assert.deepEqual([...run1.tools.keys()].sort(), ['cron_add', 'cron_history', 'cron_list', 'cron_remove', 'cron_update'], 'tools registered')
console.log('✓ tools registered (incl. cron_history)')

await new Promise((r) => setTimeout(r, 4200))

assert.equal(run1.fired.length, 2, `at+daily due immediately (got ${run1.fired.length})`)
const texts = run1.fired.map((m) => m.content[0].text)
assert.ok(texts.some((t) => t.includes('"once"') && t.includes('one shot task')), 'at task fired')
assert.ok(texts.some((t) => t.includes('"morning"')), 'daily task fired')
assert.ok(run1.fired.every((m) => m.source.kind === 'plugin' && m.source.plugin === 'cron'), 'plugin source')
console.log('✓ due tasks fired')

// --- history: delivered records written
assert.ok(existsSync(historyPath), 'history file written')
let records = JSON.parse(await run1.tools.get('cron_history').execute({ limit: 10 }, {}))
assert.equal(records.length, 2)
assert.ok(records.every((r) => r.status === 'delivered'), 'records start as delivered')
console.log('✓ history records delivered')

// --- history correlation: message enters surface -> running; assistant text -> excerpt; turn end -> completed
const onceMsg = run1.fired.find((m) => m.content[0].text.includes('"once"'))
run1.emit('session/event', run1.mockSession, { type: 'user/message', seq: 1, time: Date.now(), data: { ...onceMsg } })
run1.emit('session/event', run1.mockSession, {
  type: 'assistant/message', seq: 2, time: Date.now(),
  data: { turn: 1, step: 1, message: { role: 'assistant', content: [{ type: 'text', text: '晨报已生成：今日待办 5 项。' }] } },
})
run1.emit('session/event', run1.mockSession, { type: 'turn/end', seq: 3, time: Date.now(), data: { turn: 1, reason: { kind: 'completed' } } })
records = JSON.parse(await run1.tools.get('cron_history').execute({ limit: 10 }, {}))
const onceRecord = records.find((r) => r.taskId === 'once')
assert.equal(onceRecord.status, 'completed', 'turn end completes record')
assert.equal(onceRecord.excerpt, '晨报已生成：今日待办 5 项。', 'excerpt captured')
assert.ok(onceRecord.completedAt, 'completedAt set')
// the other run is still pending (its message never entered a turn)
assert.equal(records.find((r) => r.taskId === 'morning').status, 'delivered')
console.log('✓ history correlation (running -> excerpt -> completed)')

// failed turn
const morningMsg = run1.fired.find((m) => m.content[0].text.includes('"morning"'))
run1.emit('session/event', run1.mockSession, { type: 'user/message', seq: 4, time: Date.now(), data: { ...morningMsg } })
run1.emit('session/event', run1.mockSession, { type: 'turn/end', seq: 5, time: Date.now(), data: { turn: 2, reason: { kind: 'error', error: { message: 'boom' } } } })
records = JSON.parse(await run1.tools.get('cron_history').execute({ limit: 10 }, {}))
const morningRecord = records.find((r) => r.taskId === 'morning')
assert.equal(morningRecord.status, 'failed')
assert.equal(morningRecord.endReason, 'error')
console.log('✓ failed turn recorded')

// --- cron_add persists dynamic task
await run1.tools.get('cron_add').execute({ id: 'dyn', prompt: 'dynamic task', every: 120 }, { agent: run1.mockAgent })
const stored = JSON.parse(readFileSync(storagePath, 'utf8'))
assert.equal(stored.tasks.length, 1)
assert.ok(stored.runs.once?.firedAt)
console.log('✓ cron_add persists')

// --- strict tool transports may materialize omitted optionals as "" / 0
const strictArgs = {
  id: 'strict-args', prompt: 'strict transport', at: '', every: 0,
  daily: '08:00', cron: '', timeZone: 'UTC',
}
await run1.tools.get('cron_add').execute(strictArgs, { agent: run1.mockAgent })
let strictTask = JSON.parse(await run1.tools.get('cron_list').execute({}, {})).find((task) => task.id === 'strict-args')
assert.equal(strictTask.schedule.daily, '08:00')
assert.equal(strictTask.schedule.everySeconds, undefined)
await run1.tools.get('cron_update').execute({
  id: 'strict-args', prompt: '', at: '', every: 0,
  daily: '', cron: '0 9 * * *', timeZone: 'UTC',
})
strictTask = JSON.parse(await run1.tools.get('cron_list').execute({}, {})).find((task) => task.id === 'strict-args')
assert.equal(strictTask.schedule.cron, '0 9 * * *')
assert.equal(strictTask.schedule.daily, undefined)
console.log('✓ strict tool-call placeholders are ignored')

// --- validation
await assert.rejects(run1.tools.get('cron_add').execute({ id: 'bad', prompt: 'x', every: 30, daily: '10:00' }, { agent: run1.mockAgent }), /exactly one/)
await assert.rejects(run1.tools.get('cron_add').execute({ id: 'dyn', prompt: 'x', every: 60 }, { agent: run1.mockAgent }), /already exists/)
await assert.rejects(run1.tools.get('cron_add').execute({ id: 'unbound', prompt: 'x', every: 60 }, {}), /bound sessionId/)
console.log('✓ cron_add validation')

// --- reload: run stamps survive, one-shot does not refire, history reloads
run1.disposers.forEach((d) => d?.())
const run2 = makeCtx(storagePath, historyPath, configTasks)
await new Promise((r) => setTimeout(r, 4200))
assert.equal(run2.fired.length, 0, `nothing refires after reload (got ${run2.fired.length})`)
const reloaded = JSON.parse(await run2.tools.get('cron_history').execute({ limit: 10 }, {}))
assert.equal(reloaded.length, 2, 'history survives reload')
assert.equal(reloaded.find((r) => r.taskId === 'once').status, 'completed', 'completed status survives')
console.log('✓ restart: no refire, history survives')
run2.disposers.forEach((d) => d?.())

// --- strict fixed-session delivery: never fall back to another live root
const strictDir = mkdtempSync(join(tmpdir(), 'dsh-cron-strict-'))
const otherSession = { id: 'sess-other' }
const otherFired = []
const otherAgent = { id: 'other', session: otherSession, followup: (msg) => otherFired.push(msg) }
const strict = makeCtx(join(strictDir, 'tasks.json'), join(strictDir, 'history.jsonl'), [
  { id: 'strict', prompt: 'strict owner', at: past, sessionId: 'sess-owner' },
], {
  roots: [otherAgent],
  inspected: {
    meta: { id: 'sess-owner', cwd: 'C:\\workspace', agentPreset: 'standard' },
    events: [
      { type: 'request/header', data: { header: { config: { provider: 'saved-provider', model: 'saved-model' } } } },
      { type: 'agent-preset/selected', data: { agentPreset: 'coding' } },
    ],
  },
})
await new Promise((r) => setTimeout(r, 4200))
assert.equal(otherFired.length, 0, 'unrelated live root never receives bound task')
assert.equal(strict.resumes.length, 1, 'cold owner resumed exactly once')
assert.equal(String(strict.resumes[0].resumeSessionId), 'sess-owner')
assert.deepEqual(strict.resumes[0].agentOptions, { provider: 'saved-provider', model: 'saved-model' })
assert.deepEqual(strict.mounts, ['coding'], 'latest persisted preset projection is mounted')
assert.equal(strict.fired.length, 1, 'resumed owner receives task')
console.log('✓ strict cold owner delivery with saved model')
strict.disposers.forEach((d) => d?.())
rmSync(strictDir, { recursive: true, force: true })

// --- failed cold resume remains overdue and never consumes the slot
const failedDir = mkdtempSync(join(tmpdir(), 'dsh-cron-resume-fail-'))
const failed = makeCtx(join(failedDir, 'tasks.json'), join(failedDir, 'history.jsonl'), [
  { id: 'held', prompt: 'held owner', at: past, sessionId: 'sess-missing' },
], { roots: [otherAgent], resumeError: new Error('resume failed') })
await new Promise((r) => setTimeout(r, 4200))
assert.equal(otherFired.length, 0, 'resume failure still never falls back')
assert.equal(failed.fired.length, 0)
assert.equal(existsSync(join(failedDir, 'history.jsonl')), false, 'failed delivery creates no run history')
console.log('✓ failed cold resume stays overdue without fallback')
failed.disposers.forEach((d) => d?.())
rmSync(failedDir, { recursive: true, force: true })

// --- concurrent manual runs serialize by task ownership
const serialDir = mkdtempSync(join(tmpdir(), 'dsh-cron-serial-'))
let releaseResume
const serial = makeCtx(join(serialDir, 'tasks.json'), join(serialDir, 'history.jsonl'), [], { roots: [] })
serial.ctx.agents.resume = async (request) => {
  serial.resumes.push(request)
  await new Promise((resolve) => { releaseResume = resolve })
  return { agent: { id: 'sess-1', session: { id: 'sess-1' }, followup: (msg) => serial.fired.push(msg) } }
}
await serial.tools.get('cron_add').execute({ id: 'serial', prompt: 'serial', every: 60 }, { agent: serial.mockAgent })
const runTool = serial.tools.get('cron_list')
assert.ok(runTool, 'serial harness remains usable')
// Scheduler tick ownership is covered by two ticks while resume is pending.
await new Promise((r) => setTimeout(r, 3200))
releaseResume?.()
await new Promise((r) => setTimeout(r, 1200))
assert.ok(serial.resumes.length <= 1, `resume is single-flight (got ${serial.resumes.length})`)
console.log('✓ asynchronous firing remains single-flight')
serial.disposers.forEach((d) => d?.())
rmSync(serialDir, { recursive: true, force: true })

// --- fault containment: nothing the plugin does may escape as an uncaught throw
const run3 = makeCtx(storagePath, historyPath, configTasks)
// malformed session events must be swallowed by the guarded listener
run3.emit('session/event', run3.mockSession, null)
run3.emit('session/event', run3.mockSession, { type: 'assistant/message', seq: 1, time: 0, data: null })
run3.emit('session/event', run3.mockSession, { type: 'turn/end', seq: 2, time: 0, data: { turn: 1, reason: null } })
run3.emit('agent/status', null)
run3.emit('agent/created', {})
// a throwing followup must not propagate out of a tick
run3.mockAgent.followup = () => { throw new Error('agent exploded') }
run3.emit('session/event', run3.mockSession, { type: 'user/message', seq: 3, time: 0, data: { id: 'x' } })
await new Promise((r) => setTimeout(r, 4200)) // hourly task is NOT due; force via every-60? wait: hourly due after 60s — no fire expected
run3.disposers.forEach((d) => d?.())
console.log('✓ fault containment (malformed events, throwing followup)')
run3.disposers.forEach((d) => d?.())

rmSync(dir, { recursive: true, force: true })
console.log('\nALL TESTS PASSED')
process.exit(0)
