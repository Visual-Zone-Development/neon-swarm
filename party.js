// pushplay runtime v24 — shared runtime file, replaced by update-runtime; don't edit
// Party games: the game runs on the TV (a handheld or PC plugged into it), and players join from
// their phones or any browser: scan the QR code or type the room code on the join page. Local
// controllers can join too, so a party game works with phones, pads, or both.
//
// The TV runs everything. Phones show a controller: one of the shared layouts (controller-layouts.js,
// the same in every game) when the game passes `controls`, or else the game's own controller.html.
// Either way it shows what the TV sends it and sends back controls and choices.
//
//   const party = createParty({ input, minPlayers: 3, maxPlayers: 8, controls: 'classic' })
//   each frame, after input.update(dt):  party.update()
//   players:   party.players → [{ id, name, color, kind: 'phone' | 'local', connected }]
//   layout:    party.controls({ layout: 'twin', labels: { rt: 'Fire' } })   every phone
//              party.controls({ layout: 'choices', choices: [...] }, id)    one phone
//              classic | twin | dpad | tap | swipe | slider | trackpad | choices | motion (pad = classic, A and B)
//   controls:  party.pad(id) → { x, y, aimX, aimY, value, pointer, held(b), pressed(b), released(b) }
//              the same for a phone and a controller plugged into the TV: read players through it
//              party.inputs[id] → { x, y, a, b, … } (what a custom controller.html sent, as sent)
//              party.pressed(id, 'a')
//   phones see:
//     party.public.round = 2            everyone's phone (never put secrets here)
//     party.view(id).hand = ['A♠']      only that player's phone
//     anything else stays on the TV
//   messages:  party.send(id, data) / party.send(null, data)    party.on('msg', ({ from, data }) => …)
//   events:    party.on('join' | 'leave' | 'away' | 'back' | 'open' | 'end' | 'msg', fn)
//
// public and views are sent as changes only, a few times a second: write them freely. A phone
// that drops (locked screen, Wi-Fi change) keeps its seat for two minutes and gets everything
// again when it's back; party.inputs[id] is cleared meanwhile, so it stands still.
//
// Phones reach the TV through the relay. Where both sides can, a phone's input also takes a direct
// link (WebRTC, introduced through the relay): about 5-20 ms on the same Wi-Fi instead of 50-150.
// Input goes both ways and the first copy wins, so nothing is lost if the direct link drops;
// party.players[i].link says which way it's coming ('direct' | 'relay'). Turn it off with
// createParty({ direct: false }); give stun: ['stun:…'] to try a direct link across networks too.
//
// In the launcher, the party tells it the room's code when it opens (and when it closes), and the
// launcher sends the phones that are its remote straight in: no second code to scan. Their players
// join like anyone else. party.phonesWaiting is how many there were when the game started.
//
// Everything a phone sends comes from whoever is holding it. party.pad(id) checks and clamps it;
// party.inputs[id] and party.on('msg') data are as sent, so check them before using them.
import { diff, snapshot } from './net.js'

export const PARTY_VERSION = 1

/** Time between updates to phones. Phones show menus and cards, not 60 fps action. */
const TICK_MS = 50
/** Controller pages go out in pieces under the relay's message limit… */
const CHUNK_CHARS = 12_000
/** …and slowly enough to leave room for the game when many phones join at once. */
const CONTROLLER_BYTES_PER_SEC = 96 * 1024
const LOCAL_RELAY_PORT = 5174
const COLORS = ['#ffb547', '#ff6b6b', '#4dd8a8', '#5aa9ff', '#c38bff', '#ff8fd0', '#f5e663', '#8ce05a']
/** A local controller's buttons in party.inputs (x and y are the stick there; party.pad(id).held('x') has the button). */
const PAD_BUTTONS = ['a', 'b', 'lb', 'rb', 'lt', 'rt', 'select', 'start', 'up', 'down', 'left', 'right', 'menu']
/** Keys of the shared layouts' message that aren't buttons. */
const WIRE_KEYS = new Set(['n', 'x', 'y', 'ax', 'ay', 'h', 'c', 'p', 'v'])
/** A direct link not open by then isn't coming (the relay carries input meanwhile anyway). */
const DIRECT_WAIT_MS = 8000
const LAYOUT_NAMES = ['classic', 'pad', 'twin', 'dpad', 'tap', 'swipe', 'slider', 'trackpad', 'choices', 'motion']

const CLOSE_REASONS = {
  4003: "This build can't go online. Rebuild it to get a fresh online pass.",
  4008: 'Online play is resting until tomorrow.',
  4009: 'Too many connections from this network.',
  4029: 'The game sent too much data.'
}

/** The launcher's game API, when the game runs in the launcher. */
const launcherApi = () => (typeof window === 'undefined' ? undefined : window['pushplay'])

export function createParty({ input = null, minPlayers = 2, maxPlayers = 8, localPlayers = true, controls = null, direct = true, stun = [] } = {}) {
  let ws = null
  let closing = false
  let resume = session('get')
  let retry = 0
  let retryTimer = null
  let lastTick = 0
  let lastPublic = {}
  let lastViews = {}
  let sentPlayers = ''
  let controller = null // { html, hash } once loaded
  let controllerLoad = null
  let outbox = [] // controller pieces: [to, d]
  let budget = 0
  let lastUpdate = 0
  let incoming = {} // phone id → buttons pressed since the last update
  let taps = {}
  /** Phones' controls as the shared layouts send them, by id: what party.pad(id) reads. */
  const phonePads = {}
  const pads = {}
  /** Shared layouts (controls given) or the game's own controller.html. */
  const shared = Boolean(controls)
  /** Direct links to phones, by id: { pc, dc, ready, early } (see the top of this file). */
  const links = {}
  /** The newest input message number taken from each phone (either way it came). */
  const lastSeq = {}
  const stunServers = (Array.isArray(stun) ? stun : []).filter((u) => typeof u === 'string' && /^stuns?:/.test(u))
  const listeners = {}
  /** The room code last told to the launcher (see the top of this file). */
  let announced = null
  function announce(code) {
    if (code === announced) return
    announced = code
    try {
      launcherApi()?.phoneRoom?.(code ? { code } : null)
    } catch {}
  }

  const party = {
    /** idle | connecting | open | reconnecting | error */
    status: 'idle',
    error: '',
    /** Room code, and the link the QR code points at. */
    code: null,
    joinUrl: '',
    minPlayers,
    maxPlayers,
    localPlayers,
    players: [],
    inputs: {},
    /** Shared with every phone. */
    public: {},
    /** Each player's private view, by id. party.view(id) creates one. */
    views: {},
    locked: false,
    /** The launcher's remote phones connected when the game started: they come into the room by themselves. */
    get phonesWaiting() {
      return Math.max(0, Number(launcherApi()?.phonesWaiting) || 0)
    },

    view: (id) => (party.views[id] ??= {}),
    player: (id) => party.players.find((p) => p.id === id),
    /** 0, 1, 2… in join order: for colours and spawn points. */
    slot: (id) => party.players.findIndex((p) => p.id === id),

    /** True on the frame a player's button went down. */
    pressed(id, button) {
      const p = party.player(id)
      if (p?.kind === 'local') return Boolean(input?.pads[p.pad]?.pressed(button))
      return Boolean(taps[id]?.has(button))
    },

    /**
     * Which shared layout the phones show, and how: party.controls('twin'), or
     * party.controls({ layout: 'classic', labels: { a: 'Jump' }, hide: ['y'], theme: { accent: '#4dd8a8' } }).
     * With an id, only that player's phone (their settings win over everyone's; null clears them).
     */
    controls(settings, id = null) {
      const value = typeof settings === 'string' ? { layout: settings } : settings
      if (value?.layout && !LAYOUT_NAMES.includes(value.layout)) console.warn(`party.controls: no layout called "${value.layout}" (${LAYOUT_NAMES.join(', ')})`)
      if (id) {
        if (value) party.view(id).controls = value
        else delete party.view(id).controls
      } else if (value) party.public.controls = value
      else delete party.public.controls
    },

    /**
     * A player's controls as a gamepad, whether they hold a phone or a controller plugged into the
     * TV: x, y (left stick or d-pad), aimX, aimY (right stick), value (slider, 0..1, or null),
     * pointer ({ x, y, dx, dy, down } from the trackpad, x and y 0..1 across the screen, or null),
     * held(b), pressed(b), released(b). Buttons: a b x y lb rb lt rt up down left right menu.
     */
    pad(id) {
      const p = party.player(id)
      if (!p) return EMPTY_PAD
      return (pads[id] ??= p.kind === 'local' ? localPad(p) : phonePad(id))
    },

    on(type, fn) {
      ;(listeners[type] ??= []).push(fn)
      return () => (listeners[type] = listeners[type].filter((f) => f !== fn))
    },

    /** Open the party (the lobby does this). */
    open() {
      if (ws || party.status === 'open') return
      closing = false
      controllerLoad ??= loadController(shared)
      connect()
    },
    /** End the party: phones are told the game ended. */
    close() {
      closing = true
      clearTimeout(retryTimer)
      send({ t: 'leave' })
      ws?.close(1000)
      ws = null
      resume = null
      session('set', null)
      party.status = 'idle'
      party.code = null
      announce(null)
      for (const id of Object.keys(links)) closeLink(id)
      party.players = party.players.filter((p) => p.kind === 'local')
    },

    /** A one-off message to one phone, or every phone (to = null). */
    send(to, data) {
      send({ t: 'send', ...(to ? { to } : {}), d: { k: 'm', d: data } })
    },
    /** Stop new players joining (dropped players can still come back). */
    lock() {
      party.locked = true
      send({ t: 'lock' })
    },
    unlock() {
      party.locked = false
      send({ t: 'unlock' })
    },
    kick(id) {
      const p = party.player(id)
      if (p?.kind === 'local') removePlayer(id)
      else send({ t: 'kick', id })
    },

    /** A controller on this machine joins as a player (the lobby calls this when a pad presses A). */
    addLocal(pad) {
      const id = `local${pad}`
      if (party.player(id) || party.players.length >= maxPlayers) return null
      const p = { id, name: `Player ${party.players.length + 1}`, color: freeColor(), kind: 'local', connected: true, pad }
      party.players.push(p)
      party.inputs[id] = {}
      emit('join', p)
      return p
    },

    /** Call once per frame, after input.update(dt) and before the game reads inputs. */
    update(now = performance.now()) {
      taps = incoming
      incoming = {}
      for (const p of party.players) {
        if (p.kind !== 'local') continue
        const pad = input?.pads[p.pad]
        if (!pad) continue
        const v = { x: pad.x, y: pad.y, aimX: pad.aimX, aimY: pad.aimY }
        for (const b of PAD_BUTTONS) v[b] = pad.held(b)
        party.inputs[p.id] = v
      }
      for (const ps of Object.values(phonePads)) frame(ps)

      // Controller pages, paced.
      const dt = lastUpdate ? Math.min(0.25, (now - lastUpdate) / 1000) : 0
      lastUpdate = now
      budget = Math.min(CONTROLLER_BYTES_PER_SEC, budget + dt * CONTROLLER_BYTES_PER_SEC)
      while (outbox.length && budget > 0) {
        const [to, d] = outbox.shift()
        budget -= d.s.length
        send({ t: 'send', to, d })
      }

      if (party.status !== 'open' || now - lastTick < TICK_MS) return
      lastTick = now
      const pub = snapshot(party.public)
      const ops = diff(lastPublic, pub)
      if (ops.length) send({ t: 'send', d: { k: 'p', p: ops } })
      lastPublic = pub
      for (const p of party.players) {
        if (p.kind !== 'phone' || !p.connected || !lastViews[p.id]) continue
        const v = snapshot(party.views[p.id] ?? {})
        const vops = diff(lastViews[p.id], v)
        if (vops.length) send({ t: 'send', to: p.id, d: { k: 'v', p: vops } })
        lastViews[p.id] = v
      }
      const list = playerList()
      if (list !== sentPlayers) {
        sentPlayers = list
        send({ t: 'send', d: { k: 'pl', players: JSON.parse(list) } })
      }
    }
  }

  function emit(type, payload) {
    for (const fn of listeners[type] ?? []) fn(payload)
  }

  function playerList() {
    return JSON.stringify(party.players.map(({ id, name, color, kind, connected }) => ({ id, name, color, kind, connected })))
  }

  function freeColor() {
    return COLORS.find((c) => !party.players.some((p) => p.color === c)) ?? COLORS[party.players.length % COLORS.length]
  }

  function send(msg) {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
  }

  async function connect() {
    party.status = party.status === 'reconnecting' ? 'reconnecting' : 'connecting'
    party.error = ''
    const address = await relayAddress()
    if (closing) return
    if (!address) return fail("This build isn't set up for party play.")
    const socket = new WebSocket(address)
    ws = socket
    socket.onopen = () => send({ t: 'party-host', max: maxPlayers, ...(resume ? { resume } : {}) })
    socket.onmessage = (e) => receive(JSON.parse(e.data))
    socket.onclose = (e) => {
      if (ws !== socket || closing) return
      ws = null
      if (CLOSE_REASONS[e.code] || party.status === 'connecting') return fail(CLOSE_REASONS[e.code] ?? "Can't reach the game server. Check your connection.")
      // Dropped mid-party: the relay keeps it for a minute, so get back in with the same code.
      party.status = 'reconnecting'
      if (retry > 6) return fail('Lost the connection to the game server.')
      retryTimer = setTimeout(connect, Math.min(8000, 500 * 2 ** retry++))
    }
  }

  function fail(message) {
    party.status = 'error'
    party.error = message
    emit('end', message)
  }

  function receive(msg) {
    switch (msg.t) {
      case 'party': {
        const fresh = msg.room !== party.code
        party.code = msg.room
        party.joinUrl = msg.join ?? ''
        resume = msg.resume
        session('set', resume)
        party.status = 'open'
        retry = 0
        if (fresh) {
          lastPublic = {}
          lastViews = {}
          party.players = party.players.filter((p) => p.kind === 'local')
        }
        // After a TV reload the seats are still there; their phones say hello again.
        for (const s of msg.players) {
          const p = party.player(s.id)
          if (p) p.connected = !s.away
          else addPhone(s, !s.away)
        }
        sentPlayers = ''
        if (party.locked) send({ t: 'lock' })
        announce(party.code)
        emit('open', party.code)
        return
      }
      case 'peer-join':
        return emit('join', addPhone(msg, true))
      case 'peer-away':
      case 'peer-back': {
        const p = party.player(msg.id)
        if (!p) return
        p.connected = msg.t === 'peer-back'
        party.inputs[p.id] = {}
        if (phonePads[p.id]) phonePads[p.id].held = new Set()
        if (!p.connected) delete lastViews[p.id]
        return emit(p.connected ? 'back' : 'away', p)
      }
      case 'peer-leave':
        return removePlayer(msg.id)
      case 'closed':
        ws?.close(1000)
        ws = null
        resume = null
        session('set', null)
        announce(null)
        return fail(msg.reason === 'idle' ? 'The party closed after a quiet spell.' : 'The party closed.')
      case 'error':
        if (msg.code === 'busy') fail('The server is busy. Try again soon.')
        return
      case 'msg':
        return fromPhone(msg.from, msg.d)
    }
  }

  function addPhone({ id, name, color }, connected) {
    // Everyone gets their own colour: a phone whose pick is taken gets a free one.
    const taken = !color || party.players.some((p) => p.color === color)
    const p = { id, name, color: taken ? freeColor() : color, kind: 'phone', connected, link: 'relay' }
    party.players.push(p)
    party.inputs[id] = {}
    return p
  }

  function phoneState(id) {
    return (phonePads[id] ??= { n: null, counts: {}, held: new Set(), now: new Set(), before: new Set(), x: 0, y: 0, ax: 0, ay: 0, v: null, total: null, move: [0, 0], pointer: null })
  }

  /** Once per update: this frame's held buttons, and the trackpad's movement since the last frame. */
  function frame(ps) {
    ps.before = ps.now
    ps.now = new Set(ps.held)
    if (ps.pointer) {
      const [dx, dy] = ps.move
      ps.move = [0, 0]
      // The trackpad sends movement in its own widths; on screen, the same distance up and across.
      const aspect = typeof innerWidth === 'number' && innerHeight ? innerWidth / innerHeight : 16 / 9
      ps.pointer.dx = dx
      ps.pointer.dy = dy * aspect
      ps.pointer.x = Math.max(0, Math.min(1, ps.pointer.x + ps.pointer.dx))
      ps.pointer.y = Math.max(0, Math.min(1, ps.pointer.y + ps.pointer.dy))
    }
  }

  function phonePad(id) {
    const ps = phoneState(id)
    return {
      kind: 'phone',
      get connected() {
        return Boolean(party.player(id)?.connected)
      },
      get x() { return ps.x },
      get y() { return ps.y },
      get aimX() { return ps.ax },
      get aimY() { return ps.ay },
      get value() { return ps.v },
      get pointer() { return ps.pointer },
      held: (b) => ps.now.has(b),
      pressed: (b) => Boolean(taps[id]?.has(b)),
      released: (b) => ps.before.has(b) && !ps.now.has(b)
    }
  }

  function localPad(p) {
    const pad = () => input?.pads[p.pad]
    return {
      kind: 'local',
      get connected() { return Boolean(pad()?.connected) },
      get x() { return pad()?.x ?? 0 },
      get y() { return pad()?.y ?? 0 },
      get aimX() { return pad()?.aimX ?? 0 },
      get aimY() { return pad()?.aimY ?? 0 },
      value: null,
      pointer: null,
      held: (b) => Boolean(pad()?.held(b)),
      pressed: (b) => Boolean(pad()?.pressed(b)),
      released: (b) => Boolean(pad()?.released?.(b))
    }
  }

  /**
   * A shared layout's message: { n, x, y, ax, ay, h: [held], c: { button: presses so far }, p, v }.
   * Presses are counted on the phone, so one the network squeezed between two messages still
   * shows as pressed for a frame; n changes when the phone reloads, and counting starts again.
   */
  function readPad(from, w) {
    const ps = phoneState(from)
    const tap = (b) => (incoming[from] ??= new Set()).add(b)
    if (w.n !== ps.n) {
      ps.n = w.n
      ps.counts = {}
      ps.total = null
    }
    if (w.c && typeof w.c === 'object') {
      for (const [b, n] of Object.entries(w.c)) {
        if (typeof n !== 'number') continue
        if (n > (ps.counts[b] ?? 0)) tap(b)
        ps.counts[b] = n
      }
    }
    const shared = Array.isArray(w.h)
    const held = shared ? w.h.filter((b) => typeof b === 'string') : Object.keys(w).filter((k) => w[k] === true)
    ps.held = new Set(held)
    const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0)
    ps.x = num(w.x)
    ps.y = num(w.y)
    ps.ax = num(w.ax)
    ps.ay = num(w.ay)
    ps.v = typeof w.v === 'number' ? Math.max(0, Math.min(1, w.v)) : null
    if (w.p && typeof w.p === 'object') {
      ps.pointer ??= { x: 0.5, y: 0.5, dx: 0, dy: 0, down: false }
      const x = Number(w.p.x) || 0
      const y = Number(w.p.y) || 0
      // Totals: the movement is the difference, so a lost message loses nothing.
      if (ps.total) ps.move = [ps.move[0] + x - ps.total[0], ps.move[1] + y - ps.total[1]]
      ps.total = [x, y]
      ps.pointer.down = Boolean(w.p.d)
    } else ps.total = null
    if (!shared && !('c' in w)) return w
    // What party.inputs shows for it: the old { x, y, a, b } shape plus the rest by name.
    const out = {}
    for (const [k, v] of Object.entries(w)) if (!WIRE_KEYS.has(k)) out[k] = v
    Object.assign(out, { x: ps.x, y: ps.y })
    if (shared) {
      Object.assign(out, { aimX: ps.ax, aimY: ps.ay })
      if (ps.v !== null) out.value = ps.v
      for (const b of held) if (b !== 'x' && b !== 'y') out[b] = true
    }
    return out
  }

  function removePlayer(id) {
    const p = party.player(id)
    if (!p) return
    party.players = party.players.filter((x) => x !== p)
    closeLink(id)
    delete lastSeq[id]
    delete party.inputs[id]
    delete phonePads[id]
    delete pads[id]
    delete party.views[id]
    delete lastViews[id]
    emit('leave', p)
  }

  async function fromPhone(from, d) {
    const p = party.player(from)
    if (!p || !d || typeof d !== 'object') return
    if (d.k === 'i') {
      // Numbered input comes twice (direct and relay): take the first copy, drop the late one.
      if (typeof d.q === 'number') {
        if (d.q <= (lastSeq[from] ?? -1)) return
        lastSeq[from] = d.q
      }
      const next = d.i && typeof d.i === 'object' ? d.i : {}
      const before = party.inputs[from] ?? {}
      const shown = readPad(from, next)
      for (const [b, v] of Object.entries(shown)) if (v === true && !before[b]) (incoming[from] ??= new Set()).add(b)
      party.inputs[from] = shown
    } else if (d.k === 'm') emit('msg', { from, data: d.d })
    else if (d.k === 'rtc') fromPhoneRtc(from, d)
    else if (d.k === 'hi') {
      p.connected = true
      // A fresh page (or the same one back): its numbers start again, and so does its direct link.
      lastSeq[from] = -1
      if (d.rtc) openLink(from)
      await sendController(from, d.h)
      // Everything, once; after that, the same changes as everyone else.
      send({ t: 'send', to: from, d: { k: 'P', s: lastPublic } })
      lastViews[from] = snapshot(party.views[from] ?? {})
      send({ t: 'send', to: from, d: { k: 'V', s: lastViews[from] } })
      send({ t: 'send', to: from, d: { k: 'pl', players: JSON.parse(playerList()) } })
    }
  }

  // ---- the direct link (WebRTC) to each phone, for input only ----------------------------------

  function setLink(id, way) {
    const p = party.player(id)
    if (p?.kind === 'phone') p.link = way
  }

  /** Offer a phone a data channel; the join page answers through the relay. */
  function openLink(id) {
    closeLink(id)
    if (!direct || typeof RTCPeerConnection !== 'function') return
    try {
      const pc = new RTCPeerConnection({ iceServers: stunServers.map((urls) => ({ urls })) })
      const dc = pc.createDataChannel('input', { ordered: false, maxRetransmits: 0 })
      const link = { pc, dc, ready: false, early: [], timer: null }
      links[id] = link
      dc.onopen = () => {
        clearTimeout(link.timer)
        if (links[id] === link) setLink(id, 'direct')
      }
      dc.onclose = () => links[id] === link && closeLink(id)
      dc.onmessage = (e) => {
        if (links[id] !== link || typeof e.data !== 'string' || e.data.length > 4096) return
        try {
          const d = JSON.parse(e.data)
          if (d?.k === 'i') fromPhone(id, d)
        } catch {}
      }
      pc.onicecandidate = (e) => e.candidate && links[id] === link && send({ t: 'send', to: id, d: { k: 'rtc', c: e.candidate.toJSON() } })
      pc.onconnectionstatechange = () => ['failed', 'closed'].includes(pc.connectionState) && links[id] === link && closeLink(id)
      link.timer = setTimeout(() => links[id] === link && dc.readyState !== 'open' && closeLink(id), DIRECT_WAIT_MS)
      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .then(() => links[id] === link && send({ t: 'send', to: id, d: { k: 'rtc', sdp: pc.localDescription.toJSON(), s: stunServers } }))
        .catch(() => closeLink(id))
    } catch {
      closeLink(id)
    }
  }

  function fromPhoneRtc(id, d) {
    const link = links[id]
    if (!link) return
    if (d.sdp) {
      link.pc
        .setRemoteDescription(d.sdp)
        .then(() => {
          link.ready = true
          for (const c of link.early.splice(0)) link.pc.addIceCandidate(c).catch(() => {})
        })
        .catch(() => closeLink(id))
    } else if (d.c) {
      if (link.ready) link.pc.addIceCandidate(d.c).catch(() => {})
      else link.early.push(d.c)
    }
  }

  function closeLink(id) {
    const link = links[id]
    if (!link) return
    delete links[id]
    clearTimeout(link.timer)
    try {
      link.pc.close()
    } catch {}
    setLink(id, 'relay')
  }

  async function sendController(to, have) {
    controller ??= await controllerLoad
    if (!controller) return
    const { html, hash } = controller
    outbox = outbox.filter(([id]) => id !== to)
    if (have === hash) return send({ t: 'send', to, d: { k: 'cb', h: hash, n: 0 } })
    const n = Math.ceil(html.length / CHUNK_CHARS)
    for (let i = 0; i < n; i++) outbox.push([to, { k: 'cb', h: hash, i, n, s: html.slice(i * CHUNK_CHARS, (i + 1) * CHUNK_CHARS) }])
  }

  if (controls) party.controls(controls)
  if (typeof window !== 'undefined') window.__kitParty = party // the build check reads this
  return party
}

const EMPTY_PAD = Object.freeze({ kind: 'none', connected: false, x: 0, y: 0, aimX: 0, aimY: 0, value: null, pointer: null, held: () => false, pressed: () => false, released: () => false })

/**
 * The page phones get: the shared layouts (the same page in every game on this kit, so a phone
 * that has played one already has it), or the game's controller.html; the controller runtime first.
 */
async function loadController(shared) {
  const inline = (js) => `<script>${js.replace(/<\/script/gi, '<\\/script')}</script>`
  try {
    if (shared) {
      const [runtime, layouts] = await Promise.all([text(new URL('./controller.js', import.meta.url)), text(new URL('./controller-layouts.js', import.meta.url))])
      const html = `<!doctype html><html><head><meta charset="utf-8">${inline(runtime)}</head><body>${inline(layouts)}</body></html>`
      return { html, hash: hash(html) }
    }
    const [page, runtime] = await Promise.all([text(new URL('controller.html', document.baseURI)), text(new URL('./controller.js', import.meta.url))])
    const script = inline(runtime)
    const html = /<head[^>]*>/i.test(page) ? page.replace(/<head[^>]*>/i, (m) => m + script) : script + page
    return { html, hash: hash(html) }
  } catch (err) {
    console.warn(shared ? 'party: controller-layouts.js is missing (run update-runtime), so phones have nothing to show' : 'party: no controller.html, so phones have nothing to show (or pass controls to createParty for a shared layout)', err)
    return null
  }
}

async function text(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} → ${res.status}`)
  return res.text()
}

/** A short fingerprint (cyrb53), so phones can keep a controller they already have. */
function hash(s) {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

/** Where the relay is: __net.json (written into the build), else a relay running next to the game. */
async function relayAddress() {
  try {
    const res = await fetch(new URL('__net.json', document.baseURI))
    if (res.ok) {
      const { url, token } = await res.json()
      if (url) return `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token ?? '')}`
    }
  } catch {}
  if (['localhost', '127.0.0.1'].includes(location.hostname)) return `ws://${location.hostname}:${LOCAL_RELAY_PORT}/?game=local`
  return null
}

/** The TV keeps its party through a reload. */
function session(op, value) {
  const key = `party-resume:${location.pathname}`
  try {
    if (op === 'get') return sessionStorage.getItem(key)
    if (value === null) sessionStorage.removeItem(key)
    else sessionStorage.setItem(key, value)
  } catch {}
  return null
}
