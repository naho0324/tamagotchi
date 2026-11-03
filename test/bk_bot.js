// shared aiming bot for sims: predicts where the ball lands (with wall bounces), then offsets the paddle so the bounce heads at a remaining brick.
// err = random aim error in px (0 = perfect).
module.exports = function aim(L, sid, n, err = 0) { const p = L.paddles.find(q => q.sid === sid); if (!p) return;
  const mine = L.balls.filter(b => !b.wait && (L.paddles.length < 2 || (b.x >= p.lo && b.x < p.hi)));
  const b = mine.filter(b => b.vy > 0).sort((x, y) => y.y - x.y)[0] || mine[0]; if (!b) return;
  let lx = b.x; if (b.vy > 0) { lx = b.x + b.vx * (291 - b.y) / b.vy; const W2 = 470; lx = ((lx - 5) % (2 * W2) + 2 * W2) % (2 * W2); lx = 5 + (lx > W2 ? 2 * W2 - lx : lx); }
  const left = L.bricks.map((v, j) => v && v < 9 ? j : -1).filter(j => j >= 0), tgt = left[(n >> 7) % Math.max(1, left.length)]; let off = 0;
  if (tgt !== undefined) { const tx = 25 + (tgt % 10) * 43 + 21, ty = 28 + Math.floor(tgt / 10) * 14 + 7; off = Math.max(-0.9, Math.min(0.9, Math.atan2(tx - lx, 296 - ty) / 1.05)); }
  L.input(sid, lx - off * p.w / 2 + err); };
