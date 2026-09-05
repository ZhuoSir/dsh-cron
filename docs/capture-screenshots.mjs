// README stills: committed Cron components + real React, isolated browser fixtures.
// No server, persistent browser profile, live DSH API, model, or real task is used.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const require = createRequire(import.meta.url)
const root = fileURLToPath(new URL('../', import.meta.url))
const output = join(root, 'docs/images')
const bundlePath = join(root, 'lib/client.js')
const bundle = await readFile(bundlePath)
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const bundleHash = hash(bundle)
const committedBundle = execFileSync('git', ['show', 'HEAD:lib/client.js'], { cwd: root, maxBuffer: 8 * 1024 * 1024 })
assert.equal(bundleHash, hash(committedBundle), 'Capture only the unchanged committed client bundle')
const bundleCommit = execFileSync('git', ['log', '-1', '--format=%H', '--', 'lib/client.js'], { cwd: root, encoding: 'utf8' }).trim()
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
assert.equal(manifest.version, '0.4.4', 'These README fixtures document v0.4.4')
const viewport = { width: 1280, height: 760 }
const scale = 2
const owner = 'demo-session'
const tasks = [
  { id: 'morning-brief', prompt: '整理项目待办、昨日进展与待确认事项，生成一份简洁晨报。', schedule: { daily: '09:00', timeZone: 'Asia/Shanghai' }, enabled: true, nextRunAt: '2026-09-06T01:00:00Z' },
  { id: 'build-check', prompt: '检查示例项目的构建结果；如有失败，汇总原因与建议的下一步。', schedule: { everySeconds: 1800 }, enabled: true, nextRunAt: '2026-09-05T02:30:00Z' },
  { id: 'daily-review', prompt: '汇总当天完成的工作，列出剩余事项，准备下一次会话的交接摘要。', schedule: { daily: '18:00', timeZone: 'Asia/Shanghai' }, enabled: true, nextRunAt: '2026-09-05T10:00:00Z' },
  { id: 'docs-check', prompt: '检查文档中的待办标记与失效示例，整理需要人工确认的修改清单。', schedule: { everySeconds: 7200 }, enabled: false, nextRunAt: null },
].map(task => ({ ...task, sessionId: owner, origin: 'dynamic', lastRunAt: null }))
const history = [
  { taskId: 'build-check', firedAt: '2026-09-05T02:00:00Z', status: 'completed', seconds: 24, excerpt: '示例构建检查完成：测试通过，无新增失败项。下一轮将在 30 分钟后执行。' },
  { taskId: 'build-check', firedAt: '2026-09-05T01:30:00Z', status: 'failed', seconds: 12, excerpt: '示例失败：构建日志暂不可用。本次未生成检查结论，请确认日志路径后重试。' },
  { taskId: 'morning-brief', firedAt: '2026-09-05T01:00:00Z', status: 'completed', seconds: 42, excerpt: '示例晨报已整理：3 项待办、2 项已完成工作，以及 1 项需要人工确认的事项。' },
  { taskId: 'daily-review', firedAt: '2026-09-04T10:00:00Z', status: 'completed', seconds: 68, excerpt: '示例工作回顾已完成：汇总当日进展，并保留待确认问题与下一步建议。' },
  { taskId: 'docs-check', firedAt: '2026-09-04T08:00:00Z', status: 'completed', seconds: 31, excerpt: '示例文档检查完成：发现 2 处待更新说明。仅整理清单，未自动修改文件。' },
].map((record, index) => ({ ...record, id: `demo-run-${index + 1}`, sessionId: owner, prompt: tasks.find(task => task.id === record.taskId).prompt, scheduledFor: record.firedAt, startedAt: Date.parse(record.firedAt), completedAt: Date.parse(record.firedAt) + record.seconds * 1000 }))

// These are demonstration shell colors supplied through the public theme tokens,
// not copied production theme values. Never override the Cron component CSS.
const palettes = {
  dark: { surface: '#202226', control: '#2b2e33', overlay: '#41464e', primary: '#f1f2f4', secondary: '#c5c9d0', border: '#3b4048', canvas: '#17191d', muted: '#aab0ba', accent: '#91b5e0' },
  light: { surface: '#ffffff', control: '#f3f4f6', overlay: '#dce1e8', primary: '#242a32', secondary: '#505965', border: '#dce0e6', canvas: '#f3f5f7', muted: '#65707d', accent: '#426f9c' },
}
function shell(theme, mode) {
  const p = palettes[theme]
  const modal = mode === 'standalone'
  const historyMode = mode === 'history'
  return `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><style>
    :root { color-scheme: ${theme}; font-family: "Segoe UI", "Microsoft YaHei", sans-serif; line-height: 1.6;
      --dsw-alias-bg-layer-1: ${p.surface}; --dsw-alias-bg-layer-2: ${p.control}; --dsw-alias-bg-overlay: ${p.overlay};
      --dsw-alias-label-primary: ${p.primary}; --dsw-alias-label-secondary: ${p.secondary}; --dsw-alias-border-l2: ${p.border};
      --dsw-font-mono: Consolas, "Courier New", monospace; }
    body { margin: 0; background: ${p.canvas}; color: ${p.primary}; }
    #demo-top { height: 68px; margin: 0 28px; display: flex; align-items: center; gap: 14px; border-bottom: 1px solid ${p.border}; }
    .demo-brand { font-size: 19px; font-weight: 650; letter-spacing: -.4px; }
    .demo-version { color: ${p.muted}; font-size: 12px; }
    .demo-label { margin-left: ${modal ? '24px' : 'auto'}; color: ${p.primary}; border: 1px solid ${p.border}; border-radius: 6px; background: ${p.surface}; padding: 5px 12px; font-size: 13px; font-weight: 600; }
    #demo-copy { position: absolute; top: 104px; left: 40px; width: 510px; }
    .demo-eyebrow { color: ${p.accent}; font-size: 12px; letter-spacing: 1px; font-weight: 600; }
    #demo-copy h1 { font-size: 30px; line-height: 1.4; letter-spacing: -.8px; margin: 12px 0 14px; }
    .demo-lead { font-size: 15px; color: ${p.secondary}; line-height: 1.9; margin: 0 0 26px; max-width: 480px; }
    .demo-card { padding: 17px 20px; background: ${p.surface}; border: 1px solid ${p.border}; border-radius: 10px; margin-bottom: 14px; }
    .demo-card h2 { font-size: 14px; margin: 0 0 8px; font-weight: 600; }
    .demo-card p { font-size: 13px; color: ${p.secondary}; margin: 0; line-height: 1.9; }
    .demo-card code { font-size: 12px; font-family: Consolas, monospace; color: ${p.accent}; }
    .demo-footer { position: absolute; left: 40px; bottom: 22px; font-size: 11px; color: ${p.muted}; }
    #demo-workbench { position: absolute; left: 600px; right: 28px; top: 90px; bottom: 30px; border: 1px solid ${p.border}; background: ${p.surface}; border-radius: 10px; overflow: hidden; display: flex; flex-direction: column; }
    #demo-session-header { min-height: 45px; display: flex; align-items: center; padding: 0 14px; border-bottom: 1px solid ${p.border}; gap: 12px; }
    .demo-session-title { font-size: 12px; color: ${p.secondary}; }
    #component-root { margin-left: auto; display: flex; }
    #demo-tabs { height: 38px; display: flex; align-items: stretch; border-bottom: 1px solid ${p.border}; background: ${p.control}; font-size: 12px; }
    #demo-tab-title { display: flex; align-items: center; padding: 0 18px; border-right: 1px solid ${p.border}; background: ${p.surface}; border-top: 2px solid ${p.accent}; font-weight: 600; }
    .demo-tab-note { margin-left: auto; padding: 8px 12px; color: ${p.muted}; font-size: 10px; }
    #component-sidebar { flex: 1; min-height: 0; }
    #demo-workbench[data-modal="true"] { bottom: auto; left: auto; width: 160px; }
    #demo-workbench[data-modal="true"] .demo-session-title { display: none; }
    #demo-workbench[data-modal="true"] #demo-tabs { display: none; }
  </style></head><body>
    <header id="demo-top"><span class="demo-brand">dsh-cron</span><span class="demo-version">v${manifest.version}</span><span class="demo-label">组件演示 · 示例数据</span></header>
    <main id="demo-copy"><div class="demo-eyebrow">${modal ? '独立面板 · 原生 DIALOG' : historyMode ? 'BETTER SIDEBAR · 执行记录' : 'BETTER SIDEBAR · 定时任务'}</div>
      <h1>${modal ? '没有侧栏，也能管理任务' : historyMode ? '每次执行，都有迹可循' : '让重复工作，按时发生'}</h1>
      <p class="demo-lead">${modal ? '未接入兼容侧栏服务时，头部入口会打开独立面板。任务与记录仍属于同一个会话。' : historyMode ? '在会话侧栏查看完成与失败记录，保留触发时间、执行耗时和结果摘要。' : '每天的晨报、半小时一次的构建检查，都在创建它们的会话中执行。'}</p>
      <section class="demo-card"><h2>${modal ? '原生模态层，不与侧栏争抢层级' : historyMode ? '状态、摘要与耗时，一起查看' : '自然语言描述，转换为调度规则'}</h2><p>${modal ? '支持关闭按钮、Escape 与外部点击关闭。<br>此图展示真实的 Cron dialog 组件与原生遮罩。' : historyMode ? '绿色为已完成，红色为失败。<br>本图记录均为固定样例，不代表真实任务已运行。' : '示例：「每天 9 点整理项目晨报」<br><code>daily: 09:00 · Asia/Shanghai</code>'}</p></section>
      <section class="demo-card"><h2>截图范围说明</h2><p>右侧为 v0.4.4 已提交构建中的真实组件。<br>外围外壳${modal ? '' : '、侧栏服务'}与任务 API 均为隔离夹具。<br>未连接 DSH，也未创建或运行任何真实任务。</p></section>
    </main>
    <section id="demo-workbench" data-modal="${modal}"><header id="demo-session-header"><span class="demo-session-title">示例会话 / 项目日常</span><div id="component-root"></div></header><div id="demo-tabs"><span id="demo-tab-title"></span><span class="demo-tab-note">侧栏外壳为演示夹具</span></div><div id="component-sidebar"></div></section>
    <footer class="demo-footer">组件演示 · 示例数据　/　中文 · Asia/Shanghai　/　非运行中的 DSH 界面</footer>
  </body></html>`
}

await mkdir(output, { recursive: true })
// Prefer installed Playwright Chromium. On Windows, use installed Edge when the
// Playwright browser is absent. Both explicit overrides take precedence.
const executablePath = process.env.DSH_CHROMIUM_EXECUTABLE
const channel = process.env.PLAYWRIGHT_CHANNEL || (!executablePath && process.platform === 'win32' && !existsSync(chromium.executablePath()) ? 'msedge' : undefined)
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : channel ? { channel } : {}) })
const captures = []
try {
  for (const [filename, theme, mode] of [
    ['sidebar-tasks-dark.png', 'dark', 'tasks'],
    ['sidebar-history-light.png', 'light', 'history'],
    ['standalone-panel.png', 'light', 'standalone'],
  ]) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: scale, colorScheme: theme, locale: 'zh-CN', timezoneId: 'Asia/Shanghai', reducedMotion: 'reduce', offline: true, serviceWorkers: 'block' })
    try {
      const errors = []
      const requests = []
      await context.route('**/*', async route => { requests.push(route.request().url()); await route.abort('blockedbyclient') })
      const page = await context.newPage()
      page.on('pageerror', error => errors.push(error.message))
      await page.setContent(shell(theme, mode))
      await page.addScriptTag({ path: join(dirname(require.resolve('react/package.json')), 'umd/react.development.js') })
      await page.addScriptTag({ path: join(dirname(require.resolve('react-dom/package.json')), 'umd/react-dom.development.js') })
      await page.evaluate(() => { window.__ModuleLoader__ = { load: registration => { window.cronRegistration = registration } } })
      await page.addScriptTag({ path: bundlePath })
      await page.evaluate(({ tasks, history, owner, mode }) => {
        const R = window.React
        const D = window.ReactDOM
        const jsx = (type, props, key) => R.createElement(type, { ...props, ...(key === undefined ? {} : { key }) })
        const plugin = window.cronRegistration.factory(name => {
          if (name === 'react') return R
          if (name === 'react-dom') return D
          if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: R.Fragment }
          throw new Error('Unexpected bundle import: ' + name)
        })
        const slots = new Map()
        const disposers = []
        let dictionaries
        let optional
        let bridgeDispose
        let descriptor
        const calls = []
        const violations = []
        const t = (key, params) => (dictionaries.zh[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => String(params?.[name] ?? ''))
        // Read-only in-memory API: mutations and unexpected owners fail closed.
        window.fetch = async (url, options) => {
          const payload = JSON.parse(options?.body ?? '{}')
          if (!['/cron/api/list', '/cron/api/history'].includes(url) || options?.method !== 'POST' || payload.sessionId !== owner) {
            violations.push(String(url)); throw new Error('Unexpected fixture API call: ' + url)
          }
          calls.push(url)
          return { json: async () => ({ ok: true, result: url.endsWith('/list') ? { tasks } : { records: history } }) }
        }
        const ctx = {
          effect: fn => { const dispose = fn(); if (dispose) disposers.push(dispose) },
          inject: (_names, callback) => { optional = callback },
          locale: { register: (_ns, value) => { dictionaries = value; return () => {} }, bind: () => t },
          slots: { inject: (_name, fn) => fn(), register: (spec, component) => { slots.set(spec.id, component); return () => slots.delete(spec.id) } },
        }
        plugin.apply(ctx)
        const root = D.createRoot(document.getElementById('component-root'))
        const sideRoot = D.createRoot(document.getElementById('component-sidebar'))
        if (mode !== 'standalone') {
          const service = {
            version: '0.18.0', features: ['targetedOpen', 'floatWindows'],
            registerTab(value) { descriptor = value; return () => { descriptor = null } },
            getSnapshot: () => ({ sessionId: owner }), isTabEnabled: id => id === descriptor?.id,
            openTab(seed, scope) {
              if (seed.type !== descriptor.id || scope.sessionId !== owner) throw new Error('Unexpected sidebar scope')
              const state = { activePane: 'right', splits: { kind: 'leaf', id: 'right', tabs: [] }, bottomSplits: { kind: 'leaf', id: 'bottom', tabs: [] }, floats: [] }
              const created = descriptor.createTab(state)
              if (created.patch?.panelOpen !== true) throw new Error('Sidebar was not revealed')
              document.getElementById('demo-tab-title').textContent = created.tab.title
              sideRoot.render(R.createElement(descriptor.component, { scope, visible: true }))
            },
          }
          optional({ get: name => name === 'betterSidebar' ? service : undefined, effect: fn => { bridgeDispose = fn() } })
        }
        root.render(R.createElement(R.Fragment, null,
          R.createElement(slots.get('cron-trigger'), { t, sessionId: owner }),
          R.createElement(slots.get('cron-drawer'), { t })))
        window.fixture = { calls, violations, cleanup() { sideRoot.unmount(); root.unmount(); bridgeDispose?.(); disposers.reverse().forEach(dispose => dispose()) } }
      }, { tasks, history, owner, mode })
      await page.getByRole('button', { name: '定时任务', exact: true }).click()
      const panel = page.locator(mode === 'standalone' ? 'dialog' : '.dsh-cron-sidebarPanel')
      await panel.waitFor({ state: 'visible' })
      await panel.getByText('morning-brief', { exact: true }).waitFor()
      if (mode === 'history') {
        await panel.getByRole('button', { name: '执行记录', exact: true }).click()
        await panel.getByText(history[0].excerpt, { exact: true }).waitFor()
        assert.equal(await panel.getByText('失败', { exact: true }).count(), 1)
      }
      if (mode === 'standalone') {
        assert.equal(await panel.evaluate(element => element.matches(':modal')), true)
        await panel.locator('summary').click() // Actual disclosure; no preference or API mutation.
      } else {
        assert.equal(await page.locator('dialog').count(), 0)
        assert.equal(await page.locator('#demo-tab-title').innerText(), '定时任务')
      }
      await page.mouse.move(2, 2)
      await page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))) })
      const layout = await panel.evaluate(element => {
        const body = element.querySelector('.dsh-cron-body')
        return { horizontalOverflow: body.scrollWidth > body.clientWidth, verticalOverflow: body.scrollHeight > body.clientHeight, height: body.clientHeight, contentHeight: body.scrollHeight, rows: body.querySelectorAll('.dsh-cron-row').length }
      })
      assert.equal(layout.horizontalOverflow, false, 'No horizontal cropping')
      assert.equal(layout.verticalOverflow, false, `All representative rows fit without scrolling: ${JSON.stringify(layout)}`)
      assert.equal(layout.rows, mode === 'history' ? history.length : tasks.length)
      assert.equal(await page.locator('.dsh-cron-error').count(), 0)
      assert.deepEqual(await page.evaluate(() => window.fixture.violations), [])
      assert.ok((await page.evaluate(() => window.fixture.calls)).includes('/cron/api/list'))
      assert.ok((await page.evaluate(() => window.fixture.calls)).includes('/cron/api/history'))
      assert.deepEqual(errors, [], 'No browser runtime errors')
      assert.deepEqual(requests, [], 'No network requests, including live GUI access')
      const path = join(output, filename)
      await page.screenshot({ path, animations: 'disabled', fullPage: false })
      const png = await readFile(path)
      assert.equal(png.readUInt32BE(16), viewport.width * scale)
      assert.equal(png.readUInt32BE(20), viewport.height * scale)
      captures.push({ filename, theme, mode, width: png.readUInt32BE(16), height: png.readUInt32BE(20) })
      await page.evaluate(() => window.fixture.cleanup())
      console.log(`Captured ${filename}: ${viewport.width * scale} × ${viewport.height * scale}; real component, fixture data, no network`)
    } finally {
      await context.close()
    }
  }
  const docs = `# README 截图来源与复现\n\n> **组件演示 · 示例数据**：这三张 PNG 是实际 Cron 组件在隔离 Playwright 页面中的截图，**不是运行中的 DSH GUI 或已部署集成的截图**。外围外壳和 Better Sidebar 服务均为演示夹具。\n\n## 复现\n\n在仓库根目录、已安装本项目开发依赖及浏览器的环境运行：\n\n\`\`\`sh\nnode docs/capture-screenshots.mjs\n\`\`\`\n\n不启动服务器，不需要访问 GUI。默认使用已安装的 Playwright Chromium；Windows 上若该浏览器未安装，则选择已安装的 Edge。也可显式指定：\n\n\`\`\`powershell\n$env:PLAYWRIGHT_CHANNEL = 'msedge'\nnode docs/capture-screenshots.mjs\n\n# 或指定本地 Chromium/Edge 可执行文件（优先于 channel）\n$env:DSH_CHROMIUM_EXECUTABLE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'\nnode docs/capture-screenshots.mjs\n\`\`\`\n\n脚本不安装或更新依赖，不构建客户端。它要求工作树的 \`lib/client.js\` 与 HEAD 提交中的字节完全一致，且 package 版本为 0.4.4。成功运行覆盖本目录三张 PNG 和本说明；发生失败时仍通过 \`finally\` 关闭上下文与浏览器。\n\n## 真实组件与夹具边界\n\n- **真实**：直接加载仓库已提交的 \`lib/client.js\`，通过其 ModuleLoader 工厂及 \`apply\` 注册入口渲染真实任务面板、历史列表、通知设置和原生 modal dialog；React / ReactDOM 均为本地安装的官方 18.3.1 UMD 运行时。未重绘组件、修改客户端源码或覆盖 Cron 组件 CSS。\n- **夹具**：最小 ModuleLoader / Cordis slots / locale / effect 接线；Better Sidebar 0.18.0 的公开服务形状；会话头部、侧栏页签与外围说明外壳。页签标题来自真实 Cron descriptor，面板经真实头部按钮及可选服务路径打开；未加载 Better Sidebar 自身 UI。\n- **主题**：演示外壳仅提供 Cron 已支持的公开 DSH CSS theme tokens，配合系统字体与亮/暗 color-scheme；颜色是中性演示值，不声称逐像素复刻某个 DSH 安装主题。\n- **数据**：固定 \`demo-session\` 会话，四个虚构短 ID 任务（每日 / 30 分钟 / 2 小时间隔，含已暂停项），五条已完成/失败示例记录。所有文案为原创示例，无真实用户、会话、文件、凭据或任务数据。\n- **API**：只允许同一示例 owner 的 \`/cron/api/list\` 与 \`/cron/api/history\` 内存响应；其他调用直接报错。未调用 run/add/update/toggle/remove。通知设置仅展开，没有发送通知。\n- **隔离**：全新非持久化浏览器上下文；offline 模式、禁用 service worker、兜底中止所有网络请求，并断言零网络请求。仅 \`setContent\` 与本地脚本注入，无服务器、生产 GUI/浏览器 profile/DSH_HOME 访问、真实任务创建或模型调用。\n\n## 构建来源\n\n- Package：\`dsh-cron@${manifest.version}\`\n- 已提交 bundle：\`lib/client.js\`\n- Bundle 最近修改提交：\`${bundleCommit}\`\n- Bundle SHA-256：\`${bundleHash}\`\n- React：\`${require('react/package.json').version}\`；ReactDOM：\`${require('react-dom/package.json').version}\`\n- Playwright：\`${require('@playwright/test/package.json').version}\`；实际浏览器版本：\`${browser.version()}\`\n- 选择：\`${executablePath ? 'DSH_CHROMIUM_EXECUTABLE（本地路径不写入文档）' : channel || 'Playwright Chromium'}\`\n- 浏览器 locale：\`zh-CN\`；时区：\`Asia/Shanghai\`；固定样例日期：2026-09-04 至 2026-09-06。日期完全由静态夹具提供，不依赖捕获当天。\n- CSS viewport：1280 × 760；device scale factor：2；无后期裁剪、缩放或合成。\n\n## 图片\n\n| 文件 | 内容 | PNG 尺寸 |\n| --- | --- | --- |\n${captures.map(capture => `| \`${capture.filename}\` | ${capture.mode === 'tasks' ? '暗色侧栏任务页，四个代表性任务' : capture.mode === 'history' ? '亮色侧栏执行记录，完成/失败及摘要耗时' : '未注入 Better Sidebar 服务时的真实独立模态面板，展开通知设置'} | ${capture.width} × ${capture.height} |`).join('\n')}\n\n## 验证与限制\n\n捕获脚本断言：中文页签、任务/记录行数、失败记录、原生 \`:modal\` 状态、无横向或纵向裁切、无组件错误、无页面运行错误、无网络请求及 PNG 尺寸。所有内容行无需滚动即可完整显示。\n\n这些截图验证的是 **真实组件 + 浏览器夹具**，不是实际 Host 调度、真实 Better Sidebar、通知投递、安装激活或当前用户 GUI 的端到端验证。字体栅格化和 PNG 字节可能随操作系统或浏览器版本变化。完整运行时回归仍使用仓库测试套件。\n`
  await writeFile(join(output, 'README.md'), docs)
  console.log(`Bundle SHA-256: ${bundleHash}`)
} finally {
  await browser.close()
}
