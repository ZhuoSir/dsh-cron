// Optional contract test against an actual Better Sidebar 0.18.0 source install.
// DSH_BETTER_SIDEBAR_PATH points to its package root. No runtime/user state is read.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { unrun } from 'unrun'
import { JSDOM } from 'jsdom'
import { Context } from '@deepseek-ai/cordis'

const source = process.env.DSH_BETTER_SIDEBAR_PATH
assert.ok(source, 'Set DSH_BETTER_SIDEBAR_PATH to a Better Sidebar 0.18.0 package with src/client')
const manifest = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8'))
assert.equal(manifest.name, 'dsh-better-sidebar')
assert.equal(manifest.version, '0.18.0', 'contract baseline must be the inspected version')
const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'http://localhost/' })
Object.assign(globalThis, { window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage })
try {
  const { module: adapter } = await unrun({ path: fileURLToPath(new URL('../src/client/sidebar.ts', import.meta.url)) })
  const { module: sidebar } = await unrun({ path: resolve(source, 'src/client/service.ts') })
  const { module: stateApi } = await unrun({ path: resolve(source, 'src/client/state.ts') })
  const store = stateApi.createSidebarStore()
  const service = sidebar.createBetterSidebarService(store)
  assert.equal(adapter.supportsSidebar(service), true)
  const { CRON_TAB_ID: id } = adapter
  const release = service.registerTab({ id, title: 'Cron', single: true,
    createTab: state => adapter.createSidebarTab(state, 'Cron', window.innerWidth), component: () => null })
  const read = () => store.getSnapshot().state
  const open = sessionId => service.openTab({ type: id }, { sessionId })
  const tabCount = () => stateApi.allLeaves(read().splits).concat(stateApi.allLeaves(read().bottomSplits))
    .flatMap(leaf => leaf.tabs).filter(tab => tab.type === id).length + read().floats.filter(window => window.tab.type === id).length
  store.setSession('A')
  store.reduce(() => stateApi.makeDefaultState(400, false, 'empty'))
  open('A')
  assert.equal(read().panelOpen, true)
  assert.equal(tabCount(), 1)
  store.reduce(state => ({ ...state, panelOpen: false }))
  open('A')
  assert.equal(read().panelOpen, true, 'existing right tab reveals on dedupe')
  assert.equal(tabCount(), 1)

  store.setSession('B')
  store.reduce(() => stateApi.makeDefaultState(400, false, 'empty'))
  store.reduce(state => ({ ...state, activePane: state.bottomSplits.id }))
  open('B')
  assert.equal(read().bottomOpen, true)
  assert.equal(read().panelOpen, false)
  assert.ok(stateApi.leafWithTab(read().bottomSplits, id))
  // Nest the bottom tree and focus a different/right pane before reopening Cron.
  store.reduce(state => ({ ...state,
    bottomSplits: stateApi.splitLeafAt(state.bottomSplits, state.bottomSplits.id, 'row'),
    activePane: state.splits.id, bottomOpen: false }))
  open('B')
  assert.equal(read().bottomOpen, true, 'nested existing bottom tab is revealed')
  assert.equal(read().panelOpen, false, 'right pane not expanded by bottom dedupe')
  assert.equal(tabCount(), 1)
  window.innerWidth = 500
  store.reduce(state => ({ ...state, panelOpen: false, bottomOpen: false }))
  open('B')
  assert.equal(read().panelOpen, true, 'narrow drawer opens for bottom tab')
  window.innerWidth = 1200
  store.reduce(state => ({ ...stateApi.floatTab(state, id, 50, 50), panelOpen: false, bottomOpen: false }))
  open('B')
  assert.equal(read().panelOpen, false)
  assert.equal(read().bottomOpen, false)
  assert.equal(tabCount(), 1, 'floating tab remains single and no panels expand')
  assert.equal(read().floats.at(-1).tab.id, id)
  const before = read()
  open('C')
  assert.equal(store.getSnapshot().sessionId, 'B')
  assert.equal(read(), before, 'targeted open does not replace active session state')
  store.setSession('C')
  assert.equal(tabCount(), 1)
  release()
  assert.equal(service.getTab(id), undefined)
  console.log('✓ actual Better Sidebar reducer: right/bottom/nested/narrow/float/dedupe/session targeting')

  // Real Cordis validates optional injection arrival/disposal, beyond mock-ctx tests.
  const registrations = []
  window.__ModuleLoader__ = { load: value => registrations.push(value) }
  eval(readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8'))
  const plugin = registrations[0].factory(name => {
    if (name === 'react') return {}
    if (name === 'react/jsx-runtime') return { jsx: () => null, jsxs: () => null }
    if (name === 'react-dom') return { createPortal: node => node }
    throw new Error('Unexpected import: ' + name)
  })
  const ctx = new Context()
  const registered = []
  const removeSlots = ctx.provide('slots', { inject: (_name, fn) => fn(), register: spec => { registered.push(spec.id); return () => {} } })
  const removeLocale = ctx.provide('locale', { register: () => () => {}, bind: () => key => key })
  const mounted = await ctx.plugin(plugin)
  assert.ok(registered.includes('cron-trigger'), 'Cron loads without Sidebar')
  let provider = await ctx.plugin(inner => { inner.provide('betterSidebar', service) })
  await new Promise(resolve => setImmediate(resolve))
  assert.ok(service.getTab(id), 'real optional service arrival registers Cron')
  await provider.dispose()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(service.getTab(id), undefined, 'provider removal disposes registration')
  provider = await ctx.plugin(inner => { inner.provide('betterSidebar', service) })
  await new Promise(resolve => setImmediate(resolve))
  assert.ok(service.getTab(id), 'provider reattachment restores registration')
  await mounted.dispose()
  assert.equal(service.getTab(id), undefined, 'Cron disposal unregisters optional tab')
  assert.equal(document.querySelector('style[data-plugin="dsh-cron"]'), null)
  await provider.dispose()
  removeSlots()
  removeLocale()
  console.log('✓ real Cordis optional dependency arrival, provider replacement and plugin disposal')
} finally {
  dom.window.close()
}
