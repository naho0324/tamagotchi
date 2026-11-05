// v1.8 death balance: 25% decay while asleep, stays asleep, feeding / all-stats>0 clears the death timer
const assert = require('assert'), G = require('../game.js'); const H = 3600000;
function pet(st, sleeping, zm = 0) { const p = G.newPlayer('a', 'n', 0, 3); Object.assign(p.pet, { stage: 'adult', hatchedAt: -1e10, lastUpdate: 0, sleeping, zeroMin: zm }); Object.assign(p.pet.stats, st); return p; }
for (const st of [{ hunger: 100, happy: 100, energy: 100, clean: 100 }, { hunger: 40, happy: 40, energy: 30, clean: 40 }, { hunger: 20, happy: 20, energy: 10, clean: 20 }]) {
  const p = pet(st, true); G.update(p, 8 * H);
  assert.notStrictEqual(p.pet.stage, 'dead'); assert.ok(p.pet.sleeping, 'stays asleep'); if (st.hunger >= 40) assert.strictEqual(p.pet.zeroMin, 0, JSON.stringify(p.pet.stats));
}
{ const p = pet({ hunger: 100, happy: 100, energy: 100, clean: 100 }, true); G.update(p, 8 * H); assert.ok(Math.abs(p.pet.stats.hunger - (100 - 0.25 * 0.25 * 480)) < 1e-6, 'hunger 30 in 8h asleep'); }
{ const p = pet({ hunger: 100 }, false); G.update(p, 8 * H); assert.ok(p.pet.stats.hunger < 1, 'awake decay unchanged'); }
// feeding clears an accumulated timer
{ const p = pet({ hunger: 0, happy: 50, energy: 50, clean: 50 }, false, 600); G.update(p, 1000); p.pet.cooldowns = {};
  G.act(p, 'feed', null, 1000); assert.strictEqual(p.pet.zeroMin, 0);
  p.pet.stats.happy = 0; p.pet.zeroMin = 700; G.act(p, 'feed', null, 2000); assert.strictEqual(p.pet.zeroMin, 0, 'feed resets even if another stat is 0'); }
// timer also resets once every stat > 0
{ const p = pet({ hunger: 50, happy: 50, energy: 50, clean: 50 }, false, 650); G.update(p, 61000); assert.strictEqual(p.pet.zeroMin, 0); }
// still dies after long neglect (awake, ~19h)
{ const p = pet({ hunger: 100, happy: 100, energy: 100, clean: 100 }, false); G.update(p, 20 * H); assert.strictEqual(p.pet.stage, 'dead'); }
// typical day: 1h care, 8h sleep, care, 10h work — survives a week
{ const p = pet({ hunger: 80, happy: 80, energy: 80, clean: 80 }, false); let t = 0; const care = () => { const s = p.pet.stats; s.hunger = Math.min(100, s.hunger + 50); s.happy = Math.min(100, s.happy + 40); s.clean = 100; s.energy = Math.max(s.energy, 60); p.pet.sick = false; };
  for (let d = 0; d < 7; d++) { care(); t += H; G.update(p, t); p.pet.sleeping = true; t += 8 * H; G.update(p, t); assert.notStrictEqual(p.pet.stage, 'dead', 'night ' + d); p.pet.sleeping = false; care(); t += 10 * H; G.update(p, t); assert.notStrictEqual(p.pet.stage, 'dead', 'day ' + d); } }
// old save (sleeping flag, carried zeroMin) still loads
{ const old = JSON.parse(JSON.stringify(pet({ hunger: 30 }, true, 300))); delete old.pet.custom; G.migrate(old); G.update(old, 60000); assert.strictEqual(old.pet.zeroMin, 0); assert.ok(old.pet.sleeping); }
console.log('sleep/death balance ok');
