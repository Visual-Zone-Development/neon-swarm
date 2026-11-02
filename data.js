// Static game data: weapons, passives, upgrade cards, mods, ships and shop items.

export const MAX_LVL = 5
export const RARITY = [
  { name: 'COMMON', color: '#8fb3ff' },
  { name: 'RARE', color: '#ff5ce1' },
  { name: 'LEGENDARY', color: '#ffc93c' }
]

// Primary weapons: one fires at a time, cycle with LB/RB. Numbers are per level (1..5).
export const WEAPONS = {
  blaster: {
    fam: 'precision',
    name: 'Twin Blaster',
    color: '#ffe866',
    desc: 'Parallel streams of fast bolts.',
    lv: ['Two streams', '+35% damage', 'Third stream', 'Faster fire', 'Fourth stream']
  },
  laser: {
    fam: 'precision',
    name: 'Pulse Laser',
    color: '#ff4fd8',
    desc: 'A continuous beam that cuts through every enemy in a line.',
    lv: ['Steady beam', '+25% beam damage', 'Wider beam', '+30% beam damage', 'Mega beam']
  },
  homing: {
    fam: 'volatile',
    name: 'Homing Swarm',
    color: '#7dff7a',
    desc: 'Volleys of missiles that hunt enemies and burst on impact.',
    lv: ['Three missiles', '+25% damage', 'Four missiles', 'Faster volleys', 'Five missiles']
  },
  mortar: {
    fam: 'volatile',
    name: 'Nova Mortar',
    color: '#ff7a2f',
    desc: 'Slow, heavy shells that burst in a huge blast. Kills explode again and chain.',
    lv: ['Big blast, 3 links', '+30% damage', 'Bigger blast, 4 links', 'Faster reload', 'Huge blast, 6 links']
  },
}

// Passive weapons: always on, up to two.
export const PASSIVES = {
  orbit: {
    fam: 'swarm',
    name: 'Orbit Blades',
    color: '#c38bff',
    desc: 'Blades circle your ship and shred anything close.',
    lv: ['Two blades', 'Three blades', 'Four blades', 'Five blades', 'Six blades']
  },
  drones: {
    fam: 'swarm',
    name: 'Drone Wingmen',
    color: '#66ffd1',
    desc: 'Drones fly beside you and shoot the nearest enemy.',
    lv: ['One drone', 'Two drones', '+30% damage', 'Three drones', 'Faster fire']
  }
}

export const STATS = [
  { id: 'dmg', fam: 'precision', name: 'Damage Core', desc: '+20% damage.', rarity: 0, apply: (p) => (p.stats.dmg *= 1.2) },
  { id: 'rate', fam: 'velocity', name: 'Rapid Cycler', desc: '+15% fire rate.', rarity: 0, apply: (p) => (p.stats.rate *= 1.15) },
  { id: 'velocity', fam: 'kinetic', needs: 'bullets', name: 'Railgun Coils', desc: '+25% shot speed and range.', rarity: 0, apply: (p) => ((p.stats.bspeed *= 1.25), (p.stats.range *= 1.1)) },
  { id: 'pierce', fam: 'kinetic', needs: 'bullets', name: 'Piercing Rounds', desc: 'Shots pass through one more enemy.', rarity: 1, apply: (p) => (p.stats.pierce += 1) },
  { id: 'speed', fam: 'velocity', name: 'Thrusters', desc: '+12% move speed.', rarity: 0, apply: (p) => (p.stats.speed *= 1.12) },
  { id: 'magnet', fam: 'harvest', name: 'Geom Magnet', desc: 'Pull geoms from much farther away.', rarity: 0, apply: (p) => (p.stats.magnet += 60) },
  {
    id: 'hull',
    fam: 'fortress',
    name: 'Hull Plating',
    desc: '+1 max HP and repair 1 HP.',
    rarity: 0,
    ok: (p) => !p.mods.has('glass') && p.maxHp < 8,
    apply: (p) => ((p.maxHp += 1), (p.hp = Math.min(p.maxHp, p.hp + 1)))
  },
  { id: 'bombs', fam: 'volatile', name: 'Bomb Bay', desc: '+1 max bombs, and one more bomb now.', rarity: 0, ok: (p) => p.bombMax < 6, apply: (p) => ((p.bombMax += 1), (p.bombs += 1)) },
  { id: 'crit', fam: 'precision', name: 'Targeting AI', desc: '+8% chance to crit for triple damage.', rarity: 1, ok: (p) => p.stats.crit < 0.5, apply: (p) => (p.stats.crit += 0.08) },
  { id: 'repair', fam: 'fortress', name: 'Nanite Repair', desc: 'Fully repair your hull.', rarity: 0, ok: (p) => p.hp < p.maxHp, apply: (p) => (p.hp = p.maxHp) },
  { id: 'shield', fam: 'fortress', name: 'Shield Cell', desc: 'Gain a shield that blocks one hit.', rarity: 1, ok: (p) => p.shield < 3, apply: (p) => (p.shield += 1) },
  { id: 'swarmcore', fam: 'swarm', needs: 'swarm', name: 'Drone Firmware', desc: '+20% drone, blade and turret damage.', rarity: 0, apply: (p) => (p.stats.swarm *= 1.2) },
  { id: 'spares', fam: 'harvest', name: 'Spare Parts', desc: '+2 rerolls and +1 banish for your drafts.', rarity: 0, apply: () => {} },
  // Ship-only cards: they stand in for weapon cards on ships without a gun.
  { id: 'dronebay', fam: 'swarm', name: 'Drone Bay', desc: '+1 drone in your swarm.', rarity: 0, only: 'carrier', ok: (p) => p.extraDrones < 6, apply: (p) => (p.extraDrones += 1) },
  { id: 'edge', fam: 'swarm', name: 'Honed Edge', desc: '+25% blade and Reap damage, longer reach.', rarity: 0, only: 'reaper', ok: (p) => p.edge < 6, apply: (p) => (p.edge += 1) },
  { id: 'emplace', fam: 'swarm', name: 'Emplacement', desc: '+1 turret slot and turrets last 5s longer.', rarity: 1, only: 'warden', ok: (p) => p.turretBonus < 4, apply: (p) => (p.turretBonus += 1) }
]

// Rule-changing mods: each can be taken once. All are available from the start.
// `needs` (on mods and stat cards): only offered to ships that can use it ('bullets', 'swarm' or 'bombs').
export const MODS = [
  { id: 'fission', fam: 'volatile', name: 'Fission', desc: 'Kills burst into 4 shards that hit other enemies.', rarity: 1 },
  { id: 'chain', fam: 'volatile', name: 'Chain Reaction', desc: 'Enemies explode when they die, hurting their neighbors.', rarity: 1 },
  { id: 'singularity', fam: 'volatile', needs: 'bombs', name: 'Singularity', desc: 'Bombs leave a black hole that eats enemies.', rarity: 2 },
  { id: 'overclock', fam: 'harvest', name: 'Overclock', desc: 'Fire rate rises with your multiplier, up to double at x10.', rarity: 1 },
  { id: 'glass', fam: 'precision', name: 'Glass Cannon', desc: 'Double damage, but your max HP becomes 1.', rarity: 2 },
  { id: 'afterimage', fam: 'velocity', name: 'Afterimage', desc: 'Your engine trail burns enemies that touch it.', rarity: 1 },
  { id: 'geomshield', fam: 'harvest', name: 'Geom Shield', desc: 'Every 400 geoms grants a shield, if you have none.', rarity: 1 },
  { id: 'vampire', fam: 'harvest', name: 'Siphon', desc: 'Every 120 kills repairs 1 HP.', rarity: 1 },
  { id: 'recharge', fam: 'volatile', needs: 'bombs', name: 'Bomb Reactor', desc: 'A new bomb charges every 40 seconds.', rarity: 1 },
  { id: 'splitshot', fam: 'kinetic', needs: 'bullets', name: 'Splinter Rounds', desc: 'Shots split in two on their first hit.', rarity: 1 },
  { id: 'bouncy', fam: 'kinetic', needs: 'bullets', name: 'Rubber Walls', desc: 'All shots bounce off the walls once more.', rarity: 0 },
  { id: 'nova', fam: 'fortress', name: 'Retaliation', desc: 'When you are hit, fire a 32-shot nova.', rarity: 0 },
  { id: 'momentum', fam: 'velocity', name: 'Momentum', desc: '+40% damage while you are moving.', rarity: 0 },
  { id: 'frost', fam: 'fortress', name: 'Cryo Rounds', desc: 'Hits slow enemies by 40%.', rarity: 1 },
  { id: 'greed', fam: 'harvest', name: 'Greed', desc: 'Geoms count double toward your multiplier and fly to you from farther.', rarity: 0 },
  { id: 'overdrive', fam: 'precision', name: 'Overdrive', desc: '+40% fire rate and +25% damage.', rarity: 2 },
  { id: 'uplink', fam: 'swarm', needs: 'swarm', name: 'Drone Uplink', desc: 'Drones, turrets and blades attack 40% faster.', rarity: 1 },
  { id: 'hive', fam: 'swarm', needs: 'swarm', name: 'Hive Mind', desc: '+1 drone, +1 orbit blade and +1 turret slot.', rarity: 1 },
  { id: 'slipstream', fam: 'velocity', name: 'Slipstream', desc: 'Your ship ability recharges 30% faster.', rarity: 0 },
  { id: 'aegis', fam: 'fortress', name: 'Aegis Field', desc: 'Regain a shield every 45 seconds.', rarity: 1 }
]

// Synergy families. Every card belongs to one. Owning 2 / 4 / 6 cards of a family unlocks its bonuses.
// Weapons and passives count double once they reach max level; stat cards count every time you take one.
export const FAMILIES = {
  kinetic: { name: 'KINETIC', color: '#5ee0ff', bonus: ['+1 pierce on all shots', '+1 bounce on all shots', 'Shots gain +35% damage on every pierce and bounce'] },
  volatile: { name: 'VOLATILE', color: '#ffb347', bonus: ['Explosions are 40% bigger', 'Kills have a 30% chance to explode', 'Every kill explodes, explosions deal double'] },
  precision: { name: 'PRECISION', color: '#ffe866', bonus: ['+10% crit chance', 'Crits deal 5x damage', '+20% crit chance, crits deal 6x'] },
  swarm: { name: 'SWARM', color: '#66ffd1', bonus: ['+1 drone, blade and turret', 'Drones, blades and turrets deal +60%', 'Swarm damage x2.5, attacks 50% faster'] },
  velocity: { name: 'VELOCITY', color: '#ff5ce1', bonus: ['+10% speed, ability recharges 20% faster', '+30% damage and +20% fire rate while moving', 'A burning trail follows you, ability recharges twice as fast'] },
  harvest: { name: 'HARVEST', color: '#d8ff3a', bonus: ['Geoms count triple toward your multiplier', 'Multiplier decays half as fast, a hit keeps 80% of it, wider magnet', 'Multiplier cap x20, +5% damage per multiplier step'] },
  fortress: { name: 'FORTRESS', color: '#8fb3ff', bonus: ['Breaking a shield fires a nova', '+1 max HP, regain a shield every 45s', '+1 max HP, regain a shield every 25s'] }
}
export const FAMILY_TIERS = [2, 4, 6]

// Ships: each has its own ability (LT) and one rule that changes how it plays. All are available from the start.
export const SHIPS = [
  {
    id: 'interceptor',
    name: 'Interceptor',
    color: '#ffffff',
    glow: '#5ee0ff',
    role: 'Balanced dogfighter. 3 HP, Twin Blaster.',
    ability: 'barrage',
    abilityName: 'BARRAGE',
    abilityDesc: 'Triple fire rate and piercing bolts for 3 seconds.',
    rule: 'Every kill during a Barrage extends it (up to +2s).',
    hp: 3,
    speed: 1,
    dmg: 1,
    weapon: 'blaster'
  },
  {
    id: 'hunter',
    name: 'Hunter',
    color: '#dce8ff',
    glow: '#4d8bff',
    role: 'Missile boat. 3 HP, Homing Swarm.',
    ability: 'salvo',
    abilityName: 'SALVO',
    abilityDesc: 'Launch a ring of 16 homing missiles.',
    rule: 'Missiles launch on their own at nearby enemies; the right stick just steers them.',
    hp: 3,
    speed: 1,
    dmg: 1,
    weapon: 'homing',
    autoFire: true
  },
  {
    id: 'bombard',
    name: 'Bombard',
    color: '#fff0dc',
    glow: '#ff7a2f',
    role: 'Demolition. 4 HP, Nova Mortar.',
    ability: 'detonate',
    abilityName: 'DETONATE',
    abilityDesc: 'Blow up your shells in flight, right where they are.',
    rule: 'Very slow fire, but blast kills explode again in a chain.',
    hp: 4,
    speed: 1.05,
    dmg: 1,
    weapon: 'mortar'
  },
  {
    id: 'phantom',
    name: 'Phantom',
    color: '#ffd6f6',
    glow: '#ff4fd8',
    role: 'Fast and fragile. 2 HP, +25% damage, Pulse Laser.',
    ability: 'phase',
    abilityName: 'PHASE',
    abilityDesc: 'Turn intangible: fly through anything, burning what you touch.',
    rule: 'Every geom you grab speeds up the next Phase.',
    hp: 2,
    speed: 1.2,
    dmg: 1.25,
    weapon: 'laser'
  },
  {
    id: 'carrier',
    name: 'Carrier',
    color: '#d6fff2',
    glow: '#66ffd1',
    role: 'Commander. 3 HP, no gun, four drones.',
    ability: 'frenzy',
    abilityName: 'FRENZY',
    abilityDesc: 'Drones fire three times as fast for a few seconds.',
    rule: 'No gun: the right stick sends your drones to attack.',
    hp: 3,
    speed: 0.95,
    dmg: 1.2,
    noGun: true,
    passive: ['drones', 2],
    extraDrones: 2
  },
  {
    id: 'reaper',
    name: 'Reaper',
    color: '#ffe6e6',
    glow: '#ff4040',
    role: 'Melee hunter. 3 HP, no gun, orbit blades.',
    ability: 'reap',
    abilityName: 'REAP',
    abilityDesc: 'Slash through enemies in the aim direction.',
    rule: 'No gun. Reap kills recharge it; every Reap ends in a shockwave.',
    hp: 3,
    speed: 1.12,
    dmg: 1,
    noGun: true,
    passive: ['orbit', 2]
  },
  {
    id: 'warden',
    name: 'Warden',
    color: '#eaffd6',
    glow: '#9dff5c',
    role: 'Engineer. 4 HP, weak Twin Blaster.',
    ability: 'turret',
    abilityName: 'TURRET',
    abilityDesc: 'Drop a turret that guards the spot (3 at once).',
    rule: 'Your gun deals 60% damage, but turrets get all your upgrades.',
    hp: 4,
    speed: 0.95,
    dmg: 1,
    gunDmg: 0.6,
    weapon: 'blaster'
  }
]
