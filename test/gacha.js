// v1.5: new head accessories (리본/꽃핀/고양이귀) + 뽑기 (gacha)
const assert = require('assert'); const G = require('../game.js'); const fs = require('fs');
const now = Date.now(), seq = a => { let i = 0; return () => a[i++ % a.length]; };
for (const a of ['ribbon', 'flower', 'catears']) { assert.ok(G.ACCS.includes(a));
  for (let c = 1; c <= 7; c++) for (const s of ['child', 'adult']) for (const h of G.HAIRS.slice(0, 5)) for (const o of G.OUTFITS.slice(0, 6))
    assert.ok(fs.existsSync(`${__dirname}/../public/assets/outfits/${c}/${s}/${h}_${o}_${a}.png`), `${c}/${s}/${h}_${o}_${a}`); }
let p = G.newPlayer('g', 'tester', now, 2); assert.strictEqual(p.gachaPity, 0);
p.coins = 1000; assert.strictEqual(G.act(p, 'buy', 'acc_ribbon', now), '뽑기에서만 나와요'); p.owned.push('acc_ribbon'); G.act(p, 'equip', 'acc:ribbon', now); assert.strictEqual(p.acc, 'ribbon'); assert.strictEqual(p.coins, 1000);
assert.strictEqual(G.act(p, 'buy', 'acc_catears', now), '뽑기에서만 나와요'); assert.ok(!p.owned.includes('acc_catears'));
assert.strictEqual(typeof G.act(p, 'equip', 'acc:catears', now), 'string');
p.coins = 59; assert.strictEqual(G.act(p, 'gacha', null, now), '코인이 부족해요'); assert.strictEqual(p.coins, 59);
// rates: roll<5 legend, <30 rare, else common
p.coins = 1000; let r = G.gacha(p, seq([0.5, 0.0])); assert.strictEqual(r.rarity, 'common'); assert.strictEqual(r.coins, 20); assert.strictEqual(p.coins, 1000 - 60 + 20);
r = G.gacha(p, seq([0.1, 0.0])); assert.strictEqual(r.rarity, 'rare'); assert.strictEqual(r.item, 'acc_ribbon'); assert.ok(r.dup); assert.strictEqual(r.coins, 40); // owned ribbon -> refund
r = G.gacha(p, seq([0.1, 0.05])); assert.strictEqual(r.item, 'acc_flower'); assert.ok(r.isNew); assert.strictEqual(p.acc, 'flower');
const c0 = p.coins; r = G.gacha(p, seq([0.01, 0])); assert.strictEqual(r.rarity, 'legend'); assert.strictEqual(r.rarityKo, '전설'); assert.ok(r.isNew); assert.strictEqual(p.acc, 'catears'); assert.strictEqual(p.coins, c0 - 60); assert.strictEqual(p.gachaPity, 0);
r = G.gacha(p, seq([0.01, 0])); assert.ok(r.dup); assert.strictEqual(p.coins, c0 - 120 + 150);
assert.strictEqual(G.act(p, 'equip', 'acc:catears', now).msg, '갈아입었어요!');
// pity: 30th pull without 전설 is 전설
const q = G.newPlayer('q', 'q', now, 1); q.coins = 9999; let got = null;
for (let i = 1; i <= 30; i++) { r = G.gacha(q, seq([0.9, 0])); if (r.rarity === 'legend') { got = i; break; } } assert.strictEqual(got, 30);
// rough distribution with Math.random
const d = G.newPlayer('d', 'd', now, 4), cnt = { common: 0, rare: 0, legend: 0 }; for (let i = 0; i < 20000; i++) { d.coins = 9999; cnt[G.gacha(d).rarity]++; }
assert.ok(cnt.common / 20000 > 0.62 && cnt.rare / 20000 > 0.21 && cnt.legend / 20000 > 0.04, JSON.stringify(cnt));
// old saves (no gachaPity / acc) migrate; gacha-owned ear survives migration
const old = JSON.parse(JSON.stringify(p)); delete old.gachaPity; delete old.acc; G.migrate(old); assert.strictEqual(old.gachaPity, 0); assert.strictEqual(old.acc, 'none');
const keep = JSON.parse(JSON.stringify(p)); G.migrate(keep); assert.strictEqual(keep.acc, 'catears'); assert.ok(keep.owned.includes('acc_catears'));
const v13 = { id: 'x', nickname: 'old', coins: 5, inventory: { snack: 0 }, owned: ['hair_bob'], hair: 'bob', outfit: 'base', pet: G.newPet(now, 3), wins: 0 };
G.update(v13, now); assert.strictEqual(v13.acc, 'none'); assert.strictEqual(v13.gachaPity, 0); assert.strictEqual(v13.hair, 'bob');
assert.strictEqual(G.sanitizeSnap({ ...G.snapOf(p), acc: 'flower' }).acc, 'flower');
console.log('gacha ok', JSON.stringify(cnt));
