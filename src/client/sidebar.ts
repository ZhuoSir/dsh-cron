// Optional, structural adapter for Better Sidebar's public client service.
// No runtime import or dependency: Cron remains usable without that plugin.
// Contract inspected against Better Sidebar 0.18.0 client/service.ts + state.ts.
import type { ReactNode } from 'react'

export const CRON_TAB_ID = 'dsh-cron:tasks'

type Tab = { id: string; type: string; title: string }
type Node = { kind: 'leaf'; id: string; tabs: Tab[] } | { kind: 'split'; id: string; children: Node[] }
interface State {
  activePane: string | null
  splits: Node
  bottomSplits: Node
  floats: { tab: Tab }[]
}
export interface SidebarProps {
  scope: { sessionId: string }
  visible: boolean
}
export interface SidebarService {
  version: string
  features: readonly string[]
  registerTab(descriptor: {
    id: string
    title: () => string
    single: boolean
    order: number
    createTab: (state: State) => { tab: Tab; patch?: { panelOpen?: boolean; bottomOpen?: boolean } }
    component: (props: SidebarProps) => ReactNode
  }): () => void
  openTab(seed: { type: string }, scope: { sessionId: string }): void
  isTabEnabled(id: string): boolean
  getSnapshot(): { sessionId?: string }
}

export function supportsSidebar(value: unknown): value is SidebarService {
  const service = value as Partial<SidebarService> | undefined
  if (!service || typeof service.version !== 'string') return false
  const [major, minor] = service.version.split('.').map(Number)
  // The dual-panel/float state contract used by createTab starts at 0.18.
  if (major !== 0 || minor < 18 || !Number.isFinite(minor)) return false
  return ['registerTab', 'openTab', 'isTabEnabled', 'getSnapshot'].every(key =>
    typeof (service as Record<string, unknown>)[key] === 'function')
    && Array.isArray(service.features)
    && ['targetedOpen', 'floatWindows'].every(feature => service.features!.includes(feature))
}

function hasTab(node: Node, id: string): boolean {
  return node.kind === 'leaf' ? node.tabs.some(tab => tab.id === id) : node.children.some(child => hasTab(child, id))
}
function hasPane(node: Node, id: string | null): boolean {
  return node.kind === 'leaf' ? node.id === id : node.children.some(child => hasPane(child, id))
}

/** The public createTab patch reveals the hosting panel even on a dedupe open.
 * Avoid fake file/URL seeds, private DOM buttons, or mutation of sidebar state.
 * A detached Cron window is already visible and must not expand another panel.
 */
export function createSidebarTab(state: State, title: string, viewportWidth: number) {
  const tab = { id: CRON_TAB_ID, type: CRON_TAB_ID, title }
  if (state.floats.some(window => window.tab.id === CRON_TAB_ID)) return { tab }
  const inBottom = hasTab(state.bottomSplits, CRON_TAB_ID)
    || (!hasTab(state.splits, CRON_TAB_ID) && hasPane(state.bottomSplits, state.activePane))
  return {
    tab,
    patch: viewportWidth < 768 || !inBottom ? { panelOpen: true } : { bottomOpen: true },
  }
}
