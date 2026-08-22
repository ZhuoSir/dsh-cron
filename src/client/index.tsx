// dsh-cron client half: a session-header trigger (rightmost) plus a right-side
// drawer floating over the whole app via the `shell.overlay` slot — a dropdown
// under the header gets clipped by the header's stacking context, a fixed
// drawer does not. The panel talks to the host half over POST /cron/api/<method>.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { zh, en } from './locale.js'
import { css, styles } from './styles.js'

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
let enabledCount = 0
let unreadCount = 0
let drawerTab: DrawerTab = 'tasks'
let toastSeq = 0
let toasts: ToastItem[] = []
const TOAST_MS = 5000
const MAX_TOASTS = 3

// useSyncExternalStore requires a cached snapshot: returning a fresh object
// from getSnapshot causes an infinite render loop.
interface DrawerSnapshot { open: boolean; count: number; unread: number; tab: DrawerTab; toasts: ToastItem[] }
let snapshot: DrawerSnapshot = { open: drawerOpen, count: enabledCount, unread: unreadCount, tab: drawerTab, toasts }
const storeListeners = new Set<() => void>()

function storeSubscribe(listener: () => void) {
  storeListeners.add(listener)
  return () => { storeListeners.delete(listener) }
}

function storeNotify() {
  snapshot = { open: drawerOpen, count: enabledCount, unread: unreadCount, tab: drawerTab, toasts }
  for (const listener of storeListeners) listener()
}

function setDrawerOpen(open: boolean) {
  if (drawerOpen === open) return
  drawerOpen = open
  if (open) unreadCount = 0 // opening the drawer acknowledges the badge
  storeNotify()
}

/** Open the drawer on a specific tab (e.g. a toast click opens history). */
function openDrawer(tab: DrawerTab) {
  drawerTab = tab
  setDrawerOpen(true)
}

function setEnabledCount(count: number) {
  if (enabledCount === count) return
  enabledCount = count
  storeNotify()
}

/** New finished-run activity: bump the badge only while the drawer is closed. */
function bumpUnread(by: number) {
  if (drawerOpen || by === 0) return
  unreadCount += by
  storeNotify()
}

function setDrawerTab(tab: DrawerTab) {
  if (drawerTab === tab) return
  drawerTab = tab
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
  schedule: { at?: string; everySeconds?: number; daily?: string; cron?: string }
  enabled: boolean
  origin: 'config' | 'dynamic'
  sessionId: string | null
  lastRunAt: string | null
  nextRunAt: string | null
}

interface RunRecord {
  id: string
  taskId: string
  prompt: string
  scheduledFor: string
  firedAt: string
  status: 'delivered' | 'running' | 'completed' | 'failed'
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

/** One toast card; auto-dismisses, click opens the drawer on the history tab. */
function ToastCard({ t, item }: { t: T; item: ToastItem }) {
  useEffect(() => {
    const timer = setTimeout(() => dismissToast(item.key), TOAST_MS)
    return () => clearTimeout(timer)
  }, [item.key])

  const open = () => {
    dismissToast(item.key)
    openDrawer('history')
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
function useCronWatcher(): void {
  const snapshotRef = useRef<Map<string, string> | null>(null)

  useEffect(() => {
    let stopped = false
    console.info('[dsh-cron] watcher started (poll every %ds)', POLL_MS / 1000)
    const poll = async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      try {
        const { records } = await api<{ records: RunRecord[] }>('history', { limit: 20 })
        if (stopped) return
        const prev = snapshotRef.current
        snapshotRef.current = new Map(records.map((r) => [r.id, r.status]))
        if (prev === null) {
          console.info('[dsh-cron] watcher primed with %d record(s)', records.length)
          return
        }
        const events = diffRecords(prev, records)
        if (events.length === 0) return
        console.info('[dsh-cron] %d task run(s) finished:', events.map((e) => `${e.record.taskId}:${e.kind}`).join(', '))
        bumpUnread(events.length)
        for (const event of events) pushToast(event)
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
  }, [])
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
  if (task.schedule.daily) return t('schedule.daily', { time: task.schedule.daily })
  if (task.schedule.cron) return t('schedule.cron', { expr: task.schedule.cron })
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
function EditTaskForm({ t, task, onDone }: { t: T; task: TaskView; onDone: () => void }) {
  const [form, setForm] = useState<EditFormState>({ prompt: task.prompt, rule: ruleOf(task), value: ruleValueOf(task) })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true)
    setError('')
    try {
      const payload: Record<string, unknown> = { id: task.id, prompt: form.prompt.trim() }
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

function CronPanel({ t, tab, setTab }: { t: T; tab: DrawerTab; setTab: (tab: DrawerTab) => void }) {
  const [tasks, setTasks] = useState<TaskView[]>([])
  const [records, setRecords] = useState<RunRecord[]>([])
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const [listResult, historyResult] = await Promise.all([
        api<{ tasks: TaskView[] }>('list'),
        api<{ records: RunRecord[] }>('history', { limit: 50 }),
      ])
      setTasks(listResult.tasks)
      setRecords(historyResult.records)
      setEnabledCount(listResult.tasks.filter((task) => task.enabled).length)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  useEffect(() => {
    void refresh()
    const timer = setInterval(() => void refresh(), 10_000)
    return () => clearInterval(timer)
  }, [refresh])

  const act = async (method: string, payload: unknown) => {
    try {
      await api(method, payload)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
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
                  <EditTaskForm t={t} task={task} onDone={() => { setEditingId(null); void refresh() }} />
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
}

function CronDrawer({ t }: SlotProps) {
  const tr = t ?? fallbackT
  const { open, tab, toasts } = useDrawerState()
  useCronWatcher()

  // Escape closes the drawer while it is open.
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawerOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  // Diagnostics helper: prove the toast pipeline without waiting for a task.
  const testToast = () => {
    console.info('[dsh-cron] test toast pushed from the drawer header')
    pushToast({
      kind: 'completed',
      record: {
        id: 'toast-test', taskId: 'toast-test', prompt: '', scheduledFor: '', firedAt: '',
        status: 'completed', excerpt: tr('toast.testBody'),
      },
    })
  }

  return (
    <>
      <div
        className={open ? styles.maskOpen : styles.mask}
        onClick={() => setDrawerOpen(false)}
        aria-hidden="true"
      />
      <aside className={open ? styles.drawerOpen : styles.drawer} aria-hidden={!open}>
        <div className={styles.drawerHead}>
          <span className={styles.drawerTitle}>{tr('trigger.aria')}</span>
          <button
            type="button"
            className={styles.drawerClose}
            aria-label={tr('drawer.test')}
            title={tr('drawer.test')}
            onClick={testToast}
          >
            🔔
          </button>
          <button
            type="button"
            className={styles.drawerClose}
            aria-label={tr('drawer.close')}
            onClick={() => setDrawerOpen(false)}
          >
            ×
          </button>
        </div>
        <CronPanel t={tr} tab={tab} setTab={setDrawerTab} />
      </aside>
      <div className={styles.toastStack} aria-live="polite">
        {toasts.map((item) => (
          <ToastCard key={item.key} t={tr} item={item} />
        ))}
      </div>
    </>
  )
}

// --- header trigger (conversation.session.header.utilities entry) -----------------

function CronAction({ t }: SlotProps) {
  const tr = t ?? fallbackT
  const { open, count, unread } = useDrawerState()

  return (
    <button
      type="button"
      className={open ? styles.triggerActive : styles.trigger}
      aria-expanded={open}
      aria-label={tr('trigger.aria')}
      title={tr('trigger.aria')}
      onClick={() => setDrawerOpen(!open)}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
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
  // The utilities seat is the header's rightmost group (it renders right of
  // the actions group); order -50 puts the trigger just LEFT of
  // dsh-session-manager's buttons (drawer-host -40 / manage -30 / delete -10).
  ctx.slots.inject('conversation.session.header.utilities', () =>
    ctx.slots.register({
      name: 'conversation.session.header.utilities',
      id: 'cron-trigger',
      order: -50,
      locale: 'cron',
    }, CronAction))
  ctx.slots.inject('shell.overlay', () =>
    ctx.slots.register({
      name: 'shell.overlay',
      id: 'cron-drawer',
      order: 100,
      locale: 'cron',
    }, CronDrawer))
}
