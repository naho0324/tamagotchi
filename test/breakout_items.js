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
L = game(1, () => 0.05); L.bricks[0] = 1; L.hit(0); ok(L.items.length === 2, 'low roll drops (a pair when the double roll hits too)');
// v1.3.2 rates, statistically (seeded): drop ~25%, ~1.2 items per drop, debuffs 40-45%, +1 life rare
{ const { WEIGHTS, DROP, DOUBLE, pickItem } = require('../breakout'); let sd = 7; const rnd = () => { let t = sd += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; // mulberry32
  const N = 40000, bad = ['shrink', 'fast', 'rev', 'blink'], cnt = {}; let drops = 0, items = 0; L = game(1, rnd);
  for (let i = 0; i < N; i++) { L.items = []; L.bricks[0] = 1; L.hit(0); if (L.items.length) drops++; items += L.items.length; for (const it of L.items) cnt[it.kind] = (cnt[it.kind] || 0) + 1; }
  const f = k => (cnt[k] || 0) / items, debuff = bad.reduce((a, k) => a + f(k), 0);
  console.log(`  drop ${(drops / N * 100).toFixed(1)}%  items/brick ${(items / N).toFixed(3)}  debuffs ${(debuff * 100).toFixed(1)}%  life ${(f('life') * 100).toFixed(1)}%`, Object.fromEntries(Object.keys(cnt).map(k => [k, (f(k) * 100).toFixed(1) + '%'])));
  ok(DROP === 0.25 && Math.abs(drops / N - 0.25) < 0.01, 'drop rate ~25%'); ok(Math.abs(items / drops - (1 + DOUBLE)) < 0.02, 'sometimes 2 items at once (~20% of drops)');
  ok(debuff > 0.40 && debuff < 0.45, 'debuffs 40-45% of items'); ok(f('life') < 0.07 && WEIGHTS.every(([k, w]) => k === 'life' || w > 2), '+1 life is the rarest');
  ok(WEIGHTS.every(([k]) => f(k) > 0.03), 'every item kind actually drops'); ok(pickItem(0) === 'wide' && pickItem(0.9999) === 'blink', 'pickItem covers the full range'); }
// several items falling at once are each catchable
L = game(); { const p = L.paddles[0]; L.items.push({ x: p.x - 9, y: 280, kind: 'wide' }, { x: p.x + 9, y: 280, kind: 'laser' }, { x: p.x, y: 250, kind: 'rev' }); for (let i = 0; i < 30; i++) L.step();
  ok(p.fx.wide > 0 && p.fx.laser > 0 && p.fx.rev > 0 && !L.items.length, 'multiple falling items all caught'); }
// new debuffs: reverse (per paddle, 6s) and blink (shared, 6s), both sent in state
L = game(2); { const [a, b] = L.paddles; L.items.push({ x: a.x, y: 285, kind: 'rev' }, { x: b.x, y: 285, kind: 'blink' }); for (let i = 0; i < 6; i++) L.step();
  const st = ev.filter(e => e[0] === 'bk:state').pop()[1]; ok(a.fx.rev > 0 && !b.fx.rev && st.p[0][7] === 6 && st.p[1][7] === 0, 'rev: only catcher, 6s in state p[7]');
  ok(L.fx.blink > 0 && st.fx[2] === 6, 'blink: shared 6s in state fx[2]'); for (let i = 0; i < 185; i++) { L.step(); L.balls.forEach(q => { q.y = 200; q.vy = -Math.abs(q.vy); }); } ok(!a.fx.rev && !L.fx.blink, 'rev/blink wear off'); }
{ const src = require('fs').readFileSync(__dirname + '/../public/app.js', 'utf8'); ok(/x = p\.lo \+ p\.hi - x/.test(src) && /bkRev\(\) \? -bkHold/.test(src) && /hide && !w/.test(src) && /rev: \[/.test(src) && /blink: \[/.test(src), 'client: mirrored pointer/keys, blinking ball, new icons'); }
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
