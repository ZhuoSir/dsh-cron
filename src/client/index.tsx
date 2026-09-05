// Session-header entry + optional Better Sidebar tab, with a standalone dialog
// fallback. The overlay owns one activity watcher; panel data stays session-scoped.
// All business operations still use the existing POST /cron/api/<method> API.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { zh, en } from './locale.js'
import { css, styles } from './styles.js'
import { CRON_TAB_ID, createSidebarTab, supportsSidebar, type SidebarService, type SidebarProps } from './sidebar.js'

/** Services required from the client runtime. */
export const inject = ['slots', 'locale']

// --- shared store --------------------------------------------------------------
//
// The trigger (session-header slot) and the drawer (shell.overlay slot) live
// in different render trees, so open-state, the enabled-task count, the
// unread-activity badge, the selected tab, and the toast stack travel through
// this tiny module-level store.

type DrawerTab = 'tasks' | 'history'

/** One activity toast derived from a run record reaching a terminal state. */
interface ToastEvent {
  record: RunRecord
  kind: 'completed' | 'failed'
}

interface ToastItem extends ToastEvent {
  key: number
}

let drawerOpen = false
let activeSessionId: string | null = null
let drawerSessionId: string | null = null
let sidebar: SidebarService | null = null
interface SessionView { count: number; unread: number; tab: DrawerTab; visible: boolean }
const sessionViews = new Map<string, SessionView>()
function sessionView(sessionId: string | null): SessionView {
  if (!sessionId) return { count: 0, unread: 0, tab: 'tasks', visible: false }
  let view = sessionViews.get(sessionId)
  if (!view) {
    view = { count: 0, unread: 0, tab: 'tasks', visible: false }
    sessionViews.set(sessionId, view)
  }
  return view
}
let toastSeq = 0
let toasts: ToastItem[] = []
const TOAST_MS = 8000
const MAX_TOASTS = 3

// --- user preferences (persisted) ------------------------------------------

interface Prefs {
  /** Play a chime on task completion/failure (false = 静音). */
  sound: boolean
  /** Browser system notifications (work while the tab is in the background). */
  system: boolean
}

const PREFS_KEY = 'dsh-cron:prefs'

function loadPrefs(): Prefs {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(PREFS_KEY) : null
    if (raw) {
      const parsed = JSON.parse(raw)
      return { sound: parsed.sound !== false, system: parsed.system === true }
    }
  } catch { /* fall through to defaults */ }
  return { sound: true, system: false }
}

let prefs: Prefs = loadPrefs()

function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]) {
  prefs = { ...prefs, [key]: value }
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch { /* storage unavailable */ }
  storeNotify()
}

// useSyncExternalStore requires a cached snapshot: returning a fresh object
// from getSnapshot causes an infinite render loop.
interface DrawerSnapshot { open: boolean; sessionId: string | null; drawerSessionId: string | null; toasts: ToastItem[]; prefs: Prefs }
let snapshot: DrawerSnapshot = { open: drawerOpen, sessionId: activeSessionId, drawerSessionId, toasts, prefs }
const storeListeners = new Set<() => void>()

function storeSubscribe(listener: () => void) {
  storeListeners.add(listener)
  return () => { storeListeners.delete(listener) }
}

function storeNotify() {
  snapshot = { open: drawerOpen, sessionId: activeSessionId, drawerSessionId, toasts, prefs }
  for (const listener of storeListeners) listener()
}

function setActiveSession(sessionId: string | null) {
  if (activeSessionId === sessionId) return
  activeSessionId = sessionId
  drawerOpen = false
  storeNotify()
}

function setDrawerOpen(open: boolean) {
  if (drawerOpen === open) return
  drawerOpen = open
  if (open) sessionView(drawerSessionId).unread = 0
  storeNotify()
}

/** Prefer a visible sidebar destination; old-session notifications use a pinned
 * fallback dialog rather than silently opening a tab in an invisible session. */
function openDrawer(tab: DrawerTab, sessionId = activeSessionId) {
  if (!sessionId) return
  sessionView(sessionId).tab = tab
  sessionView(sessionId).unread = 0
  try {
    if (sidebar?.isTabEnabled(CRON_TAB_ID) && sidebar.getSnapshot().sessionId === sessionId) {
      sidebar.openTab({ type: CRON_TAB_ID }, { sessionId })
      drawerOpen = false
      storeNotify()
      return
    }
  } catch (error) {
    console.warn('[dsh-cron] sidebar open failed; using standalone panel', error)
  }
  drawerSessionId = sessionId
  drawerOpen = true
  storeNotify()
}

function setEnabledCount(count: number, sessionId: string) {
  const view = sessionView(sessionId)
  if (view.count === count) return
  view.count = count
  storeNotify()
}

function bumpUnread(sessionId: string, by: number) {
  const view = sessionView(sessionId)
  if ((drawerOpen && drawerSessionId === sessionId) || view.visible || by === 0) return
  view.unread += by
  storeNotify()
}

function setDrawerTab(tab: DrawerTab, sessionId: string) {
  const view = sessionView(sessionId)
  if (view.tab === tab) return
  view.tab = tab
  storeNotify()
}

/** Push one toast onto the stack (shared by the watcher and the test button). */
function pushToast(event: ToastEvent) {
  toasts = [...toasts, { ...event, key: toastSeq++ }].slice(-MAX_TOASTS)
  storeNotify()
}

function dismissToast(key: number) {
  toasts = toasts.filter((item) => item.key !== key)
  storeNotify()
}

function useDrawerState() {
  return useSyncExternalStore(storeSubscribe, () => snapshot)
}

// --- data ----------------------------------------------------------------------

interface TaskView {
  id: string
  prompt: string
  schedule: { at?: string; everySeconds?: number; daily?: string; cron?: string; timeZone?: string }
  enabled: boolean
  origin: 'config' | 'dynamic'
  sessionId: string | null
  lastRunAt: string | null
  nextRunAt: string | null
}

interface RunRecord {
  id: string
  taskId: string
  sessionId?: string | null
  prompt: string
  scheduledFor: string
  firedAt: string
  status: 'delivered' | 'running' | 'completed' | 'failed' | 'interrupted'
  startedAt?: number
  completedAt?: number
  endReason?: string
  excerpt?: string
}

async function api<T>(method: string, payload?: unknown): Promise<T> {
  const res = await fetch(`/cron/api/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload ?? {}),
  })
  const data = await res.json().catch(() => null)
  if (!data?.ok) throw new Error(data?.error?.message ?? `request failed (${res.status})`)
  return data.result as T
}

type T = (key: string, params?: Record<string, unknown>) => string

/** Fallback translator when a slot supplies no locale seat: zh + {param} interpolation. */
const fallbackT: T = (key, params) =>
  (zh[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => String(params?.[name] ?? ''))

// --- activity watch --------------------------------------------------------------

/**
 * Pure status-diff for polling: which records newly reached a terminal state
 * (completed / failed) since the previous snapshot. Records absent from the
 * previous snapshot count as new (a fast task can fire and finish between two
 * polls). Exported for tests.
 */
export function diffRecords(prev: ReadonlyMap<string, string>, records: RunRecord[]): ToastEvent[] {
  const events: ToastEvent[] = []
  for (const record of records) {
    if (record.status !== 'completed' && record.status !== 'failed') continue
    if (prev.get(record.id) === record.status) continue
    events.push({ record, kind: record.status })
  }
  return events
}

const POLL_MS = 20_000

// --- sound + system notifications ----------------------------------------------

/**
 * Short synthesized chime (no audio asset needed). Completed: rising major
 * fifth; failed: falling minor second. Autoplay policies may block the very
 * first playback before any user gesture — silently skipped.
 */
function playChime(kind: 'completed' | 'failed') {
  try {
    const Ctor = (window as any).AudioContext ?? (window as any).webkitAudioContext
    if (!Ctor) return
    const audio = new Ctor() as AudioContext
    void audio.resume?.()
    const frequencies = kind === 'failed' ? [311.13, 293.66] : [523.25, 783.99]
    frequencies.forEach((freq, index) => {
      const osc = audio.createOscillator()
      const gain = audio.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      const t0 = audio.currentTime + index * 0.12
      gain.gain.setValueAtTime(0, t0)
      gain.gain.linearRampToValueAtTime(0.12, t0 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.35)
      osc.connect(gain).connect(audio.destination)
      osc.start(t0)
      osc.stop(t0 + 0.4)
    })
    setTimeout(() => void audio.close().catch(() => {}), 1200)
  } catch { /* audio unavailable */ }
}

/** Browser-level system notification: appears even when this tab is backgrounded. */
function sendBrowserNotification(event: ToastEvent) {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    const title = fallbackT(`toast.${event.kind}`, { id: event.record.taskId })
    const body = (event.record.excerpt || event.record.prompt || '').slice(0, 200)
    const notification = new Notification(title, { body, tag: event.record.id })
    notification.onclick = () => {
      window.focus()
      openDrawer('history', event.record.sessionId ?? activeSessionId)
    }
  } catch { /* best effort */ }
}

/** Central fan-out for newly finished runs: toasts + badge + sound + system. */
function notifyEvents(events: ToastEvent[]) {
  if (events.length === 0) return
  for (const event of events) {
    const owner = event.record.sessionId ?? activeSessionId
    if (owner) bumpUnread(owner, 1)
    pushToast(event)
  }
  if (prefs.sound) playChime(events.some((e) => e.kind === 'failed') ? 'failed' : 'completed')
  if (prefs.system) for (const event of events) sendBrowserNotification(event)
}

/** One toast card; auto-dismisses, click opens the drawer on the history tab. */
function ToastCard({ t, item }: { t: T; item: ToastItem }) {
  const sticky = item.kind === 'failed'
  useEffect(() => {
    if (sticky) return // failures stay until clicked
    const timer = setTimeout(() => dismissToast(item.key), TOAST_MS)
    return () => clearTimeout(timer)
  }, [item.key, sticky])

  const open = () => {
    dismissToast(item.key)
    openDrawer('history', item.record.sessionId ?? activeSessionId)
  }

  return (
    <button type="button" className={item.kind === 'failed' ? styles.toastFailed : styles.toast} onClick={open}>
      <div className={styles.toastTitle}>{t(`toast.${item.kind}`, { id: item.record.taskId })}</div>
      {item.record.excerpt ? <div className={styles.toastBody}>{item.record.excerpt}</div> : null}
    </button>
  )
}

/**
 * Polls run history and surfaces finished runs as toasts + badge counts.
 * Lives in the root-scoped overlay component so exactly ONE watcher exists no
 * matter how many sessions are open. The first poll only primes the snapshot
 * (old records never toast).
 */
function useCronWatcher(sessionId: string | null): void {
  const snapshotRef = useRef<Map<string, string> | null>(null)

  useEffect(() => {
    let stopped = false
    snapshotRef.current = null // prime independently after every owner change
    console.info('[dsh-cron] watcher started (poll every %ds)', POLL_MS / 1000)
    const poll = async () => {
      if (!sessionId || typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      try {
        const { records } = await api<{ records: RunRecord[] }>('history', { limit: 20, sessionId })
        if (stopped) return
        const prev = snapshotRef.current
        snapshotRef.current = new Map(records.map((r) => [r.id, r.status]))
        if (prev === null) {
          console.info('[dsh-cron] watcher primed with %d record(s)', records.length)
          return
        }
        const events = diffRecords(prev, records)
        if (events.length === 0) return
        console.info('[dsh-cron]', events.length, 'task run(s) finished:', events.map((e) => `${e.record.taskId}:${e.kind}`).join(', '))
        notifyEvents(events.map(event => ({ ...event, record: { ...event.record, sessionId } })))
      } catch (error) {
        // API unreachable (host restarting?) — stay quiet, retry next poll.
        console.warn('[dsh-cron] watcher poll failed:', error)
      }
    }
    void poll()
    const timer = setInterval(poll, POLL_MS)
    return () => {
      stopped = true
      clearInterval(timer)
    }
  }, [sessionId])
}

function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString()
}

function scheduleText(task: TaskView, t: T): string {
  if (task.schedule.at) return t('schedule.at', { time: formatTime(task.schedule.at) })
  if (task.schedule.everySeconds != null) {
    const seconds = task.schedule.everySeconds
    if (seconds % 3600 === 0) return t('schedule.every.hours', { count: seconds / 3600 })
    if (seconds % 60 === 0) return t('schedule.every.minutes', { count: seconds / 60 })
    return t('schedule.every.seconds', { count: seconds })
  }
  if (task.schedule.daily) return t('schedule.daily', { time: task.schedule.daily, zone: task.schedule.timeZone ?? '' })
  if (task.schedule.cron) return t('schedule.cron', { expr: task.schedule.cron, zone: task.schedule.timeZone ?? '' })
  return ''
}

function durationText(record: RunRecord, t: T): string {
  if (record.startedAt == null || record.completedAt == null) return ''
  const seconds = Math.max(0, Math.round((record.completedAt - record.startedAt) / 1000))
  if (seconds < 60) return t('duration.seconds', { count: seconds })
  return t('duration.minutes', { count: Math.floor(seconds / 60), seconds: seconds % 60 })
}

// --- panel ----------------------------------------------------------------------

interface EditFormState {
  prompt: string
  rule: 'daily' | 'every' | 'at' | 'cron'
  value: string
}

function ruleOf(task: TaskView): EditFormState['rule'] {
  if (task.schedule.cron) return 'cron'
  if (task.schedule.daily) return 'daily'
  if (task.schedule.everySeconds != null) return 'every'
  return 'at'
}

function ruleValueOf(task: TaskView): string {
  if (task.schedule.cron) return task.schedule.cron
  if (task.schedule.daily) return task.schedule.daily
  if (task.schedule.everySeconds != null) return String(task.schedule.everySeconds)
  return task.schedule.at ?? ''
}

/** Inline editor for one dynamic task (prompt + schedule rule). */
function EditTaskForm({ t, task, sessionId, onDone }: { t: T; task: TaskView; sessionId: string; onDone: () => void }) {
  const [form, setForm] = useState<EditFormState>({ prompt: task.prompt, rule: ruleOf(task), value: ruleValueOf(task) })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true)
    setError('')
    try {
      const payload: Record<string, unknown> = { id: task.id, prompt: form.prompt.trim(), sessionId }
      if (form.rule === 'daily') payload.daily = form.value.trim()
      else if (form.rule === 'every') payload.every = Number(form.value.trim())
      else if (form.rule === 'cron') payload.cron = form.value.trim()
      else payload.at = form.value.trim()
      await api('update', payload)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const valuePlaceholder = t(`form.value.${form.rule}`)

  return (
    <div className={styles.form}>
      <textarea
        className={styles.textarea}
        value={form.prompt}
        placeholder={t('form.prompt')}
        rows={2}
        onChange={(e) => setForm({ ...form, prompt: e.target.value })}
      />
      <div className={styles.formRow}>
        <select
          className={styles.select}
          value={form.rule}
          onChange={(e) => setForm({ ...form, rule: e.target.value as EditFormState['rule'], value: '' })}
        >
          <option value="daily">{t('form.rule.daily')}</option>
          <option value="every">{t('form.rule.every')}</option>
          <option value="cron">{t('form.rule.cron')}</option>
          <option value="at">{t('form.rule.at')}</option>
        </select>
        <input
          className={styles.input}
          value={form.value}
          placeholder={valuePlaceholder}
          onChange={(e) => setForm({ ...form, value: e.target.value })}
        />
      </div>
      {error ? <div className={styles.error}>{error}</div> : null}
      <div className={styles.formRow}>
        <button
          type="button"
          className={styles.primaryButton}
          disabled={busy || form.prompt.trim() === '' || form.value.trim() === ''}
          onClick={() => void submit()}
        >
          {t('action.save')}
        </button>
        <button type="button" className={styles.ghostButton} onClick={onDone}>
          {t('action.cancel')}
        </button>
      </div>
    </div>
  )
}

function CronPanel({ t, tab, setTab, sessionId, visible }: { t: T; tab: DrawerTab; setTab: (tab: DrawerTab) => void; sessionId: string; visible: boolean }) {
  const [tasks, setTasks] = useState<TaskView[]>([])
  const [records, setRecords] = useState<RunRecord[]>([])
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const generation = useRef(0)
  const live = useRef(false)

  const refresh = useCallback(async () => {
    if (!visible || !live.current) return
    const request = ++generation.current
    try {
      const [listResult, historyResult] = await Promise.all([
        api<{ tasks: TaskView[] }>('list', { sessionId }),
        api<{ records: RunRecord[] }>('history', { limit: 50, sessionId }),
      ])
      if (request !== generation.current) return
      setTasks(listResult.tasks)
      setRecords(historyResult.records)
      setEnabledCount(listResult.tasks.filter((task) => task.enabled).length, sessionId)
      setError('')
    } catch (err) {
      if (request === generation.current) setError(err instanceof Error ? err.message : String(err))
    }
  }, [sessionId, visible])

  useEffect(() => {
    if (!visible) return
    live.current = true
    void refresh()
    const timer = setInterval(() => void refresh(), 10_000)
    return () => { live.current = false; generation.current++; clearInterval(timer) }
  }, [refresh, visible])

  const act = async (method: string, payload: Record<string, unknown>) => {
    try {
      await api(method, { ...payload, sessionId })
      await refresh()
    } catch (err) {
      if (live.current) setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <>
      <div className={styles.tabs}>
        <button
          type="button"
          className={tab === 'tasks' ? styles.tabActive : styles.tab}
          onClick={() => setTab('tasks')}
        >
          {t('tab.tasks')}
        </button>
        <button
          type="button"
          className={tab === 'history' ? styles.tabActive : styles.tab}
          onClick={() => setTab('history')}
        >
          {t('tab.history')}
        </button>
      </div>
      {error ? <div className={styles.error}>{error}</div> : null}
      <div className={styles.body}>
        {tab === 'tasks' ? (
          <div className={styles.list}>
            {tasks.length === 0 ? <div className={styles.empty}>{t('tasks.empty')}</div> : null}
            {tasks.map((task) => (
              <div key={task.id} className={task.enabled ? styles.row : styles.rowDisabled}>
                {editingId === task.id ? (
                  <EditTaskForm t={t} task={task} sessionId={sessionId} onDone={() => { setEditingId(null); void refresh() }} />
                ) : (
                  <>
                    <div className={styles.rowHead}>
                      <span className={task.enabled ? styles.dotOn : styles.dotOff} />
                      <span className={styles.taskId}>{task.id}</span>
                      {task.sessionId ? (
                        <span className={styles.badge} title={t('task.boundTo', { id: task.sessionId })}>
                          {t('task.bound')}
                        </span>
                      ) : null}
                      <span className={styles.badge}>{t(`origin.${task.origin}`)}</span>
                    </div>
                    <div className={styles.prompt} title={task.prompt}>{task.prompt}</div>
                    <div className={styles.meta}>
                      <span>{scheduleText(task, t)}</span>
                      <span>{t('task.next', { time: formatTime(task.nextRunAt) })}</span>
                    </div>
                    <div className={styles.actions}>
                      <button type="button" className={styles.action} onClick={() => void act('run', { id: task.id })}>
                        {t('action.run')}
                      </button>
                      <button type="button" className={styles.action} onClick={() => void act('toggle', { id: task.id, enabled: !task.enabled })}>
                        {task.enabled ? t('action.pause') : t('action.resume')}
                      </button>
                      {task.origin === 'dynamic' ? (
                        <>
                          <button type="button" className={styles.action} onClick={() => setEditingId(task.id)}>
                            {t('action.edit')}
                          </button>
                          <button type="button" className={styles.actionDanger} onClick={() => void act('remove', { id: task.id })}>
                            {t('action.remove')}
                          </button>
                        </>
                      ) : null}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.list}>
            {records.length === 0 ? <div className={styles.empty}>{t('history.empty')}</div> : null}
            {records.map((record) => (
              <div key={record.id} className={styles.row}>
                <div className={styles.rowHead}>
                  <span className={styles[`dot_${record.status}` as keyof typeof styles] ?? styles.dotOff} />
                  <span className={styles.taskId}>{record.taskId}</span>
                  <span className={styles.badge}>{t(`history.status.${record.status}`)}</span>
                  <span className={styles.time}>{formatTime(record.firedAt)}</span>
                </div>
                {record.excerpt ? <div className={styles.prompt} title={record.excerpt}>{record.excerpt}</div> : null}
                <div className={styles.meta}>
                  <span>{t('history.scheduled', { time: formatTime(record.scheduledFor) })}</span>
                  <span>{durationText(record, t)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

// --- drawer (shell.overlay entry) -----------------------------------------------

interface SlotProps {
  t?: T
  sessionId?: string
}

function PanelHeader({ t, sessionId, onClose }: { t: T; sessionId: string; onClose?: () => void }) {
  const { prefs: currentPrefs } = useDrawerState()
  const testToast = () => notifyEvents([{
    kind: 'completed',
    record: {
      id: 'toast-test', taskId: 'toast-test', sessionId, prompt: '', scheduledFor: '', firedAt: '',
      status: 'completed', excerpt: t('toast.testBody'),
    },
  }])
  const toggleSystem = async () => {
    if (currentPrefs.system) { setPref('system', false); return }
    if (typeof Notification === 'undefined') return
    if (Notification.permission === 'default') {
      try { await Notification.requestPermission() } catch { /* unavailable */ }
    }
    if (Notification.permission === 'granted') setPref('system', true)
  }
  return (
    <div className={styles.drawerHead}>
      <span className={styles.drawerTitle}>{t('trigger.aria')}</span>
      <details className={styles.settings}>
        <summary className={styles.headText}>{t('prefs.title')}</summary>
        <div className={styles.settingsBody}>
          <button type="button" className={styles.headText} aria-pressed={currentPrefs.system} onClick={() => void toggleSystem()}>{t('prefs.systemShort')}</button>
          <button type="button" className={styles.headText} aria-pressed={currentPrefs.sound} onClick={() => setPref('sound', !currentPrefs.sound)}>{t('prefs.soundShort')}</button>
          <button type="button" className={styles.headText} onClick={testToast}>{t('drawer.test')}</button>
        </div>
      </details>
      {onClose ? <button type="button" className={styles.drawerClose} aria-label={t('drawer.close')} onClick={onClose}>×</button> : null}
    </div>
  )
}

function PanelContent({ t, sessionId, visible, onClose }: { t: T; sessionId: string; visible: boolean; onClose?: () => void }) {
  useDrawerState()
  const view = sessionView(sessionId)
  return (
    <>
      <PanelHeader t={t} sessionId={sessionId} onClose={onClose} />
      <div className={styles.owner} title={sessionId}>{t('panel.owner', { id: sessionId })}</div>
      <CronPanel key={sessionId} t={t} tab={view.tab} setTab={tab => setDrawerTab(tab, sessionId)} sessionId={sessionId} visible={visible} />
    </>
  )
}

function StandalonePanel({ t, sessionId, children }: { t: T; sessionId: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current!
    const previous = document.activeElement
    dialog.showModal() // Native top layer avoids sibling-plugin z-index contests.
    return () => {
      dialog.close()
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus()
    }
  }, [])
  return (
    <dialog ref={ref} className={styles.drawer} aria-label={t('trigger.aria')}
      onCancel={event => { event.preventDefault(); setDrawerOpen(false) }}
      onClick={event => {
        if (event.target !== event.currentTarget) return
        const box = event.currentTarget.getBoundingClientRect()
        if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) setDrawerOpen(false)
      }}>
      <PanelContent t={t} sessionId={sessionId} visible onClose={() => setDrawerOpen(false)} />
      {children}
    </dialog>
  )
}

function CronSidebarPanel({ scope, visible, t }: SidebarProps & { t: T }) {
  const sessionId = scope.sessionId
  useEffect(() => {
    const view = sessionView(sessionId)
    view.visible = visible
    if (visible) view.unread = 0
    storeNotify()
    return () => { view.visible = false; storeNotify() }
  }, [sessionId, visible])
  return <section className={styles.sidebarPanel} aria-label={t('trigger.aria')}>
    <PanelContent t={t} sessionId={sessionId} visible={visible} />
  </section>
}

function CronDrawer({ t }: SlotProps) {
  const tr = t ?? fallbackT
  const { open, sessionId, drawerSessionId: owner, toasts } = useDrawerState()
  useCronWatcher(sessionId)
  const notifications = <div className={styles.toastStack} aria-live="polite">
    {toasts.map(item => <ToastCard key={item.key} t={tr} item={item} />)}
  </div>
  // Modal dialogs make body siblings inert; keep notifications in the active
  // top-layer context so test/completion toasts remain visible and clickable.
  return createPortal(open && owner
    ? <StandalonePanel key={owner} t={tr} sessionId={owner}>{notifications}</StandalonePanel>
    : notifications, document.body)
}

// --- header trigger (conversation.session.header.utilities entry) -----------------

function CronAction({ t, sessionId }: SlotProps) {
  const tr = t ?? fallbackT
  const state = useDrawerState()
  const { count, unread, visible } = sessionView(sessionId ?? null)
  const open = visible || (state.open && state.drawerSessionId === sessionId)
  useEffect(() => {
    setActiveSession(sessionId ?? null)
    return () => { if (activeSessionId === sessionId) setActiveSession(null) }
  }, [sessionId])

  return (
    <button
      type="button"
      className={open ? styles.triggerActive : styles.trigger}
      aria-expanded={open}
      aria-label={tr('trigger.aria')}
      title={tr('trigger.aria')}
      disabled={!sessionId}
      onClick={() => {
        if (!sessionId) return
        if (state.open && state.drawerSessionId === sessionId) setDrawerOpen(false)
        else openDrawer(sessionView(sessionId).tab, sessionId)
      }}
    >
      <span className={styles.triggerLabel}>{tr('trigger.aria')}</span>
      {count > 0 ? <span className={styles.count}>{count}</span> : null}
      {unread > 0 ? <span className={styles.unreadBadge}>{unread}</span> : null}
    </button>
  )
}

/** Client plugin body: dictionaries, styles, header trigger, and the drawer. */
export function apply(ctx: any) {
  ctx.effect(() => ctx.locale.register('cron', { zh, en }), 'dsh-cron: dictionaries')
  ctx.effect(() => {
    const tag = document.createElement('style')
    tag.dataset.plugin = 'dsh-cron'
    tag.textContent = css
    document.head.append(tag)
    return () => tag.remove()
  }, 'dsh-cron: styles')
  // Optional injection watches service arrival/removal without making Cron wait
  // for Better Sidebar. Registration and bridge ownership follow this Fiber.
  ctx.inject(['betterSidebar'], (inner: any) => {
    const service = inner.get('betterSidebar')
    if (!supportsSidebar(service)) return
    inner.effect(() => {
      const tr: T = ctx.locale.bind('cron')
      let dispose: () => void
      try {
        dispose = service.registerTab({
          id: CRON_TAB_ID,
          title: () => tr('trigger.aria'),
          single: true,
          order: 80,
          createTab: state => createSidebarTab(state, tr('trigger.aria'), window.innerWidth),
          component: props => <CronSidebarPanel {...props} t={tr} />,
        })
      } catch (error) {
        console.warn('[dsh-cron] sidebar registration failed; standalone panel remains available', error)
        return
      }
      sidebar = service
      storeNotify()
      return () => {
        if (sidebar === service) { sidebar = null; storeNotify() }
        dispose()
      }
    }, 'dsh-cron: optional sidebar tab')
  })
  ctx.effect(() => () => {
    sidebar = null
    drawerOpen = false
    activeSessionId = drawerSessionId = null
    sessionViews.clear()
    toasts = []
    storeNotify()
  }, 'dsh-cron: reset client state')
  // The utilities seat is the header's rightmost group (it renders right of
  // the actions group); order -50 puts the trigger just LEFT of
  // dsh-session-manager's buttons (drawer-host -40 / manage -30 / delete -10).
  ctx.slots.inject('conversation.session.header.utilities', () =>
    ctx.slots.register({
      name: 'conversation.session.header.utilities',
      id: 'cron-trigger',
      order: -50,
      locale: 'cron',
      inject: (sessionId: string) => ({ sessionId }),
    }, CronAction))
  ctx.slots.inject('shell.overlay', () =>
    ctx.slots.register({
      name: 'shell.overlay',
      id: 'cron-drawer',
      order: 100,
      locale: 'cron',
    }, CronDrawer))
}
