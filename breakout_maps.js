// 벽돌부수기 map generator: 200 maps on a 10x10 grid, structure gets more complex with difficulty.
//  tier 0 (easy, maps 0-59):   simple rows / blocks / stripes, 1-hit (2-hit sprinkles at the end), >= 10 bricks
//  tier 1 (mid, 60-139):       shapes & patterns: pyramid, diamond, checkerboard, columns, heart, letters, tunnels; 1-2 hit, steel posts late
//  tier 2 (hard, 140-199):     steel walls / mazes, cages with narrow openings, layered shells (steel > 2 > 3), corridors,
//                              diagonal deflectors, asymmetric layouts, pockets under steel roofs (bank shots)
// '.' empty, '1'-'3' hits, '#' steel. Every map is checked: all bricks reachable from outside through non-steel cells.
const COLS = 10, ROWS = 10;
function rng(seed) { return () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648; }
const blank = () => Array.from({ length: ROWS }, () => Array(COLS).fill('.'));
const put = (g, r, c, v) => { if (r >= 0 && r < ROWS && c >= 0 && c < COLS) g[r][c] = v; };
const rect = (g, r0, c0, h, w, v) => { for (let r = r0; r < r0 + h; r++) for (let c = c0; c < c0 + w; c++) put(g, r, c, v); };
const ring = (g, r0, c0, h, w, v) => { for (let r = r0; r < r0 + h; r++) for (let c = c0; c < c0 + w; c++) if (r === r0 || r === r0 + h - 1 || c === c0 || c === c0 + w - 1) put(g, r, c, v); };
const mirror = g => { for (const row of g) for (let c = 0; c < COLS / 2; c++) row[COLS - 1 - c] = row[c]; return g; };
const LETTERS = { A: ['.###.', '#...#', '#####', '#...#', '#...#'], H: ['#...#', '#...#', '#####', '#...#', '#...#'], T: ['#####', '..#..', '..#..', '..#..', '..#..'],
  X: ['#...#', '.#.#.', '..#..', '.#.#.', '#...#'], O: ['.###.', '#...#', '#...#', '#...#', '.###.'], S: ['.####', '#....', '.###.', '....#', '####.'],
  Z: ['#####', '...#.', '..#..', '.#...', '#####'], M: ['#...#', '##.##', '#.#.#', '#...#', '#...#'] };
const HEART = ['.##..##.', '########', '########', '.######.', '..####..', '...##...'];
// hp for a cell: base + chance of extra, capped at 3
const hpf = (rnd, base, extra) => String(Math.min(3, base + (rnd() < extra ? 1 : 0) + (rnd() < extra * 0.4 ? 1 : 0)));
const EASY = {
  rows(g, rnd, t) { const n = 1 + Math.floor(rnd() * 2 + t * 4), top = 1 + Math.floor(rnd() * 2), sp = rnd() < 0.3 ? 2 : 1;
    for (let i = 0; i < n; i++) rect(g, top + i * sp, 0, 1, COLS, hpf(rnd, 1, t * 0.5)); },
  blocks(g, rnd, t) { const k = 2 + Math.floor(rnd() * 2); for (let i = 0; i < k; i++) rect(g, 1 + Math.floor(rnd() * 3), Math.floor(i * COLS / k) + (rnd() < 0.5 ? 0 : 1), 2 + Math.floor(rnd() * 2 + t * 2), Math.floor(COLS / k) - (k === 2 ? 1 : 0), hpf(rnd, 1, t * 0.5)); },
  wall(g, rnd, t) { const w = 6 + Math.floor(rnd() * 5), h = 2 + Math.floor(t * 3), c0 = Math.floor(rnd() * (COLS - w + 1)); rect(g, 1, c0, h, w, hpf(rnd, 1, t * 0.5)); if (rnd() < 0.5) rect(g, 1, c0 + Math.floor(w / 2), h, 1, '.'); },
};
const MID = {
  pyramid(g, rnd, t) { const h = 4 + Math.floor(rnd() * 2); for (let r = 0; r < h; r++) rect(g, 1 + r, Math.max(0, 4 - r), 1, Math.min(COLS, 2 + 2 * r), hpf(rnd, 1 + (r < 2 && t > 0.5 ? 1 : 0), t * 0.5)); },
  diamond(g, rnd, t) { for (let r = 0; r < 7; r++) { const w = r < 4 ? r : 6 - r; rect(g, 1 + r, 4 - w, 1, 2 + 2 * w, hpf(rnd, 1, t * 0.6)); } if (t > 0.5) rect(g, 3, 4, 3, 2, '3'); },
  checker(g, rnd, t) { const h = 4 + Math.floor(rnd() * 3), o = Math.floor(rnd() * 2); for (let r = 0; r < h; r++) for (let c = 0; c < COLS; c++) if ((r + c + o) % 2 === 0) put(g, 1 + r, c, hpf(rnd, 1, t * 0.6)); },
  columns(g, rnd, t) { for (let c = 0; c < COLS; c += 3) { rect(g, 1, c, 6, 2, hpf(rnd, 1, t * 0.6)); if (t > 0.55) put(g, 7, c, '#'); } },
  heart(g, rnd, t) { HEART.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === '#') put(g, 1 + r, 1 + c, r < 2 ? hpf(rnd, 2, t * 0.3) : hpf(rnd, 1, t * 0.5)); })); },
  letters(g, rnd, t) { const ks = Object.keys(LETTERS), a = LETTERS[ks[Math.floor(rnd() * ks.length)]];
    a.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === '#') { put(g, 2 + r, c, hpf(rnd, 1, t * 0.6)); put(g, 2 + r, COLS - 1 - c, hpf(rnd, 1, t * 0.6)); } })); },
  tunnels(g, rnd, t) { rect(g, 1, 0, 5 + Math.floor(t * 2), COLS, '1'); for (let r = 1; r < 8; r++) for (let c = 0; c < COLS; c++) if (g[r][c] === '1') g[r][c] = hpf(rnd, 1, t * 0.7);
    for (const c of [2, 7]) rect(g, 3, c, 5, 1, '.'); if (t > 0.6) { put(g, 2, 2, '#'); put(g, 2, 7, '#'); } },
};
const HARD = {
  cage(g, rnd, t) { const n = 1 + Math.floor(rnd() * 2); for (let i = 0; i < n; i++) { const w = n === 1 ? 6 : 4, c0 = n === 1 ? 2 : 1 + i * 4, r0 = 1 + Math.floor(rnd() * 2);
      ring(g, r0, c0, 5, w, '#'); rect(g, r0 + 1, c0 + 1, 3, w - 2, '3'); const side = Math.floor(rnd() * 3); // narrow opening: bottom, left or right
      if (side === 0) put(g, r0 + 4, c0 + 1 + Math.floor(rnd() * (w - 2)), '.'); else put(g, r0 + 2, side === 1 ? c0 : c0 + w - 1, '.'); }
    for (let c = 0; c < COLS; c++) if (g[8][c] === '.') put(g, 8, c, hpf(rnd, 1, 0.5)); },
  shell(g, rnd, t) { ring(g, 1, 1, 8, 8, '#'); ring(g, 2, 2, 6, 6, '2'); rect(g, 3, 3, 4, 4, '3'); const o = Math.floor(rnd() * 4);
    if (o === 0) put(g, 8, 4 + Math.floor(rnd() * 2), '.'); else if (o === 1) put(g, 5, 1, '.'); else if (o === 2) put(g, 4, 8, '.'); else put(g, 1, 3 + Math.floor(rnd() * 4), '.');
    for (let r = 0; r < ROWS; r++) for (const c of [0, 9]) if (rnd() < 0.5) put(g, r, c, '1'); },
  maze(g, rnd, t) { for (let r = 1; r < 9; r++) for (let c = 0; c < COLS; c++) put(g, r, c, hpf(rnd, 1, 0.5));
    for (let r = 2; r < 9; r += 2) { const gap = Math.floor(rnd() * COLS), gap2 = (gap + 3 + Math.floor(rnd() * 4)) % COLS; for (let c = 0; c < COLS; c++) if (![gap, gap + 1, gap2, gap2 + 1].includes(c)) put(g, r, c, rnd() < 0.25 ? '1' : '#'); } }, // 2-wide gaps
  corridors(g, rnd, t) { for (const c of [0, 3, 6, 9]) rect(g, 1, c, 8, 1, '#'); for (let c = 0; c < COLS; c++) if (g[1][c] !== '#') rect(g, 1, c, 7, 1, hpf(rnd, 2, 0.5));
    for (const c of [3, 6]) put(g, 3 + Math.floor(rnd() * 5), c, '.'); rect(g, 0, 0, 1, COLS, '#'); for (const c of [1, 4, 7]) if (rnd() < 0.5) put(g, 0, c + 1, '.'); },
  diagonal(g, rnd, t) { for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (r < 8) put(g, r, c, hpf(rnd, 1, 0.8));
    const d = rnd() < 0.5; for (let i = 0; i < 7; i++) { put(g, 1 + i, d ? 1 + i : 8 - i, '#'); if (i % 2 === 0) put(g, 1 + i, d ? 2 + i : 7 - i, '#'); } },
  pockets(g, rnd, t) { for (let r = 1; r < 6; r++) for (let c = 0; c < COLS; c++) put(g, r, c, hpf(rnd, 1, 0.6)); // bricks above steel roofs: reach them by banking round the ends
    rect(g, 3, 1, 1, 8, '#'); rect(g, 6, 0, 1, 4, '#'); rect(g, 6, 6, 1, 4, '#'); rect(g, 7, 2, 2, 6, '1'); put(g, 3 + (rnd() < 0.5 ? 0 : 0), rnd() < 0.5 ? 1 : 8, '.'); },
  asym(g, rnd, t) { for (let r = 0; r < 9; r++) for (let c = 0; c < COLS; c++) { const x = rnd(); put(g, r, c, x < 0.25 ? '.' : x < 0.38 ? '#' : hpf(rnd, 1, 0.7)); }
    ring(g, Math.floor(rnd() * 3), Math.floor(rnd() * 5), 4, 5, '#'); },
};
// all bricks reachable through non-steel cells from outside the grid (ball can travel round the margins)
function reachable(g) { const seen = Array.from({ length: ROWS }, () => Array(COLS).fill(false)), q = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if ((r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1) && g[r][c] !== '#') { seen[r][c] = true; q.push([r, c]); }
  while (q.length) { const [r, c] = q.pop(); for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = r + dr, b = c + dc;
      if (a >= 0 && b >= 0 && a < ROWS && b < COLS && !seen[a][b] && g[a][b] !== '#') { seen[a][b] = true; q.push([a, b]); } } }
  return seen; }
function fix(g, rnd) { for (let k = 0; k < 40; k++) { const s = reachable(g), bad = []; for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (/[123]/.test(g[r][c]) && !s[r][c]) bad.push([r, c]);
    if (!bad.length) return true; const [r, c] = bad[Math.floor(rnd() * bad.length)]; // punch the nearest steel toward the bottom
    for (let a = r + 1; a < ROWS; a++) if (g[a][c] === '#') { g[a][c] = '.'; break; } } return false; }
const count = (m, re) => (m.join('').match(re) || []).length;
// difficulty within a tier: total hits, steel, and how many bricks are hidden from straight below (need angles / bank shots)
function score(m) { let hidden = 0; for (let c = 0; c < COLS; c++) { let blocked = false; for (let r = ROWS - 1; r >= 0; r--) { const ch = m[r][c]; if (ch === '#') blocked = true; else if (ch !== '.' && blocked) hidden++; } }
  return [...m.join('')].reduce((a, ch) => a + (ch === '#' ? 1.5 : ch === '.' ? 0 : (+ch) ** 1.5), 0) + hidden * 3; }
function build() { const rnd = rng(20261103), out = [], seen = new Set();
  const tiers = [[EASY, 60], [MID, 80], [HARD, 60]]; let made = 0;
  tiers.forEach(([fam, n], tier) => { const names = Object.keys(fam), list = []; let tries = 0;
    while (list.length < n && tries++ < 200000) { const t = list.length / n, name = names[(list.length + Math.floor(rnd() * 2)) % names.length], g = blank();
      fam[name](g, rnd, tier === 0 ? t * 0.6 : tier === 1 ? 0.3 + t * 0.6 : t);
      if (tier < 2) { const k = Math.floor(rnd() * 5); for (let j = 0; j < k; j++) put(g, Math.floor(rnd() * ROWS), Math.floor(rnd() * COLS), '.'); } // small random holes = variety
      if (tier < 2 && name !== 'letters' && rnd() < 0.5) mirror(g);
      if (tier < 2) { let low = ROWS - 1; while (low > 0 && g[low].every(ch => ch === '.')) low--; const sh = Math.max(0, (tier === 0 ? 8 : 7) - low); // sit lower = quicker hits
        if (sh) g.splice(0, 0, ...g.splice(ROWS - sh, sh)); }
      g[0] = g[0].map(ch => ch === '#' ? '.' : ch); // no steel on the top row: nothing can trap the ball above the grid
      if (!fix(g, rnd)) continue; const m = g.map(r => r.join('')).filter((r, i, a) => true), key = m.join('/');
      const bricks = count(m, /[123]/g), hits = [...m.join('')].reduce((a, ch) => a + (/[123]/.test(ch) ? +ch : 0), 0); if (hits > 40 + tier * 30 + t * 30) continue; if (bricks < (tier === 0 ? 10 : 14) || bricks > (tier === 0 ? 12 + Math.floor(list.length / 4) : 80) || seen.has(key)) continue;
      if (tier === 0 && count(m, /[3#]/g)) continue; seen.add(key); list.push({ m, name, tier, s: score(m) }); }
    list.sort((a, b) => a.s - b.s); out.push(...list); made += list.length; });
  return out; }
const BUILT = build();
const MAPS = BUILT.map(x => x.m), KIND = BUILT.map(x => x.name), TIER = BUILT.map(x => x.tier);
const difficulty = m => TIER[MAPS.indexOf(m)] * 1000 + score(m);
module.exports = { MAPS, KIND, TIER, difficulty, reachable, COLS, ROWS };
if (require.main === module) { console.log(MAPS.length, new Set(MAPS.map(m => m.join('/'))).size);
  for (const i of [0, 16, 36, 76, 116, 156, 176, 196]) console.log('\n#' + i, KIND[i], score(MAPS[i]).toFixed(0) + '\n' + MAPS[i].join('\n')); }
