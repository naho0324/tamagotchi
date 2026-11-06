// 10연 뽑기: 540 = 9×60, always 의상 4 / 아이템 4 / 코인 2, pity still counts
const assert = require('assert'); const G = require('../game.js');
const now = Date.now();
const kid = () => { const p = G.newPlayer('t', 't', now, 2); p.pet.stage = 'child'; p.pet.lastUpdate = now; p.coins = 5000; G.migrate(p); return p; };
const count = (rs, slot) => rs.filter(r => r.slot === slot).length;
const cosmetic = new Set(G.GACHA.rare.concat(G.GACHA.legend));

assert.strictEqual(G.GACHA.tenCost, G.GACHA.cost * 9);
assert.strictEqual(G.GACHA.tenCost, 540);

let p = kid(); p.coins = 539;
assert.strictEqual(G.act(p, 'gacha10', null, now), '코인이 부족해요');
assert.strictEqual(p.coins, 539); assert.strictEqual(p.gachaPity, 0);

p = kid(); p.gachaPity = 0;
let pack = G.act(p, 'gacha10', () => 0.9, now);
assert.ok(pack.ten); assert.strictEqual(pack.results.length, 10);
assert.strictEqual(count(pack.results, 'costume'), 4);
assert.strictEqual(count(pack.results, 'item'), 4);
assert.strictEqual(count(pack.results, 'coin'), 2);
assert.ok(pack.results.filter(r => r.slot === 'costume').every(r => cosmetic.has(r.item) && ['hair', 'outfit', 'acc'].includes(G.SHOP[r.item].type)));
assert.ok(pack.results.filter(r => r.slot === 'item').every(r => r.item === 'snack' || r.item === 'medicine'));
assert.ok(pack.results.filter(r => r.slot === 'coin').every(r => [20, 30, 45].includes(r.coins) && !r.item));
assert.ok(pack.results.filter(r => r.slot === 'costume').every(r => r.rarity === 'rare')); // 0.9 is not legend
assert.strictEqual(p.gachaPity, 10); // no legend, ten steps
// constant rnd picks the same rare, so 1 new + 3 dup refunds, and both coin slots are 45
assert.strictEqual(pack.results.filter(r => r.dup).length, 3);
assert.strictEqual(p.coins, 5000 - 540 + 45 * 2 + 40 * 3);
assert.strictEqual(p.inventory.medicine, 4);

// pity: from 29, exactly one costume is forced 전설, then the counter continues
p = kid(); p.gachaPity = 29; const before = p.coins;
pack = G.act(p, 'gacha10', () => 0.99, now);
assert.strictEqual(pack.results.filter(r => r.rarity === 'legend').length, 1);
assert.ok(p.gachaPity < G.GACHA.pity);
assert.strictEqual(count(pack.results, 'costume'), 4);
assert.ok(before - p.coins <= G.GACHA.tenCost); // never costs more than the ticket price

// natural 전설 on every costume (rnd 0) and duplicate refund; single-pull pity still works after
p = kid(); p.coins = 5000; p.gachaPity = 0;
pack = G.act(p, 'gacha10', () => 0, now);
assert.strictEqual(pack.results.filter(r => r.slot === 'costume' && r.rarity === 'legend').length, 4);
const ears = pack.results.filter(r => r.item === 'acc_catears');
assert.strictEqual(ears.filter(r => r.isNew).length, 1);
assert.strictEqual(ears.filter(r => r.dup).length, 3);
assert.ok(ears.filter(r => r.dup).every(r => r.coins === G.GACHA.dupRefund.legend));
assert.strictEqual(p.acc, 'catears');
const pityAfter = p.gachaPity;
const single = G.gacha(p, () => 0.9);
assert.strictEqual(single.rarity, 'common');
assert.strictEqual(p.gachaPity, pityAfter + 1);

// one single pull still costs 60 and is unchanged
p.coins = 60; const s = G.act(p, 'gacha', null, now);
assert.ok(s.rarity); assert.ok(p.coins <= 60);
console.log('gacha10 ok', pack.msg);
