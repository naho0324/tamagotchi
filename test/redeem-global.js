// Global one-shot: the second client cannot redeem a code the first already used.
const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const express = require('express');
const { createStore, attachRedeem } = require('../redeemStore');

const file = path.join(os.tmpdir(), 'redeem-uses-' + process.pid + '.json');
const store = createStore(file);
const now = Date.now();
(async () => {
try {
  const a = store.tryRedeem('WELCOME', now);
  assert.strictEqual(a.ok, true);
  assert.strictEqual(a.uses, 1);
  assert.strictEqual(a.maxUses, 1);
  const b = store.tryRedeem('welcome', now);
  assert.strictEqual(b.ok, false);
  assert.strictEqual(b.msg, '이미 사용된 코드예요');
  assert.strictEqual(JSON.parse(fs.readFileSync(file, 'utf8')).WELCOME, 1);

  // a second process-style store reading the same file still sees the use
  const other = createStore(file);
  assert.strictEqual(other.tryRedeem('WELCOME', now).msg, '이미 사용된 코드예요');

  // maxUses 2 lets exactly two claims through
  const G = require('../game');
  G.CODES.MULTI = { coins: 1, maxUses: 2, perSave: 1 };
  assert.strictEqual(store.tryRedeem('MULTI', now).ok, true);
  assert.strictEqual(store.tryRedeem('MULTI', now).ok, true);
  assert.strictEqual(store.tryRedeem('MULTI', now).msg, '이미 사용된 코드예요');
  delete G.CODES.MULTI;

  const app = express();
  const httpFile = file + '.http';
  attachRedeem(app, createStore(httpFile));
  const srv = http.createServer(app);
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  const post = code => new Promise((res, rej) => {
    const body = JSON.stringify({ code });
    const req = http.request({ host: '127.0.0.1', port, path: '/redeem', method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } }, rs => {
      let s = ''; rs.on('data', c => s += c); rs.on('end', () => res({ status: rs.statusCode, body: JSON.parse(s) }));
    });
    req.on('error', rej); req.end(body);
  });
  const first = await post('복권선물');
  const second = await post('복권선물');
  assert.strictEqual(first.status, 200);
  assert.strictEqual(first.body.ok, true);
  assert.strictEqual(second.status, 400);
  assert.strictEqual(second.body.msg, '이미 사용된 코드예요');
  await new Promise(r => srv.close(r));
  fs.unlinkSync(httpFile);
  console.log('redeem-global ok');
} catch (e) { console.error(e); process.exitCode = 1; }
finally {
  fs.rmSync(file, { force: true });
  fs.rmSync(file + '.tmp', { force: true });
}
})();
