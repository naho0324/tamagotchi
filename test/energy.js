// Energy gate: server checks the client snapshot and returns energy changes for the client to apply.
const { wait, once, assert, roomOf } = require('./lib');
(async () => {
  const [a, b] = await roomOf(2, '에너지');
  const e0 = a.pl.pet.stats.energy; a.emit('v:practice'); await once(a, 'v:start'); await wait(300); a.emit('v:leave'); const ve = await once(a, 'v:end'); await wait(200);
  assert(ve.energy === 15 && a.pl.pet.stats.energy === e0 - 15, `volley practice energy -15 (${e0} -> ${a.pl.pet.stats.energy})`);
  b.pl.pet.sleeping = true; b.snap(); b.emit('s:join'); assert((await once(b, 's:kicked')).includes('자고'), 'sleeping pet rejected from snake'); b.pl.pet.sleeping = false;
  b.pl.pet.sick = true; b.snap(); b.emit('r:join'); assert((await once(b, 'r:kicked')).includes('아파서'), 'sick pet rejected from raid'); b.pl.pet.sick = false;
  b.pl.pet.stats.energy = 24; b.snap();
  a.emit('r:join'); await wait(200); a.emit('r:diff', 'normal'); await wait(100); b.emit('r:join'); await wait(200); a.emit('r:diff', 'hard'); await wait(200);
  const ea = a.pl.pet.stats.energy, kicked = once(b, 'r:kicked'); a.emit('r:start'); const km = await kicked;
  assert(km === '에너지가 부족해요 (필요: 30)', 'b kicked from raid lobby at start: ' + km);
  await wait(400); assert(a.pl.pet.stats.energy === ea - 30, `host charged 30 for hard raid (${ea} -> ${a.pl.pet.stats.energy})`);
  a.emit('r:leave');
  b.pl.pet.stats.energy = 14; b.snap(); b.toasts = [];
  b.emit('s:join'); assert((await once(b, 's:kicked')) === '에너지가 부족해요 (필요: 15)', 'snake join rejected at low energy');
  b.emit('v:practice'); await wait(300); assert(b.toasts.includes('에너지가 부족해요 (필요: 15)'), 'volley practice rejected at low energy');
  b.emit('v:queue'); await wait(300); assert(b.toasts.filter(t => t.startsWith('에너지가')).length >= 2, 'volley queue rejected at low energy');
  // sanitizer clamps silly values
  b.emit('snap', { stage: 'god', char: 99, stats: { energy: 9999 } }); await wait(100); b.emit('r:join'); const l = await once(b, 'r:lobby');
  const me = l.players.find(p => p.sid === b.id); assert(me.stage === 'egg' && me.char === 1 && me.pow === 0.5, 'snapshot sanitized (bad stage -> egg, char -> 1)');
  process.exit(0);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
