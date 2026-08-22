// dsh-cron client half: a session-header trigger (rightmost) plus a right-side
// drawer floating over the whole app via the `shell.overlay` slot — a dropdown
// under the header gets clipped by the header's stacking context, a fixed
// drawer does not. The panel talks to the host half over POST /cron/api/<method>.

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { zh, en } from './locale.js'
import { css, styles } from './styles.js'

/** Services required from the client runtime. */
export const inject = ['slots', 'locale']

// --- shared drawer store -----------------------------------------------------
//
// The trigger (session-header slot) and the drawer (shell.overlay slot) live
// in different render trees, so open-state and the enabled-task count travel
// through this tiny module-level store.

let drawerOpen = false
let enabledCount = 0
// useSyncExternalStore requires a cached snapshot: returning a fresh object
// from getSnapshot causes an infinite render loop.
let snapshot = { open: drawerOpen, count: enabledCount }
const storeListeners = new Set<() => void>()

function storeSubscribe(listener: () => void) {
  storeListeners.add(listener)
  return () => { storeListeners.delete(listener) }
}

function storeNotify() {
  snapshot = { open: drawerOpen, count: enabledCount }
  for (const listener of storeListeners) listener()
}

function setDrawerOpen(open: boolean) {
  if (drawerOpen === open) return
  drawerOpen = open
  storeNotify()
}

function setEnabledCount(count: number) {
  if (enabledCount === count) return
  enabledCount = count
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

function CronPanel({ t }: { t: T }) {
  const [tab, setTab] = useState<'tasks' | 'history'>('tasks')
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
  const { open } = useDrawerState()

  // Escape closes the drawer while it is open.
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawerOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

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
            aria-label={tr('drawer.close')}
            onClick={() => setDrawerOpen(false)}
          >
            ×
          </button>
        </div>
        <CronPanel t={tr} />
      </aside>
    </>
  )
}

// --- header trigger (conversation.session.header.actions entry) -------------------

function CronAction({ t }: SlotProps) {
  const tr = t ?? fallbackT
  const { open, count } = useDrawerState()

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
