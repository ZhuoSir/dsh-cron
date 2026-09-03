// Verify the drawer-version client bundle registers both slot entries.
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const regs = []
globalThis.window = { __ModuleLoader__: { load: (r) => regs.push(r) } }
eval(src)

const req = (n) => {
  if (n === 'react') {
    return {
      useState: (v) => [v, () => {}],
      useEffect: () => {},
      useRef: () => ({ current: null }),
      useCallback: (f) => f,
      useSyncExternalStore: (subscribe, getSnapshot) => getSnapshot(),
    }
  }
  if (n === 'react/jsx-runtime') return { jsx: () => ({}), jsxs: () => ({}), Fragment: {} }
  if (n === 'react-dom') return { createPortal: (node) => node }
  throw new Error('unexpected require: ' + n)
}

const ex = regs[0].factory(req)
console.log('✓ id:', regs[0].id, '| exports:', Object.keys(ex).join(','), '| inject:', ex.inject.join(','))

const registered = []
const ctx = {
  effect: () => {},
  locale: { register: () => () => {} },
  slots: {
    inject: (key, cb) => { registered.push(`inject(${key})`); return cb() },
    register: (spec) => { registered.push(`${spec.name}#${spec.id}@order${spec.order}`); return () => {} },
  },
}
ex.apply(ctx)
console.log('✓ registrations:', registered.join(' | '))

if (!registered.includes('conversation.session.header.utilities#cron-trigger@order-50')) throw new Error('trigger registration missing')
if (!registered.includes('shell.overlay#cron-drawer@order100')) throw new Error('drawer registration missing')
if (!ex.inject.includes('slots')) throw new Error('slots service injection missing')
if (!ex.inject.includes('locale')) throw new Error('locale service injection missing')
if (!manifest.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-layout')) throw new Error('current layout client module missing')
if (manifest.dsh.client.inject.includes('@deepseek-ai/dsh-client-runtime')) throw new Error('removed legacy client runtime still referenced')
for (const token of ['--dsw-alias-bg-layer-1', '--dsw-alias-bg-layer-2', '--dsw-alias-bg-overlay', '--dsw-alias-label-primary', '--dsw-alias-label-secondary', '--dsw-alias-border-l2']) {
  if (!src.includes(token)) throw new Error(`current theme token missing: ${token}`)
}
for (const legacy of ['--dsw-alias-fill-', '--dsw-specific-menu', '--dsw-alias-label-tertiary', '--dsw-alias-label-caption', '--dsw-alias-state-business-primary', '--dsw-alias-bg-mask-1']) {
  if (src.includes(legacy)) throw new Error(`legacy theme token remains: ${legacy}`)
}
for (const lightOnlyFallback of ['#f2f2f2', '#f5f5f5', '#eeeeee', '#e5e5e5']) {
  if (src.toLowerCase().includes(lightOnlyFallback)) throw new Error(`light-only fallback remains: ${lightOnlyFallback}`)
}
if (src.includes('color-scheme:light dark') || src.includes('color-scheme: light dark')) {
  throw new Error('plugin must inherit the DSH-selected color scheme instead of reverting to OS preference')
}
console.log('✓ current light/dark theme token contract')
console.log('\nCLIENT BUNDLE OK')
