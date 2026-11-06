// v1.12 교환 코드: coins/consumables (optional wardrobe), once per save, optional expiry
const assert = require('assert'); const G = require('../game.js');
const now = Date.now(), MIN = 60000;
const pl = (stage = 'child') => { const p = G.newPlayer('r', 'r', now, 2); p.pet.stage = stage; p.pet.hatchedAt = now - 15 * MIN; p.pet.lastUpdate = now; G.migrate(p); return p; };

assert.strictEqual(G.normCode('  welcome '), 'WELCOME');
assert.strictEqual(G.normCode('복권 선물'), '복권선물');
assert.ok(G.CODES.WELCOME && G.CODES.WELCOME.coins === 50 && G.CODES.WELCOME.items.snack === 2);
assert.deepStrictEqual(G.CODES['복권선물'].items, { ticket: 1 });

let p = pl();
assert.strictEqual(G.act(p, 'redeem', '   ', now), '코드를 입력해주세요');
assert.strictEqual(G.act(p, 'redeem', '없는코드', now), '없는 코드예요');
assert.strictEqual(p.coins, 30); assert.strictEqual(p.inventory.snack, 1); assert.deepStrictEqual(p.redeemed, []);

const ok = G.act(p, 'redeem', 'welcome', now);
assert.strictEqual(ok.msg, '선물 도착! 코인 50, 간식 x2');
assert.strictEqual(p.coins, 80); assert.strictEqual(p.inventory.snack, 3); assert.deepStrictEqual(p.redeemed, ['WELCOME']);
assert.strictEqual(G.act(p, 'redeem', 'WELCOME', now), '이미 사용한 코드예요');
assert.strictEqual(p.coins, 80); assert.strictEqual(p.inventory.snack, 3);
// spam
assert.strictEqual(G.act(p, 'redeem', 'welcome', now), '이미 사용한 코드예요');

const tix = G.act(p, 'redeem', '복권 선물', now);
assert.strictEqual(tix.msg, '선물 도착! 긁는 복권');
assert.strictEqual(p.inventory.ticket, 1);
assert.strictEqual(G.act(p, 'redeem', '복권선물', now), '이미 사용한 코드예요');
assert.strictEqual(p.inventory.ticket, 1);

// egg and dead can still redeem (a gift, not a pet action)
const egg = pl('egg'); egg.coins = 5;
assert.strictEqual(G.act(egg, 'redeem', 'WELCOME', now).msg, '선물 도착! 코인 50, 간식 x2');
assert.strictEqual(egg.coins, 55);
const dead = pl('dead');
assert.ok(G.act(dead, 'redeem', '복권선물', now).msg);
assert.strictEqual(dead.inventory.ticket, 1);

// restart keeps the used list, so a new egg can't claim the same code
p.pet.stage = 'dead';
G.act(p, 'restart', null, now);
assert.strictEqual(p.pet.stage, 'egg');
assert.ok(p.redeemed.includes('WELCOME'));
assert.strictEqual(G.act(p, 'redeem', 'WELCOME', now), '이미 사용한 코드예요');

// injected codes: expiry, perSave, wardrobe, bad rewards, coin cap
G.CODES.ONCE = { coins: 7, items: { soap: 1 }, owned: ['hair_pony'] };
G.CODES.TWICE = { coins: 3, perSave: 2 };
G.CODES.OLD = { coins: 100, expires: now - 1 };
G.CODES.SOON = { coins: 4, expires: now + 1000 };
G.CODES.EMPTY = { items: { nope: 3 } };
G.CODES.DUP = { owned: ['hair_pony'], coins: 1 };
const q = pl(); q.coins = 10;
const gift = G.act(q, 'redeem', 'once', now);
assert.strictEqual(gift.msg, '선물 도착! 코인 7, 거품비누, 포니테일');
assert.strictEqual(q.coins, 17); assert.strictEqual(q.inventory.soap, 1);
assert.ok(q.owned.includes('hair_pony')); assert.strictEqual(q.hair, 'base'); // gift does not auto-wear
assert.strictEqual(G.act(q, 'redeem', 'OLD', now), '만료된 코드예요');
assert.strictEqual(q.coins, 17);
assert.strictEqual(G.act(q, 'redeem', 'SOON', now).msg, '선물 도착! 코인 4');
assert.strictEqual(G.act(q, 'redeem', 'EMPTY', now), '받을 수 있는 선물이 없어요');
assert.ok(!q.redeemed.includes('EMPTY'));
assert.strictEqual(G.act(q, 'redeem', 'TWICE', now).msg, '선물 도착! 코인 3');
assert.strictEqual(G.act(q, 'redeem', 'TWICE', now).msg, '선물 도착! 코인 3');
assert.strictEqual(G.act(q, 'redeem', 'TWICE', now), '이미 사용한 코드예요');
assert.strictEqual(q.redeemed.filter(k => k === 'TWICE').length, 2);
const dup = G.act(q, 'redeem', 'DUP', now);
assert.strictEqual(dup.msg, '선물 도착! 코인 1, 포니테일 (이미 있어요)');
assert.strictEqual(q.owned.filter(k => k === 'hair_pony').length, 1);

const rich = pl(); rich.coins = G.coinCap(rich.pet.char) - 5;
G.CODES.BIG = { coins: 100 };
G.act(rich, 'redeem', 'BIG', now);
assert.strictEqual(rich.coins, G.coinCap(rich.pet.char));
assert.ok(rich.redeemed.includes('BIG'));

// old saves grow redeemed: []
const old = { id: 'o', nickname: 'o', coins: 5, inventory: { snack: 0 }, owned: [], hair: 'base', outfit: 'base', pet: G.newPet(now, 3), wins: 0 };
G.migrate(old); assert.deepStrictEqual(old.redeemed, []);
old.redeemed = ['WELCOME', 3, '', 'x'.repeat(30), '복권선물'];
G.migrate(old); assert.deepStrictEqual(old.redeemed, ['WELCOME', '복권선물']);
assert.strictEqual(G.newPlayer('n', 'n', now, 1).redeemed.length, 0);

for (const k of ['ONCE', 'TWICE', 'OLD', 'SOON', 'EMPTY', 'DUP', 'BIG']) delete G.CODES[k];
console.log('redeem ok');
