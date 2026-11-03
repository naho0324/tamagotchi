// Clearability: a perfect-aim bot plays EVERY map (unlimited lives, normal items, that stage's ball speed) and must clear it
// (up to 2 tries x 15 game-minutes, different seeds). Also prints time-to-clear per stage band. Usage: node test/breakout_maps_verify.js
const { BreakoutLobby, MAPS, KIND, mapFor } = require('../breakout'); const aim = require('./bk_bot');
const io = { to: () => ({ emit() {} }) }, CAP = 30 * 60 * 15, res = [];
const stageOf = i => { for (let l = 1; l <= 50; l++) if (mapFor(l, 0.999) >= i) return l; return 50; };
function play(i, seed) { const L = new BreakoutLobby(io, () => {}); let sd = seed; L.rand = () => (sd = (sd * 1103515245 + 12345) % 2147483648) / 2147483648;
  L.join({ id: 'a', user: { id: 'a' }, join() {}, leave() {}, emit() {} }, { nickname: 'bot' }); L.start(); clearInterval(L.timer);
  const lv = L.level = stageOf(i); L.cleared = 0; L.bricks = MAPS[i].join('').split('').map(ch => ch === '#' ? 9 : ch === '.' ? 0 : +ch); L.balls = [L.serve(L.paddles[0])];
  let n = 0; while (L.level === lv && L.state === 'playing' && n < CAP) { L.lives = 3; aim(L, 'a', n); L.step(); n++; }
  const left = L.level === lv && !L.cleared ? L.bricks.filter(v => v && v < 9).length : 0; clearInterval(L.timer); return { i, kind: KIND[i], stage: lv, ok: L.level !== lv || L.cleared > 0, s: Math.round(n * 0.033), left }; }
for (let i = 0; i < MAPS.length; i++) { let r = play(i, 7 + i); if (!r.ok) { console.log('retry', i, r.kind, 'left', r.left); r = play(i, 1000 + i); }
  if (!r.ok) console.log('NOT CLEARED:', i, r.kind, 'left', r.left, '\n' + MAPS[i].join('\n')); res.push(r); }
const band = (a, b) => { const t = res.filter(x => x.stage >= a && x.stage <= b).map(x => x.s).sort((x, y) => x - y); return `stages ${a}-${b}: median ${t[t.length >> 1]}s, max ${t[t.length - 1]}s`; };
for (const [a, b] of [[1, 10], [11, 20], [21, 30], [31, 40], [41, 50]]) console.log(band(a, b));
const bad = res.filter(x => !x.ok); console.log(bad.length ? `FAIL ${bad.length} maps not cleared` : 'ok all 200 maps cleared by perfect-aim bot'); process.exit(bad.length ? 1 : 0);
