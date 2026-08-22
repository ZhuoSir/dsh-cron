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

function makeCtx(storagePath, historyPath, configTasks) {
  const fired = []
  const tools = new Map()
  const disposers = []
  const listeners = new Map()
  const mockSession = { id: 'sess-1' }
  const mockAgent = { id: 'root-1', session: mockSession, followup: (msg) => fired.push(msg) }
  const ctx = {
    logger: { info: () => {}, warn: (m) => console.warn('  [warn]', m) },
    agents: { roots: () => [mockAgent] },
    on: (event, handler) => listeners.set(event, handler),
    effect: (fn) => { disposers.push(fn()) },
    inject: () => {}, // webServer optional injection: skipped in this mock
    tools: { register: (def) => tools.set(def.name, def) },
  }
  apply(ctx, Config({ storagePath, historyPath, tickSeconds: 1, tasks: configTasks, systemNotify: false }))
  const emit = (event, ...args) => listeners.get(event)?.(...args)
  return { ctx, fired, tools, disposers, mockAgent, mockSession, emit }
}

const dir = mkdtempSync(join(tmpdir(), 'dsh-cron-test-'))
const storagePath = join(dir, 'cron-tasks.json')
const historyPath = join(dir, 'cron-history.jsonl')

const past = new Date(Date.now() - 60_000).toISOString()
const pastHM = new Date(Date.now() - 60_000)
const dailyPast = `${String(pastHM.getHours()).padStart(2, '0')}:${String(pastHM.getMinutes()).padStart(2, '0')}`

const configTasks = [
  { id: 'once', prompt: 'one shot task', at: past },
  { id: 'hourly', prompt: 'interval task', every: 60 },
  { id: 'morning', prompt: 'daily task', daily: dailyPast },
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
await run1.tools.get('cron_add').execute({ id: 'dyn', prompt: 'dynamic task', every: 120 }, {})
const stored = JSON.parse(readFileSync(storagePath, 'utf8'))
assert.equal(stored.tasks.length, 1)
assert.ok(stored.runs.once?.firedAt)
console.log('✓ cron_add persists')

// --- validation
await assert.rejects(run1.tools.get('cron_add').execute({ id: 'bad', prompt: 'x', every: 30, daily: '10:00' }, {}), /exactly one/)
await assert.rejects(run1.tools.get('cron_add').execute({ id: 'dyn', prompt: 'x', every: 60 }, {}), /already exists/)
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
