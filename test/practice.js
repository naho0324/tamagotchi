const { io } = require('socket.io-client');
const s = io(process.env.URL || 'http://localhost:3456', { auth: { playerId: 'testpractice-1', nickname: '연습' }, transports: ['websocket'] });
s.on('connect', () => s.emit('v:practice'));
s.on('v:start', d => console.log('start vs', d.players[1].nickname));
s.on('v:point', p => console.log('point', p.score.join(':')));
s.on('v:end', d => { console.log('end', d); process.exit(0); });
setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 120000);
