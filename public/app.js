const $ = s => document.querySelector(s);
const STAGE_KO = { egg: '알', baby: '아기', child: '어린이', adult: '어른', dead: '하늘나라' };
let prevStage = null, S = null, socket = null, clockSkew = 0;
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 1800); }
function closeModal(id) { $('#' + id).classList.add('hidden'); }
function show(id) { document.querySelectorAll('.screen').forEach(s => s.classList.toggle('hidden', s.id !== id)); }

// ---- local save: pet, coins and items live in this browser (localStorage) ----
const SAVE_KEY = 'tg_save', G = window.Game;
{ const h = +new URLSearchParams(location.search).get('hatch'); if (h > 0) G.CFG.hatchMs = h; } // dev/test: ?hatch=1500
let myRoom = null;
function save() { if (S) localStorage.setItem(SAVE_KEY, JSON.stringify(S)); }
function loadSave(ident) {
  let p = null; try { p = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch {}
  if (!validSave(p)) p = G.newPlayer(ident.playerId, ident.nickname, Date.now());
  G.migrate(p); p.id = ident.playerId; p.nickname = ident.nickname; return p;
}
function validSave(p) { return p && typeof p === 'object' && p.pet && p.pet.stats && typeof p.pet.stage === 'string' && Number.isFinite(p.coins); }
function tickSim() { if (!S) return; G.update(S, Date.now());
  if (prevStage === 'egg' && S.pet.stage === 'baby') toast('알이 깨어났어요! 누구일까? 🎉'); prevStage = S.pet.stage; save(); }
function sendSnap() { if (S && socket && socket.connected) socket.emit('snap', G.snapOf(S)); }
// backup code = "TG1." + base64(UTF-8 JSON of the save)
const encodeSave = p => 'TG1.' + btoa(unescape(encodeURIComponent(JSON.stringify(p))));
function decodeSave(code) { try { const c = String(code).trim().replace(/\s+/g, ''); if (!c.startsWith('TG1.')) return null;
  const p = JSON.parse(decodeURIComponent(escape(atob(c.slice(4))))); return validSave(p) ? p : null; } catch { return null; } }

// ---- identity (nickname only, stored locally; swap for Discord later: just provide auth payload) ----
function getIdentity() { const id = localStorage.getItem('tg_pid'), nick = localStorage.getItem('tg_nick'); return id && nick ? { playerId: id, nickname: nick } : null; }
function start() {
  const ident = getIdentity();
  if (!ident) { $('#nick-modal').classList.remove('hidden'); $('#nick').focus(); return; }
  { let p = null; try { p = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch {} if (!validSave(p)) return openCreator('new'); } // first time: 캐릭터 만들기
  S = loadSave(ident); prevStage = S.pet.stage; tickSim(); renderHud();
  socket = io({ auth: ident, transports: ['websocket'] });
  socket.on('connect_error', e => toast('연결 실패: ' + e.message));
  socket.on('connect', () => { sendSnap(); if (myRoom) socket.emit('room:join', myRoom, r => { if (r.ok && inPlaza) socket.emit('plaza:join'); if (!r.ok) { myRoom = null; toast('방이 사라졌어요'); if (!$('#home').classList.contains('hidden')) return; show('home'); } }); });
  // minigame results from the server, applied to the local save
  socket.on('apply', d => { if (!S) return; tickSim(); if (d.coins) G.addCoins(S, Math.max(0, Math.min(750, d.coins | 0))); if (d.spend) G.addCoins(S, -Math.max(0, Math.min(100, d.spend | 0)));
    if (d.energy) S.pet.stats.energy = G.clamp(S.pet.stats.energy + Math.max(-100, Math.min(100, +d.energy || 0))); if (d.win) S.wins = (S.wins || 0) + 1; save(); renderHud(); });
  bindSocket(); miniBind(); bkBind(); bindDuel();
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
  for (const k of ['hunger', 'happy', 'energy', 'clean']) { const v = S.pet.stats[k], mx = G.maxOf(S.pet.char, k), el = $('#b-' + k); el.style.width = (v / mx * 100) + '%'; $('#n-' + k).textContent = `${Math.round(v)}/${mx}`; el.classList.toggle('low', v < 25 && !['egg','dead'].includes(S.pet.stage)); }
  { const tr = G.TRAITS[S.pet.char]; $('#trait').innerHTML = `<b>✨ ${tr.name}</b> ${tr.desc}`; }
  const p = S.pet; let st = `${S.nickname}의 ${p.name ? p.name : '펫'} · ${STAGE_KO[p.stage]}`;
  if (p.stage === 'egg') { const left = Math.max(0, Math.ceil((p.bornAt + G.CFG.hatchMs - Date.now()) / 1000)); st += ` · 부화까지 ${left}초`; }
  if (p.sick) st += ' · 아파요! 약이 필요해요'; if (p.sleeping) st += ' · 자는 중'; if (p.stage === 'dead') st += ' · 화면을 눌러 다시 시작';
  $('#status').textContent = st;
  if (!$('#shop-modal').classList.contains('hidden')) renderShop();
  if (!$('#wardrobe-modal').classList.contains('hidden')) renderWardrobe();
}
setInterval(() => { tickSim(); renderHud(); }, 1000);
setInterval(sendSnap, 5000);
const BG = new Image(); BG.src = 'assets/room.jpg';
const roomCv = $('#room'), rctx = roomCv.getContext('2d'); rctx.imageSmoothingEnabled = false;
let fx = [];
// Short pixel bursts for 밥/놀기/씻기/잠. Canvas-only, ~1.4s, buttons stay usable.
const CARE_MS = 1400;
let care = null; // { kind, item, t0 }
const CARE_PX = {
  rice: ['...YYYY...', '.YYYYYYYY.', 'YYYYYYYYYY', 'YYYRRRRYYY', 'YYYYYYYYYY', 'OYYYYYYYYO', '.OOOOOOOO.', '..OOOOOO..'],
  cookie: ['..BBBBBB..', '.BBWWBBBB.', 'BBBBBBWWBB', 'BBWWBBBBBB', '.BBBBBBBB.', '..BBBBBB..'],
  bento: ['OOOOOOOOOO', 'OYYYYYYYYO', 'OYRRRRRRYO', 'OYYYYYYYYO', 'OYGGGGGGYO', 'OOOOOOOOOO'],
  ball: ['..OOOO..', '.OWWYYO.', 'OWWYYYYO', 'OYYYOOYO', '.OYYYYO.', '..OOOO..'],
  toy: ['OOOOOO', 'ORRRRO', 'ORSSRO', 'ORRRRO', 'OOOOOO'],
  heart: ['.HH.HH.', 'HHHHHHH', 'HHHHHHH', '.HHHHH.', '..HHH..', '...H...'],
  bub: ['..OO..', '.O..WO', 'O....O', 'O....O', '.O..O.', '..OO..'],
  soap: ['OOOOOOO', 'OPPPPPO', 'OPWWWPO', 'OPPPPPO', 'OOOOOOO'],
  moon: ['..OOOO', '.OOYYO', 'OOYYYY', 'OOYYYY', '.OOYYO', '..OOOO'],
  sun: ['...Y...', 'Y.YYY.Y', '.YYYYY.', 'YYYYYYY', '.YYYYY.', 'Y.YYY.Y', '...Y...'],
  zzz: ['OOOO', '...O', '..O.', '.O..', 'OOOO'],
};
const CARE_PAL = { O: '#1d2557', Y: '#fff3c4', R: '#e85d7a', B: '#c48a4a', W: '#fff', G: '#7dba6a', P: '#ffd0e4', S: '#ffd23f', H: '#f27a9a' };
function careKind(action, arg) {
  if (action === 'feed') return 'eat';
  if (action === 'play') return 'play';
  if (action === 'wash') return 'wash';
  if (action === 'sleep') return S.pet.sleeping ? 'sleep' : 'wake';
  if (action === 'use') return { snack: 'eat', meal: 'eat', toy: 'play', soap: 'wash' }[arg] || '';
  return '';
}
function careNudge(u, kind) {
  if (u < 0) return [0, 0];
  if (kind === 'eat') return [0, Math.sin(u * Math.PI * 5) * 4];
  if (kind === 'play') return [Math.sin(u * Math.PI * 3) * 14, -Math.abs(Math.sin(u * Math.PI * 4)) * 18];
  if (kind === 'wash') return [Math.sin(u * Math.PI * 8) * 5, 0];
  if (kind === 'sleep') return [0, Math.min(8, u * 12)];
  if (kind === 'wake') return [Math.sin(u * Math.PI * 2) * 4, -Math.sin(u * Math.PI) * 12];
  return [0, 0];
}
function careTag(ctx, text, u) {
  ctx.save();
  ctx.globalAlpha = u < 0.12 ? u / 0.12 : u > 0.78 ? Math.max(0, (1 - u) / 0.22) : 1;
  ctx.font = '18px Galmuri11, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const w = Math.ceil(ctx.measureText(text).width + 16);
  ctx.fillStyle = '#fff5f8'; ctx.fillRect(240 - w / 2, 10, w, 22);
  ctx.strokeStyle = '#1d2557'; ctx.lineWidth = 2; ctx.strokeRect(240 - w / 2 + 1, 11, w - 2, 20);
  ctx.fillStyle = '#1d2557'; ctx.fillText(text, 240, 21);
  ctx.restore();
}
function drawCare(ctx, u, c) {
  ctx.save();
  if (c.kind === 'eat') {
    const food = c.item === 'snack' ? 'cookie' : c.item === 'meal' ? 'bento' : 'rice';
    const bob = Math.sin(u * Math.PI * 4) * 10;
    const sc = u < 0.8 ? 5 : Math.max(0, 5 * (1 - (u - 0.8) / 0.2));
    if (sc > 0.5) drawGrid(ctx, CARE_PX[food], 188, 108 + bob, sc, CARE_PAL);
    ctx.globalAlpha = 1; careTag(ctx, '냠냠!', u);
  } else if (c.kind === 'play') {
    const b = (u * 2) % 1, x = 150 + u * 150, y = 196 - Math.sin(b * Math.PI) * 78;
    drawGrid(ctx, CARE_PX[c.item === 'toy' ? 'toy' : 'ball'], x, y, 4, CARE_PAL);
    for (let i = 0; i < 3; i++) { const k = Math.max(0, u - i * 0.12); if (k <= 0) continue; ctx.globalAlpha = Math.max(0, 1 - k); drawGrid(ctx, CARE_PX.heart, 200 + i * 28, 150 - k * 70, 2, CARE_PAL); }
    ctx.globalAlpha = 1; careTag(ctx, '신난다!', u);
  } else if (c.kind === 'wash') {
    for (let i = 0; i < 7; i++) {
      const y = 220 - ((u * 160 + i * 28) % 170);
      drawGrid(ctx, CARE_PX.bub, 150 + i * 26 + Math.sin(u * 8 + i) * 8, y, 2 + (i % 3), { O: i % 2 ? '#9fd3f7' : '#fff', W: '#fff' });
    }
    drawGrid(ctx, CARE_PX.soap, 160 + u * 120, 156, 3, CARE_PAL);
    for (let i = 0; i < 5; i++) { ctx.fillStyle = '#9fd3f7'; ctx.fillRect(200 + i * 16, 20 + ((u * 200 + i * 30) % 120), 3, 6); }
    careTag(ctx, '뽀득뽀득!', u);
  } else if (c.kind === 'sleep') {
    const bw = S && S.pet.stage === 'baby' ? 78 : 110, h = 16 + u * 58;
    ctx.fillStyle = '#8eb4e8'; ctx.fillRect(240 - bw / 2, 238 - h, bw, h);
    ctx.fillStyle = '#f7d7e4'; for (let y = 238 - h; y < 236; y += 8) ctx.fillRect(240 - bw / 2, y, bw, 3);
    ctx.strokeStyle = '#1d2557'; ctx.lineWidth = 2; ctx.strokeRect(240 - bw / 2, 238 - h, bw, h);
    ctx.globalAlpha = Math.min(1, u * 2); drawGrid(ctx, CARE_PX.moon, 36, 28, 3, CARE_PAL);
    for (let i = 0; i < 3; i++) { const k = (u + i * 0.2) % 1; ctx.globalAlpha = 1 - k; drawGrid(ctx, CARE_PX.zzz, 300 + i * 18, 150 - k * 80, 2 + i, CARE_PAL); }
    ctx.globalAlpha = 1; careTag(ctx, '쿨쿨...', u);
  } else if (c.kind === 'wake') {
    ctx.globalAlpha = Math.min(1, u * 2); drawGrid(ctx, CARE_PX.sun, 46, 24, 3, CARE_PAL);
    ctx.globalAlpha = 1 - Math.max(0, u - 0.3) / 0.7;
    const bw = S && S.pet.stage === 'baby' ? 78 : 110, h = 70 * (1 - u);
    if (h > 4) { ctx.fillStyle = '#8eb4e8'; ctx.fillRect(240 - bw / 2, 238 - h, bw, h); }
    ctx.globalAlpha = 1; careTag(ctx, '일어났어!', u);
  }
  ctx.restore();
}
function drawRoom(t) {
  rctx.drawImage(BG, 0, 0, 480, 270);
  const u = care ? (t - care.t0) / CARE_MS : -1;
  if (care && u >= 1) care = null;
  const live = care && u >= 0 && u < 1 ? u : -1;
  const [dx, dy] = careNudge(live, care && care.kind);
  if (S) {
    const look = { ...S.pet, hair: S.hair, outfit: S.outfit, acc: S.acc };
    drawPet(rctx, 240 + dx, 238 + dy, S.pet.stage === 'egg' ? 120 : S.pet.stage === 'baby' ? 70 : S.pet.stage === 'child' ? 105 : 130, look, t);
    if (S.pet.sleeping) { rctx.fillStyle = 'rgba(29,37,87,.25)'; rctx.fillRect(0, 0, 480, 270); }
  }
  if (live >= 0) drawCare(rctx, live, care);
  fx = fx.filter(f => t - f.t0 < 1200);
  for (const f of fx) { const a = (t - f.t0) / 1200; rctx.globalAlpha = 1 - a; rctx.font = '26px sans-serif'; rctx.fillText(f.e, f.x, f.y - a * 50); }
  rctx.globalAlpha = 1;
}
const EMO = { feed: '🍚', play: '💗', wash: '🫧', sleep: '💤', use: '✨' };
// care actions + shop run locally with the shared rules (game.js)
function act(action, arg) {
  if (!S) return; const r = G.act(S, action, arg, Date.now()); save(); renderHud(); sendSnap();
  if (typeof r === 'string') return toast(r);
  const kind = careKind(action, arg);
  if (kind) care = { kind, item: action === 'use' ? arg : action, t0: performance.now() };
  else if (EMO[action]) for (let i = 0; i < 3; i++) fx.push({ e: EMO[action], x: 200 + Math.random() * 80, y: 140 + Math.random() * 30, t0: performance.now() + i * 120 });
  if (action === 'restart') prevStage = 'egg';
  toast(r.msg + (r.coins ? ` (+${r.coins}코인)` : ''));
}
// ---- BACKUP ----
function openBackup() { $('#bk-export').value = encodeSave(S); $('#bk-import').value = ''; $('#bk-confirm').classList.add('hidden'); $('#backup-modal').classList.remove('hidden'); }
// 패치 노트. 캐릭터 id·아이템 id는 그대로라 예전 저장도 새 그림으로 열려요.
const PATCHES = [
  { ver: 'v1.8', date: '2026.11.06', title: '꼬마 캐릭터를 새로 그렸어요', lines: [
    '프리셋 1~7과 기본 몸을 더 또렷한 픽셀 꼬마 아이로 다시 그렸어요. 머리는 크고 몸은 작으며, 표정과 머리색은 캐릭터마다 달라요.',
    '헤어·상의·머리장식도 새 몸에 맞게 다시 그렸어요. 기본 머리, 기본 옷, 장식 없음은 그대로 무료이고, 나머지 꾸미기는 뽑기 전용이에요.',
    '이미 키우던 펫과 가지고 있던 옷은 번호가 같아서 그대로 불러와요.',
  ] },
];
function openPatch() {
  const list = $('#patch-list'); list.innerHTML = PATCHES.map(p => `<article class="patch-item"><b>${p.ver}</b> ${p.title}<small>${p.date}</small>${p.lines.map(t => `<p>${t}</p>`).join('')}</article>`).join('');
  $('#patch-modal').classList.remove('hidden');
}
$('#patch-btn').onclick = openPatch;
async function copyText(t) { try { await navigator.clipboard.writeText(t); toast('복사했어요!'); } catch { toast('길게 눌러 직접 복사해주세요'); } }
$('#backup-btn').onclick = openBackup;
$('#bk-copy').onclick = () => { $('#bk-export').select(); copyText($('#bk-export').value); };
let pendingImport = null;
$('#bk-load').onclick = () => { const p = decodeSave($('#bk-import').value); if (!p) return toast('백업 코드가 올바르지 않아요');
  pendingImport = p; $('#bk-confirm-msg').textContent = `"${p.nickname}"의 ${STAGE_KO[p.pet.stage] || ''} 펫 · 코인 ${p.coins}개로 덮어써요. 지금 펫은 사라져요! 계속할까요?`;
  $('#bk-confirm').classList.remove('hidden'); };
$('#bk-no').onclick = () => { pendingImport = null; $('#bk-confirm').classList.add('hidden'); };
$('#bk-yes').onclick = () => { if (!pendingImport) return; const p = pendingImport; pendingImport = null;
  p.id = localStorage.getItem('tg_pid'); localStorage.setItem('tg_nick', String(p.nickname || S.nickname).slice(0, 12)); p.nickname = localStorage.getItem('tg_nick');
  S = p; prevStage = S.pet.stage; tickSim(); renderHud(); sendSnap(); closeModal('backup-modal'); toast('불러오기 완료!'); };
// ---- ROOMS ----
function openPlazaOrRooms() { if (myRoom) return enterPlaza(); $('#room-code').value = ''; show('rooms'); }
function joined(r) { if (!r.ok) return toast(r.msg || '실패했어요'); myRoom = r.code; enterPlaza(); }
$('#room-create').onclick = () => { sendSnap(); socket.emit('room:create', joined); };
// pasted text may contain spaces or words around the code ("코드: AB CD 12"); pick the 6-char code out of it
const pickCode = v => { v = String(v || '').toUpperCase(); const m = v.match(/(?:^|[^A-Z0-9])([A-Z0-9]{6})(?![A-Z0-9])/); return m ? m[1] : v.replace(/[^A-Z0-9]/g, '').slice(0, 6); };
$('#room-join').onclick = () => { const c = pickCode($('#room-code').value); if (!c) return toast('방 코드를 입력해주세요'); sendSnap(); socket.emit('room:join', c, joined); };
$('#room-code').onkeydown = e => { if (e.key === 'Enter') $('#room-join').click(); };
$('#rooms-back').onclick = () => show('home');
$('#room-copy').onclick = () => myRoom && copyText(myRoom);
$('#room-leave').onclick = () => { socket.emit('v:cancel'); socket.emit('room:leave'); myRoom = null; inPlaza = false; plazaList = []; show('home'); toast('방에서 나왔어요'); };
document.querySelectorAll('.buttons button').forEach(b => b.onclick = () => {
  const a = b.dataset.act;
  if (a === 'shop') { renderShop(); $('#shop-modal').classList.remove('hidden'); }
  else if (a === 'plaza') openPlazaOrRooms();
  else if (a === 'wardrobe') openWardrobe();
  else act(a);
});
roomCv.onclick = () => { if (S && S.pet.stage === 'dead') openCreator('restart'); };
const myLook = () => S.pet.custom && S.pet.custom.eyes ? S.pet.custom.eyes : S.pet.char, myColor = () => S.pet.custom ? S.pet.custom.color || 'peach' : '';
function rcIcons(el) { const c = myColor(); if (!c || c === 'peach') return; el.querySelectorAll('img[data-rc]').forEach(im => recolorUrl(im.getAttribute('src'), c, u => { im.src = u; })); }
const isCustom = () => !!(S.pet.custom && S.pet.custom.eyes);
const icon = (type, key) => { if (type === 'acc' && key !== 'none') return `<img class="ico acc" src="assets/acc/${key}.png" alt="">`; // v1.8 layered 머리장식 icon
  const it = G.SHOP[type + '_' + key], who = it && it.customOnly && !isCustom() ? 'x1' : myLook(); // 기본 몸 전용 items: show on the base body
  return `<img class="ico" data-rc="1" src="assets/outfits/${who}/${S.pet.stage === 'adult' ? 'adult' : 'child'}/${type === 'hair' ? key + '_base' : type === 'acc' ? 'base_base' : 'base_' + key}.png" alt="">`; };
const itemIco = k => `<img class="ico it" src="assets/items/${k}.png" alt="">`;
// 상점 = consumables only; 옷/헤어/머리장식/뽑기 live in 꾸미기 (wardrobe)
function renderShop() {
  const sl = $('#shop-list'); sl.innerHTML = '';
  const sell = (title, keys, hint) => {
    const h = document.createElement('h3'); h.textContent = title; sl.appendChild(h);
    if (hint) { const p = document.createElement('p'); p.className = 'hint'; p.textContent = hint; sl.appendChild(p); }
    for (const k of keys) { const it = G.SHOP[k]; const d = document.createElement('div'); d.className = 'item'; d.dataset.item = k;
      const price = G.priceOf(S, k); d.innerHTML = `<span>${itemIco(k)}<span class="it-txt">${it.name} <small>🪙${price}${price < it.price ? ' (반값!)' : ''}</small><small class="fx">${G.ITEM_FX[k]}</small></span></span>`;
      const b = document.createElement('button'); b.className = 'small'; b.textContent = '구매'; b.onclick = () => act('buy', k); d.appendChild(b); sl.appendChild(d); }
  };
  sell('먹을 것 · 약', Object.keys(G.SHOP).filter(k => G.SHOP[k].type === 'consumable' && k !== 'ticket'));
  sell('복권', ['ticket'], `🪙${G.LOTTERY.cost} (뽑기보다 저렴) · 대박 ${Math.min(S.lotteryPity || 0, G.LOTTERY.pity)}/${G.LOTTERY.pity} · 옷은 안 나와요`);
  const go = document.createElement('button'); go.id = 'shop-to-decor'; go.className = 'small b-green'; go.textContent = '👗 옷·머리장식·뽑기는 꾸미기에서!';
  go.onclick = () => { closeModal('shop-modal'); openWardrobe(); }; sl.appendChild(go);
  const il = $('#inv-list'); il.innerHTML = '';
  const have = G.CONSUMABLES.filter(k => (S.inventory[k] || 0) > 0 || (k === 'ticket' && S.lotteryPending));
  for (const k of have) { const d = document.createElement('div'); d.className = 'item'; d.dataset.inv = k;
    const n = S.inventory[k] || 0, pending = k === 'ticket' && S.lotteryPending;
    const name = pending ? `${G.SHOP[k].name} 긁는 중${n ? ` · 남은 ${n}장` : ''}` : `${G.SHOP[k].name} x${n}`;
    d.innerHTML = `<span>${itemIco(k)}${name}</span>`;
    const b = document.createElement('button'); b.className = 'small'; b.textContent = k === 'ticket' ? (pending ? '이어서' : '긁기') : '사용';
    b.onclick = () => { if (k === 'ticket') return openScratch(); act('use', k); if (care) closeModal('shop-modal'); }; d.appendChild(b); il.appendChild(d); }
  if (!have.length) il.innerHTML = '<p class="hint">가방이 비었어요</p>';
}
function submitRedeem() {
  if (!S) return; const el = $('#redeem-code');
  const r = G.act(S, 'redeem', el.value, Date.now()); save(); renderHud(); sendSnap();
  if (typeof r === 'string') return toast(r);
  el.value = ''; toast(r.msg);
}
$('#redeem-go').onclick = submitRedeem;
$('#redeem-code').onkeydown = e => { if (e.key === 'Enter') submitRedeem(); };
function gachaBox() { const R = G.GACHA.rates, gd = document.createElement('div'); gd.className = 'gacha-box';
  gd.innerHTML = `<p class="hint">한 번에 🪙${G.GACHA.cost} · <b class="r-common">일반 ${R.common}%</b> 코인/간식 · <b class="r-rare">희귀 ${R.rare}%</b> 리본·꽃핀·상의 ${G.GACHA.rare.length - 2}종 · <b class="r-legend">전설 ${R.legend}%</b> 고양이귀·천사링·상의 ${G.GACHA.legend.length - 2}종 (상의는 뽑기 전용)<br>중복이면 코인 환급 (희귀 +${G.GACHA.dupRefund.rare}, 전설 +${G.GACHA.dupRefund.legend}) · ${G.GACHA.pity}번 안에 전설 확정 (지금 ${S.gachaPity || 0}/${G.GACHA.pity})</p>`;
  const gb = document.createElement('button'); gb.id = 'gacha-btn'; gb.className = 'big b-purple'; gb.textContent = `🎰 뽑기 (🪙${G.GACHA.cost})`; gb.onclick = pullGacha; gd.appendChild(gb);
  const g10 = document.createElement('button'); g10.id = 'gacha10-btn'; g10.className = 'big b-purple'; g10.textContent = `🎰 10연 (🪙${G.GACHA.tenCost})`; g10.onclick = pullGacha10; gd.appendChild(g10);
  const note = document.createElement('p'); note.className = 'hint'; note.textContent = `10연은 10번 값에서 1번을 뺀 🪙${G.GACHA.tenCost} · 의상 4, 아이템 4, 코인 2`; gd.appendChild(note); return gd; }
// ---- GACHA (뽑기): capsule shake -> rarity flash -> prize reveal ----
let gMode = 'one';
function gachaFace(r) {
  const it = r.item && G.SHOP[r.item];
  if (it && it.type === 'acc') return `<img src="assets/acc/${r.key}.png" alt="">`;
  if (it && it.type === 'outfit') return `<img data-rc="1" src="assets/outfits/${isCustom() ? myLook() : 'x1'}/${S.pet.stage === 'adult' ? 'adult' : 'child'}/base_${r.key}.png" alt="">`;
  return `<span class="g-emoji">${r.slot === 'coin' || (r.coins && !r.item) ? '🪙' : r.item === 'snack' ? '🍪' : r.item === 'medicine' ? '💊' : '🎁'}</span>`;
}
function pullGacha() {
  if (!S) return; const r = G.act(S, 'gacha', null, Date.now());
  if (typeof r === 'string') return toast(r);
  save(); renderHud(); sendSnap(); gMode = 'one';
  const m = $('#gacha-modal'), cap = $('#g-capsule'), out = $('#g-result'); m.classList.remove('hidden');
  $('#g-title').textContent = '뽑기!'; $('#g-again').textContent = '한 번 더'; $('#g-list').classList.add('hidden'); cap.classList.remove('hidden');
  m.dataset.rarity = r.rarity; cap.className = 'g-capsule shake'; out.className = 'g-result hidden'; $('#g-ok').disabled = true;
  setTimeout(() => { cap.className = 'g-capsule open r-' + r.rarity; }, 1100);
  setTimeout(() => { const gt = r.item && G.SHOP[r.item] && G.SHOP[r.item].type, img = gt === 'acc' ? `<img class="g-img" src="assets/acc/${r.key}.png" alt="">` : gt === 'outfit' ? `<img class="g-img" data-rc="1" src="assets/outfits/${isCustom() ? myLook() : 'x1'}/${S.pet.stage === 'adult' ? 'adult' : 'child'}/base_${r.key}.png" alt="">` : `<div class="g-emoji">${r.item === 'snack' ? '🍪' : r.item === 'medicine' ? '💊' : '🪙'}</div>`;
    out.innerHTML = `<div class="g-tier r-${r.rarity}">${'★'.repeat({ common: 1, rare: 2, legend: 3 }[r.rarity])} ${r.rarityKo}</div>${img}<div class="g-name">${r.name}</div><div class="hint">${r.dup ? `이미 있어요! 중복 환급 +${r.coins}코인` : r.isNew ? (gt === 'outfit' ? '새 상의! 바로 입었어요 ✨' + (isCustom() ? '' : ' (기본 몸에서 보여요)') : '새 머리장식! 바로 썼어요 ✨') : '가방/코인에 넣었어요'}</div>`;
    out.className = 'g-result pop r-' + r.rarity; rcIcons(out); $('#g-ok').disabled = false; }, 1600); }
function pullGacha10() {
  if (!S) return; const r = G.act(S, 'gacha10', null, Date.now());
  if (typeof r === 'string') return toast(r);
  save(); renderHud(); sendSnap(); gMode = 'ten';
  const m = $('#gacha-modal'); m.classList.remove('hidden');
  $('#g-title').textContent = '10연 뽑기!'; $('#g-again').textContent = '10연 한 번 더';
  $('#g-capsule').classList.add('hidden'); $('#g-result').classList.add('hidden');
  const list = $('#g-list'); list.classList.remove('hidden'); const slotKo = { costume: '의상', item: '아이템', coin: '코인' };
  list.innerHTML = r.results.map(x => `<div class="g-row r-${x.rarity}">${gachaFace(x)}<b>${slotKo[x.slot]}</b><span>${esc(x.name)}</span><em>${x.dup ? `중복 +${x.coins}` : x.isNew ? '새 옷' : x.rarityKo}</em></div>`).join('') + `<p class="hint">${esc(r.msg)}</p>`;
  rcIcons(list); $('#g-ok').disabled = false;
}
$('#g-ok').onclick = () => closeModal('gacha-modal');
$('#g-again').onclick = () => { closeModal('gacha-modal'); gMode === 'ten' ? pullGacha10() : pullGacha(); };
// ---- SCRATCH (긁는 복권): drag/touch erases a silver foil; prize is claimed once enough is scratched ----
let sc = null;
function prizeInner(p) {
  const icon = p.item ? `<img class="sc-item" src="assets/items/${esc(p.item)}.png" alt="">` : `<div class="sc-emoji">${p.jackpot ? '💰' : '🪙'}</div>`;
  return `${icon}<div class="sc-name">${esc(p.name)}</div><div class="sc-sub">${p.jackpot ? '대박' : p.item ? '아이템' : '코인'}</div>`;
}
function paintFoil() {
  const cv = $('#sc-foil'); cv.classList.remove('hidden');
  const ctx = cv.getContext('2d'), w = cv.width, h = cv.height;
  ctx.globalCompositeOperation = 'source-over'; ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#c5cad3'; ctx.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 4) for (let x = 0; x < w; x += 4) {
    const n = (x * 13 + y * 7) % 19;
    ctx.fillStyle = n < 6 ? '#9aa3b2' : n < 12 ? '#eef1f6' : '#b7bec8'; ctx.fillRect(x, y, 4, 4);
  }
  ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 3;
  for (let i = -h; i < w + h; i += 18) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + h * 0.6, h); ctx.stroke(); }
  ctx.fillStyle = '#3e4654'; ctx.font = 'bold 22px Galmuri11, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('긁어보세요', w / 2, h / 2 - 6);
  ctx.fillStyle = '#5c6574'; ctx.font = '13px Galmuri11, monospace'; ctx.fillText('은박', w / 2, h / 2 + 18);
  sc.ctx = ctx; sc.cv = cv;
}
function showScratch(r) {
  sc = { done: false, down: false, last: null, pct: 0, sampled: 0, rad: 28 };
  $('#sc-hint').textContent = r.resumed ? '아직 안 본 복권이에요. 이어서 긁어보세요' : '손가락이나 마우스로 은박을 긁어보세요';
  $('#sc-prize').innerHTML = prizeInner(r.prize); $('#sc-prize').setAttribute('aria-hidden', 'true');
  $('#sc-card').className = 'sc-card'; $('#sc-result').className = 'sc-result hidden'; $('#sc-result').textContent = '';
  const reveal = $('#sc-reveal'); reveal.disabled = true; reveal.textContent = '결과 보기'; reveal.classList.remove('hidden');
  $('#sc-ok').disabled = true; $('#sc-close').classList.remove('hidden');
  const bar = $('#sc-bar-i'); bar.style.width = '0%'; bar.className = '';
  paintFoil(); $('#scratch-modal').classList.remove('hidden');
}
function openScratch() {
  if (!S || !$('#scratch-modal').classList.contains('hidden')) return;
  const r = G.act(S, 'scratch', null, Date.now());
  if (typeof r === 'string') return toast(r);
  save(); renderHud(); sendSnap(); showScratch(r); toast(r.msg);
}
function finishScratch() {
  if (!S || !sc || sc.done) return;
  sc.done = true; sc.down = false;
  const r = G.act(S, 'scratchClaim', null, Date.now());
  save(); renderHud(); sendSnap();
  if (typeof r === 'string') { sc.done = false; return toast(r); }
  $('#sc-foil').classList.add('hidden'); $('#sc-card').classList.add('revealed');
  if (r.jackpot) $('#sc-card').classList.add('jackpot');
  $('#sc-prize').setAttribute('aria-hidden', 'false');
  $('#sc-result').textContent = r.msg; $('#sc-result').className = 'sc-result' + (r.jackpot ? ' jackpot' : '');
  $('#sc-hint').textContent = r.item ? '가방에 넣었어요' : '코인을 받았어요';
  $('#sc-reveal').disabled = true; $('#sc-reveal').classList.add('hidden'); $('#sc-close').classList.add('hidden'); $('#sc-ok').disabled = false;
  const bar = $('#sc-bar-i'); bar.style.width = '100%'; if (r.jackpot) bar.className = 'jackpot';
  toast(r.msg);
}
function sampleScratch() {
  if (!sc || sc.done || !sc.ctx) return;
  const now = performance.now(); if (now - sc.sampled < 40) return; sc.sampled = now;
  const w = sc.cv.width, h = sc.cv.height, data = sc.ctx.getImageData(0, 0, w, h).data;
  let clear = 0, total = 0;
  for (let y = 0; y < h; y += 4) for (let x = 0; x < w; x += 4) { total++; if (data[(y * w + x) * 4 + 3] < 32) clear++; }
  const pct = total ? clear / total : 0; sc.pct = pct;
  const shown = Math.min(100, Math.round(pct * 100));
  $('#sc-bar-i').style.width = shown + '%';
  if (pct >= G.LOTTERY.hintAt) { $('#sc-reveal').disabled = false; $('#sc-hint').textContent = `거의 다 긁었어요 (${shown}%) · 결과 보기`; }
  else $('#sc-hint').textContent = `은박을 긁어보세요 (${shown}%)`;
  if (pct >= G.LOTTERY.revealAt) finishScratch();
}
function eraseAt(x, y) {
  const ctx = sc.ctx; ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath(); ctx.arc(x, y, sc.rad, 0, Math.PI * 2); ctx.fill();
}
const scFoil = $('#sc-foil');
const scPos = e => { const r = scFoil.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * scFoil.width, y: (e.clientY - r.top) / r.height * scFoil.height }; };
scFoil.addEventListener('pointerdown', e => {
  if (!sc || sc.done) return; e.preventDefault();
  try { scFoil.setPointerCapture(e.pointerId); } catch {}
  const rect = scFoil.getBoundingClientRect();
  const css = matchMedia('(pointer: coarse)').matches ? 36 : 26;
  sc.rad = Math.max(16, css * scFoil.width / (rect.width || scFoil.width));
  sc.down = true; const p = scPos(e); sc.last = p; eraseAt(p.x, p.y); sc.sampled = 0; sampleScratch();
}, { passive: false });
scFoil.addEventListener('pointermove', e => {
  if (!sc || sc.done || !sc.down) return; e.preventDefault();
  const p = scPos(e), last = sc.last || p, dist = Math.hypot(p.x - last.x, p.y - last.y), step = Math.max(1, sc.rad * 0.35), n = Math.max(1, Math.ceil(dist / step));
  for (let i = 1; i <= n; i++) eraseAt(last.x + (p.x - last.x) * i / n, last.y + (p.y - last.y) * i / n);
  sc.last = p; sampleScratch();
}, { passive: false });
const scUp = () => { if (!sc) return; sc.down = false; sc.last = null; if (!sc.done) { sc.sampled = 0; sampleScratch(); } };
scFoil.addEventListener('pointerup', scUp); scFoil.addEventListener('pointercancel', scUp);
scFoil.addEventListener('contextmenu', e => e.preventDefault());
$('#sc-reveal').onclick = () => finishScratch();
$('#sc-ok').onclick = () => { sc = null; closeModal('scratch-modal'); };
$('#sc-close').onclick = () => { sc = null; closeModal('scratch-modal'); toast('가방에서 이어서 긁을 수 있어요'); };
// ---- WARDROBE (꾸미기): 헤어/옷 tabs, live preview ----
let wTab = 'hair', wTry = null; // wTry = {slot, k}: try-on preview of an unowned item (nothing bought or saved)
const wcv = $('#wPreview'), wctx = wcv.getContext('2d');
const BASE_KO = { hair: '기본 머리', outfit: '기본 상의', acc: '없음' };
function openWardrobe() { wTry = null; renderWardrobe(); $('#wardrobe-modal').classList.remove('hidden'); }
function renderWardrobe() { // 꾸미기 shop: owned -> tap to wear, not owned -> tap to try on, then 구매하기 buys (auto-wears)
  const tabs = $('#w-tabs'); tabs.innerHTML = '';
  for (const [t, ko] of [['char', '캐릭터'], ['hair', '헤어'], ['outfit', '상의'], ['acc', '머리장식'], ['gacha', '뽑기 🎰']]) { const b = document.createElement('button'); b.className = 'small' + (t === wTab ? ' sel' : ''); b.textContent = ko; b.dataset.tab = t; b.onclick = () => { wTab = t; wTry = null; renderWardrobe(); }; tabs.appendChild(b); }
  renderTry();
  const list = $('#w-list'); list.innerHTML = ''; list.classList.toggle('gacha', wTab === 'gacha');
  if (wTab === 'char') { const d = document.createElement('div'); d.className = 'char-box'; const tr = G.TRAITS[S.pet.char], c = S.pet.custom;
    d.innerHTML = `<p><b>${esc(S.pet.name || '(이름 없음)')}</b> · ${c ? `기본 몸 · ${G.CUSTOM.eyesKo[c.eyes]} · ${G.CUSTOM.colorsKo[c.color]}` : `프리셋 ${S.pet.char}번`} · 성격 ${tr.name}</p>`;
    const b = document.createElement('button'); b.id = 'w-edit-char'; b.className = 'big b-green'; b.textContent = '✏️ 이름·모습 바꾸기'; b.onclick = () => openCreator('edit'); d.appendChild(b);
    list.appendChild(d); $('#w-note').textContent = S.pet.stage === 'egg' ? '알일 때는 성격도 바꿀 수 있어요' : '성격은 새 알에서만 정할 수 있어요'; return; }
  if (wTab === 'gacha') { list.appendChild(gachaBox()); $('#w-note').textContent = '뽑기에서 나온 상의·머리장식은 바로 입어요'; return; }
  for (const k of { hair: G.HAIRS, outfit: G.OUTFITS, acc: G.ACCS }[wTab]) { const sk = wTab + '_' + k, it = G.SHOP[sk], own = G.ownKey(S, wTab, k), on = S[wTab] === k;
    const tr = wTry && wTry.slot === wTab && wTry.k === k; const b = document.createElement('button'); b.className = 'w-item' + (on ? ' on' : '') + (own ? '' : ' locked') + (tr ? ' try' : ''); b.dataset.item = wTab + ':' + k;
    const price = it ? G.priceOf(S, sk) : 0, tag = on ? '착용중' : own ? '입기' : it.gacha ? '🎰 뽑기 전용' : `🪙${price}${price < it.price ? ' 반값' : ''}`, xo = it && it.customOnly && !isCustom();
    b.innerHTML = `${icon(wTab, k)}<small>${k === 'base' || k === 'none' ? BASE_KO[wTab] : it.name}</small><em>${tag}</em>${xo ? '<i class="x-only">기본 몸 전용</i>' : ''}`;
    b.onclick = () => { if (own) { wTry = null; act('equip', wTab + ':' + k); } else { wTry = tr ? null : { slot: wTab, k }; renderWardrobe(); } }; // unowned: tap = 미리보기 only
    list.appendChild(b); }
  rcIcons(list);
  $('#w-note').textContent = ['egg', 'baby'].includes(S.pet.stage) ? '어린이가 되면 옷을 입어요 (미리보기)' : S.pet.stage === 'dead' ? '' : '가진 건 눌러서 입기 · 안 가진 건 눌러서 미리 입어보기 (🎰 뽑기에서만 나와요)' + (!isCustom() && ['hair', 'outfit'].includes(wTab) ? ' · 새 헤어·상의는 기본 몸 전용이에요 (프리셋은 기본 차림으로 보여요)' : '');
}
function drawWardrobe(t) { const c = wctx; c.fillStyle = '#fff5f8'; c.fillRect(0, 0, wcv.width, wcv.height); c.fillStyle = '#fbe3ea'; c.fillRect(0, wcv.height - 26, wcv.width, 26);
  const stage = ['child', 'adult'].includes(S.pet.stage) ? S.pet.stage : 'child';
  drawPet(c, wcv.width / 2, wcv.height - 14, stage === 'adult' ? 200 : 150, { ...S.pet, stage, sick: false, sleeping: false, ...wLook() }, t, { still: true }); }
const wLook = () => { const l = { hair: S.hair, outfit: S.outfit, acc: S.acc }; if (wTry) l[wTry.slot] = wTry.k; return l; };
function renderTry() { const bar = $('#w-try'); if (!wTry || G.ownKey(S, wTry.slot, wTry.k)) { wTry = null; bar.classList.add('hidden'); return; }
  const sk = wTry.slot + '_' + wTry.k, it = G.SHOP[sk], price = G.priceOf(S, sk); bar.classList.remove('hidden');
  $('#w-try-name').textContent = `👀 미리보기: ${it.name}` + (it.gacha ? ' (뽑기 전용)' : ` · 🪙${price}`);
  const buy = $('#w-buy'); buy.textContent = it.gacha ? '🎰 뽑기로 가기' : S.coins < price ? `코인 부족 (🪙${price})` : `🪙${price} 구매하기`; buy.disabled = !it.gacha && S.coins < price;
  buy.onclick = () => { if (it.gacha) { wTry = null; wTab = 'gacha'; return renderWardrobe(); } const k = sk; wTry = null; act('buy', k); renderWardrobe(); }; }
$('#w-cancel').onclick = () => { wTry = null; renderWardrobe(); };
// ---- PLAZA ----
const pcv = $('#plazaCv'), pctx = pcv.getContext('2d'); pctx.imageSmoothingEnabled = false;
let plazaMeta = {}, plazaList = [], plazaDisp = {}, me = { x: 240, y: 220, tx: 240, ty: 220 }, inPlaza = false, lastMove = 0;
function enterPlaza() { if (!myRoom) return show('rooms'); show('plaza'); if (!inPlaza) { me.x = me.tx = 80 + Math.random() * 320; me.y = me.ty = 170 + Math.random() * 90; } inPlaza = true; sendSnap(); socket.emit('plaza:join'); $('#room-code-show').textContent = myRoom; $('#match-status').textContent = '화면을 눌러 이동해요'; }
$('#plaza-back').onclick = () => { socket.emit('plaza:leave'); socket.emit('v:cancel'); inPlaza = false; show('home'); };
pcv.addEventListener('pointerdown', e => { const r = pcv.getBoundingClientRect(); me.tx = (e.clientX - r.left) / r.width * 480; me.ty = Math.max(150, (e.clientY - r.top) / r.height * 300); });
const sendChat = () => { const v = $('#chat').value.trim(); if (v) { socket.emit('plaza:chat', v); $('#chat').value = ''; } };
$('#chat-send').onclick = sendChat; $('#chat').onkeydown = e => { if (e.key === 'Enter') sendChat(); };
$('#match').onclick = () => { sendSnap(); socket.emit('v:queue'); };
$('#practice').onclick = () => { sendSnap(); socket.emit('v:practice'); };
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
  $('#plaza-count').textContent = `${plazaMeta.count || plazaList.length}/${plazaMeta.max || 6}명`;
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
$('#snake-btn').onclick = () => { socket.emit('plaza:leave'); socket.emit('v:cancel'); show('snake'); SN = null; $('#sCv').classList.add('hidden'); $('#s-lobby').classList.remove('hidden'); sendSnap(); socket.emit('s:join'); };
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
$('#raid-btn').onclick = () => { socket.emit('plaza:leave'); socket.emit('v:cancel'); show('raid'); RD = null; rcv.classList.add('hidden'); $('#raid .raid-act').classList.add('hidden'); $('#r-lobby').classList.remove('hidden'); sendSnap(); socket.emit('r:join'); };
$('#r-back').onclick = () => { socket.emit('r:leave'); RD = null; enterPlaza(); };
$('#r-start').onclick = () => socket.emit('r:start');
const DIFF_KO = { easy: '쉬움', normal: '보통', hard: '어려움' };
document.querySelectorAll('#r-diff button').forEach(b => b.onclick = () => socket.emit('r:diff', b.dataset.d));
function renderRaidLobby(l) {
  document.querySelectorAll('#r-diff button').forEach(b => { b.classList.toggle('sel', b.dataset.d === l.diff); b.disabled = l.host !== socket.id; });
  const pl = $('#r-players'); pl.innerHTML = '';
  l.players.forEach(p => { const d = document.createElement('div'); d.className = 'item';
    d.innerHTML = `<span>${p.nickname}${p.sid === socket.id ? ' (나)' : ''} <small>${STAGE_KO[p.stage] || ''} ⚔️ x${p.pow} ❤️${p.hp || 100}</small></span><span>${p.sid === l.host ? '👑 방장' : ''}</span>`; pl.appendChild(d); });
  $('#r-start').classList.toggle('hidden', l.host !== socket.id || l.state !== 'lobby');
  $('#r-info').textContent = l.state === 'playing' ? '레이드 진행 중...' : l.countdown ? `${l.countdown}초 후 자동 시작!` : (l.players.length < 2 ? '동료를 기다리는 중 · 혼자서도 도전할 수 있어요' : '') + ` · 난이도: ${DIFF_KO[l.diff] || '보통'} (⚡${l.cost})` + (l.host === socket.id ? ' (방장이 선택)' : ' (방장이 고르는 중)');
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
  const ents = st.p.map(([sid, x, y, hp, alive, sk, inv, mhp]) => {
    let d = RD.disp[sid] || (RD.disp[sid] = { x, y });
    if (sid === socket.id) { d.x = RD.pred.x; d.y = RD.pred.y; } else { d.x += (x - d.x) * 0.3; d.y += (y - d.y) * 0.3; }
    return { sid, hp, alive, inv, d, mhp: mhp || 100 };
  }).sort((a, b) => a.d.y - b.d.y);
  for (const e of ents) { const look = RD.looks[e.sid] || {}, stage = ['egg', 'dead'].includes(look.stage) || !look.stage ? 'baby' : look.stage;
    const sz = stage === 'baby' ? 34 : stage === 'child' ? 44 : 52;
    if (!e.alive) { c.globalAlpha = 0.45; } else if (e.inv && Math.floor(t / 80) % 2) c.globalAlpha = 0.4;
    drawPet(c, e.d.x, e.d.y, sz, { ...look, stage, sick: !e.alive, sleeping: false }, t + e.d.x * 7, { walking: e.alive });
    c.globalAlpha = 1;
    if (!e.alive) { c.font = '14px sans-serif'; c.fillText('😵', e.d.x - 8, e.d.y - sz - 2); }
    c.fillStyle = '#1d2557'; c.fillRect(e.d.x - 17, e.d.y + 3, 34, 6); c.fillStyle = e.hp > e.mhp * 0.3 ? '#7cd97a' : '#f25a5a'; c.fillRect(e.d.x - 16, e.d.y + 4, 32 * e.hp / e.mhp, 4);
    c.font = '9px Galmuri9, monospace'; c.textAlign = 'center'; c.lineWidth = 3; c.strokeStyle = '#fff'; c.strokeText(`${Math.ceil(e.hp)}/${e.mhp}`, e.d.x, e.d.y + 30); c.fillStyle = "#1d2557"; c.fillText(`${Math.ceil(e.hp)}/${e.mhp}`, e.d.x, e.d.y + 30); c.textAlign = 'left';
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
function kickedToPlaza(m) { toast(m); RD = null; SN = null; BK = null; enterPlaza(); }
function bindRaid() {
  socket.on('r:kicked', kickedToPlaza); socket.on('s:kicked', kickedToPlaza); socket.on('v:kicked', m => { $('#match-status').textContent = m; });
  socket.on('r:lobby', l => { if (!$('#raid').classList.contains('hidden') && !RD) renderRaidLobby(l); });
  socket.on('r:start', d => { if (d.cheer) toast('애교쟁이의 응원! 모두 공격력 +10% 📣'); RD = { diffName: d.diffName, cur: null, looks: d.looks, cfg: d.cfg, disp: {}, pred: { x: 240, y: 255 }, acc: 0, lastT: 0, skLocal: 0, tAt: 0, bx: null, startAt: performance.now(), init: false };
    Object.keys(rkeys).forEach(k => rkeys[k] = false); $('#r-lobby').classList.add('hidden'); rcv.classList.remove('hidden'); $('#raid .raid-act').classList.remove('hidden'); });
  socket.on('r:state', st => { if (!RD) return; RD.cur = st; RD.tAt = performance.now(); $('#r-time').textContent = `⏱ ${Math.floor(st.t / 60)}:${String(st.t % 60).padStart(2, '0')}`;
    const me = st.p.find(q => q[0] === socket.id); if (!me) return; const [, sx, sy, , , sk] = me, P = RD.pred;
    if (!RD.init || Math.hypot(sx - P.x, sy - P.y) > 40) { P.x = sx; P.y = sy; RD.init = true; } else { P.x += (sx - P.x) * 0.08; P.y += (sy - P.y) * 0.08; }
    RD.skLocal = Math.max(sk, Math.min(RD.skLocal, sk + 3)); });
  socket.on('r:end', d => { RD = null; $('#end-title').textContent = (d.win ? '👑 몽꾸 격파!' : '😢 레이드 실패...') + ` (${d.diff})`;
    $('#end-msg').textContent = (d.win ? '모두 함께 승리했어요!' : `몽꾸 HP ${d.hp}/${d.max} 남음`) + ` · +${d.coins || 0} 코인, 에너지 -${d.energy || 0}`;
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
    $('#end-msg').textContent = res.map(r => `${r.rank}등 ${r.nickname} (길이 ${r.length}) +${r.coins}`).join(' / ') + (me ? ` · 나: +${me.coins} 코인, 에너지 -${me.energy || 0}` : '');
    $('#end-modal').classList.remove('hidden'); });
  socket.on('plaza:state', l => { if (l.code !== myRoom) return; plazaMeta = l; plazaList = l.pets; });
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
    $('#end-msg').textContent = `${d.score[0]} : ${d.score[1]}` + (d.forfeit ? ' (기권)' : '') + ` · +${d.reward || 0} 코인, 에너지 -${d.energy || 0}`;
    $('#end-modal').classList.remove('hidden'); });
}
$('#end-ok').onclick = () => { closeModal('end-modal'); if (!$('#duel').classList.contains('hidden')) return duelLobby(); if (!$('#mini').classList.contains('hidden') || !$('#breakout').classList.contains('hidden')) return enterPlaza(); if (!$('#snake').classList.contains('hidden') || !$('#raid').classList.contains('hidden')) { enterPlaza(); return; } if (inPlaza) { show('plaza'); $('#match-status').textContent = '화면을 눌러 이동해요'; } else show('home'); };
function loop(t) {
  if (!$('#home').classList.contains('hidden')) drawRoom(t);
  if (S && !$('#wardrobe-modal').classList.contains('hidden')) drawWardrobe(t);
  if (!$('#plaza').classList.contains('hidden') && socket) drawPlaza(t);
  if (!$('#volley').classList.contains('hidden')) drawVolley(t);
  if (!$('#snake').classList.contains('hidden')) drawSnake(t);
  if (!$('#raid').classList.contains('hidden')) { raidTick(); drawRaid(t); }
  if (!$('#duel').classList.contains('hidden') && BM) drawBomb(t);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// ---- SINGLE-PLAYER MINIGAMES (v1.2): 짝맞추기 + 하트 팡팡 ----
const mcv = $('#mCv'), mctx = mcv.getContext('2d'); mctx.imageSmoothingEnabled = false; let MG = null;
function miniStart(game) { if (!S) return; tickSim(); const M = G.MINI[game];
  if (S.pet.stage === 'dead') return toast('하늘나라에 간 펫은 놀 수 없어요'); if (S.pet.sleeping) return toast('자고 있어요 💤 깨운 뒤에 놀아요');
  if (S.pet.sick) return toast('아파서 놀 수 없어요. 약을 먹여주세요'); if (S.pet.stats.energy < M.energy) return toast(`에너지가 부족해요 (필요: ${M.energy})`);
  sendSnap(); socket.emit('m:start', game); }
$('#m-memory').onclick = () => miniStart('memory'); $('#m-pop').onclick = () => miniStart('pop');
$('#m-back').onclick = () => { if (MG) socket.emit('m:quit'); MG = null; enterPlaza(); };
function miniBind() {
  socket.on('m:denied', e => toast(e));
  socket.on('m:go', ({ game }) => { socket.emit('plaza:leave'); show('mini'); mcv.classList.remove('hidden'); $('#m-info').textContent = ''; $('#m-title').textContent = G.MINI[game].name;
    const t0 = performance.now();
    if (game === 'memory') { const faces = [1, 2, 3, 4, 5, 6, 7, 0], deck = [...faces, ...faces];
      for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
      MG = { game, t0, cards: deck.map(f => ({ f, up: false, done: false })), open: [], moves: 0, lock: 0 }; }
    else MG = { game, t0, hits: 0, holes: [], next: t0 + 400, end: t0 + 30000, pops: [] }; });
  socket.on('m:result', r => { MG = null; $('#end-title').textContent = r.game === 'memory' ? '🃏 다 맞췄어요!' : '💗 시간 끝!';
    $('#end-msg').textContent = (r.game === 'memory' ? `${r.score}번 뒤집기` : `하트 ${r.score}개`) + ` · +${r.coins} 코인, 에너지 -${r.energy}`; $('#end-modal').classList.remove('hidden'); });
}
const MC = { cols: 4, w: 96, h: 64, x0: 36, y0: 8, gx: 12, gy: 8 };
const cardRect = i => ({ x: MC.x0 + (i % 4) * (MC.w + MC.gx), y: MC.y0 + Math.floor(i / 4) * (MC.h + MC.gy) });
const HOLES = [...Array(9)].map((_, i) => ({ x: 100 + (i % 3) * 140, y: 70 + Math.floor(i / 3) * 85 }));
mcv.addEventListener('pointerdown', e => { if (!MG) return; const b = mcv.getBoundingClientRect(), x = (e.clientX - b.left) * 480 / b.width, y = (e.clientY - b.top) * 300 / b.height, now = performance.now();
  if (MG.game === 'memory') { if (MG.lock > now) return; const i = MG.cards.findIndex((c, k) => { const r = cardRect(k); return x >= r.x && x < r.x + MC.w && y >= r.y && y < r.y + MC.h; });
    const c = MG.cards[i]; if (!c || c.up || c.done) return; c.up = true; MG.open.push(c);
    if (MG.open.length === 2) { MG.moves++; const [a, d] = MG.open; MG.open = [];
      if (a.f === d.f) { a.done = d.done = true; if (MG.cards.every(q => q.done)) { const m = MG; setTimeout(() => socket.emit('m:end', { game: 'memory', score: m.moves }), 500); } }
      else { MG.lock = now + 700; setTimeout(() => { a.up = d.up = false; }, 700); } } }
  else { const h = MG.holes.find(o => o.until > now && Math.hypot(x - HOLES[o.i].x, y - HOLES[o.i].y) < 40); if (h) { h.until = 0; MG.hits++; MG.pops.push({ x: HOLES[h.i].x, y: HOLES[h.i].y, t: now }); } } });
function drawMini(t) { if (!MG || mcv.classList.contains('hidden')) return; const c = mctx; c.fillStyle = '#fff5f8'; c.fillRect(0, 0, 480, 300);
  if (MG.game === 'memory') { $('#m-info').textContent = `뒤집기 ${MG.moves}`;
    MG.cards.forEach((cd, i) => { const r = cardRect(i); c.fillStyle = '#1d2557'; c.fillRect(r.x - 2, r.y - 2, MC.w + 4, MC.h + 4);
      if (cd.up || cd.done) { c.fillStyle = cd.done ? '#d8f5c8' : '#fff'; c.fillRect(r.x, r.y, MC.w, MC.h);
        drawPet(c, r.x + MC.w / 2, r.y + MC.h - 4, 54, cd.f ? { char: cd.f, stage: 'child' } : { char: 1, stage: 'egg' }, t, { still: true }); }
      else { c.fillStyle = '#f7a8b8'; c.fillRect(r.x, r.y, MC.w, MC.h); heart(c, r.x + MC.w / 2, r.y + MC.h / 2, 4, '#fff'); } }); }
  else { const now = t, left = Math.max(0, MG.end - now); $('#m-info').textContent = `💗 ${MG.hits} · ${Math.ceil(left / 1000)}초`;
    if (left <= 0) { const m = MG; MG = null; socket.emit('m:end', { game: 'pop', score: m.hits }); return; }
    if (now > MG.next) { const free = [...Array(9).keys()].filter(i => !MG.holes.some(o => o.i === i && o.until > now)); const i = free[Math.floor(Math.random() * free.length)];
      const life = 1100 - Math.min(500, (now - MG.t0) / 40); MG.holes.push({ i, until: now + life }); MG.next = now + 380 + Math.random() * 380; MG.holes = MG.holes.filter(o => o.until > now - 50); }
    HOLES.forEach((h, i) => { c.fillStyle = '#1d2557'; c.fillRect(h.x - 42, h.y + 18, 84, 14); c.fillStyle = '#c9a3e8'; c.fillRect(h.x - 40, h.y + 20, 80, 10);
      const o = MG.holes.find(q => q.i === i && q.until > now); if (o) { const k = Math.min(1, (o.until - now) / 150); heart(c, h.x, h.y - 4 * (1 - k), 8, '#1d2557'); heart(c, h.x, h.y - 4 * (1 - k), 6.5, '#ff4f8a'); } });
    MG.pops = MG.pops.filter(p => now - p.t < 500); for (const p of MG.pops) { c.globalAlpha = 1 - (now - p.t) / 500; c.fillStyle = '#1d2557'; c.font = '20px Galmuri11, monospace'; c.fillText('+1', p.x - 10, p.y - 30 - (now - p.t) / 20); c.globalAlpha = 1; } } }
(function miniLoop(t) { drawMini(t); requestAnimationFrame(miniLoop); })(performance.now());

// ---- BREAKOUT 벽돌부수기 (1-2 players, server-authoritative; own paddle predicted locally, balls extrapolated) ----
const bkcv = $('#bkCv'), bkctx = bkcv.getContext('2d'); bkctx.imageSmoothingEnabled = false; let BK = null;
const BRICK_COL = ['#f7a8b8', '#ffd27a', '#a6e3a1', '#9cc9f5', '#c9a3e8'];
$('#bk-btn').onclick = () => { socket.emit('plaza:leave'); socket.emit('v:cancel'); show('breakout'); BK = null; bkcv.classList.add('hidden'); $('#bk-lobby').classList.remove('hidden'); $('#bk-hud').textContent = ''; sendSnap(); socket.emit('bk:join'); };
$('#bk-back').onclick = () => { socket.emit('bk:leave'); BK = null; enterPlaza(); };
$('#bk-start').onclick = () => socket.emit('bk:start');
function bkMine() { return BK && BK.paddles.find(p => p.sid === socket.id); }
function bkRev() { const s = BK && BK.cur && BK.cur.p.find(q => q[0] === socket.id); return !!(s && s[7]); }
function bkAim(x) { const p = bkMine(); if (!p) return; if (bkRev()) x = p.lo + p.hi - x; /* 발판 반대로 debuff: mirror within own half */ BK.tx = Math.max(p.lo + p.w / 2, Math.min(p.hi - p.w / 2, x)); bkSend(); }
// send the target (throttled ~30ms) and ALWAYS the final one: the old throttle dropped the last move, so the server paddle stopped short of the drawn one
function bkSend(force) { if (!BK || BK.tx === BK.lastTx) return; const now = performance.now(); if (!force && now - (BK.sent || 0) < 30) return; BK.sent = now; BK.lastTx = BK.tx; socket.emit('bk:x', BK.tx); }
const bkPtr = e => { if (!BK) return; const r = bkcv.getBoundingClientRect(); bkAim((e.clientX - r.left) * 480 / r.width); };
bkcv.addEventListener('pointerdown', bkPtr); bkcv.addEventListener('pointermove', e => { if (e.buttons || e.pointerType !== 'mouse') bkPtr(e); });
let bkHold = 0; const bkKeys = { ArrowLeft: -1, a: -1, A: -1, ArrowRight: 1, d: 1, D: 1 };
addEventListener('keydown', e => { if (BK && bkKeys[e.key]) { e.preventDefault(); bkHold = bkKeys[e.key]; } });
addEventListener('keyup', e => { if (bkKeys[e.key] === bkHold) bkHold = 0; });
document.querySelectorAll('.bkpad button').forEach(b => { b.addEventListener('pointerdown', e => { e.preventDefault(); bkHold = +b.dataset.m; }); ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => b.addEventListener(ev, () => { bkHold = 0; })); });
function bkLobby(l) { const pl = $('#bk-players'); pl.innerHTML = '';
  l.players.forEach(p => { const d = document.createElement('div'); d.className = 'item';
    d.innerHTML = `<span><span class="dot" style="background:${p.color}"></span>${p.nickname}${p.sid === socket.id ? ' (나)' : ''}</span><span>${p.sid === l.host ? '👑 방장' : ''}</span>`; pl.appendChild(d); });
  $('#bk-start').classList.toggle('hidden', l.host !== socket.id || l.state !== 'lobby');
  $('#bk-info').textContent = l.state === 'playing' ? '게임 진행 중...' : l.countdown ? `${l.countdown}초 후 자동 시작!` : l.players.length < 2 ? `친구 1명과 같이 할 수 있어요 (${l.players.length}/2) · 혼자서도 시작 가능` : ''; }
function bkBind() {
  socket.on('bk:lobby', l => { if (!$('#breakout').classList.contains('hidden')) bkLobby(l); });
  socket.on('bk:kicked', kickedToPlaza);
  socket.on('bk:start', d => { BK = { ...d, cur: null, tAt: 0, sent: 0, pops: [] }; const me = bkMine(); BK.tx = me ? (me.lo + me.hi) / 2 : 240;
    $('#bk-lobby').classList.add('hidden'); bkcv.classList.remove('hidden'); });
  socket.on('bk:level', lv => { toast(`${lv}단계! 더 어려워져요 🧱`); });
  socket.on('bk:item', d => { if (!BK) return; const p = BK.cur && BK.cur.p.find(q => q[0] === d.sid); BK.pops.push({ text: d.label, kind: d.kind, x: p ? p[1] : 240, t: performance.now() }); });
  socket.on('bk:state', st => { if (!BK) return; BK.cur = st; for (const q of st.p) { const p = BK.paddles.find(x => x.sid === q[0]); if (p) p.w = q[3]; } BK.tAt = performance.now(); $('#bk-hud').textContent = `${st.lv}단계 · ${'♥'.repeat(Math.max(0, st.lives))} · ⏱${st.t}`; });
  socket.on('bk:end', res => { BK = null; const me = res.find(r => r.sid === socket.id) || res[0];
    $('#end-title').textContent = me.win ? '🏆 모든 벽돌 클리어!' : '🧱 게임 끝!';
    $('#end-msg').textContent = `${res.map(r => r.nickname).join(' + ')} · 벽돌 ${me.bricks}개${me.levels ? ` · ${me.levels}단계 클리어` : ''} · +${me.coins} 코인, 에너지 -${me.energy}`;
    $('#end-modal').classList.remove('hidden'); });
}
// own paddle is drawn where the SERVER paddle is (its collider), moved at most one server step toward our target.
// The old code drew a separate local prediction (7px per frame, frame-rate dependent) that ran ahead of / away from the real collider.
function bkDrawX(p, sx, t) { const k = Math.min(1, (t - BK.tAt) / BK.tick), step = 14 * k, d = Math.max(-step, Math.min(step, BK.tx - sx));
  return Math.max(p.lo + p.w / 2, Math.min(p.hi - p.w / 2, sx + d)); }
function drawBreakout(t) { if (!BK || bkcv.classList.contains('hidden')) return; const c = bkctx, g = BK.geo, st = BK.cur;
  c.fillStyle = '#fff5f8'; c.fillRect(0, 0, 480, 320); c.fillStyle = '#fbe3ea'; for (let y = 0; y < 320; y += 16) for (let x = (y / 16) % 2 * 16; x < 480; x += 32) c.fillRect(x, y, 16, 16);
  if (BK.paddles.length > 1) { c.fillStyle = 'rgba(29,37,87,.12)'; for (let y = 200; y < 320; y += 8) c.fillRect(239, y, 2, 4); }
  const dt = Math.min(100, t - (BK.lastT || t)); BK.lastT = t; const me = bkMine();
  if (me) { if (bkHold) BK.tx = Math.max(me.lo + me.w / 2, Math.min(me.hi - me.w / 2, BK.tx + (bkRev() ? -bkHold : bkHold) * 14 / BK.tick * dt)); bkSend(); }
  if (!st) return;
  st.k.forEach((v, i) => { if (!v) return; const x = g.BX + (i % g.COLS) * g.BW, y = g.BY + Math.floor(i / g.COLS) * g.BH, bw = g.BW - g.GAP, bh = g.BH - g.GAP;
    c.fillStyle = '#1d2557'; c.fillRect(x, y, bw, bh);
    if (v === 9) { c.fillStyle = '#7d869a'; c.fillRect(x + 2, y + 2, bw - 4, bh - 4); c.fillStyle = '#3d4458'; c.fillRect(x + 2, y + bh - 4, bw - 4, 2); for (const rx of [5, bw - 7]) c.fillRect(x + rx, y + 5, 2, 2); c.fillStyle = 'rgba(255,255,255,.6)'; c.fillRect(x + 3, y + 3, bw - 6, 1); return; }
    c.fillStyle = v === 3 ? '#6a4fb3' : v === 2 ? '#e0913a' : BRICK_COL[Math.floor(i / g.COLS) % 5]; c.fillRect(x + 2, y + 2, bw - 4, bh - 4);
    c.fillStyle = 'rgba(255,255,255,.55)'; c.fillRect(x + 3, y + 3, bw - 10, 2);
    if (v > 1) { c.fillStyle = '#fff'; for (let j = 0; j < v; j++) c.fillRect(x + bw / 2 - v * 3 + j * 6 + 1, y + 8, 4, 3); } });
  for (const [x, y] of st.sh || []) { c.fillStyle = '#ff3b6b'; c.fillRect(x - 1, y - 6, 3, 8); c.fillStyle = '#fff'; c.fillRect(x, y - 5, 1, 4); }
  for (const [x, y, kind] of st.it || []) bkIcon(c, x, y + (t - BK.tAt) / BK.tick * 2.2, kind);
  { let ex = 6; const me2 = st.p.find(q => q[0] === socket.id) || st.p[0], act = [];
    if (me2) { if (me2[4]) act.push(['wide', me2[4]]); if (me2[5]) act.push(['shrink', me2[5]]); if (me2[6]) act.push(['laser', me2[6]]); if (me2[7]) act.push(['rev', me2[7]]); }
    if (st.fx) { if (st.fx[0]) act.push(['slow', st.fx[0]]); if (st.fx[1]) act.push(['fast', st.fx[1]]); if (st.fx[2]) act.push(['blink', st.fx[2]]); }
    for (const [kind, sec] of act) { bkIcon(c, ex + 11, 14, kind); c.fillStyle = '#1d2557'; c.font = '10px Galmuri11, monospace'; c.fillText(sec + 's', ex + 24, 18); ex += 46; } }
  const k = Math.min(1, (t - BK.tAt) / BK.tick);
  const hide = st.fx && st.fx[2] && t % 700 > 380; // 공 깜빡임 debuff: ball invisible ~45% of the time, in short flashes
  for (const [x, y, vx, vy, w] of st.b) { if (hide && !w) continue; const bx = w ? x : x + vx * k, by = w ? y : y + vy * k; c.fillStyle = '#1d2557'; c.fillRect(bx - g.R, by - g.R, g.R * 2, g.R * 2); c.fillStyle = '#fff'; c.fillRect(bx - g.R + 2, by - g.R + 2, g.R * 2 - 4, g.R * 2 - 4); }
  for (const [sid, sx, gone] of st.p) { const p = BK.paddles.find(q => q.sid === sid); if (!p || gone) continue; const x = sid === socket.id ? bkDrawX(p, sx, t) : sx;
    c.fillStyle = '#1d2557'; c.fillRect(x - p.w / 2 - 2, g.PY - 2, p.w + 4, g.PH + 4); c.fillStyle = p.color; c.fillRect(x - p.w / 2, g.PY, p.w, g.PH);
    const lk = BK.looks[sid] || {}; drawPet(c, x, g.PY - 1, 22, { ...lk, stage: ['egg', 'dead'].includes(lk.stage) || !lk.stage ? 'baby' : lk.stage, sick: false, sleeping: false }, t, { still: true });
    c.fillStyle = '#1d2557'; c.font = '10px Galmuri11, monospace'; c.textAlign = 'center'; c.fillText(p.nickname + (sid === socket.id ? ' (나)' : ''), x, 318); c.textAlign = 'left'; }
  BK.pops = BK.pops.filter(p => t - p.t < 1400);
  BK.pops.forEach((p, n) => { const a = (t - p.t) / 1400, y = g.PY - 34 - a * 30 - (BK.pops.length - 1 - n) * 15; c.globalAlpha = 1 - a * a; c.font = 'bold 13px Galmuri11, monospace'; c.textAlign = 'center';
    c.fillStyle = '#fff'; for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) c.fillText(p.text, Math.max(50, Math.min(430, p.x)) + dx, y + dy);
    c.fillStyle = BK_ITEM[p.kind][0]; c.fillText(p.text, Math.max(50, Math.min(430, p.x)), y); c.textAlign = 'left'; c.globalAlpha = 1; }); }
// item capsules: color + 5x5 pixel glyph (good items bright, bad ones dark red)
const BK_ITEM = { wide: ['#2f9e6b', ['00000', '10001', '11111', '10001', '00000']], multi: ['#3f7fe0', ['01000', '00010', '01000', '00010', '01000']],
  slow: ['#29a3b8', ['11111', '01010', '00100', '01010', '11111']], laser: ['#e0435f', ['00100', '00100', '00100', '01110', '10101']],
  life: ['#f2668b', ['01010', '11111', '11111', '01110', '00100']], shrink: ['#7a2a3a', ['00000', '01110', '01110', '01110', '00000']],
  fast: ['#b8452a', ['10100', '01010', '00101', '01010', '10100']],
  rev: ['#5b2a7a', ['01000', '11111', '01000', '00010', '11111']], blink: ['#4a4a5e', ['10101', '00000', '10101', '00000', '10101']] };
function bkIcon(c, x, y, kind) { const [col, px] = BK_ITEM[kind] || BK_ITEM.wide; x = Math.round(x); y = Math.round(y);
  c.fillStyle = '#1d2557'; c.fillRect(x - 11, y - 7, 22, 14); c.fillStyle = col; c.fillRect(x - 9, y - 5, 18, 10);
  c.fillStyle = '#fff'; px.forEach((row, r) => [...row].forEach((v, k) => { if (v === '1') c.fillRect(x - 5 + k * 2, y - 5 + r * 2, 2, 2); })); }
(function bkLoop(t) { drawBreakout(t); requestAnimationFrame(bkLoop); })(performance.now());

// ---- CREATOR (캐릭터 만들기, v1.7): 프리셋 7종 또는 기본 몸(눈·표정 + 몸 색깔) + 이름 + 성격 ----
const esc = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
let CR = null; const crcv = $('#crPreview'), crctx = crcv.getContext('2d');
function openCreator(mode) {
  const p = S && S.pet, c = p && p.custom;
  CR = { mode, body: c ? 'custom' : mode === 'new' ? 'custom' : p.char, eyes: c ? c.eyes : 'x1', color: c ? c.color : 'peach', char: p ? p.char : 1, name: p && p.name || '' };
  $('#cr-title').textContent = mode === 'edit' ? '캐릭터 바꾸기' : mode === 'restart' ? '새 알 만들기' : '나만의 펫 만들기';
  $('#cr-ok').textContent = mode === 'edit' ? '저장하기' : '이 펫으로 시작!'; $('#cr-cancel').classList.toggle('hidden', mode === 'new');
  $('#cr-name').value = CR.name; renderCreator(); $('#creator-modal').classList.remove('hidden'); }
// 성격 = ability only (icon, short effect); shown in the picker
const ABIL = { 1: ['🧼', '청결 150 · 병↓ · 약 반값'], 2: ['💗', '행복 150 · 코인 1.5배 · 응원'], 3: ['💤', '에너지 150'], 4: ['💰', '코인 2배 · 최대 2배'], 5: ['🏃', '에너지·레이드HP 130'], 6: ['🛡️', '레이드 HP 160'], 7: ['🍚', '배고픔 150 · 공격 1.3배'] };
const traitLocked = () => CR.mode === 'edit' && S.pet.stage !== 'egg';
function crBtn(parent, html, sel, on, data) { const b = document.createElement('button'); b.className = 'cr-opt' + (sel ? ' sel' : ''); b.innerHTML = html; b.onclick = on; if (data) b.dataset.opt = data; parent.appendChild(b); return b; }
function renderCreator() {
  const body = $('#cr-body'); body.innerHTML = '';
  // 성격 never decides looks: once the trait is locked, a custom pet can't jump to the preset that happens to share its trait
  const bodies = traitLocked() ? (S.pet.custom ? ['custom'] : [S.pet.char, 'custom']) : [1, 2, 3, 4, 5, 6, 7, 'custom'];
  for (const k of bodies) crBtn(body, k === 'custom' ? '<img src="assets/pets/x1/child.png" alt=""><small>기본 몸</small>' : `<img src="assets/pets/${k}/child.png" alt=""><small>${G.TRAITS[k].name}</small>`, CR.body === k,
    () => { CR.body = k; if (k !== 'custom') CR.char = k; renderCreator(); }, 'body:' + k);
  $('#cr-custom').classList.toggle('hidden', CR.body !== 'custom');
  const ey = $('#cr-eyes'); ey.innerHTML = '';
  for (const e of G.CUSTOM.eyes) crBtn(ey, `<img data-rc="1" src="assets/pets/${e}/baby.png" alt=""><small>${G.CUSTOM.eyesKo[e]}</small>`, CR.eyes === e, () => { CR.eyes = e; renderCreator(); }, 'eyes:' + e);
  const co = $('#cr-colors'); co.innerHTML = '';
  for (const [k, hex] of Object.entries(G.CUSTOM.colors)) crBtn(co, `<i class="sw" style="background:${hex}"></i><small>${G.CUSTOM.colorsKo[k]}</small>`, CR.color === k, () => { CR.color = k; renderCreator(); }, 'color:' + k);
  if (CR.color !== 'peach') ey.querySelectorAll('img[data-rc]').forEach(im => recolorUrl(im.getAttribute('src'), CR.color, u => { im.src = u; }));
  const tr = $('#cr-trait'); tr.innerHTML = ''; const lock = traitLocked() || CR.body !== 'custom';
  for (let k = 1; k <= G.NCHAR; k++) { const b = crBtn(tr, `<b>${ABIL[k][0]}</b><small>${G.TRAITS[k].name}</small><small class="ab">${ABIL[k][1]}</small>`, CR.char === k, () => { if (lock) return toast(traitLocked() ? '성격은 새 알에서만 바꿀 수 있어요' : '프리셋은 성격이 정해져 있어요'); CR.char = k; renderCreator(); }, 'trait:' + k); if (lock && CR.char !== k) b.disabled = true; }
  $('#cr-tdesc').textContent = '✨ ' + G.TRAITS[CR.char].desc + (traitLocked() ? ' (성격은 새 알에서만 바꿀 수 있어요)' : CR.body !== 'custom' ? ' (프리셋은 능력이 정해져 있어요 · 기본 몸이면 자유롭게 골라요)' : ' (능력만 바뀌고 모습은 그대로예요)');
}
function drawCreator(t) { const c = crctx; c.fillStyle = '#fff5f8'; c.fillRect(0, 0, crcv.width, crcv.height); c.fillStyle = '#fbe3ea'; c.fillRect(0, crcv.height - 24, crcv.width, 24);
  const lk = CR.body === 'custom' ? { char: CR.char, custom: { eyes: CR.eyes, color: CR.color } } : { char: CR.body };
  drawPet(c, crcv.width / 2, crcv.height - 12, 170, { ...lk, stage: 'child', hair: 'base', outfit: 'base', acc: 'none' }, t, { still: true }); }
$('#cr-ok').onclick = () => {
  const name = G.cleanName($('#cr-name').value), custom = CR.body === 'custom' ? { eyes: CR.eyes, color: CR.color } : null, char = CR.body === 'custom' ? CR.char : CR.body;
  closeModal('creator-modal');
  if (CR.mode === 'new') { const ident = getIdentity(); localStorage.setItem(SAVE_KEY, JSON.stringify(G.newPlayer(ident.playerId, ident.nickname, Date.now(), char, custom, name))); start(); return; }
  if (CR.mode === 'restart') return act('restart', { char, custom, name });
  act('look', { name, custom, ...(traitLocked() ? {} : { char }) }); };
$('#cr-cancel').onclick = () => closeModal('creator-modal');
(function crLoop(t) { if (CR && !$('#creator-modal').classList.contains('hidden')) drawCreator(t); requestAnimationFrame(crLoop); })(0);
start(); // after creator code is defined

// ---- 1:1 내기 대결 (v1.10): 💣 폭탄 넘기기 + 🎨 그림 그리기 대결. Server owns stakes, fuse, prompts and answers. ----
const ARW = { up: '▲', down: '▼', left: '◀', right: '▶' }, DPAL = ['#ffffff', '#1d2557', '#f2545b', '#f2a25c', '#ffe066', '#6cc98a', '#5aa0f2', '#a98be0'];
let BM = null, DR = null, duMode = 'bomb', duLob = null;
const RULES = { bomb: '💣 폭탄을 들고 있으면 화살표 3~5개를 순서대로 눌러 상대에게 넘겨요. 숨겨진 30~60초 심지가 다 타면 들고 있던 쪽이 져요!',
  draw: '🎨 서로 다른 비밀 단어를 40초 동안 16×16 픽셀로 그려요. 그다음 상대 그림을 보고 4개 중에서 맞혀요. 혼자 맞히면 승리, 둘 다 맞히면 더 빨리 맞힌 쪽 승리, 둘 다 틀리면 환불!' };
function duelLobby() { BM = null; DR = null; show('duel'); $('#du-title').textContent = '1:1 내기 대결'; $('#du-time').textContent = '';
  $('#du-lobby').classList.remove('hidden'); $('#bomb-play').classList.add('hidden'); $('#draw-play').classList.add('hidden'); renderDuMode(); sendSnap(); socket.emit('b:watch'); }
function renderDuMode() { document.querySelectorAll('#du-modes button').forEach(b => b.classList.toggle('sel', b.dataset.mode === duMode)); $('#du-rule').textContent = RULES[duMode]; }
$('#duel-btn').onclick = () => { if (S && ['egg', 'baby'].includes(S.pet.stage)) return toast('어린이부터 할 수 있어요 (알·아기는 안 돼요)'); socket.emit('plaza:leave'); socket.emit('v:cancel'); duelLobby(); };
$('#du-back').onclick = () => { if ((BM || DR) && !confirm('지금 나가면 기권패! 판돈을 잃어요. 나갈까요?')) return; socket.emit('b:leave'); BM = null; DR = null; enterPlaza(); };
document.querySelectorAll('#du-modes button').forEach(b => b.onclick = () => { duMode = b.dataset.mode; renderDuMode(); });
document.querySelectorAll('#du-stakes button').forEach(b => b.onclick = () => { sendSnap(); socket.emit('b:create', +b.dataset.stake, duMode); });
$('#du-cancel').onclick = () => socket.emit('b:cancel');
function renderDuTables(l) { duLob = l; const mine = l.tables.find(t => t.hostSid === socket.id); $('#du-cancel').classList.toggle('hidden', !mine);
  $('#du-tables').innerHTML = (l.playing ? `<p class="hint">진행 중: ${l.players.map(esc).join(' vs ')} (${l.mode === 'draw' ? '🎨' : '💣'})</p>` : '') +
    (l.tables.length ? l.tables.map(t => `<div class="item"><span>${t.mode === 'draw' ? '🎨' : '💣'} ${esc(t.host)} · 🪙${t.stake}</span>${t.hostSid === socket.id ? '<small>상대 기다리는 중...</small>' : `<button class="small b-pink" data-join="${t.id}">도전!</button>`}</div>`).join('') : '<p class="hint">열린 테이블이 없어요. 판돈을 눌러 열어보세요!</p>');
  $('#du-tables').querySelectorAll('[data-join]').forEach(b => b.onclick = () => { sendSnap(); socket.emit('b:join', +b.dataset.join); }); }
function duEnd(title, msg) { $('#end-title').textContent = title; $('#end-msg').textContent = msg; $('#end-modal').classList.remove('hidden'); }
// bomb
const bcv = $('#bombCv'), bctx = bcv.getContext('2d'); bctx.imageSmoothingEnabled = false;
function bombKey(d) { if (BM && BM.st && BM.st.holder === socket.id) socket.emit('b:key', d); }
document.querySelectorAll('#bomb-pad button').forEach(b => b.onpointerdown = e => { e.preventDefault(); bombKey(b.dataset.d); });
addEventListener('keydown', e => { if ($('#duel').classList.contains('hidden') || !BM) return; const d = SKEY[e.key]; if (d) { e.preventDefault(); bombKey(d); } });
function renderBombSeq() { const st = BM.st, mine = st.holder === socket.id;
  $('#bomb-seq').innerHTML = mine ? st.seq.map((d, i) => `<span class="${i < st.idx ? 'ok' : i === st.idx ? 'nx' : ''}">${ARW[d]}</span>`).join(' ') : '<span>😮‍💨</span>';
  $('#bomb-msg').textContent = mine ? (st.lock > 0 ? '❌ 틀렸어요! 잠깐 멈춤...' : '💣 내가 들고 있어요! 빨리 넘겨요!') : '상대가 폭탄을 들고 있어요... 두근두근';
  $('#du-time').textContent = `🔁 ${st.passes}번 넘김`; }
function drawBomb(t) { const c = bctx, st = BM.st; c.fillStyle = '#ffe9f0'; c.fillRect(0, 0, 480, 260); c.fillStyle = '#c9ecd2'; c.fillRect(0, 210, 480, 50);
  BM.players.forEach((p, i) => { const x = i ? 360 : 120; drawPet(c, x, 205, 110, p.look, t, { still: false });
    c.fillStyle = '#1d2557'; c.font = 'bold 15px sans-serif'; c.textAlign = 'center'; c.fillText(p.look.nickname + (p.sid === socket.id ? ' (나)' : ''), x, 250); });
  if (!st) return; const hi = BM.players.findIndex(p => p.sid === st.holder); BM.bx = BM.bx == null ? (hi ? 360 : 120) : BM.bx + ((hi ? 360 : 120) - BM.bx) * 0.2;
  const heat = st.heat, sh = heat * 4 * Math.sin(t / (60 - heat * 40)), bx = BM.bx + sh, by = 60 - Math.abs(Math.sin((BM.bx - 120) / 240 * Math.PI)) * 40;
  c.fillStyle = '#2b2b3a'; c.beginPath(); c.arc(bx, by, 24 + heat * 4, 0, 7); c.fill(); c.fillStyle = '#fff'; c.fillRect(bx - 12, by - 12, 6, 6);
  c.strokeStyle = '#8a5a2a'; c.lineWidth = 4; c.beginPath(); c.moveTo(bx + 14, by - 18); c.lineTo(bx + 24, by - 32); c.stroke();
  c.fillStyle = (t / 80 | 0) % 2 ? '#ffb400' : '#f2545b'; c.beginPath(); c.arc(bx + 25, by - 34, 6 + heat * 5, 0, 7); c.fill();
  c.fillStyle = `rgba(242,84,91,${heat * 0.25})`; c.fillRect(0, 0, 480, 260); }
// draw
const dcv = $('#drawCv'), dctx = dcv.getContext('2d'); let dColor = 1, dDown = false;
$('#draw-pal').innerHTML = DPAL.map((c, i) => `<button data-c="${i}" style="background:${c}"${i === 1 ? ' class="sel"' : ''}></button>`).join('');
document.querySelectorAll('#draw-pal button').forEach(b => b.onclick = () => { dColor = +b.dataset.c; document.querySelectorAll('#draw-pal button').forEach(x => x.classList.toggle('sel', x === b)); });
function paintGrid(pic) { const n = 16, s = 320 / n; for (let i = 0; i < n * n; i++) { dctx.fillStyle = DPAL[+pic[i] || 0]; dctx.fillRect((i % n) * s, (i / n | 0) * s, s, s); }
  dctx.strokeStyle = '#f0e4ea'; dctx.lineWidth = 1; for (let k = 1; k < n; k++) { dctx.beginPath(); dctx.moveTo(k * s, 0); dctx.lineTo(k * s, 320); dctx.moveTo(0, k * s); dctx.lineTo(320, k * s); dctx.stroke(); } }
function dPaint(e) { if (!DR || DR.phase !== 'draw' || DR.sent) return; const r = dcv.getBoundingClientRect(), x = Math.floor((e.clientX - r.left) / r.width * 16), y = Math.floor((e.clientY - r.top) / r.height * 16);
  if (x < 0 || y < 0 || x > 15 || y > 15) return; const i = y * 16 + x; DR.pic[i] = dColor; paintGrid(DR.pic); }
dcv.onpointerdown = e => { dDown = true; dcv.setPointerCapture(e.pointerId); dPaint(e); }; dcv.onpointermove = e => dDown && dPaint(e); dcv.onpointerup = () => dDown = false;
$('#draw-clear').onclick = () => { if (DR && DR.phase === 'draw' && !DR.sent) { DR.pic.fill(0); paintGrid(DR.pic); } };
function sendPic() { if (!DR || DR.sent) return; DR.sent = true; socket.emit('d:pic', DR.pic.join('')); $('#draw-msg').textContent = '제출했어요! 상대를 기다리는 중...'; }
$('#draw-done').onclick = sendPic;
function duTimer(ms, el, onEnd) { clearInterval(DR && DR.tm); const end = Date.now() + ms; DR.tm = setInterval(() => { const s = Math.max(0, Math.ceil((end - Date.now()) / 1000)); el.textContent = `⏱ ${s}초`; if (!s) { clearInterval(DR.tm); onEnd && onEnd(); } }, 200); }
function bindDuel() {
  socket.on('b:lobby', l => { if (!$('#duel').classList.contains('hidden')) renderDuTables(l); });
  socket.on('b:start', d => { if (!d.players.some(p => p.sid === socket.id)) return; BM = { players: d.players, st: null, bx: null };
    $('#du-lobby').classList.add('hidden'); $('#bomb-play').classList.remove('hidden'); $('#du-title').textContent = `💣 폭탄 넘기기 · 상금 🪙${d.prize}`; sendSnap(); });
  socket.on('b:state', st => { if (!BM) return; BM.st = st; renderBombSeq(); });
  socket.on('b:miss', () => toast('틀렸어요! 새 화살표로 다시 ❌'));
  socket.on('b:end', d => { if (!BM) return; BM = null; sendSnap();
    if (d.draw) return duEnd('🤝 무승부', `${d.reason} · 🪙${d.refund} 돌려받음, 에너지 -${d.energy}`);
    const win = d.winner === socket.id; if (d.forfeit) return duEnd(win ? '🏆 기권승!' : '🏳️ 기권패', (win ? `상대가 나갔어요 · +${d.prize} 코인 (수수료 ${d.fee})` : `나가서 판돈 🪙${d.stake} 잃음`) + ` · 에너지 -${d.energy}`); duEnd(win ? '🏆 승리! 폭탄이 상대 손에서 펑!' : '💥 펑! 패배...', (win ? `+${d.prize} 코인 (판돈 ${d.stake}×2, 수수료 ${d.fee})` : `판돈 🪙${d.stake} 잃음`) + ` · ${d.passes}번 넘김 · 에너지 -${d.energy}`); });
  socket.on('d:start', d => { DR = { phase: 'draw', pic: new Array(256).fill(0), sent: false, players: d.players };
    $('#du-lobby').classList.add('hidden'); $('#draw-play').classList.remove('hidden'); $('#draw-pal').classList.remove('hidden'); $('#draw-tools').classList.remove('hidden'); $('#draw-choices').classList.add('hidden');
    $('#du-title').textContent = `🎨 그림 대결 · 상금 🪙${d.prize}`; $('#draw-word').innerHTML = `그려요: <span class="nx">${esc(d.word)}</span>`; $('#draw-msg').textContent = '상대에게는 비밀! 칸을 눌러 칠해요'; paintGrid(DR.pic); duTimer(d.ms, $('#du-time'), sendPic); sendSnap(); });
  socket.on('d:wait', w => { if (DR && DR.phase === 'draw' && !w.done.includes(socket.id)) $('#draw-msg').textContent = '상대가 다 그렸어요! 서둘러요 ✏️'; });
  socket.on('d:guess', g => { if (!DR) return; DR.phase = 'guess'; DR.sent = true; paintGrid(g.pic); $('#draw-pal').classList.add('hidden'); $('#draw-tools').classList.add('hidden');
    $('#draw-word').textContent = `${g.from}의 그림은 뭘까요?`; $('#draw-msg').textContent = '한 번만 고를 수 있어요! 빨리 맞힐수록 유리해요';
    const ch = $('#draw-choices'); ch.classList.remove('hidden'); ch.innerHTML = g.choices.map((w, i) => `<button class="small b-pink" data-g="${i}">${esc(w)}</button>`).join('');
    ch.querySelectorAll('button').forEach(b => b.onclick = () => { socket.emit('d:guess', +b.dataset.g); ch.querySelectorAll('button').forEach(x => { x.disabled = true; x.classList.toggle('b-green', x === b); }); $('#draw-msg').textContent = '골랐어요! 결과를 기다려요...'; });
    duTimer(g.ms, $('#du-time')); });
  socket.on('d:end', d => { if (!DR) return; clearInterval(DR.tm); DR = null; sendSnap(); const me = (d.info || []).find(x => x.sid === socket.id), op = (d.info || []).find(x => x.sid !== socket.id);
    const line = me && op ? `내 단어 「${me.word}」 → 상대 답 ${op.guess ? `「${op.guess}」${op.ok ? '⭕' : '❌'}` : '없음'} · 상대 단어 「${op.word}」 → 내 답 ${me.guess ? `「${me.guess}」${me.ok ? '⭕' : '❌'}` : '없음'}` : '';
    if (d.draw) return duEnd('🤝 무승부', `${d.reason} · 🪙${d.refund} 돌려받음 · ${line} · 에너지 -${d.energy}`);
    const win = d.winner === socket.id; if (d.forfeit) return duEnd(win ? '🏆 기권승!' : '🏳️ 기권패', (win ? `상대가 나갔어요 · +${d.prize} 코인 (수수료 ${d.fee})` : `나가서 판돈 🪙${d.stake} 잃음`) + ` · 에너지 -${d.energy}`);
    duEnd(win ? '🏆 그림 대결 승리!' : '😢 그림 대결 패배...', (win ? `+${d.prize} 코인 (수수료 ${d.fee})` : `판돈 🪙${d.stake} 잃음`) + ` · ${line} · 에너지 -${d.energy}`); });
}
