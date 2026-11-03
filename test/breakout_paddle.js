// 벽돌부수기 paddle collider == drawn paddle (bug v1.3 '발판 범위가 안맞아'). Unit-level, no server.
// Drawn paddle (client): rect from x - w/2 - 2 to x + w/2 + 2 (incl. outline) at server x/w from bk:state. Ball drawn as a 2R square.
const { BreakoutLobby } = require('../breakout');
const ok = (c, m) => { if (!c) { console.error('FAIL', m); process.exit(1); } console.log('ok', m); };
const io = { to: () => ({ emit() {} }) }, sock = id => ({ id, user: { id }, join() {}, leave() {}, emit() {} });
const R = 5, PY = 296;
function game(n) { const L = new BreakoutLobby(io, () => {}); L.rand = () => 0.5; for (let i = 0; i < n; i++) L.join(sock('s' + i), { nickname: 'p' + i }); L.start(); clearInterval(L.timer); L.bricks.fill(0); L.bricks[0] = 1; return L; }
// drop one ball straight down at x onto paddle p; return true if it bounced
function drop(L, p, x) { const b = { x, y: PY - 40, vx: 0, vy: 6, sp: 6, owner: p.sid, wait: 0 }; L.balls = [b]; L.lives = 3; L.fx = { slow: 0, fast: 0 };
  for (let i = 0; i < 12; i++) { L.step(); if (L.state !== 'playing' || !L.balls.includes(b)) return false; if (b.vy < 0) return true; } return false; }
function edges(L, p, label) { const half = p.w / 2 + 2 + R; // ball edge touches drawn outline
  ok(drop(L, p, p.x), `${label}: centre bounces`);
  ok(drop(L, p, p.x + half - 0.5) && drop(L, p, p.x - half + 0.5), `${label}: bounces right at both drawn edges (w=${p.w})`);
  ok(!drop(L, p, p.x + half + 1.5) && !drop(L, p, p.x - half - 1.5), `${label}: misses just outside the drawn paddle`); }
const freeze = L => L.paddles.forEach(p => { p.tx = p.x; });
let L = game(1); freeze(L); edges(L, L.paddles[0], 'solo');
L = game(1); L.paddles[0].fx.wide = 300; L.step(); freeze(L); L.lives = 3; edges(L, L.paddles[0], 'solo + 패들 확장'); ok(L.paddles[0].w === 126, 'wide width synced in state (126)');
L = game(1); L.paddles[0].fx.shrink = 300; L.step(); freeze(L); L.lives = 3; edges(L, L.paddles[0], 'solo + 패들 축소');
L = game(2); freeze(L); edges(L, L.paddles[0], '2p left'); L.lives = 3; edges(L, L.paddles[1], '2p right');
// 2p near the centre line: right paddle pushed to its lowest x
L = game(2); const q = L.paddles[1]; L.input(q.sid, 0); for (let i = 0; i < 30; i++) L.step(); ok(q.x === q.lo + q.w / 2, `2p right paddle clamps at its half (${q.x})`); freeze(L); L.lives = 3; edges(L, q, '2p right at centre line');
// state carries exactly the collider x/w the client draws
const ev = []; L = new BreakoutLobby({ to: () => ({ emit: (e, d) => ev.push([e, d]) }) }, () => {}); L.join(sock('a'), { nickname: 'a' }); L.start(); clearInterval(L.timer);
L.paddles[0].fx.wide = 300; L.input('a', 100); L.step(); const st = ev.filter(e => e[0] === 'bk:state').pop()[1].p[0], pd = L.paddles[0];
ok(st[1] === Math.round(pd.x) && st[3] === pd.w, 'bk:state p = [sid, x, gone, w] matches the server collider');
// client draw position: never more than one server step (14px) from the server paddle
const fs = require('fs'), src = fs.readFileSync(__dirname + '/../public/app.js', 'utf8');
ok(/function bkDrawX/.test(src) && !/BK\.px/.test(src), 'client draws own paddle from server x (no free-running local prediction)');
ok(/function bkSend/.test(src) && /BK\.tx === BK\.lastTx/.test(src), 'client always sends the final paddle target (no dropped last move)');
process.exit(0);
