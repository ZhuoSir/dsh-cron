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
} as const

export const css = `
/* header trigger */
.dsh-cron-trigger {
  min-height: 28px; color: var(--dsw-alias-label-tertiary, #888); cursor: pointer;
  background: 0; border: 0; border-radius: 6px; align-items: center; gap: 3px;
  padding: 3px 6px; font-size: 12px; line-height: 18px; display: inline-flex;
}
.dsh-cron-trigger:hover, .dsh-cron-trigger:focus-visible { color: var(--dsw-alias-label-secondary, #555); }
.dsh-cron-triggerActive { color: var(--dsw-alias-label-primary, #222); background: var(--dsw-alias-fill-l2, #f2f2f2); }
.dsh-cron-triggerLabel { font-size: 12px; }
.dsh-cron-count { margin: 0 2px; font-variant-numeric: tabular-nums; }

/* mask + right drawer (rendered into shell.overlay, so fixed positioning is
   relative to the viewport and nothing in the header can clip it) */
.dsh-cron-mask {
  position: fixed; inset: 0; z-index: 900; background: rgba(0, 0, 0, .22);
  opacity: 0; pointer-events: none; transition: opacity .18s ease;
}
.dsh-cron-maskOpen { opacity: 1; pointer-events: auto; }
.dsh-cron-drawer {
  position: fixed; top: 0; right: 0; bottom: 0; z-index: 901;
  width: 400px; max-width: 92vw; box-sizing: border-box;
  display: flex; flex-direction: column;
  background: var(--dsw-specific-menu, #fff);
  border-left: 1px solid var(--dsw-alias-border-l2, #ddd);
  box-shadow: var(--dsw-shadow-lv3, -8px 0 24px rgba(0,0,0,.12));
  transform: translateX(103%); transition: transform .22s ease;
  pointer-events: auto;
}
.dsh-cron-drawerOpen { transform: translateX(0); }
.dsh-cron-drawerHead {
  flex: none; display: flex; align-items: center; justify-content: space-between;
  padding: 12px 14px; border-bottom: 1px solid var(--dsw-alias-border-l2, #eee);
}
.dsh-cron-drawerTitle { font-size: 13px; font-weight: 600; color: var(--dsw-alias-label-primary, #222); }
.dsh-cron-drawerClose {
  border: 0; background: 0; cursor: pointer; font-size: 18px; line-height: 1;
  color: var(--dsw-alias-label-tertiary, #888); padding: 2px 6px; border-radius: 6px;
}
.dsh-cron-drawerClose:hover { color: var(--dsw-alias-label-primary, #222); background: var(--dsw-alias-fill-l2, #f2f2f2); }

/* panel body */
.dsh-cron-tabs { flex: none; display: flex; gap: 2px; padding: 8px 10px 6px; border-bottom: 1px solid var(--dsw-alias-border-l2, #eee); }
.dsh-cron-tab {
  flex: 1; border: 0; background: 0; cursor: pointer; padding: 6px 0; font-size: 12px;
  color: var(--dsw-alias-label-tertiary, #888); border-radius: 6px;
}
.dsh-cron-tab:hover { color: var(--dsw-alias-label-secondary, #555); }
.dsh-cron-tabActive { color: var(--dsw-alias-label-primary, #222); background: var(--dsw-alias-fill-l2, #f2f2f2); font-weight: 600; }
.dsh-cron-body { flex: 1; overflow: auto; padding: 6px; }
.dsh-cron-list { display: flex; flex-direction: column; gap: 4px; }
.dsh-cron-empty { padding: 18px 10px; text-align: center; font-size: 12px; color: var(--dsw-alias-label-tertiary, #999); }
.dsh-cron-row {
  box-sizing: border-box; border-radius: 8px; padding: 8px 10px; display: flex; flex-direction: column; gap: 4px;
  background: var(--dsw-alias-fill-l1, transparent);
}
.dsh-cron-row:hover { background: var(--dsw-alias-fill-l2, #f5f5f5); }
.dsh-cron-rowDisabled { opacity: .55; }
.dsh-cron-rowHead { display: flex; align-items: center; gap: 6px; }
.dsh-cron-dot { flex: none; width: 7px; height: 7px; border-radius: 50%; }
.dsh-cron-dotOn { background: #22c55e; }
.dsh-cron-dotOff { background: #a3a3a3; }
.dsh-cron-dotDelivered { background: #a3a3a3; }
.dsh-cron-dotRunning { background: #3b82f6; }
.dsh-cron-dotCompleted { background: #22c55e; }
.dsh-cron-dotFailed { background: #ef4444; }
.dsh-cron-taskId { font-family: var(--dsw-font-mono, monospace); font-size: 12px; color: var(--dsw-alias-label-primary, #222); flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dsh-cron-badge {
  flex: none; font-size: 10px; line-height: 16px; padding: 0 6px; border-radius: 5px;
  background: var(--dsw-alias-fill-l2, #eee); color: var(--dsw-alias-label-secondary, #666);
}
.dsh-cron-time { flex: none; font-size: 11px; color: var(--dsw-alias-label-tertiary, #999); }
.dsh-cron-prompt {
  font-size: 12px; color: var(--dsw-alias-label-secondary, #555);
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.dsh-cron-meta { display: flex; justify-content: space-between; font-size: 11px; color: var(--dsw-alias-label-tertiary, #999); }
.dsh-cron-actions { display: flex; gap: 8px; }
.dsh-cron-action {
  border: 0; background: 0; cursor: pointer; padding: 2px 0; font-size: 11px;
  color: var(--dsw-alias-label-tertiary, #888);
}
.dsh-cron-action:hover { color: var(--dsw-alias-label-primary, #222); text-decoration: underline; }
.dsh-cron-actionDanger:hover { color: #ef4444; }
.dsh-cron-addButton {
  margin: 4px; padding: 7px 0; border: 1px dashed var(--dsw-alias-border-l2, #ddd); border-radius: 8px;
  background: 0; cursor: pointer; font-size: 12px; color: var(--dsw-alias-label-tertiary, #888);
}
.dsh-cron-addButton:hover { color: var(--dsw-alias-label-primary, #222); border-color: var(--dsw-alias-label-tertiary, #aaa); }
.dsh-cron-form { display: flex; flex-direction: column; gap: 6px; padding: 8px 4px; }
.dsh-cron-formRow { display: flex; gap: 6px; }
.dsh-cron-input, .dsh-cron-textarea, .dsh-cron-select {
  box-sizing: border-box; width: 100%; border: 1px solid var(--dsw-alias-border-l2, #ddd); border-radius: 6px;
  background: var(--dsw-specific-menu, #fff); color: var(--dsw-alias-label-primary, #222);
  font-size: 12px; padding: 6px 8px; font-family: inherit;
}
.dsh-cron-textarea { resize: vertical; }
.dsh-cron-select { width: auto; flex: none; }
.dsh-cron-input:focus, .dsh-cron-textarea:focus, .dsh-cron-select:focus { outline: 1px solid var(--dsw-alias-label-tertiary, #aaa); }
.dsh-cron-primaryButton {
  border: 0; border-radius: 6px; padding: 7px 0; cursor: pointer; font-size: 12px;
  background: var(--dsw-alias-fill-l3, #e5e5e5); color: var(--dsw-alias-label-primary, #222);
}
.dsh-cron-primaryButton:disabled { opacity: .5; cursor: default; }
.dsh-cron-ghostButton {
  border: 1px solid var(--dsw-alias-border-l2, #ddd); border-radius: 6px; padding: 6px 0; cursor: pointer;
  font-size: 12px; background: 0; color: var(--dsw-alias-label-secondary, #666); width: 100%;
}
.dsh-cron-ghostButton:hover { color: var(--dsw-alias-label-primary, #222); }
.dsh-cron-form .dsh-cron-primaryButton { flex: 1; }
.dsh-cron-form .dsh-cron-ghostButton { flex: 1; width: auto; }
.dsh-cron-error {
  margin: 4px; padding: 6px 8px; border-radius: 6px; font-size: 11px;
  background: rgba(239, 68, 68, .1); color: #ef4444;
}
`
