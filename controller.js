// pushplay runtime v21 — shared runtime file, replaced by update-runtime; don't edit
// The phone side of a party game. party.js (on the TV) puts this script at the top of the
// game's controller.html and sends the page to each phone, where it runs with no network: it
// talks only to the TV, through the join page. It defines a global `controller`:
//
//   controller.me          { id, name, color, room }
//   controller.players     [{ id, name, color, kind, connected }]
//   controller.public      what the TV shares with every phone (party.public)
//   controller.mine        what the TV shows only this phone (party.view(id))
//   controller.on('update', fn)        after any of the above change
//   controller.on('msg', fn)           one-off messages from the TV (party.send)
//   controller.input({ x, y, a, b })   held controls; sent when they change (party.inputs[id])
//   controller.send(data)              a one-off message to the TV (party.on('msg'))
//   controller.vibrate(ms)
//
// While the TV's lobby is open (public.lobby), a built-in screen shows who's in and gives the
// first player a Start button. Set controller.lobbyScreen = false to draw your own.
//
// While the TV has a menu open (public.menu, published by phone-menus.js: pause, settings, results),
// a built-in screen shows it as buttons, so nobody has to touch the TV; taps go back as
// { menu: { id } }, { menu: { id, step } } or { menu: { back: true } }. Set
// controller.menuScreen = false to draw your own.
//
// When the TV asks this phone for the safety card (mine.safety = { title?, tips?: [{ title, text }] },
// set by a motion game before the first motion), a built-in card covers the screen until the player
// taps I'm ready, which sends { safe: true }. Set controller.safetyScreen = false to draw your own.
;(() => {
  const listeners = {}
  const SEND_MS = 33
  let sentInput = '{}'
  let nextInput = null
  let inputTimer = null

  const controller = {
    me: { id: null, name: '', color: '#ffb547', room: '' },
    players: [],
    public: {},
    mine: {},
    lobbyScreen: true,
    menuScreen: true,
    safetyScreen: true,
    on(type, fn) {
      ;(listeners[type] ??= []).push(fn)
      return () => (listeners[type] = listeners[type].filter((f) => f !== fn))
    },
    input(value) {
      nextInput = JSON.stringify(value ?? {})
      if (inputTimer === null) flushInput()
    },
    send(data) {
      parent.postMessage({ type: 'send', d: { k: 'm', d: data } }, '*')
    },
    vibrate(ms = 30) {
      parent.postMessage({ type: 'vibrate', ms }, '*')
    }
  }

  /** At most one input message per SEND_MS; the newest value always gets through. */
  function flushInput() {
    inputTimer = null
    if (nextInput === null || nextInput === sentInput) return
    sentInput = nextInput
    parent.postMessage({ type: 'send', d: { k: 'i', i: JSON.parse(sentInput) } }, '*')
    inputTimer = setTimeout(flushInput, SEND_MS)
  }

  const emit = (type, payload) => {
    for (const fn of listeners[type] ?? []) fn(payload)
  }

  addEventListener('message', (e) => {
    if (e.source !== parent || !e.data) return
    if (e.data.type === 'me') {
      controller.me = { ...e.data.me, color: controller.players.find((p) => p.id === e.data.me.id)?.color ?? e.data.me.color }
      return changed()
    }
    if (e.data.type !== 'msg') return
    const d = e.data.d
    if (d.k === 'P') controller.public = d.s
    else if (d.k === 'p') controller.public = applyPatch(controller.public, d.p)
    else if (d.k === 'V') controller.mine = d.s
    else if (d.k === 'v') controller.mine = applyPatch(controller.mine, d.p)
    else if (d.k === 'pl') {
      controller.players = d.players
      // The TV may have given us a different colour (ours was taken).
      const mine = d.players.find((p) => p.id === controller.me.id)
      if (mine) controller.me = { ...controller.me, color: mine.color }
    }
    else if (d.k === 'm') return emit('msg', d.d)
    else return
    changed()
  })

  function changed() {
    lobby()
    menuOverlay()
    safetyCard()
    emit('update', controller)
  }

  // ---- built-in lobby screen -------------------------------------------------------------

  let screen = null
  function lobby() {
    const l = controller.public.lobby
    if (!l || !controller.lobbyScreen) {
      screen?.remove()
      screen = null
      return
    }
    if (!screen) {
      screen = document.createElement('div')
      screen.style.cssText =
        'position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;padding:24px;background:#0d0f14;color:#eef0f5;font:18px/1.4 system-ui,sans-serif;text-align:center'
      document.body.append(screen)
    }
    const vip = l.vip === controller.me.id
    const others = controller.players.filter((p) => p.id !== controller.me.id)
    screen.replaceChildren()
    const h = document.createElement('div')
    h.style.cssText = `font-size:28px;font-weight:800;color:${controller.me.color || '#ffb547'}`
    h.textContent = `You're in, ${controller.me.name}!`
    const who = document.createElement('div')
    who.style.color = '#9aa3b5'
    who.textContent = others.length ? `With ${others.map((p) => p.name).join(', ')}` : 'Waiting for others to join…'
    screen.append(h, who)
    if (vip && l.canStart) {
      const b = document.createElement('button')
      b.textContent = 'Everybody’s in — start!'
      b.style.cssText = 'font:inherit;font-size:22px;font-weight:800;padding:16px 28px;border:0;border-radius:14px;background:#ffb547;color:#1b1404'
      b.onclick = () => {
        controller.send({ $start: true })
        controller.vibrate(20)
      }
      screen.append(b)
    } else {
      const wait = document.createElement('div')
      wait.style.color = '#9aa3b5'
      wait.textContent = vip ? `Need ${l.need} more to start` : 'The game starts from the TV or the first player’s phone.'
      screen.append(wait)
    }
  }

  // ---- built-in menu screen --------------------------------------------------------------

  const INK = '#eef0f5'
  const QUIET = '#9aa3b5'
  const BUTTON = 'font:inherit;font-weight:800;border:0;border-radius:14px;color:#eef0f5;background:#1b1f29;'
  const overlay = (z) => {
    const el = document.createElement('div')
    el.style.cssText = `position:fixed;inset:0;z-index:${z};display:flex;flex-direction:column;gap:10px;padding:22px 18px calc(22px + env(safe-area-inset-bottom, 0px));background:#0d0f14;color:${INK};font:18px/1.35 system-ui,sans-serif;overflow-y:auto`
    document.body.append(el)
    return el
  }
  let menuEl = null
  let menuKey = ''
  function menuOverlay() {
    const m = controller.public.menu
    if (!m || !controller.menuScreen || controller.public.lobby) {
      menuEl?.remove()
      menuEl = null
      menuKey = ''
      return
    }
    const key = JSON.stringify([m, controller.me.color])
    if (menuEl && key === menuKey) return
    menuKey = key
    menuEl ??= overlay(2147483646)
    menuEl.setAttribute('role', 'dialog')
    menuEl.setAttribute('aria-label', m.title || 'Menu')
    const accent = controller.me.color || '#ffb547'
    const tap = (msg) => () => {
      controller.send({ menu: msg })
      controller.vibrate(10)
    }
    const h = document.createElement('div')
    h.style.cssText = `font-size:28px;font-weight:800;color:${accent};margin-bottom:4px`
    h.textContent = m.title || 'Menu'
    const rows = (m.items ?? []).map((it) => {
      const sel = it.id === m.sel ? `outline:3px solid ${accent};` : ''
      if (it.value === null || it.value === undefined) {
        const b = document.createElement('button')
        b.textContent = it.label
        b.style.cssText = `${BUTTON}${sel}min-height:56px;padding:10px 18px;text-align:left;font-size:20px`
        b.onclick = tap({ id: it.id })
        return b
      }
      const row = document.createElement('div')
      row.style.cssText = `display:flex;align-items:center;gap:8px;background:#1b1f29;border-radius:14px;padding:6px 6px 6px 18px;font-weight:800;${sel}`
      const label = document.createElement('span')
      label.style.flex = '1'
      label.textContent = it.label
      const step = (d, text) => {
        const b = document.createElement('button')
        b.textContent = text
        b.setAttribute('aria-label', `${it.label}: ${d < 0 ? 'less' : 'more'}`)
        b.style.cssText = `${BUTTON}background:#262b36;min-height:48px;width:52px;font-size:24px`
        b.onclick = tap({ id: it.id, step: d })
        return b
      }
      const value = document.createElement('span')
      value.style.cssText = `min-width:76px;text-align:center;color:${accent}`
      value.textContent = it.value
      row.append(label, step(-1, '‹'), value, step(1, '›'))
      return row
    })
    menuEl.replaceChildren(h, ...rows)
  }

  // ---- built-in safety card -------------------------------------------------------------

  const TIPS = [
    { title: 'Give yourself room', text: 'Keep clear of people, pets, the TV and lamps: a full swing reaches further than you think.' },
    { title: 'Hold on tight', text: 'Keep a firm grip on your phone the whole time. A grippy case or a wrist strap helps.' },
    { title: 'Smooth beats wild', text: 'A controlled motion reads just as well as a wild one. Never let go of the phone.' }
  ]
  let safetyEl = null
  let safetySent = false
  function safetyCard() {
    const ask = controller.mine.safety
    if (!ask) safetySent = false // asked again later (a new party): show it again
    if (!ask || safetySent || !controller.safetyScreen || controller.public.lobby) {
      safetyEl?.remove()
      safetyEl = null
      return
    }
    if (safetyEl) return
    safetyEl = overlay(2147483645)
    safetyEl.setAttribute('role', 'dialog')
    safetyEl.setAttribute('aria-label', ask.title || 'Before you move')
    const h = document.createElement('div')
    h.style.cssText = 'font-size:28px;font-weight:800;color:#ffd23f'
    h.textContent = ask.title || 'Before you move'
    const tips = (Array.isArray(ask.tips) && ask.tips.length ? ask.tips : TIPS).map((t) => {
      const d = document.createElement('div')
      d.style.cssText = 'background:#1b1f29;border-radius:16px;padding:14px 16px'
      const b = document.createElement('div')
      b.style.cssText = 'font-weight:800;font-size:20px'
      b.textContent = t.title
      const p = document.createElement('div')
      p.style.cssText = `color:${QUIET};font-weight:600;font-size:16px`
      p.textContent = t.text
      d.append(b, p)
      return d
    })
    const ok = document.createElement('button')
    ok.textContent = 'I’m ready'
    ok.style.cssText = `${BUTTON}margin-top:auto;min-height:66px;font-size:24px;background:#b6f04a;color:#0d0f14`
    ok.onclick = () => {
      safetySent = true
      controller.send({ safe: true })
      controller.vibrate(20)
      safetyCard()
    }
    safetyEl.append(h, ...tips, ok)
  }

  // Same as net.js applyPatch: [path, value] sets, [path] deletes.
  function applyPatch(root, ops) {
    root = structuredClone(root)
    for (const [path, value] of ops) {
      const deleting = value === undefined
      if (!path.length) {
        root = deleting ? {} : value
        continue
      }
      let node = root
      for (let i = 0; i < path.length - 1; i++) {
        if (node[path[i]] === null || typeof node[path[i]] !== 'object') node[path[i]] = typeof path[i + 1] === 'number' ? [] : {}
        node = node[path[i]]
      }
      const key = path.at(-1)
      if (deleting) delete node[key]
      else node[key] = value
    }
    return root
  }

  window.controller = controller
  // Ready once the page's own scripts have run and registered their listeners.
  let ready = false
  const announce = () => {
    if (ready) return
    ready = true
    parent.postMessage({ type: 'ready' }, '*')
  }
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', announce)
  else setTimeout(announce)
})()
