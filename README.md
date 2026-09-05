# dsh-cron

> 此 fork 面向受控 DSH 0.1.1-rc.2、官方 Core 0.1.2-rc.1 及 0.1.3-alpha.1 提供严格的既有 Session 自动化：绑定任务在 Session 冷却时恢复原 Session，绝不回退到其他 Session；支持 IANA 时区，并让 Session Header 抽屉只显示当前 Session 的任务和历史。

> 定时任务插件：让 DeepSeek Harness 在指定时间自动执行任务——到点把任务提示注入会话，Agent 被唤醒后自动执行并在会话中回复结果。自带 Web 管理抽屉（任务列表 + 执行记录）。

[![Listed on dsh-plugin.org](https://dsh-plugin.org/badges/listed.svg)](https://dsh-plugin.org/plugins/zhuosir/dsh-cron) ![许可证](https://img.shields.io/badge/license-MIT-blue) ![DSH](https://img.shields.io/badge/dsh-0.1.3--alpha.1-blueviolet) ![Node](https://img.shields.io/badge/node-%5E22.19%20%7C%7C%20%3E%3D24-green)

**English summary**: Scheduled tasks for DeepSeek Harness. Create tasks in chat with natural language ("every Monday 9am remind me…"), the agent converts them to `at` / `every` / `daily` / 5-field `cron` rules, fires them back into the session that created them, and replies with results in conversation. Ships a right-side drawer in the Web UI (task list + run history). MIT licensed with no install scripts; scheduled prompts use the owning Session's configured model provider.

## 截图

![定时任务抽屉](docs/screenshot-drawer.svg)

> 上图为**示意图**（schematic），忠实反映实际 UI 结构：会话头部右侧的「🕐 定时任务」按钮 + 右侧滑出抽屉（任务 / 执行记录两个 Tab）。欢迎替换为真实截图（`docs/` 目录，PNG 亦可）。

## 安装

**从 GitHub 安装（推荐使用已验证的不可变 tag）**：

```sh
dsh plugin --profile web add github:cloga/dsh-cron#v0.4.4
```

已安装旧版时也使用上面的 `add` 命令切换到指定版本，无需先卸载。不要用不带版本的 `update` 代替固定 tag 升级。

不带 tag 的 `github:cloga/dsh-cron` 会跟随移动的默认分支，只用于开发，不作为部署验证证据。

**本地 / tarball 安装**：

```sh
dsh plugin --profile web add ./dsh-cron            # 本地目录（开发用 link）
dsh plugin --profile web add ./dsh-cron-0.4.4.tgz  # Release 下载或 pnpm pack 产物
```

**验证与卸载**：

```sh
dsh --profile web --dump-config   # 应能看到 "# == dsh-cron" 配置层
dsh plugin --profile web remove dsh-cron
```

安装后需在**没有其他运行中 Session** 时重启 `dsh web`，再硬刷新浏览器（Cmd/Ctrl+Shift+R）；有其他 Session 时先保持“已安装、待激活”，不要为插件安装中断 Host。仓库已提交 client 半构建产物（`lib/client.js`），因此 GitHub 安装**不需要任何构建授权**（无 `prepare` 脚本，pnpm ≥10 的 `allowBuilds` 授权与此插件无关）。

## 支持的 profile

| Profile | 支持情况 |
|---|---|
| **web**（`dsh web` / Desktop Web profile） | ✅ 完整功能：调度 + 工具 + 管理抽屉 + 执行记录 |
| **headless**（`dsh` 一次性运行） | ❌ 不支持持久调度；0.1.2 headless 组合不挂载 `agentPresets`，且一次性进程会在当前任务结束后退出 |

HTTP API 通过可选注入挂载（`ctx.inject(['webServer','webRuntime'])`）。不过 Host 调度器本身还依赖常驻进程和 Web profile 提供的 Agent Preset 服务，所以“没有 Web 面板”不等于 headless 可以在未来定时执行。

## 用法

**在对话中直接说**（推荐）：「每周一早上 9 点提醒我交周报」「每半小时检查一次构建」——Agent 会把自然语言转成调度规则并自动创建任务。到点后任务回到**创建它的会话**执行，结果直接在会话中回复。

**调度规则**（每个任务四选一）：

| 字段 | 含义 | 示例 |
|---|---|---|
| `at` | 一次性，ISO 8601 时间 | `"2026-08-23T09:00:00+08:00"` |
| `every` | 固定间隔（秒，最小 10） | `3600` |
| `daily` | 每天本地时间 `HH:MM` | `"09:30"` |
| `cron` | 标准 5 段 cron 表达式（分 时 日 月 周，本地时间） | `"0 9 * * 1"` = 每周一 09:00 |

**也可以在配置中静态声明**（`~/.dsh/profiles/web/cordis.patch.yml`）：

```yaml
- insert:
    - id: dsh-cron
      name: dsh-cron
      config:
        tickSeconds: 15
        tasks:
          - id: morning-briefing
            sessionId: '<explicit-root-session-id>'
            prompt: '总结今天的待办事项，给我一份晨报'
            daily: '09:00'
```

**模型工具**：`cron_list` / `cron_add` / `cron_update` / `cron_remove` / `cron_history`。每次调用都从 `ToolRunContext.exec.agent` 取得 live root Session；list/history/add/update/remove 只能访问该 Session 的任务，子代理或无 Agent 的调用会被拒绝。


## Web 面板与通知

会话头部右侧的「定时任务」按钮保留任务数与未读徽标。面板包含 **任务**（查看/编辑/立即执行/暂停/删除）与 **执行记录**（每次触发的状态、耗时、结果摘要）。

### 可选 Better Sidebar 集成（从 v0.4.4 起）

此功能虽在 PR #18 中合并，但不在不可变的 `v0.4.3` 中；`v0.4.4` 才是首次包含它的发布版本。Sidebar 的「Tasks」子代理面板与 Cron「定时任务」标签页是不同功能。

- 检测到兼容的 Better Sidebar Client Service 时，Cron 注册独立的「定时任务」标签页。仅改 Cron，不需要修改或强制安装 Better Sidebar。
- 头部按钮和当前会话通知直接定位到标签页；已有标签页会复用。通过公开 `createTab` 补丁展开其所在的右侧/底部面板；窄屏展开合并抽屉；已分离的浮窗不会额外展开其他面板。
- 适配器按 Better Sidebar **0.18.0** 的公开 `registerTab` / `createTab` / `openTab` 合同实现，并检查版本及 `targetedOpen` / `floatWindows` 能力。不导入 Sidebar 的私有组件、样式、按钮或运行时模块。
- 未安装、版本不支持、标签页被禁用或服务卸载时，入口回退到独立面板。独立面板使用浏览器原生 modal dialog/top layer，支持 Escape、外部点击关闭、焦点恢复，不再通过超大 `z-index` 与侧栏争抢层级。
- 标签页使用 Sidebar 提供的 Session scope；任务、历史、选择的子页和徽标按 Session 隔离。隐藏的标签页停止面板轮询；切换会话时重新初始化活动通知基线，忽略过期面板响应。
- 来自其他会话的旧通知打开标明原 Session 的独立面板，不将原会话任务塞进当前会话的侧栏，也不静默切换用户会话。
- 通知开关及测试按钮归入「通知设置」，避免挤占面板标题栏。调度器、存储及 Host API 授权边界保持不变。

安装新的构建产物后，仍需按上面的安全激活流程使 Client bundle 生效；修改工作树本身不会更新正在运行的 GUI。

**四级通知**（按覆盖范围递增）：

| 通道 | 触发时机 | 覆盖场景 | 开关 |
|---|---|---|---|
| 未读徽标 | 完成/失败 | 当前页面 | 打开抽屉自动清零 |
| 页面 Toast | 完成（8s 自动消失）/失败（常驻） | 当前页面，点击直达执行记录 | 始终开启 |
| 提示音 | 完成/失败（WebAudio 合成双音和弦，无音频文件） | 当前页面 | 抽屉 🔊/🔇 静音开关（localStorage 持久化） |
| 浏览器系统通知 | 完成/失败 | **DSH 标签页在后台**也能收到 | 抽屉 🔔 开关（需授权通知权限） |
| 操作系统原生通知 | 完成/失败（macOS `osascript` Glass 音效 / Linux `notify-send`） | **浏览器完全没打开**也能收到 | 配置 `systemNotify` / `systemNotifySound` |

## 权限说明

安装和使用本插件意味着授予以下能力，请据此评估：

| 能力 | 说明 | 风险面 |
|---|---|---|
| **驱动 Agent 自动执行** | 触发时向会话注入 `source: plugin` 的用户消息（`agent.followup`），Agent 将其作为普通一轮对话执行 | ⚠️ **每次触发都是真实模型调用，消耗 token**；任务质量取决于你的 prompt；Agent 拥有的工具权限（如 bash）在任务执行时同样生效 |
| **本地文件读写** | 仅两个文件：`$DSH_HOME/cron-tasks.json`（任务）和 `$DSH_HOME/cron-history.jsonl`（执行记录，500 条封顶），均可用配置覆盖路径 | 低；原子写入（tmp + rename），不读写其他位置 |
| **HTTP API** | `POST /cron/api/*` 仅接受 loopback 或 `trustedHosts` 来源，并要求每个 list/history/add/update/remove/toggle/run 请求携带当前 live root Session owner；目标任务必须属于该 Session | 冷态或 subagent Session 不能通过 HTTP 管理；同一请求不能跨 Session 读取或修改任务 |
| **网络访问** | 插件 Host 不直接请求外网；任务触发后 prompt 会交给该 Session 配置的模型 provider | 与普通模型轮次相同，可能向外部 LLM 发送任务内容并消耗 token |
| **安装脚本** | ❌ 无 `prepare`/`postinstall` 等任何安装期脚本 | 无（GitHub 安装不需要构建授权） |
| **Shell / 系统命令** | ⚠️ 仅用于系统通知：macOS 调 `osascript -e 'display notification …'`、Linux 调 `notify-send`；可用 `systemNotify: false` 完全关闭 | 低；命令固定无注入面（参数经 JSON 转义） |

可靠性设计：任务运行记录持久化（重启不重发，遗留 `delivered`/`running` 记录转为 `interrupted`）、`daily` 错过补发一次、所有回调入口有防崩溃包裹（插件故障不会拖垮宿主进程）。会话绑定严格固定：目标 Session 无法恢复时保留逾期任务并在后续 tick 重试，绝不投递到其他 Session；持久化 header 标记为 `origin: subagent` 或 `delegationDepth > 0` 时拒绝 cold resume。Core 0.1.3-alpha.1 使用 `list()` snapshot 的 `snapshot.header`，再以 `open(id, 'read')` / `handle.read()` 读取，并在 `finally` 中关闭 handle；旧 Core 仅在运行时 API 形状没有 `open()` 时回退到 header 列表与 `inspect()`，不会把新接口的读取或关闭错误降级为旧接口。若 `handle.close()` 失败，本次 cold resume 失败并保留逾期任务供后续 tick 重试。

## 兼容性

| 项目 | 要求 |
|---|---|
| DeepSeek Harness | 受控 `0.1.1-rc.2`；官方 `0.1.2-rc.1`；官方 `0.1.3-alpha.1` 精确 commit `d347e703908d0406b7a7ef80e3a0e594d86b2215`；peer range 仅包含这些已验证发布线 |
| Node.js | `^22.19.0 || >=24.0.0` |
| 平台 | macOS 已实测（含原生通知）；Linux 预期可用（通知需 `notify-send`）；Windows 调度/面板可用但无原生通知 |
| 浏览器 | 跟随 DSH Web 壳（现代浏览器，React 18 运行时由壳提供） |
| 主题 | 使用当前公开的 DSH background / label / border / state tokens；亮色和暗色均经过浏览器验证，token 缺失时回退到 `color-scheme` 感知的系统色 |
| pnpm | 开发与发布固定 `pnpm@11.7.0`；安装使用不运行构建脚本 |

与其他插件共存：从 v0.4.4 起提供上述 Better Sidebar 可选集成，修复独立抽屉与侧栏控件的层叠冲突；会话头部继续使用 `order: -50` 与 dsh-session-manager 的按钮（-40/-30/-10）相邻。

### Better Sidebar 收回按钮兼容修复（v0.4.3）

`dsh-tauri 0.6.7` 为隐藏左侧栏重复按钮，使用了全局 `Collapse sidebar` / `收起侧边栏` 标签选择器；它也会隐藏 `Better Sidebar 0.18.0` 展开后的同名右侧收回按钮（英文界面可复现）。本项目在 Client 样式中附带一个局部兼容覆盖，仅恢复 `[data-dsh-panel-host] [data-dsh-toggle-cluster]` 内匹配的原生按钮。

- 原生展开/收回动作、标签页、编辑器及 Session 状态不变；左侧栏和底部面板不受影响。
- 无需额外安装 Better Sidebar 依赖；未安装时选择器不匹配，不产生额外 UI。
- 与 Cron 样式共同加载和卸载，不修改 DSH / Better Sidebar 的安装源码或用户配置。
- 从 `v0.4.3` 起包含此修复；按安装章节固定版本安装，在安全时机重启并刷新。仅修改本仓库不会自动更新正在运行的 Desktop。
- 待 dsh-tauri 将隐藏规则限定到左侧导航后可移除此覆盖。此项不是 Cron 标签页集成（另见 issue #15）。

## 工作原理

- 触发时通过 `agent.followup()` 向任务绑定的会话注入一条 `source: plugin` 的用户消息，Agent 将其作为普通一轮对话执行；Agent 忙时任务排队，不会并发重叠。
- 消息带有 `[cron]` 框架，明确告知模型这是自动化任务而非用户输入。
- **执行记录关联**：注入的消息 id 与会话事件流（`session/event`）精确匹配——消息进入会话 → `running`，assistant 回复 → 截取摘要，`turn/end` → 按结束原因记 `completed`/`failed`。
- 运行记录（`lastRunAt`/`firedAt`）、启停覆盖、执行历史均持久化，重启后不会重复触发已消费的时段；遗留非终态运行会转为 `interrupted`；`daily` 任务错过当天时段会补发一次。

## 面向 Agent 的开发与发布

代理开始工作先读 [`AGENTS.md`](AGENTS.md)，架构、测试层级和故障排查见 [`docs/agentic-readiness.md`](docs/agentic-readiness.md)。重要 PR 必须同时递增版本、更新 changelog 和安装说明；`release-ready` 汇总所有 CI，主分支通过后自动调用发布流程。**合并不等于发布，发布不等于本机已生效。** 代理需持续负责到不可变 Release、校验值和隔离安装验证完成，不能等用户再次提醒。流程及同一提交重试方法见 [`RELEASE.md`](RELEASE.md)。

```sh
pnpm test:release                  # 离线发布策略、故障恢复与工作流连接测试
pnpm release:check --base origin/main # 提交候选变更后检查版本与安装说明
```

## 开发

```sh
pnpm install
pnpm build        # tsdown 直接产出 __ModuleLoader__ 格式；watch 与一次性 build 完全一致
pnpm typecheck
pnpm test         # host ownership/restart + client bundle/DOM + Core 兼容
DSH_CORE_PATH=/path/to/dsh-0.1.3-alpha.1 pnpm test:core  # 校验官方 alpha.1 精确 commit 与 handle API
pnpm verify       # typecheck + build + tests + freshness/pack smoke
pnpm exec playwright install chromium   # 首次浏览器回归测试
pnpm test:sidebar # 收回按钮兼容 + Cron 标签页/dialog/焦点/通知/窄屏；CI 单独运行
```

可选的额外验证（不会访问真实任务 API 或修改正在运行的 GUI）：

- `node tests/sidebar-contract.test.mjs`：先设置 `DSH_BETTER_SIDEBAR_PATH` 指向带 `src/client` 的 Better Sidebar **0.18.0** 包目录；使用真实 Sidebar reducer 和 Cordis 验证去重、嵌套分屏、浮窗、会话定位及可选服务装卸。
- `node tests/browser.test.mjs`：也可单独运行已纳入 `pnpm test:sidebar` 的交互测试；使用开发依赖 `@playwright/test` 与已安装的 Chromium，可用 `DSH_PLAYWRIGHT_MODULE` 指向已有 `playwright/index.mjs`，用 `DSH_CHROMIUM_EXECUTABLE` 指定已有浏览器可执行文件。测试使用隔离的 React 页面和模拟 Sidebar 容器，验证原生 modal、焦点、通知点击及亮/暗/窄屏布局，不等同于当前 GUI 的部署验证。
- 浏览器截图及结果默认写入临时目录，或用 `DSH_BROWSER_ARTIFACTS` 指定输出目录。这些测试工具无需成为 Cron 的运行时依赖。

开发依赖保留在可用的受控 `0.1.1-rc.2` 编译闭包。发布前设置 `DSH_CORE_PATH` 指向官方 `0.1.2-rc.1` 或 `0.1.3-alpha.1` source checkout；`test:core` 校验对应精确 commit，并验证旧 `inspect()` seam 或 alpha.1 的 snapshot + read handle seam。Host 所有权、HTTP 所有权、重启恢复、Client 注册/交互及打包新鲜度分别由 `host.test.mjs`、`client.test.mjs`、`toast-render.test.mjs`、`core-compat.test.mjs` 和 `package.test.mjs` 覆盖。

**结构**：单 npm 包、host/client 双半——host（`index.js`）：调度器 + 工具 + `/cron/api` 路由 + 历史采集；client（`src/client/` → `lib/client.js`）：会话头部按钮 + 右侧抽屉。

## Known Limitations and Deferred Work

- Client 的 module-level drawer store 仍由两个 Slot render tree 共享。本次只加入 Session owner 传递与过滤，没有进行不必要的完整 UI store 重构。
- 当前调度/时区解析保留既有覆盖；更深的 fake-timer、DST 跳变与跨时区属性测试留作后续独立工作，不在 rc.1 API/授权适配中做不完整扩展。
- HTTP owner 来自受 loopback/trusted-host 与 same-origin 检查保护的本地 Client 请求；它阻止正常 API 操作跨 Session，但不是面向恶意本机进程的身份认证协议。

## 许可证

[MIT](LICENSE) © 2026 dsh-cron contributors

---

**反馈与问题**：[GitHub Issues](https://github.com/cloga/dsh-cron/issues)
