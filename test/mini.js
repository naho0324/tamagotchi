// Single-player minigames (v1.2): reward formula + server validation (energy gate, too-fast/invalid scores pay 0, 애교쟁이 x1.5).
const { mk, wait, once, assert, G } = require('./lib');
(async () => {
  assert(G.miniCoins('memory', 8) === 25 && G.miniCoins('memory', 15) === 18 && G.miniCoins('memory', 40) === 10 && G.miniCoins('memory', 7) === 0, 'memory coins 25..10 by moves, <8 invalid');
  assert(G.miniCoins('pop', 0) === 5 && G.miniCoins('pop', 5) === 10 && G.miniCoins('pop', 50) === 25 && G.miniCoins('pop', 999) === 0, 'pop coins 5/10..25, impossible score 0');
  assert(G.MINI.memory.energy === 8 && G.MINI.pop.energy === 8, 'energy cost 8');
  const a = mk('미니'); await once(a, 'connect'); await wait(200);
  a.emit('m:start', 'memory'); await once(a, 'm:go'); assert(a.applied.some(d => d.energy === -8), 'start costs 8 energy');
  a.emit('m:end', { game: 'memory', score: 8 }); let r = await once(a, 'm:result'); assert(r.coins === 0, 'instant finish pays nothing');
  a.emit('m:start', 'memory'); await once(a, 'm:go'); await wait(6200); a.emit('m:end', { game: 'memory', score: 10 }); r = await once(a, 'm:result'); assert(r.coins === 23, 'memory 10 moves -> 23 coins');
  a.emit('m:end', { game: 'memory', score: 8 }); await wait(300); assert(a.applied.filter(d => d.coins).length === 1, 'cannot claim twice without a new start');
  const tired = mk('피곤', { stats: { energy: 5 } }); await once(tired, 'connect'); await wait(200); tired.emit('m:start', 'pop'); const d = await once(tired, 'm:denied'); assert(/에너지/.test(d), 'low energy denied');
  const cute = mk('애교', { char: 2, stats: { happy: 140 } }); await once(cute, 'connect'); await wait(200);
  cute.emit('m:start', 'memory'); await once(cute, 'm:go'); await wait(6200); cute.emit('m:end', { game: 'memory', score: 8 }); r = await once(cute, 'm:result'); assert(r.coins === 38, '애교쟁이 x1.5 (25 -> 38)');
  process.exit(0);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
