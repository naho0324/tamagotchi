const { wait, once, assert, roomOf } = require('./lib');
(async () => { const [s] = await roomOf(1, '연습'); s.on('v:point', p => console.log('point', p.score.join(':')));
  s.emit('v:practice'); const d = await once(s, 'v:start'); console.log('start vs', d.players[1].nickname);
  const e = await once(s, 'v:end', 120000); console.log('end', e); process.exit(0); })().catch(e => { console.error('FAIL', e.message); process.exit(1); });
