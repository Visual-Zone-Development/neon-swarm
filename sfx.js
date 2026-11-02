// Tiny WebAudio synth: sound effects and a generative synthwave loop. No audio files.
// Plays through the runtime's audio.js buses (createAudio), so the Settings volumes apply and
// the context is unlocked on the player's first real gesture.

let ac = null
let sfxBus = null
let musBus = null
let noiseBuf = null
const lastPlayed = {}

/** Call once with the object from createAudio({ settings }). */
export function initSfx(audio) {
  ac = audio.ctx
  if (!ac) return
  const chain = (gain, bus) => {
    const g = ac.createGain()
    g.gain.value = gain
    const comp = ac.createDynamicsCompressor()
    g.connect(comp).connect(bus)
    return g
  }
  sfxBus = chain(0.6, audio.buses.sfx)
  musBus = chain(0.32, audio.buses.music)
  noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate)
  const d = noiseBuf.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
}

function audio() {
  return ac && ac.state === 'running' ? ac : null
}

function limit(name, gap) {
  const t = performance.now()
  if (lastPlayed[name] && t - lastPlayed[name] < gap) return false
  lastPlayed[name] = t
  return true
}

function tone(f, f2, dur, type = 'square', vol = 0.1, delay = 0, bus = sfxBus) {
  const a = audio()
  if (!a || !bus) return
  const t = a.currentTime + delay
  const o = a.createOscillator()
  const g = a.createGain()
  o.type = type
  o.frequency.setValueAtTime(f, t)
  if (f2 !== f) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol, t + 0.006)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(bus)
  o.start(t)
  o.stop(t + dur + 0.02)
}

function noise(dur, vol, freq, freq2 = freq, type = 'lowpass', delay = 0, bus = sfxBus) {
  const a = audio()
  if (!a || !bus) return
  const t = a.currentTime + delay
  const s = a.createBufferSource()
  s.buffer = noiseBuf
  const f = a.createBiquadFilter()
  f.type = type
  f.frequency.setValueAtTime(freq, t)
  if (freq2 !== freq) f.frequency.exponentialRampToValueAtTime(freq2, t + dur)
  const g = a.createGain()
  g.gain.setValueAtTime(vol, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  s.connect(f).connect(g).connect(bus)
  s.start(t, Math.random() * 0.5)
  s.stop(t + dur + 0.02)
}

export const sfx = {
  shoot() {
    if (limit('shoot', 55)) tone(1400, 500, 0.05, 'square', 0.025)
  },
  heavy() {
    if (limit('heavy', 90)) {
      tone(300, 90, 0.12, 'sawtooth', 0.05)
      noise(0.08, 0.06, 2000, 500)
    }
  },
  missile() {
    if (limit('missile', 80)) noise(0.15, 0.05, 3000, 800, 'bandpass')
  },
  hit() {
    if (limit('hit', 35)) tone(600 + Math.random() * 300, 200, 0.04, 'triangle', 0.03)
  },
  deflect() {
    if (limit('deflect', 70)) tone(2400, 1800, 0.05, 'sine', 0.04)
  },
  explode(big = false) {
    if (!limit(big ? 'boom' : 'explode', big ? 60 : 30)) return
    noise(big ? 0.7 : 0.25, big ? 0.35 : 0.12, big ? 1400 : 2400, 120)
    tone(big ? 140 : 220, 40, big ? 0.6 : 0.2, 'sine', big ? 0.3 : 0.08)
  },
  pickup() {
    if (limit('pickup', 45)) tone(1500 + Math.random() * 400, 2600, 0.05, 'sine', 0.035)
  },
  bomb() {
    noise(1.4, 0.5, 3000, 60)
    tone(90, 30, 1.2, 'sine', 0.5)
    tone(400, 50, 0.8, 'sawtooth', 0.12)
  },
  playerHit() {
    noise(0.5, 0.4, 1200, 100)
    tone(400, 60, 0.5, 'sawtooth', 0.2)
  },
  shield() {
    tone(800, 1600, 0.2, 'triangle', 0.1)
    tone(1200, 2400, 0.2, 'triangle', 0.06, 0.05)
  },
  move() {
    tone(900, 900, 0.04, 'square', 0.03)
  },
  select() {
    tone(660, 660, 0.08, 'square', 0.06)
    tone(990, 990, 0.12, 'square', 0.06, 0.06)
  },
  deny() {
    tone(200, 150, 0.15, 'square', 0.06)
  },
  buy() {
    ;[880, 1100, 1320].forEach((f, i) => tone(f, f, 0.08, 'square', 0.05, i * 0.05))
  },
  waveClear() {
    ;[523, 659, 784, 1046].forEach((f, i) => tone(f, f, 0.18, 'square', 0.06, i * 0.08))
  },
  warning() {
    for (let i = 0; i < 3; i++) tone(440, 330, 0.35, 'sawtooth', 0.12, i * 0.5)
  },
  levelUp() {
    ;[392, 523, 659, 784, 1046].forEach((f, i) => tone(f, f * 1.01, 0.15, 'triangle', 0.08, i * 0.05))
  },
  laser(on) {
    const a = audio()
    if (!a || !sfxBus) return
    if (!laserNode) {
      const o = a.createOscillator()
      const o2 = a.createOscillator()
      const g = a.createGain()
      o.type = 'sawtooth'
      o.frequency.value = 110
      o2.type = 'square'
      o2.frequency.value = 221
      const f = a.createBiquadFilter()
      f.type = 'lowpass'
      f.frequency.value = 1400
      g.gain.value = 0
      o.connect(f)
      o2.connect(f)
      f.connect(g).connect(sfxBus)
      o.start()
      o2.start()
      laserNode = g
    }
    laserNode.gain.setTargetAtTime(on ? 0.05 : 0, a.currentTime, 0.03)
  }
}
let laserNode = null

// ---------- music: A minor synthwave, four chords, three intensity layers ----------
const CHORDS = [
  [55, 65.41, 82.41], // Am
  [43.65, 55, 65.41], // F
  [65.41, 82.41, 98], // C
  [49, 61.74, 73.42] // G
]
let intensity = 0
let step = 0
let nextTime = 0
let muted = false

function scheduleStep(t) {
  const bar = Math.floor(step / 16) % 4
  const s = step % 16
  const chord = CHORDS[bar]
  const root = chord[0]
  // Bass: driving eighth notes.
  if (s % 2 === 0) {
    const f = s % 8 === 6 ? root * 2 : root
    tone(f, f, 0.2, 'sawtooth', intensity ? 0.12 : 0.06, t - ac.currentTime, musBus)
  }
  if (intensity >= 1) {
    if (s % 4 === 0) tone(150, 40, 0.18, 'sine', 0.35, t - ac.currentTime, musBus)
    if (s % 4 === 2) noise(0.04, 0.08, 7000, 7000, 'highpass', t - ac.currentTime, musBus)
    if (s === 4 || s === 12) noise(0.15, 0.12, 1800, 600, 'bandpass', t - ac.currentTime, musBus)
  }
  // Arpeggio.
  const arp = [0, 1, 2, 1, 2, 0, 1, 2]
  if (intensity >= 2 || (intensity === 0 && s % 2 === 0) || (intensity === 1 && s % 2 === 1)) {
    const f = chord[arp[s % 8]] * (intensity >= 2 ? 8 : 4)
    tone(f, f, 0.12, intensity >= 2 ? 'square' : 'triangle', intensity >= 2 ? 0.035 : 0.04, t - ac.currentTime, musBus)
  }
  // Pad on each bar.
  if (s === 0) for (const f of chord) tone(f * 4, f * 4, 1.8, 'triangle', 0.025, t - ac.currentTime, musBus)
}

setInterval(() => {
  if (!ac || ac.state !== 'running' || muted) return
  const stepLen = 60 / (intensity >= 2 ? 136 : 124) / 4
  if (nextTime < ac.currentTime) nextTime = ac.currentTime + 0.05
  while (nextTime < ac.currentTime + 0.12) {
    scheduleStep(nextTime)
    nextTime += stepLen
    step++
  }
}, 25)

export const music = {
  setIntensity(n) {
    intensity = n
  },
  mute(m) {
    muted = m
  }
}
