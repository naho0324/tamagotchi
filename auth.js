// Auth layer: swap this module for Discord OAuth later.
// Must return {id, nickname} or null from a socket handshake.
const crypto = require('crypto');
function resolvePlayer(handshake) {
  const a = handshake.auth || {};
  const id = typeof a.playerId === 'string' && /^[a-zA-Z0-9-]{8,64}$/.test(a.playerId) ? a.playerId : null;
  if (!id) return null;
  let nickname = String(a.nickname || '').trim().slice(0, 12);
  if (!nickname) nickname = '손님' + id.slice(0, 4);
  return { id: 'guest:' + id, nickname };
}
module.exports = { resolvePlayer, newId: () => crypto.randomUUID() };
