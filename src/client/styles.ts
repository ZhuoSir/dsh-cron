// Plain-CSS style injection (no CSS-modules build step): one stylesheet plus a
// class-name map so components stay readable.

export const styles = {
  trigger: 'dsh-cron-trigger',
  triggerLabel: 'dsh-cron-triggerLabel',
  triggerActive: 'dsh-cron-trigger dsh-cron-triggerActive',
  count: 'dsh-cron-count',
  mask: 'dsh-cron-mask',
  maskOpen: 'dsh-cron-mask dsh-cron-maskOpen',
  drawer: 'dsh-cron-drawer',
  drawerOpen: 'dsh-cron-drawer dsh-cron-drawerOpen',
  drawerHead: 'dsh-cron-drawerHead',
  drawerTitle: 'dsh-cron-drawerTitle',
  drawerClose: 'dsh-cron-drawerClose',
  headSpacer: 'dsh-cron-headSpacer',
  headText: 'dsh-cron-headText',
  headTextOn: 'dsh-cron-headText dsh-cron-headTextOn',
  tabs: 'dsh-cron-tabs',
  tab: 'dsh-cron-tab',
  tabActive: 'dsh-cron-tab dsh-cron-tabActive',
  body: 'dsh-cron-body',
  list: 'dsh-cron-list',
  empty: 'dsh-cron-empty',
  row: 'dsh-cron-row',
  rowDisabled: 'dsh-cron-row dsh-cron-rowDisabled',
  rowHead: 'dsh-cron-rowHead',
  taskId: 'dsh-cron-taskId',
  badge: 'dsh-cron-badge',
  time: 'dsh-cron-time',
  prompt: 'dsh-cron-prompt',
  meta: 'dsh-cron-meta',
  actions: 'dsh-cron-actions',
  action: 'dsh-cron-action',
  actionDanger: 'dsh-cron-action dsh-cron-actionDanger',
  addButton: 'dsh-cron-addButton',
  form: 'dsh-cron-form',
  formRow: 'dsh-cron-formRow',
  input: 'dsh-cron-input',
  textarea: 'dsh-cron-textarea',
  select: 'dsh-cron-select',
  primaryButton: 'dsh-cron-primaryButton',
  ghostButton: 'dsh-cron-ghostButton',
  error: 'dsh-cron-error',
  dotOn: 'dsh-cron-dot dsh-cron-dotOn',
  dotOff: 'dsh-cron-dot dsh-cron-dotOff',
  dot_delivered: 'dsh-cron-dot dsh-cron-dotDelivered',
  dot_running: 'dsh-cron-dot dsh-cron-dotRunning',
  dot_completed: 'dsh-cron-dot dsh-cron-dotCompleted',
  dot_failed: 'dsh-cron-dot dsh-cron-dotFailed',
  dot_interrupted: 'dsh-cron-dot dsh-cron-dotInterrupted',
  unreadBadge: 'dsh-cron-unreadBadge',
  toastStack: 'dsh-cron-toastStack',
  toast: 'dsh-cron-toast',
  toastFailed: 'dsh-cron-toast dsh-cron-toastFailed',
  toastTitle: 'dsh-cron-toastTitle',
  toastBody: 'dsh-cron-toastBody',
} as const

export const css = `
/* Local semantic tokens: current public DSH theme variables first, then
   color-scheme-aware system colors when a host omits one. All three roots are
   included because the trigger, drawer and toast stack live in separate Slots. */
:where(.dsh-cron-trigger, .dsh-cron-drawer, .dsh-cron-toastStack) {
  --dsh-cron-bg-surface: var(--dsw-alias-bg-layer-1, Canvas);
  --dsh-cron-bg-control: var(--dsw-alias-bg-layer-2, color-mix(in srgb, CanvasText 8%, Canvas));
  --dsh-cron-bg-overlay: var(--dsw-alias-bg-overlay, color-mix(in srgb, CanvasText 14%, Canvas));
  --dsh-cron-bg-interactive: color-mix(in srgb, var(--dsh-cron-bg-overlay) 38%, var(--dsh-cron-bg-surface));
  --dsh-cron-label-primary: var(--dsw-alias-label-primary, CanvasText);
  --dsh-cron-label-secondary: var(--dsw-alias-label-secondary, color-mix(in srgb, CanvasText 78%, transparent));
  --dsh-cron-label-tertiary: color-mix(in srgb, var(--dsh-cron-label-secondary) 78%, transparent);
  --dsh-cron-label-caption: color-mix(in srgb, var(--dsh-cron-label-secondary) 62%, transparent);
  --dsh-cron-border: var(--dsw-alias-border-l2, color-mix(in srgb, CanvasText 18%, transparent));
}

/* header trigger */
.dsh-cron-trigger {
  min-height: 28px; color: var(--dsh-cron-label-tertiary); cursor: pointer;
  background: 0; border: 0; border-radius: 6px; align-items: center; gap: 3px;
  padding: 3px 6px; font-size: 12px; line-height: 18px; display: inline-flex;
}
.dsh-cron-trigger:hover, .dsh-cron-trigger:focus-visible { color: var(--dsh-cron-label-secondary); }
.dsh-cron-triggerActive { color: var(--dsh-cron-label-primary); background: var(--dsh-cron-bg-interactive); }
.dsh-cron-triggerLabel { font-size: 12px; }
.dsh-cron-count { margin: 0 2px; font-variant-numeric: tabular-nums; }

/* mask + right drawer (rendered into shell.overlay, so fixed positioning is
   relative to the viewport and nothing in the header can clip it) */
.dsh-cron-mask {
  position: fixed; inset: 0; z-index: 900; background: rgb(0 0 0 / 42%);
  opacity: 0; pointer-events: none; transition: opacity .18s ease;
}
.dsh-cron-maskOpen { opacity: 1; pointer-events: auto; }
.dsh-cron-drawer {
  position: fixed; top: 0; right: 0; bottom: 0; z-index: 901;
  width: 560px; max-width: 94vw; box-sizing: border-box;
  display: flex; flex-direction: column;
  background: var(--dsh-cron-bg-surface);
  color: var(--dsh-cron-label-primary);
  border-left: 1px solid var(--dsh-cron-border);
  box-shadow: -8px 0 24px rgb(0 0 0 / 28%);
  transform: translateX(103%); transition: transform .22s ease;
  pointer-events: auto;
}
.dsh-cron-drawerOpen { transform: translateX(0); }
.dsh-cron-drawerHead {
  flex: none; display: flex; align-items: center; justify-content: space-between;
  padding: 12px 14px; border-bottom: 1px solid var(--dsh-cron-border);
}
.dsh-cron-drawerTitle { font-size: 13px; font-weight: 600; color: var(--dsh-cron-label-primary); }
.dsh-cron-drawerClose {
  border: 0; background: 0; cursor: pointer; font-size: 18px; line-height: 1;
  color: var(--dsh-cron-label-tertiary); padding: 2px 6px; border-radius: 6px;
}
.dsh-cron-drawerClose:hover { color: var(--dsh-cron-label-primary); background: var(--dsh-cron-bg-interactive); }
.dsh-cron-headSpacer { flex: 1; }
.dsh-cron-headText {
  border: 0; background: 0; cursor: pointer; font-size: 11px; line-height: 1;
  color: var(--dsh-cron-label-tertiary); padding: 5px 6px; border-radius: 6px;
  white-space: nowrap;
}
.dsh-cron-headText:hover { color: var(--dsh-cron-label-primary); background: var(--dsh-cron-bg-interactive); }
.dsh-cron-headTextOn {
  color: var(--dsh-cron-label-primary); background: var(--dsh-cron-bg-interactive);
  font-weight: 600;
}

/* panel body */
.dsh-cron-tabs { flex: none; display: flex; gap: 2px; padding: 8px 10px 6px; border-bottom: 1px solid var(--dsh-cron-border); }
.dsh-cron-tab {
  flex: 1; border: 0; background: 0; cursor: pointer; padding: 6px 0; font-size: 12px;
  color: var(--dsh-cron-label-tertiary); border-radius: 6px;
}
.dsh-cron-tab:hover { color: var(--dsh-cron-label-secondary); }
.dsh-cron-tabActive { color: var(--dsh-cron-label-primary); background: var(--dsh-cron-bg-interactive); font-weight: 600; }
.dsh-cron-body { flex: 1; overflow: auto; padding: 6px; }
.dsh-cron-list { display: flex; flex-direction: column; gap: 4px; }
.dsh-cron-empty { padding: 18px 10px; text-align: center; font-size: 12px; color: var(--dsh-cron-label-tertiary); }
.dsh-cron-row {
  box-sizing: border-box; border-radius: 8px; padding: 8px 10px; display: flex; flex-direction: column; gap: 4px;
  background: transparent;
}
.dsh-cron-row:hover { background: var(--dsh-cron-bg-interactive); }
.dsh-cron-rowDisabled { opacity: .55; }
.dsh-cron-rowHead { display: flex; align-items: center; gap: 6px; }
.dsh-cron-dot { flex: none; width: 7px; height: 7px; border-radius: 50%; }
.dsh-cron-dotOn { background: var(--dsw-alias-state-success-primary, #22c55e); }
.dsh-cron-dotOff { background: var(--dsh-cron-label-caption); }
.dsh-cron-dotDelivered { background: var(--dsh-cron-label-caption); }
.dsh-cron-dotRunning { background: var(--dsw-alias-brand-primary, #3b82f6); }
.dsh-cron-dotCompleted { background: var(--dsw-alias-state-success-primary, #22c55e); }
.dsh-cron-dotFailed { background: var(--dsw-alias-state-error-primary, #ef4444); }
.dsh-cron-dotInterrupted { background: var(--dsw-alias-state-warning-primary, #f59e0b); }
.dsh-cron-taskId { font-family: var(--dsw-font-mono, monospace); font-size: 12px; color: var(--dsh-cron-label-primary); flex: 1; min-width: 0; word-break: break-all; }
.dsh-cron-badge {
  flex: none; font-size: 10px; line-height: 16px; padding: 0 6px; border-radius: 5px;
  background: var(--dsh-cron-bg-interactive); color: var(--dsh-cron-label-secondary);
}
.dsh-cron-time { flex: none; font-size: 11px; color: var(--dsh-cron-label-tertiary); }
.dsh-cron-prompt {
  font-size: 12px; color: var(--dsh-cron-label-secondary);
  white-space: pre-wrap; word-break: break-word; overflow-wrap: anywhere;
}
.dsh-cron-meta { display: flex; justify-content: space-between; gap: 4px 12px; flex-wrap: wrap; font-size: 11px; color: var(--dsh-cron-label-tertiary); }
.dsh-cron-actions { display: flex; gap: 8px; }
.dsh-cron-action {
  border: 0; background: 0; cursor: pointer; padding: 2px 0; font-size: 11px;
  color: var(--dsh-cron-label-tertiary);
}
.dsh-cron-action:hover { color: var(--dsh-cron-label-primary); text-decoration: underline; }
.dsh-cron-actionDanger:hover { color: var(--dsw-alias-state-error-primary, #ef4444); }
.dsh-cron-addButton {
  margin: 4px; padding: 7px 0; border: 1px dashed var(--dsh-cron-border); border-radius: 8px;
  background: 0; cursor: pointer; font-size: 12px; color: var(--dsh-cron-label-tertiary);
}
.dsh-cron-addButton:hover { color: var(--dsh-cron-label-primary); border-color: var(--dsh-cron-label-tertiary); }
.dsh-cron-form { display: flex; flex-direction: column; gap: 6px; padding: 8px 4px; }
.dsh-cron-formRow { display: flex; gap: 6px; }
.dsh-cron-input, .dsh-cron-textarea, .dsh-cron-select {
  box-sizing: border-box; width: 100%; border: 1px solid var(--dsh-cron-border); border-radius: 6px;
  background: var(--dsh-cron-bg-control); color: var(--dsh-cron-label-primary);
  font-size: 12px; padding: 6px 8px; font-family: inherit;
}
.dsh-cron-textarea { resize: vertical; }
.dsh-cron-select { width: auto; flex: none; }
.dsh-cron-input:focus, .dsh-cron-textarea:focus, .dsh-cron-select:focus { outline: 1px solid var(--dsh-cron-label-tertiary); }
.dsh-cron-primaryButton {
  border: 0; border-radius: 6px; padding: 7px 0; cursor: pointer; font-size: 12px;
  background: var(--dsh-cron-bg-overlay); color: var(--dsh-cron-label-primary);
}
.dsh-cron-primaryButton:disabled { opacity: .5; cursor: default; }
.dsh-cron-ghostButton {
  border: 1px solid var(--dsh-cron-border); border-radius: 6px; padding: 6px 0; cursor: pointer;
  font-size: 12px; background: 0; color: var(--dsh-cron-label-secondary); width: 100%;
}
.dsh-cron-ghostButton:hover { color: var(--dsh-cron-label-primary); }
.dsh-cron-form .dsh-cron-primaryButton { flex: 1; }
.dsh-cron-form .dsh-cron-ghostButton { flex: 1; width: auto; }
.dsh-cron-unreadBadge {
  position: absolute; top: -4px; right: -6px; min-width: 14px; height: 14px; padding: 0 3px;
  border-radius: 7px; background: var(--dsw-alias-state-error-primary, #ef4444); color: var(--dsh-cron-bg-surface); font-size: 9px; line-height: 14px;
  text-align: center; font-variant-numeric: tabular-nums; box-sizing: border-box;
}
.dsh-cron-trigger { position: relative; }
.dsh-cron-toastStack {
  position: fixed; top: 56px; right: 16px; z-index: 2147483647; /* int32 max: dsh-better-sidebar floats at 2147483000 */
  display: flex; flex-direction: column; gap: 8px; pointer-events: none;
}
.dsh-cron-toast {
  pointer-events: auto; width: 300px; max-width: 80vw; text-align: left; cursor: pointer;
  border: 1px solid var(--dsh-cron-border); border-left: 3px solid var(--dsw-alias-state-success-primary, #22c55e);
  background: var(--dsh-cron-bg-overlay); color: var(--dsh-cron-label-primary); border-radius: 10px; padding: 10px 12px;
  box-shadow: 0 8px 24px rgb(0 0 0 / 24%);
  display: flex; flex-direction: column; gap: 3px;
  animation: dsh-cron-toast-in .18s ease;
}
.dsh-cron-toastFailed { border-left-color: var(--dsw-alias-state-error-primary, #ef4444); }
.dsh-cron-toastTitle { font-size: 12px; font-weight: 600; color: var(--dsh-cron-label-primary); }
.dsh-cron-toastBody {
  font-size: 11px; color: var(--dsh-cron-label-secondary);
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
}
@keyframes dsh-cron-toast-in {
  from { opacity: 0; transform: translateX(16px); }
  to { opacity: 1; transform: translateX(0); }
}
.dsh-cron-error {
  margin: 4px; padding: 6px 8px; border-radius: 6px; font-size: 11px;
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary, #ef4444) 10%, transparent); color: var(--dsw-alias-state-error-primary, #ef4444);
}
`
