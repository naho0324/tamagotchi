// Server-authoritative 벽돌부수기 (breakout) for 1-2 players (co-op). One lobby per room, like snake.
// 2 players: two paddles side by side on the bottom, each limited to its own half; shared bricks, shared lives.
const W = 480, H = 320, TICK = 33, TIME_LIMIT = 120, AUTO_START = 10, MAX = 2, LEVELS = 3, LIVES = 3, ENERGY = 10;
const COLS = 8, ROWS = 5, BW = 54, BH = 16, BX = 24, BY = 36, GAP = 2, PY = 296, PH = 8, R = 5, PSPEED = 14;
const COLORS = ['#f27a9a', '#6aa9f2'];
const coinsFor = (bricks, levels) => bricks <= 0 ? 5 : Math.min(30, 10 + Math.floor(bricks / 4) + 5 * levels);
class BreakoutLobby {
  constructor(io, onEnd, room = 'breakout') { this.io = io; this.onEnd = onEnd; this.room = room; this.players = []; this.state = 'lobby'; this.countdown = null; }
  emitLobby() { this.io.to(this.room).emit('bk:lobby', { state: this.state, countdown: this.countdown, host: this.players[0] && this.players[0].sid,
    players: this.players.map(p => ({ sid: p.sid, nickname: p.look.nickname, color: p.color })) }); }
  cost() { return ENERGY; }
  join(socket, look) {
    if (this.players.find(p => p.sid === socket.id)) return 'already';
    if (this.state !== 'lobby') return '게임이 진행 중이에요. 잠시 후 다시!';
    if (this.players.length >= MAX) return '자리가 없어요 (최대 2명)';
    const used = new Set(this.players.map(p => p.color));
    this.players.push({ sid: socket.id, socket, id: socket.user.id, look, color: COLORS.find(c => !used.has(c)) });
    socket.join(this.room); this.checkAuto(); this.emitLobby(); return null;
  }
  leave(sid) {
    const i = this.players.findIndex(p => p.sid === sid); if (i < 0) return;
    const p = this.players[i]; p.socket.leave(this.room);
    if (this.state === 'lobby') { this.players.splice(i, 1); this.checkAuto(); this.emitLobby(); return; }
    p.left = true; const pd = this.paddles.find(q => q.sid === sid); if (pd) pd.gone = true;
    if (this.players.every(q => q.left)) this.end();
  }
  checkAuto() {
    if (this.players.length >= 2 && !this.autoTimer) { this.countdown = AUTO_START;
      this.autoTimer = setInterval(() => { this.countdown--; if (this.countdown <= 0) this.start(); else this.emitLobby(); }, 1000); }
    if (this.players.length < 2 && this.autoTimer) { clearInterval(this.autoTimer); this.autoTimer = null; this.countdown = null; }
  }
  start(bySid) {
    if (this.state !== 'lobby' || !this.players.length) return '시작할 수 없어요';
    if (bySid && this.players[0].sid !== bySid) return '방장만 시작할 수 있어요';
    clearInterval(this.autoTimer); this.autoTimer = null; this.countdown = null;
    if (this.gate) for (const p of this.players.slice()) { const e = this.gate(p, ENERGY);
      if (e) { p.socket.emit('toast', e); p.socket.emit('bk:kicked', e); p.socket.leave(this.room); this.players.splice(this.players.indexOf(p), 1); } }
    if (!this.players.length) { this.checkAuto(); this.emitLobby(); return '에너지가 부족해요'; }
    this.paid = ENERGY; if (this.charge) this.charge(this.players, ENERGY);
    const n = this.players.length, pw = n === 1 ? 84 : 72;
    this.paddles = this.players.map((p, i) => { const lo = n === 1 ? 0 : i * W / 2, hi = n === 1 ? W : lo + W / 2;
      return { sid: p.sid, color: p.color, nickname: p.look.nickname, x: (lo + hi) / 2, tx: (lo + hi) / 2, w: pw, lo, hi }; });
    this.state = 'playing'; this.ticks = 0; this.level = 1; this.broken = 0; this.cleared = 0; this.lives = LIVES;
    this.newLevel(); this.emitLobby();
    this.io.to(this.room).emit('bk:start', { w: W, h: H, tick: TICK, time: TIME_LIMIT, geo: { COLS, ROWS, BW, BH, BX, BY, GAP, PY, PH, R }, paddles: this.paddles.map(({ sid, color, nickname, w, lo, hi }) => ({ sid, color, nickname, w, lo, hi })),
      looks: Object.fromEntries(this.players.map(p => [p.sid, p.look])) });
    this.timer = setInterval(() => this.step(), TICK); return null;
  }
  newLevel() { this.bricks = []; for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) this.bricks.push(r < this.level - 1 ? 2 : 1); // later levels: top rows take 2 hits
    this.balls = this.paddles.filter(p => !p.gone).map(p => this.serve(p)); }
  serve(p) { const sp = 4.2 + this.level * 0.8, a = (Math.random() * 0.8 - 0.4); return { x: p.x, y: PY - R - 1, vx: sp * Math.sin(a), vy: -sp * Math.cos(a), sp, owner: p.sid, wait: 20 }; }
  input(sid, x) { const p = this.paddles && this.paddles.find(q => q.sid === sid); if (!p || !Number.isFinite(+x)) return; p.tx = Math.max(p.lo + p.w / 2, Math.min(p.hi - p.w / 2, +x)); }
  step() {
    this.ticks++;
    for (const p of this.paddles) { const d = p.tx - p.x; p.x += Math.max(-PSPEED, Math.min(PSPEED, d)); }
    const lost = [];
    for (const b of this.balls) {
      if (b.wait > 0) { b.wait--; const p = this.paddles.find(q => q.sid === b.owner); if (p) b.x = p.x; continue; }
      const py = b.y; b.x += b.vx; b.y += b.vy;
      if (b.x < R) { b.x = R; b.vx = Math.abs(b.vx); } if (b.x > W - R) { b.x = W - R; b.vx = -Math.abs(b.vx); } if (b.y < R) { b.y = R; b.vy = Math.abs(b.vy); }
      if (b.vy > 0 && py + R <= PY && b.y + R >= PY) for (const p of this.paddles) { if (p.gone || Math.abs(b.x - p.x) > p.w / 2 + R) continue;
        const off = (b.x - p.x) / (p.w / 2), a = Math.max(-1, Math.min(1, off)) * 1.05; b.vx = b.sp * Math.sin(a); b.vy = -b.sp * Math.cos(a); b.y = PY - R; b.owner = p.sid; break; }
      // bricks: one hit per tick
      const c = Math.floor((b.x - BX) / BW), r = Math.floor((b.y - BY) / BH);
      for (const [cc, rr] of [[c, r], [Math.floor((b.x - BX + Math.sign(b.vx) * R) / BW), r], [c, Math.floor((b.y - BY + Math.sign(b.vy) * R) / BH)]]) {
        if (cc < 0 || rr < 0 || cc >= COLS || rr >= ROWS) continue; const i = rr * COLS + cc; if (!this.bricks[i]) continue;
        this.bricks[i]--; if (!this.bricks[i]) this.broken++;
        const bx = BX + cc * BW + BW / 2, by = BY + rr * BH + BH / 2; if (Math.abs(b.x - bx) / BW > Math.abs(b.y - by) / BH) b.vx = -b.vx; else b.vy = -b.vy; break; }
      if (b.y > H + R) lost.push(b);
    }
    for (const b of lost) { this.balls.splice(this.balls.indexOf(b), 1); this.lives--;
      if (this.lives > 0) { const p = this.paddles.find(q => q.sid === b.owner && !q.gone) || this.paddles.find(q => !q.gone); if (p) this.balls.push(this.serve(p)); } }
    if (this.bricks.every(v => !v)) { this.cleared++; if (this.level >= LEVELS) return this.end(); this.level++; this.newLevel(); this.io.to(this.room).emit('bk:level', this.level); }
    const left = TIME_LIMIT - Math.floor(this.ticks * TICK / 1000);
    this.io.to(this.room).emit('bk:state', { t: left, lv: this.level, lives: this.lives, br: this.broken, k: this.bricks,
      b: this.balls.map(b => [Math.round(b.x * 10) / 10, Math.round(b.y * 10) / 10, b.vx, b.vy, b.wait]), p: this.paddles.map(p => [p.sid, Math.round(p.x), p.gone ? 1 : 0]) });
    if (this.lives <= 0 || !this.balls.length || left <= 0) this.end();
  }
  end() {
    clearInterval(this.timer); if (this.state !== 'playing') return;
    const coins = coinsFor(this.broken, this.cleared), win = this.cleared >= LEVELS;
    const results = this.players.map(p => ({ sid: p.sid, id: p.id, nickname: p.look.nickname, coins, energy: this.paid, left: p.left, bricks: this.broken, levels: this.cleared, win }));
    this.onEnd(results);
    for (const p of this.players) p.socket.leave(this.room);
    this.players = []; this.paddles = null; this.balls = null; this.state = 'lobby'; this.emitLobby();
  }
}
module.exports = { BreakoutLobby, coinsFor, ENERGY, W, H };
