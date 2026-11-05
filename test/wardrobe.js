// v1.8 옷장 확장: 10 hairs, 20 tops (outfit = 상의), 10 layered accessories, gacha-only tops, presets keep old items
const assert = require('assert'); const G = require('../game.js'); const fs = require('fs'); const now = Date.now(); const seq = a => { let i = 0; return () => a[i++ % a.length]; };
assert.strictEqual(G.HAIRS.length, 10); assert.strictEqual(G.OUTFITS.length, 20); assert.strictEqual(G.ACCS.length - 1, 10); assert.deepStrictEqual(G.BOTTOMS, ['none']);
const tops = G.OUTFITS.slice(6);
for (const o of tops) { const it = G.SHOP['outfit_' + o]; assert.ok(it && ['rare', 'legend'].includes(it.gacha), o); assert.ok(G.GACHA[it.gacha].includes('outfit_' + o)); }
const p = G.newPlayer('w', 'w', now, 1, { eyes: 'x1' }); p.coins = 5000;
for (const o of tops) { assert.strictEqual(G.act(p, 'buy', 'outfit_' + o, now), '뽑기에서만 나와요'); assert.strictEqual(typeof G.act(p, 'equip', 'outfit:' + o, now), 'string'); }
assert.strictEqual(p.coins, 5000); assert.strictEqual(p.outfit, 'base');
// v1.9 전부 뽑기전용: every cosmetic except base/none is gacha-only and in exactly one pool
const cos = Object.keys(G.SHOP).filter(k => G.SHOP[k].type !== 'consumable'); assert.strictEqual(cos.length, 9 + 19 + 10);
for (const k of cos) { const it = G.SHOP[k]; assert.ok(['rare', 'legend'].includes(it.gacha), k); assert.strictEqual(it.price, 0); assert.ok(G.GACHA[it.gacha].includes(k), k); assert.strictEqual(G.act(p, 'buy', k, now), '뽑기에서만 나와요'); }
assert.strictEqual(G.GACHA.rare.length + G.GACHA.legend.length, cos.length); assert.strictEqual(new Set(G.GACHA.rare.concat(G.GACHA.legend)).size, cos.length);
for (const k of G.CONSUMABLES) { const c = p.coins; assert.ok(G.act(p, 'buy', k, now).msg, k); assert.ok(p.coins < c); } p.coins = 5000;
p.owned.push('hair_bun'); assert.ok(G.act(p, 'equip', 'hair:bun', now).msg); assert.strictEqual(p.coins, 5000, 'owned equips free');
// gacha gives a top and wears it
let r = G.gacha(p, seq([0.1, 11 / 24 + 0.001])); assert.strictEqual(r.rarity, 'rare'); assert.ok(r.item.startsWith('outfit_')); assert.ok(r.isNew); assert.strictEqual(p.outfit, G.SHOP[r.item].key);
r = G.gacha(p, seq([0.01, 0.5])); assert.strictEqual(r.rarity, 'legend'); assert.strictEqual(p.outfit, G.SHOP[r.item].key);
// migration: old save keeps its outfit as the top, gets bottom placeholder
const old = { id: 'o', nickname: 'o', coins: 5, inventory: { snack: 0 }, owned: ['outfit_hanbok', 'acc_crown'], hair: 'base', outfit: 'hanbok', acc: 'crown', pet: G.newPet(now, 3), wins: 0 };
G.migrate(old); assert.strictEqual(old.outfit, 'hanbok'); assert.strictEqual(old.acc, 'crown'); assert.strictEqual(old.bottom, 'none');
const snap = G.sanitizeSnap({ ...G.snapOf(p) }); assert.strictEqual(snap.outfit, p.outfit); assert.strictEqual(snap.acc, p.acc);
// presets: old whole sprites unchanged (new hairs/tops fall back to base in pet.js)
for (let c = 1; c <= 7; c++) assert.ok(!fs.existsSync(`${__dirname}/../public/assets/outfits/${c}/adult/long_base.png`));
console.log('wardrobe ok');
