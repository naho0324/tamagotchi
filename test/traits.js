// Traits, hair/outfit, migration, coin cap, snapshot clamping (shared game.js) + raid trait effects.
const G = require('../game'); const M = 60000; const ok = (c, m) => { if (!c) { console.error('FAIL', m); process.exit(1); } console.log('ok -', m); };
const pl = c => { const p = G.newPlayer('x', 'n', 0, c); G.update(p, 3 * M); return p; };
// hair/outfit: default base/base, buy permanently, equip by key, works across stages & restart
for (let c = 1; c <= 7; c++) { const p = pl(c); ok(p.hair === 'base' && p.outfit === 'base', `char ${c} starts base/base`); }
ok(['hair_pony', 'hair_bob', 'hair_pigtail', 'hair_afro'].every(k => G.SHOP[k].type === 'hair') && ['outfit_hoodie', 'outfit_stripe', 'outfit_dress', 'outfit_hanbok', 'outfit_space'].every(k => G.SHOP[k].type === 'outfit'), 'shop sells 4 hairs + 5 outfits');
ok(!G.SHOP.hat_crown && !G.SHOP.cloth_blue, 'old hat/clothes removed');
{ const p = pl(3); p.coins = 500; ok(G.act(p, 'buy', 'hair_afro', 4 * M).msg && p.owned.includes('hair_afro'), 'buy afro');
  ok(typeof G.act(p, 'buy', 'hair_afro', 4 * M) === 'string', 'cannot buy twice');
  ok(typeof G.act(p, 'equip', 'outfit:hanbok', 4 * M) === 'string', 'cannot equip unowned');
  G.act(p, 'equip', 'hair:afro', 4 * M); ok(p.hair === 'afro', 'equip hair');
  G.act(p, 'equip', 'hair:base', 4 * M); ok(p.hair === 'base', 'base always available');
  G.act(p, 'equip', 'hair:afro', 4 * M); G.update(p, 60 * M); ok(p.pet.stage === 'child' && p.hair === 'afro' && G.snapOf(p).hair === 'afro', 'kept across stages, in snapshot');
  p.pet.stage = 'dead'; G.act(p, 'restart', null, 61 * M); ok(p.owned.includes('hair_afro') && p.hair === 'afro', 'purchases survive restart'); }
// migration of old saves
{ const o = { coins: 10, owned: ['hat_crown', 'cloth_blue'], wearing: { hat: 'hat_crown', clothes: 'cloth_blue' }, inventory: {}, pet: G.newPet(0, 6) };
  G.update(o, 1000); ok(o.coins === 140 && !o.owned.length && o.hair === 'base' && o.outfit === 'base' && !o.wearing, 'old items refunded, base outfit'); }
// traits: maxes
ok(G.maxOf(1, 'clean') === 150 && G.maxOf(2, 'happy') === 150 && G.maxOf(3, 'energy') === 150 && G.maxOf(5, 'energy') === 130 && G.maxOf(7, 'hunger') === 150 && G.maxOf(4, 'hunger') === 100, 'stat maxes');
{ const p = pl(1); G.act(p, 'wash', null, 4 * M); ok(p.pet.stats.clean === 150, '깔끔쟁이 wash to 150'); ok(G.priceOf(p, 'medicine') === 13, 'medicine half price'); }
{ const p = pl(7); p.pet.stats.hunger = 140; G.act(p, 'feed', null, 4 * M); ok(p.pet.stats.hunger === 150, '먹보 hunger up to 150'); }
{ const p = pl(3); p.pet.stats.energy = 90; p.pet.sleeping = true; G.update(p, 30 * M); ok(p.pet.stats.energy > 100, '잠꾸러기 sleeps above 100'); }
// coins: start x2 and cap x2 for 부자, default cap 9999
ok(pl(4).coins === 60 && pl(3).coins === 30, '부자 starts with double coins');
{ const a = pl(3), b = pl(4); G.addCoins(a, 99999); G.addCoins(b, 99999); ok(a.coins === 9999 && b.coins === 19998, 'coin cap 9999 / 19998'); }
// sickness: probabilistic, halved for char 1
{ const run = c => { let n = 0; for (let i = 0; i < 400; i++) { const p = pl(c); p.pet.stats.clean = 1; G.CFG.rand = () => ((i * 7919) % 1000) / 1000; G.update(p, 4 * M); if (p.pet.sick) n++; } G.CFG.rand = Math.random; return n; };
  const n1 = run(1), n3 = run(3); ok(n3 > 50 && n1 < n3 * 0.7, `깔끔쟁이 sick less often (${n1} vs ${n3} of 400)`); }
{ const s = G.sanitizeSnap({ char: 2, stage: 'adult', stats: { happy: 999, hunger: 999 }, hair: 'afro', outfit: 'nope' }, 'n');
  ok(s.stats.happy === 150 && s.stats.hunger === 100, 'server clamps with trait max');
  ok(s.hair === 'afro' && s.outfit === 'base', 'hair/outfit sanitized'); }
ok(G.raidHpOf(5) === 130 && G.raidHpOf(6) === 160 && G.raidHpOf(1) === 100 && G.raidAtkOf(7) === 1.3, 'raid HP / attack traits');
// raid lobby: fighters get trait HP and cheer once
const { RaidLobby } = require('../raid');
const io = { to: () => ({ emit() {} }) }, so = id => ({ id, user: { id }, join() {}, leave() {}, emit() {} });
const lob = new RaidLobby(io, () => {}, 'r');
const mk = (sid, char) => lob.join(so(sid), { nickname: sid, stage: 'adult', char, id: sid });
mk('a', 2); mk('b', 6); mk('c', 7); mk('d', 2); lob.start('a');
const F = Object.fromEntries(lob.fighters.map(f => [f.sid, f]));
ok(F.b.mhp === 160 && F.b.hp === 160 && F.a.mhp === 100, 'raid HP from traits');
ok(Math.abs(F.c.pow - 2.2 * 1.3 * 1.1) < 1e-9 && Math.abs(F.a.pow - 2.2 * 1.1) < 1e-9, '먹보 x1.3, cheer +10% applied once');
clearInterval(lob.timer); clearInterval(lob.autoTimer); process.exit(0);
