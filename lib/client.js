window.__ModuleLoader__.load({
	id: "dsh-cron",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
let react = require("react");
let react_jsx_runtime = require("react/jsx-runtime");

//#region src/client/locale.ts
const zh = {
	"trigger.aria": "定时任务",
	"drawer.close": "关闭",
	"tab.tasks": "任务",
	"tab.history": "执行记录",
	"tasks.empty": "还没有定时任务。在对话中直接说，比如「每周一早上9点提醒我交周报」，Agent 会自动创建。",
	"history.empty": "还没有执行记录。",
	"origin.config": "配置",
	"origin.dynamic": "动态",
	"schedule.at": "一次性 · {time}",
	"schedule.every.seconds": "每 {count} 秒",
	"schedule.every.minutes": "每 {count} 分钟",
	"schedule.every.hours": "每 {count} 小时",
	"schedule.daily": "每天 {time}",
	"schedule.cron": "cron: {expr}",
	"task.next": "下次: {time}",
	"task.bound": "绑定会话",
	"task.boundTo": "触发时在创建它的会话中执行（会话 {id}）",
	"action.run": "立即执行",
	"action.pause": "暂停",
	"action.resume": "恢复",
	"action.remove": "删除",
	"action.edit": "编辑",
	"action.save": "保存",
	"action.cancel": "取消",
	"form.prompt": "任务内容：到点后 Agent 要做什么",
	"form.rule.daily": "每天",
	"form.rule.every": "每隔",
	"form.rule.cron": "cron 表达式",
	"form.rule.at": "一次性",
	"form.value.daily": "HH:MM（如 09:00）",
	"form.value.every": "秒数（如 1800）",
	"form.value.cron": "分 时 日 月 周（如 0 9 * * 1）",
	"form.value.at": "ISO 时间（如 2026-08-24T09:00:00+08:00）",
	"history.status.delivered": "已投递",
	"history.status.running": "执行中",
	"history.status.completed": "已完成",
	"history.status.failed": "失败",
	"history.scheduled": "计划: {time}",
	"duration.seconds": "{count}s",
	"duration.minutes": "{count}m{seconds}s"
};
const en = {
	"trigger.aria": "Scheduled tasks",
	"drawer.close": "Close",
	"tab.tasks": "Tasks",
	"tab.history": "History",
	"tasks.empty": "No scheduled tasks yet. Just say it in chat, e.g. \"remind me every Monday at 9am to submit the weekly report\".",
	"history.empty": "No runs yet.",
	"origin.config": "config",
	"origin.dynamic": "dynamic",
	"schedule.at": "once · {time}",
	"schedule.every.seconds": "every {count}s",
	"schedule.every.minutes": "every {count}m",
	"schedule.every.hours": "every {count}h",
	"schedule.daily": "daily {time}",
	"schedule.cron": "cron: {expr}",
	"task.next": "next: {time}",
	"task.bound": "bound session",
	"task.boundTo": "Runs in the session it was created in (session {id})",
	"action.run": "Run now",
	"action.pause": "Pause",
	"action.resume": "Resume",
	"action.remove": "Delete",
	"action.edit": "Edit",
	"action.save": "Save",
	"action.cancel": "Cancel",
	"form.prompt": "What should the agent do when it fires?",
	"form.rule.daily": "Daily",
	"form.rule.every": "Every",
	"form.rule.cron": "cron expression",
	"form.rule.at": "Once",
	"form.value.daily": "HH:MM (e.g. 09:00)",
	"form.value.every": "seconds (e.g. 1800)",
	"form.value.cron": "min hour dom mon dow (e.g. 0 9 * * 1)",
	"form.value.at": "ISO time (e.g. 2026-08-24T09:00:00+08:00)",
	"history.status.delivered": "delivered",
	"history.status.running": "running",
	"history.status.completed": "completed",
	"history.status.failed": "failed",
	"history.scheduled": "scheduled: {time}",
	"duration.seconds": "{count}s",
	"duration.minutes": "{count}m{seconds}s"
};

//#endregion
//#region src/client/styles.ts
const styles = {
	trigger: "dsh-cron-trigger",
	triggerActive: "dsh-cron-trigger dsh-cron-triggerActive",
	count: "dsh-cron-count",
	mask: "dsh-cron-mask",
	maskOpen: "dsh-cron-mask dsh-cron-maskOpen",
	drawer: "dsh-cron-drawer",
	drawerOpen: "dsh-cron-drawer dsh-cron-drawerOpen",
	drawerHead: "dsh-cron-drawerHead",
	drawerTitle: "dsh-cron-drawerTitle",
	drawerClose: "dsh-cron-drawerClose",
	tabs: "dsh-cron-tabs",
	tab: "dsh-cron-tab",
	tabActive: "dsh-cron-tab dsh-cron-tabActive",
	body: "dsh-cron-body",
	list: "dsh-cron-list",
	empty: "dsh-cron-empty",
	row: "dsh-cron-row",
	rowDisabled: "dsh-cron-row dsh-cron-rowDisabled",
	rowHead: "dsh-cron-rowHead",
	taskId: "dsh-cron-taskId",
	badge: "dsh-cron-badge",
	time: "dsh-cron-time",
	prompt: "dsh-cron-prompt",
	meta: "dsh-cron-meta",
	actions: "dsh-cron-actions",
	action: "dsh-cron-action",
	actionDanger: "dsh-cron-action dsh-cron-actionDanger",
	addButton: "dsh-cron-addButton",
	form: "dsh-cron-form",
	formRow: "dsh-cron-formRow",
	input: "dsh-cron-input",
	textarea: "dsh-cron-textarea",
	select: "dsh-cron-select",
	primaryButton: "dsh-cron-primaryButton",
	ghostButton: "dsh-cron-ghostButton",
	error: "dsh-cron-error",
	dotOn: "dsh-cron-dot dsh-cron-dotOn",
	dotOff: "dsh-cron-dot dsh-cron-dotOff",
	dot_delivered: "dsh-cron-dot dsh-cron-dotDelivered",
	dot_running: "dsh-cron-dot dsh-cron-dotRunning",
	dot_completed: "dsh-cron-dot dsh-cron-dotCompleted",
	dot_failed: "dsh-cron-dot dsh-cron-dotFailed"
};
const css = `
/* header trigger */
.dsh-cron-trigger {
  min-height: 28px; color: var(--dsw-alias-label-tertiary, #888); cursor: pointer;
  background: 0; border: 0; border-radius: 6px; align-items: center; gap: 3px;
  padding: 3px 6px; font-size: 12px; line-height: 18px; display: inline-flex;
}
.dsh-cron-trigger:hover, .dsh-cron-trigger:focus-visible { color: var(--dsw-alias-label-secondary, #555); }
.dsh-cron-triggerActive { color: var(--dsw-alias-label-primary, #222); background: var(--dsw-alias-fill-l2, #f2f2f2); }
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
`;

//#endregion
//#region src/client/index.tsx
/** Services required from the client runtime. */
const inject = ["slots", "locale"];
let drawerOpen = false;
let enabledCount = 0;
let snapshot = {
	open: drawerOpen,
	count: enabledCount
};
const storeListeners = /* @__PURE__ */ new Set();
function storeSubscribe(listener) {
	storeListeners.add(listener);
	return () => {
		storeListeners.delete(listener);
	};
}
function storeNotify() {
	snapshot = {
		open: drawerOpen,
		count: enabledCount
	};
	for (const listener of storeListeners) listener();
}
function setDrawerOpen(open) {
	if (drawerOpen === open) return;
	drawerOpen = open;
	storeNotify();
}
function setEnabledCount(count) {
	if (enabledCount === count) return;
	enabledCount = count;
	storeNotify();
}
function useDrawerState() {
	return (0, react.useSyncExternalStore)(storeSubscribe, () => snapshot);
}
async function api(method, payload) {
	const res = await fetch(`/cron/api/${method}`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(payload ?? {})
	});
	const data = await res.json().catch(() => null);
	if (!data?.ok) throw new Error(data?.error?.message ?? `request failed (${res.status})`);
	return data.result;
}
/** Fallback translator when a slot supplies no locale seat: zh + {param} interpolation. */
const fallbackT = (key, params) => (zh[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => String(params?.[name] ?? ""));
function formatTime(iso) {
	if (!iso) return "—";
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return iso;
	return d.toLocaleString();
}
function scheduleText(task, t) {
	if (task.schedule.at) return t("schedule.at", { time: formatTime(task.schedule.at) });
	if (task.schedule.everySeconds != null) {
		const seconds = task.schedule.everySeconds;
		if (seconds % 3600 === 0) return t("schedule.every.hours", { count: seconds / 3600 });
		if (seconds % 60 === 0) return t("schedule.every.minutes", { count: seconds / 60 });
		return t("schedule.every.seconds", { count: seconds });
	}
	if (task.schedule.daily) return t("schedule.daily", { time: task.schedule.daily });
	if (task.schedule.cron) return t("schedule.cron", { expr: task.schedule.cron });
	return "";
}
function durationText(record, t) {
	if (record.startedAt == null || record.completedAt == null) return "";
	const seconds = Math.max(0, Math.round((record.completedAt - record.startedAt) / 1e3));
	if (seconds < 60) return t("duration.seconds", { count: seconds });
	return t("duration.minutes", {
		count: Math.floor(seconds / 60),
		seconds: seconds % 60
	});
}
function ruleOf(task) {
	if (task.schedule.cron) return "cron";
	if (task.schedule.daily) return "daily";
	if (task.schedule.everySeconds != null) return "every";
	return "at";
}
function ruleValueOf(task) {
	if (task.schedule.cron) return task.schedule.cron;
	if (task.schedule.daily) return task.schedule.daily;
	if (task.schedule.everySeconds != null) return String(task.schedule.everySeconds);
	return task.schedule.at ?? "";
}
/** Inline editor for one dynamic task (prompt + schedule rule). */
function EditTaskForm({ t, task, onDone }) {
	const [form, setForm] = (0, react.useState)({
		prompt: task.prompt,
		rule: ruleOf(task),
		value: ruleValueOf(task)
	});
	const [error, setError] = (0, react.useState)("");
	const [busy, setBusy] = (0, react.useState)(false);
	const submit = async () => {
		setBusy(true);
		setError("");
		try {
			const payload = {
				id: task.id,
				prompt: form.prompt.trim()
			};
			if (form.rule === "daily") payload.daily = form.value.trim();
			else if (form.rule === "every") payload.every = Number(form.value.trim());
			else if (form.rule === "cron") payload.cron = form.value.trim();
			else payload.at = form.value.trim();
			await api("update", payload);
			onDone();
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setBusy(false);
		}
	};
	const valuePlaceholder = t(`form.value.${form.rule}`);
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: styles.form,
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
				className: styles.textarea,
				value: form.prompt,
				placeholder: t("form.prompt"),
				rows: 2,
				onChange: (e) => setForm({
					...form,
					prompt: e.target.value
				})
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: styles.formRow,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
					className: styles.select,
					value: form.rule,
					onChange: (e) => setForm({
						...form,
						rule: e.target.value,
						value: ""
					}),
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
							value: "daily",
							children: t("form.rule.daily")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
							value: "every",
							children: t("form.rule.every")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
							value: "cron",
							children: t("form.rule.cron")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
							value: "at",
							children: t("form.rule.at")
						})
					]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
					className: styles.input,
					value: form.value,
					placeholder: valuePlaceholder,
					onChange: (e) => setForm({
						...form,
						value: e.target.value
					})
				})]
			}),
			error ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: styles.error,
				children: error
			}) : null,
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: styles.formRow,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: styles.primaryButton,
					disabled: busy || form.prompt.trim() === "" || form.value.trim() === "",
					onClick: () => void submit(),
					children: t("action.save")
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: styles.ghostButton,
					onClick: onDone,
					children: t("action.cancel")
				})]
			})
		]
	});
}
function CronPanel({ t }) {
	const [tab, setTab] = (0, react.useState)("tasks");
	const [tasks, setTasks] = (0, react.useState)([]);
	const [records, setRecords] = (0, react.useState)([]);
	const [error, setError] = (0, react.useState)("");
	const [editingId, setEditingId] = (0, react.useState)(null);
	const refresh = (0, react.useCallback)(async () => {
		try {
			const [listResult, historyResult] = await Promise.all([api("list"), api("history", { limit: 50 })]);
			setTasks(listResult.tasks);
			setRecords(historyResult.records);
			setEnabledCount(listResult.tasks.filter((task) => task.enabled).length);
			setError("");
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		}
	}, []);
	(0, react.useEffect)(() => {
		refresh();
		const timer = setInterval(() => void refresh(), 1e4);
		return () => clearInterval(timer);
	}, [refresh]);
	const act = async (method, payload) => {
		try {
			await api(method, payload);
			await refresh();
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		}
	};
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
		/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			className: styles.tabs,
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				className: tab === "tasks" ? styles.tabActive : styles.tab,
				onClick: () => setTab("tasks"),
				children: t("tab.tasks")
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				className: tab === "history" ? styles.tabActive : styles.tab,
				onClick: () => setTab("history"),
				children: t("tab.history")
			})]
		}),
		error ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
			className: styles.error,
			children: error
		}) : null,
		/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
			className: styles.body,
			children: tab === "tasks" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: styles.list,
				children: [tasks.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: styles.empty,
					children: t("tasks.empty")
				}) : null, tasks.map((task) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: task.enabled ? styles.row : styles.rowDisabled,
					children: editingId === task.id ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(EditTaskForm, {
						t,
						task,
						onDone: () => {
							setEditingId(null);
							refresh();
						}
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: styles.rowHead,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: task.enabled ? styles.dotOn : styles.dotOff }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: styles.taskId,
									children: task.id
								}),
								task.sessionId ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: styles.badge,
									title: t("task.boundTo", { id: task.sessionId }),
									children: t("task.bound")
								}) : null,
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: styles.badge,
									children: t(`origin.${task.origin}`)
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: styles.prompt,
							title: task.prompt,
							children: task.prompt
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: styles.meta,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: scheduleText(task, t) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("task.next", { time: formatTime(task.nextRunAt) }) })]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: styles.actions,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: styles.action,
									onClick: () => void act("run", { id: task.id }),
									children: t("action.run")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: styles.action,
									onClick: () => void act("toggle", {
										id: task.id,
										enabled: !task.enabled
									}),
									children: task.enabled ? t("action.pause") : t("action.resume")
								}),
								task.origin === "dynamic" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: styles.action,
									onClick: () => setEditingId(task.id),
									children: t("action.edit")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: styles.actionDanger,
									onClick: () => void act("remove", { id: task.id }),
									children: t("action.remove")
								})] }) : null
							]
						})
					] })
				}, task.id))]
			}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: styles.list,
				children: [records.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: styles.empty,
					children: t("history.empty")
				}) : null, records.map((record) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: styles.row,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: styles.rowHead,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: styles[`dot_${record.status}`] ?? styles.dotOff }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: styles.taskId,
									children: record.taskId
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: styles.badge,
									children: t(`history.status.${record.status}`)
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: styles.time,
									children: formatTime(record.firedAt)
								})
							]
						}),
						record.excerpt ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: styles.prompt,
							title: record.excerpt,
							children: record.excerpt
						}) : null,
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: styles.meta,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("history.scheduled", { time: formatTime(record.scheduledFor) }) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: durationText(record, t) })]
						})
					]
				}, record.id))]
			})
		})
	] });
}
function CronDrawer({ t }) {
	const tr = t ?? fallbackT;
	const { open } = useDrawerState();
	(0, react.useEffect)(() => {
		if (!open) return;
		const onKeyDown = (event) => {
			if (event.key === "Escape") setDrawerOpen(false);
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [open]);
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
		className: open ? styles.maskOpen : styles.mask,
		onClick: () => setDrawerOpen(false),
		"aria-hidden": "true"
	}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("aside", {
		className: open ? styles.drawerOpen : styles.drawer,
		"aria-hidden": !open,
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			className: styles.drawerHead,
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: styles.drawerTitle,
				children: tr("trigger.aria")
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				className: styles.drawerClose,
				"aria-label": tr("drawer.close"),
				onClick: () => setDrawerOpen(false),
				children: "×"
			})]
		}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CronPanel, { t: tr })]
	})] });
}
function CronAction({ t }) {
	const tr = t ?? fallbackT;
	const { open, count } = useDrawerState();
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
		type: "button",
		className: open ? styles.triggerActive : styles.trigger,
		"aria-expanded": open,
		"aria-label": tr("trigger.aria"),
		title: tr("trigger.aria"),
		onClick: () => setDrawerOpen(!open),
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
			width: "14",
			height: "14",
			viewBox: "0 0 24 24",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round",
			"aria-hidden": "true",
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
				cx: "12",
				cy: "12",
				r: "10"
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("polyline", { points: "12 6 12 12 16 14" })]
		}), count > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
			className: styles.count,
			children: count
		}) : null]
	});
}
/** Client plugin body: dictionaries, styles, header trigger, and the drawer. */
function apply(ctx) {
	ctx.effect(() => ctx.locale.register("cron", {
		zh,
		en
	}), "dsh-cron: dictionaries");
	ctx.effect(() => {
		const tag = document.createElement("style");
		tag.dataset.plugin = "dsh-cron";
		tag.textContent = css;
		document.head.append(tag);
		return () => tag.remove();
	}, "dsh-cron: styles");
	ctx.slots.inject("conversation.session.header.utilities", () => ctx.slots.register({
		name: "conversation.session.header.utilities",
		id: "cron-trigger",
		order: -50,
		locale: "cron"
	}, CronAction));
	ctx.slots.inject("shell.overlay", () => ctx.slots.register({
		name: "shell.overlay",
		id: "cron-drawer",
		order: 100,
		locale: "cron"
	}, CronDrawer));
}

//#endregion
exports.apply = apply;
exports.inject = inject;
		return module.exports;
	}
});
