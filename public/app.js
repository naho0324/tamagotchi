const $ = s => document.querySelector(s);
const STAGE_KO = { egg: '알', baby: '아기', child: '어린이', adult: '어른', dead: '하늘나라' };
let prevStage = null, S = null, socket = null, clockSkew = 0;
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 1800); }
function closeModal(id) { $('#' + id).classList.add('hidden'); }
function show(id) { document.querySelectorAll('.screen').forEach(s => s.classList.toggle('hidden', s.id !== id)); }

// ---- identity (swap for Discord later: just provide auth payload) ----
function getIdentity() { const id = localStorage.getItem('tg_pid'), nick = localStorage.getItem('tg_nick'); return id && nick ? { playerId: id, nickname: nick } : null; }
function start() {
  const ident = getIdentity();
  if (!ident) { $('#nick-modal').classList.remove('hidden'); $('#nick').focus(); return; }
  socket = io({ auth: ident, transports: ['websocket'] });
  socket.on('connect_error', e => toast('연결 실패: ' + e.message));
  socket.on('state', st => { S = st;
    if (prevStage === 'egg' && st.pet.stage === 'baby') toast('알이 깨어났어요! 누구일까? 🎉'); prevStage = st.pet.stage;
    clockSkew = st.now - Date.now(); renderHud(); });
  bindSocket();
}
$('#nick-ok').onclick = () => {
  const n = $('#nick').value.trim(); if (!n) return toast('닉네임을 입력해주세요');
  localStorage.setItem('tg_nick', n.slice(0, 12));
  if (!localStorage.getItem('tg_pid')) localStorage.setItem('tg_pid', (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)));
  closeModal('nick-modal'); start();
};
$('#nick').onkeydown = e => { if (e.key === 'Enter') $('#nick-ok').click(); };

// ---- HOME ----
function renderHud() {
  if (!S) return;
  $('#coins').textContent = S.coins;
  for (const k of ['hunger', 'happy', 'energy', 'clean']) { const v = S.pet.stats[k], el = $('#b-' + k); el.style.width = v + '%'; el.classList.toggle('low', v < 25 && !['egg','dead'].includes(S.pet.stage)); }
  const p = S.pet; let st = `${S.nickname}의 펫 · ${STAGE_KO[p.stage]}`;
  if (p.stage === 'egg') { const left = Math.max(0, Math.ceil((p.bornAt + S.cfg.hatchMs - (Date.now() + clockSkew)) / 1000)); st += ` · 부화까지 ${left}초`; }
  if (p.sick) st += ' · 아파요! 약이 필요해요'; if (p.sleeping) st += ' · 자는 중'; if (p.stage === 'dead') st += ' · 화면을 눌러 다시 시작';
  $('#status').textContent = st;
  if (!$('#shop-modal').classList.contains('hidden')) renderShop();
}
setInterval(() => { renderHud(); if (S && S.pet.stage === 'egg' && Date.now() + clockSkew > S.pet.bornAt + S.cfg.hatchMs + 500) socket.emit('sync'); }, 1000);
setInterval(() => socket && socket.connected && socket.emit('sync'), 30000);
const BG = new Image(); BG.src = 'assets/room.jpg';
const roomCv = $('#room'), rctx = roomCv.getContext('2d'); rctx.imageSmoothingEnabled = false;
let fx = [];
function drawRoom(t) {
  rctx.drawImage(BG, 0, 0, 480, 270);
  if (S) {
    const look = { ...S.pet, wearing: S.wearing };
    drawPet(rctx, 240, 238, S.pet.stage === 'egg' ? 120 : S.pet.stage === 'baby' ? 70 : S.pet.stage === 'child' ? 105 : 130, look, t);
    if (S.pet.sleeping) { rctx.fillStyle = 'rgba(29,37,87,.25)'; rctx.fillRect(0, 0, 480, 270); }
  }
  fx = fx.filter(f => t - f.t0 < 1200);
  for (const f of fx) { const a = (t - f.t0) / 1200; rctx.globalAlpha = 1 - a; rctx.font = '26px sans-serif'; rctx.fillText(f.e, f.x, f.y - a * 50); }
  rctx.globalAlpha = 1;
}
const EMO = { feed: '🍚', play: '💗', wash: '🫧', sleep: '💤', use: '✨' };
// Optimistic local prediction; server state (sent right after) is authoritative and overwrites it.
const OPT_MSG = { feed: '냠냠! 배불러요', play: '신나요!', wash: '뽀득뽀득 깨끗해요' };
function predict(action, arg) {
  if (!S) return false; const p = S.pet, st = p.stats, alive = !['egg', 'dead'].includes(p.stage), c = v => Math.max(0, Math.min(100, v));
  if (['feed', 'play', 'sleep', 'wash'].includes(action) && !alive) return false;
  if (action === 'feed' && !p.sleeping) st.hunger = c(st.hunger + 25);
  else if (action === 'play' && !p.sleeping && st.energy >= 10) { st.happy = c(st.happy + 20); st.energy = c(st.energy - 8); st.hunger = c(st.hunger - 3); }
  else if (action === 'wash') st.clean = 100;
  else if (action === 'sleep') p.sleeping = !p.sleeping;
  else if (action === 'buy' && S.shop[arg] && S.coins >= S.shop[arg].price) { S.coins -= S.shop[arg].price; if (S.shop[arg].type === 'consumable') S.inventory[arg] = (S.inventory[arg] || 0) + 1; else if (!S.owned.includes(arg)) S.owned.push(arg); }
  else if (action === 'equip' && S.shop[arg]) { const slot = S.shop[arg].type === 'hat' ? 'hat' : 'clothes'; S.wearing[slot] = S.wearing[slot] === arg ? null : arg; }
  else if (action === 'use' && S.inventory[arg] > 0) { S.inventory[arg]--; if (arg === 'snack') { st.hunger = c(st.hunger + 40); st.happy = c(st.happy + 10); } else p.sick = false; }
  else return false;
  return true;
}
function act(action, arg) {
  const ok = predict(action, arg);
  if (ok) { renderHud(); if (EMO[action]) for (let i = 0; i < 3; i++) fx.push({ e: EMO[action], x: 200 + Math.random() * 80, y: 140 + Math.random() * 30, t0: performance.now() + i * 120 }); }
  const t0 = performance.now();
  socket.emit('act', { action, arg }, r => {
    if (!r.ok || !ok || r.coins || performance.now() - t0 > 400) toast(r.msg + (r.coins ? ` (+${r.coins}코인)` : ''));
  });
  if (ok && OPT_MSG[action]) toast(OPT_MSG[action]);
}
document.querySelectorAll('.buttons button').forEach(b => b.onclick = () => {
  const a = b.dataset.act;
  if (a === 'shop') { renderShop(); $('#shop-modal').classList.remove('hidden'); }
  else if (a === 'plaza') enterPlaza();
  else act(a);
});
roomCv.onclick = () => { if (S && S.pet.stage === 'dead') act('restart'); };
function renderShop() {
  const sl = $('#shop-list'); sl.innerHTML = '';
  for (const [k, it] of Object.entries(S.shop)) {
    const owned = S.owned.includes(k), d = document.createElement('div'); d.className = 'item';
    d.innerHTML = `<span>${it.name} <small>🪙${it.price}</small></span>`;
    const b = document.createElement('button'); b.className = 'small';
    if (it.type !== 'consumable' && owned) { const w = S.wearing.hat === k || S.wearing.clothes === k; b.textContent = w ? '벗기' : '입기'; b.onclick = () => act('equip', k); }
    else { b.textContent = '구매'; b.onclick = () => act('buy', k); }
    d.appendChild(b); sl.appendChild(d);
  }
  const il = $('#inv-list'); il.innerHTML = '';
  for (const k of ['snack', 'medicine']) { const d = document.createElement('div'); d.className = 'item'; d.innerHTML = `<span>${S.shop[k].name} x${S.inventory[k] || 0}</span>`;
    const b = document.createElement('button'); b.className = 'small'; b.textContent = '사용'; b.onclick = () => act('use', k); d.appendChild(b); il.appendChild(d); }
}

// ---- PLAZA ----
const pcv = $('#plazaCv'), pctx = pcv.getContext('2d'); pctx.imageSmoothingEnabled = false;
let plazaList = [], plazaDisp = {}, me = { x: 240, y: 220, tx: 240, ty: 220 }, inPlaza = false, lastMove = 0;
function enterPlaza() { show('plaza'); inPlaza = true; socket.emit('plaza:join'); $('#match-status').textContent = '화면을 눌러 이동해요'; }
$('#plaza-back').onclick = () => { socket.emit('plaza:leave'); socket.emit('v:cancel'); inPlaza = false; show('home'); };
pcv.addEventListener('pointerdown', e => { const r = pcv.getBoundingClientRect(); me.tx = (e.clientX - r.left) / r.width * 480; me.ty = Math.max(150, (e.clientY - r.top) / r.height * 300); });
const sendChat = () => { const v = $('#chat').value.trim(); if (v) { socket.emit('plaza:chat', v); $('#chat').value = ''; } };
$('#chat-send').onclick = sendChat; $('#chat').onkeydown = e => { if (e.key === 'Enter') sendChat(); };
$('#match').onclick = () => { socket.emit('v:queue'); };
$('#practice').onclick = () => socket.emit('v:practice');
function drawPlaza(t) {
  // background: sky, grass, path
  pctx.fillStyle = '#bfe3f7'; pctx.fillRect(0, 0, 480, 300);
  pctx.fillStyle = '#fff'; for (const [x, y] of [[60, 30], [300, 50], [420, 20]]) { pctx.fillRect(x, y, 50, 12); pctx.fillRect(x + 10, y - 8, 28, 10); }
  pctx.fillStyle = '#a8e6c1'; pctx.fillRect(0, 130, 480, 170);
  pctx.fillStyle = '#f5deb3'; pctx.fillRect(0, 200, 480, 40);
  pctx.fillStyle = '#1d2557'; pctx.fillRect(0, 128, 480, 3);
  for (let i = 0; i < 8; i++) { pctx.fillStyle = '#7cc99a'; pctx.fillRect(20 + i * 62, 150 + (i % 2) * 70, 10, 6); }
  // fountain
  pctx.fillStyle = '#1d2557'; pctx.fillRect(206, 96, 68, 40); pctx.fillStyle = '#9fd3f7'; pctx.fillRect(210, 100, 60, 32);
  pctx.fillStyle = '#fff'; pctx.fillRect(236, 70 + Math.sin(t / 200) * 3, 8, 30);
  // move self
  const dx = me.tx - me.x, dy = me.ty - me.y, d = Math.hypot(dx, dy), walking = d > 2;
  if (walking) { me.x += dx / d * Math.min(d, 2.2); me.y += dy / d * Math.min(d, 2.2); }
  if (t - lastMove > 80) { socket.emit('plaza:move', { x: me.x, y: me.y }); lastMove = t; }
  const ents = plazaList.map(e => {
    let p = plazaDisp[e.sid] || (plazaDisp[e.sid] = { x: e.x, y: e.y });
    if (e.sid === socket.id) { p.x = me.x; p.y = me.y; p.w = walking; }
    else { const ox = p.x, oy = p.y; p.x += (e.x - p.x) * 0.2; p.y += (e.y - p.y) * 0.2; p.w = Math.hypot(p.x - ox, p.y - oy) > 0.3; }
    return { e, p };
  }).sort((a, b) => a.p.y - b.p.y);
  for (const { e, p } of ents) {
    const sz = e.stage === 'egg' ? 44 : e.stage === 'baby' ? 34 : e.stage === 'child' ? 50 : 60;
    drawPet(pctx, p.x, p.y, sz, e, t + p.x * 10, { walking: p.w });
    pctx.font = '11px Galmuri9, monospace'; pctx.textAlign = 'center';
    const name = e.nickname + (e.sid === socket.id ? ' (나)' : ''); const w = pctx.measureText(name).width + 8;
    pctx.fillStyle = e.sid === socket.id ? '#f7a8c4' : '#fff5f8'; pctx.fillRect(p.x - w / 2, p.y + 3, w, 14);
    pctx.fillStyle = '#1d2557'; pctx.fillText(name, p.x, p.y + 14);
    if (e.chat) { pctx.font = '12px Galmuri11, monospace'; const cw = pctx.measureText(e.chat).width + 12; const cy = p.y - sz - 26;
      pctx.fillStyle = '#1d2557'; pctx.fillRect(p.x - cw / 2 - 2, cy - 2, cw + 4, 22); pctx.fillStyle = '#fff'; pctx.fillRect(p.x - cw / 2, cy, cw, 18);
      pctx.fillStyle = '#1d2557'; pctx.fillText(e.chat, p.x, cy + 13); }
    pctx.textAlign = 'left';
  }
  $('#plaza-count').textContent = `접속 ${plazaList.length}명`;
}

// ---- VOLLEY ----
const vcv = $('#vCv'), vctx = vcv.getContext('2d'); vctx.imageSmoothingEnabled = false;
let V = null; const keys = { left: false, right: false, up: false };
const KEYMAP = { ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right', ArrowUp: 'up', w: 'up', W: 'up', ' ': 'up' };
function sendInput() { if (V) socket.emit('v:input', { left: keys.left, right: keys.right, up: keys.up }); }
addEventListener('keydown', e => { const k = KEYMAP[e.key]; if (k && V) { e.preventDefault(); if (!keys[k]) { keys[k] = true; sendInput(); } } });
addEventListener('keyup', e => { const k = KEYMAP[e.key]; if (k && V) { keys[k] = false; sendInput(); } });
document.querySelectorAll('.touch button').forEach(b => {
  const k = b.dataset.k; const on = v => e => { e.preventDefault(); keys[k] = v; sendInput(); };
  b.addEventListener('pointerdown', on(true)); b.addEventListener('pointerup', on(false)); b.addEventListener('pointerleave', on(false)); b.addEventListener('pointercancel', on(false));
});
$('#v-quit').onclick = () => socket.emit('v:leave');
// physics constants mirror volley.js
const VW = 480, VG = 270, VPR = 26, VNET = 240, VNW = 8, INTERP_MS = 70;
function predictStep(me, side) {
  if (keys.left) me.x -= 5; if (keys.right) me.x += 5;
  if (keys.up && me.y >= VG - VPR - 0.1) me.vy = -10.5;
  me.vy += 0.45; me.y += me.vy; if (me.y > VG - VPR) { me.y = VG - VPR; me.vy = 0; }
  const lo = side === 0 ? VPR : VNET + VNW / 2 + VPR, hi = side === 0 ? VNET - VNW / 2 - VPR : VW - VPR;
  me.x = Math.max(lo, Math.min(hi, me.x));
}
function interpSnap(now) { // returns {p, b} interpolated at now-INTERP_MS
  const buf = V.buf, rt = now - INTERP_MS; if (!buf.length) return null;
  let i = buf.length - 1; while (i > 0 && buf[i - 1].t > rt) i--;
  const b = buf[i], a = buf[i - 1] || b; if (a === b || rt >= b.t) return b.st;
  const k = Math.max(0, Math.min(1, (rt - a.t) / (b.t - a.t))), L = (x, y) => x + (y - x) * k;
  return { p: b.st.p.map((q, j) => [L(a.st.p[j][0], q[0]), L(a.st.p[j][1], q[1])]), b: [L(a.st.b[0], b.st.b[0]), L(a.st.b[1], b.st.b[1])], pause: b.st.pause };
}
function drawVolley(t) {
  const c = vctx; c.fillStyle = '#bfe3f7'; c.fillRect(0, 0, 480, 300);
  c.fillStyle = '#fff'; c.fillRect(40, 40, 60, 14); c.fillRect(360, 60, 70, 14);
  c.fillStyle = '#ffe98a'; c.fillRect(400, 20, 30, 30); c.fillStyle = '#f5deb3'; c.fillRect(0, 270, 480, 30); c.fillStyle = '#1d2557'; c.fillRect(0, 268, 480, 3);
  c.fillStyle = '#1d2557'; c.fillRect(236, 170, 8, 100); c.fillStyle = '#fff'; c.fillRect(238, 172, 4, 96);
  if (!V || !V.state) return;
  // advance local prediction at fixed 60Hz
  const now = performance.now(); V.acc += Math.min(250, now - (V.lastT || now)); V.lastT = now;
  while (V.acc >= 1000 / 60) { predictStep(V.pred, V.side); V.acc -= 1000 / 60; }
  const s = interpSnap(now) || V.state;
  const pos = s.p.map((q, i) => i === V.side ? [V.pred.x, V.pred.y] : q);
  pos.forEach(([x, y], i) => {
    const look = V.players[i]; drawPet(c, x, y + 26, 62, look.stage === 'egg' ? { ...look, stage: 'baby' } : look, t, { walking: true });
    c.font = '11px Galmuri9, monospace'; c.textAlign = 'center'; c.fillStyle = i === V.side ? '#c2455a' : '#1d2557'; c.fillText(look.nickname + (i === V.side ? ' (나)' : ''), x, y - 44); c.textAlign = 'left';
  });
  const [bx, by] = s.b; c.fillStyle = '#1d2557'; c.beginPath(); c.arc(bx, by, 16, 0, 7); c.fill();
  c.fillStyle = '#fff5f8'; c.beginPath(); c.arc(bx, by, 13, 0, 7); c.fill(); c.fillStyle = '#f27a9a'; c.fillRect(bx - 13, by - 2, 26, 4); c.fillStyle = '#6aa9f2'; c.fillRect(bx - 2, by - 13, 4, 26);
  c.fillStyle = 'rgba(29,37,87,.25)'; c.fillRect(bx - 12, 268, 24, 3);
  if (s.pause) { c.fillStyle = '#1d2557'; c.font = '20px Galmuri11, monospace'; c.textAlign = 'center'; c.fillText('준비!', 240, 120); c.textAlign = 'left'; }
}

// ---- SNAKE ----
const scv = $('#sCv'), sctx = scv.getContext('2d'); sctx.imageSmoothingEnabled = false;
let SN = null, snLobby = null; const CELL = 16;
$('#snake-btn').onclick = () => { socket.emit('plaza:leave'); socket.emit('v:cancel'); show('snake'); SN = null; $('#sCv').classList.add('hidden'); $('#s-lobby').classList.remove('hidden'); socket.emit('s:join'); };
$('#s-back').onclick = () => { socket.emit('s:leave'); SN = null; enterPlaza(); };
$('#s-start').onclick = () => socket.emit('s:start');
const SKEY = { ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down', ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right' };
const SD = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
function myServerSnake() { return SN && SN.cur && SN.cur.s.find(s => s.sid === socket.id); }
function turn(d) { // queue up to 2 turns locally (same rule as server) and send immediately
  const me = myServerSnake(); if (!me || !me.a) return;
  const last = SN.q.length ? SN.q[SN.q.length - 1] : me.d; if (last === d) return;
  if (SD[last][0] + SD[d][0] === 0 && SD[last][1] + SD[d][1] === 0) return;
  if (SN.q.length < 2) { SN.q.push(d); socket.emit('s:dir', d); }
}
addEventListener('keydown', e => { if (SN && SKEY[e.key]) { e.preventDefault(); turn(SKEY[e.key]); } });
document.querySelectorAll('.dpad button').forEach(b => b.addEventListener('pointerdown', e => { e.preventDefault(); turn(b.dataset.d); }));
let sw = null; scv.addEventListener('pointerdown', e => sw = [e.clientX, e.clientY]);
scv.addEventListener('pointerup', e => { if (!sw) return; const dx = e.clientX - sw[0], dy = e.clientY - sw[1]; sw = null; if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;
  turn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up')); });
function renderLobby(l) {
  snLobby = l; const pl = $('#s-players'); pl.innerHTML = '';
  l.players.forEach(p => { const d = document.createElement('div'); d.className = 'item';
    d.innerHTML = `<span><span class="dot" style="background:${p.color}"></span>${p.nickname}${p.sid === socket.id ? ' (나)' : ''}</span><span>${p.sid === l.host ? '👑 방장' : ''}</span>`; pl.appendChild(d); });
  const host = l.host === socket.id;
  $('#s-start').classList.toggle('hidden', !host || l.state !== 'lobby');
  $('#s-info').textContent = l.state === 'playing' ? '게임 진행 중...' : l.countdown ? `${l.countdown}초 후 자동 시작!` : l.players.length < 2 ? '친구를 기다리는 중 · 혼자서도 시작할 수 있어요' : '';
}
function drawSnake(t) {
  const c = sctx; c.fillStyle = '#fff5f8'; c.fillRect(0, 0, 480, 320);
  c.fillStyle = '#fbe3ea'; for (let x = 0; x < 30; x++) for (let y = 0; y < 20; y++) if ((x + y) % 2) c.fillRect(x * CELL, y * CELL, CELL, CELL);
  if (!SN || !SN.cur) return; const st = SN.cur;
  const k = Math.min(1, (performance.now() - SN.tAt) / SN.tick); // extrapolate toward next cell
  const cellPx = (x, y) => [x * CELL, y * CELL];
  for (const [x, y] of st.f) { c.fillStyle = '#1d2557'; c.fillRect(x * CELL + 2, y * CELL + 2, 12, 12); c.fillStyle = '#ffd23f'; c.fillRect(x * CELL + 4, y * CELL + 4, 8, 8); c.fillStyle = '#fff'; c.fillRect(x * CELL + 5, y * CELL + 5, 3, 3); }
  for (const s of st.s) {
    c.globalAlpha = s.a ? 1 : 0.3;
    const dir = s.sid === socket.id && SN.q.length ? SN.q[0] : s.d, mv = s.a ? k : 0;
    const pts = s.b.map(([x, y], i) => { const [nx, ny] = i === 0 ? [x + SD[dir][0], y + SD[dir][1]] : s.b[i - 1]; return [x + (nx - x) * mv, y + (ny - y) * mv]; });
    pts.slice(1).reverse().forEach(([x, y]) => { c.fillStyle = '#1d2557'; c.fillRect(x * CELL, y * CELL, CELL, CELL); c.fillStyle = s.c; c.fillRect(x * CELL + 2, y * CELL + 2, 12, 12); });
    const [hx, hy] = pts[0]; c.fillStyle = '#1d2557'; c.fillRect(hx * CELL - 1, hy * CELL - 1, CELL + 2, CELL + 2); c.fillStyle = s.c; c.fillRect(hx * CELL + 1, hy * CELL + 1, 14, 14);
    const sl = SN.looks[s.sid] || {}, look = { ...sl, stage: ['egg', 'dead'].includes(sl.stage) || !sl.stage ? 'baby' : sl.stage, sick: false, sleeping: false };
    drawPet(c, hx * CELL + 8, hy * CELL + 17, 18, look, t, { still: true });
    c.font = '10px Galmuri9, monospace'; c.textAlign = 'center'; c.fillStyle = '#1d2557'; c.fillText(s.n + (s.sid === socket.id ? '(나)' : ''), hx * CELL + 8, hy * CELL - 8); c.textAlign = 'left';
    c.globalAlpha = 1;
  }
}

// ---- RAID (boss 몽꾸) ----
const BOSS = new Image(); BOSS.src = 'assets/boss/monggu.png';
const rcv = $('#rCv'), rc = rcv.getContext('2d'); rc.imageSmoothingEnabled = false;
let RD = null; const rkeys = { l: false, r: false, u: false, d: false };
const RKEY = { ArrowLeft: 'l', a: 'l', A: 'l', ArrowRight: 'r', d: 'r', D: 'r', ArrowUp: 'u', w: 'u', W: 'u', ArrowDown: 'd', s: 'd', S: 'd' };
function rSend() { if (RD) socket.emit('r:input', rkeys); }
function rAct(k) { if (!RD || !RD.cur) return; const me = RD.cur.p.find(q => q[0] === socket.id); if (!me || !me[4]) return;
  if (k === 'skill' && RD.skLocal > 0) return; if (k === 'skill') RD.skLocal = RD.cfg.SKILL_CD; socket.emit('r:act', k); }
addEventListener('keydown', e => { if (!RD) return; const k = RKEY[e.key];
  if (k) { e.preventDefault(); if (!rkeys[k]) { rkeys[k] = true; rSend(); } }
  else if (e.key === ' ' || e.key === 'j' || e.key === 'J') { e.preventDefault(); rAct('atk'); } else if (e.key === 'k' || e.key === 'K') { e.preventDefault(); rAct('skill'); } });
addEventListener('keyup', e => { const k = RKEY[e.key]; if (k && RD) { rkeys[k] = false; rSend(); } });
document.querySelectorAll('.rpad button').forEach(b => { const k = b.dataset.d, on = v => e => { e.preventDefault(); rkeys[k] = v; rSend(); };
  b.addEventListener('pointerdown', on(true)); b.addEventListener('pointerup', on(false)); b.addEventListener('pointerleave', on(false)); b.addEventListener('pointercancel', on(false)); });
let atkHold = null;
$('#r-atk').addEventListener('pointerdown', e => { e.preventDefault(); rAct('atk'); clearInterval(atkHold); atkHold = setInterval(() => rAct('atk'), 320); });
for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) $('#r-atk').addEventListener(ev, () => clearInterval(atkHold));
$('#r-skill').addEventListener('pointerdown', e => { e.preventDefault(); rAct('skill'); });
$('#raid-btn').onclick = () => { socket.emit('plaza:leave'); socket.emit('v:cancel'); show('raid'); RD = null; rcv.classList.add('hidden'); $('#raid .raid-act').classList.add('hidden'); $('#r-lobby').classList.remove('hidden'); socket.emit('r:join'); };
$('#r-back').onclick = () => { socket.emit('r:leave'); RD = null; enterPlaza(); };
$('#r-start').onclick = () => socket.emit('r:start');
const DIFF_KO = { easy: '쉬움', normal: '보통', hard: '어려움' };
document.querySelectorAll('#r-diff button').forEach(b => b.onclick = () => socket.emit('r:diff', b.dataset.d));
function renderRaidLobby(l) {
  document.querySelectorAll('#r-diff button').forEach(b => { b.classList.toggle('sel', b.dataset.d === l.diff); b.disabled = l.host !== socket.id; });
  const pl = $('#r-players'); pl.innerHTML = '';
  l.players.forEach(p => { const d = document.createElement('div'); d.className = 'item';
    d.innerHTML = `<span>${p.nickname}${p.sid === socket.id ? ' (나)' : ''} <small>${STAGE_KO[p.stage] || ''}</small></span><span>${p.sid === l.host ? '👑 방장' : ''}</span>`; pl.appendChild(d); });
  $('#r-start').classList.toggle('hidden', l.host !== socket.id || l.state !== 'lobby');
  $('#r-info').textContent = l.state === 'playing' ? '레이드 진행 중...' : l.countdown ? `${l.countdown}초 후 자동 시작!` : (l.players.length < 2 ? '동료를 기다리는 중 · 혼자서도 도전할 수 있어요' : '') + ` · 난이도: ${DIFF_KO[l.diff] || '보통'}` + (l.host === socket.id ? ' (방장이 선택)' : ' (방장이 고르는 중)');
}
function rPredict(me) { const c = RD.cfg; // same movement rules as raid.js
  if (rkeys.l) me.x -= c.SPEED; if (rkeys.r) me.x += c.SPEED; if (rkeys.u) me.y -= c.SPEED * 0.7; if (rkeys.d) me.y += c.SPEED * 0.7;
  me.x = Math.max(16, Math.min(c.W - 16, me.x)); me.y = Math.max(c.GY0, Math.min(c.GY1, me.y)); }
function heart(c, x, y, s, col) { c.fillStyle = col; const g = ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'];
  g.forEach((r, j) => { for (let i = 0; i < 7; i++) if (r[i] === 'X') c.fillRect(x + (i - 3.5) * s, y + (j - 3) * s, s, s); }); }
function frog(c, x, y, t) { const s = 2.5, g = ['.O...O.', 'OWO.OWO', 'GGGGGGG', 'GGGRGGG', '.GGGGG.', 'G.G.G.G'], pal = { O: '#1d2557', W: '#fff', G: '#7cc95a', R: '#c2455a' };
  c.save(); c.translate(x, y); c.rotate(t / 120); g.forEach((r, j) => { for (let i = 0; i < 7; i++) if (r[i] !== '.') { c.fillStyle = pal[r[i]]; c.fillRect((i - 3.5) * s, (j - 3) * s, s, s); } }); c.restore(); }
function star(c, x, y, s, col) { c.fillStyle = col; const g = ['..X..', '..X..', 'XXXXX', '.XXX.', 'X...X'];
  g.forEach((r, j) => { for (let i = 0; i < 5; i++) if (r[i] === 'X') c.fillRect(x + (i - 2.5) * s, y + (j - 2.5) * s, s, s); }); }
function drawRaid(t) {
  const c = rc; if (!RD || !RD.cur) return; const st = RD.cur, now = performance.now();
  const [bx0, bhp, bmax, enr, flinch] = st.b;
  // dramatic purple sky
  const g = c.createLinearGradient(0, 0, 0, 200); g.addColorStop(0, enr ? '#2a0c2e' : '#1e1442'); g.addColorStop(1, enr ? '#6a2050' : '#5b3a8c'); c.fillStyle = g; c.fillRect(0, 0, 480, 200);
  c.fillStyle = enr ? '#4a1838' : '#3a2866'; for (const [x, y, w] of [[0, 40, 120], [30, 30, 60], [360, 55, 120], [400, 45, 50], [180, 20, 90]]) c.fillRect((x + t / 80) % 560 - 60, y, w, 10);
  c.fillStyle = '#fff'; for (let i = 0; i < 18; i++) { const x = (i * 97) % 480, y = (i * 53) % 150; if ((t / 300 + i) % 4 < 2) c.fillRect(x, y, 2, 2); }
  c.fillStyle = '#4a5a6a'; c.fillRect(0, 175, 480, 125); c.fillStyle = '#6a5a70'; c.fillRect(0, 200, 480, 100); c.fillStyle = '#1d2557'; c.fillRect(0, 198, 480, 2);
  // boss: interpolate x
  RD.bx = RD.bx == null ? bx0 : RD.bx + (bx0 - RD.bx) * 0.25; const bx = RD.bx, by = 150;
  // magic circle
  c.save(); c.translate(bx, by + 6); c.scale(1, 0.28); for (let k = 0; k < 3; k++) { c.strokeStyle = k === 1 ? '#ffd2f0' : '#ff5fc8'; c.lineWidth = k === 1 ? 2 : 4; c.globalAlpha = 0.6 + 0.3 * Math.sin(t / 200 + k);
    c.beginPath(); c.arc(0, 0, 60 + k * 14 + Math.sin(t / 300) * 3, 0, 7); c.stroke(); } c.restore(); c.globalAlpha = 1;
  if (BOSS.complete && BOSS.width) {
    const bh = 122, bw = bh * BOSS.width / BOSS.height, bob = Math.sin(t / 380) * 4, shake = flinch ? (Math.random() - 0.5) * 6 : 0;
    const img = enr ? tinted(BOSS, '#ff2040', 0.32) : BOSS;
    c.save(); c.translate(bx + shake, by + bob); c.scale(1 + Math.sin(t / 160) * 0.015, 1 - Math.sin(t / 160) * 0.01); // cape flutter breathing
    c.drawImage(img, -bw / 2, -bh, bw, bh);
    if (flinch > 2 && Math.floor(t / 60) % 2) { c.globalAlpha = 0.3; c.drawImage(tinted(BOSS, '#ffffff', 0.8), -bw / 2, -bh, bw, bh); c.globalAlpha = 1; }
    if (enr) { c.font = '16px sans-serif'; c.fillText('💢', 22, -bh + 30); }
    c.restore();
  }
  // HP bar
  c.fillStyle = '#fff'; c.font = '12px Galmuri11, monospace'; c.textAlign = 'center'; c.fillText(`몽꾸 HP [${RD.diffName || '보통'}]` + (enr ? ' · 분노!' : ''), 240, 14); c.textAlign = 'left';
  c.fillStyle = '#1d2557'; c.fillRect(98, 18, 284, 12); c.fillStyle = '#5a2a4a'; c.fillRect(100, 20, 280, 8); c.fillStyle = enr ? '#ff3050' : '#f25a7a'; c.fillRect(100, 20, 280 * bhp / bmax, 8);
  // bombs: warning shadow then heart falls
  for (const [x, y, tt, mx] of st.m) {
    if (tt > 0) { const k = 1 - tt / mx; c.fillStyle = `rgba(200,20,80,${0.2 + 0.3 * k})`; c.beginPath(); c.ellipse(x, y, 30 * (0.5 + k / 2), 10 * (0.5 + k / 2), 0, 0, 7); c.fill();
      heart(c, x, y - 220 * (1 - k) - 10, 3, '#ff4f8a'); heart(c, x, y - 220 * (1 - k) - 10, 1.5, '#ffd2e0'); }
    else { c.fillStyle = `rgba(255,120,180,${(8 + tt) / 8})`; c.beginPath(); c.arc(x, y, 30 + -tt * 2, 0, 7); c.fill(); }
  }
  // laser
  if (st.l) { const [x0, x1, warn, k, dur] = st.l, ex = bx - 8, ey = by - 105;
    if (warn > 0) { c.strokeStyle = `rgba(255,40,60,${0.3 + 0.3 * Math.sin(t / 50)})`; c.setLineDash([6, 6]); c.lineWidth = 2; c.beginPath(); c.moveTo(x0, 270); c.lineTo(x1, 270); c.stroke(); c.setLineDash([]);
      c.fillStyle = '#ff3050'; c.font = '14px Galmuri11, monospace'; c.fillText(x1 > x0 ? '▶▶' : '◀◀', x0 + (x1 > x0 ? 0 : -24), 262); }
    else { const sx = x0 + (x1 - x0) * Math.min(1, (k + (now - RD.tAt) / 33) / dur);
      for (const [w, col] of [[14, 'rgba(255,40,60,.5)'], [6, '#ff3050'], [2, '#fff']]) { c.strokeStyle = col; c.lineWidth = w; c.beginPath(); c.moveTo(ex, ey); c.lineTo(sx, 300); c.moveTo(ex + 16, ey); c.lineTo(sx + 6, 300); c.stroke(); } } }
  // players (sorted by y)
  const dt = (now - RD.tAt) / 33;
  const ents = st.p.map(([sid, x, y, hp, alive, sk, inv]) => {
    let d = RD.disp[sid] || (RD.disp[sid] = { x, y });
    if (sid === socket.id) { d.x = RD.pred.x; d.y = RD.pred.y; } else { d.x += (x - d.x) * 0.3; d.y += (y - d.y) * 0.3; }
    return { sid, hp, alive, inv, d };
  }).sort((a, b) => a.d.y - b.d.y);
  for (const e of ents) { const look = RD.looks[e.sid] || {}, stage = ['egg', 'dead'].includes(look.stage) || !look.stage ? 'baby' : look.stage;
    const sz = stage === 'baby' ? 34 : stage === 'child' ? 44 : 52;
    if (!e.alive) { c.globalAlpha = 0.45; } else if (e.inv && Math.floor(t / 80) % 2) c.globalAlpha = 0.4;
    drawPet(c, e.d.x, e.d.y, sz, { ...look, stage, sick: !e.alive, sleeping: false }, t + e.d.x * 7, { walking: e.alive });
    c.globalAlpha = 1;
    if (!e.alive) { c.font = '14px sans-serif'; c.fillText('😵', e.d.x - 8, e.d.y - sz - 2); }
    c.fillStyle = '#1d2557'; c.fillRect(e.d.x - 17, e.d.y + 3, 34, 6); c.fillStyle = e.hp > 30 ? '#7cd97a' : '#f25a5a'; c.fillRect(e.d.x - 16, e.d.y + 4, 32 * e.hp / 100, 4);
    c.font = '10px Galmuri9, monospace'; c.textAlign = 'center'; c.fillStyle = e.sid === socket.id ? '#ffd2e0' : '#fff'; c.fillText((look.nickname || '') + (e.sid === socket.id ? '(나)' : ''), e.d.x, e.d.y + 19); c.textAlign = 'left';
  }
  // stars (extrapolated)
  for (const [, x, y, vy, big] of st.s) { const yy = y + vy * dt; star(c, x, yy, big ? 4 : 2.2, big ? '#ffe14a' : '#fff59a'); if (big) { c.globalAlpha = .4; star(c, x, yy + 14, 3, '#ffb8e0'); c.globalAlpha = 1; } }
  for (const [x, y, vx, vy] of st.f) frog(c, x + vx * dt, y + vy * dt, t);
  if (RD.startAt && now - RD.startAt < 1500) { c.fillStyle = '#fff'; c.font = '22px Galmuri11, monospace'; c.textAlign = 'center'; c.fillText('몽꾸가 나타났다!', 240, 110); c.textAlign = 'left'; }
}
function raidTick() { // fixed-step local prediction for own pet
  if (!RD || !RD.cur) return; const now = performance.now(); RD.acc += Math.min(250, now - (RD.lastT || now)); RD.lastT = now;
  const me = RD.cur.p.find(q => q[0] === socket.id);
  while (RD.acc >= 1000 / 30) { if (me && me[4]) rPredict(RD.pred); if (RD.skLocal > 0) RD.skLocal--; RD.acc -= 1000 / 30; }
  const sk = RD.skLocal > 0; $('#r-skill').disabled = sk || !(me && me[4]); $('#r-skill').textContent = sk ? `✨ 스킬 (${Math.ceil(RD.skLocal / 30)})` : '✨ 스킬';
  $('#r-atk').disabled = !(me && me[4]);
}
function bindRaid() {
  socket.on('r:lobby', l => { if (!$('#raid').classList.contains('hidden') && !RD) renderRaidLobby(l); });
  socket.on('r:start', d => { RD = { diffName: d.diffName, cur: null, looks: d.looks, cfg: d.cfg, disp: {}, pred: { x: 240, y: 255 }, acc: 0, lastT: 0, skLocal: 0, tAt: 0, bx: null, startAt: performance.now(), init: false };
    Object.keys(rkeys).forEach(k => rkeys[k] = false); $('#r-lobby').classList.add('hidden'); rcv.classList.remove('hidden'); $('#raid .raid-act').classList.remove('hidden'); });
  socket.on('r:state', st => { if (!RD) return; RD.cur = st; RD.tAt = performance.now(); $('#r-time').textContent = `⏱ ${Math.floor(st.t / 60)}:${String(st.t % 60).padStart(2, '0')}`;
    const me = st.p.find(q => q[0] === socket.id); if (!me) return; const [, sx, sy, , , sk] = me, P = RD.pred;
    if (!RD.init || Math.hypot(sx - P.x, sy - P.y) > 40) { P.x = sx; P.y = sy; RD.init = true; } else { P.x += (sx - P.x) * 0.08; P.y += (sy - P.y) * 0.08; }
    RD.skLocal = Math.max(sk, Math.min(RD.skLocal, sk + 3)); });
  socket.on('r:end', d => { RD = null; $('#end-title').textContent = (d.win ? '👑 몽꾸 격파!' : '😢 레이드 실패...') + ` (${d.diff})`;
    $('#end-msg').textContent = (d.win ? '모두 함께 승리했어요!' : `몽꾸 HP ${d.hp}/${d.max} 남음`) + ` · 참가자 전원 +${d.results[0] ? d.results[0].coins : 0}코인`;
    $('#end-modal').classList.remove('hidden'); });
}
function bindSocket() {
  bindRaid();
  socket.on('toast', toast);
  socket.on('s:lobby', l => { if (!$('#snake').classList.contains('hidden')) renderLobby(l); });
  socket.on('s:start', d => { SN = { cur: null, q: [], looks: d.looks || {}, tick: d.tick || 100, tAt: 0 }; $('#s-lobby').classList.add('hidden'); $('#sCv').classList.remove('hidden'); });
  socket.on('s:state', st => { if (!SN) return; SN.cur = st; SN.tAt = performance.now();
    const me = st.s.find(s => s.sid === socket.id); if (me) { if (SN.q.length && SN.q[0] === me.d) SN.q.shift(); if (!me.a) SN.q = []; } $('#s-time').textContent = `⏱ ${st.t}초`;
    $('#s-scores').textContent = st.s.map(s => `${s.a ? '' : '💀'}${s.n} ${s.b.length}`).join(' · '); });
  socket.on('s:end', res => { SN = null; const me = res.find(r => r.sid === socket.id);
    $('#end-title').textContent = me && me.rank === 1 ? (res.length > 1 ? '🏆 1등!' : '🐍 게임 끝!') : `${me ? me.rank : '-'}등`;
    $('#end-msg').textContent = res.map(r => `${r.rank}등 ${r.nickname} (길이 ${r.length}) +${r.coins}`).join(' / ');
    $('#end-modal').classList.remove('hidden'); });
  socket.on('plaza:state', l => plazaList = l);
  socket.on('v:waiting', () => $('#match-status').textContent = '상대를 찾는 중... (다른 사람이 매칭을 누르면 시작!)');
  socket.on('v:start', d => { V = { ...d, state: null, buf: [], acc: 0, lastT: 0, pred: { x: d.side === 0 ? 90 : 390, y: 244, vy: 0 } }; Object.keys(keys).forEach(k => keys[k] = false);
    $('#v-names').textContent = `${d.players[0].nickname} vs ${d.players[1].nickname}`; show('volley'); });
  socket.on('v:state', st => { if (V) { V.state = st; V.buf.push({ t: performance.now(), st }); if (V.buf.length > 20) V.buf.shift();
    // reconcile own predicted position toward server (soft), snap if far off
    const [sx, sy, svy] = st.p[V.side], me = V.pred;
    if (Math.abs(sx - me.x) > 60 || Math.abs(sy - me.y) > 80) { me.x = sx; me.y = sy; me.vy = svy; }
    else { me.x += (sx - me.x) * 0.06; if (sy >= 243.9 && me.y >= 243.9) me.y = sy; } $('#v-score').textContent = `${st.s[0]} : ${st.s[1]}`; } });
  socket.on('v:end', d => { const win = V && d.winner === V.side; V = null;
    $('#end-title').textContent = win ? '🏆 승리!' : '😢 패배...';
    $('#end-msg').textContent = `${d.score[0]} : ${d.score[1]}` + (d.forfeit ? ' (기권)' : '') + (d.reward ? ` · +${d.reward}코인` : '');
    $('#end-modal').classList.remove('hidden'); });
}
$('#end-ok').onclick = () => { closeModal('end-modal'); if (!$('#snake').classList.contains('hidden') || !$('#raid').classList.contains('hidden')) { enterPlaza(); return; } if (inPlaza) { show('plaza'); $('#match-status').textContent = '화면을 눌러 이동해요'; } else show('home'); };
function loop(t) {
  if (!$('#home').classList.contains('hidden')) drawRoom(t);
  if (!$('#plaza').classList.contains('hidden') && socket) drawPlaza(t);
  if (!$('#volley').classList.contains('hidden')) drawVolley(t);
  if (!$('#snake').classList.contains('hidden')) drawSnake(t);
  if (!$('#raid').classList.contains('hidden')) { raidTick(); drawRaid(t); }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop); start();
