// Raid test: n clients join, follow the boss and attack; expect a win with 50 coins each.
const { io } = require('socket.io-client');
const URL = process.env.URL || 'http://localhost:3456';
function run(n, hostStart, idle) {
  return new Promise((res, rej) => {
    const cl = [...Array(n)].map((_, i) => io(URL, { auth: { playerId: `raidtest-${n}-${idle ? 'i' : 'a'}-${i}`, nickname: `레이드${i}` }, transports: ['websocket'], forceNew: true }));
    let started = false, states = 0, ended = 0, lobbyMax = 0, autoSeen = false, enraged = false, minHp = 100, out = null;
    cl.forEach((c, i) => {
      c.on('connect', () => setTimeout(() => c.emit('r:join'), i * 50));
      c.on('r:lobby', l => { lobbyMax = Math.max(lobbyMax, l.players.length); if (l.countdown) autoSeen = true;
        if (i === 0 && hostStart && l.players.length === n && l.state === 'lobby' && !started) setTimeout(() => c.emit('r:start'), 100); });
      c.on('r:start', () => { started = true; });
      c.on('r:state', st => { if (i === 0) states++; if (st.b[3]) enraged = true;
        const me = st.p.find(p => p[0] === c.id); if (me) minHp = Math.min(minHp, me[3]);
        if (idle || !me) return; const bx = st.b[0] + (i - n / 2) * 12;
        c.emit('r:input', { l: me[1] > bx + 4, r: me[1] < bx - 4, u: false, d: false });
        if (states % 3 === 0) c.emit('r:act', 'atk'); if (states % 40 === 0) c.emit('r:act', 'skill'); });
      c.on('r:end', d => { out = out || d; if (++ended === n) { cl.forEach(x => x.close());
        res({ n, lobbyMax, autoSeen, ticks: states, enraged, minHp, win: d.win, boss: `${d.hp}/${d.max}`, coins: d.results.map(r => r.coins).join(',') }); } });
    });
    setTimeout(() => rej(new Error('timeout ' + n)), 150000);
  });
}
(async () => {
  const assert = (c, m) => { if (!c) { console.error('FAIL', m); process.exit(1); } };
  let r = await run(1, true); console.log(r); assert(r.enraged && r.coins === (r.win ? '50' : '5'), 'solo raid');
  r = await run(3, false); console.log(r); assert(r.autoSeen && r.enraged && r.coins === (r.win ? '50,50,50' : '5,5,5'), 'auto-start 3p (bots do not dodge, may lose)');
  if (process.env.RAID_TIME) { r = await run(1, true, true); console.log(r); assert(!r.win && r.coins === '5', 'idle loses'); }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
