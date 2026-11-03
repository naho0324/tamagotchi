// Stateless relay server: pets/coins/items live in each browser (localStorage). The server only hosts rooms + minigames,
// trusts (and clamps) the pet snapshot a client sends, and returns results ({coins, energy}) for the client to apply.
const express = require('express'), http = require('http'), path = require('path');
const { Server } = require('socket.io');
const { resolvePlayer } = require('./auth');
const G = require('./game');
const { Match } = require('./volley');
const { SnakeLobby } = require('./snake');
const { RaidLobby } = require('./raid');

const app = express(); app.use(express.static(path.join(__dirname, 'public')));
app.get('/game.js', (q, r) => r.sendFile(path.join(__dirname, 'game.js'))); // shared care rules for the client
app.get('/health', (q, r) => r.json({ ok: true, online: io.engine.clientsCount, rooms: rooms.size }));
const server = http.createServer(app), io = new Server(server, { transports: ['websocket'], perMessageDeflate: false });

const MAX_ROOM = 6, CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I/L
const ROOM_TTL = +process.env.ROOM_TTL_MS || 30 * 60 * 1000; // empty room lifetime
const COST = { volley: 15, snake: 15 };
const rooms = new Map(); // code -> room
const matches = new Map(); // socketId -> match
const sock = sid => io.sockets.sockets.get(sid);
const snapOf = s => s && s.snap;

function newCode() { let c; do { c = ''; for (let i = 0; i < 6; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]; } while (rooms.has(c)); return c; }
const normCode = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
// give a client its result; also keep the server-side snapshot in step so the gate stays meaningful
function apply(s, d) { if (!s) return d; const p = s.snap;
  if (p && d.coins > 0 && p.char === 2 && p.stats.happy > 120) d = { ...d, coins: Math.round(d.coins * 1.5), bonus: 1.5 }; // 애교쟁이
  if (p && d.energy) p.stats.energy = G.clamp(p.stats.energy + d.energy, G.maxOf(p.char, 'energy')); s.emit('apply', d); return d; }
function canPlay(s, cost) {
  const p = snapOf(s); if (!p) return '펫 정보가 없어요';
  if (p.stage === 'dead') return '하늘나라에 간 펫은 놀 수 없어요';
  if (p.sleeping) return '자고 있어요 💤 깨운 뒤에 놀아요';
  if (p.sick) return '아파서 놀 수 없어요. 약을 먹여주세요';
  if (p.stats.energy < cost) return `에너지가 부족해요 (필요: ${cost})`;
  return null;
}
const look = s => { const p = s.snap; return { nickname: p.nickname, stage: p.stage, char: p.char, style: 0, hair: p.hair, outfit: p.outfit, sick: p.sick, sleeping: p.sleeping }; };

function makeRoom() {
  const code = newCode(), room = { code, members: new Map(), queue: null };
  room.snake = new SnakeLobby(io, results => {
    for (const r of results) { const so = sock(r.sid); if (so) { if (!r.left && r.coins) r.coins = apply(so, { coins: r.coins }).coins; so.emit('s:end', results); } }
  }, 'snake:' + code);
  room.raid = new RaidLobby(io, (win, results, diff, hp, max) => {
    for (const r of results) { const so = sock(r.sid); if (so) { if (!r.left && r.coins) r.coins = apply(so, { coins: r.coins }).coins; so.emit('r:end', { win, diff, hp, max, results, energy: r.energy, coins: r.coins }); } }
  }, 'raid:' + code);
  room.snake.gate = room.raid.gate = (p, cost) => { const so = sock(p.sid); return so ? canPlay(so, cost) : '연결이 끊겼어요'; };
  room.snake.charge = room.raid.charge = (players, cost) => players.forEach(p => apply(sock(p.sid), { energy: -cost }));
  rooms.set(code, room); return room;
}
function enterRoom(socket, room) {
  if (room.members.size >= MAX_ROOM) return `방이 가득 찼어요 (최대 ${MAX_ROOM}명)`;
  leaveRoom(socket);
  clearTimeout(room.reap); socket.roomCode = room.code; socket.join('room:' + room.code);
  room.members.set(socket.id, { sid: socket.id, x: 100 + Math.random() * 280, y: 180 + Math.random() * 80, inPlaza: false, ...look(socket) });
  return null;
}
function leaveRoom(socket) {
  const room = rooms.get(socket.roomCode); if (!room) return;
  room.raid.leave(socket.id); room.snake.leave(socket.id);
  if (room.queue && room.queue.socket.id === socket.id) room.queue = null;
  room.members.delete(socket.id); socket.leave('room:' + room.code); socket.roomCode = null;
  // Keep empty rooms alive for a while: on phones the creator switches apps to share the code, the browser
  // drops the socket, and deleting the room right then made every invite code dead on arrival.
  if (!room.members.size) { clearTimeout(room.reap); room.reap = setTimeout(() => { if (!room.members.size) rooms.delete(room.code); }, ROOM_TTL); }
}

io.use((socket, next) => { const u = resolvePlayer(socket.handshake); if (!u) return next(new Error('auth')); socket.user = u; next(); });
io.on('connection', socket => {
  const room = () => rooms.get(socket.roomCode);
  const need = (cb) => { const r = room(); if (!r) { socket.emit('toast', '먼저 방에 들어가세요'); cb && cb({ ok: false }); } return r; };
  socket.on('snap', s => { socket.snap = G.sanitizeSnap(s, socket.user.nickname); const r = room(), e = r && r.members.get(socket.id); if (e) Object.assign(e, look(socket)); });
  socket.on('room:create', (cb) => { if (typeof cb !== 'function') return; if (!socket.snap) return cb({ ok: false, msg: '펫 정보가 없어요' });
    const r = makeRoom(); enterRoom(socket, r); cb({ ok: true, code: r.code, count: r.members.size }); });
  socket.on('room:join', (code, cb) => { if (typeof cb !== 'function') return; if (!socket.snap) return cb({ ok: false, msg: '펫 정보가 없어요' });
    const c = normCode(code); if (c === socket.roomCode) return cb({ ok: true, code: c, count: room().members.size });
    const r = rooms.get(c); if (!r) return cb({ ok: false, msg: '그런 방이 없어요. 코드를 확인해주세요' });
    const e = enterRoom(socket, r); cb(e ? { ok: false, msg: e } : { ok: true, code: c, count: r.members.size }); });
  socket.on('room:leave', () => leaveRoom(socket));
  // plaza (per room)
  socket.on('plaza:join', () => { const r = need(); const e = r && r.members.get(socket.id); if (e) e.inPlaza = true; });
  socket.on('plaza:move', ({ x, y } = {}) => { const r = room(), e = r && r.members.get(socket.id); if (e && isFinite(x) && isFinite(y)) { e.x = Math.max(0, Math.min(480, x)); e.y = Math.max(140, Math.min(300, y)); } });
  socket.on('plaza:chat', t => { const r = room(), e = r && r.members.get(socket.id); if (e) { e.chat = String(t).slice(0, 40); e.chatAt = Date.now(); } });
  socket.on('plaza:leave', () => { const r = room(), e = r && r.members.get(socket.id); if (e) e.inPlaza = false; });
  // volleyball (queue per room)
  socket.on('v:queue', () => { const r = need(); if (!r) return;
    { const e = canPlay(socket, COST.volley); if (e) return socket.emit('toast', e); }
    if (matches.has(socket.id)) return;
    const q = r.queue;
    if (q && q.socket.id !== socket.id && q.socket.connected && q.socket.roomCode === r.code) {
      r.queue = null;
      const ea = canPlay(q.socket, COST.volley); if (ea) { q.socket.emit('toast', ea); q.socket.emit('v:kicked', ea); r.queue = { socket }; return socket.emit('v:waiting'); }
      startMatch([{ socket: q.socket, socketId: q.socket.id, look: look(q.socket) }, { socket, socketId: socket.id, look: look(socket) }], false);
    } else { r.queue = { socket }; socket.emit('v:waiting'); }
  });
  socket.on('v:cancel', () => { const r = room(); if (r && r.queue && r.queue.socket.id === socket.id) r.queue = null; });
  socket.on('v:practice', () => { if (matches.has(socket.id)) return;
    { const e = canPlay(socket, COST.volley); if (e) return socket.emit('toast', e); } const r = room(); if (r && r.queue && r.queue.socket.id === socket.id) r.queue = null;
    startMatch([{ socket, socketId: socket.id, look: look(socket) }, { socketId: null, look: { nickname: '연습봇', stage: 'child', char: 1 + Math.floor(Math.random() * 7), style: 3, wearing: {} } }], true); });
  socket.on('v:input', inp => { const m = matches.get(socket.id); if (m && inp) m.setInput(socket.id, inp); });
  socket.on('v:leave', () => { const m = matches.get(socket.id); if (m) m.leave(socket.id); });
  // single-player minigames: server checks energy at start and time/score at end, then awards via apply()
  socket.on('m:start', game => { const M = G.MINI[game]; if (!M) return; const e = canPlay(socket, M.energy); if (e) return socket.emit('m:denied', e);
    socket.mini = { game, t: Date.now() }; apply(socket, { energy: -M.energy }); socket.emit('m:go', { game }); });
  socket.on('m:end', d => { const m = socket.mini; socket.mini = null; if (!m || !d || d.game !== m.game) return; const M = G.MINI[m.game], dt = Date.now() - m.t;
    let coins = dt >= M.minMs && dt <= M.maxMs ? G.miniCoins(m.game, d.score) : 0; if (coins) coins = apply(socket, { coins }).coins;
    socket.emit('m:result', { game: m.game, score: Math.floor(+d.score) || 0, coins, energy: M.energy }); });
  socket.on('m:quit', () => { socket.mini = null; });
  // snake + raid (one lobby each per room)
  const joinLobby = (lob, cost, kick) => { const r = need(); if (!r) return socket.emit(kick, '먼저 방에 들어가세요');
    const e = canPlay(socket, cost); if (e) { socket.emit('toast', e); return socket.emit(kick, e); }
    const j = r[lob].join(socket, { ...look(socket), id: socket.user.id }); if (j && j !== 'already') socket.emit('toast', j); else r[lob].emitLobby(); };
  socket.on('s:join', () => joinLobby('snake', COST.snake, 's:kicked'));
  socket.on('s:leave', () => { const r = room(); r && r.snake.leave(socket.id); });
  socket.on('s:start', () => { const r = room(); const e = r ? r.snake.start(socket.id) : '방이 없어요'; if (e) socket.emit('toast', e); });
  socket.on('s:dir', d => { const r = room(); r && r.snake.setDir(socket.id, d); });
  socket.on('r:join', () => { const r = room(); joinLobby('raid', r ? r.raid.cost() : 0, 'r:kicked'); });
  socket.on('r:diff', d => { const r = room(); const e = r ? r.raid.setDiff(socket.id, d) : '방이 없어요'; if (e) socket.emit('toast', e); });
  socket.on('r:leave', () => { const r = room(); r && r.raid.leave(socket.id); });
  socket.on('r:start', () => { const r = room(); const e = r ? r.raid.start(socket.id) : '방이 없어요'; if (e) socket.emit('toast', e); });
  socket.on('r:input', inp => { const r = room(); r && r.raid.input(socket.id, inp); });
  socket.on('r:act', k => { const r = room(); r && r.raid.action(socket.id, k); });
  socket.on('disconnect', () => { const m = matches.get(socket.id); if (m) m.leave(socket.id); leaveRoom(socket); });
});
let mid = 0;
function startMatch(players, practice) {
  const mroom = 'm' + (++mid);
  for (const p of players) if (p.socket) apply(p.socket, { energy: -COST.volley });
  const m = new Match(io, mroom, players, (m, winner, forfeit) => {
    const reward = practice ? 10 : 30; const w = players[winner];
    for (const p of players) if (p.socket) {
      const got = p === w ? apply(p.socket, { coins: reward, win: 1 }).coins : 0;
      p.socket.emit('v:end', { winner, score: m.score, forfeit, reward: got, energy: COST.volley });
      p.socket.leave(mroom); matches.delete(p.socketId);
    }
  });
  players.forEach((p, i) => { if (p.socket) { p.socket.join(mroom); matches.set(p.socketId, m); p.socket.emit('v:start', { side: i, practice, players: players.map(q => q.look) }); } });
}
setInterval(() => { const now = Date.now();
  for (const r of rooms.values()) io.to('room:' + r.code).emit('plaza:state', { code: r.code, count: r.members.size, max: MAX_ROOM,
    pets: [...r.members.values()].filter(e => e.inPlaza).map(e => ({ ...e, chat: e.chatAt && now - e.chatAt < 5000 ? e.chat : null })) }); }, 100);
const PORT = process.env.PORT || 3456;
server.listen(PORT, () => console.log('tamagotchi on :' + PORT));
module.exports = { rooms };
