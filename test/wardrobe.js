// v1.8 옷장 확장: 10 hairs, 20 tops (outfit = 상의), 10 layered accessories, gacha-only tops, presets keep old items
const assert = require('assert'); const G = require('../game.js'); const fs = require('fs'); const now = Date.now(); const seq = a => { let i = 0; return () => a[i++ % a.length]; };
assert.strictEqual(G.HAIRS.length, 10); assert.strictEqual(G.OUTFITS.length, 20); assert.strictEqual(G.ACCS.length - 1, 10); assert.deepStrictEqual(G.BOTTOMS, ['none']);
const tops = G.OUTFITS.slice(6);
for (const o of tops) { const it = G.SHOP['outfit_' + o]; assert.ok(it && ['rare', 'legend'].includes(it.gacha), o); assert.ok(G.GACHA[it.gacha].includes('outfit_' + o)); }
const p = G.newPlayer('w', 'w', now, 1, { eyes: 'x1' }); p.coins = 5000;
for (const o of tops) { assert.strictEqual(G.act(p, 'buy', 'outfit_' + o, now), '뽑기에서만 나와요'); assert.strictEqual(typeof G.act(p, 'equip', 'outfit:' + o, now), 'string'); }
assert.strictEqual(p.coins, 5000); assert.strictEqual(p.outfit, 'base');
for (const h of ['long', 'bun', 'spiky', 'curly', 'braid']) { const it = G.SHOP['hair_' + h]; assert.ok(!it.gacha && it.price >= 150 && it.price <= 300); assert.ok(G.act(p, 'buy', 'hair_' + h, now).msg); assert.strictEqual(p.hair, h); }
for (const a of ['bunny', 'beret', 'sprout', 'partyhat', 'headphones']) { assert.ok(G.act(p, 'buy', 'acc_' + a, now).msg); assert.strictEqual(p.acc, a); }
assert.strictEqual(G.act(p, 'buy', 'acc_halo', now), '뽑기에서만 나와요');
// gacha gives a top and wears it
let r = G.gacha(p, seq([0.1, 2 / 11 + 0.001])); assert.strictEqual(r.rarity, 'rare'); assert.ok(r.item.startsWith('outfit_')); assert.ok(r.isNew); assert.strictEqual(p.outfit, G.SHOP[r.item].key);
r = G.gacha(p, seq([0.01, 0.5])); assert.strictEqual(r.rarity, 'legend'); assert.strictEqual(p.outfit, G.SHOP[r.item].key);
// migration: old save keeps its outfit as the top, gets bottom placeholder
const old = { id: 'o', nickname: 'o', coins: 5, inventory: { snack: 0 }, owned: ['outfit_hanbok', 'acc_crown'], hair: 'base', outfit: 'hanbok', acc: 'crown', pet: G.newPet(now, 3), wins: 0 };
G.migrate(old); assert.strictEqual(old.outfit, 'hanbok'); assert.strictEqual(old.acc, 'crown'); assert.strictEqual(old.bottom, 'none');
const snap = G.sanitizeSnap({ ...G.snapOf(p) }); assert.strictEqual(snap.outfit, p.outfit); assert.strictEqual(snap.acc, p.acc);
// presets: old whole sprites unchanged (new hairs/tops fall back to base in pet.js)
for (let c = 1; c <= 7; c++) assert.ok(!fs.existsSync(`${__dirname}/../public/assets/outfits/${c}/adult/long_base.png`));
console.log('wardrobe ok');
