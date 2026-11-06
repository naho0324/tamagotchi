// v1.6 new 소모품: 도시락/에너지 드링크/거품비누/장난감/비타민
const assert = require('assert'); const G = require('../game.js'); const fs = require('fs');
const now = Date.now(), MIN = 60000;
for (const k of G.CONSUMABLES) { assert.strictEqual(G.SHOP[k].type, 'consumable'); assert.ok(fs.existsSync(`${__dirname}/../public/assets/items/${k}.png`), k); }
const mk = () => { const p = G.newPlayer('c', 'c', now - 20 * MIN, 3); p.pet.stage = 'child'; p.pet.hatchedAt = now - 15 * MIN; p.pet.lastUpdate = now; p.coins = 500; return p; };
let p = mk(); const s = p.pet.stats;
for (const k of ['meal', 'drink', 'soap', 'toy', 'vitamin']) { const c = p.coins; assert.ok(G.act(p, 'buy', k, now).msg); assert.strictEqual(p.coins, c - G.SHOP[k].price); assert.strictEqual(p.inventory[k], 1); }
assert.strictEqual(G.act(p, 'use', 'toy', now) && 0, 0);
Object.assign(s, { hunger: 10, happy: 10, energy: 5, clean: 3 }); p.inventory.toy = 1;
G.act(p, 'use', 'meal', now); assert.strictEqual(s.hunger, G.maxOf(3, 'hunger')); assert.strictEqual(p.inventory.meal, 0);
p.pet.sleeping = true; assert.strictEqual(G.act(p, 'use', 'toy', now), '자고 있어요 💤'); assert.strictEqual(p.inventory.toy, 1);
G.act(p, 'use', 'drink', now); assert.strictEqual(s.energy, 65); assert.strictEqual(p.pet.sleeping, false);
G.act(p, 'use', 'soap', now); assert.strictEqual(s.clean, G.maxOf(3, 'clean'));
const h = s.happy; G.act(p, 'use', 'toy', now); assert.strictEqual(s.happy, Math.min(G.maxOf(3, 'happy'), h + 50)); assert.strictEqual(s.energy, 65);
p.pet.sick = true; G.act(p, 'use', 'vitamin', now); assert.ok(!p.pet.sick); assert.strictEqual(p.pet.immuneUntil, now + 60 * MIN);
assert.strictEqual(G.act(p, 'use', 'vitamin', now), '아이템이 없어요');
// immunity: low stats + guaranteed sickness roll -> no sickness for 1h, sick after
const r0 = G.CFG.rand; G.CFG.rand = () => 0;
Object.assign(s, { hunger: 0, happy: 0, clean: 0 }); G.update(p, now + 30 * MIN); assert.ok(!p.pet.sick, 'immune');
G.update(p, now + 90 * MIN); assert.ok(p.pet.sick, 'immunity wore off'); G.CFG.rand = r0;
// old save without new keys
const old = mk(); old.inventory = { snack: 2, medicine: 1 }; G.migrate(old);
assert.deepStrictEqual(old.inventory, { snack: 2, medicine: 1, meal: 0, drink: 0, soap: 0, toy: 0, vitamin: 0, ticket: 0 });
const bad = mk(); bad.inventory = { meal: -3, toy: 'x' }; G.migrate(bad); assert.strictEqual(bad.inventory.meal, 0); assert.strictEqual(bad.inventory.toy, 0);
console.log('consumables ok');
