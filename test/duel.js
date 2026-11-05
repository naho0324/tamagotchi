// 1:1 내기 대결: 폭탄 넘기기 + 그림 그리기 대결 (server logic, fake io + fake clock-free short timers)
const D = require('../duel'); let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } };
const sent = []; const io = { to: r => ({ emit: (ev, d) => sent.push({ r, ev, d }) }) };
const sockets = {}; const mk = id => (sockets[id] = { id, join() {}, leave() {} });
const W = {}; const hooks = { gate: (sid, st) => (W[sid] || 0) < st ? '코인이 부족해요' : null,
  charge: (sid, st) => { W[sid] -= st; }, pay: (sid, c) => { W[sid] += c; }, refund: (sid, c) => { W[sid] += c; } };
const last = ev => sent.filter(s => s.ev === ev).pop();
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  ok(JSON.stringify(D.STAKES) === '[10,30,50,100]' && D.FEE === 0.1 && D.payout(100) === 180 && D.payout(10) === 18, 'stakes/fee');
  ok(D.seqLen(0) === 3 && D.seqLen(4) === 4 && D.seqLen(99) === 5, 'seq grows 3->5');
  // bomb: stake gate, lock, pass, explode
  let L = new D.DuelLobby(io, 'r', hooks, { fuseMin: 1500, fuseMax: 1500, minHold: 0, lock: 50 });
  const a = mk('a'), b = mk('b'); W.a = 20; W.b = 5;
  ok(L.create(a, { nickname: 'A' }, 7) === '판돈을 골라주세요', 'bad stake');
  ok(L.create(a, { nickname: 'A' }, 10) === null && L.tables.length === 1, 'table open');
  ok(L.join(b, { nickname: 'B' }, L.tables[0].id) === '코인이 부족해요' && W.b === 5, 'joiner needs stake');
  W.b = 50; ok(L.join(b, { nickname: 'B' }, L.tables[0].id) === null && W.a === 10 && W.b === 40 && L.game.pot === 20, 'both stakes locked');
  const g = L.game, h0 = g.holder, hs = g.p[h0].sid, os = g.p[1 - h0].sid;
  L.key(os, 'up'); ok(g.holder === h0, 'non-holder input ignored');
  const wrong = ['up', 'down', 'left', 'right'].find(d => d !== g.seq[0]); L.key(hs, wrong); ok(g.idx === 0 && g.lockUntil > Date.now(), 'wrong arrow -> reset + lock');
  L.key(hs, g.seq[0]); ok(g.idx === 0, 'locked input ignored'); await sleep(60);
  for (const d of g.seq.slice()) L.key(hs, d); ok(g.holder === 1 - h0 && g.passes === 1 && g.seq.length === 3, 'sequence passes bomb');
  await sleep(1600); const e = last('b:end').d;
  ok(e.loser === os && e.winner === hs && e.prize === 18 && e.fee === 2 && W[hs] === 10 + 18 - (hs === 'a' ? 0 : 0) + (hs === 'b' ? 30 : 0), 'holder at explosion loses; winner +90% pot');
  ok(!L.game, 'game cleared');
  // fuse randomness within range
  const L2 = new D.DuelLobby(io, 'r2', hooks); const fz = new Set(); W.a = W.b = 9999;
  for (let i = 0; i < 20; i++) { L2.create(a, { nickname: 'A' }, 10); L2.join(b, { nickname: 'B' }, L2.tables[0].id); fz.add(L2.game.fuse); ok(L2.game.fuse >= 30000 && L2.game.fuse <= 60000, 'fuse 30-60s'); L2.leave('a'); }
  ok(fz.size > 10, 'fuse varies');
  // disconnect -> refund both
  W.a = 100; W.b = 100; L2.create(a, { nickname: 'A' }, 50); L2.join(b, { nickname: 'B' }, L2.tables[0].id); ok(W.a === 50 && W.b === 50, 'locked 50');
  L2.leave('b'); ok(W.a === 100 && W.b === 100 && last('b:end').d.draw, 'leave mid-game -> refund + draw');
  // draw duel
  const L3 = new D.DuelLobby(io, 'r3', hooks, { drawMs: 300, guessMs: 300 }); W.a = W.b = 100;
  ok(L3.create(a, { nickname: 'A' }, 30, 'draw') === null && L3.tables[0].mode === 'draw', 'draw table');
  L3.join(b, { nickname: 'B' }, L3.tables[0].id); const G3 = L3.game; ok(G3.mode === 'draw' && W.a === 70 && W.b === 70, 'draw stakes locked');
  const starts = sent.filter(s => s.ev === 'd:start').slice(-2); ok(starts.length === 2 && starts[0].r !== starts[1].r && G3.p[0].word !== G3.p[1].word, 'secret prompts sent privately, different words');
  L3.pic('a', '1'.repeat(256)); ok(G3.phase === 'draw', 'waits for both'); L3.pic('b', 'x9'.repeat(200)); ok(G3.phase === 'guess' && /^[0-7]{256}$/.test(G3.p[1].pic) && G3.p[1].pic[1] === '0', 'pics sanitized -> guess');
  const ch = i => G3.p[i].choices, right = i => ch(i).indexOf(G3.p[1 - i].word), wrongI = i => ch(i).findIndex(w => w !== G3.p[1 - i].word);
  ok(ch(0).length === 4 && right(0) >= 0 && !ch(0).includes(G3.p[0].word), '4 choices incl. answer, not own word');
  L3.guess('a', right(0)); L3.guess('a', wrongI(0)); L3.guess('b', wrongI(1)); let de = last('d:end').d;
  ok(de.winner === 'a' && W.a === 70 + 54 && W.b === 70 && de.fee === 6, 'only-correct guesser wins 90%');
  // both wrong -> refund ; timeout with no guesses -> refund
  W.a = W.b = 100; L3.create(a, { nickname: 'A' }, 10, 'draw'); L3.join(b, { nickname: 'B' }, L3.tables[0].id); await sleep(700);
  de = last('d:end').d; ok(de.draw && W.a === 100 && W.b === 100, 'nobody guessed -> refund');
  // both right -> faster wins
  L3.create(a, { nickname: 'A' }, 10, 'draw'); L3.join(b, { nickname: 'B' }, L3.tables[0].id); const G4 = L3.game; L3.pic('a', ''); L3.pic('b', '');
  await sleep(20); L3.guess('b', G4.p[1].choices.indexOf(G4.p[0].word)); await sleep(20); L3.guess('a', G4.p[0].choices.indexOf(G4.p[1].word));
  ok(last('d:end').d.winner === 'b' && W.b === 108 && W.a === 90, 'both right -> faster guess wins');
  // one game at a time
  L3.create(a, { nickname: 'A' }, 10); L3.join(b, { nickname: 'B' }, L3.tables[0].id); const c = mk('c'); W.c = 100; L3.create(c, { nickname: 'C' }, 10); ok(L3.join(mk('d'), { nickname: 'D' }, L3.tables[0].id) === '다른 판이 진행 중이에요. 잠시 후 다시!', 'one game at a time'); L3.leave('a');
  console.log(fails ? `duel: ${fails} FAIL` : 'duel OK'); process.exit(fails ? 1 : 0);
})();
