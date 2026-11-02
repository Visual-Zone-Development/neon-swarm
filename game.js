// Neon Swarm: twin-stick neon arena roguelite. Clear waves, draft upgrades, beat three bosses.
import { input } from './input.js'
import { createMenu } from './menu.js'
import { fitCanvas } from './fit.js'
import { createAudio } from './audio.js'
import { createSave, createSettings } from './save.js'
import { createSettingsScreen } from './settings.js'
import { drawPrompts } from './prompts.js'
import { sfx, music, initSfx } from './sfx.js'
import { Grid } from './grid.js'
import { WEAPONS, PASSIVES, STATS, MODS, SHIPS, RARITY, MAX_LVL, FAMILIES, FAMILY_TIERS } from './data.js'

// ---------- tuning ----------
// Gameplay numbers live here so balancing is quick.
const TUNING = {
  player: { speed: 330, accel: 14, startBombs: 2, bombMax: 3, magnet: 110, hitInv: 2, shieldInv: 1.2, touchStickRange: 70 },
  enemy: {
    hpPerWave: 0.08, // +8% enemy HP per wave of the campaign
    speedPerWave: 0.02,
    powerHp: 0.4, // enemy HP scales with build power ^ this (lower = upgrades feel stronger)
    powerBudget: 0.2, // wave size scales with build power ^ this
    warmup: 0.75 // seconds an enemy telegraphs before it can hurt you
  },
  wave: { budget: 55, budgetPerWave: 12, budgetPerSector: 50, density: 22, densityPerWave: 2.5, densityMax: 100 },
  multKeepOnHit: 0.5, // a hit halves the multiplier instead of resetting it
  // Ship abilities (LT). cd = cooldown in seconds, t = how long it lasts.
  ability: {
    // Barrage (Interceptor): fire-rate burst with piercing bolts; each kill adds killAdd seconds, up to maxAdd.
    barrage: { cd: 9, t: 3, rate: 3, pierce: 1, killAdd: 0.1, maxAdd: 2 },
    // Reap ends in a shockwave (shove r, bullet clear r * 1.15) and grace seconds of invulnerability.
    // A Reap that kills nothing refunds missRefund of its cooldown.
    reap: { cd: 1.8, t: 0.2, speed: 1700, dmg: 16, refund: 0.6, shove: 150, grace: 0.5, missRefund: 0.5 },
    phase: { cd: 6, t: 1.4, dmg: 10, geomCut: 0.15 },
    frenzy: { cd: 10, t: 3.5, rate: 3, dmg: 1.5 },
    turret: { cd: 4, max: 3, life: 25, range: 420, rate: 0.28, dmg: 3.2 },
    salvo: { cd: 6, n: 16, dmg: 3 },
    detonate: { cd: 0.35 }
  },
  // Nova Mortar (Bombard), per weapon level 1..5. Every enemy in the blast takes dmg (a direct hit adds direct).
  // Kills inside a blast set off a chain blast (chainR + enemy radius, chainDmg), up to `links` steps deep.
  mortar: {
    rate: [1.15, 1.15, 1.05, 0.9, 0.85],
    dmg: [9, 11.5, 11.5, 12.5, 14],
    direct: 6,
    r: [140, 140, 165, 165, 190],
    links: [3, 3, 4, 4, 6],
    chainR: 75,
    chainDmg: 0.6,
    chainDelay: 0.09,
    speed: 720,
    life: 1.5,
    maxBlasts: 160
  },
  // Shield regeneration (seconds). The fastest source you have applies; shields cap at 3.
  shieldRegen: { aegis: 45, fortress2: 45, fortress3: 25 },
  geomShieldEvery: 400, // Geom Shield: geoms per shield, and only when you have none
  // Black holes (Geometry Wars 2 style): dormant until shot, then they pull everything in. Swallow too much
  // and they go critical and burst into a swarm; destroy one first for a big explosion.
  well: { overload: 14, critTime: 1.6, swarmBase: 4, swarmMax: 22, killR: 190, killRPer: 8, bonusPer: 100 },
  // Geometry Wars-style multiplier: +1 every `perStep` geoms, capped, and it decays when you stop collecting.
  mult: { perStep: 25, cap: 10, capHarvest: 20, grace: 4, graceHarvest: 8, decayStep: 1 },
  assist: { cone: 0.38, range: 520, autoRange: 640 },
  // Endless mode: one arena, no waves. The threat climbs with time, and geoms fill an XP bar that opens a draft.
  endless: {
    secondsPerWave: 18, // every this many seconds the swarm is as tough as one more campaign wave
    tierSeconds: 120, // "THREAT RISING": new palette and faster enemy bullets
    groupGap: 2, // seconds between spawn groups at the start...
    groupGapMin: 0.55, // ...shrinking to this
    groupGapPerWave: 0.05,
    xpStart: 30, // geoms for the first level-up
    xpGrowth: 1.3, // each level needs this much more...
    xpAdd: 8, // ...plus this many geoms
    supplyEvery: 5, // every 5th upgrade you take is followed by a bonus Supply Drop draft
    eliteFirst: 40, // seconds until the first elite
    eliteGap: 50, // seconds between elite waves at threat 1...
    eliteGapPerTier: 6, // ...minus this per threat level...
    eliteMinGap: 22, // ...but never less than this
    eliteMax: 4, // most elites alive at once
    resumeInv: 1, // invulnerability after closing a draft, so nothing hits you the instant play resumes
    arenaW: 2400, // Arena for both modes, bigger than the 1280x800 screen; the camera follows the ship
    arenaH: 1500,
    camLead: 0.3, // camera looks ahead along your movement by this many seconds of velocity (aiming never moves it)
    camLeadEase: 2.5, // how gently the look-ahead swings when you change direction
    camFollow: 5, // camera follow speed
    spawnMargin: 160, // Endless spawns land within this distance of the visible screen
    camOver: 90, // the camera can look this far past the arena wall, so the ship never sits on the screen edge
    radarRange: 450 // off-screen enemies closer than this get an arrow at the screen edge
  },
  difficulty: [
    { name: 'RELAXED', hp: 2, enemyHp: 0.7, enemySpeed: 0.85, bulletSpeed: 0.75, density: 0.75, inv: 1.5, score: 0.5, desc: '+2 hull, a slower, weaker swarm and longer recovery after a hit. Half score.' },
    { name: 'NORMAL', hp: 0, enemyHp: 1, enemySpeed: 1, bulletSpeed: 1, density: 1, inv: 1, score: 1, desc: 'The intended challenge.' },
    { name: 'HARD', hp: 0, enemyHp: 1.3, enemySpeed: 1.1, bulletSpeed: 1.15, density: 1.15, inv: 0.8, score: 1.5, desc: 'Tougher, faster, denser swarm. 1.5x score.' }
  ]
}

const ID = 'neon-swarm'
// Draw in a fixed 1280×800 space (the Steam Deck screen); fit.js scales and letterboxes it.
const W = 1280
const H = 800
const canvas = document.getElementById('game')
const fit = fitCanvas(canvas, { w: W, h: H, letterbox: '#000' })
const ctx = fit.ctx
input.attach(canvas, W, H)
// Device pixels per game unit: the world/screen transforms below set it themselves (camera + shake).
let K = canvas.width / W
fit.onResize(() => (K = canvas.width / W))
// R is reroll on the keyboard too (F is the default for y).
input.extendKeys({ KeyR: 'y' })

const FONT = "'Chakra Petch', system-ui, sans-serif"
const LOGO = "'Bungee', 'Chakra Petch', system-ui, sans-serif"
document.fonts?.load(`700 32px 'Chakra Petch'`).catch(() => {})
document.fonts?.load(`600 32px 'Chakra Petch'`).catch(() => {})
document.fonts?.load(`400 32px 'Bungee'`).catch(() => {})

// Arena bounds. The campaign arena is one screen; Endless uses a bigger one (see setArena).
let AW = W
let AH = H
const L = 16
const T = 16
let R = AW - 16
let B = AH - 16
// Camera: top-left of the visible screen in arena coordinates.
const cam = { x: 0, y: 0, lx: 0, ly: 0 }
// Boss arena: during a boss fight the camera locks onto one screen-sized box and walls keep you in it.
const BB = { on: false, x0: L, y0: T, x1: W - 16, y1: H - 16, cx: W / 2, cy: H / 2 }
function G_bossBox(on) {
  BB.on = on
  if (!on) return
  BB.cx = clamp(cam.x + W / 2, W / 2, AW - W / 2)
  BB.cy = clamp(cam.y + H / 2, H / 2, AH - H / 2)
  BB.x0 = BB.cx - W / 2 + 16
  BB.x1 = BB.cx + W / 2 - 16
  BB.y0 = BB.cy - H / 2 + 16
  BB.y1 = BB.cy + H / 2 - 16
}
const TAU = Math.PI * 2

// ---------- helpers ----------
const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a))
const rint = (a, b) => Math.floor(rand(a, b + 1))
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]
function angDiff(a, b) {
  let d = (b - a) % TAU
  if (d > Math.PI) d -= TAU
  if (d < -Math.PI) d += TAU
  return d
}
function weighted(items, wfn) {
  let total = 0
  for (const it of items) total += wfn(it)
  let r = Math.random() * total
  for (const it of items) {
    r -= wfn(it)
    if (r <= 0) return it
  }
  return items[items.length - 1]
}
function compact(arr) {
  let j = 0
  for (let i = 0; i < arr.length; i++) if (!arr[i].dead) arr[j++] = arr[i]
  arr.length = j
}
function segDist2(px, py, x0, y0, x1, y1) {
  const vx = x1 - x0
  const vy = y1 - y0
  const t = clamp(((px - x0) * vx + (py - y0) * vy) / (vx * vx + vy * vy || 1), 0, 1)
  const dx = x0 + vx * t - px
  const dy = y0 + vy * t - py
  return dx * dx + dy * dy
}
const fmt = (n) => Math.floor(n).toLocaleString('en-US')

// ---------- save data ----------
// neon-swarm-save-v1: same key and shape as before, now through save.js (saved on pause and hide too).
const saveStore = createSave(ID, 1, { best: 0, bestSector: 1, bestWave: 1, totalKills: 0, runs: 0, wins: 0, flags: {}, shipId: 'interceptor', bestEndless: 0, bestTime: 0, endless: false })
const save = saveStore.data
const writeSave = () => saveStore.save()
const unlocked = (flag) => !flag || !!save.flags[flag]
// Difficulty, aiming help and rumble sit next to the runtime's settings (volumes, reduced shake,
// text size) under neon-swarm-settings-v1. Saves from 1.3–1.11 kept them inside the save: move them once.
const settings = createSettings(ID, { diff: 1, assist: 0, rumble: true })
if (save.settings) {
  const old = save.settings
  const d = settings.data
  if (old.diff !== undefined) d.diff = clamp(old.diff, 0, TUNING.difficulty.length - 1)
  if (old.assist !== undefined) d.assist = clamp(old.assist, 0, 2)
  if (old.rumble !== undefined) d.rumble = !!old.rumble
  if (old.reduceFx) d.reducedShake = true
  if (old.music !== undefined) d.music = clamp(old.music / 10, 0, 1)
  if (old.sfx !== undefined) d.sfx = clamp(old.sfx / 10, 0, 1)
  delete save.settings
  settings.save()
  writeSave()
}
const cfg = settings.data
const audio = createAudio({ settings })
initSfx(audio)
function rumble(strong, weak, ms) {
  if (!cfg.rumble) return
  for (const pad of navigator.getGamepads?.() ?? []) {
    const act = pad?.vibrationActuator
    if (!act?.playEffect) continue
    act.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak }).catch(() => {})
  }
}

// ---------- glow sprites ----------
const SS = 2 // supersampling for sprites
function shipDraw(g, r) {
  g.beginPath()
  g.moveTo(r, 0)
  g.lineTo(-r * 0.75, -r * 0.82)
  g.lineTo(-r * 0.32, 0)
  g.lineTo(-r * 0.75, r * 0.82)
  g.closePath()
  g.stroke()
}
function poly(g, n, r, rot = 0) {
  g.beginPath()
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * TAU
    g.lineTo(Math.cos(a) * r, Math.sin(a) * r)
  }
  g.closePath()
}
const SHAPES = {
  player: { r: 16, color: '#5ee0ff', draw: shipDraw },
  wanderer: {
    r: 16,
    color: '#b66bff',
    draw(g, r) {
      for (let k = 0; k < 4; k++) {
        g.save()
        g.rotate((k * Math.PI) / 2)
        g.beginPath()
        g.moveTo(0, 0)
        g.lineTo(r, 0)
        g.lineTo(r * 0.45, -r * 0.85)
        g.closePath()
        g.stroke()
        g.restore()
      }
    }
  },
  seeker: {
    r: 15,
    color: '#3fd8ff',
    draw(g, r) {
      g.beginPath()
      g.moveTo(0, -r)
      g.lineTo(r * 0.7, 0)
      g.lineTo(0, r)
      g.lineTo(-r * 0.7, 0)
      g.closePath()
      g.stroke()
      g.beginPath()
      g.moveTo(0, -r * 0.4)
      g.lineTo(r * 0.28, 0)
      g.lineTo(0, r * 0.4)
      g.lineTo(-r * 0.28, 0)
      g.closePath()
      g.stroke()
    }
  },
  dodger: {
    r: 15,
    color: '#5dff6a',
    draw(g, r) {
      const s = r * 0.78
      g.strokeRect(-s, -s, s * 2, s * 2)
      g.beginPath()
      g.moveTo(-s, -s)
      g.lineTo(s, s)
      g.moveTo(s, -s)
      g.lineTo(-s, s)
      g.stroke()
    }
  },
  splitter: {
    r: 18,
    color: '#ff5ca8',
    draw(g, r) {
      const s = r * 0.75
      g.strokeRect(-s, -s, s * 2, s * 2)
      poly(g, 4, r * 0.55, 0)
      g.stroke()
    }
  },
  mini: {
    r: 9,
    color: '#ff5ca8',
    draw(g, r) {
      const s = r * 0.75
      g.strokeRect(-s, -s, s * 2, s * 2)
    }
  },
  snake: {
    r: 13,
    color: '#ffe23d',
    draw(g, r) {
      g.beginPath()
      g.moveTo(r * 1.1, 0)
      g.lineTo(-r * 0.8, -r * 0.9)
      g.lineTo(-r * 0.3, 0)
      g.lineTo(-r * 0.8, r * 0.9)
      g.closePath()
      g.stroke()
    }
  },
  seg: {
    r: 9,
    color: '#ffe23d',
    draw(g, r) {
      g.beginPath()
      g.arc(0, 0, r * 0.75, 0, TAU)
      g.stroke()
    }
  },
  lancer: {
    r: 16,
    color: '#ff4040',
    draw(g, r) {
      g.beginPath()
      g.moveTo(r, 0)
      g.lineTo(-r, -r * 0.7)
      g.lineTo(-r * 0.45, 0)
      g.lineTo(-r, r * 0.7)
      g.closePath()
      g.stroke()
      g.beginPath()
      g.moveTo(-r * 0.45, 0)
      g.lineTo(r * 0.4, 0)
      g.stroke()
    }
  },
  tank: {
    r: 22,
    color: '#7aa7ff',
    draw(g, r) {
      poly(g, 6, r, Math.PI / 6)
      g.stroke()
      poly(g, 6, r * 0.5, Math.PI / 6)
      g.stroke()
    }
  },
  spawner: {
    r: 24,
    color: '#ff8a1f',
    draw(g, r) {
      poly(g, 3, r, -Math.PI / 2)
      g.stroke()
      poly(g, 3, r * 0.55, Math.PI / 2)
      g.stroke()
      g.beginPath()
      g.arc(0, 0, r * 0.2, 0, TAU)
      g.stroke()
    }
  },
  geom: {
    r: 6,
    color: '#d8ff3a',
    draw(g, r, core) {
      const k = core ? 0.5 : 1
      g.beginPath()
      g.moveTo(0, -r * k)
      g.lineTo(r * 0.6 * k, 0)
      g.lineTo(0, r * k)
      g.lineTo(-r * 0.6 * k, 0)
      g.closePath()
      g.fill()
    }
  },
  ebullet: {
    r: 7,
    color: '#ff3d6e',
    draw(g, r, core) {
      g.beginPath()
      g.arc(0, 0, core ? r * 0.45 : r * 0.8, 0, TAU)
      g.fill()
    }
  },
  hexcore: {
    r: 62,
    color: '#ff8a1f',
    draw(g, r) {
      poly(g, 6, r, 0)
      g.stroke()
      poly(g, 6, r * 0.68, Math.PI / 6)
      g.stroke()
      poly(g, 6, r * 0.36, 0)
      g.stroke()
    }
  },
  hexturret: {
    r: 22,
    color: '#ffd23d',
    draw(g, r) {
      poly(g, 4, r * 0.8, Math.PI / 4)
      g.stroke()
      g.beginPath()
      g.moveTo(0, 0)
      g.lineTo(r * 1.25, 0)
      g.stroke()
      g.beginPath()
      g.arc(0, 0, r * 0.3, 0, TAU)
      g.stroke()
    }
  },
  serpent: {
    r: 32,
    color: '#7dff7a',
    draw(g, r) {
      g.beginPath()
      g.moveTo(r * 1.2, 0)
      g.lineTo(r * 0.2, -r * 0.9)
      g.lineTo(-r * 0.8, -r * 0.7)
      g.lineTo(-r * 0.4, 0)
      g.lineTo(-r * 0.8, r * 0.7)
      g.lineTo(r * 0.2, r * 0.9)
      g.closePath()
      g.stroke()
      g.beginPath()
      g.arc(r * 0.25, -r * 0.35, r * 0.14, 0, TAU)
      g.arc(r * 0.25, r * 0.35, r * 0.14, 0, TAU)
      g.stroke()
    }
  },
  serpseg: {
    r: 20,
    color: '#7dff7a',
    draw(g, r) {
      g.beginPath()
      g.arc(0, 0, r * 0.85, 0, TAU)
      g.stroke()
      poly(g, 4, r * 0.4, 0)
      g.stroke()
    }
  },
  eyering: {
    r: 78,
    color: '#ff4040',
    draw(g, r) {
      g.lineWidth = g.lineWidth * 1.6
      g.beginPath()
      g.arc(0, 0, r, 0, TAU)
      g.stroke()
      g.lineWidth = g.lineWidth / 1.6
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU
        g.beginPath()
        g.moveTo(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55)
        g.lineTo(Math.cos(a) * r * 0.85, Math.sin(a) * r * 0.85)
        g.stroke()
      }
    }
  },
  drone: {
    r: 9,
    color: '#66ffd1',
    draw(g, r) {
      poly(g, 3, r, 0)
      g.stroke()
    }
  },
  blade: {
    r: 12,
    color: '#c38bff',
    draw(g, r) {
      g.beginPath()
      g.arc(0, 0, r, -1.2, 1.2)
      g.arc(-r * 0.5, 0, r * 0.75, 1.0, -1.0, true)
      g.closePath()
      g.stroke()
    }
  }
}
// Each ship has its own silhouette, so they read apart at a glance.
const SHIP_DRAW = {
  interceptor: shipDraw,
  hunter(g, r) {
    g.beginPath()
    g.moveTo(r, 0)
    g.lineTo(-r * 0.2, -r * 0.3)
    g.lineTo(-r * 0.8, -r * 0.85)
    g.lineTo(-r * 0.55, 0)
    g.lineTo(-r * 0.8, r * 0.85)
    g.lineTo(-r * 0.2, r * 0.3)
    g.closePath()
    g.stroke()
  },
  bombard(g, r) {
    g.beginPath()
    g.moveTo(r * 0.55, -r * 0.3)
    g.lineTo(r * 1.1, -r * 0.3)
    g.lineTo(r * 1.1, r * 0.3)
    g.lineTo(r * 0.55, r * 0.3)
    g.stroke()
    g.beginPath()
    g.arc(-r * 0.1, 0, r * 0.7, 0, TAU)
    g.stroke()
    g.beginPath()
    g.moveTo(-r * 0.6, -r * 0.5)
    g.lineTo(-r * 1.0, -r * 0.9)
    g.moveTo(-r * 0.6, r * 0.5)
    g.lineTo(-r * 1.0, r * 0.9)
    g.stroke()
  },
  phantom(g, r) {
    g.beginPath()
    g.moveTo(r * 1.15, 0)
    g.lineTo(-r * 0.85, -r * 0.5)
    g.lineTo(-r * 0.4, 0)
    g.lineTo(-r * 0.85, r * 0.5)
    g.closePath()
    g.stroke()
  },
  carrier(g, r) {
    poly(g, 6, r * 0.8)
    g.stroke()
    g.beginPath()
    g.moveTo(r * 0.8, 0)
    g.lineTo(r * 0.2, 0)
    g.stroke()
  },
  reaper(g, r) {
    g.beginPath()
    g.arc(-r * 0.2, 0, r, -1.3, 1.3)
    g.arc(-r * 0.75, 0, r * 0.8, 1.0, -1.0, true)
    g.closePath()
    g.stroke()
  },
  warden(g, r) {
    const s = r * 0.7
    g.strokeRect(-s, -s, s * 2, s * 2)
    g.beginPath()
    g.moveTo(s, 0)
    g.lineTo(r * 1.1, 0)
    g.stroke()
  }
}
for (const s of SHIPS) SHAPES['ship-' + s.id] = { r: 16, color: s.glow, core: s.color, draw: SHIP_DRAW[s.id] ?? shipDraw }
SHAPES.turret = {
  r: 11,
  color: '#9dff5c',
  draw(g, r) {
    poly(g, 4, r, Math.PI / 4)
    g.stroke()
    g.beginPath()
    g.arc(0, 0, r * 0.35, 0, TAU)
    g.stroke()
  }
}

const spriteCache = {}
function makeSprite(shape, white) {
  const { r, draw } = shape
  const color = white ? '#ffffff' : shape.color
  const pad = 20
  const size = Math.ceil((r * 2.6 + pad * 2) * SS)
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')
  g.scale(SS, SS)
  g.translate(size / SS / 2, size / SS / 2)
  g.lineJoin = 'round'
  g.lineCap = 'round'
  g.shadowColor = color
  g.shadowBlur = 14
  g.strokeStyle = g.fillStyle = color
  g.lineWidth = 3
  draw(g, r, false)
  draw(g, r, false)
  g.shadowBlur = 0
  g.strokeStyle = g.fillStyle = shape.core ?? 'rgba(255,255,255,0.8)'
  g.lineWidth = 1.3
  draw(g, r, true)
  return c
}
function sprite(key, white = false) {
  const k = white ? key + '!' : key
  return (spriteCache[k] ??= makeSprite(SHAPES[key], white))
}

// Camera shake offsets for the current frame.
let shx = 0
let shy = 0
function worldT() {
  ctx.setTransform(K, 0, 0, K, shx * K, shy * K)
}
function screenT() {
  ctx.setTransform(K, 0, 0, K, 0, 0)
}
function blit(img, x, y, ang = 0, scale = 1, alpha = 1) {
  const s = (scale / SS) * K
  const c = Math.cos(ang) * s
  const n = Math.sin(ang) * s
  ctx.setTransform(c, n, -n, c, (x + shx) * K, (y + shy) * K)
  ctx.globalAlpha = alpha
  ctx.drawImage(img, -img.width / 2, -img.height / 2)
}

// ---------- world ----------
let grid = new Grid(L, T, R, B, 40)
/** Resize the arena (and the grid and spatial hash with it). */
function setArena(w, h) {
  if (w === AW && h === AH) return
  AW = w
  AH = h
  R = AW - 16
  B = AH - 16
  grid = new Grid(L, T, R, B, 40)
  HC = Math.ceil(AW / CELL)
  HR = Math.ceil(AH / CELL)
  cells = Array.from({ length: HC * HR }, () => [])
}
function updateCamera(dt, snap = false) {
  const P = G.P
  const E = TUNING.endless
  // Look ahead where you're flying, eased so a sudden turn doesn't whip the view around.
  const kl = snap ? 1 : Math.min(1, dt * E.camLeadEase)
  const lx = P.alive ? P.vx * E.camLead : 0
  const ly = P.alive ? P.vy * E.camLead : 0
  cam.lx += (lx - cam.lx) * kl
  cam.ly += (ly - cam.ly) * kl
  const o = E.camOver
  let tx = clamp(P.x + cam.lx - W / 2, -o, AW - W + o)
  let ty = clamp(P.y + cam.ly - H / 2, -o, AH - H + o)
  if (BB.on) {
    tx = BB.cx - W / 2
    ty = BB.cy - H / 2
  }
  const k = snap ? 1 : Math.min(1, dt * E.camFollow)
  cam.x += (tx - cam.x) * k
  cam.y += (ty - cam.y) * k
}
/** Back to the title screen: drop the run and restore the one-screen arena. */
function toTitle() {
  G_bossBox(false)
  screen = 'title'
  menuLock = 0.4
  G = null
  setArena(W, H)
  cam.x = cam.y = 0
}
const SECTORS = [
  { grid: '#1f4bff', accent: '#3fd8ff', bg: '#02030d', name: 'GRID ALPHA' },
  { grid: '#9b2cff', accent: '#ff5ce1', bg: '#07020e', name: 'VIOLET DRIFT' },
  { grid: '#ff3b1f', accent: '#ffb347', bg: '#0e0302', name: 'CRIMSON CORE' }
]
const BOSS_NAMES = ['HEXACORE', 'THE SERPENT', 'THE EYE']

let screen = 'title' // title | howto | playing | paused | settings | draft | gameover
let G = null
let menuLock = 0
let titleShip = Math.max(0, SHIPS.findIndex((s) => s.id === save.shipId))
let pauseFrom = 'playing' // where Resume goes back to (playing or draft)
let settingsFrom = 'title'
let flash = 0
// The draft is part of a run and How to Play part of the title, so the outside world sees them as such.
const state = {
  get screen() {
    return screen === 'draft' ? 'playing' : screen === 'howto' ? 'title' : screen
  }
}
// Title menu (menu.js, drawn in the game's own style in drawTitle). Remembers the last mode you played.
const titleMenu = createMenu(
  [
    { id: 'campaign', label: 'CAMPAIGN' },
    { id: 'endless', label: 'ENDLESS' },
    { id: 'howto', label: 'HOW TO PLAY' },
    { id: 'settings', label: 'SETTINGS' }
  ],
  { x: 140 + 230, y: 320, width: 460, height: 62, gap: 14 }
)
titleMenu.select(save.endless ? 'endless' : 'campaign')
const titleSel = () => titleMenu.items.indexOf(titleMenu.selected)
const pauseMenu = createMenu(
  [
    { id: 'resume', label: 'Resume' },
    { id: 'restart', label: 'Restart' },
    { id: 'settings', label: 'Settings' },
    { id: 'title', label: 'Quit to title' }
  ],
  { x: W / 2 - 220, y: 290, width: 360, height: 60, gap: 16, accent: '#3fd8ff', idle: 'rgba(8,10,22,0.9)' }
)
const overMenu = createMenu(
  [
    { id: 'again', label: 'RETRY' },
    { id: 'title', label: 'TITLE' }
  ],
  { y: H - 150, width: 360, height: 58, gap: 12, accent: '#3ddc84', idle: 'rgba(8,10,22,0.9)' }
)
const menuFont = (px = 28) => `700 ${Math.round(px * cfg.textScale)}px ${FONT}`
// On-screen buttons for mouse and touch players (game coordinates).
const PAUSE_BTN = { x: W / 2 - 28, y: H - 76, w: 56, h: 56 }
const BOMB_BTN = { x: W - 48 - 150, y: H - 84, w: 150, h: 56 }
const ABILITY_BTN = { x: W - 48 - 220, y: H - 168, w: 220, h: 56 }
const TITLE_ARROW = { left: { x: 940 - 230, y: 370, w: 80, h: 80 }, right: { x: 940 + 150, y: 370, w: 80, h: 80 } }
const inside = (p, r) => p && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h
/** A pointer click or tap that ended inside r this frame. */
const tapped = (r) => input.pointer.released && inside(input.pointer, r)
/** Any finger or the mouse button currently down inside r (multitouch aware: another finger may be steering). */
function ptrDown(r) {
  if (input.pointer.down && inside(input.pointer, r)) return true
  for (const p of input.pointers.values()) if (p.down && inside(p, r)) return true
  return false
}
/** A finger or the mouse button that went down inside r this frame. */
const downLast = new Set()
function pressedIn(r) {
  if (input.pointer.pressed && inside(input.pointer, r)) return true
  for (const p of input.pointers.values()) if (p.down && !downLast.has(p.id) && inside(p, r)) return true
  return false
}
function rememberPointers() {
  downLast.clear()
  for (const p of input.pointers.values()) if (p.down) downLast.add(p.id)
}
const touchy = () => input.mode === 'touch' || input.mode === 'mouse'
/** Draw a tappable panel button; returns true when it was clicked or tapped. */
function button(r, label, color = '#ffffff', hot = false) {
  const hover = input.mode === 'mouse' && inside(input.pointer, r)
  panel(r.x, r.y, r.w, r.h, hot || hover ? '#ffffff' : color, hot ? 'rgba(20,26,40,0.96)' : 'rgba(8,10,22,0.9)', hot ? 4 : 2)
  text(label, r.x + r.w / 2, r.y + r.h / 2 + 8, 22, '#ffffff')
  return tapped(r)
}
// Keyboard aim: arrows aim during play (WASD moves) and go back to menu navigation elsewhere.
const ARROWS_AIM = { ArrowUp: 'aimUp', ArrowDown: 'aimDown', ArrowLeft: 'aimLeft', ArrowRight: 'aimRight' }
const ARROWS_MOVE = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }
let arrowsAim = false
function setArrowsAim(on) {
  if (on === arrowsAim) return
  arrowsAim = on
  input.extendKeys(on ? ARROWS_AIM : ARROWS_MOVE)
}
// Touch: a finger on the left half is the move stick, on the right half the aim stick.
const touchSticks = new Map()
function aimLabel() {
  return { gamepad: 'Right stick', keyboard: 'Arrows', mouse: 'Mouse (hold to fire)', touch: 'Drag right side' }[input.mode] ?? 'Arrows'
}
function moveLabel() {
  return { gamepad: 'Left stick', keyboard: 'WASD', mouse: 'WASD', touch: 'Drag left side' }[input.mode] ?? 'WASD'
}
const fx = { parts: [], rings: [], texts: [] }

function sector() {
  if (G?.endless) return SECTORS[G.tier % SECTORS.length]
  return SECTORS[clamp((G?.sector ?? 1) - 1, 0, 2)]
}
// Campaign wave number 1..30. In Endless it keeps climbing with time.
const gwave = () => (G.endless ? 1 + G.time / TUNING.endless.secondsPerWave : (G.sector - 1) * 10 + G.wave)
/** Enemy HP multiplier from difficulty. */
const hpMul = () => G.diff.enemyHp
const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`

function newRun(shipIdx, endless = false) {
  const ship = SHIPS[shipIdx]
  const diff = TUNING.difficulty[cfg.diff]
  setArena(TUNING.endless.arenaW, TUNING.endless.arenaH)
  G_bossBox(false)
  const P = {
    x: AW / 2,
    y: AH / 2,
    vx: 0,
    vy: 0,
    r: 12,
    angle: -Math.PI / 2,
    aim: -Math.PI / 2,
    hp: ship.hp + diff.hp,
    maxHp: ship.hp + diff.hp,
    bombs: ship.noBombs ? 0 : TUNING.player.startBombs,
    bombMax: ship.noBombs ? 0 : TUNING.player.bombMax,
    shield: ship.shield || 0,
    inv: 1,
    alive: true,
    weapons: ship.noGun ? [] : [{ id: ship.weapon, lvl: 1, cd: 0 }],
    cur: 0,
    passives: ship.passive ? [{ id: ship.passive[0], lvl: ship.passive[1], cd: 0 }] : [],
    stats: { dmg: ship.dmg, rate: 1, bspeed: 1, range: 1, pierce: 0, speed: ship.speed, magnet: TUNING.player.magnet, crit: 0, swarm: 1 },
    abil: { cd: 0, t: 0, dir: 0, hits: null, kills: 0, add: 0 },
    extraDrones: ship.extraDrones || 0,
    edge: 0,
    turretBonus: 0,
    statPicks: [],
    shieldT: 0,
    mods: new Set(),
    geomCount: 0,
    killCount: 0,
    bombCharge: 0,
    trail: [],
    trailT: 0,
    drones: [],
    bladeAng: 0,
    ship,
    moving: false
  }
  G = {
    P,
    shipIdx,
    diff,
    endless,
    turrets: [],
    syn: {},
    famCount: {},
    synHp: 0,
    synNote: null,
    tier: 0,
    level: 1,
    xp: 0,
    xpNext: TUNING.endless.xpStart,
    drafts: 0,
    pending: 0, // Endless: level-ups banked until the player opens the draft
    drafted: 0,
    sector: 1,
    wave: 0,
    bullets: [],
    ebullets: [],
    enemies: [],
    geoms: [],
    holes: [],
    mines: [],
    eliteT: 0, // Endless: seconds until the next elite
    blasts: [],
    score: 0,
    mult: 1,
    multProg: 0, // geoms toward the next multiplier step
    multT: 0, // seconds since the last geom
    bank: 0,
    kills: 0,
    shake: 0,
    time: 0,
    slowT: 0,
    queue: [],
    groupT: 0,
    waveState: 'fight',
    clearT: 0,
    banner: null,
    boss: null,
    rerolls: 1,
    banishes: 1,
    banished: new Set(),
    rareNext: false,
    deadT: 0,
    newFlags: [],
    laserOn: false,
    beam: null,
    vacuum: false,
    draft: null,
    win: false
  }
  fx.parts.length = fx.rings.length = fx.texts.length = 0
  cam.x = cam.y = cam.lx = cam.ly = 0
  recomputeSyn(false)
  if (endless) {
    updateCamera(0, true)
    startEndless()
  } else startWave(1)
}

function setFlag(f) {
  if (!save.flags[f]) {
    save.flags[f] = true
    G.newFlags.push(f)
    writeSave()
  }
}

// ---------- particles & effects ----------
const MAXP = 900
function burst(x, y, color, n, speed = 400, life = 0.8) {
  for (let i = 0; i < n && fx.parts.length < MAXP; i++) {
    const a = rand(TAU)
    const s = rand(0.2, 1) * speed
    fx.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.4, 1) * life, max: life, color })
  }
}
function spray(x, y, ang, spread, color, n, speed = 300, life = 0.4) {
  for (let i = 0; i < n && fx.parts.length < MAXP; i++) {
    const a = ang + rand(-spread, spread)
    const s = rand(0.4, 1) * speed
    fx.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.5, 1) * life, max: life, color })
  }
}
function ring(x, y, max, color, life = 0.5, w = 4) {
  fx.rings.push({ x, y, r: 4, max, color, life, maxLife: life, w })
}
function popup(x, y, text, color = '#fff', size = 24) {
  fx.texts.push({ x, y, text, color, size, life: 1, max: 1 })
}
function shake(n) {
  if (G && !cfg.reducedShake) G.shake = Math.max(G.shake, n)
}
function flashScreen(n) {
  if (!cfg.reducedShake) flash = Math.max(flash, n)
}

function updateFx(dt) {
  for (const p of fx.parts) {
    p.life -= dt
    if (p.life <= 0) {
      p.dead = true
      continue
    }
    const f = 1 - Math.min(1, dt * 3.2)
    p.vx *= f
    p.vy *= f
    p.x += p.vx * dt
    p.y += p.vy * dt
    if (p.x < L || p.x > R) p.vx = -p.vx
    if (p.y < T || p.y > B) p.vy = -p.vy
  }
  compact(fx.parts)
  for (const r of fx.rings) {
    r.life -= dt
    r.r += (r.max - r.r) * Math.min(1, dt * 8)
    if (r.life <= 0) r.dead = true
  }
  compact(fx.rings)
  for (const t of fx.texts) {
    t.life -= dt
    t.y -= 40 * dt
    if (t.life <= 0) t.dead = true
  }
  compact(fx.texts)
}

// ---------- spatial hash ----------
const CELL = 64
let HC = Math.ceil(W / CELL)
let HR = Math.ceil(H / CELL)
let cells = Array.from({ length: HC * HR }, () => [])
const bigs = []
const segOwners = []
const wells = []
function buildHash() {
  for (const c of cells) c.length = 0
  bigs.length = segOwners.length = wells.length = 0
  for (const e of G.enemies) {
    if (e.dead || e.spawnT > 0) continue
    if (e.segs) segOwners.push(e)
    if (e.type === 'well') wells.push(e)
    if (e.r > 30) {
      bigs.push(e)
      continue
    }
    const cx = clamp(Math.floor(e.x / CELL), 0, HC - 1)
    const cy = clamp(Math.floor(e.y / CELL), 0, HR - 1)
    cells[cy * HC + cx].push(e)
  }
}
/** Calls fn(e) for live enemies near (x, y); stops early when fn returns true. */
function forNear(x, y, r, fn) {
  const x0 = clamp(Math.floor((x - r - 30) / CELL), 0, HC - 1)
  const x1 = clamp(Math.floor((x + r + 30) / CELL), 0, HC - 1)
  const y0 = clamp(Math.floor((y - r - 30) / CELL), 0, HR - 1)
  const y1 = clamp(Math.floor((y + r + 30) / CELL), 0, HR - 1)
  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) {
      for (const e of cells[cy * HC + cx]) if (!e.dead && fn(e)) return true
    }
  }
  for (const e of bigs) if (!e.dead && fn(e)) return true
  return false
}
function segHit(x, y, r) {
  for (const o of segOwners) {
    if (o.dead) continue
    for (const s of o.segs) {
      const dx = s.x - x
      const dy = s.y - y
      const rr = s.r + r
      if (dx * dx + dy * dy < rr * rr) return s
    }
  }
  return null
}
/** Aim assist: the closest enemy inside a narrow cone around the aim direction. */
function assistTarget(x, y, aim) {
  let best = null
  let bs = Infinity
  const range2 = TUNING.assist.range ** 2
  for (const e of G.enemies) {
    if (e.dead || e.spawnT > 0 || e.invuln) continue
    const d2 = (e.x - x) ** 2 + (e.y - y) ** 2
    if (d2 > range2) continue
    const off = Math.abs(angDiff(aim, Math.atan2(e.y - y, e.x - x)))
    if (off > TUNING.assist.cone) continue
    const score = Math.sqrt(d2) * (1 + off * 3)
    if (score < bs) {
      bs = score
      best = e
    }
  }
  return best
}

function nearestEnemy(x, y, maxD) {
  let best = null
  let bd = maxD * maxD
  for (const e of G.enemies) {
    if (e.dead || e.spawnT > 0 || e.invuln) continue
    const d = (e.x - x) ** 2 + (e.y - y) ** 2
    if (d < bd) {
      bd = d
      best = e
    }
  }
  return best
}

// ---------- enemies ----------
const ENEMIES = {
  wanderer: { cost: 1, from: 1, w: 3, group: [8, 14] },
  seeker: { cost: 1, from: 1, w: 3, group: [6, 11] },
  dodger: { cost: 2, from: 2, w: 2, group: [4, 7] },
  splitter: { cost: 3, from: 2, w: 1.6, group: [3, 5] },
  snake: { cost: 5, from: 3, w: 1, group: [1, 3] },
  lancer: { cost: 3, from: 4, w: 1.4, group: [2, 5] },
  tank: { cost: 5, from: 5, w: 1, group: [1, 3] },
  well: { cost: 7, from: 6, w: 0.5, group: [1, 1] },
  spawner: { cost: 8, from: 7, w: 0.5, group: [1, 1] }
}
const BASE = {
  wanderer: { r: 16, hp: 1, score: 25, geoms: 1, speed: 100 },
  seeker: { r: 14, hp: 1.5, score: 50, geoms: 1, speed: 200 },
  dodger: { r: 15, hp: 2.5, score: 100, geoms: 2, speed: 215 },
  splitter: { r: 18, hp: 4, score: 100, geoms: 1, speed: 115 },
  mini: { r: 9, hp: 1, score: 25, geoms: 1, speed: 240 },
  snake: { r: 13, hp: 5, score: 150, geoms: 3, speed: 210 },
  lancer: { r: 15, hp: 3, score: 120, geoms: 2, speed: 150 },
  tank: { r: 22, hp: 12, score: 200, geoms: 3, speed: 70 },
  well: { r: 22, hp: 18, score: 300, geoms: 5, speed: 0 },
  spawner: { r: 24, hp: 14, score: 250, geoms: 4, speed: 40 }
}

// ---------- synergies ----------
const statDef = (id) => STATS.find((s) => s.id === id)
const modDef = (id) => MODS.find((m) => m.id === id)
/** Family of any draft card. */
function cardFam(c) {
  if (c.kind === 'weapon' || c.kind === 'wlevel') return WEAPONS[c.id].fam
  if (c.kind === 'passive' || c.kind === 'plevel') return PASSIVES[c.id].fam
  if (c.kind === 'stat') return statDef(c.id).fam
  return modDef(c.id)?.fam
}
/** How many cards of each family the build holds. Maxed weapons and passives count double. */
function famCounts() {
  const P = G.P
  const c = {}
  const add = (f, n = 1) => f && (c[f] = (c[f] || 0) + n)
  for (const w of P.weapons) add(WEAPONS[w.id].fam, w.lvl >= MAX_LVL ? 2 : 1)
  for (const p of P.passives) add(PASSIVES[p.id].fam, p.lvl >= MAX_LVL ? 2 : 1)
  for (const id of P.statPicks) add(statDef(id).fam)
  for (const m of P.mods) add(modDef(m).fam)
  return c
}
const syn = (f) => G.syn[f] || 0
/** How much taking card c adds to its family count (levels only count when they max a weapon or passive). */
function famGain(c) {
  if (c.kind === 'wlevel') return G.P.weapons.find((w) => w.id === c.id).lvl + 1 >= MAX_LVL ? 1 : 0
  if (c.kind === 'plevel') return G.P.passives.find((p) => p.id === c.id).lvl + 1 >= MAX_LVL ? 1 : 0
  return 1
}
const ROMAN = ['', 'I', 'II', 'III']
function recomputeSyn(announce = true) {
  const P = G.P
  G.famCount = famCounts()
  for (const f of Object.keys(FAMILIES)) {
    const t = FAMILY_TIERS.filter((n) => (G.famCount[f] || 0) >= n).length
    const old = G.syn[f] || 0
    G.syn[f] = t
    if (t > old && announce) {
      G.synNote = { text: `SYNERGY  ${FAMILIES[f].name} ${ROMAN[t]}`, sub: FAMILIES[f].bonus[t - 1], color: FAMILIES[f].color, t: 4 }
      sfx.levelUp()
    }
  }
  // Fortress II and III each add 1 max HP, once.
  const hp = P.mods.has('glass') ? 0 : (syn('fortress') >= 2 ? 1 : 0) + (syn('fortress') >= 3 ? 1 : 0)
  if (hp > G.synHp) {
    P.maxHp += hp - G.synHp
    P.hp += hp - G.synHp
    G.synHp = hp
  }
}
// Shared multipliers that synergies and mods feed into.
const swarmMul = () => G.P.stats.swarm * (syn('swarm') >= 3 ? 2.5 : syn('swarm') >= 2 ? 1.6 : 1)
const swarmRate = () => (G.P.mods.has('uplink') ? 1.4 : 1) * (syn('swarm') >= 3 ? 1.5 : 1)
const swarmExtra = () => (syn('swarm') >= 1 ? 1 : 0) + (G.P.mods.has('hive') ? 1 : 0)
const blastMul = () => (syn('volatile') >= 1 ? 1.4 : 1)
function abilityCdMul() {
  let m = 1
  if (syn('velocity') >= 1) m *= 0.8
  if (syn('velocity') >= 3) m *= 0.625
  if (G.P.mods.has('slipstream')) m *= 0.7
  return m
}

// How strong the build is compared with a fresh ship (1 = starting power). Enemies scale with it,
// so upgrades still feel good but the swarm keeps the pressure on.
function buildPower() {
  const P = G.P
  const best = P.weapons.length ? Math.max(...P.weapons.map((w) => w.lvl)) : 1
  let passive = 0
  for (const p of P.passives) passive += p.lvl
  const gear = (1 + (best - 1) * 0.3) * (1 + passive * 0.08)
  const mods = 1 + P.mods.size * 0.06
  return P.stats.dmg * P.stats.rate * (1 + P.stats.pierce * 0.15) * (1 + P.stats.crit * 2) * gear * mods * (P.mods.has('glass') ? 1.5 : 1)
}

function spawnEnemy(type, x, y, o = {}) {
  const b = BASE[type] ?? { r: 30, hp: 100, score: 0, geoms: 0, speed: 0 }
  const gw = gwave()
  const e = {
    type,
    x,
    y,
    vx: 0,
    vy: 0,
    angle: rand(TAU),
    spawnT: o.spawnT ?? TUNING.enemy.warmup,
    hitFlash: 0,
    slow: 0,
    bladeCd: 0,
    t: rand(10),
    r: b.r,
    hp: b.hp * (1 + (gw - 1) * TUNING.enemy.hpPerWave) * G.power ** TUNING.enemy.powerHp * hpMul(),
    score: b.score,
    geoms: b.geoms,
    speed: b.speed * (1 + (gw - 1) * TUNING.enemy.speedPerWave) * G.diff.enemySpeed,
    fireCd: rand(1.5, 3),
    wa: rand(TAU)
  }
  e.maxHp = e.hp
  if (type === 'tank') e.shield = e.hp * 0.8
  if (type === 'well') Object.assign(e, { active: false, absorbed: 0, crit: 0 })
  if (type === 'snake') {
    e.segs = []
    for (let i = 0; i < 12; i++) e.segs.push({ x, y, r: 9 - i * 0.25 })
  }
  if (o.vx) {
    e.vx = o.vx
    e.vy = o.vy
  }
  G.enemies.push(e)
  return e
}

function planWave() {
  if (G.wave === 10) return [{ boss: true }]
  const gw = gwave()
  const TW = TUNING.wave
  let budget = Math.round(
    (TW.budget + G.wave * TW.budgetPerWave + (G.sector - 1) * TW.budgetPerSector) * G.power ** TUNING.enemy.powerBudget * G.diff.density
  )
  const avail = Object.entries(ENEMIES).filter(([, v]) => v.from <= gw)
  const groups = []
  let wellsN = 0
  let spawners = 0
  while (budget > 0) {
    let [type, info] = weighted(avail, ([k, v]) => v.w * ((k === 'well' && wellsN >= 2) || (k === 'spawner' && spawners >= 2) ? 0 : 1))
    if (groups.length === 0 && info.cost > 2) [type, info] = ['wanderer', ENEMIES.wanderer]
    const count = Math.max(1, Math.min(rint(info.group[0], info.group[1]) + (G.sector - 1), Math.ceil(budget / info.cost)))
    if (type === 'well') wellsN++
    if (type === 'spawner') spawners++
    groups.push({ type, count, pattern: groups.length === 0 && G.wave === 1 ? 'ring' : pick(['corners', 'ring', 'edge', 'random']) })
    budget -= count * info.cost
  }
  // Elites join waves 3, 6 and 8 of every sector, mid-wave.
  if ([3, 6, 8].includes(G.wave)) {
    const kinds = Object.keys(ELITES).filter((k) => ELITES[k].from <= gw)
    if (kinds.length) groups.splice(Math.floor(groups.length / 2), 0, { elite: pick(kinds) })
  }
  return groups
}

function spawnGroup(g) {
  if (g.boss) return spawnBoss()
  if (g.elite) return spawnElite(g.elite)
  const P = G.P
  const edge = rint(0, 3)
  // Spawn area: the whole arena, or in Endless the visible screen plus a margin.
  const m = TUNING.endless.spawnMargin
  const [L, T, R, B] = BB.on
    ? [BB.x0, BB.y0, BB.x1, BB.y1]
    : AW > W
    ? [Math.max(16, cam.x - m), Math.max(16, cam.y - m), Math.min(AW - 16, cam.x + W + m), Math.min(AH - 16, cam.y + H + m)]
    : [16, 16, AW - 16, AH - 16]
  for (let i = 0; i < g.count; i++) {
    let x
    let y
    if (g.pattern === 'corners') {
      const c = i % 4
      x = (c % 2 ? R - 150 : L + 150) + rand(-30, 30)
      y = (c < 2 ? T + 170 : B - 150) + rand(-30, 30)
    } else if (g.pattern === 'ring') {
      const a = (i / g.count) * TAU + G.time
      x = P.x + Math.cos(a) * 340
      y = P.y + Math.sin(a) * 340
    } else if (g.pattern === 'edge') {
      const t = (i + 0.5) / g.count
      x = edge < 2 ? L + 60 + t * (R - L - 120) : edge === 2 ? L + 50 : R - 50
      y = edge >= 2 ? T + 60 + t * (B - T - 120) : edge === 0 ? T + 50 : B - 50
    } else {
      x = rand(L + 50, R - 50)
      y = rand(T + 50, B - 50)
    }
    x = clamp(x, L + 40, R - 40)
    y = clamp(y, T + 40, B - 40)
    x = clamp(x, 56, AW - 56)
    y = clamp(y, 56, AH - 56)
    for (let tries = 0; tries < 8 && Math.hypot(x - P.x, y - P.y) < 220; tries++) {
      x = rand(L + 50, R - 50)
      y = rand(T + 50, B - 50)
    }
    spawnEnemy(g.type, x, y)
  }
}

function startWave(n) {
  G.wave = n
  G.waveState = 'fight'
  G.power = buildPower()
  G.queue = planWave()
  G.sinceSpawn = 0
  G.groupT = n === 10 ? 2.4 : 0.2
  G.vacuum = false
  const boss = n === 10
  G.banner = boss
    ? { text: 'WARNING', sub: BOSS_NAMES[G.sector - 1] + ' APPROACHES', t: 2.6, color: '#ff4040' }
    : { text: `WAVE ${n}`, sub: (n === 1 ? `SECTOR ${G.sector}  ·  ${sector().name}` : `SECTOR ${G.sector}`), t: 2, color: sector().accent }
  music.setIntensity(boss ? 2 : 1)
  if (boss) {
    G_bossBox(true)
    sfx.warning()
    rumble(0.5, 0.3, 500)
  }
}

// ---------- endless mode ----------
function startEndless() {
  G.wave = 1
  G.sector = 1
  G.waveState = 'endless'
  G.power = buildPower()
  G.queue = []
  G.groupT = 1
  G.sinceSpawn = 0
  G.banner = { text: 'ENDLESS', sub: 'THE SWARM NEVER STOPS', t: 2.4, color: sector().accent }
  G.eliteT = TUNING.endless.eliteFirst
  music.setIntensity(1)
}
function swarmTarget() {
  return Math.min(TUNING.wave.densityMax, (TUNING.wave.density + gwave() * TUNING.wave.densityPerWave) * G.diff.density)
}
/** One spawn group, picked from every enemy type the current threat allows. */
function endlessGroup(room) {
  const gw = gwave()
  let wellsN = 0
  let spawners = 0
  for (const e of G.enemies) {
    if (e.dead) continue
    if (e.type === 'well') wellsN++
    if (e.type === 'spawner') spawners++
  }
  const avail = Object.entries(ENEMIES).filter(([, v]) => v.from <= gw)
  const [type, info] = weighted(avail, ([k, v]) => v.w * ((k === 'well' && wellsN >= 2) || (k === 'spawner' && spawners >= 2) ? 0 : 1))
  const count = clamp(rint(info.group[0], info.group[1]) + Math.floor(gw / 10), 1, Math.max(1, Math.ceil(room)))
  return { type, count, pattern: pick(['corners', 'ring', 'edge', 'random']) }
}
function updateEndless(dt) {
  const E = TUNING.endless
  // Threat tiers: a new palette, faster enemy bullets (they use G.sector) and a warning banner.
  const tier = Math.floor(G.time / E.tierSeconds)
  if (tier !== G.tier) {
    G.tier = tier
    G.sector = Math.min(3, tier + 1)
    G.banner = { text: 'THREAT RISING', sub: `THREAT LEVEL ${tier + 1}`, t: 2.2, color: sector().accent }
    sfx.warning()
    rumble(0.5, 0.3, 400)
    grid.force(G.P.x, G.P.y, 40, 900)
    music.setIntensity(tier >= 2 ? 2 : 1)
  }
  G.groupT -= dt
  G.sinceSpawn += dt
  G.straggle = false
  const alive = aliveCount()
  const target = swarmTarget()
  // A group on a timer, or sooner if the swarm has thinned out.
  if (alive < target && (G.groupT <= 0 || (alive < target * 0.4 && G.sinceSpawn > 0.5))) {
    spawnGroup(endlessGroup(target - alive))
    G.sinceSpawn = 0
    G.groupT = Math.max(E.groupGapMin, E.groupGap - gwave() * E.groupGapPerWave)
  }
  // Elites: more often, and in bigger groups, as the threat rises. New kinds join over time.
  G.eliteT -= dt
  if (G.eliteT <= 0) {
    G.eliteT = Math.max(E.eliteMinGap, E.eliteGap - G.tier * E.eliteGapPerTier)
    const kinds = Object.keys(ELITES).filter((k) => ELITES[k].fromT <= G.time)
    const alive = G.enemies.filter((e) => !e.dead && e.elite).length
    const n = Math.min(1 + Math.floor(G.tier / 2), E.eliteMax - alive)
    for (let i = 0; i < n; i++) spawnElite(pick(kinds))
  }
  // Level up from geoms. Upgrades bank up; the player opens the draft with Y when it's safe.
  if (G.xp >= G.xpNext) {
    G.xp -= G.xpNext
    G.level++
    G.pending++
    G.xpNext = Math.round(G.xpNext * E.xpGrowth + E.xpAdd)
    sfx.levelUp()
    popup(G.P.x, G.P.y - 40, 'UPGRADE READY', '#d8ff3a', 28)
    ring(G.P.x, G.P.y, 140, '#d8ff3a', 0.5, 4)
  }
  if (G.pending > 0 && G.P.alive && input.pressed('y')) {
    G.pending--
    G.drafted++
    openDraft()
  }
}
function resumeEndless() {
  screen = 'playing'
  G.P.inv = Math.max(G.P.inv, TUNING.endless.resumeInv)
  G.power = buildPower()
}

function aliveCount() {
  let n = 0
  for (const e of G.enemies) if (!e.dead) n++
  return n
}

function updateEnemies(dt) {
  const P = G.P
  for (const e of G.enemies) {
    if (e.dead) continue
    if (e.spawnT > 0) {
      e.spawnT -= dt
      if (e.spawnT <= 0) grid.force(e.x, e.y, 2.5, 90)
      continue
    }
    e.t += dt
    if (e.hitFlash > 0) e.hitFlash -= dt
    if (e.bladeCd > 0) e.bladeCd -= dt
    let sm = 1
    if (e.slow > 0) {
      e.slow -= dt
      sm = 0.6
    }
    const dx = P.x - e.x
    const dy = P.y - e.y
    const d = Math.hypot(dx, dy) || 1
    const tx = P.alive ? dx / d : 0
    const ty = P.alive ? dy / d : 0
    switch (e.type) {
      case 'wanderer':
        e.angle += dt * 3
        e.wa += rand(-1, 1) * dt * 3
        // The last stragglers of a wave stop drifting and charge.
        if (G.straggle) e.wa += clamp(angDiff(e.wa, Math.atan2(ty, tx)), -2 * dt, 2 * dt)
        e.vx = Math.cos(e.wa) * e.speed
        e.vy = Math.sin(e.wa) * e.speed
        break
      case 'seeker': {
        e.vx += tx * e.speed * 3 * dt
        e.vy += ty * e.speed * 3 * dt
        const s = Math.hypot(e.vx, e.vy)
        if (s > e.speed) {
          e.vx *= e.speed / s
          e.vy *= e.speed / s
        }
        e.angle = 0
        break
      }
      case 'mini': {
        const a = Math.atan2(ty, tx) + Math.sin(e.t * 5) * 0.9
        e.vx += (Math.cos(a) * e.speed - e.vx) * Math.min(1, dt * 4)
        e.vy += (Math.sin(a) * e.speed - e.vy) * Math.min(1, dt * 4)
        e.angle += dt * 6
        break
      }
      case 'dodger': {
        e.vx += (tx * e.speed - e.vx) * Math.min(1, dt * 3)
        e.vy += (ty * e.speed - e.vy) * Math.min(1, dt * 3)
        e.dodge = (e.dodge ?? 0) - dt
        if (e.dodge <= 0) {
          e.dodge = 0.12
          for (const b of G.bullets) {
            const bx = e.x - b.x
            const by = e.y - b.y
            if (bx * bx + by * by > 120 * 120) continue
            if (bx * b.vx + by * b.vy <= 0) continue
            const side = bx * b.vy - by * b.vx > 0 ? 1 : -1
            const bs = Math.hypot(b.vx, b.vy) || 1
            e.vx += (-b.vy / bs) * side * 520
            e.vy += (b.vx / bs) * side * 520
            break
          }
        }
        e.angle += dt * 2
        break
      }
      case 'splitter': {
        const a = Math.atan2(ty, tx) + Math.sin(e.t * 2) * 0.5
        e.vx = Math.cos(a) * e.speed
        e.vy = Math.sin(a) * e.speed
        e.angle += dt * 1.5
        break
      }
      case 'snake': {
        const want = Math.atan2(ty, tx) + Math.sin(e.t * 3) * 0.9
        e.angle += clamp(angDiff(e.angle, want), -3 * dt, 3 * dt)
        e.vx = Math.cos(e.angle) * e.speed
        e.vy = Math.sin(e.angle) * e.speed
        break
      }
      case 'lancer': {
        const want = d > 380 ? 1 : d < 280 ? -1 : 0
        const side = Math.sin(e.t * 0.8) > 0 ? 1 : -1
        e.vx += (tx * want * e.speed - ty * side * e.speed * 0.6 - e.vx) * Math.min(1, dt * 2)
        e.vy += (ty * want * e.speed + tx * side * e.speed * 0.6 - e.vy) * Math.min(1, dt * 2)
        e.angle = Math.atan2(ty, tx)
        e.fireCd -= dt
        if (e.fireCd <= 0 && P.alive) {
          e.fireCd = rand(2, 2.8)
          const n = G.sector >= 2 ? 3 : 1
          for (let i = 0; i < n; i++) eshoot(e.x, e.y, e.angle + (i - (n - 1) / 2) * 0.22, 270 + G.sector * 25)
        }
        break
      }
      case 'tank': {
        e.angle += clamp(angDiff(e.angle, Math.atan2(ty, tx)), -1 * dt, 1 * dt)
        e.vx = Math.cos(e.angle) * e.speed
        e.vy = Math.sin(e.angle) * e.speed
        break
      }
      case 'well':
        e.vx = e.vy = 0
        e.angle += dt * (e.active ? 1 : 0.3)
        if (e.active) grid.force(e.x, e.y, -0.5 - e.absorbed * 0.04, 150 + e.absorbed * 6)
        if (e.crit > 0) {
          // Critical: shudder, then burst.
          e.crit -= dt
          e.x += rand(-2, 2)
          e.y += rand(-2, 2)
          if (Math.random() < 0.5) spray(e.x, e.y, rand(TAU), 0.5, '#ffffff', 2, 300, 0.3)
          if (e.crit <= 0) wellOverload(e)
        }
        break
      case 'spawner':
        e.angle += dt * 0.8
        e.wa += rand(-1, 1) * dt
        e.vx = Math.cos(e.wa) * e.speed
        e.vy = Math.sin(e.wa) * e.speed
        e.fireCd -= dt
        if (e.fireCd <= 0) {
          e.fireCd = 3.2
          if (G.enemies.length < 160) {
            for (let i = 0; i < 2; i++) {
              const a = rand(TAU)
              spawnEnemy('seeker', e.x + Math.cos(a) * 30, e.y + Math.sin(a) * 30, { spawnT: 0.3 }).score = 10
            }
            ring(e.x, e.y, 60, '#ff8a1f', 0.4)
          }
        }
        break
      default:
        ;(ELITE_AI[e.type] ?? BOSS_AI[e.type])?.(e, dt, tx, ty, d)
    }
    if (!e.fixed) {
      e.x += e.vx * dt * sm
      e.y += e.vy * dt * sm
      if (e.x < L + e.r) {
        e.x = L + e.r
        e.vx = Math.abs(e.vx)
        e.wa = Math.PI - e.wa
      } else if (e.x > R - e.r) {
        e.x = R - e.r
        e.vx = -Math.abs(e.vx)
        e.wa = Math.PI - e.wa
      }
      if (e.y < T + e.r) {
        e.y = T + e.r
        e.vy = Math.abs(e.vy)
        e.wa = -e.wa
      } else if (e.y > B - e.r) {
        e.y = B - e.r
        e.vy = -Math.abs(e.vy)
        e.wa = -e.wa
      }
    }
    if (e.segs) followSegs(e, e.segGap ?? 0.75)
  }

  // Gentle separation so swarms don't collapse into one blob.
  buildHash()
  for (const e of G.enemies) {
    if (e.dead || e.spawnT > 0 || e.boss || e.bossPart || e.type === 'well') continue
    forNear(e.x, e.y, e.r, (o) => {
      if (o === e || o.boss || o.bossPart || o.type === 'well') return false
      const dx = e.x - o.x
      const dy = e.y - o.y
      const rr = (e.r + o.r) * 0.9
      const d2 = dx * dx + dy * dy
      if (d2 > rr * rr || d2 < 0.01) return false
      const d = Math.sqrt(d2)
      const push = ((rr - d) / d) * 0.25
      e.x += dx * push
      e.y += dy * push
      return false
    })
  }

  // Active black holes pull on everything.
  for (const w of wells) {
    if (!w.active || w.dead) continue
    const pull = (x, y, range, str) => {
      const dx = w.x - x
      const dy = w.y - y
      const d = Math.hypot(dx, dy) || 1
      if (d > range) return null
      return { x: (dx / d) * str * (1 - d / range), y: (dy / d) * str * (1 - d / range), d }
    }
    if (P.alive) {
      const p = pull(P.x, P.y, 380, 150)
      if (p) {
        P.x += p.x * dt
        P.y += p.y * dt
      }
    }
    for (const e of G.enemies) {
      if (e.dead || e === w || e.boss || e.bossPart || e.elite || e.type === 'well' || e.spawnT > 0) continue
      const p = pull(e.x, e.y, 300, 320)
      if (!p) continue
      e.x += p.x * dt
      e.y += p.y * dt
      if (p.d < w.r) {
        e.dead = true
        w.absorbed++
        w.hp = Math.min(w.hp + 2, w.maxHp * 2)
        w.r = Math.min(w.r + 1.2, 44)
        burst(e.x, e.y, '#ff4040', 8, 200)
        if (w.absorbed >= TUNING.well.overload && !w.crit) {
          w.crit = TUNING.well.critTime
          sfx.warning()
        }
      }
    }
    for (const g of G.geoms) {
      const p = pull(g.x, g.y, 260, 300)
      if (p) {
        g.x += p.x * dt
        g.y += p.y * dt
      }
    }
    for (const b of G.bullets) {
      const dx = w.x - b.x
      const dy = w.y - b.y
      const d2 = dx * dx + dy * dy
      if (d2 > 240 * 240) continue
      const f = (60000 / Math.max(d2, 900)) * dt * 60
      const d = Math.sqrt(d2)
      b.vx += (dx / d) * f
      b.vy += (dy / d) * f
    }
  }
}

function activateWell(w) {
  w.active = true
  ring(w.x, w.y, 160, '#ff3030', 0.5, 5)
  grid.force(w.x, w.y, -8, 260)
  sfx.deflect()
}
/** Overfed black hole: it bursts into a swarm of fast little enemies and shoves you away. */
function wellOverload(w) {
  const T = TUNING.well
  w.dead = true
  const n = Math.min(T.swarmMax, T.swarmBase + w.absorbed)
  for (let i = 0; i < n && G.enemies.length < 200; i++) {
    const a = (i / n) * TAU + rand(0.3)
    const s = rand(280, 460)
    spawnEnemy('mini', w.x + Math.cos(a) * 20, w.y + Math.sin(a) * 20, { spawnT: 0, vx: Math.cos(a) * s, vy: Math.sin(a) * s })
  }
  const P = G.P
  const dx = P.x - w.x
  const dy = P.y - w.y
  const d = Math.hypot(dx, dy) || 1
  if (d < 300) {
    P.vx += (dx / d) * 700 * (1 - d / 300)
    P.vy += (dy / d) * 700 * (1 - d / 300)
  }
  for (let i = 0; i < 3; i++) ring(w.x, w.y, 120 + i * 90, i % 2 ? '#ffffff' : '#ff3030', 0.4 + i * 0.15, 6)
  burst(w.x, w.y, '#ff3030', 60, 600)
  grid.force(w.x, w.y, 45, 500)
  shake(18)
  rumble(0.8, 0.6, 350)
  sfx.explode(true)
  popup(w.x, w.y - 40, 'OVERLOAD!', '#ff4060', 30)
}
/** Destroyed black hole: a big blast that wipes out nearby enemies. Worth more the more it swallowed. */
function wellBlast(w) {
  const T = TUNING.well
  const r = T.killR + w.absorbed * T.killRPer
  for (const o of G.enemies) {
    if (o.dead || o === w || o.spawnT > 0) continue
    if ((o.x - w.x) ** 2 + (o.y - w.y) ** 2 > (r + o.r) ** 2) continue
    if (o.boss || o.bossPart || o.elite) damage(o, 20, false)
    else kill(o, { bomb: o.type !== 'well' })
  }
  for (const b of G.ebullets) if ((b.x - w.x) ** 2 + (b.y - w.y) ** 2 < r * r) b.dead = true
  compact(G.ebullets)
  if (w.absorbed) {
    const bonus = w.absorbed * T.bonusPer * G.mult
    G.score += bonus
    popup(w.x, w.y - 50, `+${fmt(bonus)}`, '#ffe866', 32)
  }
  ring(w.x, w.y, r, '#ffffff', 0.5, 8)
  ring(w.x, w.y, r * 0.7, '#ff3030', 0.4, 5)
  grid.force(w.x, w.y, 40, r * 2)
  shake(16)
  sfx.explode(true)
}

function followSegs(e, gap) {
  let px = e.x
  let py = e.y
  let pr = e.r
  for (const s of e.segs) {
    const dx = s.x - px
    const dy = s.y - py
    const d = Math.hypot(dx, dy) || 1
    const want = (pr + s.r) * gap
    if (d > want) {
      s.x = px + (dx / d) * want
      s.y = py + (dy / d) * want
    }
    px = s.x
    py = s.y
    pr = s.r
  }
}

function eshoot(x, y, a, sp, r = 7) {
  if (G.ebullets.length >= 450) return
  sp *= G.diff.bulletSpeed
  G.ebullets.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r, life: 7 })
}

// ---------- bosses ----------
function spawnBoss() {
  const s = G.sector
  if (s === 1) {
    const core = spawnEnemy('hexcore', BB.cx, BB.cy - 120, { spawnT: 1.2 })
    Object.assign(core, { r: 62, hp: 750 * hpMul(), maxHp: 750 * hpMul(), score: 5000, geoms: 50, boss: true, invuln: true, rot: 0, name: BOSS_NAMES[0], turrets: [], fireCd: 2, spawnCd: 6 })
    for (let k = 0; k < 6; k++) {
      const t = spawnEnemy('hexturret', core.x, core.y, { spawnT: 1.2 })
      Object.assign(t, { r: 22, hp: 90 * hpMul(), maxHp: 90 * hpMul(), score: 500, geoms: 5, bossPart: true, owner: core, slot: k, fixed: true, fireCd: 1.5 + k * 0.45 })
      t.x = core.x + Math.cos((k * TAU) / 6) * 100
      t.y = core.y + Math.sin((k * TAU) / 6) * 100
      core.turrets.push(t)
    }
    G.boss = core
  } else if (s === 2) {
    const head = spawnEnemy('serpent', BB.x0 + 80, BB.y0 + 80, { spawnT: 1.2 })
    Object.assign(head, { r: 30, hp: 2800 * hpMul(), maxHp: 2800 * hpMul(), score: 9000, geoms: 70, boss: true, name: BOSS_NAMES[1], angle: 0.6, fireCd: 3, spawnCd: 6, ringCd: 4, segs: [], segGap: 0.62 })
    for (let i = 0; i < 34; i++) head.segs.push({ x: head.x, y: head.y, r: 21 - i * 0.32 })
    G.boss = head
  } else {
    const eye = spawnEnemy('eye', BB.cx, BB.cy, { spawnT: 1.4 })
    Object.assign(eye, { r: 78, hp: 7000 * hpMul(), maxHp: 7000 * hpMul(), score: 25000, geoms: 100, boss: true, name: BOSS_NAMES[2], spin: 0, fireCd: 1, wellCd: 6, seekCd: 4, aimCd: 2, tx: BB.cx, ty: BB.cy, phase: 1, look: 0 })
    G.boss = eye
  }
  shake(20)
  grid.force(BB.cx, BB.cy, 25, 600)
}

// ---------- elites ----------
// Mini-bosses: tougher enemies with a health bar and their own attacks. `from` is the campaign wave
// (1-30) or the Endless time in seconds when each one starts to appear.
const ELITES = {
  gunship: { name: 'GUNSHIP', desc: 'Circles you, firing spreads and bullet rings', r: 30, hp: 55, speed: 230, color: '#ff5c8a', from: 3, fromT: 40 },
  brood: { name: 'BROODMOTHER', desc: 'Lays mines and hatches swarmers. Shoot the mines!', r: 34, hp: 75, speed: 70, color: '#c35cff', from: 6, fromT: 90 },
  lance: { name: 'LANCE', desc: 'Keeps its distance and fires a charged beam down the red line', r: 26, hp: 45, speed: 190, color: '#ff3b3b', from: 11, fromT: 150 },
  juggernaut: { name: 'JUGGERNAUT', desc: 'Telegraphs a charge, then rams across the arena', r: 36, hp: 100, speed: 90, color: '#ffa13c', from: 16, fromT: 220 }
}
for (const [k, d] of Object.entries(ELITES)) BASE['e_' + k] = { r: d.r, hp: d.hp, score: 1500, geoms: 16, speed: d.speed }
SHAPES.e_gunship = {
  r: 30,
  color: ELITES.gunship.color,
  draw(g, r) {
    poly(g, 3, r)
    g.stroke()
    g.beginPath()
    g.arc(0, 0, r * 0.4, 0, TAU)
    g.stroke()
  }
}
SHAPES.e_brood = {
  r: 34,
  color: ELITES.brood.color,
  draw(g, r) {
    poly(g, 8, r, Math.PI / 8)
    g.stroke()
    poly(g, 8, r * 0.55, 0)
    g.stroke()
  }
}
SHAPES.e_lance = {
  r: 26,
  color: ELITES.lance.color,
  draw(g, r) {
    g.beginPath()
    g.moveTo(r * 1.3, 0)
    g.lineTo(0, -r * 0.5)
    g.lineTo(-r, 0)
    g.lineTo(0, r * 0.5)
    g.closePath()
    g.stroke()
    g.beginPath()
    g.moveTo(r * 1.3, 0)
    g.lineTo(-r, 0)
    g.stroke()
  }
}
SHAPES.e_juggernaut = {
  r: 36,
  color: ELITES.juggernaut.color,
  draw(g, r) {
    const s = r * 0.7
    g.strokeRect(-s, -s, s * 2, s * 2)
    g.beginPath()
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + Math.PI / 4
      g.moveTo(Math.cos(a) * s * 1.2, Math.sin(a) * s * 1.2)
      g.lineTo(Math.cos(a) * r * 1.25, Math.sin(a) * r * 1.25)
    }
    g.moveTo(r, 0)
    g.lineTo(s, 0)
    g.stroke()
  }
}
function spawnElite(kind) {
  const P = G.P
  const def = ELITES[kind]
  const a = rand(TAU)
  const x = clamp(P.x + Math.cos(a) * 480, L + 80, R - 80)
  const y = clamp(P.y + Math.sin(a) * 380, T + 80, B - 80)
  const e = spawnEnemy('e_' + kind, x, y, { spawnT: 1.4 })
  Object.assign(e, { elite: true, name: def.name, fireCd: 1.5, novaCd: 4, mineCd: 2, hatchCd: 5, tele: 0, charge: 0, state: 'move', dir: rand() < 0.5 ? 1 : -1 })
  G.synNote = { text: `ELITE  ${def.name}`, sub: def.desc, color: def.color, t: 3.5 }
  sfx.warning()
  rumble(0.4, 0.3, 300)
  return e
}
/** Steer toward a target velocity smoothly. */
function steer(e, vx, vy, dt, k = 3) {
  e.vx += (vx - e.vx) * Math.min(1, dt * k)
  e.vy += (vy - e.vy) * Math.min(1, dt * k)
}
const ELITE_AI = {
  e_gunship(e, dt) {
    const P = G.P
    e.orb = (e.orb ?? Math.atan2(e.y - P.y, e.x - P.x)) + dt * 0.7 * e.dir
    const gx = P.x + Math.cos(e.orb) * 320 - e.x
    const gy = P.y + Math.sin(e.orb) * 320 - e.y
    const gd = Math.hypot(gx, gy) || 1
    steer(e, (gx / gd) * e.speed * Math.min(1, gd / 80), (gy / gd) * e.speed * Math.min(1, gd / 80), dt)
    const aim = Math.atan2(P.y - e.y, P.x - e.x)
    e.angle = aim
    if ((e.fireCd -= dt) <= 0) {
      e.fireCd = 1.4
      for (let i = -1; i <= 1; i++) eshoot(e.x, e.y, aim + i * 0.2, 300)
    }
    if ((e.novaCd -= dt) <= 0) {
      e.novaCd = 5
      for (let i = 0; i < 14; i++) eshoot(e.x, e.y, (i / 14) * TAU + e.t, 200)
      ring(e.x, e.y, 90, ELITES.gunship.color, 0.4, 4)
    }
  },
  e_brood(e, dt, tx, ty) {
    const P = G.P
    steer(e, tx * e.speed, ty * e.speed, dt, 1.5)
    e.angle += dt * 0.6
    if ((e.mineCd -= dt) <= 0) {
      e.mineCd = 2.4
      if (G.mines.length < 14) {
        // Lob a mine toward where you are.
        const k = rand(0.45, 0.75)
        const mx = clamp(e.x + (P.x - e.x) * k + rand(-70, 70), L + 20, R - 20)
        const my = clamp(e.y + (P.y - e.y) * k + rand(-70, 70), T + 20, B - 20)
        G.mines.push({ x: mx, y: my, arm: 1.1, life: 9, r: 13 })
        spray(e.x, e.y, Math.atan2(my - e.y, mx - e.x), 0.3, ELITES.brood.color, 6, 300, 0.4)
      }
    }
    if ((e.hatchCd -= dt) <= 0) {
      e.hatchCd = 6
      if (G.enemies.length < 160) for (let i = 0; i < 2; i++) spawnEnemy('mini', e.x + rand(-20, 20), e.y + rand(-20, 20), { spawnT: 0.3 })
    }
  },
  e_lance(e, dt, tx, ty, d) {
    const P = G.P
    if (e.charge > 0) {
      // Charging: stand still, keep the line locked, then fire down it.
      steer(e, 0, 0, dt, 6)
      e.charge -= dt
      if (e.charge <= 0) {
        for (let i = 0; i < 7; i++) eshoot(e.x, e.y, e.aimA, 700 + i * 70, 8)
        e.fireCd = 3.2
        sfx.heavy()
      }
      return
    }
    // Hold a distance of about 460, strafing.
    const want = d < 400 ? -1 : d > 540 ? 1 : 0
    steer(e, tx * e.speed * want - ty * e.speed * 0.5 * e.dir, ty * e.speed * want + tx * e.speed * 0.5 * e.dir, dt)
    e.angle = Math.atan2(ty, tx)
    if ((e.fireCd -= dt) <= 0) {
      e.charge = 0.9
      e.aimA = Math.atan2(P.y - e.y, P.x - e.x)
      e.angle = e.aimA
    }
  },
  e_juggernaut(e, dt, tx, ty) {
    if (e.state === 'charge') {
      e.charge -= dt
      e.vx = Math.cos(e.aimA) * 950
      e.vy = Math.sin(e.aimA) * 950
      spray(e.x, e.y, e.aimA + Math.PI, 0.4, ELITES.juggernaut.color, 2, 300, 0.4)
      const wall = e.x <= L + e.r + 2 || e.x >= R - e.r - 2 || e.y <= T + e.r + 2 || e.y >= B - e.r - 2
      if (e.charge <= 0 || wall) {
        // Impact: a burst of bullets and a shudder.
        e.state = 'move'
        e.fireCd = 3.2
        for (let i = 0; i < 12; i++) eshoot(e.x, e.y, (i / 12) * TAU, 230)
        ring(e.x, e.y, 140, ELITES.juggernaut.color, 0.4, 6)
        grid.force(e.x, e.y, 25, 250)
        shake(8)
        sfx.explode(true)
        e.vx = e.vy = 0
      }
      return
    }
    if (e.state === 'tele') {
      steer(e, 0, 0, dt, 8)
      e.tele -= dt
      if (e.tele <= 0) {
        e.state = 'charge'
        e.charge = 0.9
      }
      return
    }
    steer(e, tx * e.speed, ty * e.speed, dt, 2)
    e.angle = Math.atan2(ty, tx)
    if ((e.fireCd -= dt) <= 0) {
      e.state = 'tele'
      e.tele = 0.9
      e.aimA = Math.atan2(G.P.y - e.y, G.P.x - e.x)
      e.angle = e.aimA
    }
  }
}
// Mines: arm after a moment, then burst into a bullet ring when you come close or when they expire.
// Your shots defuse them.
function updateMines(dt) {
  const P = G.P
  for (const m of G.mines) {
    m.arm -= dt
    m.life -= dt
    const near = P.alive && m.arm <= 0 && (P.x - m.x) ** 2 + (P.y - m.y) ** 2 < 85 * 85
    if (near || m.life <= 0) {
      m.dead = true
      for (let i = 0; i < 10; i++) eshoot(m.x, m.y, (i / 10) * TAU + rand(0.3), 220)
      ring(m.x, m.y, 85, '#ff4060', 0.35, 4)
      sfx.explode(false)
      continue
    }
    for (const b of G.bullets) {
      if (b.dead || (b.x - m.x) ** 2 + (b.y - m.y) ** 2 > (m.r + b.r) ** 2) continue
      b.dead = true
      m.dead = true
      burst(m.x, m.y, '#ff4060', 12, 260)
      G.score += 50 * G.mult
      break
    }
  }
  compact(G.mines)
}
function drawMines() {
  worldT()
  for (const m of G.mines) {
    const armed = m.arm <= 0
    ctx.strokeStyle = '#ff4060'
    ctx.fillStyle = armed ? (Math.floor(G.time * 6) % 2 ? '#ff4060' : '#7a1020') : '#3a0810'
    ctx.lineWidth = 2
    ctx.globalAlpha = 1
    ctx.beginPath()
    ctx.arc(m.x, m.y, m.r, 0, TAU)
    ctx.fill()
    ctx.stroke()
    if (armed) {
      ctx.globalAlpha = 0.18
      ctx.beginPath()
      ctx.arc(m.x, m.y, 85, 0, TAU)
      ctx.stroke()
    }
  }
  ctx.globalAlpha = 1
}
/** Elite telegraphs and health bars, drawn over the enemy. */
function drawEliteOverlay(e) {
  if (e.spawnT > 0) return
  worldT()
  ctx.globalAlpha = 1
  const def = ELITES[e.type.slice(2)]
  if ((e.type === 'e_lance' && e.charge > 0) || (e.type === 'e_juggernaut' && e.state === 'tele')) {
    const k = e.type === 'e_lance' ? 1 - e.charge / 0.9 : 1 - e.tele / 0.9
    ctx.strokeStyle = def.color
    ctx.globalAlpha = 0.25 + k * 0.6
    ctx.lineWidth = 2 + k * 6
    ctx.beginPath()
    ctx.moveTo(e.x, e.y)
    ctx.lineTo(e.x + Math.cos(e.aimA) * 1600, e.y + Math.sin(e.aimA) * 1600)
    ctx.stroke()
    ctx.globalAlpha = 1
  }
  const bw = 84
  const x = e.x - bw / 2
  const y = e.y - e.r - 22
  ctx.fillStyle = 'rgba(0,0,0,0.7)'
  ctx.fillRect(x, y, bw, 8)
  ctx.fillStyle = def.color
  ctx.fillRect(x, y, bw * clamp(e.hp / e.maxHp, 0, 1), 8)
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 1.5
  ctx.strokeRect(x, y, bw, 8)
}

const BOSS_AI = {
  hexcore(e, dt) {
    const alive = e.turrets.filter((t) => !t.dead).length
    e.invuln = alive > 0
    e.rot += dt * (alive ? 0.45 : 1.2)
    e.angle = e.rot
    const tx = BB.cx + Math.sin(e.t * 0.3) * 330
    const ty = BB.cy + Math.sin(e.t * 0.47) * 170
    e.vx = (tx - e.x) * 0.6
    e.vy = (ty - e.y) * 0.6
    for (const t of e.turrets) {
      if (t.dead) continue
      const a = e.rot + (t.slot * TAU) / 6
      t.x = e.x + Math.cos(a) * 100
      t.y = e.y + Math.sin(a) * 100
    }
    if (!alive) {
      e.fireCd -= dt
      if (e.fireCd <= 0) {
        e.fireCd = 1.3
        for (let i = 0; i < 14; i++) eshoot(e.x, e.y, e.rot + (i / 14) * TAU, 210)
        ring(e.x, e.y, 120, '#ff8a1f', 0.4)
      }
    }
    e.spawnCd -= dt
    if (e.spawnCd <= 0) {
      e.spawnCd = alive ? 7 : 4.5
      const type = alive ? 'wanderer' : 'seeker'
      for (let i = 0; i < 4; i++) spawnEnemy(type, i % 2 ? BB.x1 - 80 : BB.x0 + 80, i < 2 ? BB.y0 + 80 : BB.y1 - 80, { spawnT: 0.6 })
    }
  },
  hexturret(e, dt, tx, ty) {
    e.angle = Math.atan2(ty, tx)
    e.fireCd -= dt
    if (e.fireCd <= 0) {
      const alive = e.owner.turrets.filter((t) => !t.dead).length
      e.fireCd = 1.4 + alive * 0.3
      eshoot(e.x, e.y, e.angle, 260)
      if (alive <= 3) {
        eshoot(e.x, e.y, e.angle + 0.25, 260)
        eshoot(e.x, e.y, e.angle - 0.25, 260)
      }
    }
  },
  serpent(e, dt, tx, ty) {
    const p2 = e.hp < e.maxHp * 0.5
    let want = Math.atan2(ty, tx) + Math.sin(e.t * 2) * 0.6
    // Steer away from walls.
    const m = 120
    if (e.x < BB.x0 + m || e.x > BB.x1 - m || e.y < BB.y0 + m || e.y > BB.y1 - m) want = Math.atan2(BB.cy - e.y, BB.cx - e.x)
    const turn = p2 ? 3 : 2.2
    e.angle += clamp(angDiff(e.angle, want), -turn * dt, turn * dt)
    const sp = p2 ? 290 : 215
    e.vx = Math.cos(e.angle) * sp
    e.vy = Math.sin(e.angle) * sp
    e.fireCd -= dt
    if (e.fireCd <= 0) {
      e.fireCd = p2 ? 1.6 : 2.6
      const n = p2 ? 7 : 5
      const a = Math.atan2(ty, tx)
      for (let i = 0; i < n; i++) eshoot(e.x, e.y, a + (i - (n - 1) / 2) * 0.2, 280)
    }
    e.ringCd -= dt
    if (p2 && e.ringCd <= 0) {
      e.ringCd = 3.5
      const s = pick(e.segs)
      for (let i = 0; i < 10; i++) eshoot(s.x, s.y, (i / 10) * TAU, 180)
      ring(s.x, s.y, 80, '#7dff7a', 0.4)
    }
    e.spawnCd -= dt
    if (e.spawnCd <= 0) {
      e.spawnCd = 6
      const s = e.segs[e.segs.length - 1]
      for (let i = 0; i < 3; i++) spawnEnemy('dodger', s.x, s.y, { spawnT: 0.4 })
    }
  },
  eye(e, dt, tx, ty) {
    const P = G.P
    const phase = e.hp > e.maxHp * 0.66 ? 1 : e.hp > e.maxHp * 0.33 ? 2 : 3
    if (phase !== e.phase) {
      e.phase = phase
      shake(18)
      sfx.warning()
      ring(e.x, e.y, 400, '#ff4040', 0.8, 8)
      grid.force(e.x, e.y, 30, 500)
      G.ebullets.length = 0
    }
    e.look += clamp(angDiff(e.look, Math.atan2(ty, tx)), -4 * dt, 4 * dt)
    if (Math.hypot(e.tx - e.x, e.ty - e.y) < 20) {
      e.tx = rand(BB.x0 + 220, BB.x1 - 220)
      e.ty = rand(BB.y0 + 200, BB.y1 - 200)
    }
    const a = Math.atan2(e.ty - e.y, e.tx - e.x)
    e.vx = Math.cos(a) * 45
    e.vy = Math.sin(a) * 45
    e.fireCd -= dt
    e.spin += dt * (phase === 3 ? 1.9 : 1.4)
    if (phase === 1) {
      if (e.fireCd <= 0) {
        e.fireCd = e.t % 6 < 4.2 ? 0.1 : 0.4
        if (e.t % 6 < 4.2) for (let k = 0; k < 3; k++) eshoot(e.x, e.y, e.spin + (k * TAU) / 3, 200)
      }
    } else if (phase === 2) {
      if (e.fireCd <= 0) {
        e.fireCd = 1.25
        e.alt = !e.alt
        for (let i = 0; i < 22; i++) eshoot(e.x, e.y, ((i + (e.alt ? 0.5 : 0)) / 22) * TAU, 190)
        ring(e.x, e.y, 160, '#ff4040', 0.4)
      }
      e.wellCd -= dt
      if (e.wellCd <= 0) {
        e.wellCd = 9
        if (G.enemies.filter((o) => !o.dead && o.type === 'well').length < 2) activateWell(spawnEnemy('well', rand(BB.x0 + 150, BB.x1 - 150), rand(BB.y0 + 150, BB.y1 - 150)))
      }
    } else {
      if (e.fireCd <= 0) {
        e.fireCd = 0.09
        for (let k = 0; k < 2; k++) eshoot(e.x, e.y, e.spin * 1.3 + k * Math.PI, 230)
        eshoot(e.x, e.y, -e.spin + Math.PI / 2, 170)
      }
      e.seekCd -= dt
      if (e.seekCd <= 0) {
        e.seekCd = 3.5
        for (let i = 0; i < 3; i++) spawnEnemy('seeker', rand(BB.x0 + 60, BB.x1 - 60), i % 2 ? BB.y0 + 60 : BB.y1 - 60, { spawnT: 0.5 })
      }
    }
    if (phase >= 2 && P.alive) {
      e.aimCd -= dt
      if (e.aimCd <= 0) {
        e.aimCd = phase === 3 ? 1.6 : 2.2
        const aa = Math.atan2(ty, tx)
        for (let i = -1; i <= 1; i++) eshoot(e.x + Math.cos(aa) * 40, e.y + Math.sin(aa) * 40, aa + i * 0.12, 320, 8)
      }
    }
  }
}

// ---------- combat ----------
function dmgMul() {
  const P = G.P
  return (
    P.stats.dmg *
    (P.mods.has('glass') ? 2 : 1) *
    (P.mods.has('momentum') && P.moving ? 1.4 : 1) *
    (syn('velocity') >= 2 && P.moving ? 1.3 : 1) *
    (syn('harvest') >= 3 ? 1 + G.mult * 0.05 : 1) *
    (P.mods.has('overdrive') ? 1.25 : 1)
  )
}
const barraging = () => G.P.ship.ability === 'barrage' && G.P.abil.t > 0
function fireRate() {
  const P = G.P
  return P.stats.rate * (barraging() ? TUNING.ability.barrage.rate : 1) * (P.mods.has('overclock') ? 1 + Math.min(G.mult, 10) / 10 : 1) * (syn('velocity') >= 2 && P.moving ? 1.2 : 1) * (P.mods.has('overdrive') ? 1.4 : 1)
}

function damage(e, amt, canCrit = true) {
  if (e.dead || e.spawnT > 0 || e.invuln) return 0
  let d = amt * dmgMul()
  const pr = syn('precision')
  const crit = G.P.stats.crit + (pr >= 1 ? 0.1 : 0) + (pr >= 3 ? 0.2 : 0)
  if (canCrit && crit > 0 && Math.random() < crit) {
    d *= pr >= 3 ? 6 : pr >= 2 ? 5 : 3
    spray(e.x, e.y, rand(TAU), Math.PI, '#ffe866', 5, 260, 0.3)
  }
  if (e.type === 'well' && !e.active) activateWell(e)
  e.hp -= d
  e.hitFlash = 0.05
  if (G.P.mods.has('frost')) e.slow = 1
  if (e.hp <= 0) kill(e)
  return d
}

function kill(e, opt = {}) {
  if (e.dead) return
  e.dead = true
  const color = SHAPES[e.type]?.color ?? '#ff4040'
  const big = e.boss
  burst(e.x, e.y, color, big ? 260 : clamp(e.r * 1.6, 14, 42), big ? 800 : 440, big ? 1.6 : 0.8)
  if (e.segs) for (const s of e.segs) burst(s.x, s.y, color, big ? 10 : 4, 300)
  grid.force(e.x, e.y, big ? 45 : e.r > 20 ? 14 : 7, big ? 500 : 120)
  sfx.explode(big || e.r > 20)
  if (e.spawnT > 0) return
  const pts = Math.round(e.score * G.mult * G.diff.score)
  G.score += pts
  if (e.score >= 150) popup(e.x, e.y - e.r, fmt(pts), '#ffffff', e.boss ? 40 : 24)
  const P = G.P
  for (let i = 0; i < e.geoms; i++) {
    if (G.geoms.length > 350) {
      G.bank += P.mods.has('greed') ? 2 : 1
      continue
    }
    const a = rand(TAU)
    const s = rand(40, e.boss ? 500 : 160)
    G.geoms.push({ x: e.x, y: e.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 9, a: rand(TAU) })
  }
  G.kills++
  P.killCount++
  if (P.mods.has('vampire') && P.killCount % 120 === 0 && P.hp < P.maxHp) {
    P.hp++
    popup(P.x, P.y - 30, '+1 HP', '#7dff7a')
  }
  if (e.type === 'splitter' && !opt.bomb) {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + rand(1)
      spawnEnemy('mini', e.x + Math.cos(a) * 12, e.y + Math.sin(a) * 12, { spawnT: 0, vx: Math.cos(a) * 300, vy: Math.sin(a) * 300 })
    }
  }
  if (P.mods.has('fission') && !opt.bomb) {
    for (let i = 0; i < 4; i++) shoot(e.x, e.y, (i / 4) * TAU + rand(1), 700, 0.8, { life: 0.4, color: '#ffffff', r: 4, noSplit: true })
  }
  const vol = syn('volatile')
  if (!opt.bomb && (P.mods.has('chain') || (vol >= 2 && Math.random() < (vol >= 3 ? 1 : 0.3)))) G.blasts.push({ x: e.x, y: e.y, r: (70 + e.r) * blastMul(), t: 0.07 })
  // Nova Mortar: a kill inside a blast sets off the next link of the chain.
  if (G.chain > 0 && G.blasts.length < TUNING.mortar.maxBlasts) {
    const M = TUNING.mortar
    G.blasts.push({ x: e.x, y: e.y, r: (M.chainR + e.r) * blastMul(), t: M.chainDelay, dmg: G.chainDmg * M.chainDmg, chain: G.chain - 1, color: '#ff7a2f' })
  }
  // Interceptor rule: kills during a Barrage extend it.
  if (P.ship.ability === 'barrage' && P.abil.t > 0 && P.abil.add < TUNING.ability.barrage.maxAdd) {
    const C = TUNING.ability.barrage
    P.abil.t += C.killAdd
    P.abil.add += C.killAdd
  }
  if (e.type === 'well') wellBlast(e)
  if (e.elite) {
    popup(e.x, e.y - e.r - 10, `${e.name} DOWN`, ELITES[e.type.slice(2)].color, 28)
    shake(14)
    rumble(0.7, 0.5, 300)
    for (let i = 0; i < 3; i++) ring(e.x, e.y, 80 + i * 70, i % 2 ? '#ffffff' : ELITES[e.type.slice(2)].color, 0.4 + i * 0.15, 5)
  }
  if (e.boss) bossDown(e)
}

function bossDown(e) {
  rumble(1, 1, 900)
  G.slowT = 1.4
  shake(40)
  flashScreen(0.8)
  sfx.explode(true)
  setTimeout(() => sfx.explode(true), 250)
  for (let i = 0; i < 5; i++) ring(e.x, e.y, 200 + i * 160, i % 2 ? '#ffffff' : (SHAPES[e.type]?.color ?? '#ff4040'), 0.6 + i * 0.2, 6)
  setFlag(['boss1', 'boss2', 'win'][G.sector - 1])
  for (const o of G.enemies) if (!o.dead) kill(o, { bomb: true })
  G.ebullets.length = 0
  G.boss = null
  G_bossBox(false)
}

function shoot(x, y, a, speed, dmg, o = {}) {
  if (G.bullets.length > 700) return null
  const P = G.P
  const sp = speed * P.stats.bspeed
  const b = {
    x,
    y,
    vx: Math.cos(a) * sp,
    vy: Math.sin(a) * sp,
    dmg: dmg * (G.gunShot ? (P.ship.gunDmg ?? 1) : 1),
    r: o.r || 5,
    life: (o.life || 0.9) * P.stats.range,
    pierce: (o.pierce || 0) + P.stats.pierce + (syn('kinetic') >= 1 ? 1 : 0) + (G.gunShot && barraging() ? TUNING.ability.barrage.pierce : 0),
    bounces: (o.bounces || 0) + (P.mods.has('bouncy') ? 1 : 0) + (syn('kinetic') >= 2 ? 1 : 0),
    kin3: syn('kinetic') >= 3,
    color: o.color || '#ffe866',
    homing: o.homing || 0,
    shell: o.shell || null,
    splash: (o.splash || 0) * blastMul(),
    hits: o.hits || null,
    split: P.mods.has('splitshot') && !o.noSplit,
    w: o.w || 1,
    target: null,
    retarget: 0
  }
  G.bullets.push(b)
  return b
}

/** Nova Mortar shell bursts: everything in the blast takes damage, and kills chain into more blasts. */
function shellBurst(b, direct = null) {
  if (b.dead) return
  b.dead = true
  const S = b.shell
  const r = S.r * blastMul()
  boom(b.x, b.y, r, S.dmg, S.links, '#ff7a2f', direct)
  burst(b.x, b.y, '#ff7a2f', 40, 520, 0.7)
  burst(b.x, b.y, '#ffffff', 16, 360, 0.5)
  ring(b.x, b.y, r * 0.6, '#ffe866', 0.3, 4)
  grid.force(b.x, b.y, 28, r * 1.6)
  shake(9)
  rumble(0.5, 0.4, 160)
  sfx.explode(true)
}
/** One explosion: damages everything in range; with links > 0, its kills set off the next ring of blasts. */
function boom(x, y, r, dmg, links, color, direct = null) {
  ring(x, y, r, color, 0.35, 5)
  const prev = G.chain
  const prevDmg = G.chainDmg
  G.chain = links
  G.chainDmg = dmg
  if (direct) damage(direct, TUNING.mortar.direct, true)
  forNear(x, y, r, (e) => {
    if (e.spawnT <= 0 && (e.x - x) ** 2 + (e.y - y) ** 2 < (r + e.r) ** 2) damage(e, dmg, false)
    return false
  })
  G.chain = prev
  G.chainDmg = prevDmg
}

// Primary weapons. Each fires once and returns its cooldown in seconds.
const WFIRE = {
  blaster(w, a, x, y) {
    const l = w.lvl - 1
    const n = [2, 2, 3, 3, 4][l]
    const dm = [1.15, 1.45, 1.45, 1.45, 1.6][l]
    for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2) * 10
      shoot(x - Math.sin(a) * off, y + Math.cos(a) * off, a + (i - (n - 1) / 2) * 0.03, 980, dm, { color: barraging() ? '#bff4ff' : '#ffe866' })
    }
    sfx.shoot()
    return [0.09, 0.09, 0.09, 0.075, 0.075][l]
  },
  homing(w, a, x, y) {
    const l = w.lvl - 1
    const n = [3, 3, 4, 4, 5][l]
    const dm = [2.4, 3, 3, 3.4, 3.8][l]
    for (let i = 0; i < n; i++) shoot(x, y, a + (i - (n - 1) / 2) * 0.5, 600, dm, { homing: 1, life: 2.2, color: '#7dff7a', r: 6, splash: 45 })
    sfx.missile()
    return [0.36, 0.36, 0.34, 0.3, 0.28][l]
  },

  mortar(w, a, x, y) {
    const l = w.lvl - 1
    const M = TUNING.mortar
    shoot(x, y, a, M.speed, 0, { shell: { r: M.r[l], dmg: M.dmg[l], links: M.links[l] }, life: M.life, r: 11, color: '#ff7a2f', w: 2.4, noSplit: true })
    sfx.heavy()
    sfx.missile()
    shake(3)
    return M.rate[l]
  }
}

function fireLaser(w, a, x, y, dt) {
  const l = w.lvl - 1
  const dps = [15, 19, 19, 25, 32][l] * fireRate() * (G.P.ship.gunDmg ?? 1)
  const width = [12, 12, 18, 18, 26][l]
  const cx = Math.cos(a)
  const cy = Math.sin(a)
  let len = 2000
  if (cx > 0.001) len = Math.min(len, (R - x) / cx)
  if (cx < -0.001) len = Math.min(len, (L - x) / cx)
  if (cy > 0.001) len = Math.min(len, (B - y) / cy)
  if (cy < -0.001) len = Math.min(len, (T - y) / cy)
  const x1 = x + cx * len
  const y1 = y + cy * len
  G.beam = { x0: x, y0: y, x1, y1, width, t: G.time }
  for (const e of G.enemies) {
    if (e.dead || e.spawnT > 0) continue
    const rr = e.r + width / 2
    if (segDist2(e.x, e.y, x, y, x1, y1) > rr * rr) continue
    if (e.invuln) continue
    damage(e, dps * dt)
    if (Math.random() < 0.3) spray(e.x, e.y, a + Math.PI, 0.8, '#ff4fd8', 1, 300, 0.3)
  }
  if (Math.random() < 0.5) spray(x1, y1, a + Math.PI, 1.2, '#ff4fd8', 2, 300, 0.3)
  grid.force(x1, y1, 1.2, 60)
}

function bomb() {
  const P = G.P
  if (P.bombs <= 0 || !P.alive) {
    sfx.deny()
    return
  }
  P.bombs--
  sfx.bomb()
  rumble(0.9, 0.6, 400)
  shake(28)
  flashScreen(0.5)
  grid.force(P.x, P.y, 50, 900)
  ring(P.x, P.y, 1400, '#ffffff', 0.9, 10)
  ring(P.x, P.y, 900, sector().accent, 0.7, 6)
  for (const e of G.enemies) {
    if (e.dead) continue
    if (e.boss || e.bossPart) {
      if (!e.invuln && e.spawnT <= 0) damage(e, (e.maxHp * 0.05 + 20) / dmgMul(), false)
    } else if (e.elite) {
      if (e.spawnT <= 0) damage(e, (e.maxHp * 0.35) / dmgMul(), false)
    } else kill(e, { bomb: true })
  }
  for (const m of G.mines) burst(m.x, m.y, '#ff4060', 6, 200)
  G.mines.length = 0
  for (const b of G.ebullets) burst(b.x, b.y, '#ff3d6e', 1, 200)
  G.ebullets.length = 0
  if (P.mods.has('singularity')) G.holes.push({ x: P.x, y: P.y, life: 5 })
}

// ---------- score multiplier ----------
const multCap = () => (syn('harvest') >= 3 ? TUNING.mult.capHarvest : TUNING.mult.cap)
function gainMult(n) {
  G.multT = 0
  if (G.mult >= multCap()) return
  G.multProg += n
  while (G.multProg >= TUNING.mult.perStep && G.mult < multCap()) {
    G.multProg -= TUNING.mult.perStep
    G.mult++
    popup(G.P.x, G.P.y - 40, `×${G.mult}`, '#d8ff3a', 28)
  }
  if (G.mult >= multCap()) G.multProg = 0
}
/** The multiplier slips one step per second once you stop collecting geoms. */
function decayMult(dt) {
  const grace = syn('harvest') >= 2 ? TUNING.mult.graceHarvest : TUNING.mult.grace
  G.multT += dt
  if (G.multT > grace && G.mult > 1) {
    G.mult--
    G.multProg = 0
    G.multT = grace - TUNING.mult.decayStep
  }
}

/** Reap and Phase make you untouchable while they last. */
const untouchable = (P) => P.abil.t > 0 && (P.ship.ability === 'reap' || P.ship.ability === 'phase')
function hurtPlayer() {
  const P = G.P
  if (P.inv > 0 || !P.alive || untouchable(P)) return
  if (P.shield > 0) {
    P.shield--
    if (syn('fortress') >= 1) for (let i = 0; i < 24; i++) shoot(P.x, P.y, (i / 24) * TAU, 760, 2.5, { life: 0.8, color: '#8fb3ff', noSplit: true })
    P.inv = TUNING.player.shieldInv * G.diff.inv
    sfx.shield()
    rumble(0.3, 0.6, 180)
    ring(P.x, P.y, 160, '#5ee0ff', 0.5, 6)
    blast(P.x, P.y, 150, false)
    return
  }
  P.hp--
  G.mult = Math.max(1, Math.floor(G.mult * (syn('harvest') >= 2 ? 0.8 : TUNING.multKeepOnHit)))
  P.inv = TUNING.player.hitInv * G.diff.inv
  shake(22)
  rumble(0.8, 0.5, 280)
  sfx.playerHit()
  flashScreen(0.25)
  grid.force(P.x, P.y, 30, 400)
  burst(P.x, P.y, '#ffffff', 40, 500)
  ring(P.x, P.y, 220, '#ff4040', 0.5, 6)
  blast(P.x, P.y, 180)
  if (P.mods.has('nova')) for (let i = 0; i < 32; i++) shoot(P.x, P.y, (i / 32) * TAU, 800, 2, { life: 0.9, color: '#ffffff', noSplit: true })
  if (P.hp <= 0) {
    P.alive = false
    G.deadT = 2.6
    G.slowT = 1.5
    sfx.explode(true)
    rumble(1, 1, 700)
    burst(P.x, P.y, P.ship.glow, 200, 700, 1.6)
    burst(P.x, P.y, '#ffffff', 100, 500, 1.2)
    ring(P.x, P.y, 600, P.ship.glow, 1.2, 8)
    grid.force(P.x, P.y, 60, 700)
    sfx.laser(false)
    G.laserOn = false
  }
}

/** Shockwave around the player after a hit: clears bullets and knocks back the swarm. */
function blast(x, y, r, canKill = true) {
  for (const e of G.enemies) {
    if (e.dead || e.boss || e.bossPart || e.elite) continue
    const dx = e.x - x
    const dy = e.y - y
    const d = Math.hypot(dx, dy) || 1
    if (d > r) continue
    if (canKill && e.hp <= 3 * dmgMul() && e.spawnT <= 0) kill(e, { bomb: true })
    else {
      e.x += (dx / d) * (r - d)
      e.y += (dy / d) * (r - d)
    }
  }
  for (const b of G.ebullets) if (Math.hypot(b.x - x, b.y - y) < r * 1.3) b.dead = true
  compact(G.ebullets)
}

// ---------- ship abilities (LT) ----------
function updateAbility(dt, aiming) {
  const P = G.P
  const A = P.abil
  const id = P.ship.ability
  const C = TUNING.ability[id]
  const press = input.pressed('lt') || input.pressed('x') || pressedIn(ABILITY_BTN)
  if (A.cd > 0) A.cd -= dt
  if (A.t > 0) A.t -= dt
  const ready = A.cd <= 0 && A.t <= 0
  if (id === 'reap') {
    if (press && ready) {
      A.dir = aiming ? P.aim : P.moving ? Math.atan2(P.vy, P.vx) : P.aim
      A.t = C.t
      A.cd = C.cd * abilityCdMul()
      A.hits = new Set()
      A.kills = 0
      A.reaping = true
      P.vx = Math.cos(A.dir) * C.speed
      P.vy = Math.sin(A.dir) * C.speed
      sfx.missile()
      rumble(0.4, 0.2, 120)
      grid.force(P.x, P.y, 10, 140)
    }
    if (A.t > 0) {
      spray(P.x, P.y, A.dir + Math.PI, 0.3, P.ship.glow, 3, 300, 0.3)
      const dmg = C.dmg * swarmMul() * (1 + P.edge * 0.25)
      forNear(P.x, P.y, P.r + 24, (e) => {
        if (A.hits.has(e) || e.spawnT > 0 || e.invuln) return false
        if ((e.x - P.x) ** 2 + (e.y - P.y) ** 2 > (e.r + P.r + 18) ** 2) return false
        A.hits.add(e)
        damage(e, dmg)
        spray(e.x, e.y, A.dir, 0.8, '#ffffff', 5, 400, 0.3)
        // Reaper rule: every kill during a Reap pays back part of the cooldown.
        if (e.dead) {
          A.kills++
          A.cd = Math.max(0, A.cd - C.refund)
        }
        return false
      })
    } else if (A.reaping) {
      // The Reap ends in a shockwave that shoves the swarm back and clears bullets, plus a short grace window,
      // so a miss doesn't leave you parked inside the swarm.
      A.reaping = false
      P.vx *= 0.3
      P.vy *= 0.3
      blast(P.x, P.y, C.shove, false)
      ring(P.x, P.y, C.shove, P.ship.glow, 0.3, 5)
      grid.force(P.x, P.y, 14, C.shove * 1.4)
      P.inv = Math.max(P.inv, C.grace)
      if (A.kills === 0) {
        A.cd *= 1 - C.missRefund
        sfx.deflect()
      }
    }
  } else if (id === 'detonate') {
    // Bombard: blow every shell in flight where it is.
    if (press && ready) {
      const shells = G.bullets.filter((b) => b.shell && !b.dead)
      if (shells.length) {
        A.cd = C.cd
        for (const b of shells) shellBurst(b)
        compact(G.bullets)
      } else sfx.deny()
    } else if (press) sfx.deny()
  } else if (press && ready) {
    A.cd = C.cd * abilityCdMul()
    if (id === 'phase' || id === 'frenzy' || id === 'barrage') {
      A.t = C.t
      A.add = 0
      sfx.shield()
      ring(P.x, P.y, 120, P.ship.glow, 0.4, 4)
    } else if (id === 'salvo') {
      // Hunter: a ring of homing missiles.
      for (let i = 0; i < C.n; i++) shoot(P.x, P.y, (i / C.n) * TAU, 600, C.dmg, { homing: 1, life: 2.2, color: P.ship.glow, r: 6, splash: 45 })
      sfx.missile()
      ring(P.x, P.y, 90, P.ship.glow, 0.4, 4)
    } else if (id === 'turret') {
      const max = C.max + swarmExtra() + P.turretBonus
      while (G.turrets.length >= max) G.turrets.shift()
      G.turrets.push({ x: P.x, y: P.y, life: C.life + P.turretBonus * 5, cd: 0, a: P.aim })
      sfx.buy()
      ring(P.x, P.y, 90, P.ship.glow, 0.4, 4)
    }
  } else if (press && !ready) sfx.deny()
}
function updateTurrets(dt) {
  const C = TUNING.ability.turret
  for (const t of G.turrets) {
    t.life -= dt
    if (t.life <= 0) {
      t.dead = true
      burst(t.x, t.y, '#9dff5c', 20, 300)
      continue
    }
    t.cd -= dt
    const e = nearestEnemy(t.x, t.y, C.range)
    if (!e) continue
    t.a = Math.atan2(e.y - t.y, e.x - t.x)
    if (t.cd <= 0) {
      t.cd = C.rate / fireRate() / swarmRate()
      shoot(t.x + Math.cos(t.a) * 14, t.y + Math.sin(t.a) * 14, t.a, 950, C.dmg * swarmMul(), { color: '#9dff5c', r: 5, life: 0.6 })
    }
  }
  compact(G.turrets)
}

// ---------- per-frame play update ----------
/**
 * Move and aim from whatever the player is using: sticks and d-pad/WASD, arrows to aim on a
 * keyboard, the mouse to aim (hold the button to fire), or two touch sticks (left half moves,
 * right half aims and fires). The on-screen buttons are never read as sticks.
 */
function readControls() {
  const P = G.P
  let mx = input.x
  let my = input.y
  let ax = input.aimX
  let ay = input.aimY
  if (input.held('aimLeft')) ax -= 1
  if (input.held('aimRight')) ax += 1
  if (input.held('aimUp')) ay -= 1
  if (input.held('aimDown')) ay += 1
  const onButton = (p) => inside(p, PAUSE_BTN) || inside(p, BOMB_BTN) || inside(p, ABILITY_BTN)
  if (input.mode === 'mouse' && input.pointer.active && input.pointer.down && !onButton(input.pointer)) {
    ax = input.pointer.x - (P.x - cam.x)
    ay = input.pointer.y - (P.y - cam.y)
  }
  if (input.mode === 'touch') {
    for (const id of touchSticks.keys()) if (!input.pointers.get(id)?.down) touchSticks.delete(id)
    for (const p of input.pointers.values()) {
      if (!p.down || p.type === 'mouse') continue
      let st = touchSticks.get(p.id)
      if (!st) {
        if (onButton(p)) continue
        touchSticks.set(p.id, (st = { x: p.x, y: p.y, side: p.x < W / 2 ? 'move' : 'aim' }))
      }
      const dx = (p.x - st.x) / TUNING.player.touchStickRange
      const dy = (p.y - st.y) / TUNING.player.touchStickRange
      if (st.side === 'move') {
        mx = dx
        my = dy
      } else {
        ax = dx
        ay = dy
      }
    }
  }
  const ml = Math.hypot(mx, my)
  if (ml > 1) (mx /= ml), (my /= ml)
  const al = Math.hypot(ax, ay)
  const aiming = al > (input.mode === 'mouse' ? 4 : 0.35)
  return { mx, my, aiming, aim: aiming ? Math.atan2(ay, ax) : P.aim }
}

function updatePlayer(dt) {
  const P = G.P
  if (!P.alive) return
  const spd = TUNING.player.speed * P.stats.speed * (syn('velocity') >= 1 ? 1.1 : 1)
  const k = Math.min(1, dt * TUNING.player.accel)
  const dashing = P.abil.t > 0 && P.ship.ability === 'reap'
  const ctl = readControls()
  if (!dashing) {
    P.vx += (ctl.mx * spd - P.vx) * k
    P.vy += (ctl.my * spd - P.vy) * k
  }
  P.x = clamp(P.x + P.vx * dt, (BB.on ? BB.x0 : L) + P.r, (BB.on ? BB.x1 : R) - P.r)
  P.y = clamp(P.y + P.vy * dt, (BB.on ? BB.y0 : T) + P.r, (BB.on ? BB.y1 : B) - P.r)
  P.moving = Math.hypot(P.vx, P.vy) > 60
  let aiming = ctl.aiming
  if (aiming) {
    P.aim = ctl.aim
    if (cfg.assist >= 1) {
      const t = assistTarget(P.x, P.y, P.aim)
      if (t) P.aim = Math.atan2(t.y - P.y, t.x - P.x)
    }
  } else if (cfg.assist === 2 || P.ship.autoFire) {
    // Auto-fire: aim at the nearest enemy while the right stick is idle.
    const t = nearestEnemy(P.x, P.y, TUNING.assist.autoRange)
    if (t) {
      P.aim = Math.atan2(t.y - P.y, t.x - P.x)
      aiming = true
    }
  }
  const face = aiming ? P.aim : P.moving ? Math.atan2(P.vy, P.vx) : P.angle
  P.angle += angDiff(P.angle, face) * Math.min(1, dt * 20)
  if (P.inv > 0) P.inv -= dt
  if (P.moving && fx.parts.length < MAXP) {
    const ba = Math.atan2(P.vy, P.vx) + Math.PI
    spray(P.x + Math.cos(ba) * 10, P.y + Math.sin(ba) * 10, ba, 0.35, Math.random() < 0.5 ? '#ffb347' : P.ship.glow, 1, 240, 0.35)
  }

  // Weapons.
  for (const w of P.weapons) w.cd = Math.max(w.cd - dt, -0.05)
  G.beam = null
  let laser = false
  if (aiming && P.weapons.length) {
    const list = P.weapons
    const mx = P.x + Math.cos(P.aim) * 16
    const my = P.y + Math.sin(P.aim) * 16
    for (const w of list) {
      if (w.id === 'laser') {
        fireLaser(w, P.aim, mx, my, dt)
        laser = true
        continue
      }
      G.gunShot = true
      for (let guard = 0; w.cd <= 0 && guard < 3; guard++) w.cd += WFIRE[w.id](w, P.aim, mx, my) / fireRate()
      G.gunShot = false
    }
  } else for (const w of P.weapons) w.cd = Math.max(w.cd, 0)
  if (laser !== G.laserOn) {
    G.laserOn = laser
    sfx.laser(laser)
  }
  // Bomb on the triggers. Space (keyboard 'a') bombs too, but gamepad A doesn't, so a thumb slipping off the aim stick can't waste one.
  if (input.pressed('rt') || (input.pressed('a') && !input.usingGamepad) || pressedIn(BOMB_BTN)) bomb()
  updateAbility(dt, aiming)

  // Passives.
  for (const p of P.passives) {
    const l = p.lvl - 1
    if (p.id === 'orbit') {
      const n = [2, 3, 4, 5, 6][l] + swarmExtra()
      const rad = [70, 74, 78, 82, 88][l] + (P.ship.id === 'reaper' ? 16 : 0) + P.edge * 8
      const dm = [2, 2.4, 2.8, 3.2, 3.8][l] * swarmMul() * (1 + P.edge * 0.25)
      P.bladeAng += dt * 4
      p.pos = []
      for (let i = 0; i < n; i++) {
        const a = P.bladeAng + (i / n) * TAU
        const bx = P.x + Math.cos(a) * rad
        const by = P.y + Math.sin(a) * rad
        p.pos.push({ x: bx, y: by, a })
        forNear(bx, by, 14, (e) => {
          if (e.spawnT > 0 || e.bladeCd > 0) return false
          if ((e.x - bx) ** 2 + (e.y - by) ** 2 > (e.r + 14) ** 2) return false
          e.bladeCd = 0.18 / swarmRate() / fireRate()
          damage(e, dm)
          spray(bx, by, a + Math.PI / 2, 0.6, '#c38bff', 3, 250, 0.25)
          return false
        })
        for (const b of G.ebullets) if ((b.x - bx) ** 2 + (b.y - by) ** 2 < 20 * 20) b.dead = true
      }
    } else if (p.id === 'drones') {
      const n = [1, 2, 2, 3, 3][l] + P.extraDrones + swarmExtra()
      const frenzy = P.ship.ability === 'frenzy' && P.abil.t > 0
      const FZ = TUNING.ability.frenzy
      const dm = [1.4, 1.4, 1.8, 1.8, 2.2][l] * swarmMul() * (frenzy ? FZ.dmg : 1)
      const cd = [0.3, 0.3, 0.3, 0.28, 0.22][l] / swarmRate() / (frenzy ? FZ.rate : 1)
      while (P.drones.length < n) P.drones.push({ x: P.x, y: P.y, cd: rand(0.3), a: 0 })
      // Carrier: the right stick sends the swarm to a point ahead of the ship.
      const command = P.ship.id === 'carrier' && aiming
      const cpx = clamp(P.x + Math.cos(P.aim) * 240, L + 20, R - 20)
      const cpy = clamp(P.y + Math.sin(P.aim) * 240, T + 20, B - 20)
      P.command = command ? { x: cpx, y: cpy } : null
      P.drones.forEach((dr, i) => {
        let tx
        let ty
        if (command) {
          const a = (i / n) * TAU + G.time * 2
          tx = cpx + Math.cos(a) * 38
          ty = cpy + Math.sin(a) * 38
        } else {
          const off = P.angle + Math.PI + (i - (n - 1) / 2) * (n > 3 ? 0.7 : 1.1)
          tx = P.x + Math.cos(off) * 46
          ty = P.y + Math.sin(off) * 46
        }
        dr.x += (tx - dr.x) * Math.min(1, dt * 8)
        dr.y += (ty - dr.y) * Math.min(1, dt * 8)
        dr.cd -= dt
        const target = (command && nearestEnemy(cpx, cpy, 320)) || nearestEnemy(dr.x, dr.y, 520)
        if (target) {
          dr.a = Math.atan2(target.y - dr.y, target.x - dr.x)
          if (dr.cd <= 0) {
            dr.cd = cd / fireRate()
            shoot(dr.x, dr.y, dr.a, 900, dm, { color: '#66ffd1', r: 4, life: 0.7 })
          }
        } else dr.a += dt
      })
    }
  }

  // Afterimage trail.
  if (P.mods.has('afterimage') || syn('velocity') >= 3) {
    P.trailT -= dt
    if (P.trailT <= 0 && P.moving) {
      P.trailT = 0.04
      P.trail.push({ x: P.x, y: P.y, life: 0.6 })
    }
    for (const t of P.trail) {
      t.life -= dt
      if (t.life <= 0) t.dead = true
      else
        forNear(t.x, t.y, 14, (e) => {
          if ((e.x - t.x) ** 2 + (e.y - t.y) ** 2 < (e.r + 12) ** 2) damage(e, 9 * dt, false)
          return false
        })
    }
    compact(P.trail)
  }
  // Shield regeneration: Aegis Field and Fortress synergy (the fastest one applies).
  const every = Math.min(
    P.mods.has('aegis') ? TUNING.shieldRegen.aegis : Infinity,
    syn('fortress') >= 3 ? TUNING.shieldRegen.fortress3 : syn('fortress') >= 2 ? TUNING.shieldRegen.fortress2 : Infinity
  )
  if (every < Infinity && P.shield < 3) {
    P.shieldT += dt
    if (P.shieldT >= every) {
      P.shieldT = 0
      P.shield++
      sfx.shield()
      popup(P.x, P.y - 30, '+SHIELD', '#5ee0ff')
    }
  }
  updateTurrets(dt)
  if (P.mods.has('recharge') && P.bombs < P.bombMax) {
    P.bombCharge += dt
    if (P.bombCharge >= 40) {
      P.bombCharge = 0
      P.bombs++
      popup(P.x, P.y - 30, '+1 BOMB', '#ffffff')
    }
  }
}

function updateBullets(dt) {
  for (const b of G.bullets) {
    if (b.dead) continue
    b.life -= dt
    if (b.homing) {
      if (!b.target || b.target.dead) {
        b.retarget -= dt
        if (b.retarget <= 0) {
          b.target = nearestEnemy(b.x, b.y, 650)
          b.retarget = 0.15
        }
      }
      if (b.target) {
        const cur = Math.atan2(b.vy, b.vx)
        const na = cur + clamp(angDiff(cur, Math.atan2(b.target.y - b.y, b.target.x - b.x)), -7 * dt, 7 * dt)
        const sp = Math.hypot(b.vx, b.vy)
        b.vx = Math.cos(na) * sp
        b.vy = Math.sin(na) * sp
      }
      if (Math.random() < 0.4) spray(b.x, b.y, Math.atan2(-b.vy, -b.vx), 0.3, '#7dff7a', 1, 80, 0.25)
    }
    b.x += b.vx * dt
    b.y += b.vy * dt
    if (b.life <= 0) {
      if (b.shell) shellBurst(b)
      b.dead = true
      continue
    }
    let wall = false
    if (b.x < L) (b.x = L), (b.vx = -b.vx), (wall = true)
    else if (b.x > R) (b.x = R), (b.vx = -b.vx), (wall = true)
    if (b.y < T) (b.y = T), (b.vy = -b.vy), (wall = true)
    else if (b.y > B) (b.y = B), (b.vy = -b.vy), (wall = true)
    if (wall) {
      if (b.bounces > 0) {
        b.bounces--
        if (b.kin3) b.dmg *= 1.35
        burst(b.x, b.y, b.color, 2, 150, 0.3)
      } else if (b.shell) {
        shellBurst(b)
        continue
      } else {
        b.dead = true
        burst(b.x, b.y, b.color, 3, 180, 0.3)
        grid.force(b.x, b.y, 1.2, 40)
        continue
      }
    }
    if (segOwners.length && segHit(b.x, b.y, b.r)) {
      if (b.shell) {
        shellBurst(b)
        continue
      }
      b.dead = true
      burst(b.x, b.y, '#ffffff', 3, 200, 0.25)
      sfx.deflect()
      continue
    }
    forNear(b.x, b.y, b.r, (e) => {
      if (e.spawnT > 0) return false
      const dx = e.x - b.x
      const dy = e.y - b.y
      const rr = e.r + b.r
      if (dx * dx + dy * dy > rr * rr) return false
      if (b.hits && b.hits.includes(e)) return false
      if (b.shell) {
        // Shells burst on contact, even on shielded or invulnerable targets: the blast reaches what's around them.
        shellBurst(b, e.invuln ? null : e)
        return true
      }
      if (e.invuln) {
        b.dead = true
        burst(b.x, b.y, '#ffffff', 3, 200, 0.25)
        sfx.deflect()
        return true
      }
      if (e.type === 'tank' && e.shield > 0 && Math.abs(angDiff(e.angle, Math.atan2(b.y - e.y, b.x - e.x))) < 0.85) {
        // The frontal shield soaks hits until it shatters.
        e.shield -= b.dmg * dmgMul()
        b.dead = true
        spray(b.x, b.y, Math.atan2(b.y - e.y, b.x - e.x), 0.6, '#7aa7ff', 4, 260, 0.3)
        sfx.deflect()
        if (e.shield <= 0) {
          burst(e.x + Math.cos(e.angle) * (e.r + 8), e.y + Math.sin(e.angle) * (e.r + 8), '#bcd4ff', 24, 360)
          sfx.explode(false)
        }
        return true
      }
      damage(e, b.dmg)
      sfx.hit()
      if (b.splash) {
        ring(b.x, b.y, b.splash, b.color, 0.25, 3)
        forNear(b.x, b.y, b.splash, (o) => {
          if (o !== e && o.spawnT <= 0 && (o.x - b.x) ** 2 + (o.y - b.y) ** 2 < (b.splash + o.r) ** 2) damage(o, b.dmg * 0.5, false)
          return false
        })
      }
      spray(b.x, b.y, Math.atan2(-b.vy, -b.vx), 0.7, b.color, 2, 200, 0.25)
      ;(b.hits ??= []).push(e)
      if (b.split) {
        b.split = false
        const a = Math.atan2(b.vy, b.vx)
        const sp = Math.hypot(b.vx, b.vy) / G.P.stats.bspeed
        for (const s of [-0.5, 0.5]) shoot(b.x, b.y, a + s, sp, b.dmg * 0.6, { life: 0.4, color: b.color, r: 4, noSplit: true, hits: [e] })
      }
      if (b.pierce > 0) {
        b.pierce--
        if (b.kin3) b.dmg *= 1.35
        return false
      }
      b.dead = true
      return true
    })
  }
  compact(G.bullets)

  const P = G.P
  for (const b of G.ebullets) {
    b.x += b.vx * dt
    b.y += b.vy * dt
    b.life -= dt
    if (b.life <= 0 || b.x < L - 10 || b.x > R + 10 || b.y < T - 10 || b.y > B + 10) b.dead = true
    else if (P.alive && !untouchable(P) && (b.x - P.x) ** 2 + (b.y - P.y) ** 2 < (b.r + P.r * 0.55) ** 2) {
      b.dead = true
      hurtPlayer()
    }
  }
  compact(G.ebullets)
}

function updateContacts() {
  const P = G.P
  if (!P.alive) return
  if (P.ship.ability === 'phase' && P.abil.t > 0) {
    // Phasing: burn whatever you fly through.
    forNear(P.x, P.y, P.r + 10, (e) => {
      if (e.spawnT > 0 || e.invuln || (e.phaseCd ?? 0) > G.time) return false
      if ((e.x - P.x) ** 2 + (e.y - P.y) ** 2 > (e.r + P.r + 6) ** 2) return false
      e.phaseCd = G.time + 0.25
      damage(e, TUNING.ability.phase.dmg)
      spray(e.x, e.y, rand(TAU), 1, P.ship.glow, 4, 260, 0.3)
      return false
    })
    return
  }
  if (P.inv > 0 || untouchable(P)) return
  forNear(P.x, P.y, P.r, (e) => {
    if (e.spawnT > 0 || e.type === 'well') return false
    if ((e.x - P.x) ** 2 + (e.y - P.y) ** 2 < (e.r * 0.85 + P.r * 0.7) ** 2) {
      hurtPlayer()
      return true
    }
    return false
  })
  if (P.inv <= 0 && segOwners.length && segHit(P.x, P.y, P.r * 0.6)) hurtPlayer()
  for (const w of wells) if (P.inv <= 0 && Math.hypot(w.x - P.x, w.y - P.y) < w.r * 0.8 + P.r * 0.6) hurtPlayer()
}

function updateGeoms(dt) {
  const P = G.P
  for (const g of G.geoms) {
    g.life -= dt
    g.a += dt * 3
    if (g.life <= 0) {
      g.dead = true
      continue
    }
    const f = 1 - Math.min(1, dt * 2.5)
    g.vx *= f
    g.vy *= f
    if (P.alive) {
      const dx = P.x - g.x
      const dy = P.y - g.y
      const d = Math.hypot(dx, dy) || 1
      const mag = P.stats.magnet + (P.mods.has('greed') ? 60 : 0) + (syn('harvest') >= 2 ? 100 : 0)
      if (G.vacuum || d < mag) {
        const s = G.vacuum ? 1400 : 900 * (1 - d / mag) + 250
        g.vx += (dx / d) * s * dt * 6
        g.vy += (dy / d) * s * dt * 6
        const v = Math.hypot(g.vx, g.vy)
        const cap = G.vacuum ? 1400 : 700
        if (v > cap) {
          g.vx *= cap / v
          g.vy *= cap / v
        }
      }
      if (d < P.r + 14) {
        g.dead = true
        gainMult((syn('harvest') >= 1 ? 3 : 1) * (P.mods.has('greed') ? 2 : 1))
        if (P.ship.ability === 'phase') P.abil.cd = Math.max(0, P.abil.cd - TUNING.ability.phase.geomCut)
        G.bank += P.mods.has('greed') ? 2 : 1
        if (G.endless) G.xp += P.mods.has('greed') ? 2 : 1
        G.score += 10 * G.mult
        P.geomCount++
        sfx.pickup()
        if (P.mods.has('geomshield') && P.geomCount % TUNING.geomShieldEvery === 0 && P.shield === 0) {
          P.shield++
          sfx.shield()
          popup(P.x, P.y - 30, '+SHIELD', '#5ee0ff')
        }
        continue
      }
    }
    g.x = clamp(g.x + g.vx * dt, L + 6, R - 6)
    g.y = clamp(g.y + g.vy * dt, T + 6, B - 6)
  }
  compact(G.geoms)
}

function updateHazards(dt) {
  updateMines(dt)
  for (const h of G.holes) {
    h.life -= dt
    if (h.life <= 0) {
      h.dead = true
      burst(h.x, h.y, '#c38bff', 40, 400)
      continue
    }
    grid.force(h.x, h.y, -1.2, 220)
    for (const e of G.enemies) {
      if (e.dead || e.spawnT > 0 || e.boss || e.bossPart || e.elite) continue
      const dx = h.x - e.x
      const dy = h.y - e.y
      const d = Math.hypot(dx, dy) || 1
      if (d > 320) continue
      e.x += (dx / d) * 340 * (1 - d / 320) * dt
      e.y += (dy / d) * 340 * (1 - d / 320) * dt
      if (d < 28) kill(e, { bomb: true })
    }
  }
  compact(G.holes)
  for (const bl of G.blasts) {
    bl.t -= dt
    if (bl.t > 0) continue
    bl.dead = true
    if (bl.chain !== undefined) {
      boom(bl.x, bl.y, bl.r, bl.dmg, bl.chain, bl.color)
      burst(bl.x, bl.y, bl.color, 10, 320, 0.45)
      grid.force(bl.x, bl.y, 10, bl.r * 1.3)
      sfx.explode(false)
      continue
    }
    ring(bl.x, bl.y, bl.r, '#ffb347', 0.3, 3)
    forNear(bl.x, bl.y, bl.r, (e) => {
      if ((e.x - bl.x) ** 2 + (e.y - bl.y) ** 2 < (bl.r + e.r) ** 2) damage(e, syn('volatile') >= 3 ? 4 : 2, false)
      return false
    })
  }
  compact(G.blasts)
}

function updatePlay(rawDt) {
  if (G.slowT > 0) G.slowT -= rawDt
  const dt = rawDt * (G.slowT > 0 ? 0.35 : 1)
  G.time += dt
  if (G.banner) {
    G.banner.t -= rawDt
    if (G.banner.t <= 0) G.banner = null
  }
  if (G.synNote && (G.synNote.t -= rawDt) <= 0) G.synNote = null
  if (G.shake > 0) G.shake = Math.max(0, G.shake - rawDt * 40)

  updatePlayer(dt)
  updateCamera(rawDt)
  updateEnemies(dt)
  updateBullets(dt)
  updateContacts()
  updateGeoms(dt)
  updateHazards(dt)
  compact(G.enemies)

  if (G.P.alive) decayMult(dt)

  // Death.
  if (!G.P.alive) {
    G.deadT -= rawDt
    if (G.deadT <= 0) finishRun(false)
    return
  }

  if (G.endless) return updateEndless(dt)

  // Wave flow.
  if (G.waveState === 'fight') {
    G.groupT -= dt
    const alive = aliveCount()
    const isBoss = G.wave === 10
    G.sinceSpawn += dt
    G.straggle = !G.queue.length && alive <= 4
    // Keep the arena busy: the next group comes on a timer, or right away if the swarm thins out.
    // Swarm density target: starts busy and climbs every wave.
    const target = Math.min(TUNING.wave.densityMax, (TUNING.wave.density + gwave() * TUNING.wave.densityPerWave) * G.diff.density)
    if (G.queue.length && (G.groupT <= 0 || (!isBoss && alive < target && G.sinceSpawn > 0.35))) {
      spawnGroup(G.queue.shift())
      G.sinceSpawn = 0
      G.groupT = Math.max(0.7, 1.6 - gwave() * 0.03)
    }
    if (!G.queue.length && aliveCount() === 0) {
      G.waveState = 'clear'
      G.clearT = 1.8
      G.vacuum = true
      sfx.waveClear()
      if (G.wave !== 10) G.banner = { text: 'WAVE CLEAR', sub: `x${G.mult} multiplier`, t: 1.6, color: '#ffffff' }
      else
        G.banner = {
          text: 'BOSS DESTROYED',
          sub: G.sector === 3 ? 'THE SWARM IS BROKEN' : `SECTOR ${G.sector} CLEARED`,
          t: 2.4,
          color: '#ffe866'
        }
      if (G.wave === 10) G.clearT = 2.6
    }
  } else if (G.waveState === 'clear') {
    G.clearT -= rawDt
    if (G.clearT <= 0) {
      if (G.wave === 10 && G.sector === 3) finishRun(true)
      else openDraft()
    }
  }
}

// ---------- draft ----------
function cardKey(c) {
  return (c.kind === 'weapon' || c.kind === 'wlevel' ? 'w:' : c.kind === 'passive' || c.kind === 'plevel' ? 'p:' : c.kind + ':') + c.id
}
/** Whether this ship can use a card that needs bullets, a swarm (drones, blades or turrets) or bombs. */
function meets(P, need) {
  if (need === 'bullets') return P.weapons.some((w) => w.id !== 'laser') || P.passives.some((p) => p.id === 'drones') || P.ship.ability === 'turret'
  if (need === 'swarm') return P.passives.length > 0 || P.ship.ability === 'turret'
  if (need === 'bombs') return !P.ship.noBombs
  return true
}
function buildPool() {
  const P = G.P
  const pool = []
  // Each ship keeps its own weapon for the whole run; drafts only level it up.
  for (const w of P.weapons) if (w.lvl < MAX_LVL) pool.push({ kind: 'wlevel', id: w.id, rarity: 1, w: 1.5 })
  for (const id of Object.keys(PASSIVES)) {
    const own = P.passives.find((p) => p.id === id)
    if (own && own.lvl < MAX_LVL) pool.push({ kind: 'plevel', id, rarity: 1, w: 1.3 })
    else if (!own && P.passives.length < 2) pool.push({ kind: 'passive', id, rarity: 1, w: 0.8 })
  }
  for (const s of STATS) {
    if (s.only && s.only !== P.ship.id) continue
    // Ship cards stand in for weapon cards, so they come up about as often.
    if (meets(P, s.needs) && (!s.ok || s.ok(P))) pool.push({ kind: 'stat', id: s.id, rarity: s.rarity, w: s.only ? 1.8 : 1 })
  }
  for (const m of MODS) if (!P.mods.has(m.id) && unlocked(m.unlock) && meets(P, m.needs)) pool.push({ kind: 'mod', id: m.id, rarity: m.rarity, w: 0.75 })
  return pool.filter((c) => !G.banished.has(cardKey(c)))
}
function drawCards(n, exclude = []) {
  const rw = G.rareNext ? [0, 1, 0.5] : [1, 0.55 + G.sector * 0.1, 0.1 + G.sector * 0.07]
  let pool = buildPool().filter((c) => !exclude.some((x) => cardKey(x) === cardKey(c)))
  const out = []
  while (out.length < n && pool.length) {
    const ww = pool.some((p) => rw[p.rarity] > 0) ? rw : [1, 1, 1]
    // Cards from families you already collect come up more often, so builds can come together.
    const c = weighted(pool, (c) => c.w * ww[c.rarity] * (1 + 0.3 * Math.min(5, G.famCount[cardFam(c)] || 0)))
    out.push(c)
    pool = pool.filter((p) => cardKey(p) !== cardKey(c))
  }
  return out
}
function openDraft(supply = false) {
  if (supply) G.rareNext = true
  const cards = drawCards(3)
  G.rareNext = false
  G.draft = { cards, sel: 1, t: 0, supply }
  screen = 'draft'
  menuLock = 0.45
  sfx.levelUp()
  sfx.laser(false)
  G.laserOn = false
}
function cardInfo(c) {
  const P = G.P
  switch (c.kind) {
    case 'weapon':
      return { tag: `NEW WEAPON · LV ${newWeaponLevel()}`, name: WEAPONS[c.id].name, desc: WEAPONS[c.id].desc, color: WEAPONS[c.id].color, icon: c.id }
    case 'wlevel': {
      const lvl = P.weapons.find((w) => w.id === c.id).lvl
      return { tag: `WEAPON LV ${lvl} → ${lvl + 1}`, name: WEAPONS[c.id].name, desc: WEAPONS[c.id].lv[lvl] + '.', color: WEAPONS[c.id].color, icon: c.id }
    }
    case 'passive':
      return { tag: 'NEW PASSIVE', name: PASSIVES[c.id].name, desc: PASSIVES[c.id].desc, color: PASSIVES[c.id].color, icon: c.id }
    case 'plevel': {
      const lvl = P.passives.find((p) => p.id === c.id).lvl
      return { tag: `PASSIVE LV ${lvl} → ${lvl + 1}`, name: PASSIVES[c.id].name, desc: PASSIVES[c.id].lv[lvl] + '.', color: PASSIVES[c.id].color, icon: c.id }
    }
    case 'stat': {
      const s = STATS.find((s) => s.id === c.id)
      return { tag: 'UPGRADE', name: s.name, desc: s.desc, color: '#8fb3ff', icon: 'stat' }
    }
    default: {
      const m = MODS.find((m) => m.id === c.id)
      return { tag: 'MOD', name: m.name, desc: m.desc, color: RARITY[m.rarity].color, icon: 'mod' }
    }
  }
}
// New weapons start one level below your best, so picking one up mid-run is never a downgrade.
function newWeaponLevel() {
  return G.P.weapons.length ? Math.max(1, Math.max(...G.P.weapons.map((w) => w.lvl)) - 1) : 1
}
function applyCard(c) {
  const P = G.P
  if (c.kind === 'weapon') {
    P.weapons.push({ id: c.id, lvl: newWeaponLevel(), cd: 0 })
    P.cur = P.weapons.length - 1
  } else if (c.kind === 'wlevel') P.weapons.find((w) => w.id === c.id).lvl++
  else if (c.kind === 'passive') P.passives.push({ id: c.id, lvl: 1, cd: 0 })
  else if (c.kind === 'plevel') P.passives.find((p) => p.id === c.id).lvl++
  else if (c.kind === 'stat') {
    statDef(c.id).apply(P)
    P.statPicks.push(c.id)
    if (c.id === 'spares') {
      G.rerolls += 2
      G.banishes += 1
    }
  } else {
    P.mods.add(c.id)
    if (c.id === 'glass') P.maxHp = P.hp = 1
  }
  recomputeSyn()
}
const draftCardRect = (i, n, sel = false) => ({ x: W / 2 - (n * 336 + (n - 1) * 36) / 2 + i * 372, y: 200 + (sel ? -14 : 0), w: 336, h: 420 })
const DRAFT_BTN = { pick: { x: W / 2 - 474, y: 684, w: 300, h: 52 }, reroll: { x: W / 2 - 150, y: 684, w: 300, h: 52 }, banish: { x: W / 2 + 174, y: 684, w: 300, h: 52 } }
function updateDraft(dt) {
  const d = G.draft
  d.t += dt
  if (input.pressed('menu')) return openPause()
  const nx = navX()
  if (nx && d.cards.length) {
    d.sel = clamp(d.sel + nx, 0, d.cards.length - 1)
    sfx.move()
  }
  // Mouse hover or a tap selects a card; a click, or a second tap on the selected card, picks it.
  let pickPointer = false
  if (input.pointer.active && d.cards.length) {
    const over = d.cards.findIndex((_, i) => inside(input.pointer, draftCardRect(i, d.cards.length, i === d.sel)))
    if (over >= 0 && input.mode === 'mouse' && over !== d.sel) {
      d.sel = over
      sfx.move()
    }
    if (over >= 0 && input.pointer.released) {
      if (over === d.sel) pickPointer = true
      else {
        d.sel = over
        sfx.move()
      }
    }
  }
  if (menuLock > 0) return
  if ((input.pressed('a') || pickPointer || tapped(DRAFT_BTN.pick)) && d.cards.length) {
    applyCard(d.cards[d.sel])
    sfx.select()
    afterDraft()
  } else if (input.pressed('y') || tapped(DRAFT_BTN.reroll)) {
    if (G.rerolls > 0) {
      G.rerolls--
      d.cards = drawCards(3)
      d.sel = clamp(d.sel, 0, Math.max(0, d.cards.length - 1))
      sfx.buy()
    } else sfx.deny()
  } else if (input.pressed('x') || tapped(DRAFT_BTN.banish)) {
    if (G.banishes > 0 && d.cards.length) {
      G.banishes--
      const c = d.cards[d.sel]
      G.banished.add(cardKey(c))
      const repl = drawCards(1, d.cards)
      if (repl.length) d.cards[d.sel] = repl[0]
      else d.cards.splice(d.sel, 1)
      d.sel = clamp(d.sel, 0, Math.max(0, d.cards.length - 1))
      sfx.explode(false)
    } else sfx.deny()
  } else if (!d.cards.length && (input.pressed('b') || tapped(DRAFT_BTN.pick))) afterDraft()
}
function afterDraft() {
  const wasSupply = G.draft?.supply
  G.draft = null
  // Supply Drop: a bonus rare-or-better draft after waves 5 and 10 (Endless: every 5th upgrade).
  const due = G.endless ? G.drafted % TUNING.endless.supplyEvery === 0 : G.wave === 5 || G.wave === 10
  if (due && !wasSupply) return openDraft(true)
  if (G.endless) resumeEndless()
  else nextWave()
}
function nextWave() {
  screen = 'playing'
  if (G.wave === 10) {
    G.sector++
    if (G.sector === 2) setFlag('sector2')
    grid.force(W / 2, H / 2, 40, 900)
    startWave(1)
  } else startWave(G.wave + 1)
}


// ---------- run end ----------
function recordRun() {
  G.prevBest = G.endless ? save.bestEndless : save.best
  save.totalKills += G.kills
  G.kills = 0
  save.runs++
  if (G.endless) {
    save.bestEndless = Math.max(save.bestEndless, Math.floor(G.score))
    save.bestTime = Math.max(save.bestTime, Math.floor(G.time))
  } else {
    save.best = Math.max(save.best, Math.floor(G.score))
    if (G.sector * 100 + G.wave > save.bestSector * 100 + save.bestWave) {
      save.bestSector = G.sector
      save.bestWave = G.wave
    }
  }
  if (save.totalKills >= 1500) setFlag('kills1500')
  writeSave()
}
function finishRun(win) {
  G.finalKills = G.kills
  G.win = win
  if (win) save.wins++
  recordRun()
  screen = 'gameover'
  overMenu.select('again')
  menuLock = 1
  music.setIntensity(0)
  sfx.laser(false)
}

// ---------- pause, settings, run start ----------
/** Pause from play or the draft (menu button, pause button, launcher overlay, lost focus). */
function openPause() {
  if (screen !== 'playing' && screen !== 'draft') return
  if (screen === 'playing' && !G?.P.alive) return
  pauseFrom = screen
  screen = 'paused'
  pauseMenu.select('resume')
  sfx.laser(false)
  if (G) G.laserOn = false
  writeSave()
}
function openSettings(from) {
  settingsFrom = from
  screen = 'settings'
  sfx.select()
}
function startRun(shipIdx, endless) {
  save.shipId = SHIPS[shipIdx].id
  writeSave()
  newRun(shipIdx, endless)
  screen = 'playing'
}
// Launcher overlay, window hidden or unfocused, every controller gone: pause (never auto-resume).
input.onPause(() => openPause())

// ---------- menu navigation ----------
// Stepped navigation with key repeat comes from input.js (d-pad, sticks, arrows, WASD).
const navX = () => input.navX
const navY = () => input.navY

// ---------- title attract mode ----------
const deco = []
for (let i = 0; i < 18; i++) {
  const type = pick(['wanderer', 'seeker', 'dodger', 'splitter', 'tank', 'lancer'])
  deco.push({ type, x: rand(L, R), y: rand(T, B), vx: rand(-60, 60), vy: rand(-60, 60), a: rand(TAU), va: rand(-2, 2) })
}
let decoBoom = 1
function updateTitle(dt, decoOnly = false) {
  for (const d of deco) {
    d.x += d.vx * dt
    d.y += d.vy * dt
    d.a += d.va * dt
    if (d.x < L + 20 || d.x > R - 20) d.vx *= -1
    if (d.y < T + 20 || d.y > B - 20) d.vy *= -1
  }
  decoBoom -= dt
  if (decoBoom <= 0) {
    decoBoom = rand(0.6, 1.4)
    const d = pick(deco)
    burst(d.x, d.y, SHAPES[d.type].color, 30, 380)
    grid.force(d.x, d.y, 12, 160)
    d.x = rand(L + 40, R - 40)
    d.y = rand(T + 40, B - 40)
  }
  if (decoOnly) return
  // Ship carousel: left/right, LB/RB, or tapping the arrows beside the ship.
  let nx = navX() || (input.pressed('rb') ? 1 : input.pressed('lb') ? -1 : 0)
  if (!nx && input.pointer.released) nx = inside(input.pointer, TITLE_ARROW.left) ? -1 : inside(input.pointer, TITLE_ARROW.right) ? 1 : 0
  if (nx) {
    titleShip = (titleShip + nx + SHIPS.length) % SHIPS.length
    sfx.move()
  }
  const was = titleMenu.selected
  const choice = titleMenu.update(input, dt)
  if (titleMenu.selected !== was) sfx.move()
  if (menuLock > 0 || !choice || choice === 'back') return
  if (choice === 'howto') {
    screen = 'howto'
    menuLock = 0.15
    return sfx.select()
  }
  if (choice === 'settings') return openSettings('title')
  const ship = SHIPS[titleShip]
  if (!unlocked(ship.unlock)) return sfx.deny()
  save.endless = choice === 'endless'
  sfx.select()
  startRun(titleShip, save.endless)
}

// ---------- settings ----------
const ASSIST_NAMES = ['OFF', 'AIM ASSIST', 'AUTO-FIRE']
const ASSIST_DESC = [
  'You aim and fire with the right stick.',
  'Your aim snaps onto the enemy you are pointing toward.',
  'Your ship aims and fires at the nearest enemy by itself. The right stick still takes over.'
]
// The runtime's settings screen (volumes, reduced shake & flash, text size) plus the game's own rows.
const settingsScreen = createSettingsScreen({
  settings,
  audio,
  y: 120,
  extra: [
    { id: 'diff', label: 'Difficulty', type: 'choice', value: cfg.diff, options: TUNING.difficulty.map((d, i) => ({ value: i, label: d.name })) },
    { id: 'assist', label: 'Aiming', type: 'choice', value: cfg.assist, options: ASSIST_NAMES.map((n, i) => ({ value: i, label: n })) },
    { id: 'rumble', label: 'Rumble', type: 'toggle', value: cfg.rumble, onChange: (v) => v && rumble(0.6, 0.4, 200) }
  ]
})
const SETTINGS_DESC = {
  diff: () => TUNING.difficulty[cfg.diff].desc + (G ? '  Applies from your next run.' : ''),
  assist: () => ASSIST_DESC[cfg.assist],
  rumble: () => 'Controller vibration on hits, bombs and boss kills.',
  reducedShake: () => 'Skips screen shake and the white flashes from bombs and hits.'
}

// ---------- main update ----------
function update(dt) {
  setArrowsAim(screen === 'playing')
  // The cursor is a crosshair during play with a mouse; every menu shows the real one.
  canvas.style.cursor = screen === 'playing' && input.mode === 'mouse' ? 'none' : 'default'
  if (menuLock > 0) menuLock -= dt
  if (flash > 0) flash -= dt * 2
  switch (screen) {
    case 'title':
      music.setIntensity(0)
      updateTitle(dt)
      break
    case 'playing':
      if (input.pointer.pressed && inside(input.pointer, PAUSE_BTN)) input.requestMenu()
      if (input.pressed('menu') && G.P.alive) {
        openPause()
        break
      }
      updatePlay(dt)
      break
    case 'paused': {
      const choice = pauseMenu.update(input, dt)
      if (choice === 'resume' || choice === 'back') {
        screen = pauseFrom
        sfx.select()
      } else if (choice === 'restart') {
        recordRun()
        sfx.select()
        startRun(G.shipIdx, G.endless)
      } else if (choice === 'settings') openSettings('paused')
      else if (choice === 'title') {
        recordRun()
        sfx.select()
        toTitle()
      }
      break
    }
    case 'draft':
      updateDraft(dt)
      break
    case 'gameover': {
      if (menuLock > 0) break
      const choice = overMenu.update(input, dt)
      if (choice === 'again') {
        // One-press retry with the same ship and mode.
        sfx.select()
        startRun(G.shipIdx, G.endless)
      } else if (choice === 'title' || choice === 'back') {
        toTitle()
        sfx.select()
      }
      break
    }
    case 'settings':
      if (settingsScreen.update(input, dt) === 'back') {
        screen = settingsFrom
        menuLock = 0.2
        sfx.select()
      }
      break
    case 'howto':
      updateTitle(dt, true)
      if (menuLock <= 0 && (input.pressed('a') || input.pressed('b') || input.pressed('menu') || input.pointer.released)) {
        screen = 'title'
        menuLock = 0.15
        sfx.select()
      }
      break
  }
  grid.update(dt)
  updateFx(screen === 'playing' && G?.slowT > 0 ? dt * 0.35 : dt)
  rememberPointers()
}

// ---------- drawing ----------
function text(str, x, y, size, color = '#fff', align = 'center', weight = 700, font = FONT) {
  ctx.font = `${weight} ${size}px ${font}`
  ctx.textAlign = align
  ctx.fillStyle = color
  ctx.fillText(str, x, y)
}
function glowText(str, x, y, size, color, font = LOGO, weight = 400) {
  ctx.font = `${weight} ${size}px ${font}`
  ctx.textAlign = 'center'
  ctx.shadowColor = color
  ctx.shadowBlur = 24
  ctx.fillStyle = color
  ctx.fillText(str, x, y)
  ctx.shadowBlur = 0
  ctx.fillStyle = '#ffffff'
  ctx.globalAlpha = 0.85
  ctx.fillText(str, x, y)
  ctx.globalAlpha = 1
}
function wrap(str, maxW, size, weight = 600) {
  ctx.font = `${weight} ${size}px ${FONT}`
  const words = str.split(' ')
  const lines = []
  let line = ''
  for (const w of words) {
    const t = line ? line + ' ' + w : w
    if (ctx.measureText(t).width > maxW && line) {
      lines.push(line)
      line = w
    } else line = t
  }
  if (line) lines.push(line)
  return lines
}
/** A button prompt: a colored badge (round on a controller, a key cap on a keyboard) and a label. */
/** Crosshair where the mouse aims (the cursor is hidden during play). */
function drawCrosshair() {
  const p = input.pointer
  ctx.strokeStyle = 'rgba(255,255,255,0.8)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(p.x, p.y, 10, 0, TAU)
  ctx.moveTo(p.x - 16, p.y)
  ctx.lineTo(p.x - 5, p.y)
  ctx.moveTo(p.x + 5, p.y)
  ctx.lineTo(p.x + 16, p.y)
  ctx.moveTo(p.x, p.y - 16)
  ctx.lineTo(p.x, p.y - 5)
  ctx.moveTo(p.x, p.y + 5)
  ctx.lineTo(p.x, p.y + 16)
  ctx.stroke()
}

function panel(x, y, w, h, border, fill = 'rgba(6,8,20,0.88)', lw = 2) {
  ctx.fillStyle = fill
  ctx.fillRect(x, y, w, h)
  ctx.strokeStyle = border
  ctx.lineWidth = lw
  ctx.shadowColor = border
  ctx.shadowBlur = 12
  ctx.strokeRect(x, y, w, h)
  ctx.shadowBlur = 0
}

function drawBackground() {
  const sc = sector()
  screenT()
  ctx.globalAlpha = 1
  ctx.fillStyle = sc.bg
  ctx.fillRect(0, 0, W, H)
  worldT()
  ctx.globalCompositeOperation = 'lighter'
  grid.draw(ctx, sc.grid, sc.accent)
  ctx.globalCompositeOperation = 'source-over'
  // Arena border.
  ctx.strokeStyle = sc.accent
  ctx.globalAlpha = 0.25
  ctx.lineWidth = 8
  ctx.strokeRect(L, T, R - L, B - T)
  ctx.globalAlpha = 1
  ctx.lineWidth = 2
  ctx.strokeRect(L, T, R - L, B - T)
  if (BB.on && G) {
    // Boss arena walls.
    ctx.strokeStyle = '#ff4060'
    ctx.globalAlpha = 0.5 + Math.sin(clock * 4) * 0.2
    ctx.lineWidth = 6
    ctx.strokeRect(BB.x0, BB.y0, BB.x1 - BB.x0, BB.y1 - BB.y0)
    ctx.globalAlpha = 1
    ctx.lineWidth = 2
  }
}

function drawParticles() {
  worldT()
  ctx.globalCompositeOperation = 'lighter'
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  for (const p of fx.parts) {
    ctx.globalAlpha = Math.min(1, (p.life / p.max) * 1.5)
    ctx.strokeStyle = p.color
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
    ctx.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035)
    ctx.stroke()
  }
  for (const r of fx.rings) {
    ctx.globalAlpha = Math.max(0, r.life / r.maxLife)
    ctx.strokeStyle = r.color
    ctx.lineWidth = r.w
    ctx.beginPath()
    ctx.arc(r.x, r.y, r.r, 0, TAU)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  for (const t of fx.texts) {
    ctx.globalAlpha = Math.min(1, t.life * 2)
    text(t.text, t.x, t.y, t.size, t.color)
  }
  ctx.globalAlpha = 1
}

function drawWell(e) {
  worldT()
  if (!e.active) {
    // Dormant: a faint, slowly turning ring. Shoot it to wake it up.
    ctx.strokeStyle = e.hitFlash > 0 ? '#ffffff' : '#ff3030'
    ctx.globalAlpha = 0.85
    ctx.lineWidth = 3
    ctx.setLineDash([10, 8])
    ctx.lineDashOffset = -e.t * 10
    ctx.beginPath()
    ctx.arc(e.x, e.y, e.r, 0, TAU)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.globalAlpha = 0.25
    ctx.beginPath()
    ctx.arc(e.x, e.y, e.r * 0.45, 0, TAU)
    ctx.stroke()
    ctx.globalAlpha = 1
    return
  }
  const crit = e.crit > 0 && Math.floor(e.crit * 12) % 2
  const pulse = 1 + Math.sin(e.t * (e.crit > 0 ? 30 : 6)) * (e.crit > 0 ? 0.15 : 0.08)
  ctx.fillStyle = '#000'
  ctx.beginPath()
  ctx.arc(e.x, e.y, e.r * pulse, 0, TAU)
  ctx.fill()
  ctx.globalCompositeOperation = 'lighter'
  for (let i = 0; i < 3; i++) {
    ctx.strokeStyle = e.hitFlash > 0 || crit ? '#ffffff' : '#ff3030'
    ctx.globalAlpha = 0.9 - i * 0.25
    ctx.lineWidth = 3 - i * 0.6
    ctx.beginPath()
    ctx.arc(e.x, e.y, e.r * pulse + i * 7 + ((e.t * 20) % 7), 0, TAU)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
}

function drawEye(e, alpha) {
  worldT()
  ctx.globalAlpha = alpha
  const red = e.phase === 3 ? '#ff2020' : e.phase === 2 ? '#ff5050' : '#ff8080'
  ctx.fillStyle = '#100204'
  ctx.beginPath()
  ctx.arc(e.x, e.y, e.r, 0, TAU)
  ctx.fill()
  blit(sprite('eyering', e.hitFlash > 0 && Math.floor(e.t * 30) % 3 === 0), e.x, e.y, e.spin * 0.5, e.r / 78, alpha)
  worldT()
  ctx.globalAlpha = alpha
  ctx.globalCompositeOperation = 'lighter'
  ctx.strokeStyle = red
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(e.x, e.y, e.r * 0.45, 0, TAU)
  ctx.stroke()
  const px = e.x + Math.cos(e.look) * e.r * 0.32
  const py = e.y + Math.sin(e.look) * e.r * 0.32
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.arc(px, py, e.r * 0.26, 0, TAU)
  ctx.fill()
  ctx.fillStyle = red
  ctx.beginPath()
  ctx.arc(px, py, e.r * 0.15, 0, TAU)
  ctx.fill()
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1
}

function drawEnemy(e) {
  if (e.spawnT > 0) {
    const k = clamp(e.spawnT / 0.75, 0, 1)
    worldT()
    ctx.globalCompositeOperation = 'lighter'
    ctx.strokeStyle = SHAPES[e.type]?.color ?? '#fff'
    ctx.globalAlpha = 1 - k
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(e.x, e.y, e.r * (1 + k * 2.5), 0, TAU)
    ctx.stroke()
    ctx.globalCompositeOperation = 'source-over'
    if (e.type === 'eye') return drawEye(e, 1 - k)
    if (e.type !== 'well') blit(sprite(e.type), e.x, e.y, e.angle, 1, (1 - k) * 0.7)
    return
  }
  if (e.segs) {
    const key = e.type === 'serpent' ? 'serpseg' : 'seg'
    const base = SHAPES[key].r
    for (let i = e.segs.length - 1; i >= 0; i--) {
      const s = e.segs[i]
      blit(sprite(key), s.x, s.y, e.t * 2 + i * 0.3, s.r / base)
    }
  }
  if (e.type === 'well') return drawWell(e)
  if (e.type === 'eye') return drawEye(e, 1)
  let scale = 1
  if (e.type === 'seeker') scale = 1 + Math.sin(e.t * 8) * 0.12
  if (e.type === 'hexcore') scale = 1 + Math.sin(e.t * 3) * 0.03
  blit(sprite(e.type, e.hitFlash > 0 && (!(e.boss || e.bossPart) || Math.floor(e.t * 30) % 3 === 0)), e.x, e.y, e.angle, scale)
  if (e.type === 'tank' && e.shield > 0) {
    worldT()
    ctx.globalCompositeOperation = 'lighter'
    ctx.strokeStyle = '#bcd4ff'
    ctx.lineWidth = 4
    ctx.globalAlpha = 0.8
    ctx.beginPath()
    ctx.arc(e.x, e.y, e.r + 8, e.angle - 0.85, e.angle + 0.85)
    ctx.stroke()
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
  }
  if (e.type === 'lancer' && e.fireCd < 0.4) {
    worldT()
    ctx.strokeStyle = '#ff4040'
    ctx.globalAlpha = 0.5
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(e.x, e.y)
    ctx.lineTo(e.x + Math.cos(e.angle) * 120, e.y + Math.sin(e.angle) * 120)
    ctx.stroke()
    ctx.globalAlpha = 1
  }
  if (e.invuln) {
    worldT()
    ctx.globalCompositeOperation = 'lighter'
    ctx.strokeStyle = '#ffffff'
    ctx.globalAlpha = 0.5 + Math.sin(e.t * 8) * 0.2
    ctx.lineWidth = 3
    ctx.setLineDash([14, 10])
    ctx.lineDashOffset = -e.t * 40
    ctx.beginPath()
    ctx.arc(e.x, e.y, e.r + 14, 0, TAU)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
  }
}

function drawWorld() {
  const P = G.P
  // Singularities.
  worldT()
  for (const h of G.holes) {
    const r = 26 + Math.sin(G.time * 10) * 3
    ctx.fillStyle = '#000'
    ctx.beginPath()
    ctx.arc(h.x, h.y, r, 0, TAU)
    ctx.fill()
    ctx.strokeStyle = '#c38bff'
    ctx.lineWidth = 3
    ctx.globalAlpha = Math.min(1, h.life)
    ctx.stroke()
    ctx.globalAlpha = 1
  }
  // Geoms.
  const gs = sprite('geom')
  for (const g of G.geoms) {
    if (g.life < 2 && Math.floor(g.life * 10) % 2) continue
    blit(gs, g.x, g.y, g.a)
  }
  // Afterimage trail.
  if (P.trail.length > 1) {
    worldT()
    ctx.globalCompositeOperation = 'lighter'
    ctx.strokeStyle = P.ship.glow
    ctx.lineWidth = 10
    ctx.globalAlpha = 0.35
    ctx.beginPath()
    P.trail.forEach((t, i) => (i ? ctx.lineTo(t.x, t.y) : ctx.moveTo(t.x, t.y)))
    ctx.stroke()
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
  }
  for (const e of G.enemies) if (!e.dead) drawEnemy(e)
  for (const e of G.enemies) if (!e.dead && e.elite) drawEliteOverlay(e)
  drawMines()

  // Player bullets.
  worldT()
  ctx.globalCompositeOperation = 'lighter'
  ctx.lineCap = 'round'
  for (const b of G.bullets) {
    const sp = Math.hypot(b.vx, b.vy) || 1
    const len = Math.min(22, sp * 0.02) * b.w
    const tx = b.x - (b.vx / sp) * len
    const ty = b.y - (b.vy / sp) * len
    ctx.strokeStyle = b.color
    ctx.globalAlpha = 0.45
    ctx.lineWidth = 7 * b.w
    ctx.beginPath()
    ctx.moveTo(b.x, b.y)
    ctx.lineTo(tx, ty)
    ctx.stroke()
    ctx.globalAlpha = 1
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2.2 * b.w
    ctx.stroke()
  }
  // Laser beam.
  if (G.beam) {
    const bm = G.beam
    const flick = 0.85 + Math.random() * 0.15
    for (const [w, c, a] of [
      [bm.width * 2.2, '#ff4fd8', 0.25],
      [bm.width, '#ff4fd8', 0.7],
      [bm.width * 0.35, '#ffffff', 1]
    ]) {
      ctx.strokeStyle = c
      ctx.globalAlpha = a * flick
      ctx.lineWidth = w * flick
      ctx.beginPath()
      ctx.moveTo(bm.x0, bm.y0)
      ctx.lineTo(bm.x1, bm.y1)
      ctx.stroke()
    }
  }
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  // Enemy bullets.
  const eb = sprite('ebullet')
  for (const b of G.ebullets) blit(eb, b.x, b.y, 0, b.r / 7)

  // Passives.
  for (const p of P.passives) {
    if (p.id === 'orbit' && p.pos && P.alive) for (const b of p.pos) blit(sprite('blade'), b.x, b.y, b.a + Math.PI / 2)
  }
  if (P.alive) for (const d of P.drones) blit(sprite('drone'), d.x, d.y, d.a)
  for (const t of G.turrets) blit(sprite('turret'), t.x, t.y, t.a, 1.3, t.life < 3 ? 0.4 + 0.6 * (Math.floor(t.life * 6) % 2) : 1)
  worldT()
  if (P.command) {
    // Carrier: where the drones are attacking.
    ctx.strokeStyle = '#66ffd1'
    ctx.globalAlpha = 0.35
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(P.command.x, P.command.y, 46, 0, TAU)
    ctx.stroke()
    ctx.globalAlpha = 1
  }
  if (barraging()) {
    // Interceptor Barrage: a pulsing ring around the ship.
    ctx.globalCompositeOperation = 'lighter'
    ctx.strokeStyle = P.ship.glow
    ctx.globalAlpha = 0.5 + Math.sin(G.time * 24) * 0.2
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.arc(P.x, P.y, 30 + Math.sin(G.time * 12) * 3, 0, TAU)
    ctx.stroke()
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
  }

  // Player.
  const phasing = P.ship.ability === 'phase' && P.abil.t > 0
  if (P.alive && !(P.inv > 0 && Math.floor(P.inv * 12) % 2)) {
    blit(sprite('ship-' + P.ship.id), P.x, P.y, P.angle, 1.1, phasing ? 0.35 + Math.sin(G.time * 30) * 0.15 : 1)
    if (phasing) blit(sprite('ship-' + P.ship.id, true), P.x, P.y, P.angle, 1.5, 0.25)
    if (P.shield > 0) {
      worldT()
      ctx.globalCompositeOperation = 'lighter'
      ctx.strokeStyle = '#5ee0ff'
      ctx.globalAlpha = 0.45 + Math.sin(G.time * 6) * 0.15
      ctx.lineWidth = 2 + P.shield
      ctx.beginPath()
      ctx.arc(P.x, P.y, 26, 0, TAU)
      ctx.stroke()
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'
    }
  }
  if (P.alive) {
    // Aim reticle.
    worldT()
    ctx.strokeStyle = P.ship.glow
    ctx.globalAlpha = 0.5
    ctx.lineWidth = 2
    const ax = P.x + Math.cos(P.aim) * 60
    const ay = P.y + Math.sin(P.aim) * 60
    ctx.beginPath()
    ctx.arc(ax, ay, 5, 0, TAU)
    ctx.stroke()
    ctx.globalAlpha = 1
  }
}

function drawHud() {
  const P = G.P
  screenT()
  ctx.textBaseline = 'alphabetic'
  // Score + multiplier.
  text(fmt(G.score), 48, 68, 34, '#ffffff', 'left')
  text(`×${G.mult}`, 48, 100, 26, '#d8ff3a', 'left')
  // Progress to the next multiplier step; turns red just before it decays.
  const grace = syn('harvest') >= 2 ? TUNING.mult.graceHarvest : TUNING.mult.grace
  const warn = G.mult > 1 && G.multT > grace - 1.5
  ctx.fillStyle = 'rgba(255,255,255,0.15)'
  ctx.fillRect(104, 90, 90, 6)
  ctx.fillStyle = warn && Math.floor(clock * 8) % 2 ? '#ff4040' : '#d8ff3a'
  ctx.fillRect(104, 90, G.mult >= multCap() ? 90 : (90 * G.multProg) / TUNING.mult.perStep, 6)
  // Wave.
  const isBoss = G.wave === 10
  if (G.endless) {
    text(`ENDLESS  ·  ${mmss(G.time)}  ·  THREAT ${G.tier + 1}`, W / 2, 62, 24, sector().accent)
    // XP bar: fills from geoms, a full bar opens a draft.
    const bw = 420
    const x = W / 2 - bw / 2
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.fillRect(x, 76, bw, 10)
    ctx.fillStyle = '#d8ff3a'
    ctx.fillRect(x, 76, (bw * Math.min(1, G.xp / G.xpNext)), 10)
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'
    ctx.lineWidth = 1.5
    ctx.strokeRect(x, 76, bw, 10)
    text(`LV ${G.level}`, x - 14, 88, 24, '#d8ff3a', 'right')
    if (G.pending > 0) {
      ctx.globalAlpha = 0.7 + Math.sin(clock * 6) * 0.3
      text(`${input.label('y')}  UPGRADE${G.pending > 1 ? ` ×${G.pending}` : ''}`, x + bw + 14, 88, 24, '#d8ff3a', 'left')
      ctx.globalAlpha = 1
    }
  } else text(isBoss ? `SECTOR ${G.sector}  ·  BOSS` : `SECTOR ${G.sector}  ·  WAVE ${G.wave}/10`, W / 2, 62, 24, sector().accent)
  if (G.boss && !G.boss.dead && G.boss.spawnT <= 0) {
    const b = G.boss
    const bw = 520
    const x = W / 2 - bw / 2
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.fillRect(x, 76, bw, 14)
    ctx.fillStyle = b.invuln ? '#8891a8' : '#ff4040'
    ctx.fillRect(x, 76, (bw * Math.max(0, b.hp)) / b.maxHp, 14)
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 1.5
    ctx.strokeRect(x, 76, bw, 14)
    text(b.invuln ? `${b.name}  ·  DESTROY THE TURRETS` : b.name, W / 2, 118, 24, '#ffffff')
  }
  // Hull, shields, bombs, geoms (top right).
  const rx = W - 48
  for (let i = 0; i < P.maxHp; i++) {
    const x = rx - i * 34 - 12
    blit(sprite('ship-' + P.ship.id), x, 58, -Math.PI / 2, 0.85, i < P.hp ? 1 : 0.18)
  }
  screenT()
  ctx.globalAlpha = 1
  let line2 = ''
  for (let i = 0; i < P.bombs; i++) line2 += '● '
  if (!P.ship.noBombs) text(`BOMB ${line2 || '–'}`.trim(), rx, 104, 24, '#ffffff', 'right')
  if (P.shield > 0) text(`SHIELD ×${P.shield}`, rx, 168, 24, '#5ee0ff', 'right')

  // Weapon slots (bottom left).
  const y = H - 92
  let x = 48
  P.weapons.forEach((w, i) => {
    const def = WEAPONS[w.id]
    const active = true
    ctx.globalAlpha = active ? 1 : 0.5
    ctx.font = `700 24px ${FONT}`
    const label = `${def.name}`
    const tw = ctx.measureText(label).width + 30
    panel(x, y, tw, 52, active ? def.color : '#55607a', 'rgba(4,6,16,0.7)')
    text(label, x + 15, y + 30, 24, active ? def.color : '#aab', 'left')
    for (let l = 0; l < MAX_LVL; l++) {
      ctx.fillStyle = l < w.lvl ? def.color : 'rgba(255,255,255,0.15)'
      ctx.fillRect(x + 15 + l * 14, y + 39, 10, 5)
    }
    x += tw + 12
  })
  ctx.globalAlpha = 1
  if (!P.weapons.length) {
    const label = P.ship.id === 'carrier' ? `DRONES ×${P.drones.length}` : 'BLADES'
    panel(48, y, 220, 52, P.ship.glow, 'rgba(4,6,16,0.7)')
    text(label, 63, y + 34, 24, P.ship.glow, 'left')
  }
  if (!P.ship.noBombs) {
    // Bomb: a button for mouse and touch, a prompt chip for everyone else (Space bombs on a keyboard).
    if (touchy()) button(BOMB_BTN, `BOMB${P.bombs ? '' : ' –'}`, P.bombs ? sector().accent : '#55607a')
    else drawPrompts(ctx, input, [[input.mode === 'keyboard' ? 'a' : 'rt', 'Bomb']], { x: W - 48, y: H - 48, align: 'right', size: 22 * cfg.textScale, color: '#aab3cc', font: `600 ${Math.round(22 * cfg.textScale)}px ${FONT}` })
  }
  drawAbilityHud()
  if (screen === 'playing') {
    // Pause button (mouse and touch), bottom centre.
    panel(PAUSE_BTN.x, PAUSE_BTN.y, PAUSE_BTN.w, PAUSE_BTN.h, input.mode === 'mouse' && inside(input.pointer, PAUSE_BTN) ? '#ffffff' : '#55607a', 'rgba(8,10,22,0.7)', 2)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(PAUSE_BTN.x + 18, PAUSE_BTN.y + 16, 7, 24)
    ctx.fillRect(PAUSE_BTN.x + 31, PAUSE_BTN.y + 16, 7, 24)
    if (input.mode === 'mouse' && input.pointer.active) drawCrosshair()
  }
  // Active synergies (top left, under the multiplier).
  let sy = 132
  for (const f of Object.keys(FAMILIES)) {
    if (!syn(f)) continue
    text(`${FAMILIES[f].name} ${ROMAN[syn(f)]}`, 48, sy, 24, FAMILIES[f].color, 'left', 700)
    sy += 28
  }
  const n = G.synNote
  if (n && screen === 'playing') {
    ctx.globalAlpha = Math.min(1, n.t)
    text(n.text, W / 2, 168, 30, n.color)
    text(n.sub, W / 2, 202, 24, '#ffffff', 'center', 600)
    ctx.globalAlpha = 1
  }
}

/** Ability button, name and cooldown bar (bottom right, above the bomb prompt). */
function drawAbilityHud() {
  const P = G.P
  const A = P.abil
  const C = TUNING.ability[P.ship.ability]
  const x = W - 48 - 220
  const y = P.ship.noBombs ? H - 76 : H - 112
  let fill
  if (A.t > 0) fill = P.ship.ability === 'barrage' ? A.t / (C.t + C.maxAdd) : 1
  else fill = 1 - Math.max(0, A.cd) / (C.cd * abilityCdMul())
  const ready = A.cd <= 0
  ctx.fillStyle = 'rgba(0,0,0,0.6)'
  ctx.fillRect(x, y + 6, 220, 8)
  ctx.fillStyle = ready ? P.ship.glow : '#55607a'
  ctx.fillRect(x, y + 6, 220 * clamp(fill, 0, 1), 8)
  if (touchy()) button(ABILITY_BTN, P.ship.abilityName.toUpperCase(), ready ? P.ship.glow : '#55607a', A.t > 0)
  else text(`${input.label('lt')} ${P.ship.abilityName}`, W - 48, y, 24, ready ? '#ffffff' : '#8891a8', 'right', 700)
}

/** Endless: arrows at the screen edge pointing to enemies that are off screen but close. */
function drawRadar() {
  screenT()
  ctx.fillStyle = '#ff4060'
  let n = 0
  for (const e of G.enemies) {
    if (e.dead || n > 60) continue
    const sx = e.x - cam.x
    const sy = e.y - cam.y
    if (sx > -e.r && sx < W + e.r && sy > -e.r && sy < H + e.r) continue
    const ex = clamp(sx, 14, W - 14)
    const ey = clamp(sy, 14, H - 14)
    const d = Math.hypot(sx - ex, sy - ey)
    // Elites and a wave's last stragglers are always marked, however far away.
    const always = e.elite || G.straggle
    const range = always ? 4000 : TUNING.endless.radarRange
    if (d > range) continue
    n++
    const a = Math.atan2(sy - ey, sx - ex)
    ctx.globalAlpha = always ? 0.9 : 0.8 * (1 - d / range) + 0.1
    ctx.fillStyle = e.elite ? ELITES[e.type.slice(2)].color : '#ff4060'
    const s = e.elite ? 14 : 8
    ctx.beginPath()
    ctx.moveTo(ex + Math.cos(a) * s, ey + Math.sin(a) * s)
    ctx.lineTo(ex + Math.cos(a + 2.4) * s, ey + Math.sin(a + 2.4) * s)
    ctx.lineTo(ex + Math.cos(a - 2.4) * s, ey + Math.sin(a - 2.4) * s)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

function drawBanner() {
  const b = G?.banner
  if (!b) return
  screenT()
  const a = Math.min(1, b.t * 2)
  ctx.globalAlpha = a
  glowText(b.text, W / 2, 330, 76, b.color)
  if (b.sub) text(b.sub, W / 2, 380, 28, '#ffffff', 'center', 600)
  ctx.globalAlpha = 1
}

function dim(a = 0.65) {
  screenT()
  ctx.fillStyle = `rgba(0,0,6,${a})`
  ctx.fillRect(0, 0, W, H)
}

function drawIcon(icon, x, y, color, t) {
  const map = { blaster: 'player', laser: 'seeker', homing: 'drone', mortar: 'splitter', orbit: 'blade', drones: 'drone', stat: 'geom', mod: 'wanderer' }
  const key = map[icon] ?? 'geom'
  blit(sprite(key), x, y, key === 'player' || key === 'drone' ? -Math.PI / 2 : t, icon === 'stat' ? 5 : 2.4)
  screenT()
}

function drawDraft() {
  const d = G.draft
  dim(0.7)
  glowText(d.supply ? 'SUPPLY DROP' : 'CHOOSE AN UPGRADE', W / 2, 120, 50, d.supply ? '#d8ff3a' : sector().accent)
  const banked = G.pending ? `  ·  ${G.pending} more upgrade${G.pending > 1 ? 's' : ''} banked` : ''
  text(d.supply ? 'Bonus draft: rare or better' + banked : G.endless ? 'Upgrade' + banked : `Wave ${G.wave} cleared`, W / 2, 160, 24, '#c8d0e8', 'center', 600)
  const cw = 336
  const ch = 420
  const n = d.cards.length
  d.cards.forEach((c, i) => {
    const info = cardInfo(c)
    const sel = i === d.sel
    const appear = clamp(d.t * 4 - i * 0.3, 0, 1)
    const r = draftCardRect(i, n, sel)
    const x = r.x
    const y = r.y + (1 - appear) * 60
    ctx.globalAlpha = appear
    const rc = RARITY[c.rarity].color
    panel(x, y, cw, ch, sel ? '#ffffff' : rc, sel ? 'rgba(18,22,48,0.96)' : 'rgba(8,10,26,0.92)', sel ? 4 : 2)
    ctx.fillStyle = rc
    ctx.fillRect(x, y, cw, 8)
    text(info.tag, x + cw / 2, y + 48, 24, info.color)
    drawIcon(info.icon, x + cw / 2, y + 130, info.color, d.t)
    ctx.globalAlpha = appear
    text(info.name, x + cw / 2, y + 222, 32, '#ffffff')
    const lines = wrap(info.desc, cw - 44, 24)
    lines.forEach((l, j) => text(l, x + cw / 2, y + 268 + j * 32, 24, '#c8d0e8', 'center', 600))
    text(RARITY[c.rarity].name, x + cw / 2, y + ch - 24, 24, rc)
    const f = cardFam(c)
    if (f) {
      const have = G.famCount[f] || 0
      const gain = famGain(c)
      const next = FAMILY_TIERS.find((t) => t > have)
      const hit = gain && next && have + gain >= next
      text(`◆ ${FAMILIES[f].name} ${have}${gain ? ' → ' + (have + gain) : ''}${hit ? '  ★' : ''}`, x + cw / 2, y + ch - 62, 24, FAMILIES[f].color, 'center', 700)
    }
  })
  ctx.globalAlpha = 1
  if (!n) text('No upgrades left!', W / 2, 400, 32, '#ffffff')
  // What the selected card does for its synergy family.
  const sc = d.cards[d.sel]
  const f = sc && cardFam(sc)
  if (f) {
    const have = G.famCount[f] || 0
    const gain = famGain(sc)
    const next = FAMILY_TIERS.findIndex((t) => t > have)
    const line =
      next < 0
        ? `${FAMILIES[f].name} is maxed: all bonuses active`
        : have + gain >= FAMILY_TIERS[next]
          ? `★ Unlocks ${FAMILIES[f].name} ${ROMAN[next + 1]}: ${FAMILIES[f].bonus[next]}`
          : `${FAMILIES[f].name} ${have}/${FAMILY_TIERS[next]}  ·  next: ${FAMILIES[f].bonus[next]}`
    text(line, W / 2, 656, 24, FAMILIES[f].color, 'center', 700)
  }
  button(DRAFT_BTN.pick, n ? 'PICK' : 'CONTINUE', sector().accent)
  button(DRAFT_BTN.reroll, `REROLL (${G.rerolls})`, G.rerolls ? '#d8ff3a' : '#55607a')
  button(DRAFT_BTN.banish, `BANISH (${G.banishes})`, G.banishes ? '#ff5ce1' : '#55607a')
  if (!touchy()) drawPrompts(ctx, input, [[n ? 'a' : 'b', n ? 'Pick' : 'Continue'], ['y', 'Reroll'], ['x', 'Banish'], ['menu', 'Pause']], { y: 770, size: 22 * cfg.textScale, font: `600 ${Math.round(22 * cfg.textScale)}px ${FONT}` })
}

function buildSummary() {
  const P = G.P
  const lines = []
  for (const f of Object.keys(FAMILIES)) if (syn(f)) lines.push([`${FAMILIES[f].name} ${ROMAN[syn(f)]}  (${G.famCount[f]})`, FAMILIES[f].color])
  for (const w of P.weapons) lines.push([`${WEAPONS[w.id].name}  LV${w.lvl}`, WEAPONS[w.id].color])
  for (const p of P.passives) lines.push([`${PASSIVES[p.id].name}  LV${p.lvl}`, PASSIVES[p.id].color])
  for (const m of P.mods) {
    const d = MODS.find((x) => x.id === m)
    lines.push([d.name, RARITY[d.rarity].color])
  }
  return lines
}

function drawPause() {
  dim(0.7)
  glowText('PAUSED', W / 2, 190, 72, sector().accent)
  pauseMenu.draw(ctx, menuFont(28))
  // Build summary.
  const bx = W / 2 + 40
  text('YOUR BUILD', bx, 300, 26, '#ffffff', 'left')
  buildSummary()
    .slice(0, 12)
    .forEach(([l, c], i) => text(l, bx, 338 + i * 32, 24, c, 'left', 600))
  drawPrompts(ctx, input, [['a', 'Select'], ['b', 'Resume']], { y: H - 48, size: 22 * cfg.textScale, font: `600 ${Math.round(22 * cfg.textScale)}px ${FONT}` })
}

function drawOver() {
  dim(0.75)
  const win = G.win
  glowText(win ? 'VICTORY' : 'SIGNAL LOST', W / 2, 170, 80, win ? '#ffe866' : '#ff4040')
  const where = G.endless ? `Endless  ·  survived ${mmss(G.time)}  ·  level ${G.level}` : `Sector ${G.sector}  ·  ${G.wave === 10 ? 'Boss' : 'Wave ' + G.wave}`
  text(win ? 'The swarm is broken. For now.' : where, W / 2, 222, 28, '#ffffff', 'center', 600)
  const best = G.endless ? save.bestEndless : save.best
  const newBest = Math.floor(G.score) > (G.prevBest ?? 0) && G.score > 0
  text(fmt(G.score), W / 2, 310, 64, '#ffffff')
  text(newBest ? 'NEW BEST SCORE!' : `${G.endless ? 'Endless best' : 'Best'} ${fmt(best)}`, W / 2, 352, 26, newBest ? '#d8ff3a' : '#aab3cc', 'center', 600)
  text(`${G.finalKills} kills  ·  ×${G.mult} multiplier`, W / 2, 400, 24, '#c8d0e8', 'center', 600)
  const build = buildSummary()
    .map((b) => b[0])
    .join('  ·  ')
  wrap(build, 1000, 24)
    .slice(0, 4)
    .forEach((l, i) => text(l, W / 2, 470 + i * 32, 24, '#8fb3ff', 'center', 600))
  if (menuLock <= 0) {
    overMenu.items[0].label = win ? 'PLAY AGAIN' : 'RETRY'
    overMenu.draw(ctx, menuFont(28))
  }
}

function drawSettings() {
  dim(0.82)
  settingsScreen.draw(ctx, { font: menuFont(24), titleFont: `400 48px ${LOGO}`, color: '#3fd8ff' })
  const desc = SETTINGS_DESC[settingsScreen.menu.selected?.id]?.() ?? ''
  if (desc) wrap(desc, 1000, 24).slice(0, 1).forEach((l) => text(l, W / 2, 772, 24, '#c8d0e8', 'center', 600))
}

function drawTitle(t) {
  // Attract-mode swarm, dimmed so the menu reads clearly.
  for (const d of deco) blit(sprite(d.type), d.x, d.y, d.a, 1, 0.4)
  drawParticles()
  screenT()
  ctx.fillStyle = 'rgba(0,0,8,0.5)'
  ctx.fillRect(0, 0, W, H)
  if (screen !== 'title') return
  glowText('NEON', W / 2, 150, 104, '#3fd8ff')
  glowText('SWARM', W / 2, 256, 104, '#ff5ce1')

  // Menu (left).
  const mx = 140
  const mw = 460
  titleMenu.items.forEach((it, i) => {
    const sel = it === titleMenu.selected
    const r = titleMenu.rect(i)
    panel(r.x, r.y, r.w, r.h, sel ? '#ffffff' : '#55607a', sel ? 'rgba(20,26,40,0.96)' : 'rgba(8,10,22,0.85)', sel ? 4 : 2)
    text(it.label, r.x + 32, r.y + 42, 30, sel ? '#ffffff' : '#aab3cc', 'left')
    if (sel) text('▶', r.x + r.w - 32, r.y + 42, 26, '#d8ff3a', 'right')
  })
  const info = [
    [
      '3 sectors, 30 waves, 3 bosses. Draft an upgrade after every wave.',
      save.best > 0 ? `Best ${fmt(save.best)}  ·  furthest sector ${save.bestSector} wave ${save.bestWave}` : ''
    ],
    [
      'One huge arena. The swarm never stops. Bank upgrades and open them with ' + input.label('y') + '.',
      save.bestEndless > 0 ? `Best ${fmt(save.bestEndless)}  ·  longest ${mmss(save.bestTime)}` : ''
    ],
    ['Controls and the basics.', ''],
    [`Difficulty, aiming help, volume and more.  Difficulty: ${TUNING.difficulty[cfg.diff].name}`, '']
  ][titleSel()]
  let iy = 646
  for (const l of wrap(info[0], mw, 24).slice(0, 2)) {
    text(l, mx, iy, 24, '#c8d0e8', 'left', 600)
    iy += 30
  }
  if (info[1]) text(info[1], mx, iy, 24, '#d8ff3a', 'left', 600)

  // Ship (right).
  const cx = 940
  const ship = SHIPS[titleShip]
  const open = unlocked(ship.unlock)
  panel(cx - 240, 300, 480, 400, open ? ship.glow : '#55607a', 'rgba(8,10,22,0.85)')
  text(`SHIP  ${SHIPS.indexOf(ship) + 1} / ${SHIPS.length}`, cx, 336, 24, '#8891a8')
  blit(sprite('ship-' + ship.id), cx, 396, -Math.PI / 2 + Math.sin(t * 2) * 0.15, 2.4, open ? 1 : 0.25)
  screenT()
  ctx.globalAlpha = 1
  text('◀', cx - 190, 410, 34, '#ffffff')
  text('▶', cx + 190, 410, 34, '#ffffff')
  text(open ? ship.name.toUpperCase() : 'LOCKED', cx, 476, 32, open ? ship.glow : '#8891a8')
  // Role, ability and rule: what makes this ship play differently.
  let ly = 510
  const para = (str, color) => {
    for (const l of wrap(str, 430, 24).slice(0, 2)) {
      text(l, cx, ly, 24, color, 'center', 600)
      ly += 28
    }
    ly += 8
  }
  para(ship.role, '#c8d0e8')
  para(`${input.label('lt')} ${ship.abilityName}: ${ship.abilityDesc}`, ship.glow)
  para(`RULE: ${ship.rule}`, '#d8ff3a')

  if (!open && titleSel() < 2) text('This ship is locked: pick another with ◀ ▶', W / 2, H - 44, 26, '#ff6070', 'center', 600)
  else text(`${input.label('a')} select  ·  ◀ ▶ ship  ·  ${input.label('menu')} pause`, W / 2, H - 44, 26, '#ffffff', 'center', 600)
}

function drawHowTo() {
  dim(0.82)
  glowText('HOW TO PLAY', W / 2, 112, 56, '#3fd8ff')
  const rows = [
    [moveLabel(), 'Move'],
    [aimLabel(), 'Aim and fire'],
    [touchy() ? 'BOMB button' : input.label(input.mode === 'keyboard' ? 'a' : 'rt'), 'Bomb: clears the screen'],
    [touchy() ? 'Ability button' : input.label('lt'), 'Ship ability (each ship has its own)'],
    [input.label('y'), 'Endless: open a banked upgrade'],
    [input.label('menu'), 'Pause']
  ]
  const x = W / 2 - 360
  rows.forEach(([k, v], i) => {
    const y = 150 + i * 58
    panel(x, y, 720, 50, '#55607a', 'rgba(8,10,22,0.9)')
    text(k, x + 24, y + 34, 26, '#d8ff3a', 'left')
    text(v, x + 696, y + 34, 26, '#ffffff', 'right', 600)
  })
  const tips = 'Every 25 geoms raises your multiplier (up to x10), but it slips if you stop collecting. Every card belongs to a synergy family: collect 2, 4 and 6 of one family for big bonuses.'
  wrap(tips, 900, 24).forEach((l, i) => text(l, W / 2, 596 + i * 32, 24, '#c8d0e8', 'center', 600))
  drawPrompts(ctx, input, [['b', 'Back']], { y: H - 48, size: 22 * cfg.textScale, font: `600 ${Math.round(22 * cfg.textScale)}px ${FONT}` })
}

let clock = 0
function draw(dt) {
  clock += dt
  const sh = G && screen === 'playing' ? G.shake : 0
  shx = (sh ? rand(-sh, sh) * 0.5 : 0) - (G ? cam.x : 0)
  shy = (sh ? rand(-sh, sh) * 0.5 : 0) - (G ? cam.y : 0)
  drawBackground()
  if (screen === 'title' || !G) {
    drawTitle(clock)
    if (screen === 'settings') drawSettings()
    if (screen === 'howto') drawHowTo()
  } else {
    drawWorld()
    drawParticles()
    shx = shy = 0
    drawRadar()
    if (screen !== 'settings') drawHud()
    if (screen === 'playing') drawBanner()
    if (screen === 'draft') drawDraft()
    if (screen === 'paused') drawPause()
    if (screen === 'gameover') drawOver()
    if (screen === 'settings') drawSettings()
  }
  if (flash > 0) {
    screenT()
    ctx.fillStyle = `rgba(255,255,255,${Math.min(0.6, flash)})`
    ctx.fillRect(0, 0, W, H)
  }
  ctx.globalAlpha = 1
}

let last = performance.now()
function frame(now) {
  const dt = Math.min(1 / 20, (now - last) / 1000)
  last = now
  input.update(dt)
  const t0 = performance.now()
  update(dt)
  const t1 = performance.now()
  draw(dt)
  if (window.__prof) {
    window.__prof.u += t1 - t0
    window.__prof.d += performance.now() - t1
    window.__prof.n++
  }
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)

window.__game = {
  state,
  TUNING,
  save: saveStore,
  settings,
  get titleMenu() {
    return titleMenu
  }
}
// Test hook for automated play-throughs; only exists with ?debug in the URL.
if (location.search.includes('debug')) {
  window.__ns = {
    get G() {
      return G
    },
    get screen() {
      return screen
    },
    set screen(v) {
      screen = v
    },
    newRun,
    startWave,
    buildPool,
    applyCard,
    spawnElite,
    spawnEnemy,
    damage,
    BB,
    save,
    cam
  }
}
