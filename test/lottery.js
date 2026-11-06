// v1.11 긁는 복권: cheaper than 뽑기, coins/consumables only, pity on claim, no cosmetics
const assert = require('assert'); const G = require('../game.js'); const fs = require('fs');
const now = Date.now(), MIN = 60000;
const alive = () => { const p = G.newPlayer('l', 'l', now, 2); p.pet.stage = 'child'; p.pet.hatchedAt = now - 15 * MIN; p.pet.lastUpdate = now; p.coins = 500; G.migrate(p); return p; };
const rndFor = id => { const prizes = G.LOTTERY.prizes, total = prizes.reduce((s, p) => s + p.w, 0); let acc = 0;
  for (const p of prizes) { if (p.id === id) return (acc + p.w / 2) / total; acc += p.w; } throw new Error(id); };
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const valueOf = c => c.item ? G.SHOP[c.item].price * c.n : c.coins;

assert.strictEqual(G.SHOP.ticket.name, '긁는 복권');
assert.strictEqual(G.SHOP.ticket.type, 'consumable');
assert.ok(!G.SHOP.ticket.gacha);
assert.strictEqual(G.SHOP.ticket.price, G.LOTTERY.cost);
assert.ok(G.LOTTERY.cost < G.GACHA.cost, 'ticket cheaper than one gacha pull');
assert.ok(G.CONSUMABLES.includes('ticket') && G.ITEM_FX.ticket);
assert.ok(fs.existsSync(`${__dirname}/../public/assets/items/ticket.png`));
assert.ok(!JSON.stringify(G.GACHA).includes('ticket'));
const sumW = G.LOTTERY.prizes.reduce((s, p) => s + p.w, 0); assert.strictEqual(sumW, 100);
const coinW = G.LOTTERY.prizes.filter(p => p.coins && p.tier !== 'jackpot').reduce((s, p) => s + p.w, 0);
const itemW = G.LOTTERY.prizes.filter(p => p.item).reduce((s, p) => s + p.w, 0);
const jackW = G.LOTTERY.jackpots.reduce((s, p) => s + p.w, 0);
assert.ok(coinW >= 60, 'mostly small coin wins ' + coinW);
assert.ok(itemW >= 8 && itemW <= 30, 'occasional consumable ' + itemW);
assert.ok(jackW >= 1 && jackW <= 5, 'rare jackpot ' + jackW);
for (const pr of G.LOTTERY.prizes) {
  assert.ok(Number.isInteger(pr.w) && pr.w > 0, pr.id);
  if (pr.item) { assert.strictEqual(G.SHOP[pr.item].type, 'consumable'); assert.notStrictEqual(pr.item, 'ticket'); assert.ok(!pr.coins); }
  else assert.ok(pr.coins > 0);
  assert.ok(pr.tier !== 'jackpot' || pr.coins >= G.LOTTERY.cost * 3);
  assert.ok(!['hair', 'outfit', 'acc'].includes(G.SHOP[pr.item] && G.SHOP[pr.item].type));
}
const fresh = G.newPlayer('n', 'n', now, 1); assert.strictEqual(fresh.lotteryPity, 0); assert.strictEqual(fresh.lotteryPending, null);

let p = alive();
assert.strictEqual(G.act(p, 'buy', 'nope', now), '없는 상품');
p.coins = G.LOTTERY.cost - 1; const t0 = p.inventory.ticket;
assert.strictEqual(G.act(p, 'buy', 'ticket', now), '코인이 부족해요');
assert.strictEqual(p.inventory.ticket, t0); assert.strictEqual(p.coins, G.LOTTERY.cost - 1);
p.coins = G.LOTTERY.cost * 2;
assert.strictEqual(G.act(p, 'buy', 'ticket', now).msg, '긁는 복권 구매 완료!');
G.act(p, 'buy', 'ticket', now);
assert.strictEqual(p.inventory.ticket, t0 + 2); assert.strictEqual(p.coins, 0);
assert.strictEqual(G.act(p, 'buy', 'ticket', now), '코인이 부족해요'); assert.strictEqual(p.inventory.ticket, t0 + 2);

// dead / egg: same as other shop actions — buying is allowed, using is not
p.coins = 100; p.pet.stage = 'dead';
assert.ok(G.act(p, 'buy', 'ticket', now).msg); assert.strictEqual(G.act(p, 'scratch', null, now), '사용할 수 없어요');
assert.strictEqual(p.lotteryPending, null);
const egg = G.newPlayer('e', 'e', now, 1); egg.coins = 100;
assert.ok(G.act(egg, 'buy', 'ticket', now).msg); assert.strictEqual(egg.pet.stage, 'egg');
assert.strictEqual(G.act(egg, 'scratch', null, now), '사용할 수 없어요'); assert.strictEqual(egg.inventory.ticket, 1);

p = alive(); p.inventory.ticket = 1; p.lotteryPending = null;
assert.strictEqual(G.act(p, 'use', 'ticket', now), '긁기 버튼으로 열어주세요');
assert.strictEqual(p.inventory.ticket, 1); assert.strictEqual(p.lotteryPending, null);
assert.strictEqual(G.act(p, 'scratch', null, now) && 0, 0); // clear the opened card below
G.act(p, 'scratchClaim', null, now);

p = alive(); p.inventory.ticket = 0; p.lotteryPending = null;
assert.strictEqual(G.act(p, 'scratch', null, now), '아이템이 없어요');
p.inventory.ticket = 3; p.coins = 80; const owned = p.owned.length;
const opened = G.act(p, 'scratch', () => 0, now);
assert.strictEqual(opened.prize.id, 'c8'); assert.strictEqual(opened.prize.name, '8코인'); assert.strictEqual(opened.resumed, false);
assert.strictEqual(p.inventory.ticket, 2); assert.strictEqual(p.coins, 80); assert.strictEqual(p.lotteryPity, 0); // pity waits for claim
assert.deepStrictEqual(p.lotteryPending, { id: 'c8' });
for (let i = 0; i < 5; i++) { const again = G.act(p, 'scratch', () => 0.99, now); assert.strictEqual(again.resumed, true); assert.strictEqual(again.prize.id, 'c8'); assert.strictEqual(again.msg, '이어서 긁어요'); }
assert.strictEqual(p.inventory.ticket, 2); assert.strictEqual(p.coins, 80);
let claimed = G.act(p, 'scratchClaim', null, now);
assert.strictEqual(claimed.msg, '8코인 당첨!'); assert.strictEqual(p.coins, 88); assert.strictEqual(p.lotteryPity, 1); assert.strictEqual(p.lotteryPending, null);
assert.strictEqual(G.act(p, 'scratchClaim', null, now), '확인할 복권이 없어요'); assert.strictEqual(p.coins, 88);
assert.strictEqual(p.owned.length, owned);

// sleeping is fine (the ticket isn't a pet action); hunger doesn't change when a snack is won
p.pet.sleeping = true; p.inventory.ticket = 1; const hunger = p.pet.stats.hunger, sn = p.inventory.snack;
const snack = G.act(p, 'scratch', () => rndFor('snack'), now);
assert.strictEqual(snack.prize.id, 'snack'); assert.strictEqual(snack.prize.name, '간식'); assert.strictEqual(p.pet.sleeping, true);
assert.strictEqual(p.inventory.snack, sn);
claimed = G.act(p, 'scratchClaim', null, now);
assert.strictEqual(claimed.msg, '간식 당첨! 가방에 넣었어요'); assert.strictEqual(p.inventory.snack, sn + 1); assert.strictEqual(p.pet.stats.hunger, hunger);
p.inventory.ticket = 1;
assert.strictEqual(G.act(p, 'scratch', () => rndFor('snack2'), now).prize.name, '간식 x2');
assert.strictEqual(G.act(p, 'scratchClaim', null, now).n, 2); assert.strictEqual(p.inventory.snack, sn + 3);

// natural jackpot + tampered save can't mint coins or clothes
p.inventory.ticket = 1; p.lotteryPity = 5; p.coins = 10;
const jack = G.act(p, 'scratch', () => rndFor('c150'), now);
assert.strictEqual(jack.prize.id, 'c150'); assert.strictEqual(jack.prize.jackpot, true); assert.strictEqual(p.lotteryPity, 5);
claimed = G.act(p, 'scratchClaim', null, now);
assert.strictEqual(claimed.msg, '대박!! 150코인 당첨!'); assert.strictEqual(p.coins, 160); assert.strictEqual(p.lotteryPity, 0);
p.lotteryPending = { id: 'c8', coins: 99999 }; p.coins = 10;
assert.strictEqual(G.act(p, 'scratchClaim', null, now).coins, 8); assert.strictEqual(p.coins, 18);
p.lotteryPending = { id: 'outfit_space', coins: 9999 };
assert.strictEqual(G.act(p, 'scratchClaim', null, now), '확인할 복권이 없어요');
assert.strictEqual(p.coins, 18); assert.ok(!p.owned.includes('outfit_space'));

// pity: 25th claim without a jackpot is a jackpot, even if the roll is the first (smallest) prize
p = alive(); p.inventory.ticket = 30; p.lotteryPity = 0; p.coins = 0; const ids = [];
for (let i = 1; i <= 24; i++) {
  const r = G.act(p, 'scratch', () => 0, now); assert.strictEqual(r.prize.id, 'c8'); assert.strictEqual(p.lotteryPity, i - 1);
  G.act(p, 'scratchClaim', null, now); assert.strictEqual(p.lotteryPity, i); ids.push(r.prize.id);
}
assert.strictEqual(G.act(p, 'scratch', () => 0, now).prize.id, 'c60');
assert.strictEqual(G.act(p, 'scratchClaim', null, now).msg, '대박!! 60코인 당첨!');
assert.strictEqual(p.lotteryPity, 0); assert.strictEqual(p.coins, 24 * 8 + 60);

// a pending card can still be finished after the pet dies; a new one cannot
p.inventory.ticket = 2; const mid = G.act(p, 'scratch', () => rndFor('c30'), now); assert.strictEqual(mid.prize.id, 'c30');
p.pet.stage = 'dead'; const back = G.act(p, 'scratch', () => 0, now);
assert.strictEqual(back.resumed, true); assert.strictEqual(back.prize.id, 'c30'); assert.strictEqual(p.inventory.ticket, 1);
const got = G.act(p, 'scratchClaim', null, now); assert.strictEqual(got.coins, 30);
p.lotteryPending = null; assert.strictEqual(G.act(p, 'scratch', null, now), '사용할 수 없어요'); assert.strictEqual(p.inventory.ticket, 1);
p.coins = 50; assert.ok(G.act(p, 'buy', 'ticket', now).msg); // dead pets can still shop

// coin cap clamps the grant
p = alive(); const cap = G.coinCap(p.pet.char); p.coins = cap - 10; p.lotteryPity = G.LOTTERY.pity - 1; p.inventory.ticket = 1;
assert.strictEqual(G.act(p, 'scratch', () => 0, now).prize.jackpot, true);
G.act(p, 'scratchClaim', null, now); assert.strictEqual(p.coins, cap); assert.strictEqual(p.lotteryPity, 0);

// old saves grow the new fields; bad values are dropped
const old = { id: 'o', nickname: 'o', coins: 5, inventory: { snack: 2, medicine: 1 }, owned: [], hair: 'base', outfit: 'base', pet: G.newPet(now, 3), wins: 0 };
G.migrate(old); assert.strictEqual(old.lotteryPity, 0); assert.strictEqual(old.lotteryPending, null); assert.strictEqual(old.inventory.ticket, 0);
const keep = alive(); keep.inventory.ticket = 4; keep.lotteryPity = 9; keep.lotteryPending = { id: 'meal', coins: 999 };
G.migrate(keep); assert.strictEqual(keep.inventory.ticket, 4); assert.strictEqual(keep.lotteryPity, 9); assert.deepStrictEqual(keep.lotteryPending, { id: 'meal' });
keep.lotteryPity = -3; keep.lotteryPending = { id: 'nope' }; keep.inventory.ticket = 2.2;
G.migrate(keep); assert.strictEqual(keep.lotteryPity, 0); assert.strictEqual(keep.lotteryPending, null); assert.strictEqual(keep.inventory.ticket, 0);
const legacy = { id: 'x', nickname: 'old', coins: 5, inventory: { snack: 0 }, owned: [], hair: 'base', outfit: 'base', pet: G.newPet(now, 3), wins: 0 };
G.update(legacy, now); assert.strictEqual(legacy.lotteryPity, 0); assert.strictEqual(legacy.inventory.ticket, 0); assert.strictEqual(legacy.lotteryPending, null);

// natural weights (pity reset each card) + a separate pity run whose EV stays under the ticket price
const dist = alive(), rnd = mulberry32(0x5c2a71), cnt = {}, N = 20000;
for (let i = 0; i < N; i++) { dist.inventory.ticket = 1; dist.lotteryPity = 0; dist.lotteryPending = null;
  const id = G.scratchOpen(dist, rnd).prize.id; G.scratchClaim(dist); cnt[id] = (cnt[id] || 0) + 1; }
assert.ok(Math.abs(cnt.c8 / N - 0.24) < 0.02, JSON.stringify(cnt));
assert.ok(Math.abs((cnt.c60 + cnt.c150) / N - 0.02) < 0.008, JSON.stringify(cnt));
assert.ok(Math.abs((cnt.snack + cnt.snack2 + cnt.soap + cnt.med + cnt.meal + cnt.drink) / N - itemW / 100) < 0.02);
const sim = alive(); sim.lotteryPity = 0; const rnd2 = mulberry32(0x11c0ffee); let value = 0, jacks = 0; const M = 30000;
for (let i = 0; i < M; i++) { sim.inventory.ticket = 1; const view = G.scratchOpen(sim, rnd2); const c = G.scratchClaim(sim); value += valueOf(c); if (c.jackpot) jacks++; assert.strictEqual(c.id, view.prize.id); }
const ev = value / M;
assert.ok(ev > G.LOTTERY.cost * 0.6 && ev < G.LOTTERY.cost, `EV ${ev} should be a sink under ${G.LOTTERY.cost}`);
assert.ok(jacks / M > 0.02 && jacks / M < 0.12, 'pity lifts jackpots without flooding them ' + jacks / M);
assert.strictEqual(sim.owned.length, 0);
console.log('lottery ok', JSON.stringify({ ev: +ev.toFixed(2), rtp: +(ev / G.LOTTERY.cost).toFixed(3), jack: +(jacks / M).toFixed(3), cnt }));
