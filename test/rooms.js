// Rooms: codes, join by code, 6-person cap, isolation between rooms, deletion when empty.
const { mk, wait, once, create, join, assert } = require('./lib');
(async () => {
  const a = mk('방A'), r = await create(a);
  assert(r.ok && /^[A-HJKMNP-Z2-9]{6}$/.test(r.code), 'room code is 6 chars without 0/O/1/I/L: ' + r.code);
  const bad = await join(mk('잘못'), 'ZZZZZZ'.replace(/./g, '0')); assert(!bad.ok && bad.msg.includes('없어요'), 'unknown code rejected');
  const others = [...Array(5)].map((_, i) => mk('친구' + i));
  for (const c of others) assert((await join(c, r.code.toLowerCase())).ok, 'join by code (lowercase ok)');
  const seventh = mk('일곱'); const f = await join(seventh, r.code); assert(!f.ok && f.msg.includes('최대 6명'), 'room capped at 6: ' + f.msg);
  a.emit('plaza:join'); others[0].emit('plaza:join'); const st = await once(a, 'plaza:state'); await wait(200);
  const st2 = await once(a, 'plaza:state'); assert(st2.code === r.code && st2.count === 6 && st2.pets.length === 2, `plaza state scoped to room (${st2.count} members, ${st2.pets.length} in plaza)`);
  // second room: its snake lobby must not see room 1's
  const x = mk('다른방'), r2 = await create(x); assert(r2.ok && r2.code !== r.code, 'second room ' + r2.code);
  const lob1 = once(a, 's:lobby'); a.emit('s:join'); const l1 = await lob1;
  const lob2 = once(x, 's:lobby'); x.emit('s:join'); const l2 = await lob2;
  assert(l1.players.length === 1 && l2.players.length === 1, 'snake lobbies are per room');
  x.emit('s:leave'); x.emit('room:leave'); await wait(200);
  assert(!(await join(mk('늦게'), r2.code)).ok, 'empty room deleted');
  for (const c of [a, ...others]) c.close(); await wait(300);
  assert(!(await join(mk('늦게2'), r.code)).ok, 'room deleted after everyone disconnects');
  // no room -> minigames refused
  const lone = mk('혼자'); await wait(300); lone.emit('s:join'); assert((await once(lone, 's:kicked')).includes('방'), 'minigame needs a room');
  process.exit(0);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
