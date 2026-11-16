// Touch-only play on a tablet: run with `node --test tests/` (needs Playwright's Chromium).
// Serves the game folder over http (ES modules don't load from file://) and plays it with taps.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { readFile } from 'node:fs/promises'
import { join, extname, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

// Playwright is installed globally (not a dependency of the game): require() finds it on NODE_PATH.
const { chromium } = createRequire(import.meta.url)('playwright')

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' }
const TABLET = { viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: true }

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

/** A fresh tablet (empty storage) on the game with the ?debug hooks. */
async function open(options = {}, settings) {
  const context = await browser.newContext({ ...TABLET, ...options })
  // Settings saved by an earlier session, in place before the game reads them.
  if (settings) await context.addInitScript((s) => localStorage.setItem('neon-swarm-settings-v1', s), JSON.stringify(settings))
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (err) => errors.push(err))
  await page.goto(`${base}index.html?debug`)
  await page.waitForFunction(() => window.__game && window.__ns)
  return { context, page, errors }
}

/** Game coordinates (1280×800) → page coordinates, through the letterboxed canvas. */
async function toPage(page, x, y) {
  const r = await page.evaluate(() => {
    const b = document.getElementById('game').getBoundingClientRect()
    return { left: b.left, top: b.top, width: b.width, height: b.height }
  })
  return { x: r.left + (x / 1280) * r.width, y: r.top + (y / 800) * r.height }
}
const middle = (r) => [r.x + r.w / 2, r.y + r.h / 2]
const screen = (page) => page.evaluate(() => window.__ns.screen)

/** Start a run straight from the debug hooks, with the ship safe from the swarm. */
async function startRun(page, endless) {
  await page.evaluate((endless) => {
    window.__ns.newRun(0, endless)
    window.__ns.screen = 'playing'
    window.__ns.G.P.inv = 9999
  }, endless)
}

/**
 * Raw multi-touch through the DevTools protocol: touch(type, [[x, y, id], ...]) in page coordinates.
 * touchStart and touchMove list every finger that's down; touchEnd lists the fingers that lift.
 */
async function touchscreen(context, page) {
  const cdp = await context.newCDPSession(page)
  return (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y, id]) => ({ x, y, id, radiusX: 4, radiusY: 4, force: 1 })) })
}

test('starts in touch mode on a touch screen', async () => {
  const { context, page, errors } = await open()
  // No tap yet: the touch buttons and text must already be there.
  assert.equal(await page.evaluate(() => window.__game.inputMode), 'touch')
  // A new touch player aims with the right thumb: no auto-fire unless they pick it in Settings.
  assert.equal(await page.evaluate(() => window.__game.settings.data.assist), 0)
  // The upright check needs a real touch screen held sideways: this one is landscape.
  assert.equal(await screen(page), 'title')
  assert.deepEqual(errors, [])
  await context.close()
})

test('keeps a saved Aiming choice', async () => {
  const chosen = await open({}, { assist: 2, assistChosen: true })
  assert.equal(await chosen.page.evaluate(() => window.__game.settings.data.assist), 2)
  await chosen.context.close()
  const assisted = await open({}, { assist: 1 })
  assert.equal(await assisted.page.evaluate(() => window.__game.settings.data.assist), 1)
  await assisted.context.close()
})

test('turns off the auto-fire 1.14.0 switched on for a touch player who never chose it', async () => {
  const { context, page } = await open({}, { assist: 2 })
  assert.equal(await page.evaluate(() => window.__game.settings.data.assist), 0)
  await context.close()
  // Only once: auto-fire picked afterwards stays.
  const later = await open({}, { assist: 2, touchAimReset: true })
  assert.equal(await later.page.evaluate(() => window.__game.settings.data.assist), 2)
  await later.context.close()
})

test('aims and fires with the right thumb, moves with the left', async () => {
  const { context, page, errors } = await open()
  await startRun(page, false)
  await page.evaluate(() => {
    const { G } = window.__ns
    G.P.x = 0
    G.P.y = 0
  })
  const touch = await touchscreen(context, page)
  const home = await page.evaluate(() => window.__game.stickHome)
  const moveAt = await toPage(page, home.move.x, home.move.y)
  const aimAt = await toPage(page, home.aim.x, home.aim.y)
  const aimTo = await toPage(page, home.aim.x, home.aim.y - 60)
  const start = await page.evaluate(() => ({ x: window.__ns.G.P.x, y: window.__ns.G.P.y }))
  // Left thumb pushes right; right thumb drags straight up.
  await touch('touchStart', [[moveAt.x, moveAt.y, 1], [aimAt.x, aimAt.y, 2]])
  const moveTo = await toPage(page, home.move.x + 60, home.move.y)
  for (let i = 0; i < 6; i++) {
    await touch('touchMove', [[moveTo.x, moveTo.y, 1], [aimTo.x, aimTo.y, 2]])
    await page.waitForTimeout(60)
  }
  const s = await page.evaluate(() => ({ sticks: window.__game.sticks.map((t) => t.side).sort(), aim: window.__ns.G.P.aim, x: window.__ns.G.P.x }))
  assert.deepEqual(s.sticks, ['aim', 'move'])
  assert.ok(Math.abs(s.aim + Math.PI / 2) < 0.2, `aims up (aim ${s.aim.toFixed(2)})`)
  assert.ok(s.x > start.x + 20, `moves right (x ${start.x.toFixed(0)} → ${s.x.toFixed(0)})`)
  await touch('touchEnd', [[moveTo.x, moveTo.y, 1], [aimTo.x, aimTo.y, 2]])
  assert.deepEqual(errors, [])
  await context.close()
})

test('opens a banked upgrade with the on-screen button in Endless', async () => {
  const { context, page, errors } = await open()
  await startRun(page, true)
  await page.evaluate(() => (window.__ns.G.pending = 2))
  await page.waitForTimeout(100)
  const btn = await page.evaluate(() => window.__game.upgradeButton)
  const at = await toPage(page, ...middle(btn))
  await page.touchscreen.tap(at.x, at.y)
  await page.waitForFunction(() => window.__ns.screen === 'draft', null, { timeout: 2000 })
  assert.equal(await page.evaluate(() => window.__ns.G.pending), 1)
  assert.deepEqual(errors, [])
  await context.close()
})

test('pauses from the draft screen by tap', async () => {
  const { context, page, errors } = await open()
  await startRun(page, true)
  await page.evaluate(() => window.__ns.openDraft())
  assert.equal(await screen(page), 'draft')
  await page.waitForTimeout(100)
  const btn = await page.evaluate(() => window.__game.draftPauseButton)
  const at = await toPage(page, ...middle(btn))
  await page.touchscreen.tap(at.x, at.y)
  await page.waitForFunction(() => window.__ns.screen === 'paused', null, { timeout: 2000 })
  assert.deepEqual(errors, [])
  await context.close()
})

test('pauses with a second finger while steering', async () => {
  const { context, page, errors } = await open()
  await startRun(page, false)
  const touch = await touchscreen(context, page)
  const x0 = await page.evaluate(() => window.__ns.G.P.x)
  // Left thumb: down on the left half, then drag right to steer.
  const thumb = await toPage(page, 300, 500)
  await touch('touchStart', [[thumb.x, thumb.y, 0]])
  await page.waitForTimeout(50)
  // Steer right, ending over the pause menu's Restart row.
  const steer = await toPage(page, 420, 400)
  await touch('touchMove', [[steer.x, steer.y, 0]])
  await page.waitForTimeout(300)
  assert.ok((await page.evaluate(() => window.__ns.G.P.x)) > x0 + 10, 'the first finger steers the ship')
  // Right thumb taps the pause button while the left one stays down.
  const pause = await toPage(page, ...middle(await page.evaluate(() => window.__game.pauseButton)))
  await touch('touchStart', [[steer.x, steer.y, 0], [pause.x, pause.y, 1]])
  await page.waitForTimeout(80)
  await touch('touchEnd', [[pause.x, pause.y, 1]])
  await page.waitForFunction(() => window.__ns.screen === 'paused', null, { timeout: 2000 })
  // Lifting the steering thumb over a menu row doesn't choose it.
  await touch('touchEnd', [[steer.x, steer.y, 0]])
  await page.waitForTimeout(200)
  assert.equal(await screen(page), 'paused')
  assert.deepEqual(errors, [])
  await context.close()
})

test('lifting the steering thumb over a card does not pick it', async () => {
  const { context, page, errors } = await open()
  await startRun(page, true)
  const touch = await touchscreen(context, page)
  const thumb = await toPage(page, 640, 400) // over the middle card, which starts selected
  await touch('touchStart', [[thumb.x, thumb.y, 0]])
  await page.waitForTimeout(50)
  await page.evaluate(() => window.__ns.openDraft())
  await page.waitForTimeout(600)
  await touch('touchEnd', [[thumb.x, thumb.y, 0]])
  await page.waitForTimeout(200)
  assert.equal(await screen(page), 'draft')
  assert.deepEqual(errors, [])
  await context.close()
})

test('picks a draft card with a second finger while the first is still down', async () => {
  const { context, page, errors } = await open()
  await startRun(page, true)
  const touch = await touchscreen(context, page)
  const thumb = await toPage(page, 640, 400) // over the middle card, which starts selected
  await touch('touchStart', [[thumb.x, thumb.y, 0]])
  await page.waitForTimeout(50)
  await page.evaluate(() => {
    window.__ns.G.drafted = 1 // as the UPGRADE button does (no Supply Drop after this one)
    window.__ns.openDraft()
  })
  await page.waitForTimeout(600) // past the draft's input lock
  const pick = await toPage(page, 166 + 150, 684 + 26) // PICK
  await touch('touchStart', [[thumb.x, thumb.y, 0], [pick.x, pick.y, 1]])
  await page.waitForTimeout(80)
  await touch('touchEnd', [[pick.x, pick.y, 1]])
  await page.waitForFunction(() => window.__ns.screen === 'playing', null, { timeout: 2000 })
  await touch('touchEnd', [[thumb.x, thumb.y, 0]])
  assert.deepEqual(errors, [])
  await context.close()
})

test('asks to turn an upright tablet sideways and pauses the run', async () => {
  const { context, page, errors } = await open()
  await startRun(page, false)
  await page.setViewportSize({ width: 820, height: 1180 })
  await page.waitForFunction(() => window.__ns.screen === 'paused', null, { timeout: 2000 })
  assert.deepEqual(errors, [])
  await context.close()
})
