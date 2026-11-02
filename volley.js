// Server-authoritative volleyball. Field 480x300, ground at y=270.
const W = 480, GROUND = 270, NET_X = 240, NET_W = 8, NET_TOP = 170, PR = 26, BR = 16, G = 0.45, WIN = 7;
class Match {
  constructor(io, room, players, onEnd) { // players: [{socketId|null(AI), id, nickname, look}]
    this.io = io; this.room = room; this.players = players; this.onEnd = onEnd;
    this.score = [0, 0]; this.inputs = [{}, {}]; this.over = false; this.pause = 60; this.tick = 0;
    this.p = [{ x: 90, y: GROUND - PR, vy: 0 }, { x: W - 90, y: GROUND - PR, vy: 0 }];
    this.serve(0);
    this.timer = setInterval(() => this.step(), 1000 / 60);
  }
  serve(side) { this.ball = { x: side === 0 ? 90 : W - 90, y: 60, vx: side === 0 ? 1.2 : -1.2, vy: 0 }; this.pause = 60; }
  ai(i) {
    const me = this.p[i], b = this.ball, inp = {};
    const home = i === 0 ? 100 : W - 100;
    let target = home;
    if ((i === 0 && b.x < NET_X) || (i === 1 && b.x > NET_X)) target = b.x + (i === 0 ? -10 : 10);
    if (Math.abs(target - me.x) > 6) inp[target < me.x ? 'left' : 'right'] = true;
    if (Math.abs(b.x - me.x) < 40 && b.y > 130 && b.y < 200 && b.vy > 0) inp.up = true;
    return inp;
  }
  step() {
    if (this.over) return;
    this.tick++;
    for (let i = 0; i < 2; i++) {
      const inp = this.players[i].socketId ? this.inputs[i] : this.ai(i), me = this.p[i];
      const sp = 5; if (inp.left) me.x -= sp; if (inp.right) me.x += sp;
      if (inp.up && me.y >= GROUND - PR - 0.1) me.vy = -10.5;
      me.vy += G; me.y += me.vy; if (me.y > GROUND - PR) { me.y = GROUND - PR; me.vy = 0; }
      const lo = i === 0 ? PR : NET_X + NET_W / 2 + PR, hi = i === 0 ? NET_X - NET_W / 2 - PR : W - PR;
      me.x = Math.max(lo, Math.min(hi, me.x));
    }
    if (this.pause > 0) { this.pause--; } else this.physics();
    if (this.tick % 2 === 0) this.io.to(this.room).emit('v:state', this.snapshot());
  }
  physics() {
    const b = this.ball;
    b.vy += G * 0.55; b.x += b.vx; b.y += b.vy;
    if (b.x < BR) { b.x = BR; b.vx = Math.abs(b.vx); } if (b.x > W - BR) { b.x = W - BR; b.vx = -Math.abs(b.vx); }
    if (b.y < BR) { b.y = BR; b.vy = Math.abs(b.vy); }
    // net
    if (b.y + BR > NET_TOP && Math.abs(b.x - NET_X) < NET_W / 2 + BR) {
      if (b.y < NET_TOP && b.vy > 0) { b.y = NET_TOP - BR; b.vy = -Math.abs(b.vy) * 0.7; }
      else { b.x = b.x < NET_X ? NET_X - NET_W / 2 - BR : NET_X + NET_W / 2 + BR; b.vx = -b.vx * 0.8; }
    }
    for (let k = 0; k < 2; k++) { const me = this.p[k];
      const dx = b.x - me.x, dy = b.y - me.y, d = Math.hypot(dx, dy);
      if (d < PR + BR && d > 0) {
        const nx = dx / d, ny = dy / d; b.x = me.x + nx * (PR + BR); b.y = me.y + ny * (PR + BR);
        const speed = Math.min(13, Math.max(9, Math.hypot(b.vx, b.vy) * 1.05));
        b.vx = nx * speed + (me.vy < 0 ? 0 : 0); b.vy = Math.min(-4, ny * speed - 3);
        if (me.vy < 0) { b.vx *= 1.25; b.vy -= 1; } // spike-ish when jumping
        const dir = k === 0 ? 1 : -1; if (b.vx * dir < 2) b.vx = dir * 2;
      }
    }
    if (b.y + BR >= GROUND) {
      const scorer = b.x < NET_X ? 1 : 0; this.score[scorer]++;
      this.io.to(this.room).emit('v:point', { scorer, score: this.score });
      if (this.score[scorer] >= WIN) return this.end(scorer);
      this.serve(scorer);
    }
  }
  snapshot() { return { p: this.p.map(q => [Math.round(q.x), Math.round(q.y)]), b: [Math.round(this.ball.x), Math.round(this.ball.y)], s: this.score, pause: this.pause > 0 }; }
  setInput(socketId, inp) { const i = this.players.findIndex(p => p.socketId === socketId); if (i >= 0) this.inputs[i] = { left: !!inp.left, right: !!inp.right, up: !!inp.up }; }
  leave(socketId) { const i = this.players.findIndex(p => p.socketId === socketId); if (i >= 0 && !this.over) this.end(1 - i, true); }
  end(winner, forfeit = false) { this.over = true; clearInterval(this.timer); this.onEnd(this, winner, forfeit); }
}
module.exports = { Match, W, GROUND, NET_X, NET_W, NET_TOP, PR, BR, WIN };
