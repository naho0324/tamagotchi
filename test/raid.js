// Raid test: n clients join, follow the boss and attack; expect a win with 50 coins each.
const { io } = require('socket.io-client');
const RUN = Date.now().toString(36); let k0 = 0;
const URL = process.env.URL || 'http://localhost:3456';
function run(n, hostStart, idle, diff = 'normal') {
  return new Promise((res, rej) => {
    const cl = [...Array(n)].map((_, i) => io(URL, { auth: { playerId: `raidtest-${RUN}-${k0++}-${n}-${idle ? 'i' : 'a'}-${diff}-${i}`, nickname: `레이드${i}` }, transports: ['websocket'], forceNew: true }));
    let started = false, states = 0, ended = 0, lobbyMax = 0, autoSeen = false, enraged = false, minHp = 100, out = null;
    cl.forEach((c, i) => {
      c.on('connect', () => setTimeout(() => c.emit('r:join'), i * 50));
      c.on('r:lobby', l => { if (i === 0 && l.state === 'lobby' && l.diff !== diff && !started) c.emit('r:diff', diff); lobbyMax = Math.max(lobbyMax, l.players.length); if (l.countdown) autoSeen = true;
        if (i === 0 && hostStart && l.players.length === n && l.state === 'lobby' && l.diff === diff && !started) setTimeout(() => c.emit('r:start'), 100); });
      c.on('r:start', () => { started = true; });
      c.on('r:state', st => { if (i === 0) states++; if (st.b[3]) enraged = true;
        const me = st.p.find(p => p[0] === c.id); if (me) minHp = Math.min(minHp, me[3]);
        if (idle || !me) return; const bx = st.b[0] + (i - n / 2) * 12;
        c.emit('r:input', { l: me[1] > bx + 4, r: me[1] < bx - 4, u: false, d: false });
        if (states % 3 === 0) c.emit('r:act', 'atk'); if (states % 40 === 0) c.emit('r:act', 'skill'); });
      c.on('r:end', d => { out = out || d; if (++ended === n) { cl.forEach(x => x.close());
        res({ diff: d.diff, n, lobbyMax, autoSeen, ticks: states, enraged, minHp, win: d.win, boss: `${d.hp}/${d.max}`, coins: d.results.map(r => r.coins).join(',') }); } });
    });
    setTimeout(() => rej(new Error('timeout ' + n)), 150000);
  });
}
(async () => {
  const assert = (c, m) => { if (!c) { console.error('FAIL', m); process.exit(1); } };
  const REW = { easy: '쉬움', normal: '보통', hard: '어려움' }, WINC = { easy: 50 - 20, normal: 60, hard: 120 };
  const N = +process.env.RAID_TRIALS || 1, summary = {};
  for (const diff of ['easy', 'normal', 'hard']) { let w = 0;
    for (let k = 0; k < N; k++) { const r = await run(1, true, false, diff); console.log(r); w += r.win;
      assert(r.diff === REW[diff] && r.coins === String(r.win ? WINC[diff] : 5), diff + ' coins');
      if (diff === 'easy') assert(r.win, 'easy must be beatable solo by simple bot'); }
    summary[diff] = `${w}/${N}`; }
  let r = await run(3, false); console.log(r); assert(r.autoSeen && r.coins === (r.win ? '60,60,60' : '5,5,5'), 'auto-start 3p normal');
  console.log('solo bot win rate:', summary);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
