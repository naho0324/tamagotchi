const G = require('../game'); const M = 60000; let t = 0;
const p = G.newPlayer('x', 'n', t);
G.update(p, 1 * M); console.log('1m', p.pet.stage);
G.update(p, 3 * M); console.log('3m', p.pet.stage, p.pet.stats);
G.update(p, 60 * M); console.log('60m', p.pet.stage, 'sick', p.pet.sick, p.pet.stats);
p.inventory.medicine = 1; console.log(G.act(p, 'use', 'medicine', 60 * M));
G.update(p, 400 * M); console.log('400m', p.pet.stage);
console.log(G.act(p, 'restart', null, 400 * M), p.pet.stage);
