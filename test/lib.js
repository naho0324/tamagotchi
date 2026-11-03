// Test helpers: a fake client that keeps its pet locally (like the browser) and sends snapshots.
const { io } = require('socket.io-client');
const G = require('../game');
const URL = process.env.URL || 'http://localhost:3456', RUN = Date.now().toString(36); let k = 0;
function mk(nick, pet = {}) {
  const c = io(URL, { auth: { playerId: `t-${RUN}-${k++}`, nickname: nick }, transports: ['websocket'], forceNew: true });
  c.pl = G.newPlayer('x', nick, Date.now(), pet.char || 3); Object.assign(c.pl.pet, { stage: 'baby', hatchedAt: Date.now() }, pet); c.pl.pet.stats = { hunger: 90, happy: 90, energy: 100, clean: 90, ...(pet.stats || {}) };
  c.toasts = []; c.applied = []; c.on('toast', m => c.toasts.push(m));
  c.on('apply', d => { c.applied.push(d); if (d.coins) c.pl.coins += d.coins; if (d.energy) c.pl.pet.stats.energy = G.clamp(c.pl.pet.stats.energy + d.energy); });
  c.snap = () => c.emit('snap', G.snapOf(c.pl));
  c.on('connect', () => c.snap());
  return c;
}
const wait = ms => new Promise(r => setTimeout(r, ms));
const once = (c, ev, ms = 3000) => new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('no ' + ev)), ms); c.once(ev, d => { clearTimeout(t); res(d); }); });
const connected = c => c.connected ? Promise.resolve() : once(c, 'connect');
async function create(c) { await connected(c); return new Promise(r => c.emit('room:create', r)); }
async function join(c, code) { await connected(c); c.snap(); return new Promise(r => c.emit('room:join', code, r)); }
const assert = (cond, m) => { if (!cond) { console.error('FAIL', m); process.exit(1); } console.log('ok -', m); };
// n clients in one fresh room
async function roomOf(n, name, pet) { const cl = [...Array(n)].map((_, i) => mk(`${name}${i}`, pet)); const r = await create(cl[0]); if (!r.ok) throw new Error(r.msg);
  for (const c of cl.slice(1)) { const j = await join(c, r.code); if (!j.ok) throw new Error(j.msg); } cl.code = r.code; return cl; }
module.exports = { mk, wait, once, create, join, assert, roomOf, G, URL };
