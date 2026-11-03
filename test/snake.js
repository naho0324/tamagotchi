const { roomOf } = require('./lib');
async function run(n, hostStart) {
  const cl = await roomOf(n, `뱀${n}-`);
  return new Promise((res, rej) => {
    let started = false, states = 0, ended = 0, lobbyMax = 0, autoSeen = false;
    cl.forEach((c, i) => {
      setTimeout(() => c.emit('s:join'), i * 50);
      c.on('s:lobby', l => { lobbyMax = Math.max(lobbyMax, l.players.length); if (l.countdown) autoSeen = true;
        if (i === 0 && hostStart && l.players.length === n && l.state === 'lobby' && !started) setTimeout(() => c.emit('s:start'), 100); });
      c.on('s:start', () => { started = true; });
      c.on('s:state', st => { if (i === 0) states++;
        // random-ish steering every few ticks
        if (states % 4 === 0) c.emit('s:dir', ['up', 'down', 'left', 'right'][(states / 4 + i) % 4 | 0]); });
      c.on('s:end', r => { if (++ended === n) { cl.forEach(x => x.close());
        res({ n, lobbyMax, autoSeen, ticks: states, ranking: r.map(x => `${x.rank}.${x.nickname}(len${x.length},+${x.coins})`).join(' ') }); } });
    });
    setTimeout(() => rej(new Error('timeout ' + n)), 120000);
  });
}
(async () => {
  console.log(await run(1, true));
  console.log(await run(2, false)); // auto-start countdown
  console.log(await run(6, true));
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
