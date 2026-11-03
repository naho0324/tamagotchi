// Pacing sim: bots play full solo games server-side (no network). Usage: node test/breakout_sim.js [games] [skill 0..1]
const { BreakoutLobby, MAPS } = require('../breakout');
const games = +process.argv[2] || 5, skill = process.argv[3] === undefined ? 1 : +process.argv[3];
const aim = require('./bk_bot'); const io = { to: () => ({ emit() {} }) }, out = [];
for (let g = 0; g < games; g++) { let res; const L = new BreakoutLobby(io, r => (res = r));
  L.join({ id: 'a', user: { id: 'a' }, join() {}, leave() {}, emit() {} }, { nickname: 'bot' }); L.start(); clearInterval(L.timer);
  const times = []; let last = 0, lv = L.level, n = 0, err = 0;
  while (L.state === 'playing' && n < 30 * 60 * 60) { // safety: 60 min
    if (n % 15 === 0) err = (Math.random() - 0.5) * 2 * (1 - skill) * 70; // imperfect aim for lower skill
    aim(L, 'a', n, err); L.step(); n++;
    if (L.level !== lv) { times.push(Math.round((n - last) * 0.033)); last = n; lv = L.level; } }
  if (!res) { console.log('STUCK lv', L.level, 'map', L.mapIdx, MAPS[L.mapIdx].join(' '), 'left', L.bricks.map((v, i) => v && v < 9 ? i : -1).filter(i => i >= 0).join(',')); L.end(); }
  out.push({ stages: res[0].levels, coins: res[0].coins, mins: +(n * 0.033 / 60).toFixed(1), perStage: times }); }
for (const o of out) console.log(`stages ${o.stages} coins ${o.coins} total ${o.mins}min  s/stage: ${o.perStage.join(' ')}`);
