// Local care simulation (shared game.js): growth, sickness, death, offline catch-up, shop.
const G = require('../game'); const M = 60000; const ok = (c, m) => { if (!c) { console.error('FAIL', m); process.exit(1); } console.log('ok -', m); };
const p = G.newPlayer('x', 'n', 0, 3);
G.update(p, 1 * M); ok(p.pet.stage === 'egg', 'egg at 1m');
G.update(p, 3 * M); ok(p.pet.stage === 'baby', 'hatched by 3m');
G.update(p, 60 * M); ok(p.pet.stage === 'child', 'child at 60m (offline catch-up)');
ok(G.act(p, 'buy', 'snack', 60 * M).msg && p.coins === 20 && p.inventory.snack === 2, 'shop buy works locally');
ok(typeof G.act(p, 'buy', 'hair_afro', 60 * M) === 'string', 'not enough coins');
G.update(p, 30 * 24 * 60 * M); ok(p.pet.stage === 'dead', 'dies when neglected (catch-up capped at 14d)');
ok(G.act(p, 'restart', null, 30 * 24 * 60 * M).msg && p.pet.stage === 'egg', 'restart gives a new egg');
ok(G.POWER.egg === 0.5 && G.POWER.adult === 2.2, 'raid power table');
