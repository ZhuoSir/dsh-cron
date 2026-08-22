# dsh-cron

定时任务插件：让 DeepSeek Harness 在指定时间自动把任务提示注入当前会话，Agent 被唤醒后自动执行。自带 Web 管理面板（任务列表 + 执行记录）。

## 调度规则（每个任务四选一）

| 字段 | 含义 | 示例 |
|---|---|---|
| `at` | 一次性，ISO 8601 时间 | `"2026-08-23T09:00:00+08:00"` |
| `every` | 固定间隔（秒，最小 60） | `3600` |
| `daily` | 每天本地时间 `HH:MM` | `"09:30"` |
| `cron` | 标准 5 段 cron 表达式（分 时 日 月 周，本地时间） | `"0 9 * * 1"` = 每周一 09:00 |

## 安装

```sh
dsh plugin --profile <profile> add ./dsh-cron
# 重启 dsh web 后生效（host 半改动需要重启；client 半改动硬刷新浏览器即可）
```

## 用法

**在对话中直接说**（推荐）：「每周一早上 9 点提醒我交周报」「每半小时检查一次构建」——Agent 会自动把自然语言转成调度规则并调用 `cron_add` 创建任务。到点后任务提示注入会话，**执行结果直接在会话中回复**。

**会话绑定**：任务创建时自动绑定当前会话，触发时回到**创建它的那个窗口**执行回复——不会跑到你当前打开的窗口里。绑定会话被关闭后才回退到活跃会话（并记日志）。面板中绑定任务显示「绑定会话」徽标；config 任务也可以用 `sessionId` 字段显式绑定。

## Web 面板

会话头部右侧出现 ⏰ 按钮（带启用中的任务数），点击从右侧滑出抽屉：

- **任务 Tab**：查看所有任务（规则、下次触发、来源、状态）；动态任务支持 **编辑 / 立即执行 / 暂停 / 删除**，config 声明的任务可暂停/恢复
- **执行记录 Tab**：每次触发一条记录——投递时间、执行状态（已投递/执行中/已完成/失败）、耗时、Agent 回复摘要

面板数据通过 host 半注册的 `POST /cron/api/<method>` 读写（带 loopback/trustedHosts 信任围栏）。

## 配置（可选）

在 profile 的 `cordis.patch.yml` 中声明静态任务：

```yaml
- insert:
    - id: dsh-cron
      name: dsh-cron
      config:
        tickSeconds: 15
        tasks:
          - id: morning-briefing
            prompt: '总结今天的待办事项，给我一份晨报'
            daily: '09:00'
          - id: check-build
            prompt: '检查工作区的构建状态，失败就修复'
            every: 1800
```

## 运行时管理（模型工具）

插件注册五个工具，Agent 在对话中用它们管理任务：

- `cron_list` — 列出所有任务及下次触发时间
- `cron_add` — 新增任务（支持 cron 表达式；持久化，重启不丢）
- `cron_update` — 编辑动态任务的内容/规则
- `cron_remove` — 删除动态任务（config 声明的任务需在 cordis.yml 中移除）
- `cron_history` — 查看最近的执行记录

## 工作原理

- 触发时通过 `agent.followup()` 向最近活跃的 root agent 注入一条 `source: plugin` 的用户消息，Agent 将其作为普通一轮对话执行；Agent 忙时任务排队，不会并发重叠。
- 消息带有 `[cron]` 框架，明确告知模型这是自动化任务而非用户输入。
- **执行记录关联**：注入的消息 id 与会话事件流（`session/event`）精确匹配——消息进入会话 → `running`，assistant 回复 → 截取摘要，`turn/end` → 按结束原因记 `completed`/`failed`。
- 运行记录（`lastRunAt`/`firedAt`）、启停覆盖、执行历史均持久化，重启后不会重复触发已消费的时段；`daily` 任务错过当天时段会补发一次。
- 任务存储默认 `$DSH_HOME/cron-tasks.json`（`storagePath` 可覆盖）；执行历史默认 `$DSH_HOME/cron-history.jsonl`（`historyPath` 可覆盖，保留最近 500 条）。
- HTTP API 通过可选注入（`ctx.inject(['webServer', 'webRuntime'])`）挂载：headless 环境没有 web 服务时，调度功能完整保留，只是没有面板。

## 开发

```sh
pnpm install
pnpm build        # 产出 lib/client.js（__ModuleLoader__ 格式）
pnpm typecheck
pnpm test         # host 半 mock 测试 + client bundle 验证
```

**结构**：单 npm 包、host/client 双半——host（`index.js`）：调度器 + 工具 + `/cron/api` 路由 + 历史采集；client（`src/client/` → `lib/client.js`）：会话头部面板。
