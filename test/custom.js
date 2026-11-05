// v1.7 custom character: creation, validation, migration, snapshots, restart, edit
const assert = require('assert'), G = require('../game.js'), fs = require('fs'), path = require('path');
const now = Date.now();
let p = G.newPlayer('a', '닉', now, 3, { eyes: 'x2', color: 'sky' }, ' 콩이<script> ');
assert.deepStrictEqual(p.pet.custom, { eyes: 'x2', color: 'sky' }); assert.strictEqual(p.pet.char, 3); assert.strictEqual(p.pet.name, '콩이script');
assert.strictEqual(G.newPlayer('b', 'n', now, 4).coins, 60, 'rich preset still doubles');
assert.strictEqual(G.newPlayer('b', 'n', now, 2, { eyes: 'zz' }).pet.custom, undefined, 'bad eyes -> preset');
assert.strictEqual(G.validCustom({ eyes: 'x3', color: 'nope' }).color, 'mint');
// snapshots & public look carry custom; sanitize rejects junk
const sn = G.snapOf(p); assert.deepStrictEqual(sn.custom, { eyes: 'x2', color: 'sky' }); assert.strictEqual(sn.petName, '콩이script');
assert.deepStrictEqual(G.sanitizeSnap(sn, 'n').custom, { eyes: 'x2', color: 'sky' });
assert.strictEqual(G.sanitizeSnap({ ...sn, custom: { eyes: '../1' } }, 'n').custom, null);
assert.deepStrictEqual(G.publicPet(p).custom, { eyes: 'x2', color: 'sky' });
// migration: old saves (no custom) stay presets; corrupt custom removed
const old = JSON.parse(JSON.stringify(G.newPlayer('c', 'n', now, 5))); delete old.pet.custom; G.migrate(old); assert.strictEqual(old.pet.custom, undefined); G.update(old, now + 1000); assert.strictEqual(old.pet.char, 5);
const bad = G.newPlayer('d', 'n', now, 1); bad.pet.custom = { eyes: 1 }; bad.pet.name = 5; G.migrate(bad); assert.strictEqual(bad.pet.custom, undefined); assert.strictEqual(bad.pet.name, undefined);
// edit later: name/body anytime, 성격 only while egg
let r = G.act(p, 'look', { name: '두부', custom: { eyes: 'x3', color: 'pink' }, char: 7 }, now); assert.ok(r.msg);
assert.strictEqual(p.pet.name, '두부'); assert.deepStrictEqual(p.pet.custom, { eyes: 'x3', color: 'pink' }); assert.strictEqual(p.pet.char, 7, 'egg: trait change ok');
p.pet.stage = 'child'; G.act(p, 'look', { char: 2, custom: null }, now); assert.strictEqual(p.pet.char, 7, 'grown: trait locked'); assert.strictEqual(p.pet.custom, undefined, 'back to preset look');
// rich bonus only once via edits
const q = G.newPlayer('e', 'n', now, 1, { eyes: 'x1' }); const c0 = q.coins; G.act(q, 'look', { char: 4 }, now); G.act(q, 'look', { char: 1 }, now); G.act(q, 'look', { char: 4 }, now); assert.strictEqual(q.coins, c0 + 30);
// restart keeps or replaces the look
p.pet.stage = 'dead'; r = G.act(p, 'restart', { char: 6, custom: { eyes: 'x1', color: 'lemon' }, name: '알콩' }, now); assert.ok(r.msg);
assert.strictEqual(p.pet.stage, 'egg'); assert.strictEqual(p.pet.char, 6); assert.strictEqual(p.pet.custom.color, 'lemon'); assert.strictEqual(p.pet.name, '알콩');
p.pet.stage = 'dead'; G.act(p, 'restart', null, now); assert.strictEqual(p.pet.char, 6); assert.strictEqual(p.pet.custom.eyes, 'x1');
// every custom sprite exists: 3 eyes x 2 stages x 10 hairs x 20 tops = 1200 whole sprites (accessories are layered from assets/acc), plus pets
let n = 0; const root = path.join(__dirname, '../public/assets');
for (const e of G.CUSTOM.eyes) { for (const st of ['egg', 'baby', 'child', 'adult']) assert.ok(fs.existsSync(`${root}/pets/${e}/${st}.png`), e + st);
  for (const st of ['child', 'adult']) for (const h of G.HAIRS) for (const o of G.OUTFITS) { const f = `${root}/outfits/${e}/${st}/${h}_${o}.png`; assert.ok(fs.existsSync(f), f); n++; } }
assert.strictEqual(n, 1200);
for (const a of G.ACCS) if (a !== 'none') assert.ok(fs.existsSync(`${root}/acc/${a}.png`), a);
console.log('custom ok', n, 'sprites');
