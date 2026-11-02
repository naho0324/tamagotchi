const express = require('express'), http = require('http'), fs = require('fs'), path = require('path');
const { Server } = require('socket.io');
const { resolvePlayer } = require('./auth');
const G = require('./game');
const { Match } = require('./volley');
const { SnakeLobby } = require('./snake');
const DATA = path.join(process.env.DATA_DIR || __dirname, 'data.json');
let db = { players: {} };
try { db = JSON.parse(fs.readFileSync(DATA, 'utf8')); } catch {}
let dirty = false; const save = () => { dirty = true; };
setInterval(() => { if (dirty) { dirty = false; fs.writeFileSync(DATA + '.tmp', JSON.stringify(db)); fs.renameSync(DATA + '.tmp', DATA); } }, 2000);

const app = express(); app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (q, r) => r.json({ ok: true, online: io.engine.clientsCount }));
const server = http.createServer(app), io = new Server(server, { transports: ['websocket'], perMessageDeflate: false });
const plaza = new Map(); // socketId -> {id, x, y, ...look}
let queue = null;
const snake = new SnakeLobby(null, results => {
  for (const r of results) { const p = db.players[r.id]; if (p && !r.left) p.coins += r.coins; } save();
  for (const r of results) { const so = io.sockets.sockets.get(r.sid); if (so) { so.emit('s:end', results); if (db.players[r.id]) so.emit('state', view(db.players[r.id])); } }
}); const matches = new Map(); // socketId -> match

function getPlayer(user) {
  let pl = db.players[user.id];
  if (!pl) { pl = db.players[user.id] = G.newPlayer(user.id, user.nickname, Date.now()); }
  pl.nickname = user.nickname; G.update(pl, Date.now()); save(); return pl;
}
function view(pl) { const { cooldowns, ...pet } = pl.pet; return { ...pl, pet, shop: G.SHOP, cfg: { hatchMs: G.CFG.hatchMs }, now: Date.now() }; }

io.use((socket, next) => { const u = resolvePlayer(socket.handshake); if (!u) return next(new Error('auth')); socket.user = u; next(); });
io.on('connection', socket => {
  const pl = () => getPlayer(socket.user);
  socket.emit('state', view(pl()));
  socket.on('act', ({ action, arg } = {}, cb) => {
    const p = pl(); const r = G.act(p, action, arg, Date.now()); save();
    const res = typeof r === 'string' ? { ok: false, msg: r } : { ok: true, ...r };
    socket.emit('state', view(p)); cb && cb(res);
  });
  socket.on('sync', () => socket.emit('state', view(pl())));
  // plaza
  socket.on('plaza:join', () => {
    const p = pl(); socket.join('plaza');
    plaza.set(socket.id, { sid: socket.id, x: 100 + Math.random() * 280, y: 180 + Math.random() * 80, ...G.publicPet(p) });
  });
  socket.on('plaza:move', ({ x, y } = {}) => { const e = plaza.get(socket.id); if (e && isFinite(x) && isFinite(y)) { e.x = Math.max(0, Math.min(480, x)); e.y = Math.max(140, Math.min(300, y)); } });
  socket.on('plaza:chat', t => { const e = plaza.get(socket.id); if (e) { e.chat = String(t).slice(0, 40); e.chatAt = Date.now(); } });
  socket.on('plaza:leave', () => { plaza.delete(socket.id); socket.leave('plaza'); });
  // volleyball
  const look = () => { const p = pl(); return { ...G.publicPet(p) }; };
  socket.on('v:queue', () => {
    if (matches.has(socket.id)) return;
    if (queue && queue.socket.id !== socket.id && queue.socket.connected) {
      const a = queue; queue = null;
      startMatch([{ socket: a.socket, socketId: a.socket.id, id: a.socket.user.id, look: a.look }, { socket, socketId: socket.id, id: socket.user.id, look: look() }], false);
    } else { queue = { socket, look: look() }; socket.emit('v:waiting'); }
  });
  socket.on('v:cancel', () => { if (queue && queue.socket.id === socket.id) queue = null; });
  socket.on('v:practice', () => { if (matches.has(socket.id)) return; if (queue && queue.socket.id === socket.id) queue = null;
    startMatch([{ socket, socketId: socket.id, id: socket.user.id, look: look() }, { socketId: null, id: 'ai', look: { nickname: '연습봇', stage: 'child', style: 3, wearing: {} } }], true); });
  socket.on('v:input', inp => { const m = matches.get(socket.id); if (m && inp) m.setInput(socket.id, inp); });
  socket.on('v:leave', () => { const m = matches.get(socket.id); if (m) m.leave(socket.id); });
  socket.on('s:join', cb => { const e = snake.join(socket, look()); if (e && e !== 'already') socket.emit('toast', e); else snake.emitLobby(); });
  socket.on('s:leave', () => snake.leave(socket.id));
  socket.on('s:start', () => { const e = snake.start(socket.id); if (e) socket.emit('toast', e); });
  socket.on('s:dir', d => snake.setDir(socket.id, d));
  socket.on('disconnect', () => { snake.leave(socket.id); plaza.delete(socket.id); if (queue && queue.socket.id === socket.id) queue = null; const m = matches.get(socket.id); if (m) m.leave(socket.id); });
});
let mid = 0;
function startMatch(players, practice) {
  const room = 'm' + (++mid);
  const m = new Match(io, room, players, (m, winner, forfeit) => {
    const reward = practice ? 10 : 30; const w = players[winner];
    if (w.socketId && db.players[w.id]) { db.players[w.id].coins += reward; db.players[w.id].wins = (db.players[w.id].wins || 0) + 1; save(); }
    for (const p of players) if (p.socket) {
      p.socket.emit('v:end', { winner, score: m.score, forfeit, reward: p === w ? reward : 0 });
      p.socket.leave(room); matches.delete(p.socketId); if (db.players[p.id]) p.socket.emit('state', view(db.players[p.id]));
    }
  });
  players.forEach((p, i) => { if (p.socket) { p.socket.join(room); matches.set(p.socketId, m); p.socket.emit('v:start', { side: i, practice, players: players.map(q => q.look) }); } });
}
snake.io = io;
setInterval(() => { const now = Date.now(); io.to('plaza').emit('plaza:state', [...plaza.values()].map(e => ({ ...e, chat: e.chatAt && now - e.chatAt < 5000 ? e.chat : null }))); }, 100);
// refresh pet looks in plaza periodically
setInterval(() => { for (const [sid, e] of plaza) { const s = io.sockets.sockets.get(sid); if (s && db.players[s.user.id]) Object.assign(e, G.publicPet(db.players[s.user.id])); } }, 3000);
const PORT = process.env.PORT || 3456;
server.listen(PORT, () => console.log('tamagotchi on :' + PORT));
