// A phone as the controller (phone-pads.js): run with `node --test tests/*.test.mjs` (needs Playwright's Chromium).
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

const frames = (page, n = 6) => page.evaluate((n) => new Promise((r) => { let i = 0; const f = () => (++i >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f) }), n)
async function key(page, code) {
  await page.keyboard.down(code)
  await frames(page, 2)
  await page.keyboard.up(code)
  await frames(page, 2)
}
/** A phone's pad, fed straight into input as phone-pads.js does, without a relay. */
async function addPhonePad(page, state) {
  await page.evaluate((s) => {
    window.__phoneState = s
    window.__phonePad = window.__kitPhones.input.addPad(() => window.__phoneState)
  }, { connected: true, x: 0, y: 0, aimX: 0, aimY: 0, held: [], ...state })
}
async function startRun(page, endless = false) {
  await page.evaluate((endless) => {
    window.__ns.newRun(0, endless)
    window.__ns.screen = 'playing'
  }, endless)
  await frames(page, 4)
}

test('the title offers Connect a phone, which shows the card and goes back', async () => {
  const { context, page, errors } = await open(DECK)
  const labels = await page.evaluate(() => window.__game.titleMenu.items.map((i) => i.label))
  assert.ok(labels.includes('CONNECT A PHONE'), labels.join(', '))
  await page.evaluate(() => window.__game.titleMenu.select('phones'))
  await frames(page, 30) // past the title's menu lock
  await key(page, 'Enter')
  assert.equal(await page.evaluate(() => window.__ns.screen), 'phones')
  assert.equal(await page.evaluate(() => window.__game.state.screen), 'title')
  // Drawing the card opens the room (it fails here without a relay, which is fine for this test).
  assert.notEqual(await page.evaluate(() => window.__ns.phones.status), 'idle')
  await frames(page, 20)
  await key(page, 'Backspace')
  assert.equal(await page.evaluate(() => window.__ns.screen), 'title')
  assert.deepEqual(errors, [])
  await context.close()
})

test('a phone shows twin sticks in play and the menu pad on every other screen', async () => {
  const { context, page, errors } = await open(DECK)
  assert.equal(await page.evaluate(() => window.__ns.phoneLayout), 'classic')
  await startRun(page)
  assert.equal(await page.evaluate(() => window.__ns.phoneLayout), 'twin')
  await key(page, 'Escape')
  assert.equal(await page.evaluate(() => window.__ns.screen), 'paused')
  assert.equal(await page.evaluate(() => window.__ns.phoneLayout), 'classic')
  assert.deepEqual(errors, [])
  await context.close()
})

test("a phone's left stick moves the ship and its right stick aims and fires", async () => {
  const { context, page, errors } = await open(DECK)
  await startRun(page)
  const before = await page.evaluate(() => ({ x: window.__ns.G.P.x }))
  await addPhonePad(page, { x: 1, y: 0, aimX: 0, aimY: -1 })
  await frames(page, 30)
  const after = await page.evaluate(() => ({ x: window.__ns.G.P.x, aim: window.__ns.G.P.aim, mode: window.__game.inputMode }))
  assert.ok(after.x > before.x + 40, `the ship moved right: ${before.x} → ${after.x}`)
  assert.ok(Math.abs(after.aim + Math.PI / 2) < 0.05, `aiming up: ${after.aim}`)
  assert.equal(after.mode, 'gamepad')
  assert.deepEqual(errors, [])
  await context.close()
})

test("a phone's RT drops a bomb", async () => {
  const { context, page, errors } = await open(DECK)
  await startRun(page)
  const bombs = await page.evaluate(() => window.__ns.G.P.bombs)
  await addPhonePad(page, {})
  await frames(page, 2)
  await page.evaluate(() => (window.__phoneState = { ...window.__phoneState, held: ['rt'] }))
  await frames(page, 3)
  await page.evaluate(() => (window.__phoneState = { ...window.__phoneState, held: [] }))
  await frames(page, 3)
  assert.equal(await page.evaluate(() => window.__ns.G.P.bombs), bombs - 1)
  assert.deepEqual(errors, [])
  await context.close()
})

test('the pause menu opens a banked Endless upgrade, and has no Upgrade item without one', async () => {
  const { context, page, errors } = await open(DECK)
  await startRun(page, true)
  await key(page, 'Escape')
  let items = await page.evaluate(() => window.__ns.pauseMenu.items.map((i) => i.id))
  assert.ok(!items.includes('upgrade'), items.join(', '))
  await key(page, 'Escape') // resume
  assert.equal(await page.evaluate(() => window.__ns.screen), 'playing')
  await page.evaluate(() => (window.__ns.G.pending = 2))
  await key(page, 'Escape')
  const labels = await page.evaluate(() => window.__ns.pauseMenu.items.map((i) => i.label))
  assert.equal(labels[1], 'Upgrade ×2')
  await key(page, 'ArrowDown')
  await key(page, 'Enter')
  assert.equal(await page.evaluate(() => window.__ns.screen), 'draft')
  assert.equal(await page.evaluate(() => window.__ns.G.pending), 1)
  await frames(page, 30) // past the draft's menu lock
  await key(page, 'Escape') // pausing from the draft
  assert.equal(await page.evaluate(() => window.__ns.screen), 'paused')
  items = await page.evaluate(() => window.__ns.pauseMenu.items.map((i) => i.id))
  assert.ok(!items.includes('upgrade'), `no Upgrade item when paused from the draft: ${items.join(', ')}`)
  assert.deepEqual(errors, [])
  await context.close()
})
