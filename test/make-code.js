// 1회용 교환 코드 생성기: node tools/make-code.js --coins 100
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const G = require('../game.js');
const tool = require('../tools/make-code.js');

const tmp = path.join(os.tmpdir(), 'codes-' + process.pid + '.js');
fs.copyFileSync(path.join(__dirname, '..', 'public', 'codes.js'), tmp);
try {
  assert.throws(() => tool.buildReward({ coins: 0, items: {}, owned: [] }), /코인이나 아이템/);
  assert.throws(() => tool.buildReward({ coins: 10, items: { hair_pony: 1 } }), /소모품이 아니에요/);
  assert.throws(() => tool.buildReward({ owned: ['snack'] }), /입을 수 있는/);
  const reward = tool.buildReward({ coins: 100, items: { snack: 2 }, owned: ['hair_pony'], uses: 1 });
  assert.strictEqual(reward.perSave, 1);
  assert.strictEqual(reward.coins, 100);
  const made = tool.addCode({ coins: 100, items: {}, owned: [], uses: 1, len: 6 }, tmp);
  assert.match(made.code, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
  assert.strictEqual(made.reward.coins, 100);
  assert.strictEqual(made.reward.perSave, 1);
  const again = tool.readCodes(tmp);
  assert.strictEqual(again[made.code].coins, 100);
  assert.strictEqual(again.WELCOME.coins, 50);
  assert.ok(!/[01OIL]/.test(made.code));

  const run = spawnSync(process.execPath, [path.join(__dirname, '..', 'tools', 'make-code.js'), '--coins', '100', '--file', tmp], { encoding: 'utf8' });
  assert.strictEqual(run.status, 0, run.stderr);
  const printed = run.stdout.trim().split('\n')[0];
  assert.match(printed, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
  assert.notStrictEqual(printed, made.code);
  assert.ok(run.stdout.includes('코인 100'));
  assert.ok(run.stdout.includes('1번'));
  const loaded = tool.readCodes(tmp);
  assert.strictEqual(loaded[printed].coins, 100);
  assert.strictEqual(loaded[printed].perSave, 1);

  // wired into redeem: one-time per save
  const now = Date.now();
  const p = G.newPlayer('m', 'm', now, 2); p.pet.stage = 'child'; p.pet.lastUpdate = now; G.migrate(p);
  const coins0 = p.coins;
  G.CODES[printed] = loaded[printed];
  const r = G.act(p, 'redeem', printed, now);
  assert.strictEqual(r.msg, '선물 도착! 코인 100');
  assert.strictEqual(p.coins, coins0 + 100);
  assert.strictEqual(G.act(p, 'redeem', printed, now), '이미 사용한 코드예요');
  assert.strictEqual(p.coins, coins0 + 100);
  delete G.CODES[printed];

  const bad = spawnSync(process.execPath, [path.join(__dirname, '..', 'tools', 'make-code.js'), '--item', 'nope:1', '--file', tmp], { encoding: 'utf8' });
  assert.notStrictEqual(bad.status, 0);
  assert.match(bad.stderr, /소모품이 아니에요/);
  console.log('make-code ok', printed);
} finally { fs.unlinkSync(tmp); }
