// pushplay runtime v23 — shared runtime file, replaced by update-runtime; don't edit
// The shared phone controllers. A game with no controller.html of its own gets this page on every
// phone (party.js puts controller.js and this file together), so every game on this kit shows the
// same, tested controllers, and a phone that played one game already has the page cached.
//
// The TV picks a layout and adjusts it with party.controls(settings) (everyone) or
// party.controls(settings, id) (one player). They arrive here as controller.public.controls and
// controller.mine.controls (the player's own wins):
//
//   layout   classic | twin | dpad | tap | swipe | slider | trackpad | choices | motion   (pad = classic with only A and B)
//   labels   { a: 'Jump', b: 'Dash' }       text on the buttons (short: 1-6 characters reads best)
//   hide     ['x', 'y']                     buttons to leave out
//   pause    false                          no pause button in the top bar
//   prompt, card, choices, picked           what the choices and motion layouts show
//   vertical, spring, speed                 slider: upright track, spring back to the middle; trackpad: speed
//   btn, cfg                                motion: the big button's label, swing tuning (see motion.js)
//   knocks   true, or { left: 'lb', right: 'rb', thr }: a sharp knock on the phone's left or right
//            edge (or the top edge near that end) is one press of that button: lt/rt on twin, lb/rb
//            elsewhere. Presses only, never held; uses the motion sensors (iPhones ask first) and
//            ignores the jolt of a screen tap. Never the only way to do something: keep a button.
//   theme    { accent, bg, fg, button, font, radius, icons: { a: '<svg…>' } }
//            font: system | rounded | serif | mono | condensed (phones get no network, so no web fonts)
//
// What a layout sends (controller.input), and party.pad(id) on the TV turns back into a gamepad:
//   { n, x, y, ax, ay, h: ['a', 'lb'], c: { a: 3, left: 1 }, p: { x, y, d }, v }
//   n   this page's id, so the TV notices a reload and starts counting again
//   x y the left stick or d-pad, -1..1        ax ay  the right stick (twin)
//   h   buttons held now                      c      presses so far, per button: a press the network
//                                                     squeezed between two messages still counts
//   p   trackpad totals (surface widths) and whether a finger is down
//   v   slider value, 0..1
// The motion layout sends motion.js's own fields (tb, tg, u, gx, gy, m, a, st, still, ph) instead.
;(() => {
  const C = window.controller
  if (!C) return

  const FONTS = {
    system: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    rounded: 'ui-rounded, "SF Pro Rounded", "Nunito", system-ui, sans-serif',
    serif: 'ui-serif, Georgia, "Times New Roman", serif',
    mono: 'ui-monospace, Menlo, Consolas, monospace',
    condensed: '"Arial Narrow", "Roboto Condensed", system-ui, sans-serif'
  }
  const LABELS = { a: 'A', b: 'B', x: 'X', y: 'Y', lb: 'LB', rb: 'RB', lt: 'LT', rt: 'RT' }
  const ALIASES = { pad: { layout: 'classic', hide: ['x', 'y'] } }
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
  const r2 = (v) => Math.round(v * 100) / 100
  const r3 = (v) => Math.round(v * 1000) / 1000

  // ---- what this phone holds, and sending it ---------------------------------------------------

  const st = { n: Math.random().toString(36).slice(2, 7), x: 0, y: 0, ax: 0, ay: 0, h: new Set(), c: {}, p: null, v: null, own: null }

  function wire() {
    if (st.own) return { ...st.own, n: st.n, ...(Object.keys(st.c).length ? { c: { ...st.c } } : {}) }
    const w = { n: st.n, x: r2(st.x), y: r2(st.y) }
    if (st.ax || st.ay) Object.assign(w, { ax: r2(st.ax), ay: r2(st.ay) })
    if (st.h.size) w.h = [...st.h]
    if (Object.keys(st.c).length) w.c = { ...st.c }
    if (st.p) w.p = { x: r3(st.p.x), y: r3(st.p.y), d: st.p.d }
    if (st.v !== null) w.v = r3(st.v)
    return w
  }
  const push = () => C.input(wire())
  const count = (b) => (st.c[b] = (st.c[b] ?? 0) + 1)
  /** A button goes down: held, counted, felt. */
  function press(b, buzz = 12) {
    count(b)
    st.h.add(b)
    if (buzz) C.vibrate(buzz)
    push()
  }
  function release(b) {
    if (st.h.delete(b)) push()
  }
  /** A press with no hold (a swipe, a tap on a trackpad, the pause button). */
  function tap(b, buzz = 10) {
    count(b)
    if (buzz) C.vibrate(buzz)
    push()
  }
  /** Let go of everything (layout change, phone hidden). Press counts carry on. */
  function letGo() {
    st.x = st.y = st.ax = st.ay = 0
    st.h.clear()
    if (st.p) st.p.d = false
    st.own = null
    push()
  }

  // ---- settings and theme ----------------------------------------------------------------------

  const asObject = (v) => (typeof v === 'string' ? { layout: v } : v && typeof v === 'object' ? v : {})
  function settings() {
    const pub = asObject(C.public.controls)
    const mine = asObject(C.mine.controls)
    let s = { ...pub, ...mine, labels: { ...pub.labels, ...mine.labels }, theme: { ...pub.theme, ...mine.theme } }
    const alias = ALIASES[s.layout]
    if (alias) s = { ...s, layout: alias.layout, hide: s.hide ?? alias.hide }
    if (!LAYOUTS[s.layout]) s.layout = 'classic'
    s.hide = Array.isArray(s.hide) ? s.hide : []
    return s
  }
  const shown = (s, b) => !s.hide.includes(b)
  const label = (s, b) => String(s.labels[b] ?? LABELS[b] ?? b.toUpperCase())
  /** An icon the game gave for a button: inline SVG only, small. */
  const icon = (s, b) => {
    const svg = s.theme.icons?.[b]
    return typeof svg === 'string' && /^\s*<svg[\s>]/i.test(svg) && svg.length <= 2048 ? svg : null
  }

  function applyTheme(s) {
    const t = s.theme
    const css = root.style
    css.setProperty('--pp-accent', t.accent || C.me.color || '#ffb547')
    css.setProperty('--pp-me', C.me.color || '#ffb547')
    css.setProperty('--pp-bg', t.bg || '#0d0f14')
    css.setProperty('--pp-fg', t.fg || '#eef0f5')
    css.setProperty('--pp-button', t.button || '#262b36')
    css.setProperty('--pp-font', FONTS[t.font] ?? FONTS.system)
    css.setProperty('--pp-radius', `${clamp(Number(t.radius ?? 50), 0, 50)}%`)
    document.body.style.background = t.bg || '#0d0f14'
  }

  // ---- the page --------------------------------------------------------------------------------

  const style = document.createElement('style')
  style.textContent = `
    html, body { margin: 0; height: 100%; overflow: hidden; background: #0d0f14; overscroll-behavior: none; }
    #pp { position: fixed; inset: 0; display: flex; flex-direction: column; background: var(--pp-bg); color: var(--pp-fg); font: 600 18px/1.3 var(--pp-font);
      touch-action: none; user-select: none; -webkit-user-select: none; -webkit-tap-highlight-color: transparent;
      padding: env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px) env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px); }
    #pp * { box-sizing: border-box; }
    #pp button { font: inherit; color: inherit; border: 0; }
    .pp-bar { display: flex; align-items: center; gap: 10px; padding: 6px 12px; min-height: 50px; flex: none; }
    .pp-chip { padding: 5px 12px; border-radius: 999px; background: var(--pp-button); font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
    .pp-chip:empty { display: none; }
    .pp-chip.on { background: #8ce05a; color: #0d0f14; } .pp-chip.warn { background: #ffb547; color: #0d0f14; } .pp-chip.bad { background: #ff6b6b; color: #0d0f14; }
    .pp-pause { margin-left: auto; width: 48px; height: 44px; border-radius: 12px; background: var(--pp-button); font-size: 20px; }
    /* Landscape layouts have no bar: every pixel of height goes to the sticks and buttons, and the
       pause button floats in a spot the layout keeps clear (top centre; the trackpad: over its buttons). */
    #pp.pp-float .pp-bar { position: absolute; top: 0; left: 0; right: 0; min-height: 0; padding: 0; z-index: 5; pointer-events: none; }
    #pp.pp-float .pp-chip { display: none; }
    #pp.pp-float .pp-pause { position: absolute; top: 6px; left: 50%; margin: 0 0 0 -24px; pointer-events: auto; background: color-mix(in srgb, var(--pp-button) 85%, transparent); }
    #pp.pp-float[data-layout="trackpad"] .pp-pause { left: auto; right: calc(24px + var(--cell) / 2 - 24px); margin: 0; }
    .pp-stage { position: relative; flex: 1; min-height: 0; }
    .pp-hint { position: absolute; left: 0; right: 0; bottom: 8px; text-align: center; color: color-mix(in srgb, var(--pp-fg) 55%, transparent); font-size: 14px; pointer-events: none; }
    .pp-zone { position: absolute; top: 0; bottom: 0; }
    .pp-base { position: absolute; width: 150px; height: 150px; margin: -75px; border-radius: 50%; border: 3px solid color-mix(in srgb, var(--pp-fg) 18%, transparent); left: 50%; top: 50%; pointer-events: none; }
    .pp-knob { position: absolute; width: 70px; height: 70px; margin: -35px; border-radius: 50%; background: var(--pp-accent); left: 50%; top: 50%; pointer-events: none; }
    .pp-cap { position: absolute; left: 0; right: 0; bottom: 10px; text-align: center; font-size: 13px; opacity: 0.5; pointer-events: none; text-transform: uppercase; letter-spacing: 0.08em; }
    #pp { --pp-top: 50px; --cell: min(84px, calc((100vh - var(--pp-top) - 16px) / 3.2)); --big: min(104px, calc((100vh - var(--pp-top) - 16px) / 2.6)); }
    #pp.pp-float { --pp-top: 0px; }
    .pp-btn { display: grid; place-items: center; width: 96px; height: 96px; border-radius: var(--pp-radius); background: var(--pp-button); font-size: 30px; font-weight: 800; padding: 0; touch-action: none; }
    #pp .pp-btn.main { background: var(--pp-accent); color: #0d0f14; }
    .pp-btn.long { font-size: 18px; }
    .pp-btn svg { width: 56%; height: 56%; fill: currentColor; }
    .pp-btn.down { filter: brightness(0.75); transform: scale(0.94); }
    .pp-face { position: absolute; right: 0; top: 0; bottom: 0; width: 50%; display: grid; place-content: center; }
    .pp-diamond { display: grid; grid-template-columns: repeat(3, var(--cell)); grid-template-rows: repeat(3, var(--cell)); gap: 4px; }
    .pp-diamond .pp-btn { width: var(--cell); height: var(--cell); font-size: calc(var(--cell) * 0.31); }
    .pp-diamond .pp-btn.long { font-size: calc(var(--cell) * 0.21); }
    .pp-pair { display: grid; grid-template-columns: auto auto; gap: calc(var(--big) / 4); align-items: center; }
    .pp-pair .pp-btn { width: var(--big); height: var(--big); font-size: calc(var(--big) * 0.32); }
    .pp-pair .pp-btn.long { font-size: calc(var(--big) * 0.2); }
    .pp-pair .pp-btn:first-child { transform: translateY(calc(var(--big) / -4)); } .pp-pair .pp-btn:last-child { transform: translateY(calc(var(--big) / 4)); }
    .pp-pair .pp-btn:only-child { transform: none; }
    .pp-pair .pp-btn.down:first-child { transform: translateY(calc(var(--big) / -4)) scale(0.94); } .pp-pair .pp-btn.down:last-child { transform: translateY(calc(var(--big) / 4)) scale(0.94); }
    .pp-trig { position: absolute; top: 0; height: 52px; width: 30%; border-radius: 0 0 18px 18px; background: var(--pp-button); font-size: 18px; font-weight: 800; }
    #pp .pp-trig.down { background: var(--pp-accent); color: #0d0f14; }
    #pp[data-layout="twin"] .pp-base, #pp[data-layout="twin"] .pp-knob { top: 58%; }
    .pp-cross { position: absolute; width: 210px; height: 210px; left: 25%; top: 50%; margin: -105px; touch-action: none; }
    .pp-cross i { position: absolute; background: var(--pp-button); border-radius: 12px; display: grid; place-items: center; font-style: normal; font-size: 24px; }
    .pp-cross { width: min(210px, calc(100vh - var(--pp-top) - 32px)); height: min(210px, calc(100vh - var(--pp-top) - 32px)); margin: calc(min(210px, calc(100vh - var(--pp-top) - 32px)) / -2); }
    .pp-tcol { position: absolute; right: 24px; top: 0; bottom: 0; display: flex; flex-direction: column; justify-content: flex-end; gap: 16px; padding-bottom: 16px; }
    .pp-tcol .pp-btn { width: var(--cell); height: var(--cell); font-size: calc(var(--cell) * 0.31); }
    .pp-cross i.down { background: var(--pp-accent); color: #0d0f14; }
    #pp .pp-full { position: absolute; inset: 10px; border-radius: 28px; background: var(--pp-accent); color: #0d0f14; font-size: 56px; font-weight: 900; display: grid; place-items: center; text-align: center; }
    .pp-full.down { filter: brightness(0.8); }
    .pp-surface { position: absolute; inset: 10px; border-radius: 24px; border: 3px dashed color-mix(in srgb, var(--pp-fg) 25%, transparent); display: grid; place-items: center; text-align: center; color: color-mix(in srgb, var(--pp-fg) 55%, transparent); }
    .pp-surface.down { border-color: var(--pp-accent); }
    .pp-arrow { font-size: 96px; color: var(--pp-accent); opacity: 0; transition: opacity 0.25s; }
    .pp-arrow.show { opacity: 1; transition: none; }
    .pp-track { position: absolute; border-radius: 999px; background: var(--pp-button); }
    .pp-thumb { position: absolute; width: 76px; height: 76px; margin: -38px; border-radius: 50%; background: var(--pp-accent); pointer-events: none; }
    .pp-choices { position: absolute; inset: 0; overflow-y: auto; touch-action: pan-y; display: flex; flex-direction: column; gap: 12px; padding: 8px 18px 22px; max-width: 560px; margin: 0 auto; }
    .pp-prompt { font-size: 26px; font-weight: 800; }
    .pp-card { background: var(--pp-button); border-radius: 16px; padding: 12px 16px; }
    .pp-choice { min-height: 60px; padding: 14px 18px; border-radius: 14px; background: var(--pp-button); text-align: left; font-size: 20px; font-weight: 800; }
    #pp .pp-choice.picked { background: var(--pp-accent); color: #0d0f14; }
    .pp-motion { position: absolute; inset: 0; display: flex; flex-direction: column; gap: 12px; padding: 4px 16px 16px; max-width: 560px; margin: 0 auto; }
    .pp-motion .pp-mstage { flex: 1; min-height: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; }
    .pp-motion .pp-big { width: min(74vw, 44vh, 320px); aspect-ratio: 1; height: auto; border-radius: 50%; font-size: 40px; }
    .pp-motion .pp-mpad:not([hidden]) ~ .pp-big { width: min(60vw, 22vh, 220px); font-size: 28px; }
    .pp-mpad { width: min(84vw, 34vh, 380px); aspect-ratio: 1; border-radius: 24px; background: var(--pp-button); border: 3px dashed color-mix(in srgb, var(--pp-fg) 30%, transparent); position: relative; touch-action: none; }
    .pp-mpad .pp-knob { width: 60px; height: 60px; margin: -30px; }
    .pp-meter { position: relative; width: min(80vw, 340px); height: 18px; border-radius: 9px; background: var(--pp-button); overflow: hidden; }
    .pp-meter .fill { position: absolute; inset: 0 auto 0 0; width: 0; background: #5aa9ff; }
    .pp-meter .thr { position: absolute; top: 0; bottom: 0; width: 4px; background: #ffb547; }
    .pp-meter.hit .fill { background: #8ce05a; }
    .pp-center { min-height: 56px; border-radius: 16px; background: var(--pp-button); font-weight: 800; }
    .pp-knock { position: absolute; top: 0; bottom: 0; width: 14px; background: var(--pp-accent); opacity: 0; pointer-events: none; transition: opacity 0.3s; z-index: 4; }
    .pp-knock.left { left: 0; border-radius: 0 10px 10px 0; } .pp-knock.right { right: 0; border-radius: 10px 0 0 10px; }
    .pp-knock.show { opacity: 0.9; transition: none; }
    #pp [hidden] { display: none !important; }
  `
  document.head.append(style)

  const el = (tag, cls, text) => {
    const e = document.createElement(tag)
    if (cls) e.className = cls
    if (text !== undefined) e.textContent = text
    return e
  }
  const root = el('div')
  root.id = 'pp'
  const bar = el('div', 'pp-bar')
  // The join page around this frame already shows the player's colour and name.
  const chip = el('span', 'pp-chip')
  const pauseBtn = el('button', 'pp-pause', '❚❚')
  pauseBtn.setAttribute('aria-label', 'Pause')
  pauseBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    tap('menu', 20)
  })
  bar.append(chip, pauseBtn)
  const stage = el('div', 'pp-stage')
  const hint = el('div', 'pp-hint', 'Turn your phone sideways for more room')
  root.append(bar, stage)

  const status = (text = '', cls = '') => {
    chip.textContent = text
    chip.className = `pp-chip ${cls}`
  }

  // ---- building blocks -------------------------------------------------------------------------

  /** A button that holds `b` while pressed. */
  function button(s, b, main = false) {
    const e = el('button', `pp-btn${main ? ' main' : ''}`)
    const svg = icon(s, b)
    if (svg) e.innerHTML = svg
    else e.textContent = label(s, b)
    if (!svg && label(s, b).length > 2) e.classList.add('long')
    e.dataset.b = b
    e.setAttribute('aria-label', label(s, b))
    const down = (ev) => {
      ev.preventDefault()
      if (st.h.has(b)) return
      e.classList.add('down')
      press(b)
    }
    const up = () => {
      e.classList.remove('down')
      release(b)
    }
    e.addEventListener('pointerdown', down)
    for (const t of ['pointerup', 'pointercancel', 'pointerleave']) e.addEventListener(t, up)
    return e
  }

  /** A floating stick: wherever the thumb lands in the zone becomes its centre. */
  function stick(zone, onMove, caption) {
    const base = el('div', 'pp-base')
    const knob = el('div', 'pp-knob')
    zone.append(base, knob)
    if (caption) zone.append(el('div', 'pp-cap', caption))
    const R = 60
    const DEAD = 0.12
    let id = null
    let cx = 0
    let cy = 0
    const place = (e, x, y) => Object.assign(e.style, { left: `${x}px`, top: `${y}px` })
    zone.addEventListener('pointerdown', (e) => {
      if (id !== null) return
      id = e.pointerId
      zone.setPointerCapture?.(id)
      const r = zone.getBoundingClientRect()
      cx = e.clientX - r.left
      cy = e.clientY - r.top
      place(base, cx, cy)
      place(knob, cx, cy)
    })
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return
      const r = zone.getBoundingClientRect()
      let dx = e.clientX - r.left - cx
      let dy = e.clientY - r.top - cy
      const d = Math.hypot(dx, dy)
      if (d > R) [dx, dy] = [(dx / d) * R, (dy / d) * R]
      place(knob, cx + dx, cy + dy)
      // A small dead zone, then the full range: resting thumbs don't drift.
      const m = Math.min(1, d / R)
      const k = m < DEAD ? 0 : (m - DEAD) / (1 - DEAD) / (m || 1)
      onMove((dx / R) * k, (dy / R) * k)
    })
    const end = (e) => {
      if (e.pointerId !== id) return
      id = null
      place(knob, cx, cy)
      onMove(0, 0)
    }
    zone.addEventListener('pointerup', end)
    zone.addEventListener('pointercancel', end)
  }

  /** Face buttons: a diamond (A bottom, B right, X left, Y top) or, with two or fewer, a pair. */
  function face(s, buttons = ['a', 'b', 'x', 'y']) {
    const wrap = el('div', 'pp-face')
    const on = buttons.filter((b) => shown(s, b))
    if (on.length <= 2) {
      const pair = el('div', 'pp-pair')
      // B up and to the left of A, like a pad held in two thumbs.
      for (const b of ['b', 'a', 'x', 'y'].filter((b) => on.includes(b))) pair.append(button(s, b, b === 'a'))
      wrap.append(pair)
      return wrap
    }
    const grid = el('div', 'pp-diamond')
    const spots = { y: [1, 2], x: [2, 1], b: [2, 3], a: [3, 2] }
    for (const b of on) {
      const e = button(s, b, b === 'a')
      e.style.gridRow = spots[b][0]
      e.style.gridColumn = spots[b][1]
      grid.append(e)
    }
    wrap.append(grid)
    return wrap
  }

  const halves = () => {
    const left = el('div', 'pp-zone')
    left.style.cssText = 'left:0;width:50%'
    return left
  }

  // ---- the layouts -----------------------------------------------------------------------------
  // Each mounts into the stage and returns { update?(s), destroy?() }. A settings change that keeps
  // the layout remounts it (cheap), except where update() keeps state that matters (motion).

  const LAYOUTS = {
    classic: {
      orient: 'landscape',
      mount(s) {
        const left = halves()
        stick(left, (x, y) => ((st.x = x), (st.y = y), push()))
        stage.append(left, face(s))
      }
    },

    twin: {
      orient: 'landscape',
      mount(s) {
        const left = halves()
        const right = el('div', 'pp-zone')
        right.style.cssText = 'right:0;width:50%'
        stick(left, (x, y) => ((st.x = x), (st.y = y), push()), 'move')
        stick(right, (x, y) => ((st.ax = x), (st.ay = y), push()), 'aim')
        stage.append(left, right)
        for (const [b, side] of [['lt', 'left'], ['rt', 'right']]) {
          if (!shown(s, b)) continue
          const t = button(s, b)
          t.className = 'pp-trig'
          t.style[side] = '12px'
          stage.append(t)
        }
      }
    },

    dpad: {
      orient: 'landscape',
      mount(s) {
        const cross = el('div', 'pp-cross')
        const arms = {}
        const geo = { up: [70, 0, 70, 80, '▲'], down: [70, 130, 70, 80, '▼'], left: [0, 70, 80, 70, '◀'], right: [130, 70, 80, 70, '▶'] }
        for (const [d, [x, y, w, h, t]] of Object.entries(geo)) {
          const arm = el('i', '', t)
          const pc = (v) => `${(v / 210) * 100}%` // drawn on a 210 grid, sized with the cross
          Object.assign(arm.style, { left: pc(x), top: pc(y), width: pc(w), height: pc(h) })
          arms[d] = arm
          cross.append(arm)
        }
        // The thumb can roll from one direction to the next (and onto diagonals) without lifting.
        let id = null
        const set = (dirs) => {
          for (const d of Object.keys(arms)) {
            const on = dirs.includes(d)
            arms[d].classList.toggle('down', on)
            if (on && !st.h.has(d)) {
              count(d)
              st.h.add(d)
              C.vibrate(8)
            } else if (!on) st.h.delete(d)
          }
          st.x = (dirs.includes('right') ? 1 : 0) - (dirs.includes('left') ? 1 : 0)
          st.y = (dirs.includes('down') ? 1 : 0) - (dirs.includes('up') ? 1 : 0)
          push()
        }
        const read = (e) => {
          const r = cross.getBoundingClientRect()
          const dx = e.clientX - (r.left + r.width / 2)
          const dy = e.clientY - (r.top + r.height / 2)
          if (Math.hypot(dx, dy) < r.width * 0.12) return set([])
          // Eight slices of 45°: the diagonals hold two directions.
          const slice = Math.round(Math.atan2(dy, dx) / (Math.PI / 4))
          const DIRS = { 0: ['right'], 1: ['right', 'down'], 2: ['down'], 3: ['down', 'left'], 4: ['left'], '-4': ['left'], '-3': ['left', 'up'], '-2': ['up'], '-1': ['up', 'right'] }
          set(DIRS[slice] ?? [])
        }
        cross.addEventListener('pointerdown', (e) => {
          if (id !== null) return
          id = e.pointerId
          cross.setPointerCapture?.(id)
          read(e)
        })
        cross.addEventListener('pointermove', (e) => e.pointerId === id && read(e))
        const end = (e) => {
          if (e.pointerId !== id) return
          id = null
          set([])
        }
        cross.addEventListener('pointerup', end)
        cross.addEventListener('pointercancel', end)
        stage.append(cross, face(s, ['a', 'b']))
      }
    },

    tap: {
      orient: 'portrait',
      mount(s) {
        const b = 'a'
        const pad = el('button', 'pp-full')
        const svg = icon(s, b)
        if (svg) pad.innerHTML = svg
        else pad.textContent = s.labels.a ?? 'TAP'
        pad.setAttribute('aria-label', label(s, b))
        // Every finger that lands is a press (fast drumming with two thumbs counts every tap);
        // the button is held while any finger is down.
        const fingers = new Set()
        pad.addEventListener('pointerdown', (e) => {
          e.preventDefault()
          fingers.add(e.pointerId)
          pad.classList.add('down')
          press(b)
        })
        const up = (e) => {
          fingers.delete(e.pointerId)
          if (fingers.size) return
          pad.classList.remove('down')
          release(b)
        }
        for (const t of ['pointerup', 'pointercancel']) pad.addEventListener(t, up)
        stage.append(pad)
      }
    },

    swipe: {
      orient: 'portrait',
      mount(s) {
        const surface = el('div', 'pp-surface')
        const arrow = el('div', 'pp-arrow')
        const help = el('div', '', s.prompt ?? 'Swipe to move · tap for A')
        help.style.cssText = 'position:absolute;bottom:18px;left:0;right:0;font-size:16px'
        surface.append(arrow, help)
        const ARROWS = { up: '↑', down: '↓', left: '←', right: '→' }
        let g = null
        let fade = null
        surface.addEventListener('pointerdown', (e) => {
          if (g) return
          surface.setPointerCapture?.(e.pointerId)
          g = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), swiped: false }
          surface.classList.add('down')
        })
        surface.addEventListener('pointermove', (e) => {
          if (!g || e.pointerId !== g.id) return
          const dx = e.clientX - g.x
          const dy = e.clientY - g.y
          const r = surface.getBoundingClientRect()
          // Far enough: a swipe. The gesture starts again from here, so one long drag that turns a
          // corner is two swipes (snake turns, sliding blocks twice).
          if (Math.hypot(dx, dy) < Math.max(34, Math.min(r.width, r.height) * 0.08)) return
          const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up'
          tap(dir, 12)
          arrow.textContent = ARROWS[dir]
          arrow.classList.add('show')
          clearTimeout(fade)
          fade = setTimeout(() => arrow.classList.remove('show'), 60)
          Object.assign(g, { x: e.clientX, y: e.clientY, swiped: true })
        })
        const end = (e) => {
          if (!g || e.pointerId !== g.id) return
          if (!g.swiped && performance.now() - g.t < 350 && shown(s, 'a')) tap('a', 15)
          g = null
          surface.classList.remove('down')
        }
        surface.addEventListener('pointerup', end)
        surface.addEventListener('pointercancel', end)
        stage.append(surface)
        return { destroy: () => clearTimeout(fade) }
      }
    },

    slider: {
      orient: 'any',
      mount(s) {
        const upright = Boolean(s.vertical)
        const track = el('div', 'pp-track')
        const thumb = el('div', 'pp-thumb')
        const withA = shown(s, 'a')
        // The track runs along the long side, leaving room for A at the end.
        Object.assign(track.style, upright ? { left: '50%', width: '22px', marginLeft: '-11px', top: '48px', bottom: withA ? '170px' : '48px' } : { top: '45%', height: '22px', marginTop: '-11px', left: '48px', right: withA ? '170px' : '48px' })
        stage.append(track, thumb)
        if (withA) {
          const a = button(s, 'a', true)
          Object.assign(a.style, { position: 'absolute' }, upright ? { left: '50%', bottom: '40px', marginLeft: '-48px' } : { right: '40px', top: '45%', marginTop: '-48px' })
          stage.append(a)
        }
        const show = () => {
          const r = track.getBoundingClientRect()
          const sr = stage.getBoundingClientRect()
          const v = st.v ?? 0.5
          thumb.style.left = `${upright ? r.left + r.width / 2 - sr.left : r.left - sr.left + v * r.width}px`
          thumb.style.top = `${upright ? r.top - sr.top + (1 - v) * r.height : r.top + r.height / 2 - sr.top}px`
        }
        const setV = (v) => {
          st.v = clamp(v, 0, 1)
          st.x = upright ? 0 : st.v * 2 - 1
          st.y = upright ? 1 - st.v * 2 : 0
          show()
          push()
        }
        st.v ??= 0.5
        // Anywhere on the stage except the A button moves the slider: a big target for a thumb.
        let id = null
        const read = (e) => {
          const r = track.getBoundingClientRect()
          setV(upright ? 1 - (e.clientY - r.top) / r.height : (e.clientX - r.left) / r.width)
        }
        const onDown = (e) => {
          if (id !== null || e.target.closest('.pp-btn')) return
          id = e.pointerId
          stage.setPointerCapture?.(id)
          read(e)
        }
        const onMove = (e) => e.pointerId === id && read(e)
        const onUp = (e) => {
          if (e.pointerId !== id) return
          id = null
          if (s.spring) setV(0.5)
        }
        stage.addEventListener('pointerdown', onDown)
        stage.addEventListener('pointermove', onMove)
        stage.addEventListener('pointerup', onUp)
        stage.addEventListener('pointercancel', onUp)
        addEventListener('resize', show)
        requestAnimationFrame(show)
        push()
        return {
          destroy() {
            stage.removeEventListener('pointerdown', onDown)
            stage.removeEventListener('pointermove', onMove)
            stage.removeEventListener('pointerup', onUp)
            stage.removeEventListener('pointercancel', onUp)
            removeEventListener('resize', show)
            st.v = null
          }
        }
      }
    },

    trackpad: {
      orient: 'landscape',
      mount(s) {
        const surface = el('div', 'pp-surface', s.prompt ?? 'Drag to move · tap to click')
        const side = ['a', 'b'].filter((b) => shown(s, b))
        // A and B at the bottom of their column, under the thumb; the pause button sits above them.
        surface.style.right = side.length ? 'calc(var(--cell) + 48px)' : '10px'
        const col = el('div', 'pp-tcol')
        for (const b of [...side].reverse()) col.append(button(s, b, b === 'a')) // B above, A at the bottom
        stage.append(surface, col)
        st.p ??= { x: 0, y: 0, d: false }
        const speed = clamp(Number(s.speed ?? 1), 0.1, 5)
        const fingers = new Map()
        let lastTouch = 0
        let two = null // a two-finger tap in progress
        surface.addEventListener('pointerdown', (e) => {
          surface.setPointerCapture?.(e.pointerId)
          fingers.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 })
          if (fingers.size === 2) two = { t: performance.now(), moved: 0 }
          st.p.d = true
          surface.classList.add('down')
          push()
        })
        surface.addEventListener('pointermove', (e) => {
          const f = fingers.get(e.pointerId)
          if (!f) return
          const dx = e.clientX - f.x
          const dy = e.clientY - f.y
          f.x = e.clientX
          f.y = e.clientY
          f.moved += Math.hypot(dx, dy)
          if (two) two.moved += Math.hypot(dx, dy)
          // Only the first finger moves the cursor; totals in surface widths, so a lost message loses nothing.
          if (fingers.keys().next().value !== e.pointerId || fingers.size > 1) return
          const w = surface.getBoundingClientRect().width || 1
          // Faster moves go further (pointer acceleration), like a laptop's trackpad.
          const v = Math.hypot(dx, dy)
          const accel = 1 + Math.min(2, v / 25)
          st.p.x += (dx / w) * speed * accel
          st.p.y += (dy / w) * speed * accel
          push()
        })
        const up = (e) => {
          const f = fingers.get(e.pointerId)
          if (!f) return
          fingers.delete(e.pointerId)
          const now = performance.now()
          if (two && !fingers.size) {
            if (now - two.t < 300 && two.moved < 24) tap('b', 15)
            two = null
            lastTouch = now
          } else if (!two && !fingers.size && now - f.t < 250 && f.moved < 10 && now - lastTouch > 80) tap('a', 15)
          if (!fingers.size) {
            st.p.d = false
            surface.classList.remove('down')
            push()
          }
        }
        surface.addEventListener('pointerup', up)
        surface.addEventListener('pointercancel', up)
        return { destroy: () => (st.p = null) }
      }
    },

    choices: {
      orient: 'portrait',
      mount(s) {
        const box = el('div', 'pp-choices')
        stage.append(box)
        const render = (s) => {
          const prompt = s.prompt ?? C.public.prompt ?? 'Look at the TV!'
          const card = s.card ?? (C.mine.secret ? `Your secret: ${C.mine.secret}` : null)
          const list = s.choices ?? C.public.choices ?? []
          const picked = s.picked ?? C.mine.picked
          const kids = [el('div', 'pp-prompt', prompt)]
          if (card) kids.push(el('div', 'pp-card', card))
          list.forEach((c, i) => {
            const b = el('button', `pp-choice${picked === i ? ' picked' : ''}`, typeof c === 'object' && c ? String(c.label ?? '') : String(c))
            b.addEventListener('click', () => {
              C.send({ pick: i })
              C.vibrate(15)
            })
            kids.push(b)
          })
          box.replaceChildren(...kids)
        }
        render(s)
        return { update: render }
      }
    },

    motion: {
      orient: 'portrait',
      mount(s) {
        return mountMotion(s)
      }
    }
  }

  // ---- motion ----------------------------------------------------------------------------------
  // The phone as a motion controller; motion.js reads it on the TV (createMotion(party)). Every
  // sensor reading is used, swings are found and timed here at the full sensor rate, and without
  // sensors (plain http, a desktop, permission denied) it becomes a touch pad: drag to tilt,
  // flick to swing.

  const DEFAULT_BETA = 35
  const round = (v, k = 10) => Math.round(v * k) / k

  function mountMotion(initial) {
    let s = initial
    const cfg = () => s.cfg ?? C.mine.cfg ?? C.public.cfg ?? {}
    const off = new AbortController()
    const on = (target, type, fn) => target.addEventListener(type, fn, { signal: off.signal })
    let alive = true

    const box = el('div', 'pp-motion')
    const promptEl = el('div', 'pp-card')
    const mstage = el('div', 'pp-mstage')
    const mpad = el('div', 'pp-mpad')
    const mknob = el('div', 'pp-knob')
    mpad.append(mknob)
    const big = el('button', 'pp-btn main pp-big')
    const meter = el('div', 'pp-meter')
    const fill = el('div', 'fill')
    const thr = el('div', 'thr')
    meter.append(fill, thr)
    mstage.append(mpad, big, meter)
    const center = el('button', 'pp-center', 'Re-center')
    box.append(promptEl, mstage, center)
    stage.append(box)

    function createPhoneMotion({ onSwing, onChange, onSample }) {
      const pm = { state: 'waiting', ori: { b: DEFAULT_BETA, g: 0, a: undefined }, up: null, gyro: { x: 0, y: 0, on: false }, m: 0, still: false, hz: 0, bias: 0, angle: 0, last: -1e9 }
      const direct = { last: -1e9, ori: null }
      const bias = [0, 0, 0]
      const hist = []
      let lastT = -Infinity
      let stillFor = 0
      let restFor = 0
      let n = 0
      let countAt = performance.now()
      let grav = null
      let swing = null
      let cooldown = -Infinity
      const set = (state) => {
        if (pm.state === state) return
        pm.state = state
        onChange()
      }
      parent.postMessage({ type: 'motion', on: true }, '*')
      on(window, 'message', (e) => {
        if (e.source !== parent || e.data?.type !== 'motion') return
        const d = e.data
        if (d.state) set(d.state === 'on' || d.state === 'ask' || d.state === 'waiting' ? d.state : 'touch:' + d.state)
        if (performance.now() - direct.last < 150) return // this frame hears the sensors itself
        const at = performance.now()
        if (Array.isArray(d.s) && d.s.length) for (const x of d.s) sample(at - (x.age || 0), x.a, x.g, x.w, x.o)
        else if (d.r) sample(at, [d.r.x, d.r.y, d.r.z], null, null, [d.r.b, d.r.g, null]) // an older join page
      })
      // Android only sends sensor events to the focused frame: listen here too.
      on(window, 'deviceorientation', (e) => {
        if (typeof e.beta !== 'number') return
        direct.ori = [e.beta, e.gamma ?? 0, typeof e.alpha === 'number' ? e.alpha : null]
      })
      const vec = (v, ...k) => (v && typeof v[k[0]] === 'number' ? k.map((x) => v[x]) : null)
      on(window, 'devicemotion', (e) => {
        const a = vec(e.acceleration, 'x', 'y', 'z')
        const g = vec(e.accelerationIncludingGravity, 'x', 'y', 'z')
        const w = vec(e.rotationRate, 'alpha', 'beta', 'gamma')
        if (!a && !g && !w) return
        direct.last = performance.now()
        sample(e.timeStamp || direct.last, a, g, w, direct.ori)
      })
      try {
        screen.orientation?.lock?.('portrait').catch(() => {})
      } catch {}

      /** Device x/y → screen x/y: the phone turned to landscape turns its axes with it. */
      function toScreen(x, y) {
        const r = (pm.angle * Math.PI) / 180
        return [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)]
      }

      function sample(t, a, g, w, o) {
        if (!alive || t <= lastT - 1) return // already seen (both sources overlapping)
        const dt = clamp((t - (lastT > -Infinity ? lastT : t - 16)) / 1000, 0.001, 0.05)
        lastT = t
        pm.last = performance.now()
        if (pm.state !== 'on' && !pm.state.startsWith('touch')) set('on')
        if (pm.state.startsWith('touch')) return
        n++
        if (pm.last - countAt >= 1000) {
          pm.hz = Math.round((n * 1000) / (pm.last - countAt))
          n = 0
          countAt = pm.last
        }
        pm.angle = screen.orientation?.angle ?? (typeof window.orientation === 'number' ? window.orientation : 0)
        if (o) pm.ori = { b: o[0], g: o[1], a: typeof o[2] === 'number' ? o[2] : undefined }
        // Movement without gravity. Some phones only give it with gravity: take a slow average off.
        if (!a && g) {
          grav = grav ? grav.map((v, i) => v + (g[i] - v) * 0.08) : [...g]
          a = g.map((v, i) => v - grav[i])
        }
        a ??= [0, 0, 0]
        // Up, from the phone's own (sensor-fused) orientation: in its own axes and in screen axes.
        const rb = (pm.ori.b * Math.PI) / 180
        const rg = (pm.ori.g * Math.PI) / 180
        const upDev = [-Math.sin(rg) * Math.cos(rb), Math.sin(rb), Math.cos(rg) * Math.cos(rb)]
        const [ux, uy] = toScreen(upDev[0], upDev[1])
        pm.up = [ux, uy, upDev[2]]
        const [ax, ay] = toScreen(a[0], a[1])
        const az = a[2]
        const am = Math.hypot(ax, ay, az)
        // Directions in the room, not the phone: up is toward the ceiling, right is the screen's
        // right edge levelled, so a flick up reads as up however the phone is held.
        const [qx, qy, qz] = pm.up
        const rx = 1 - qx * qx
        const ry = -qx * qy
        const rz = -qx * qz
        const rl = Math.hypot(rx, ry, rz) || 1
        const dx = (ax * rx + ay * ry + az * rz) / rl
        const dy = ax * qx + ay * qy + az * qz
        // Gyro rates are named alpha, beta, gamma and are x, y, z in that order (the spec,
        // Chromium and WebKit agree). Reading them as z, x, y scrambles every gyro feature.
        let wx = 0
        let wy = 0
        let wz = 0
        let wm = 0
        if (w) {
          const raw = Math.hypot(w[0] - bias[0], w[1] - bias[1], w[2] - bias[2])
          stillFor = raw < 4 && am < 0.35 ? stillFor + dt : 0
          // Drift is learned only when the phone truly rests (not a slow aim), slowly, and never
          // more than a real gyro drifts.
          restFor = Math.hypot(...w) < 1.5 && am < 0.15 ? restFor + dt : 0
          if (restFor > 1.5) for (let i = 0; i < 3; i++) bias[i] = clamp(bias[i] + (w[i] - bias[i]) * Math.min(1, dt * 0.3), -1.5, 1.5)
          pm.bias = round(Math.hypot(...bias))
          const turn = [w[0] - bias[0], w[1] - bias[1], w[2] - bias[2]]
          ;[wx, wy] = toScreen(turn[0], turn[1])
          wz = turn[2]
          wm = Math.hypot(wx, wy, wz)
          gyroAim(wx, wy, wz, dt)
        } else stillFor = am < 0.35 ? stillFor + dt : 0
        pm.still = stillFor > 0.25
        const c = cfg()
        pm.m = Math.max(am, wm * (c.gk ?? 0))
        detect(t, pm.m, ax, ay, az, dx, dy, wm, c)
        onSample()
      }

      /** Gyro aiming (as Steam Input does it): turning speed moves the sight like a mouse. */
      function gyroAim(wx, wy, wz, dt) {
        const c = cfg()
        const [ux, uy, uz] = pm.up
        let yaw = wx * ux + wy * uy + wz * uz
        let pitch = wx
        const speed = Math.hypot(yaw, pitch)
        const tighten = c.tighten ?? 1.5
        if (speed < tighten && speed > 0) {
          yaw *= speed / tighten
          pitch *= speed / tighten
        }
        hist.push([yaw, pitch])
        if (hist.length > 4) hist.shift()
        const avg = hist.reduce((acc, v) => [acc[0] + v[0] / hist.length, acc[1] + v[1] / hist.length], [0, 0])
        const k = clamp((speed - (c.smoothLo ?? 4)) / ((c.smoothHi ?? 12) - (c.smoothLo ?? 4)), 0, 1)
        pm.gyro.x -= (yaw * k + avg[0] * (1 - k)) * dt
        pm.gyro.y -= (pitch * k + avg[1] * (1 - k)) * dt
        pm.gyro.on = true
      }

      /**
       * A swing starts when the strength passes the threshold. 'peak' swings end when it fades and
       * are timed at their strongest; 'flip' swings (a bat) are timed where the push turns into the
       * stop. The readings that push the same way as the first give the direction.
       */
      function detect(t, m, ax, ay, az, dx, dy, wm, c) {
        const thr = c.thr ?? 12
        if (!swing) {
          if (m >= thr && t > cooldown) swing = { t0: t, m, peakT: t, fx: ax, fy: ay, fz: az, px: dx, py: dy, sx: dx, sy: dy, k: 1, wPeak: wm, wPeakT: t, flipT: 0 }
          return
        }
        const sw = swing
        if (m > sw.m) {
          sw.m = m
          sw.peakT = t
        }
        if (wm > sw.wPeak) {
          sw.wPeak = wm
          sw.wPeakT = t
        }
        if (dx * sw.px + dy * sw.py > 0) {
          sw.sx += dx
          sw.sy += dy
          sw.k++
        }
        const flip = c.at === 'flip'
        const pushed = Math.hypot(sw.fx, sw.fy, sw.fz) > thr * 0.5
        if (flip && !sw.flipT) {
          if (pushed && ax * sw.fx + ay * sw.fy + az * sw.fz < 0) sw.flipT = t
          else if (!pushed && sw.wPeak > 0 && wm < sw.wPeak * 0.6) sw.flipT = sw.wPeakT
        }
        const dur = t - sw.t0
        const done = flip ? sw.flipT || dur >= (c.winMs ?? 260) : (m < thr * 0.5 && dur >= 8) || dur >= (c.peakMs ?? 110)
        if (!done) return
        swing = null
        cooldown = t + (c.cd ?? 200)
        const sign = c.inv ? -1 : 1
        const ex = (sw.sx / sw.k) * sign
        const ey = (sw.sy / sw.k) * sign
        let dir = null
        if (Math.max(Math.abs(ex), Math.abs(ey)) > (c.dz ?? 2)) dir = Math.abs(ex) > Math.abs(ey) ? (ex > 0 ? 'right' : 'left') : ey > 0 ? 'up' : 'down'
        const full = c.full ?? 32
        onSwing({ dir, p: clamp((sw.m - thr) / (full - thr), 0.15, 1), m: sw.m, pt: flip ? sw.flipT || sw.wPeakT : sw.peakT })
      }
      return pm
    }

    let held = false
    let touchTilt = null
    let hitUntil = 0
    const pm = createPhoneMotion({
      onSwing: (sw) => {
        C.send({ swing: { dir: sw.dir, p: round(sw.p, 100), m: round(sw.m), pt: round(sw.pt), age: Math.round(performance.now() - sw.pt) } })
        C.vibrate(sw.dir ? 18 : 12)
        hitUntil = performance.now() + 250
      },
      onChange: () => (render(), send()),
      onSample: () => send() // controller.input only sends changes, at most 30 a second
    })

    function send() {
      if (!alive) return
      const state = pm.state.startsWith('touch') ? 'touch' : pm.state
      const t = touchTilt ?? pm.ori
      st.own = {
        tb: round(t.b),
        tg: round(t.g),
        ...(typeof t.a === 'number' ? { ta: round(t.a) } : {}),
        ...(!touchTilt && pm.up ? { u: pm.up.map((v) => round(v, 1000)) } : {}),
        ...(pm.gyro.on ? { gx: round(pm.gyro.x, 100), gy: round(pm.gyro.y, 100) } : {}),
        m: round(pm.m),
        a: held,
        st: state,
        ...(state === 'touch' ? { why: pm.state.slice(6) } : {}),
        still: state !== 'on' || pm.still,
        ph: { hz: pm.hz, o: pm.angle, bias: pm.bias }
      }
      push()
    }

    // The big button: held as `a`, so party.pressed(id, 'a') works too.
    const hold = (down) => (e) => {
      e.preventDefault()
      if (held === down) return
      held = down
      big.classList.toggle('down', down)
      if (down) {
        count('a')
        C.vibrate(12)
      }
      send()
    }
    on(big, 'pointerdown', hold(true))
    for (const t of ['pointerup', 'pointercancel', 'pointerleave']) on(big, t, hold(false))
    on(center, 'click', () => (C.send({ center: true }), C.vibrate(20)))
    const offMsg = C.on('msg', (d) => {
      if (d?.ping) C.send({ pong: d.ping, pt: round(performance.now()) }) // the TV's clock check
      if (d?.buzz) C.vibrate(d.buzz)
    })

    // No sensors: a touch pad. Drag = tilt (±28°), a quick long drag = a swing that way.
    let drag = null
    const padMove = (e) => {
      const r = mpad.getBoundingClientRect()
      const nx = clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1)
      const ny = clamp(((e.clientY - r.top) / r.height) * 2 - 1, -1, 1)
      mknob.style.left = `${(nx + 1) * 50}%`
      mknob.style.top = `${(ny + 1) * 50}%`
      touchTilt = { b: DEFAULT_BETA + ny * 28, g: nx * 28 }
      const dx = e.clientX - drag.x
      const dy = e.clientY - drag.y
      const dt = performance.now() - drag.t
      if (!drag.done && Math.hypot(dx, dy) > r.width * 0.22 && dt < 260) {
        drag.done = true
        const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up'
        C.send({ swing: { dir, p: round(clamp(1 - dt / 300, 0.3, 1), 100), m: 0, pt: round(performance.now()), age: 0 } })
        C.vibrate(15)
      }
      send()
    }
    on(mpad, 'pointerdown', (e) => {
      mpad.setPointerCapture?.(e.pointerId)
      drag = { x: e.clientX, y: e.clientY, t: performance.now(), done: false }
      padMove(e)
    })
    on(mpad, 'pointermove', (e) => drag && padMove(e))
    const padUp = () => {
      drag = null
      touchTilt = { b: DEFAULT_BETA, g: 0 }
      mknob.style.left = mknob.style.top = '50%'
      send()
    }
    on(mpad, 'pointerup', padUp)
    on(mpad, 'pointercancel', padUp)

    const STATES = {
      on: ['Motion on', 'on'],
      ask: ['Tap "Allow motion" below', 'warn'],
      waiting: ['Starting sensors…', 'warn'],
      stalled: ['Motion paused: tap the screen', 'warn'],
      'touch:unsupported': ['No sensors: touch pad', 'bad'],
      'touch:denied': ['Motion blocked: touch pad', 'bad'],
      'touch:insecure': ['Motion needs https: touch pad', 'bad']
    }
    // Android stops sending readings to an unfocused frame: say so (a tap brings them back).
    const stalled = () => pm.state === 'on' && performance.now() - pm.last > 500
    function render() {
      const [text, cls] = STATES[stalled() ? 'stalled' : pm.state] ?? [pm.state, '']
      status(text, cls)
      box.style.paddingBottom = pm.state === 'ask' ? '110px' : ''
      promptEl.textContent = s.prompt ?? C.mine.prompt ?? C.public.prompt ?? 'Look at the screen.'
      const touch = pm.state.startsWith('touch')
      const btn = s.btn ?? C.mine.btn ?? C.public.btn
      big.hidden = !btn
      big.textContent = btn ?? ''
      mpad.hidden = !touch
      meter.hidden = touch
    }
    let wasStalled = false
    function frame() {
      if (!alive) return
      requestAnimationFrame(frame)
      if (stalled() !== wasStalled) ((wasStalled = !wasStalled), render())
      const c = cfg()
      const full = (c.full ?? 32) * 1.15
      fill.style.width = `${clamp(pm.m / full, 0, 1) * 100}%`
      thr.style.left = `${clamp((c.thr ?? 12) / full, 0, 1) * 100}%`
      meter.classList.toggle('hit', performance.now() < hitUntil)
    }
    render()
    frame()
    send()
    return {
      update(next) {
        s = next
        render()
      },
      destroy() {
        alive = false
        off.abort()
        offMsg()
        status()
        parent.postMessage({ type: 'motion', on: false }, '*')
      }
    }
  }

  // ---- knocks: the phone's edges as buttons ------------------------------------------------------
  // A fingertip knock on the frame is a sharp jolt of the phone, over in a few hundredths of a
  // second. On the left or right edge it pushes the phone sideways (the push gives the side); on
  // the top edge near one end it pushes it down and turns it about the screen (the turn, from the
  // gyro, gives the side). A jolt within ~0.1 s of a screen touch is that touch, and anything
  // longer than a knock is the phone being moved: both are ignored.

  const KNOCK = { thr: 6, quiet: 0.4, maxMs: 90, touchMs: 110, cooldownMs: 160, turn: 25 }

  /** Readings of the phone's motion, in screen axes (x right, y up, z out; m/s², deg/s). */
  function sensorFeed(onSample) {
    const off = new AbortController()
    const on = (type, fn) => addEventListener(type, fn, { signal: off.signal })
    const angle = () => screen.orientation?.angle ?? (typeof window.orientation === 'number' ? window.orientation : 0)
    const toScreen = (x, y) => {
      const r = (angle() * Math.PI) / 180
      return [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)]
    }
    let lastT = -Infinity
    let directAt = -1e9
    let grav = null
    const feed = { state: 'waiting' }
    const take = (t, a, g, w) => {
      if (t <= lastT) return // already seen (both sources overlapping)
      lastT = t
      // Movement without gravity; some phones only give it with: take a slow average off.
      if (!a && g) {
        grav = grav ? grav.map((v, i) => v + (g[i] - v) * 0.08) : [...g]
        a = g.map((v, i) => v - grav[i])
      }
      if (!a) return
      const [ax, ay] = toScreen(a[0], a[1])
      const [wx, wy] = w ? toScreen(w[0], w[1]) : [0, 0]
      onSample({ t, a: [ax, ay, a[2]], w: [wx, wy, w ? w[2] : 0] })
    }
    parent.postMessage({ type: 'motion', on: true }, '*')
    on('message', (e) => {
      if (e.source !== parent || e.data?.type !== 'motion') return
      if (e.data.state) feed.state = e.data.state
      if (performance.now() - directAt < 150) return // this frame hears the sensors itself
      const at = performance.now()
      for (const x of Array.isArray(e.data.s) ? e.data.s : []) take(at - (x.age || 0), x.a, x.g, x.w)
    })
    // Android only sends sensor events to the focused frame: listen here too.
    const vec = (v, ...k) => (v && typeof v[k[0]] === 'number' ? k.map((n) => v[n]) : null)
    on('devicemotion', (e) => {
      const a = vec(e.acceleration, 'x', 'y', 'z')
      const g = vec(e.accelerationIncludingGravity, 'x', 'y', 'z')
      // The rates are named alpha, beta, gamma and are x, y, z in that order.
      const w = vec(e.rotationRate, 'alpha', 'beta', 'gamma')
      if (!a && !g) return
      directAt = performance.now()
      take(e.timeStamp || directAt, a, g, w)
    })
    feed.stop = () => {
      off.abort()
      parent.postMessage({ type: 'motion', on: false }, '*')
    }
    return feed
  }

  /** Knocks in a stream of readings: onKnock('left' | 'right'). */
  function knockDetector(cfg, onKnock) {
    let hit = null
    let cooldown = -Infinity
    const touches = []
    return {
      touched(t) {
        touches.push(t)
        if (touches.length > 8) touches.shift()
      },
      sample({ t, a, w }) {
        const m = Math.hypot(a[0], a[1])
        if (!hit) {
          if (m >= cfg.thr && t >= cooldown) hit = { t0: t, ax: a[0], ay: a[1], wz: w[2] }
          return
        }
        if (Math.abs(w[2]) > Math.abs(hit.wz)) hit.wz = w[2]
        if (m >= cfg.thr * cfg.quiet) return // still jolting
        const h = hit
        hit = null
        cooldown = t + cfg.cooldownMs
        if (t - h.t0 > cfg.maxMs) return // moved, not knocked
        if (touches.some((x) => Math.abs(x - h.t0) < cfg.touchMs)) return // a screen tap's jolt
        let side = null
        // Knocked on the right edge, the phone first moves left (and the other way round)…
        if (Math.abs(h.ax) >= Math.abs(h.ay)) side = h.ax < 0 ? 'right' : 'left'
        // …knocked down on the top edge near one end, it turns about the screen.
        else if (Math.abs(h.wz) >= cfg.turn) side = h.wz < 0 ? 'right' : 'left'
        if (side) onKnock(side)
      }
    }
  }

  let knocks = null // { feed, stop() } while the layout has knocks on
  function startKnocks(s) {
    const opts = typeof s.knocks === 'object' && s.knocks ? s.knocks : {}
    const twin = s.layout === 'twin'
    const buttons = { left: opts.left ?? (twin ? 'lt' : 'lb'), right: opts.right ?? (twin ? 'rt' : 'rb') }
    const cfg = { ...KNOCK, ...(typeof opts.thr === 'number' ? { thr: opts.thr } : {}) }
    const flash = { left: el('div', 'pp-knock left'), right: el('div', 'pp-knock right') }
    stage.append(flash.left, flash.right)
    const timers = {}
    const detector = knockDetector(cfg, (side) => {
      tap(buttons[side], 25)
      flash[side].classList.add('show')
      clearTimeout(timers[side])
      timers[side] = setTimeout(() => flash[side].classList.remove('show'), 80)
    })
    const touched = () => detector.touched(performance.now())
    root.addEventListener('pointerdown', touched, true)
    root.addEventListener('pointerup', touched, true)
    const feed = sensorFeed((x) => detector.sample(x))
    return {
      feed,
      stop() {
        feed.stop()
        root.removeEventListener('pointerdown', touched, true)
        root.removeEventListener('pointerup', touched, true)
        for (const t of Object.values(timers)) clearTimeout(t)
      }
    }
  }

  // ---- switching layouts -----------------------------------------------------------------------

  let current = null // { name, key, api }
  function refresh() {
    const s = settings()
    applyTheme(s)
    pauseBtn.hidden = s.pause === false
    const def = LAYOUTS[s.layout]
    // The choices and motion layouts also read the older keys (public.prompt, mine.secret…).
    const legacy = s.layout === 'choices' || s.layout === 'motion' ? [C.public.prompt, C.public.choices, C.public.btn, C.mine.prompt, C.mine.secret, C.mine.picked, C.mine.btn] : null
    const key = JSON.stringify([s, C.me.color, legacy])
    if (current?.key === key) return
    if (current?.name === s.layout && current.api?.update && JSON.stringify(current.knocks) === JSON.stringify(s.knocks)) {
      current.key = key
      current.api.update(s)
      return
    }
    current?.api?.destroy?.()
    knocks?.stop()
    knocks = null
    stage.replaceChildren()
    letGo()
    root.dataset.layout = s.layout
    root.classList.toggle('pp-float', def.orient !== 'portrait')
    current = { name: s.layout, key, knocks: s.knocks, api: def.mount(s) ?? null }
    // The motion layout reads the sensors its own way; every other layout can take knocks.
    if (s.knocks && s.layout !== 'motion') knocks = startKnocks(s)
    if (def.orient === 'landscape') stage.append(hint)
    orient()
  }
  function orient() {
    hint.hidden = !(current && LAYOUTS[current.name].orient === 'landscape' && innerHeight > innerWidth)
  }
  addEventListener('resize', orient)
  // A phone put away lets go of everything (a held button would stay held on the TV).
  document.addEventListener('visibilitychange', () => document.hidden && letGo())

  const start = () => {
    document.body.append(root)
    refresh()
    C.on('update', refresh)
  }
  if (document.body) start()
  else addEventListener('DOMContentLoaded', start)
  C.layouts = Object.keys(LAYOUTS)
})()
