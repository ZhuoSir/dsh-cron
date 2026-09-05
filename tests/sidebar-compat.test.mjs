// Real browser cascade regression: jsdom does not model !important/specificity
// reliably enough for this bug. Test the shipped bundle's actual style effect.
import { readFileSync } from 'node:fs'
import { chromium, expect } from '@playwright/test'

const bundle = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
const browser = await chromium.launch({
  headless: true,
  ...(process.env.DSH_CHROMIUM_EXECUTABLE ? { executablePath: process.env.DSH_CHROMIUM_EXECUTABLE } : {}),
  ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
})
// Verbatim dsh-tauri 0.6.7 selector: meant for the left column, but global.
const desktopCSS = 'button[aria-label="收起侧边栏"], button[aria-label="Collapse sidebar"] { display: none !important; }'

try {
  const page = await browser.newPage()
  for (const width of [1829, 390]) {
    await page.setViewportSize({ width, height: 999 })
    for (const label of ['Collapse sidebar', '收起侧边栏', '折叠侧边栏']) {
      for (const desktopFirst of [true, false]) {
        await page.setContent(`<!doctype html><html><head><style>
          [data-dsh-panel-host] { position: fixed; inset: 0; pointer-events: none; overflow: clip; }
          [data-dsh-toggle-cluster] { position: absolute; top: 3px; right: 10px; display: flex; gap: 4px; pointer-events: auto; }
          [data-dsh-toggle-cluster] button { display: flex; width: 28px; height: 28px; }
        </style></head><body>
          <button id="left" aria-label="Collapse sidebar">Left</button>
          <button id="other" aria-label="收起侧边栏">Unrelated</button>
          <div data-dsh-panel-host><div data-dsh-toggle-cluster>
            ${width >= 768 ? '<button id="bottom" aria-label="Expand bottom panel">B</button>' : ''}
            <button id="right" aria-label="${label}">R</button>
          </div></div>
        </body></html>`)
        // A minimal native toggle stand-in: the fix must not replace handlers.
        await page.evaluate((collapseLabel) => {
          const right = document.querySelector('#right')
          right.onclick = () => right.setAttribute('aria-label',
            right.getAttribute('aria-label') === collapseLabel ? 'Expand sidebar' : collapseLabel)
        }, label)
        if (desktopFirst) await page.addStyleTag({ content: desktopCSS })
        if (desktopFirst && label !== '折叠侧边栏') {
          await expect(page.locator('#right')).toBeHidden() // reproduction before fix
        }
        // Apply through the real plugin, stubbing only unrelated registrations.
        await page.evaluate((source) => {
          let plugin
          window.__ModuleLoader__ = { load: ({ factory }) => {
            plugin = factory((name) => {
              if (name === 'react' || name === 'react/jsx-runtime' || name === 'react-dom') return {}
              throw new Error(`Unexpected external: ${name}`)
            })
          } }
          ;(0, eval)(source)
          window.mountCron = () => {
            const disposers = []
            plugin.apply({
              inject: () => {}, // optional Sidebar service is absent in this CSS-only fixture
              effect: (fn) => { disposers.push(fn()) },
              locale: { register: () => () => {} },
              slots: { inject: () => () => {} },
            })
            window.disposeCron = () => disposers.reverse().forEach((fn) => fn?.())
          }
          window.mountCron()
        }, bundle)
        if (!desktopFirst) await page.addStyleTag({ content: desktopCSS })

        const right = page.locator('#right')
        await expect(right).toHaveCSS('display', 'flex')
        await expect(page.locator('#left')).toBeHidden()
        await expect(page.locator('#other')).toBeHidden()
        await expect(page.locator('#bottom')).toHaveCount(width >= 768 ? 1 : 0)
        if (width >= 768) await expect(page.locator('#bottom')).toBeVisible()
        const box = await right.boundingBox()
        if (!box || box.width < 28 || box.x < 0 || box.x + box.width > width) {
          throw new Error('Right toggle is outside the viewport or has no hit target')
        }
        for (let i = 0; i < 3; i++) {
          await right.click()
          await expect(right).toHaveAttribute('aria-label', 'Expand sidebar')
          await right.focus()
          await page.keyboard.press('Enter')
          await expect(right).toHaveAttribute('aria-label', label)
          await expect(right).toBeVisible()
        }
        // Locale updates must not strand the open control.
        await right.evaluate((el) => el.setAttribute('aria-label', 'Collapse sidebar'))
        await expect(right).toBeVisible()
        await page.evaluate(() => window.disposeCron())
        await expect(page.locator('style[data-plugin="dsh-cron"]')).toHaveCount(0)
        await expect(right).toBeHidden() // cleanup restores original cascade
        console.log(`✓ sidebar compatibility: ${width}px, ${label}, desktop ${desktopFirst ? 'first' : 'last'}`)
      }
    }
  }
  // No Better Sidebar DOM: applying/removing the override must not unhide the
  // left column or an unrelated button with the same accessible name.
  await page.locator('[data-dsh-panel-host]').evaluate(el => el.remove())
  await page.evaluate(() => window.mountCron())
  await expect(page.locator('#left')).toBeHidden()
  await expect(page.locator('#other')).toBeHidden()
  await page.evaluate(() => window.disposeCron())

  // Without Desktop's hide rule, the native button remains usable both with
  // and without Cron. Repeated activation must not accumulate styles.
  await page.setContent('<div data-dsh-panel-host><div data-dsh-toggle-cluster><button id="right" aria-label="Collapse sidebar">R</button></div></div>')
  for (let i = 0; i < 2; i++) {
    await page.evaluate(() => window.mountCron())
    await expect(page.locator('style[data-plugin="dsh-cron"]')).toHaveCount(1)
    await expect(page.locator('#right')).toBeVisible()
    await page.evaluate(() => window.disposeCron())
    await expect(page.locator('style[data-plugin="dsh-cron"]')).toHaveCount(0)
    await expect(page.locator('#right')).toBeVisible()
  }
} finally {
  await browser.close()
}
console.log('SIDEBAR COMPATIBILITY BROWSER TESTS PASSED')
