#!/usr/bin/env node
// 1회용 교환 코드를 만들어 public/codes.js 에 넣어요.
//   node tools/make-code.js --coins 100
//   node tools/make-code.js --coins 100 --item snack:2 --owned hair_pony --uses 1
const fs = require('fs');
const path = require('path');
const G = require('../game.js');

const ALPH = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 0/O, 1/I/L 없음
const FILE = path.join(__dirname, '..', 'public', 'codes.js');
const HEADER = `// 교환 코드. 전 세계 1회 (그리고 이 저장에서도 1회)가 기본:
//   node tools/make-code.js --coins 100
//   node tools/make-code.js --coins 100 --item snack:2 --owned hair_pony --uses 1 --max 1
// maxUses = 서버 전체 횟수, perSave = 이 브라우저 저장 횟수. 빼면 둘 다 1.
`;

function readCodes(file = FILE) {
  const src = fs.readFileSync(file, 'utf8');
  const m = src.match(/var REDEEM_CODES\s*=\s*(\{[\s\S]*\})\s*;/);
  if (!m) throw new Error('코드를 읽지 못했어요: ' + file);
  return JSON.parse(m[1]);
}
function writeCodes(codes, file = FILE) {
  fs.writeFileSync(file, HEADER + 'var REDEEM_CODES = ' + JSON.stringify(codes, null, 2) + ';\n');
}
function randomCode(len, taken) {
  len = Math.min(8, Math.max(6, len || 6));
  let s = '', guard = 0;
  do {
    s = '';
    for (let i = 0; i < len; i++) s += ALPH[Math.floor(Math.random() * ALPH.length)];
    if (++guard > 50) throw new Error('코드를 만들지 못했어요');
  } while (taken[s]);
  return s;
}
function buildReward(o) {
  const reward = {};
  if (o.coins) {
    if (!Number.isInteger(o.coins) || o.coins <= 0) throw new Error('코인은 1 이상의 정수여야 해요');
    reward.coins = o.coins;
  }
  const items = o.items || {};
  if (Object.keys(items).length) {
    reward.items = {};
    for (const [k, n] of Object.entries(items)) {
      if (!G.SHOP[k] || G.SHOP[k].type !== 'consumable') throw new Error('소모품이 아니에요: ' + k);
      if (!Number.isInteger(n) || n <= 0) throw new Error('개수가 이상해요: ' + k);
      reward.items[k] = n;
    }
  }
  if (o.owned && o.owned.length) {
    for (const k of o.owned) {
      if (!G.SHOP[k] || G.SHOP[k].type === 'consumable') throw new Error('입을 수 있는 아이템이 아니에요: ' + k);
    }
    reward.owned = o.owned.slice();
  }
  if (!reward.coins && !reward.items && !reward.owned) throw new Error('코인이나 아이템을 지정해주세요. 예: --coins 100');
  const uses = o.uses == null ? 1 : o.uses;
  if (!Number.isInteger(uses) || uses <= 0) throw new Error('--uses 는 1 이상의 정수예요');
  reward.perSave = uses;
  const maxUses = o.maxUses == null ? 1 : o.maxUses;
  if (!Number.isInteger(maxUses) || maxUses <= 0) throw new Error('--max 는 1 이상의 정수예요');
  reward.maxUses = maxUses;
  if (o.expires) {
    if (!Number.isFinite(o.expires)) throw new Error('날짜를 읽을 수 없어요. 예: --expires 2026-12-31');
    reward.expires = o.expires;
  }
  return reward;
}
function rewardText(reward) {
  const parts = [];
  if (reward.coins) parts.push('코인 ' + reward.coins);
  if (reward.items) for (const [k, n] of Object.entries(reward.items)) parts.push((G.SHOP[k] ? G.SHOP[k].name : k) + (n > 1 ? ' x' + n : ''));
  if (reward.owned) for (const k of reward.owned) parts.push(G.SHOP[k] ? G.SHOP[k].name : k);
  parts.push('전 세계에서 ' + (reward.maxUses || 1) + '번');
  parts.push('이 저장에서 ' + reward.perSave + '번');
  return parts.join(', ');
}
function addCode(opts, file = FILE) {
  const codes = readCodes(file);
  const code = opts.code ? G.normCode(opts.code) : randomCode(opts.len, codes);
  if (!code) throw new Error('코드가 비어 있어요');
  if (opts.code && codes[code] && !opts.update) throw new Error('이미 있는 코드예요: ' + code);
  const reward = buildReward(opts);
  codes[code] = reward;
  writeCodes(codes, file);
  return { code, reward, file };
}
function parseArgs(argv) {
  const o = { coins: 0, items: {}, owned: [], uses: 1, maxUses: 1, expires: 0, code: '', len: 6, file: FILE };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => { if (i + 1 >= argv.length) throw new Error(a + ' 값이 없어요'); return argv[++i]; };
    if (a === '--coins') o.coins = Number(next());
    else if (a === '--item') { const [k, n] = String(next()).split(':'); o.items[k] = n == null || n === '' ? 1 : Number(n); }
    else if (a === '--owned') o.owned.push(next());
    else if (a === '--uses') o.uses = Number(next());
    else if (a === '--max') o.maxUses = Number(next());
    else if (a === '--expires') o.expires = Date.parse(next());
    else if (a === '--code') o.code = next();
    else if (a === '--len') o.len = Number(next());
    else if (a === '--file') o.file = path.resolve(next());
    else if (a === '--help' || a === '-h') o.help = true;
    else throw new Error('알 수 없는 옵션: ' + a);
  }
  return o;
}
function help() {
  console.log(`사용법
  node tools/make-code.js --coins 100
  node tools/make-code.js --coins 100 --item snack:2 --owned hair_pony --uses 1

옵션
  --coins N        코인
  --item 키:개수    소모품 (여러 번 가능). 개수를 빼면 1
  --owned 키       옷·헤어·머리장식 (여러 번 가능)
  --uses N         이 저장에서 쓸 수 있는 횟수 (기본 1)
  --max N          서버 전체(전 세계) 횟수 (기본 1, 한 사람이 쓰면 끝)
  --expires 날짜    이 날부터 만료 (예: 2026-12-31)
  --code 문자열     직접 정한 코드. 없으면 6글자를 만들어요
  --len 6|7|8      자동 코드 길이`);
}
function main(argv) {
  const o = parseArgs(argv);
  if (o.help) { help(); return; }
  const { code, reward, file } = addCode(o, o.file);
  console.log(code);
  console.log(rewardText(reward));
  console.log(path.relative(process.cwd(), file) + ' 에 넣었어요');
}
if (require.main === module) {
  try { main(process.argv.slice(2)); }
  catch (e) { console.error(e.message || e); process.exit(1); }
}
module.exports = { readCodes, writeCodes, buildReward, randomCode, addCode, rewardText, ALPH, FILE, HEADER };
