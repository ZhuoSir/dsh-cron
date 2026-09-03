# dsh-cron

> 此 fork 面向受控 DSH 0.1.1-rc.2 及官方 Core 0.1.2-rc.1 提供严格的既有 Session 自动化：绑定任务在 Session 冷却时恢复原 Session，绝不回退到其他 Session；支持 IANA 时区，并让 Session Header 抽屉只显示当前 Session 的任务和历史。

> 定时任务插件：让 DeepSeek Harness 在指定时间自动执行任务——到点把任务提示注入会话，Agent 被唤醒后自动执行并在会话中回复结果。自带 Web 管理抽屉（任务列表 + 执行记录）。

[![Listed on dsh-plugin.org](https://dsh-plugin.org/badges/listed.svg)](https://dsh-plugin.org/plugins/zhuosir/dsh-cron) ![许可证](https://img.shields.io/badge/license-MIT-blue) ![DSH](https://img.shields.io/badge/dsh-0.1.2--rc.1-blueviolet) ![Node](https://img.shields.io/badge/node-%5E22.19%20%7C%7C%20%3E%3D24-green)

**English summary**: Scheduled tasks for DeepSeek Harness. Create tasks in chat with natural language ("every Monday 9am remind me…"), the agent converts them to `at` / `every` / `daily` / 5-field `cron` rules, fires them back into the session that created them, and replies with results in conversation. Ships a right-side drawer in the Web UI (task list + run history). MIT licensed with no install scripts; scheduled prompts use the owning Session's configured model provider.

## 截图

![定时任务抽屉](docs/screenshot-drawer.svg)

> 上图为**示意图**（schematic），忠实反映实际 UI 结构：会话头部右侧的「🕐 定时任务」按钮 + 右侧滑出抽屉（任务 / 执行记录两个 Tab）。欢迎替换为真实截图（`docs/` 目录，PNG 亦可）。

## 安装

**从 GitHub 安装（推荐使用已验证的不可变 tag）**：

```sh
dsh plugin --profile web add github:cloga/dsh-cron#v0.4.0
```

不带 tag 的 `github:cloga/dsh-cron` 会跟随移动的默认分支，只用于开发，不作为部署验证证据。

**本地 / tarball 安装**：

```sh
dsh plugin --profile web add ./dsh-cron            # 本地目录（开发用 link）
dsh plugin --profile web add ./dsh-cron-0.4.0.tgz  # pnpm pack 产物
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

会话头部右侧的「🕐 定时任务」按钮（带任务数与未读徽标）打开右侧抽屉：**任务 Tab**（查看/编辑/立即执行/暂停/删除）与**执行记录 Tab**（每次触发的状态、耗时、结果摘要）。

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

可靠性设计：任务运行记录持久化（重启不重发，遗留 `delivered`/`running` 记录转为 `interrupted`）、`daily` 错过补发一次、所有回调入口有防崩溃包裹（插件故障不会拖垮宿主进程）。会话绑定严格固定：目标 Session 无法恢复时保留逾期任务并在后续 tick 重试，绝不投递到其他 Session；持久化 header 标记为 `origin: subagent` 或 `delegationDepth > 0` 时拒绝 cold resume。

## 兼容性

| 项目 | 要求 |
|---|---|
| DeepSeek Harness | 受控 `0.1.1-rc.2`；官方 `0.1.2-rc.1` 精确 commit `a66e4702047846cdaa10c66c9d3df3951f5ea70d`；peer range 排除未验证的 `0.1.2` stable |
| Node.js | `^22.19.0 || >=24.0.0` |
| 平台 | macOS 已实测（含原生通知）；Linux 预期可用（通知需 `notify-send`）；Windows 调度/面板可用但无原生通知 |
| 浏览器 | 跟随 DSH Web 壳（现代浏览器，React 18 运行时由壳提供） |
| 主题 | 使用当前公开的 DSH background / label / border / state tokens；亮色和暗色均经过浏览器验证，token 缺失时回退到 `color-scheme` 感知的系统色 |
| pnpm | 开发与发布固定 `pnpm@11.7.0`；安装使用不运行构建脚本 |

与其他插件共存：无已知冲突；会话头部使用 `order: -50` 与 dsh-session-manager 的按钮（-40/-30/-10）相邻。

## 工作原理

- 触发时通过 `agent.followup()` 向任务绑定的会话注入一条 `source: plugin` 的用户消息，Agent 将其作为普通一轮对话执行；Agent 忙时任务排队，不会并发重叠。
- 消息带有 `[cron]` 框架，明确告知模型这是自动化任务而非用户输入。
- **执行记录关联**：注入的消息 id 与会话事件流（`session/event`）精确匹配——消息进入会话 → `running`，assistant 回复 → 截取摘要，`turn/end` → 按结束原因记 `completed`/`failed`。
- 运行记录（`lastRunAt`/`firedAt`）、启停覆盖、执行历史均持久化，重启后不会重复触发已消费的时段；遗留非终态运行会转为 `interrupted`；`daily` 任务错过当天时段会补发一次。

## 开发

```sh
pnpm install
pnpm build        # tsdown 直接产出 __ModuleLoader__ 格式；watch 与一次性 build 完全一致
pnpm typecheck
pnpm test         # host ownership/restart + client bundle/DOM + rc.1 source 兼容
DSH_CORE_PATH=/path/to/dsh-rc1 pnpm test:core  # 要求官方 rc.1 精确 commit
pnpm verify       # typecheck + build + tests + freshness/pack smoke
```

开发依赖保留在可用的受控 `0.1.1-rc.2` 编译闭包；官方 feed 尚未提供全部 rc.1 子包。发布前设置 `DSH_CORE_PATH` 指向官方 rc.1 source checkout；`test:core` 校验精确 commit，并区分 live `Session.snapshotEvents()` / `ownEvents()` / `eventAt()` 与冷态 `SessionInspection.events`。Host 所有权、HTTP 所有权、重启恢复、Client 注册/交互及打包新鲜度分别由 `host.test.mjs`、`client.test.mjs`、`toast-render.test.mjs`、`core-compat.test.mjs` 和 `package.test.mjs` 覆盖。

**结构**：单 npm 包、host/client 双半——host（`index.js`）：调度器 + 工具 + `/cron/api` 路由 + 历史采集；client（`src/client/` → `lib/client.js`）：会话头部按钮 + 右侧抽屉。

## Known Limitations and Deferred Work

- Client 的 module-level drawer store 仍由两个 Slot render tree 共享。本次只加入 Session owner 传递与过滤，没有进行不必要的完整 UI store 重构。
- 当前调度/时区解析保留既有覆盖；更深的 fake-timer、DST 跳变与跨时区属性测试留作后续独立工作，不在 rc.1 API/授权适配中做不完整扩展。
- HTTP owner 来自受 loopback/trusted-host 与 same-origin 检查保护的本地 Client 请求；它阻止正常 API 操作跨 Session，但不是面向恶意本机进程的身份认证协议。

## 许可证

[MIT](LICENSE) © 2026 dsh-cron contributors

---

**反馈与问题**：[GitHub Issues](https://github.com/cloga/dsh-cron/issues)
