// Global redeem counts. One JSON file so a code used in one browser is used for everyone.
// Missing file = nobody has redeemed yet. Render's disk is ephemeral unless a persistent disk is mounted;
// set REDEEM_FILE to that disk if uses must survive a restart.
const fs = require('fs');
const path = require('path');
const express = require('express');
const G = require('./game');

const DEFAULT_FILE = process.env.REDEEM_FILE || path.join(__dirname, 'data', 'redeem-uses.json');

function createStore(file = DEFAULT_FILE) {
  let uses = load(file);
  function claim(code, maxUses) {
    const n = Number.isInteger(uses[code]) && uses[code] > 0 ? uses[code] : 0;
    if (n >= maxUses) return false;
    uses[code] = n + 1;
    save(file, uses);
    return true;
  }
  function tryRedeem(raw, now) {
    const code = G.normCode(raw);
    if (!code) return { ok: false, msg: '코드를 입력해주세요' };
    const def = G.CODES[code];
    if (!def) return { ok: false, msg: '없는 코드예요' };
    if (def.expires && now >= def.expires) return { ok: false, msg: '만료된 코드예요' };
    const maxUses = Number.isInteger(def.maxUses) && def.maxUses > 0 ? def.maxUses : 1;
    if (!claim(code, maxUses)) return { ok: false, msg: '이미 사용된 코드예요' };
    return { ok: true, code, uses: uses[code], maxUses };
  }
  return { tryRedeem, file };
}
function load(file) {
  if (!fs.existsSync(file)) return {};
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('redeem store corrupt: ' + file);
  const out = {};
  for (const [k, v] of Object.entries(data)) if (typeof k === 'string' && Number.isInteger(v) && v > 0) out[k] = v;
  return out;
}
function save(file, uses) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(uses));
  fs.renameSync(tmp, file);
}
function attachRedeem(app, store = createStore()) {
  app.post('/redeem', express.json({ limit: '4kb' }), (req, res) => {
    try {
      const out = store.tryRedeem(req.body && req.body.code, Date.now());
      res.status(out.ok ? 200 : 400).json(out);
    } catch (e) { res.status(500).json({ ok: false, msg: '잠시 후 다시 해주세요' }); }
  });
  return store;
}
module.exports = { createStore, attachRedeem, DEFAULT_FILE };
