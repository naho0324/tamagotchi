// Server-authoritative 벽돌부수기 (breakout) for 1-2 players (co-op). One lobby per room, like snake.
// 2 players: two paddles side by side on the bottom, each limited to its own half; shared bricks, shared lives.
const W = 480, H = 320, TICK = 33, AUTO_START = 10, MAX = 2, LEVELS = 50, LIVES = 3, ENERGY = 10;
const COLS = 10, ROWS = 10, BW = 43, BH = 14, BX = 25, BY = 28, GAP = 2, PY = 296, PH = 8, R = 5, PSPEED = 14;
const COLORS = ['#f27a9a', '#6aa9f2'];
// maps: see breakout_maps.js (200 maps, 10x10 grid, sorted easy -> hard; structure gets more complex by tier).
// Stage N (1..LEVELS) picks a random map from difficulty band N (4 maps each), so early stages never get hard maps.
const { MAPS, KIND, difficulty } = require('./breakout_maps');
const mapFor = (level, r) => { const n = MAPS.length, lo = Math.floor((level - 1) * n / LEVELS), hi = Math.floor(level * n / LEVELS); return lo + Math.floor(r * (hi - lo)); };
const STEEL = 9, FX = 300, DROP = +process.env.BK_DROP || 0.13, MAXBALLS = 6, MAXLIVES = 5;
const ITEMS = { wide: '패들 확장!', multi: '멀티볼 ×3!', slow: '느린 공~', laser: '레이저 발사!', life: '+1 목숨!', shrink: '패들 축소…', fast: '빠른 공!' };
const WEIGHTS = [['wide', 3], ['multi', 3], ['slow', 2], ['laser', 2], ['life', 1], ['shrink', 2], ['fast', 2]];
const pickItem = r => { let x = r * 15; for (const [k, w] of WEIGHTS) { if ((x -= w) < 0) return k; } return 'wide'; };
// coins by STAGES CLEARED only: 0 -> 3, +3 per stage, 50 stages -> 150 (bricks broken don't matter)
const coinsFor = stages => Math.min(150, 3 + 3 * Math.max(0, Math.floor(stages) || 0));
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
      return { sid: p.sid, color: p.color, nickname: p.look.nickname, x: (lo + hi) / 2, tx: (lo + hi) / 2, w: pw, bw: pw, lo, hi, fx: { wide: 0, shrink: 0, laser: 0 }, cd: 0 }; });
    this.rand = this.rand || Math.random; this.fx = { slow: 0, fast: 0 };
    this.state = 'playing'; this.ticks = 0; this.level = Math.min(LEVELS, +process.env.BK_LEVEL || 1); /* BK_LEVEL: preview/screenshot only */ this.broken = 0; this.cleared = 0; this.lives = LIVES;
    this.newLevel(); this.emitLobby();
    this.io.to(this.room).emit('bk:start', { w: W, h: H, tick: TICK,  geo: { COLS, ROWS, BW, BH, BX, BY, GAP, PY, PH, R }, paddles: this.paddles.map(({ sid, color, nickname, w, lo, hi }) => ({ sid, color, nickname, w, lo, hi })),
      looks: Object.fromEntries(this.players.map(p => [p.sid, p.look])) });
    this.timer = setInterval(() => this.step(), TICK); return null;
  }
  newLevel() { this.mapIdx = mapFor(this.level, this.rand()); const L = MAPS[this.mapIdx]; this.bricks = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { const ch = (L[r] || '')[c] || '.'; this.bricks.push(ch === '#' ? STEEL : ch === '.' ? 0 : +ch); }
    this.items = []; this.shots = [];
    this.balls = this.paddles.filter(p => !p.gone).map(p => this.serve(p)); }
  speed() { return (7.2 + Math.min(5, (this.level - 1) * 0.1)) * (this.fx.slow ? 0.65 : this.fx.fast ? 1.3 : 1); }
  serve(p) { const sp = this.speed(), a = (Math.random() * 0.8 - 0.4); return { x: p.x, y: PY - R - 1, vx: sp * Math.sin(a), vy: -sp * Math.cos(a), sp, owner: p.sid, wait: 20 }; }
  input(sid, x) { const p = this.paddles && this.paddles.find(q => q.sid === sid); if (!p || !Number.isFinite(+x)) return; p.tx = Math.max(p.lo + p.w / 2, Math.min(p.hi - p.w / 2, +x)); }
  hit(i) { const v = this.bricks[i]; if (!v || v === STEEL) return; this.bricks[i] = v - 1; this.lastBreak = this.ticks; if (v > 1) return; this.broken++;
    if (this.rand() < DROP) this.items.push({ x: BX + (i % COLS) * BW + BW / 2, y: BY + Math.floor(i / COLS) * BH + BH / 2, kind: pickItem(this.rand()) }); }
  catchItem(it, p) { const k = it.kind, f = p.fx; this.io.to(this.room).emit('bk:item', { kind: k, label: ITEMS[k], sid: p.sid });
    if (k === 'wide') { f.wide = FX; f.shrink = 0; } else if (k === 'shrink') { f.shrink = FX; f.wide = 0; } else if (k === 'laser') f.laser = FX;
    else if (k === 'slow') { this.fx.slow = FX; this.fx.fast = 0; } else if (k === 'fast') { this.fx.fast = FX; this.fx.slow = 0; }
    else if (k === 'life') this.lives = Math.min(MAXLIVES, this.lives + 1);
    else if (k === 'multi') { for (const b of this.balls.slice()) for (const a of [-0.5, 0.5]) { if (this.balls.length >= MAXBALLS) break; if (b.wait > 0) continue;
      const c = Math.cos(a), s = Math.sin(a); this.balls.push({ ...b, vx: b.vx * c - b.vy * s, vy: Math.min(-1, b.vx * s + b.vy * c) }); } } }
  // stall assist: soften a steel block that touches both a remaining brick and open space the ball can already reach
  soften() { const open = new Set(), q = [], N = [[1, 0], [-1, 0], [0, 1], [0, -1]], at = (r, c) => r < 0 || c < 0 || r >= ROWS || c >= COLS ? -1 : this.bricks[r * COLS + c];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if ((!r || !c || r === ROWS - 1 || c === COLS - 1) && !at(r, c)) { open.add(r * COLS + c); q.push([r, c]); }
    while (q.length) { const [r, c] = q.pop(); for (const [a, b] of N) { const rr = r + a, cc = c + b; if (at(rr, cc) === 0 && !open.has(rr * COLS + cc)) { open.add(rr * COLS + cc); q.push([rr, cc]); } } }
    const edge = (r, c) => !r || !c || r === ROWS - 1 || c === COLS - 1, cand = [];
    this.bricks.forEach((v, i) => { if (v !== STEEL) return; const r = Math.floor(i / COLS), c = i % COLS, nb = N.map(([a, b]) => [r + a, c + b]);
      const brick = nb.some(([rr, cc]) => at(rr, cc) > 0 && at(rr, cc) < STEEL), air = edge(r, c) || nb.some(([rr, cc]) => open.has(rr * COLS + cc));
      if (brick) cand.push([air ? 0 : 1, -i, i]); });
    if (!cand.length) return; cand.sort((a, b) => a[0] - b[0] || a[1] - b[1]); // few bricks left -> open every wall touching them
    const few = this.bricks.filter(v => v > 0 && v < STEEL).length <= 3; for (const [, , i] of cand.slice(0, 2)) this.bricks[i] = 1;
    if (few) this.bricks.forEach((v, i) => { if (v > 0 && v < STEEL) for (let j = i + COLS; j < this.bricks.length; j += COLS) if (this.bricks[j] === STEEL) this.bricks[j] = 0; }); // last bricks: open a straight shaft below each
    this.io.to(this.room).emit('bk:item', { kind: 'laser', label: '강철이 약해졌어요!', sid: this.paddles[0].sid }); }
  step() {
    this.ticks++;
    for (const k in this.fx) if (this.fx[k] > 0) this.fx[k]--;
    for (const p of this.paddles) { for (const k in p.fx) if (p.fx[k] > 0) p.fx[k]--;
      p.w = Math.round(p.bw * (p.fx.wide ? 1.5 : p.fx.shrink ? 0.65 : 1)); p.w = Math.min(p.w, p.hi - p.lo); p.tx = Math.max(p.lo + p.w / 2, Math.min(p.hi - p.w / 2, p.tx));
      const d = p.tx - p.x; p.x += Math.max(-PSPEED, Math.min(PSPEED, d)); p.x = Math.max(p.lo + p.w / 2, Math.min(p.hi - p.w / 2, p.x));
      if (p.fx.laser && !p.gone && --p.cd <= 0) { p.cd = 10; this.shots.push({ x: p.x - p.w / 2 + 4, y: PY - 4 }, { x: p.x + p.w / 2 - 4, y: PY - 4 }); } }
    for (const sh of this.shots) { sh.y -= 9; const c = Math.floor((sh.x - BX) / BW), r = Math.floor((sh.y - BY) / BH);
      if (c >= 0 && r >= 0 && c < COLS && r < ROWS && this.bricks[r * COLS + c]) { this.hit(r * COLS + c); sh.dead = 1; } if (sh.y < 0) sh.dead = 1; }
    this.shots = this.shots.filter(s => !s.dead);
    for (const it of this.items) { it.y += 2.2; if (it.y >= PY - 6 && it.y <= PY + PH + 4) { const p = this.paddles.find(q => !q.gone && Math.abs(it.x - q.x) <= q.w / 2 + 8); if (p) { this.catchItem(it, p); it.dead = 1; } } if (it.y > H + 10) it.dead = 1; }
    this.items = this.items.filter(i => !i.dead);
    // stall assist (keeps tricky maps clearable): 30s without breaking anything -> one steel block next to a remaining brick softens to 1-hit
    if (this.ticks - (this.lastBreak || 0) > 900) { this.lastBreak = this.ticks; this.soften(); }
    const SP = this.speed();
    const lost = [];
    for (const b of this.balls) {
      { const m = Math.hypot(b.vx, b.vy) || 1; b.sp = SP; b.vx *= SP / m; b.vy *= SP / m; }
      if (b.wait > 0) { b.wait--; const p = this.paddles.find(q => q.sid === b.owner); if (p) b.x = p.x; continue; }
      b.air = (b.air || 0) + 1; if (b.y < R + 1 && b.air > 240) b.vx += (this.rand() - 0.5) * 2; // also unstick top-wall loops
      for (let s = 0, k = Math.ceil(b.sp / 5); s < k; s++) { // sub-steps: no tunnelling through 14px bricks at high speed
      const px = b.x, py = b.y; b.x += b.vx / k; b.y += b.vy / k;
      if (b.x < R) { b.x = R; b.vx = Math.abs(b.vx); } if (b.x > W - R) { b.x = W - R; b.vx = -Math.abs(b.vx); } if (b.y < R) { b.y = R; b.vy = Math.abs(b.vy); }
      if (b.vy > 0 && py + R <= PY && b.y + R >= PY) for (const p of this.paddles) { if (p.gone || Math.abs(b.x - p.x) > p.w / 2 + R) continue;
        const off = (b.x - p.x) / (p.w / 2), stall = this.ticks - (this.lastBreak || 0) > 450, // anti-loop: small jitter, bigger after 15s without a break
          a = Math.max(-1.1, Math.min(1.1, Math.max(-1, Math.min(1, off)) * 1.05 + (this.rand() - 0.5) * (stall ? 0.5 : 0.1))); b.vx = b.sp * Math.sin(a); b.vy = -b.sp * Math.cos(a); b.y = PY - R; b.owner = p.sid; b.air = 0; break; }
      // bricks: one hit per sub-step
      const c = Math.floor((b.x - BX) / BW), r = Math.floor((b.y - BY) / BH);
      for (const [cc, rr] of [[c, r], [Math.floor((b.x - BX + Math.sign(b.vx) * R) / BW), r], [c, Math.floor((b.y - BY + Math.sign(b.vy) * R) / BH)]]) {
        if (cc < 0 || rr < 0 || cc >= COLS || rr >= ROWS) continue; const i = rr * COLS + cc; if (!this.bricks[i]) continue;
        this.hit(i);
        const bx = BX + cc * BW + BW / 2, by = BY + rr * BH + BH / 2; if (Math.abs(b.x - bx) / BW > Math.abs(b.y - by) / BH) b.vx = -b.vx; else b.vy = -b.vy; b.x = px; b.y = py;
        if (this.bricks[i] === STEEL && b.air > 240) { const a = (this.rand() - 0.5) * 0.9, c = Math.cos(a), sn = Math.sin(a); [b.vx, b.vy] = [b.vx * c - b.vy * sn, b.vx * sn + b.vy * c]; } // anti-trap: ball stuck between steel for 8s gets nudged
        break; }
      }
      if (b.y > H + R) lost.push(b);
    }
    for (const b of lost) { this.balls.splice(this.balls.indexOf(b), 1); // extra (multi) balls are free to lose; a life goes only when fewer balls than players remain
      if (this.balls.length >= this.paddles.filter(q => !q.gone).length) continue; this.lives--;
      if (this.lives > 0) { const p = this.paddles.find(q => q.sid === b.owner && !q.gone) || this.paddles.find(q => !q.gone); if (p) this.balls.push(this.serve(p)); } }
    if (this.bricks.every(v => !v || v === STEEL)) { this.cleared++; if (this.level >= LEVELS) return this.end(); this.level++; this.newLevel(); this.io.to(this.room).emit('bk:level', this.level); }
    const left = Math.floor(this.ticks * TICK / 1000); // elapsed seconds; no overall time limit (ends when lives run out)
    this.io.to(this.room).emit('bk:state', { t: left, lv: this.level, lives: this.lives, br: this.broken, k: this.bricks,
      b: this.balls.map(b => [Math.round(b.x * 10) / 10, Math.round(b.y * 10) / 10, b.vx, b.vy, b.wait]), p: this.paddles.map(p => [p.sid, Math.round(p.x), p.gone ? 1 : 0, p.w, Math.ceil(p.fx.wide / 30), Math.ceil(p.fx.shrink / 30), Math.ceil(p.fx.laser / 30)]),
      it: this.items.map(i => [Math.round(i.x), Math.round(i.y), i.kind]), sh: this.shots.map(s => [Math.round(s.x), Math.round(s.y)]), fx: [Math.ceil(this.fx.slow / 30), Math.ceil(this.fx.fast / 30)] });
    if (this.lives <= 0 || !this.balls.length) this.end();
  }
  end() {
    clearInterval(this.timer); if (this.state !== 'playing') return;
    const coins = coinsFor(this.cleared), win = this.cleared >= LEVELS;
    const results = this.players.map(p => ({ sid: p.sid, id: p.id, nickname: p.look.nickname, coins, energy: this.paid, left: p.left, bricks: this.broken, levels: this.cleared, win }));
    this.onEnd(results);
    for (const p of this.players) p.socket.leave(this.room);
    this.players = []; this.paddles = null; this.balls = null; this.state = 'lobby'; this.emitLobby();
  }
}
module.exports = { BreakoutLobby, coinsFor, ENERGY, W, H, MAPS, KIND, difficulty, mapFor, ITEMS, STEEL };
