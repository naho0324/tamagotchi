// Server-authoritative multiplayer snake (1-6 players). One shared lobby at a time.
const COLS = 30, ROWS = 20, TICK = 100, TIME_LIMIT = 90, AUTO_START = 15, MAX = 6;
const COLORS = ['#f27a9a', '#6aa9f2', '#98d67a', '#f2a25c', '#a98be0', '#5cc8c0'];
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const SPAWNS = [[4, 4, 'right'], [25, 15, 'left'], [25, 4, 'left'], [4, 15, 'right'], [15, 3, 'down'], [15, 16, 'up']];
class SnakeLobby {
  constructor(io, onEnd) { this.io = io; this.onEnd = onEnd; this.room = 'snake'; this.players = []; this.state = 'lobby'; this.countdown = null; }
  emitLobby() { this.io.to(this.room).emit('s:lobby', { state: this.state, countdown: this.countdown, host: this.players[0] && this.players[0].sid,
    players: this.players.map(p => ({ sid: p.sid, nickname: p.look.nickname, color: p.color })) }); }
  join(socket, look) {
    if (this.players.find(p => p.sid === socket.id)) return 'already';
    if (this.state !== 'lobby') return '게임이 진행 중이에요. 잠시 후 다시!';
    if (this.players.length >= MAX) return '방이 가득 찼어요 (최대 6명)';
    const used = new Set(this.players.map(p => p.color));
    this.players.push({ sid: socket.id, socket, id: socket.user.id, look, color: COLORS.find(c => !used.has(c)) });
    socket.join(this.room); this.checkAuto(); this.emitLobby(); return null;
  }
  leave(sid) {
    const i = this.players.findIndex(p => p.sid === sid); if (i < 0) return;
    const p = this.players[i]; p.socket.leave(this.room);
    if (this.state === 'lobby') { this.players.splice(i, 1); this.checkAuto(); this.emitLobby(); }
    else { const s = this.snakes.find(s => s.sid === sid); if (s && s.alive) this.kill(s); p.left = true; }
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
    this.state = 'playing'; this.ticks = 0; this.deathOrder = []; this.food = [];
    this.snakes = this.players.map((p, i) => { const [x, y, d] = SPAWNS[i], [dx, dy] = DIRS[d];
      return { sid: p.sid, color: p.color, nickname: p.look.nickname, look: p.look, dir: d, next: d, alive: true, grow: 0,
        body: [[x, y], [x - dx, y - dy], [x - 2 * dx, y - 2 * dy]] }; });
    for (let i = 0; i < Math.max(3, this.snakes.length + 2); i++) this.spawnFood();
    this.emitLobby(); this.io.to(this.room).emit('s:start', { cols: COLS, rows: ROWS, time: TIME_LIMIT });
    this.timer = setInterval(() => this.step(), TICK); return null;
  }
  setDir(sid, d) { const s = this.snakes && this.snakes.find(s => s.sid === sid); if (!s || !DIRS[d]) return;
    const [cx, cy] = DIRS[s.dir], [nx, ny] = DIRS[d]; if (cx + nx === 0 && cy + ny === 0) return; s.next = d; }
  occupied(x, y) { return this.snakes.some(s => s.alive && s.body.some(([a, b]) => a === x && b === y)) || this.food.some(([a, b]) => a === x && b === y); }
  spawnFood() { for (let k = 0; k < 200; k++) { const x = Math.floor(Math.random() * COLS), y = Math.floor(Math.random() * ROWS); if (!this.occupied(x, y)) { this.food.push([x, y]); return; } } }
  kill(s) { s.alive = false; this.deathOrder.push(s); }
  step() {
    this.ticks++;
    const alive = this.snakes.filter(s => s.alive);
    const heads = alive.map(s => { s.dir = s.next; const [dx, dy] = DIRS[s.dir]; return [s, [s.body[0][0] + dx, s.body[0][1] + dy]]; });
    for (const [s, h] of heads) { // move (tail moves first unless growing)
      s.body.unshift(h); if (s.grow > 0) s.grow--; else s.body.pop();
      const fi = this.food.findIndex(([a, b]) => a === h[0] && b === h[1]);
      if (fi >= 0) { this.food.splice(fi, 1); s.grow += 2; this.spawnFood(); }
    }
    const dead = [];
    for (const [s, h] of heads) {
      if (h[0] < 0 || h[1] < 0 || h[0] >= COLS || h[1] >= ROWS) { dead.push(s); continue; }
      for (const o of alive) { const seg = o === s ? o.body.slice(1) : o.body; if (seg.some(([a, b]) => a === h[0] && b === h[1])) { dead.push(s); break; } }
    }
    // simultaneous deaths: shorter dies "first" (ranks lower)
    dead.sort((a, b) => a.body.length - b.body.length).forEach(s => this.kill(s));
    const left = TIME_LIMIT - Math.floor(this.ticks * TICK / 1000);
    this.io.to(this.room).emit('s:state', { f: this.food, t: left, s: this.snakes.map(s => ({ sid: s.sid, c: s.color, n: s.nickname, a: s.alive, b: s.body, look: s.look })) });
    const nAlive = this.snakes.filter(s => s.alive).length;
    if (nAlive === 0 || (this.snakes.length > 1 && nAlive <= 1) || left <= 0) this.end();
  }
  end() {
    clearInterval(this.timer);
    const alive = this.snakes.filter(s => s.alive).sort((a, b) => b.body.length - a.body.length);
    const ranking = [...alive, ...this.deathOrder.slice().reverse()];
    const solo = this.snakes.length === 1;
    const results = ranking.map((s, i) => { const p = this.players.find(p => p.sid === s.sid);
      const coins = solo ? Math.min(15, Math.floor(s.body.length / 2)) : [20, 12, 8, 5, 3, 2][i];
      return { sid: s.sid, id: p.id, nickname: s.nickname, rank: i + 1, length: s.body.length, coins, left: p.left }; });
    this.onEnd(results);
    for (const p of this.players) p.socket.leave(this.room);
    this.players = []; this.snakes = null; this.state = 'lobby'; this.emitLobby();
  }
}
module.exports = { SnakeLobby, COLS, ROWS };
