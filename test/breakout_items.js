// 벽돌부수기 items + hard maps, unit-level (fake io, manual ticks, seeded rand). No server needed.
const { BreakoutLobby, MAPS, difficulty, mapFor, ITEMS, STEEL, coinsFor } = require('../breakout');
const ok = (c, m) => { if (!c) { console.error('FAIL', m); process.exit(1); } console.log('ok', m); };
const ev = []; const io = { to: () => ({ emit: (e, d) => ev.push([e, d]) }) };
const sock = id => ({ id, user: { id }, join() {}, leave() {}, emit() {} });
function game(n = 1, rand = Math.random) { const L = new BreakoutLobby(io, r => (L.res = r)); L.rand = rand;
  for (let i = 0; i < n; i++) L.join(sock('s' + i), { nickname: 'p' + i }); L.start(); clearInterval(L.timer); return L; }
// maps
const d = MAPS.map(difficulty); ok(MAPS.length === 200 && new Set(MAPS.map(m => m.join('/'))).size === 200, '200 distinct maps');
ok(d.every((v, i) => !i || v >= d[i - 1]), 'maps sorted easy -> hard');
ok(mapFor(1, 0.999) < 4 && mapFor(50, 0) >= 196 && mapFor(25, 0.5) >= 96 && mapFor(25, 0.5) < 100, 'stage N uses difficulty band N (4 maps each)');
ok(Math.max(...[0, 1, 2, 3].map(i => d[i])) < d[100], 'stage 1 never gets a hard map');
const { reachable, KIND, TIER } = require('../breakout_maps');
ok(MAPS.every(m => m.length === 10 && m.every(r => r.length === 10)), 'maps are 10x10');
ok(MAPS.every(m => { const s = reachable(m.map(r => [...r])); return m.every((row, r) => [...row].every((ch, c) => !/[123]/.test(ch) || s[r][c])); }), 'every brick reachable (no sealed cages)');
ok(TIER.every((t, i) => !i || t >= TIER[i - 1]), 'tiers in order: easy -> shapes -> structures');
ok(MAPS.slice(0, 40).every(m => { const n = (m.join('').match(/[123]/g) || []).length; return n >= 10 && n <= 30; }), 'stages 1-10: 10-30 bricks');
ok(['cage', 'shell', 'maze', 'pockets'].every(k => KIND.slice(140).includes(k)) && ['pyramid', 'heart', 'letters', 'checker'].every(k => KIND.slice(60, 140).includes(k)), 'mid = shapes, late = structures');
ok(MAPS.slice(100).some(m => m.join('').includes('3')) && MAPS.slice(100).some(m => m.join('').includes('#')), 'harder maps have 3-hit and steel bricks');
// steel: indestructible, not needed to clear
let L = game(); const si = L.bricks.findIndex(v => v === STEEL); L.bricks.fill(0); if (si >= 0) L.bricks[si] = STEEL; L.bricks[0] = 1;
L.hit(si >= 0 ? si : 0); if (si >= 0) ok(L.bricks[si] === STEEL, 'steel survives hits');
L.hit(0); L.step(); ok(L.cleared === 1 && L.level === 2, 'level clears with only steel left');
// multi-hit
L.bricks[1] = 3; L.hit(1); L.hit(1); ok(L.bricks[1] === 1, '3-hit brick shows remaining hp'); L.hit(1); ok(L.bricks[1] === 0, 'breaks on 3rd hit');
// drops: rand < 0.13 drops
L = game(1, () => 0.05); L.bricks[0] = 1; L.hit(0); ok(L.items.length === 1, 'broken brick drops item at low roll');
L = game(1, () => 0.5); L.bricks[0] = 1; L.hit(0); ok(L.items.length === 0, 'no drop at high roll');
// catch each item
const catchIt = (L, kind) => { const p = L.paddles[0]; L.items.push({ x: p.x, y: 280, kind }); for (let i = 0; i < 12; i++) L.step(); };
L = game(); L.balls.forEach(b => b.wait = 0); const w0 = L.paddles[0].w; catchIt(L, 'wide'); ok(L.paddles[0].w > w0 && ev.some(e => e[0] === 'bk:item' && e[1].label === ITEMS.wide), 'wide widens + label');
catchIt(L, 'shrink'); ok(L.paddles[0].w < w0, 'shrink shrinks (cancels wide)');
for (let i = 0; i < 310; i++) { L.step(); L.balls.forEach(b => { b.y = 200; b.vy = -Math.abs(b.vy); }); } ok(L.paddles[0].w === w0, 'timed effect ends after ~10s');
L = game(); L.balls.forEach(b => b.wait = 0); catchIt(L, 'multi'); ok(L.balls.length === 3, 'multi splits into 3');
const lives = L.lives; L.balls[1].y = 400; L.balls[2].y = 400; L.step(); ok(L.lives === lives && L.balls.length >= 1, 'losing extra balls costs no life');
L = game(); catchIt(L, 'life'); ok(L.lives === 4, '+1 life');
L = game(); L.balls.forEach(b => b.wait = 0); const s0 = L.speed(); catchIt(L, 'slow'); ok(L.speed() < s0, 'slow ball'); catchIt(L, 'fast'); ok(L.speed() > s0, 'fast ball (cancels slow)');
L = game(); catchIt(L, 'laser'); for (let i = 0; i < 20; i++) L.step(); ok(ev.filter(e => e[0] === 'bk:state').pop()[1].sh.length > 0 || L.broken > 0, 'laser fires shots');
// 2p: each player's paddle effects are separate
L = game(2); const [a, b] = L.paddles; L.items.push({ x: a.x, y: 285, kind: 'wide' }); for (let i = 0; i < 6; i++) L.step(); ok(a.w > b.w && a.x - a.w / 2 >= a.lo - 0.5 && a.x + a.w / 2 <= a.hi + 0.5, '2p: wide only on catcher, stays in its half');
ok(coinsFor(0) === 3 && coinsFor(10) === 33 && coinsFor(50) === 150, 'coins by stages cleared only');
L = game(); L.broken = 500; L.cleared = 2; L.end(); ok(L.res[0].coins === 9, 'bricks broken do not change coins');
L = game(); L.ticks = 30 * 600; L.step(); ok(L.state === 'playing', 'no overall time limit');
L = game(); L.lives = 1; L.balls.forEach(b => { b.wait = 0; b.y = 400; }); L.step(); ok(L.state === 'lobby', 'ends when lives run out');
ok(MAPS.slice(0, 40).every(m => !/[3#]/.test(m.join(''))), 'stages 1-10 maps: no steel/3-hit');
process.exit(0);
