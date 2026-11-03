// Two clients in a room: plaza, volley queue (room-scoped), forfeit, result applied locally.
const { wait, once, assert, roomOf } = require('./lib');
(async () => {
  const [a, b] = await roomOf(2, '테스트'); a.emit('plaza:join'); b.emit('plaza:join'); await wait(300);
  const st = await once(a, 'plaza:state'); assert(st.pets.map(e => e.nickname).sort().join() === '테스트0,테스트1', 'plaza sees both');
  a.emit('v:queue'); await once(a, 'v:waiting'); const sa = once(a, 'v:start'), sb = once(b, 'v:start'); b.emit('v:queue');
  const d = await sa; await sb; assert(d.players.map(p => p.nickname).join() === '테스트0,테스트1', 'volley match started');
  await wait(300); assert(a.pl.pet.stats.energy === 85 && b.pl.pet.stats.energy === 85, 'both charged 15 energy locally');
  await wait(1500); b.emit('v:leave'); const e = await once(a, 'v:end'); await wait(200);
  assert(e.forfeit && e.reward === 30 && e.energy === 15 && a.pl.coins === 60, `A wins by forfeit, coins 30 -> ${a.pl.coins}`);
  process.exit(0);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
