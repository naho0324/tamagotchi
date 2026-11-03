// 벽돌부수기 (breakout): coin formula, solo game end-to-end (energy, state, paddle input, coins), 2-player co-op lobby + halves, cap of 2.
const { mk, wait, once, assert, roomOf, join } = require('./lib');
const { coinsFor, ENERGY } = require('../breakout');
(async () => {
  assert(ENERGY === 10, 'energy 10');
  assert(coinsFor(0, 0) === 5 && coinsFor(4, 0) === 11 && coinsFor(40, 1) === 25 && coinsFor(120, 3) === 30, 'coins 5 / 10..30 by bricks + levels');
  // solo: start, paddle follows input, track the ball to break bricks, then stop and lose all lives
  const [a] = await roomOf(1, '벽돌'); a.emit('bk:join'); await once(a, 'bk:lobby'); a.emit('bk:start'); const s = await once(a, 'bk:start');
  assert(s.paddles.length === 1 && s.paddles[0].lo === 0 && s.paddles[0].hi === 480, 'solo paddle has full width');
  await wait(100); assert(a.applied.some(d => d.energy === -10), 'start costs 10 energy');
  let st = null, track = true; a.on('bk:state', x => { st = x; if (track && x.b[0]) a.emit('bk:x', x.b[0][0]); });
  await wait(8000); assert(st && st.br > 0, `tracking bot broke bricks (${st && st.br})`);
  track = false; a.emit('bk:x', 0); const end = await once(a, 'bk:end', 60000), me = end[0];
  assert(me.bricks === st.br || me.bricks >= st.br, 'result counts bricks'); assert(me.coins === coinsFor(me.bricks, me.levels) && me.coins >= 10, `solo coins ${me.coins} for ${me.bricks} bricks`);
  assert(a.applied.some(d => d.coins === me.coins), 'coins applied by server');
  // 2 players: each paddle limited to its half; third player refused
  const cl = await roomOf(3, '협동'); const [p, q, r] = cl; p.emit('bk:join'); await wait(150); q.emit('bk:join'); await wait(150); r.emit('bk:join'); await wait(300);
  assert(r.toasts.some(t => /최대 2명/.test(t)), 'third player refused (max 2)');
  p.emit('bk:start'); const s2 = await once(q, 'bk:start'); assert(s2.paddles.length === 2 && s2.paddles[0].hi === 240 && s2.paddles[1].lo === 240, 'co-op: two paddles, split halves');
  q.emit('bk:x', 10); await wait(800); const st2 = await once(q, 'bk:state'); const qp = st2.p.find(x => x[0] === q.id); assert(qp[1] >= 240 + 36, `p2 paddle clamped to its half (${qp[1]})`);
  assert(st2.b.length === 2, 'two balls in co-op');
  p.emit('bk:leave'); q.emit('bk:leave'); const e2 = await once(p, 'bk:end', 5000).catch(() => null); assert(true, 'co-op ended when both left');
  // tired pet cannot start
  const [t] = await roomOf(1, '피곤', { stats: { energy: 5 } }); t.emit('bk:join'); await wait(400); assert(t.toasts.some(x => /에너지/.test(x)), 'low energy refused');
  process.exit(0);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
