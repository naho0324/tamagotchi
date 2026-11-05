const assert = require('assert'); const G = require('../game.js'); const fs = require('fs');
const now = Date.now(); const pl = G.newPlayer('id1', 'tester', now, 1);
assert.strictEqual(pl.acc, 'none');
assert.strictEqual(G.SHOP.acc_crown.gacha, 'legend'); assert.strictEqual(G.SHOP.acc_crown.type, 'acc');
assert.ok(typeof G.act(pl, 'equip', 'acc:crown', now) === 'string', 'cannot equip unowned crown');
pl.coins = 1000; assert.strictEqual(G.act(pl, 'buy', 'acc_crown', now), '뽑기에서만 나와요'); assert.strictEqual(pl.coins, 1000);
pl.owned.push('acc_crown'); assert.ok(G.act(pl, 'equip', 'acc:crown', now).msg); assert.strictEqual(pl.acc, 'crown'); assert.strictEqual(pl.coins, 1000, 'equip is free');
assert.strictEqual(G.act(pl, 'equip', 'acc:none', now).msg, '갈아입었어요!'); assert.strictEqual(pl.acc, 'none');
G.act(pl, 'equip', 'acc:crown', now); assert.strictEqual(G.publicPet(pl).acc, 'crown'); assert.strictEqual(G.snapOf(pl).acc, 'crown');
assert.strictEqual(G.sanitizeSnap({ ...G.snapOf(pl), acc: 'tiara' }).acc, 'none');
const old = JSON.parse(JSON.stringify(pl)); delete old.acc; G.migrate(old); assert.strictEqual(old.acc, 'none');
const cheat = JSON.parse(JSON.stringify(pl)); cheat.owned = []; G.migrate(cheat); assert.strictEqual(cheat.acc, 'none');
for (let c = 1; c <= 7; c++) for (const s of ['child', 'adult']) for (const h of G.HAIRS.slice(0, 5)) for (const o of G.OUTFITS.slice(0, 6))
  assert.ok(fs.existsSync(`${__dirname}/../public/assets/outfits/${c}/${s}/${h}_${o}_crown.png`), `${c}/${s}/${h}_${o}_crown`);
console.log('acc ok');
