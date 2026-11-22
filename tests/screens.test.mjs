// Every screen shape: the Deck's 1280×800, a 16:9 TV and a 4:3 tablet. Run with `node --test tests/`
// (needs Playwright's Chromium). The game fills the screen with no bars and sees more of the arena on
// a wider or taller screen; what decides difficulty stays 1280×800, and the menus stay centred.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { readFile } from 'node:fs/promises'
import { join, extname, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const { chromium } = createRequire(import.meta.url)('playwright')

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' }
const DECK = { viewport: { width: 1280, height: 800 } }
const TV = { viewport: { width: 1920, height: 1080 } }
const TABLET_4_3 = { viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: true }

let server
let base
let browser

before(async () => {
  server = http.createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '')
    try {
      const body = await readFile(join(ROOT, path || 'index.html'))
      res.writeHead(200, { 'content-type': TYPES[extname(path || '.html')] ?? 'application/octet-stream' })
      res.end(body)
    } catch {
      res.writeHead(404)
      res.end()
    }
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${server.address().port}/`
  browser = await chromium.launch()
})

after(async () => {
  await browser?.close()
  await new Promise((resolve) => server?.close(resolve))
})

async function open(options) {
  const context = await browser.newContext(options)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (err) => errors.push(err))
  await page.goto(`${base}index.html?debug`)
  await page.waitForFunction(() => window.__game && window.__ns)
  return { context, page, errors }
}
const view = (page) => page.evaluate(() => window.__game.view)
const canvasRect = (page) =>
  page.evaluate(() => {
    const b = document.getElementById('game').getBoundingClientRect()
    return { left: b.left, top: b.top, width: Math.round(b.width), height: Math.round(b.height) }
  })
/** Menu coordinates (the centred 1280×800 box) → page coordinates. */
async function menuToPage(page, x, y) {
  const v = await view(page)
  const r = await canvasRect(page)
  return { x: r.left + ((x + v.x) / v.w) * r.width, y: r.top + ((y + v.y) / v.h) * r.height }
}

test('fills a 16:9 TV with no bars and shows more of the arena to the sides', async () => {
  const { context, page, errors } = await open(TV)
  assert.deepEqual(await canvasRect(page), { left: 0, top: 0, width: 1920, height: 1080 })
  const v = await view(page)
  assert.equal(v.h, 800)
  assert.ok(v.w > 1400 && v.w < 1430, `view width ${v.w}`)
  assert.equal(v.x, (v.w - 1280) / 2)
  assert.deepEqual(errors, [])
  await context.close()
})

test('stays exactly 1280×800 on the Deck', async () => {
  const { context, page, errors } = await open(DECK)
  assert.deepEqual(await view(page), { w: 1280, h: 800, x: 0, y: 0 })
  assert.deepEqual(await canvasRect(page), { left: 0, top: 0, width: 1280, height: 800 })
  assert.deepEqual(errors, [])
  await context.close()
})

test('shows more above and below on a 4:3 tablet', async () => {
  const { context, page, errors } = await open(TABLET_4_3)
  const v = await view(page)
  assert.equal(v.w, 1280)
  assert.equal(v.h, 960)
  assert.deepEqual(await canvasRect(page), { left: 0, top: 0, width: 1024, height: 768 })
  assert.deepEqual(errors, [])
  await context.close()
})

test('keeps the boss box 1280×800 on a wide screen', async () => {
  const { context, page, errors } = await open(TV)
  const box = await page.evaluate(() => {
    window.__ns.newRun(0, false)
    window.__ns.screen = 'playing'
    window.__ns.bossBox(true)
    const { x0, x1, y0, y1 } = window.__ns.BB
    return { w: x1 - x0 + 32, h: y1 - y0 + 32 }
  })
  assert.deepEqual(box, { w: 1280, h: 800 })
  assert.deepEqual(errors, [])
  await context.close()
})

test('the centred title menu and ship arrows answer taps on a wide touch screen', async () => {
  const { context, page, errors } = await open({ ...TV, hasTouch: true, isMobile: true })
  await page.waitForTimeout(500) // past the title's input lock
  // The ship carousel's right arrow (menu coordinates 1090,370 80×80).
  const arrow = await menuToPage(page, 1130, 410)
  await page.touchscreen.tap(arrow.x, arrow.y)
  await page.waitForFunction(() => window.__ns.titleShip === 1, null, { timeout: 2000 })
  // HOW TO PLAY, the third row of the title menu.
  const r = await page.evaluate(() => window.__game.titleMenu.rect(2))
  const row = await menuToPage(page, r.x + r.w / 2, r.y + r.h / 2)
  await page.touchscreen.tap(row.x, row.y)
  if ((await page.evaluate(() => window.__ns.screen)) !== 'howto') await page.touchscreen.tap(row.x, row.y)
  await page.waitForFunction(() => window.__ns.screen === 'howto', null, { timeout: 2000 })
  assert.deepEqual(errors, [])
  await context.close()
})
