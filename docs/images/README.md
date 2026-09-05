# README 截图来源与复现

> **组件演示 · 示例数据**：这三张 PNG 是实际 Cron 组件在隔离 Playwright 页面中的截图，**不是运行中的 DSH GUI 或已部署集成的截图**。外围外壳和 Better Sidebar 服务均为演示夹具。

## 复现

在仓库根目录、已安装本项目开发依赖及浏览器的环境运行：

```sh
node docs/capture-screenshots.mjs
```

不启动服务器，不需要访问 GUI。默认使用已安装的 Playwright Chromium；Windows 上若该浏览器未安装，则选择已安装的 Edge。也可显式指定：

```powershell
$env:PLAYWRIGHT_CHANNEL = 'msedge'
node docs/capture-screenshots.mjs

# 或指定本地 Chromium/Edge 可执行文件（优先于 channel）
$env:DSH_CHROMIUM_EXECUTABLE = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
node docs/capture-screenshots.mjs
```

脚本不安装或更新依赖，不构建客户端。它要求工作树的 `lib/client.js` 与 HEAD 提交中的字节完全一致，且 package 版本为 0.4.4。成功运行覆盖本目录三张 PNG 和本说明；发生失败时仍通过 `finally` 关闭上下文与浏览器。

## 真实组件与夹具边界

- **真实**：直接加载仓库已提交的 `lib/client.js`，通过其 ModuleLoader 工厂及 `apply` 注册入口渲染真实任务面板、历史列表、通知设置和原生 modal dialog；React / ReactDOM 均为本地安装的官方 18.3.1 UMD 运行时。未重绘组件、修改客户端源码或覆盖 Cron 组件 CSS。
- **夹具**：最小 ModuleLoader / Cordis slots / locale / effect 接线；Better Sidebar 0.18.0 的公开服务形状；会话头部、侧栏页签与外围说明外壳。页签标题来自真实 Cron descriptor，面板经真实头部按钮及可选服务路径打开；未加载 Better Sidebar 自身 UI。
- **主题**：演示外壳仅提供 Cron 已支持的公开 DSH CSS theme tokens，配合系统字体与亮/暗 color-scheme；颜色是中性演示值，不声称逐像素复刻某个 DSH 安装主题。
- **数据**：固定 `demo-session` 会话，四个虚构短 ID 任务（每日 / 30 分钟 / 2 小时间隔，含已暂停项），五条已完成/失败示例记录。所有文案为原创示例，无真实用户、会话、文件、凭据或任务数据。
- **API**：只允许同一示例 owner 的 `/cron/api/list` 与 `/cron/api/history` 内存响应；其他调用直接报错。未调用 run/add/update/toggle/remove。通知设置仅展开，没有发送通知。
- **隔离**：全新非持久化浏览器上下文；offline 模式、禁用 service worker、兜底中止所有网络请求，并断言零网络请求。仅 `setContent` 与本地脚本注入，无服务器、生产 GUI/浏览器 profile/DSH_HOME 访问、真实任务创建或模型调用。

## 构建来源

- Package：`dsh-cron@0.4.4`
- 已提交 bundle：`lib/client.js`
- Bundle 最近修改提交：`8c2b75704a510528085e093dfb15d9ba2aee3313`
- Bundle SHA-256：`acefdb5d0a5e9aef9a2039853116042fabdd35def8dca88b529d7b38ce8dc553`
- React：`18.3.1`；ReactDOM：`18.3.1`
- Playwright：`1.62.1`；实际浏览器版本：`152.0.4191.66`
- 选择：`msedge`
- 浏览器 locale：`zh-CN`；时区：`Asia/Shanghai`；固定样例日期：2026-09-04 至 2026-09-06。日期完全由静态夹具提供，不依赖捕获当天。
- CSS viewport：1280 × 760；device scale factor：2；无后期裁剪、缩放或合成。

## 图片

| 文件 | 内容 | PNG 尺寸 |
| --- | --- | --- |
| `sidebar-tasks-dark.png` | 暗色侧栏任务页，四个代表性任务 | 2560 × 1520 |
| `sidebar-history-light.png` | 亮色侧栏执行记录，完成/失败及摘要耗时 | 2560 × 1520 |
| `standalone-panel.png` | 未注入 Better Sidebar 服务时的真实独立模态面板，展开通知设置 | 2560 × 1520 |

## 验证与限制

捕获脚本断言：中文页签、任务/记录行数、失败记录、原生 `:modal` 状态、无横向或纵向裁切、无组件错误、无页面运行错误、无网络请求及 PNG 尺寸。所有内容行无需滚动即可完整显示。

这些截图验证的是 **真实组件 + 浏览器夹具**，不是实际 Host 调度、真实 Better Sidebar、通知投递、安装激活或当前用户 GUI 的端到端验证。字体栅格化和 PNG 字节可能随操作系统或浏览器版本变化。完整运行时回归仍使用仓库测试套件。
