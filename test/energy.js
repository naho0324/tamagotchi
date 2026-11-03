// Energy cost gate for minigames. Needs server with fast hatch (HATCH_MS small) so pets can 'play' to burn energy.
const { io } = require('socket.io-client');
const URL = process.env.URL || 'http://localhost:3456', RUN = Date.now().toString(36);
const mk = (id, n) => { const c = io(URL, { auth: { playerId: `energy-${RUN}-${id}`, nickname: n }, transports: ['websocket'], forceNew: true }); c.st = null; c.toasts = [];
  c.on('state', s => c.st = s); c.on('toast', m => c.toasts.push(m)); return c; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const act = (c, action, arg) => new Promise(r => c.emit('act', { action, arg }, r));
const once = (c, ev, ms = 3000) => new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('no ' + ev)), ms); c.once(ev, d => { clearTimeout(t); res(d); }); });
const assert = (c, m) => { if (!c) { console.error('FAIL', m); process.exit(1); } console.log('ok -', m); };
async function burnTo(c, max) { while (c.st.pet.stats.energy > max) { const r = await act(c, 'play'); if (!r.ok) throw new Error('play failed: ' + r.msg); await wait(30); } }
(async () => {
  const a = mk('a', '에너지A'), b = mk('b', '에너지B'); await wait(800);
  for (const c of [a, b]) { c.emit('sync'); }
  for (let i = 0; i < 20 && (a.st.pet.stage === 'egg' || b.st.pet.stage === 'egg'); i++) { await wait(500); a.emit('sync'); b.emit('sync'); }
  if (a.st.pet.stage === 'egg') { console.log('SKIP energy test: start server with HATCH_MS=1500'); process.exit(0); }
  // volley practice charges 15 and reports it
  const e0 = a.st.pet.stats.energy; a.emit('v:practice'); await once(a, 'v:start'); await wait(300); a.emit('v:leave'); const ve = await once(a, 'v:end');
  await wait(200); assert(ve.energy === 15 && Math.abs(a.st.pet.stats.energy - (e0 - 15)) < 1, `volley practice energy -15 (${e0} -> ${a.st.pet.stats.energy})`);
  // sleeping pet can't join
  await act(b, 'sleep'); b.emit('s:join'); assert((await once(b, 's:kicked')).includes('자고'), 'sleeping pet rejected from snake'); await act(b, 'sleep');
  // b joins raid at 보통(20) with enough energy, then host a switches to 어려움(30) while b has only ~24 -> b kicked at start
  await burnTo(b, 29); const eb = b.st.pet.stats.energy; assert(eb >= 20 && eb < 30, `b energy ${eb}`);
  a.emit('r:join'); await wait(200); a.emit('r:diff', 'normal'); await wait(100); b.emit('r:join'); await wait(200);
  a.emit('r:diff', 'hard'); await wait(200);
  const ea = a.st.pet.stats.energy; const kicked = once(b, 'r:kicked'); a.emit('r:start'); const km = await kicked;
  assert(km === '에너지가 부족해요 (필요: 30)', 'b kicked from raid lobby at start: ' + km);
  await wait(300); await wait(300);
  assert(Math.abs(a.st.pet.stats.energy - (ea - 30)) < 1, `host charged 30 for hard raid (${ea} -> ${a.st.pet.stats.energy})`);
  a.emit('r:leave');
  // b burns below 15 -> can't join anything
  await burnTo(b, 14); b.toasts = [];
  b.emit('s:join'); assert((await once(b, 's:kicked')) === '에너지가 부족해요 (필요: 15)', 'snake join rejected at low energy');
  b.emit('v:practice'); await wait(300); assert(b.toasts.includes('에너지가 부족해요 (필요: 15)'), 'volley practice rejected at low energy');
  b.emit('v:queue'); await wait(300); assert(b.toasts.filter(t => t.startsWith('에너지가')).length >= 2, 'volley queue rejected at low energy');
  process.exit(0);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
