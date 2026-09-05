// Real React + portals, deterministic timers, and the optional Sidebar contract.
// jsdom verifies behavior/ownership; native dialog layout/focus needs browser tests.
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div><div id="sidebar"></div></body></html>', { url: 'http://127.0.0.1:3080/', pretendToBeVisual: true })
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, KeyboardEvent: dom.window.KeyboardEvent, IS_REACT_ACT_ENVIRONMENT: true })
// jsdom does not implement the top-layer dialog API.
dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true }
dom.window.HTMLDialogElement.prototype.close = function () { this.open = false }
const intervals = new Map()
let nextInterval = 1
const originalInterval = globalThis.setInterval
const originalClearInterval = globalThis.clearInterval
globalThis.setInterval = (fn, ms) => { const id = nextInterval++; intervals.set(id, { fn, ms }); return id }
globalThis.clearInterval = id => intervals.delete(id)
const react = (await import('react')).default
const jsxRuntime = await import('react/jsx-runtime')
const reactDom = await import('react-dom')
const { createRoot } = await import('react-dom/client')
const { act } = react
const registrations = []
window.__ModuleLoader__ = { load: registration => registrations.push(registration) }
eval(readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8'))
const plugin = registrations[0].factory(name => {
  if (name === 'react') return react
  if (name === 'react/jsx-runtime') return jsxRuntime
  if (name === 'react-dom') return reactDom
  throw new Error('unexpected require: ' + name)
})
const t = (key, params) => key + (params ? ':' + Object.values(params).join(',') : '')
const root = createRoot(document.getElementById('root'))
const sideRoot = createRoot(document.getElementById('sidebar'))
const slots = new Map()
const cleanup = []
let optionalCallback
let bridgeCleanup = []
const ctx = {
  effect: fn => { const dispose = fn(); if (dispose) cleanup.push(dispose) },
  inject: (names, callback) => { assert.deepEqual(names, ['betterSidebar']); optionalCallback = callback },
  locale: { register: () => () => {}, bind: () => t },
  slots: {
    inject: (_key, callback) => callback(),
    register: (spec, component) => { slots.set(spec.id, component); return () => {} },
  },
}
plugin.apply(ctx)
const requests = []
let pendingList = null
let pendingAction = null
let completeRun = false
const task = owner => ({ id: 'task-' + owner, prompt: 'prompt-' + owner, enabled: true, origin: 'dynamic', sessionId: owner, schedule: { everySeconds: 60 }, lastRunAt: null, nextRunAt: null })
globalThis.fetch = async (url, options) => {
  const payload = JSON.parse(options.body)
  requests.push({ method: url.split('/').at(-1), payload })
  const owner = payload.sessionId
  assert.ok(owner, 'every request has an explicit owner')
  if (url.endsWith('/list') && pendingList?.owner === owner) await pendingList.promise
  if (url.endsWith('/run') && pendingAction) await pendingAction
  const result = url.endsWith('/list') ? { tasks: [task(owner)] }
    : url.endsWith('/history') ? { records: [{ id: 'run-' + owner, taskId: 'task-' + owner, sessionId: owner, prompt: '', scheduledFor: '', firedAt: '', status: completeRun ? 'completed' : 'delivered', excerpt: 'result-' + owner }] } : {}
  return { json: async () => ({ ok: true, result }) }
}
const render = async (owner = 'A') => act(async () => {
  root.render(react.createElement(react.Fragment, null,
    react.createElement(slots.get('cron-trigger'), { t, sessionId: owner }),
    react.createElement(slots.get('cron-drawer'), { t })))
})
const findButton = (label, scope = document) => [...scope.querySelectorAll('button')].find(button => button.textContent === label || button.getAttribute('aria-label') === label)
const click = async button => { assert.ok(button, 'button exists'); await act(async () => button.click()) }
const cancel = async () => act(async () => document.querySelector('dialog').dispatchEvent(new dom.window.Event('cancel', { cancelable: true })))
const poll = async ms => act(async () => { for (const timer of [...intervals.values()]) if (timer.ms === ms) await timer.fn() })

await render()
assert.equal(document.querySelector('dialog'), null, 'no hidden focusable fallback panel')
assert.equal(document.querySelector('.dsh-cron-toastStack').parentElement, document.body, 'real body portal')
assert.equal(intervals.size, 1, 'one owner watcher while closed')
await click(findButton('trigger.aria'))
assert.ok(document.querySelector('dialog[open]'), 'standalone fallback opens')
assert.ok(document.querySelector('dialog').textContent.includes('prompt-A'))
assert.equal(intervals.size, 2, 'only visible panel polls')
await click(findButton('drawer.test'))
assert.ok(document.querySelector('.dsh-cron-toast'), 'test notification produces a real toast')
assert.ok(document.querySelector('dialog .dsh-cron-toast'), 'modal toast stays within the active top-layer context')
await click(document.querySelector('.dsh-cron-toast'))
assert.ok(document.querySelector('dialog').textContent.includes('result-A'), 'toast works without closing the modal first')
await click(findButton('drawer.test'))
await cancel()
assert.equal(document.querySelector('dialog'), null)
assert.equal(intervals.size, 1, 'closed panel stops polling')
await click(document.querySelector('.dsh-cron-toast'))
assert.ok(document.querySelector('dialog').textContent.includes('result-A'), 'toast opens owner history')
await cancel()
console.log('✓ standalone dialog, portal, toast routing and polling cleanup')

// A watcher primes per session: a finished record in B is not new activity.
completeRun = true
await render('B')
assert.equal(document.querySelectorAll('.dsh-cron-toast').length, 0, 'new owner primes independently')
completeRun = false
await render('A')
completeRun = true
await poll(20_000)
assert.equal(document.querySelectorAll('.dsh-cron-toast').length, 1, 'new terminal status notifies once')
await poll(20_000)
assert.equal(document.querySelectorAll('.dsh-cron-toast').length, 1, 'repeated terminal state does not duplicate')
await click(document.querySelector('.dsh-cron-toast'))
await cancel()
console.log('✓ watcher owner reset and terminal-state deduplication')

const TAB = 'dsh-cron:tasks'
let descriptor
let enabled = true
let serviceOwner = 'A'
let currentVisible = true
const opens = []
const leaf = (id, tabs = []) => ({ kind: 'leaf', id, tabs, active: tabs[0]?.id ?? null })
const baseState = () => ({ panelOpen: false, bottomOpen: false, activePane: 'right', splits: leaf('right'), bottomSplits: leaf('bottom'), floats: [] })
const service = {
  version: '0.18.0', features: ['targetedOpen', 'floatWindows'],
  registerTab: value => { descriptor = value; return () => { descriptor = null; sideRoot.render(null) } },
  getSnapshot: () => ({ sessionId: serviceOwner }),
  isTabEnabled: () => enabled,
  openTab: (seed, scope) => {
    opens.push({ seed, scope })
    assert.equal(seed.type, TAB)
    assert.equal(scope.sessionId, serviceOwner)
    sideRoot.render(react.createElement(descriptor.component, { scope, visible: currentVisible }))
  },
}
async function attach(value = service) {
  await act(async () => optionalCallback({ get: () => value, effect: fn => { const dispose = fn(); if (dispose) bridgeCleanup.push(dispose) } }))
}
await attach({ ...service, version: '0.17.0' })
assert.equal(descriptor, undefined, 'unsupported versions leave fallback intact')
await attach({ ...service, features: [] })
assert.equal(descriptor, undefined, 'missing required capabilities leave fallback intact')
await attach()
assert.equal(descriptor.id, TAB)
assert.equal(descriptor.single, true)
assert.deepEqual(descriptor.createTab(baseState()).patch, { panelOpen: true })
const bottom = baseState(); bottom.activePane = 'bottom'
assert.deepEqual(descriptor.createTab(bottom).patch, { bottomOpen: true }, 'new tab opens active bottom pane')
const existing = baseState(); existing.bottomSplits.tabs = [{ id: TAB, type: TAB, title: 'Cron' }]
assert.deepEqual(descriptor.createTab(existing).patch, { bottomOpen: true }, 'dedupe opens existing bottom pane')
const detached = baseState(); detached.floats = [{ tab: { id: TAB, type: TAB, title: 'Cron' } }]
assert.equal(descriptor.createTab(detached).patch, undefined, 'float does not expand unrelated panels')
const oldWidth = window.innerWidth
window.innerWidth = 500
assert.deepEqual(descriptor.createTab(bottom).patch, { panelOpen: true }, 'narrow view reveals merged drawer')
window.innerWidth = oldWidth
assert.equal(bottom.bottomOpen, false, 'adapter does not mutate source state')
await click(findButton('trigger.aria'))
assert.equal(document.querySelector('dialog'), null, 'sidebar mode has no independent dialog/mask')
assert.ok(document.querySelector('.dsh-cron-sidebarPanel'))
assert.deepEqual(opens.at(-1), { seed: { type: TAB }, scope: { sessionId: 'A' } })
await click(findButton('tab.tasks'))
await click(findButton('action.run'))
assert.deepEqual(requests.findLast(request => request.method === 'run').payload, { id: 'task-A', sessionId: 'A' })
await click(findButton('action.pause'))
assert.deepEqual(requests.findLast(request => request.method === 'toggle').payload, { id: 'task-A', enabled: false, sessionId: 'A' })
await click(findButton('action.edit'))
await click(findButton('action.save'))
assert.deepEqual(requests.findLast(request => request.method === 'update').payload, { id: 'task-A', prompt: 'prompt-A', every: 60, sessionId: 'A' })
await click(findButton('action.remove'))
assert.deepEqual(requests.findLast(request => request.method === 'remove').payload, { id: 'task-A', sessionId: 'A' })
let finishAction
pendingAction = new Promise(resolve => { finishAction = resolve })
await click(findButton('action.run'))
await act(async () => sideRoot.render(react.createElement(descriptor.component, { scope: { sessionId: 'A' }, visible: false })))
const readsBeforeCompletion = requests.filter(request => ['list', 'history'].includes(request.method)).length
await act(async () => { finishAction(); pendingAction = null })
assert.equal(requests.filter(request => ['list', 'history'].includes(request.method)).length, readsBeforeCompletion, 'late mutation must not restart hidden panel reads')
await act(async () => sideRoot.render(react.createElement(descriptor.component, { scope: { sessionId: 'A' }, visible: true })))
console.log('✓ optional service arrival, reveal destinations, all mutation owners and late-mutation cleanup')

await act(async () => sideRoot.render(react.createElement(descriptor.component, { scope: { sessionId: 'A' }, visible: false })))
assert.equal(intervals.size, 1, 'inactive sidebar tab pauses panel polling')
await act(async () => sideRoot.render(react.createElement(descriptor.component, { scope: { sessionId: 'A' }, visible: true })))
assert.equal(intervals.size, 2)
await click(findButton('drawer.test')) // toast belongs to A, then switch session
serviceOwner = 'B'
await render('B')
await act(async () => service.openTab({ type: TAB }, { sessionId: 'B' }))
assert.ok(document.querySelector('.dsh-cron-sidebarPanel').textContent.includes('prompt-B'))
assert.ok(!document.querySelector('.dsh-cron-sidebarPanel').textContent.includes('prompt-A'))
await click(document.querySelector('.dsh-cron-toast'))
assert.ok(document.querySelector('dialog').textContent.includes('result-A'), 'old-session notification stays pinned to A')
assert.ok(document.querySelector('.dsh-cron-sidebarPanel').textContent.includes('prompt-B'), 'old notification does not replace B state')
await cancel()
console.log('✓ session-isolated panel state, hidden polling and old-session toast fallback')

// Late A responses must not overwrite a newly mounted B panel or badge.
let release
pendingList = { owner: 'A', promise: new Promise(resolve => { release = resolve }) }
serviceOwner = 'A'
await render('A')
await act(async () => service.openTab({ type: TAB }, { sessionId: 'A' }))
serviceOwner = 'B'
await render('B')
await act(async () => service.openTab({ type: TAB }, { sessionId: 'B' }))
await act(async () => { release(); pendingList = null })
assert.ok(document.querySelector('.dsh-cron-sidebarPanel').textContent.includes('prompt-B'))
assert.ok(!document.querySelector('.dsh-cron-sidebarPanel').textContent.includes('prompt-A'))
enabled = false
await click(findButton('trigger.aria'))
assert.ok(document.querySelector('dialog'), 'disabled tab type falls back without overriding user setting')
await cancel()
await act(async () => { for (const dispose of bridgeCleanup.splice(0).reverse()) dispose() })
await click(findButton('trigger.aria'))
assert.ok(document.querySelector('dialog'), 'service removal restores independent panel')
await cancel()
await attach({ ...service, registerTab: () => { throw new Error('expected registration failure') } })
assert.equal(descriptor, null, 'registration failure does not install a broken bridge')
await click(findButton('trigger.aria'))
assert.ok(document.querySelector('dialog'), 'registration failure retains fallback')
await cancel()
await attach()
assert.ok(descriptor, 'service can return without duplicate registration')
const originalOpen = service.openTab
enabled = true
let failedOpenAttempts = 0
service.openTab = () => { failedOpenAttempts++; throw new Error('expected open failure') }
await click(findButton('trigger.aria'))
assert.equal(failedOpenAttempts, 1, 'failure case actually attempts the enabled sidebar open')
assert.ok(document.querySelector('dialog'), 'open failure falls back without losing access')
await cancel()
service.openTab = originalOpen
console.log('✓ stale-response guard, disabled tab, service disposal, reattachment and failures')

await act(async () => {
  root.unmount()
  for (const dispose of bridgeCleanup.splice(0).reverse()) dispose()
  sideRoot.unmount()
  for (const dispose of cleanup.reverse()) dispose()
})
assert.equal(intervals.size, 0, 'all poll timers disposed')
assert.equal(document.querySelector('style[data-plugin="dsh-cron"]'), null, 'style disposed')
globalThis.setInterval = originalInterval
globalThis.clearInterval = originalClearInterval
dom.window.close()
console.log('\nCLIENT SIDEBAR / TOAST RENDER TESTS PASSED')
