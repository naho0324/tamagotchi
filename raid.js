// Server-authoritative boss raid (1-6 players) vs 몽꾸. One shared lobby at a time.
const W = 480, H = 300, TICK = 1000 / 30, TIME_LIMIT = +process.env.RAID_TIME || 120, AUTO_START = 15, MAX = 6;
const GY0 = 205, GY1 = 285, SPEED = 3.2, PHP = 100;
const { POWER } = require('./game'); // egg x0.5, baby x1, child x1.5, adult x2.2
const ATK_CD = 9, SKILL_CD = 150, ATK_DMG = 6, SKILL_DMG = 36; // ticks / dmg
const BOSS_Y = 150, BOSS_HW = 46, BOSS_TOP = 30; // boss feet at y=BOSS_Y, hitbox
const DIFF = { // hp: boss HP mult, gap: attack interval mult, dmg: damage mult, tele: telegraph mult, enr: enrage threshold
  easy: { name: '쉬움', hp: 0.6, gap: 1.5, dmg: 0.6, tele: 1.4, enr: 0.5, move: 0.8, bombs: -1, reward: 30, energy: 15 },
  normal: { name: '보통', hp: 0.85, gap: 1.15, dmg: 0.8, tele: 1.15, enr: 0.5, move: 1, bombs: 0, reward: 60, energy: 20 },
  hard: { name: '어려움', hp: 1.5, gap: 0.8, dmg: 1.3, tele: 0.85, enr: 0.6, move: 1.25, bombs: 1, reward: 120, energy: 30 },
};
class RaidLobby {
  constructor(io, onEnd, room = 'raid') { this.io = io; this.onEnd = onEnd; this.room = room; this.players = []; this.state = 'lobby'; this.countdown = null; this.diff = 'normal'; }
  emitLobby() { this.io.to(this.room).emit('r:lobby', { diff: this.diff, cost: this.cost(), state: this.state, countdown: this.countdown, host: this.players[0] && this.players[0].sid,
    players: this.players.map(p => ({ sid: p.sid, nickname: p.look.nickname, stage: p.look.stage, char: p.look.char, pow: POWER[p.look.stage] || 1 })) }); }
  setDiff(sid, d) { if (this.state !== 'lobby' || !DIFF[d]) return '바꿀 수 없어요'; if (!this.players[0] || this.players[0].sid !== sid) return '방장만 난이도를 고를 수 있어요';
    this.diff = d; this.emitLobby(); return null; }
  cost() { return DIFF[this.diff].energy; }
  join(socket, look) {
    if (this.players.find(p => p.sid === socket.id)) return 'already';
    if (this.state !== 'lobby') return '레이드가 진행 중이에요. 잠시 후 다시!';
    if (this.players.length >= MAX) return '방이 가득 찼어요 (최대 6명)';
    this.players.push({ sid: socket.id, socket, id: socket.user.id, look });
    socket.join(this.room); this.checkAuto(); this.emitLobby(); return null;
  }
  leave(sid) {
    const i = this.players.findIndex(p => p.sid === sid); if (i < 0) return;
    const p = this.players[i]; p.socket.leave(this.room);
    if (this.state === 'lobby') { this.players.splice(i, 1); if (!this.players.length) this.diff = 'normal'; this.checkAuto(); this.emitLobby(); }
    else { p.left = true; const f = this.fighters.find(f => f.sid === sid); if (f) { f.hp = 0; f.alive = false; } }
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
    const cost = this.cost(); // energy gate: kick pets that can't play right now
    if (this.gate) for (const p of this.players.slice()) { const e = this.gate(p, cost);
      if (e) { p.socket.emit('toast', e); p.socket.emit('r:kicked', e); p.socket.leave(this.room); this.players.splice(this.players.indexOf(p), 1); } }
    if (!this.players.length) { this.checkAuto(); this.emitLobby(); return '에너지가 부족해요'; }
    this.paid = cost; if (this.charge) this.charge(this.players, cost);
    this.state = 'playing'; this.ticks = 0; this.over = false;
    const n = this.players.length, D = this.D = DIFF[this.diff], maxHp = Math.round((500 + 300 * n) * D.hp);
    this.boss = { x: W / 2, dir: 1, hp: maxHp, max: maxHp, flinch: 0, next: 60, enr: false };
    this.fighters = this.players.map((p, i) => ({ sid: p.sid, nickname: p.look.nickname, x: 60 + i * (360 / Math.max(1, n - 1 || 1)), y: 255, hp: PHP, alive: true,
      inp: {}, atk: 0, sk: 0, inv: 0, pow: POWER[p.look.stage] || 1 }));
    if (n === 1) this.fighters[0].x = W / 2;
    this.stars = []; this.bombs = []; this.frogs = []; this.laser = null; this.sid = 0;
    this.emitLobby();
    this.io.to(this.room).emit('r:start', { diff: this.diff, diffName: D.name, time: TIME_LIMIT, looks: Object.fromEntries(this.players.map(p => [p.sid, p.look])),
      cfg: { W, H, GY0, GY1, SPEED, SKILL_CD, ATK_CD } });
    this.timer = setInterval(() => this.step(), TICK); return null;
  }
  input(sid, inp) { const f = this.fighters && this.fighters.find(f => f.sid === sid); if (f && inp) f.inp = { l: !!inp.l, r: !!inp.r, u: !!inp.u, d: !!inp.d }; }
  action(sid, kind) {
    const f = this.fighters && this.fighters.find(f => f.sid === sid); if (!f || !f.alive || this.over) return;
    if (kind === 'atk' && f.atk <= 0) { f.atk = ATK_CD; this.stars.push({ id: ++this.sid, x: f.x, y: f.y - 30, vy: -9, dmg: ATK_DMG * f.pow, big: 0, o: sid }); }
    if (kind === 'skill' && f.sk <= 0) { f.sk = SKILL_CD; this.stars.push({ id: ++this.sid, x: f.x, y: f.y - 30, vy: -7, dmg: SKILL_DMG * f.pow, big: 1, o: sid }); }
  }
  hurt(f, dmg) { if (!f.alive || f.inv > 0) return; f.hp = Math.max(0, f.hp - Math.round(dmg * this.D.dmg)); f.inv = 30; if (f.hp <= 0) f.alive = false; }
  bossAttack() {
    const b = this.boss, D = this.D, T = v => Math.round(v * D.tele), alive = this.fighters.filter(f => f.alive); if (!alive.length) return;
    const r = Math.random(), pick = () => alive[Math.floor(Math.random() * alive.length)];
    if (r < 0.4) { // heart bombs: warn shadow, then fall
      const k = Math.max(1, (b.enr ? 4 : 3) + D.bombs) + Math.floor(Math.random() * 2);
      for (let i = 0; i < k; i++) { const t = i < alive.length ? alive[i] : null;
        const x = t ? t.x + (Math.random() - 0.5) * 30 : 30 + Math.random() * (W - 60), y = t ? t.y : GY0 + Math.random() * (GY1 - GY0);
        this.bombs.push({ x: clampX(x), y: clampY(y), t: T(b.enr ? 36 : 48), max: T(b.enr ? 36 : 48) }); }
    } else if (r < 0.7 && !this.laser) { // sunglasses laser sweep, telegraphed
      const ltr = Math.random() < 0.5; this.laser = { x0: ltr ? 20 : W - 20, x1: ltr ? W - 20 : 20, warn: T(b.enr ? 30 : 42), dur: T(b.enr ? 30 : 40), k: 0, hit: new Set() };
    } else { // frog keychain thrown at a player
      const t = pick(), sx = b.x + 20, sy = BOSS_Y - 50, d = Math.hypot(t.x - sx, t.y - 10 - sy) || 1, sp = (b.enr ? 5.5 : 4) / Math.sqrt(D.tele);
      this.frogs.push({ x: sx, y: sy, vx: (t.x - sx) / d * sp, vy: (t.y - 10 - sy) / d * sp });
      if (b.enr) { const t2 = pick(), d2 = Math.hypot(t2.x - sx, t2.y - sy) || 1; this.frogs.push({ x: sx, y: sy, vx: (t2.x - sx + 40) / d2 * sp, vy: (t2.y - sy) / d2 * sp }); }
    }
  }
  step() {
    if (this.over) return; this.ticks++;
    const b = this.boss;
    const D = this.D; b.enr = b.hp < b.max * D.enr;
    b.x += b.dir * (b.enr ? 1.3 : 0.6) * D.move; if (b.x > W - 100) b.dir = -1; if (b.x < 100) b.dir = 1; if (b.flinch > 0) b.flinch--;
    if (--b.next <= 0) { this.bossAttack(); b.next = Math.round(((b.enr ? 45 : 80) + Math.random() * 30) * D.gap); }
    for (const f of this.fighters) {
      if (f.atk > 0) f.atk--; if (f.sk > 0) f.sk--; if (f.inv > 0) f.inv--;
      if (!f.alive) continue; const i = f.inp;
      if (i.l) f.x -= SPEED; if (i.r) f.x += SPEED; if (i.u) f.y -= SPEED * 0.7; if (i.d) f.y += SPEED * 0.7;
      f.x = clampX(f.x); f.y = clampY(f.y);
    }
    // stars
    for (const s of this.stars) { s.y += s.vy;
      if (!s.done && s.y < BOSS_Y - 10 && s.y > BOSS_TOP && Math.abs(s.x - b.x) < BOSS_HW + (s.big ? 10 : 0)) { s.done = true; b.hp = Math.max(0, b.hp - s.dmg); b.flinch = s.big ? 12 : 5; } }
    this.stars = this.stars.filter(s => !s.done && s.y > -20);
    // bombs
    for (const m of this.bombs) { m.t--; if (m.t === 0) for (const f of this.fighters) if (Math.hypot((f.x - m.x) / 1.3, f.y - m.y) < 24) this.hurt(f, b.enr ? 25 : 20); }
    this.bombs = this.bombs.filter(m => m.t > -8);
    // laser
    const L = this.laser;
    if (L) { if (L.warn > 0) L.warn--; else { L.k++; const sx = L.x0 + (L.x1 - L.x0) * (L.k / L.dur);
        for (const f of this.fighters) if (!L.hit.has(f.sid) && Math.abs(f.x - sx) < 16) { L.hit.add(f.sid); this.hurt(f, b.enr ? 30 : 22); }
        if (L.k >= L.dur) this.laser = null; } }
    // frogs
    for (const fr of this.frogs) { fr.x += fr.vx; fr.y += fr.vy;
      for (const f of this.fighters) if (!fr.done && f.alive && Math.hypot(f.x - fr.x, f.y - 14 - fr.y) < 20) { fr.done = true; this.hurt(f, 15); } }
    this.frogs = this.frogs.filter(fr => !fr.done && fr.x > -20 && fr.x < W + 20 && fr.y < H + 20);
    const left = TIME_LIMIT - Math.floor(this.ticks * TICK / 1000);
    this.io.to(this.room).emit('r:state', this.snapshot(left));
    if (b.hp <= 0) this.end(true); else if (left <= 0 || !this.fighters.some(f => f.alive)) this.end(false);
  }
  snapshot(left) {
    const b = this.boss, L = this.laser, r1 = v => Math.round(v * 10) / 10;
    return { t: left, b: [r1(b.x), Math.ceil(b.hp), b.max, b.enr ? 1 : 0, b.flinch],
      p: this.fighters.map(f => [f.sid, r1(f.x), r1(f.y), f.hp, f.alive ? 1 : 0, f.sk, f.inv]),
      s: this.stars.map(s => [s.id, r1(s.x), r1(s.y), s.vy, s.big]), m: this.bombs.map(m => [m.x | 0, m.y | 0, m.t, m.max]),
      f: this.frogs.map(f => [r1(f.x), r1(f.y), r1(f.vx), r1(f.vy)]), l: L ? [L.x0, L.x1, L.warn, L.k, L.dur] : null };
  }
  end(win) {
    this.over = true; clearInterval(this.timer);
    const results = this.players.map(p => ({ sid: p.sid, id: p.id, nickname: p.look.nickname, coins: win ? this.D.reward : 5, energy: this.paid, left: p.left }));
    this.onEnd(win, results, this.D.name, Math.ceil(this.boss.hp), this.boss.max);
    for (const p of this.players) p.socket.leave(this.room);
    this.players = []; this.fighters = null; this.state = 'lobby'; this.diff = 'normal'; this.emitLobby();
  }
}
const clampX = x => Math.max(16, Math.min(W - 16, x)), clampY = y => Math.max(GY0, Math.min(GY1, y));
module.exports = { DIFF, RaidLobby, W, H, GY0, GY1, SPEED, TIME_LIMIT };
