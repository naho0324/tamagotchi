// 폭탄 넘기기 (v1.10): server-authoritative 1v1 wager. Both lock a stake; whoever holds the bomb when the hidden fuse
// runs out loses; winner takes 90% of the pot (10% fee burned). Leaving/disconnecting mid-match = loss (opponent takes 90%).
// Pass skill: the holder must type a short arrow sequence (3 -> 5 arrows as passes pile up); a wrong arrow resets
// with a fresh sequence and a short lockout. Inputs are checked on the server, so latency only costs time, never fairness.
const crypto = require('crypto');
const STAKES = [10, 30, 50, 100], FEE = 0.1, ENERGY = 10, DIRS = ['up', 'down', 'left', 'right'];
const CFG = { fuseMin: 30000, fuseMax: 60000, minHold: 800, lock: 700, tick: 250, drawMs: 40000, guessMs: 20000 };
// 그림 그리기 대결: each player gets their own secret prompt (if both had the same word, guessing would be free),
// draws on a 16x16 pixel grid, then sees the other's drawing and picks the word from 4 choices (one try).
// Exactly one right -> that player wins; both right -> the faster guess wins; both wrong -> refund.
const PROMPTS = ['사과', '고양이', '집', '자동차', '나무', '물고기', '해', '우산', '하트', '케이크', '꽃', '별', '달', '눈사람', '버섯', '배', '컵', '안경', '왕관', '로켓', '바나나', '오리', '시계', '열쇠'];
const GRID = 16, COLORS = 8, MODES = ['bomb', 'draw'];
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = rint(0, i); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const cleanPic = p => { p = String(p || ''); let o = ''; for (let i = 0; i < GRID * GRID; i++) { const c = p.charCodeAt(i) - 48; o += c >= 0 && c < COLORS ? String(c) : '0'; } return o; };
const payout = stake => Math.floor(stake * 2 * (1 - FEE));
const seqLen = passes => Math.min(5, 3 + Math.floor(passes / 4));
const rint = (a, b) => crypto.randomInt(a, b + 1); // fair CSPRNG, inclusive
class DuelLobby {
  constructor(io, room, hooks, cfg = {}) { this.io = io; this.room = room; this.h = hooks; this.cfg = { ...CFG, ...cfg }; this.tables = []; this.game = null; this.tid = 0; }
  lobby() { return { tables: this.tables.map(t => ({ id: t.id, mode: t.mode, stake: t.stake, host: t.look.nickname, hostSid: t.sid })), playing: !!this.game, mode: this.game && this.game.mode,
    players: this.game ? this.game.p.map(p => p.look.nickname) : [] }; }
  emitLobby() { this.io.to(this.room).emit('b:lobby', this.lobby()); }
  watch(socket) { socket.join(this.room); socket.emit('b:lobby', this.lobby()); }
  create(socket, look, stake, mode = 'bomb') {
    if (!MODES.includes(mode)) return '게임을 골라주세요'; stake = +stake; if (!STAKES.includes(stake)) return '판돈을 골라주세요';
    if (this.inGame(socket.id)) return '이미 게임 중이에요';
    const e = this.h.gate(socket.id, stake); if (e) return e;
    this.cancel(socket.id, true); this.tables.push({ id: ++this.tid, sid: socket.id, stake, look, mode }); socket.join(this.room); this.emitLobby(); return null; }
  cancel(sid, quiet) { const n = this.tables.length; this.tables = this.tables.filter(t => t.sid !== sid); if (!quiet && n !== this.tables.length) this.emitLobby(); }
  inGame(sid) { return this.game && this.game.p.some(p => p.sid === sid); }
  join(socket, look, id) {
    const t = this.tables.find(t => t.id === +id); if (!t) return '그 테이블이 없어졌어요';
    if (t.sid === socket.id) return '내가 만든 테이블이에요';
    if (this.game) return '다른 판이 진행 중이에요. 잠시 후 다시!';
    const e = this.h.gate(socket.id, t.stake); if (e) return e;
    const eh = this.h.gate(t.sid, t.stake); if (eh) { this.cancel(t.sid); return '상대가 지금 게임할 수 없어요'; }
    this.tables = this.tables.filter(x => x !== t && x.sid !== socket.id); socket.join(this.room);
    const p = [{ sid: t.sid, look: t.look }, { sid: socket.id, look }]; t.mode === 'draw' ? this.startDraw(p, t.stake) : this.start(p, t.stake); return null; }
  startDraw(p, stake) {
    for (const q of p) this.h.charge(q.sid, stake, ENERGY);
    const words = shuffle(PROMPTS.slice()); p.forEach((q, i) => { q.word = words[i]; q.pic = null; q.guess = null; });
    this.game = { mode: 'draw', p, stake, pot: stake * 2, phase: 'draw', t0: Date.now(), words };
    this.emitLobby();
    for (const q of p) this.io.to(q.sid).emit('d:start', { stake, prize: payout(stake), word: q.word, grid: GRID, ms: this.cfg.drawMs, players: p.map(x => ({ sid: x.sid, look: x.look })) });
    this.phaseT = setTimeout(() => this.toGuess(), this.cfg.drawMs); }
  pic(sid, data) { const g = this.game; if (!g || g.mode !== 'draw' || g.phase !== 'draw') return; const q = g.p.find(x => x.sid === sid); if (!q || q.pic) return;
    q.pic = cleanPic(data); this.io.to(this.room).emit('d:wait', { done: g.p.filter(x => x.pic).map(x => x.sid) }); if (g.p.every(x => x.pic)) this.toGuess(); }
  toGuess() { const g = this.game; if (!g || g.phase !== 'draw') return; clearTimeout(this.phaseT); g.phase = 'guess'; g.tg = Date.now();
    g.p.forEach((q, i) => { const o = g.p[1 - i]; o.pic = o.pic || cleanPic('');
      q.choices = shuffle([o.word, ...shuffle(PROMPTS.filter(w => w !== o.word && w !== q.word)).slice(0, 3)]);
      this.io.to(q.sid).emit('d:guess', { pic: o.pic, from: o.look.nickname, choices: q.choices, ms: this.cfg.guessMs }); });
    this.phaseT = setTimeout(() => this.finishDraw(), this.cfg.guessMs); }
  guess(sid, i) { const g = this.game; if (!g || g.mode !== 'draw' || g.phase !== 'guess') return; const k = g.p.findIndex(x => x.sid === sid), q = g.p[k]; if (!q || q.guess) return;
    const w = q.choices[+i]; if (w === undefined) return; q.guess = { word: w, ok: w === g.p[1 - k].word, at: Date.now() - g.tg };
    if (g.p.every(x => x.guess)) this.finishDraw(); }
  finishDraw() { const g = this.game; if (!g || g.mode !== 'draw') return; clearTimeout(this.phaseT); this.game = null;
    const ok = g.p.map(q => !!(q.guess && q.guess.ok)); let wi = -1;
    if (ok[0] && !ok[1]) wi = 0; else if (ok[1] && !ok[0]) wi = 1; else if (ok[0] && ok[1]) wi = g.p[0].guess.at <= g.p[1].guess.at ? 0 : 1;
    const info = g.p.map(q => ({ sid: q.sid, nickname: q.look.nickname, word: q.word, guess: q.guess && q.guess.word, ok: !!(q.guess && q.guess.ok), at: q.guess && q.guess.at, pic: q.pic }));
    if (wi < 0) { for (const q of g.p) this.h.refund(q.sid, g.stake);
      this.io.to(this.room).emit('d:end', { draw: true, reason: '둘 다 못 맞혀서 무승부 — 판돈 환불', refund: g.stake, stake: g.stake, prize: 0, info, energy: ENERGY }); }
    else { const prize = payout(g.stake); this.h.pay(g.p[wi].sid, prize);
      this.io.to(this.room).emit('d:end', { winner: g.p[wi].sid, stake: g.stake, prize, fee: g.pot - prize, info, energy: ENERGY }); }
    this.emitLobby(); }
  start(p, stake) {
    for (const q of p) this.h.charge(q.sid, stake, ENERGY);
    const now = Date.now(), fuse = rint(this.cfg.fuseMin, this.cfg.fuseMax);
    this.game = { mode: 'bomb', p, stake, pot: stake * 2, holder: rint(0, 1), passes: 0, t0: now, fuse, heldAt: now, lockUntil: 0, idx: 0, seq: null };
    this.newSeq(); this.emitLobby();
    this.io.to(this.room).emit('b:start', { stake, pot: stake * 2, prize: payout(stake), players: p.map(q => ({ sid: q.sid, look: q.look })) });
    this.boom = setTimeout(() => this.explode(), fuse); this.ticker = setInterval(() => this.emitState(), this.cfg.tick); this.emitState(); }
  newSeq() { const g = this.game; g.seq = Array.from({ length: seqLen(g.passes) }, () => DIRS[rint(0, 3)]); g.idx = 0; }
  emitState() { const g = this.game; if (!g || g.mode !== 'bomb') return; const el = Date.now() - g.t0;
    // heat is from the max fuse, so it never tells you when the bomb will really go off
    this.io.to(this.room).emit('b:state', { holder: g.p[g.holder].sid, seq: g.seq, idx: g.idx, passes: g.passes, lock: Math.max(0, g.lockUntil - Date.now()),
      heat: Math.min(1, el / this.cfg.fuseMax), el }); }
  key(sid, d) { const g = this.game; if (!g || g.mode !== 'bomb' || g.p[g.holder].sid !== sid || !DIRS.includes(d)) return; const now = Date.now();
    if (now < g.lockUntil) return;
    if (g.seq[g.idx] !== d) { g.lockUntil = now + this.cfg.lock; this.newSeq(); this.io.to(sid).emit('b:miss'); return this.emitState(); }
    g.idx++;
    if (g.idx >= g.seq.length) { if (now - g.heldAt < this.cfg.minHold) { g.idx = g.seq.length - 1; return this.emitState(); } // tiny minimum hold
      g.holder = 1 - g.holder; g.passes++; g.heldAt = now; g.lockUntil = 0; this.newSeq(); }
    this.emitState(); }
  stop() { clearTimeout(this.boom); clearTimeout(this.phaseT); clearInterval(this.ticker); const g = this.game; this.game = null; return g; }
  explode() { if (!this.game || this.game.mode !== 'bomb') return; const g = this.stop(); const loser = g.holder, w = g.p[1 - loser], prize = payout(g.stake);
    this.h.pay(w.sid, prize);
    this.io.to(this.room).emit('b:end', { winner: w.sid, loser: g.p[loser].sid, stake: g.stake, prize, fee: g.pot - prize, passes: g.passes, time: Date.now() - g.t0, energy: ENERGY });
    this.emitLobby(); }
  // leaving / disconnecting mid-match = loss: the opponent takes the pot (90%), same as a normal win
  forfeit(sid) { const g = this.stop(); if (!g) return; const w = g.p.find(q => q.sid !== sid), prize = payout(g.stake); this.h.pay(w.sid, prize);
    const d = { winner: w.sid, loser: sid, forfeit: true, reason: '상대가 나가서 기권승!', stake: g.stake, prize, fee: g.pot - prize, passes: g.passes || 0, energy: ENERGY };
    this.io.to(this.room).emit(g.mode === 'draw' ? 'd:end' : 'b:end', d); this.emitLobby(); }
  abort(reason) { const g = this.stop(); if (!g) return; for (const q of g.p) this.h.refund(q.sid, g.stake);
    this.io.to(this.room).emit(g.mode === 'draw' ? 'd:end' : 'b:end', { draw: true, reason, stake: g.stake, prize: 0, refund: g.stake, energy: ENERGY }); this.emitLobby(); }
  leave(sid, socket) { this.cancel(sid); if (this.inGame(sid)) this.forfeit(sid); if (socket) socket.leave(this.room); }
}
module.exports = { DuelLobby, PROMPTS, GRID, MODES, cleanPic, STAKES, FEE, ENERGY, CFG, payout, seqLen };
