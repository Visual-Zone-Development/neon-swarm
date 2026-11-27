// pushplay runtime v24 — shared runtime file, replaced by update-runtime; don't edit
// Phones as controllers in any game, single-player included. Show the card (a QR code and a room
// code); each phone that joins shows one of the shared layouts (controller-layouts.js) and becomes a
// controller in input.pads, so the game reads it like a pad plugged into this machine: input.x,
// input.held('a') and input.pressed('menu') include it, and local multiplayer gets one pad per phone.
//
//   import { connectPhones } from './phone-pads.js'
//   const phones = connectPhones(input, { layout: 'classic', labels: { a: 'Jump' }, max: 4 })
//   (also hide, theme and knocks, as for party.controls; or controls: { …all of them })
//   on a "Connect a phone" screen:  phones.drawCard(ctx, x, y)       (opens the room the first time)
//   a menu item for it:             phones.menuItem                  ({ id: 'phones', label: 'Connect a phone' })
//   change the layout any time:     phones.controls({ layout: 'dpad' })   (or (settings, id) for one phone)
//   who's connected:                phones.count, phones.players
//
// Nothing else changes: input.update(dt) drives it. The room only opens when the card is drawn (or
// phones.open() is called), so nobody who plays with a controller ever touches the network; in the
// launcher, it also opens at the start when the launcher has remote phones connected, and they come
// in by themselves. New phones get in only while the card is showing and for 30 seconds after (or
// after that start): then the room locks, so nobody who learns the code later can join, while phones
// already in can still come back. Phones
// reach the game through the relay; a phone that drops (locked screen, Wi-Fi change) keeps its seat
// for two minutes, its pad reads as disconnected meanwhile, and input.onPause fires when it drops.
import { createParty } from './party.js'
import { drawQr, makeQr } from './qr.js'

/** How long the room stays open to new phones after the card was last shown, or after it opened for the launcher's phones. */
const JOIN_WINDOW_MS = 30_000

const BUTTONS = ['a', 'b', 'x', 'y', 'lb', 'rb', 'lt', 'rt', 'select', 'start', 'up', 'down', 'left', 'right', 'menu']

export function connectPhones(input, { layout = 'classic', labels, hide, theme, knocks, controls = null, max = 4 } = {}) {
  const settings = controls ?? { layout, ...(labels ? { labels } : {}), ...(hide ? { hide } : {}), ...(theme ? { theme } : {}), ...(knocks ? { knocks } : {}) }
  const party = createParty({ input: null, minPlayers: 1, maxPlayers: max, localPlayers: false, controls: settings })
  /** Phone id → its pad in input.pads. */
  const pads = new Map()
  let qr = null
  let qrFor = ''
  /** New phones may join until then (see the top of this file). */
  let joinUntil = 0
  const letIn = () => (joinUntil = Date.now() + JOIN_WINDOW_MS)

  function read(id) {
    const pad = party.pad(id)
    if (!pad.connected) return { connected: false }
    // A press the phone squeezed between two messages still shows: held for this one frame.
    const held = BUTTONS.filter((b) => pad.held(b) || pad.pressed(b))
    // The slider reads as the stick (x) already; the trackpad has no stick.
    return { connected: true, x: pad.x, y: pad.y, aimX: pad.aimX, aimY: pad.aimY, held }
  }
  /** Every phone in the party has a pad (after a reload of this page, they come back without a join). */
  function sync() {
    for (const p of party.players) if (p.kind === 'phone' && !pads.has(p.id)) pads.set(p.id, input.addPad(() => read(p.id)))
    for (const [id, pad] of pads) {
      if (party.player(id)) continue
      input.removePad(pad)
      pads.delete(id)
    }
  }
  party.on('join', sync)
  party.on('open', sync)
  party.on('leave', sync)
  // A phone that drops (screen locked, Wi-Fi gone) pauses the game, as a controller unplugged would.
  party.on('away', (p) => p.kind === 'phone' && input.padLost())
  input.onUpdate(() => {
    party.update()
    if (party.status === 'open') {
      const open = Date.now() < joinUntil
      if (open && party.locked) party.unlock()
      else if (!open && !party.locked) party.lock()
    }
    if (party.players.length !== pads.size) sync()
  })

  const phones = {
    party,
    /** A menu item for the title and pause menus; open the card when it's picked. */
    menuItem: { id: 'phones', label: 'Connect a phone' },
    get status() {
      return party.status
    },
    get code() {
      return party.code
    },
    get joinUrl() {
      return party.joinUrl
    },
    /** Phones in the game, connected or not. */
    get players() {
      return party.players.filter((p) => p.kind === 'phone')
    },
    get count() {
      return phones.players.filter((p) => p.connected).length
    },
    /** The input.pads entry of a phone, by player id. */
    padOf: (id) => pads.get(id) ?? null,
    open() {
      letIn()
      party.open()
    },
    close() {
      party.close()
      sync()
    },
    controls: (value, id) => party.controls(value, id),
    on: (type, fn) => party.on(type, fn),

    /**
     * The card that tells players how to connect: the QR code, the room code and the join address,
     * and who's connected. Draws at (x, y), size × 1 is 420×540; opens the room the first time.
     */
    drawCard(ctx, x, y, { size = 1, font = 'system-ui, sans-serif', ink = '#eef0f5', quiet = '#9aa3b5', accent = '#ffb547', panel = 'rgba(13,15,20,0.86)', title = 'Play with your phone' } = {}) {
      letIn()
      if (party.status === 'idle') party.open()
      const W = 420
      const H = 540
      ctx.save()
      ctx.translate(x, y)
      ctx.scale(size, size)
      ctx.fillStyle = panel
      ctx.beginPath()
      ctx.roundRect(0, 0, W, H, 22)
      ctx.fill()
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = ink
      ctx.font = `800 30px ${font}`
      ctx.fillText(title, W / 2, 44)
      if (party.code && party.joinUrl) {
        if (qrFor !== party.joinUrl) {
          qr = makeQr(party.joinUrl)
          qrFor = party.joinUrl
        }
        // drawQr draws its own light quiet zone around the code.
        const px = Math.max(2, Math.floor(250 / (qr.size + 8)))
        const side = drawQr(ctx, qr, Math.round(W / 2 - ((qr.size + 8) * px) / 2), 80, px)
        const below = 80 + side + 34
        ctx.fillStyle = quiet
        ctx.font = `600 18px ${font}`
        ctx.fillText(`Scan it, or open ${host(party.joinUrl)}`, W / 2, below)
        ctx.fillText('and type', W / 2, below + 26)
        ctx.fillStyle = accent
        ctx.font = `900 46px ${font}`
        ctx.fillText(party.code.split('').join(' '), W / 2, below + 72)
        const list = phones.players
        ctx.font = `600 18px ${font}`
        ctx.fillStyle = list.length ? ink : quiet
        const names = list.map((p) => (p.connected ? p.name : `${p.name} (away)`)).join(', ')
        ctx.fillText(list.length ? `Connected: ${clip(ctx, names, W - 40)}` : 'No phones yet', W / 2, H - 30)
      } else {
        ctx.fillStyle = party.status === 'error' ? accent : quiet
        ctx.font = `600 20px ${font}`
        wrap(ctx, party.status === 'error' ? party.error : 'Opening a room…', W / 2, H / 2, W - 60, 28)
      }
      ctx.restore()
    }
  }
  // The launcher's remote phones are waiting: open now, so they're pads the moment the game starts.
  if (party.phonesWaiting > 0) phones.open()
  if (typeof window !== 'undefined') window.__kitPhones = { phones, input } // the build check reads this
  return phones
}

function host(url) {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}
function clip(ctx, text, width) {
  if (ctx.measureText(text).width <= width) return text
  while (text.length > 1 && ctx.measureText(`${text}…`).width > width) text = text.slice(0, -1)
  return `${text}…`
}
function wrap(ctx, text, x, y, width, line) {
  const words = String(text).split(' ')
  const lines = ['']
  for (const w of words) {
    const next = lines.at(-1) ? `${lines.at(-1)} ${w}` : w
    if (ctx.measureText(next).width > width && lines.at(-1)) lines.push(w)
    else lines[lines.length - 1] = next
  }
  lines.forEach((l, i) => ctx.fillText(l, x, y + (i - (lines.length - 1) / 2) * line))
}
