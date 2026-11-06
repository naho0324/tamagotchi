// Shared care rules (browser + Node). Pet simulation: all state derived from timestamps, simulated in 1-minute steps.
(function (root) {
const MIN = 60000;
const CFG = {
  hatchMs: (typeof process !== 'undefined' && process.env && +process.env.HATCH_MS) || 2 * MIN, childMs: 10 * MIN, adultMs: 30 * MIN,
  decay: { hunger: 0.25, happy: 0.2, energy: 0.15, clean: 0.15 }, // per minute
  sleepEnergy: 4, sleepDecay: 0.25, deathZeroMin: 720, sickThreshold: 15, sickChance: 0.25, rand: Math.random,
};
const LOTTERY_COST = 20; // 긁는 복권. 뽑기(60)보다 저렴
const ITEM_FX = { snack: '배고픔 +40, 기분 +10', medicine: '병 치료', meal: '배고픔 가득, 기분 +5', drink: '체력 +60 (기분 -5)',
  soap: '청결 가득, 기분 +15', toy: '기분 +50 (체력 안 써요)', vitamin: '병 치료 + 1시간 동안 안 아파요',
  ticket: '코인·간식, 가끔 대박' };
const CONSUMABLES = Object.keys(ITEM_FX);
const SHOP = {
  snack: { name: '간식', price: 10, type: 'consumable' },
  medicine: { name: '약', price: 25, type: 'consumable' },
  // v1.6 소모품: effect text shown in 상점
  meal: { name: '도시락', price: 30, type: 'consumable' }, drink: { name: '에너지 드링크', price: 35, type: 'consumable' },
  soap: { name: '거품비누', price: 15, type: 'consumable' }, toy: { name: '장난감', price: 40, type: 'consumable' },
  vitamin: { name: '비타민', price: 45, type: 'consumable' },
  ticket: { name: '긁는 복권', price: LOTTERY_COST, type: 'consumable' },
  hair_pony: { name: '포니테일', price: 80, type: 'hair', key: 'pony' }, hair_bob: { name: '단발', price: 80, type: 'hair', key: 'bob' },
  hair_pigtail: { name: '양갈래', price: 100, type: 'hair', key: 'pigtail' }, hair_afro: { name: '아프로', price: 150, type: 'hair', key: 'afro' },
  outfit_hoodie: { name: '후드티', price: 90, type: 'outfit', key: 'hoodie' }, outfit_stripe: { name: '줄무늬티+청바지', price: 100, type: 'outfit', key: 'stripe' },
  outfit_dress: { name: '원피스', price: 120, type: 'outfit', key: 'dress' }, outfit_hanbok: { name: '한복', price: 180, type: 'outfit', key: 'hanbok' },
  outfit_space: { name: '우주복', price: 250, type: 'outfit', key: 'space' },
  acc_crown: { name: '왕관', price: 300, type: 'acc', key: 'crown' },
  acc_ribbon: { name: '리본', price: 150, type: 'acc', key: 'ribbon' }, acc_flower: { name: '꽃핀', price: 120, type: 'acc', key: 'flower' },
  acc_catears: { name: '고양이귀', price: 0, type: 'acc', key: 'catears', gacha: true }, // 뽑기 전용 (not sold)
  // v1.8 옷장 확장: outfit slot = 상의(top). new hairs/tops are drawn for the custom body (기본 몸) only; presets fall back to base.
  hair_long: { name: '긴생머리', price: 150, type: 'hair', key: 'long', customOnly: true }, hair_bun: { name: '똥머리', price: 150, type: 'hair', key: 'bun', customOnly: true },
  hair_spiky: { name: '삐죽머리', price: 180, type: 'hair', key: 'spiky', customOnly: true }, hair_curly: { name: '웨이브', price: 200, type: 'hair', key: 'curly', customOnly: true },
  hair_braid: { name: '땋은머리', price: 250, type: 'hair', key: 'braid', customOnly: true },
  // new tops: 뽑기 전용 (rare/legend)
  outfit_raincoat: { name: '우비', price: 0, type: 'outfit', key: 'raincoat', gacha: 'rare', customOnly: true }, outfit_xmas: { name: '크리스마스 니트', price: 0, type: 'outfit', key: 'xmas', gacha: 'rare', customOnly: true },
  outfit_sailor: { name: '세일러복', price: 0, type: 'outfit', key: 'sailor', gacha: 'rare', customOnly: true }, outfit_dino: { name: '공룡 잠옷', price: 0, type: 'outfit', key: 'dino', gacha: 'rare', customOnly: true },
  outfit_tux: { name: '턱시도', price: 0, type: 'outfit', key: 'tux', gacha: 'legend', customOnly: true }, outfit_chef: { name: '요리사복', price: 0, type: 'outfit', key: 'chef', gacha: 'rare', customOnly: true },
  outfit_knight: { name: '기사 갑옷', price: 0, type: 'outfit', key: 'knight', gacha: 'legend', customOnly: true }, outfit_idol: { name: '아이돌 의상', price: 0, type: 'outfit', key: 'idol', gacha: 'legend', customOnly: true },
  outfit_wizard: { name: '마법사 로브', price: 0, type: 'outfit', key: 'wizard', gacha: 'legend', customOnly: true }, outfit_aodai: { name: '아오자이', price: 0, type: 'outfit', key: 'aodai', gacha: 'legend', customOnly: true },
  outfit_jersey: { name: '축구 유니폼', price: 0, type: 'outfit', key: 'jersey', gacha: 'rare', customOnly: true }, outfit_cardigan: { name: '카디건', price: 0, type: 'outfit', key: 'cardigan', gacha: 'rare', customOnly: true },
  outfit_bee: { name: '꿀벌 옷', price: 0, type: 'outfit', key: 'bee', gacha: 'rare', customOnly: true }, outfit_bear: { name: '곰돌이 옷', price: 0, type: 'outfit', key: 'bear', gacha: 'rare', customOnly: true },
  // new head accessories (layered on top of any hair/top)
  acc_bunny: { name: '토끼귀', price: 200, type: 'acc', key: 'bunny' }, acc_beret: { name: '베레모', price: 180, type: 'acc', key: 'beret' },
  acc_sprout: { name: '새싹', price: 120, type: 'acc', key: 'sprout' }, acc_partyhat: { name: '고깔모자', price: 150, type: 'acc', key: 'partyhat' },
  acc_headphones: { name: '헤드폰', price: 250, type: 'acc', key: 'headphones' },
  acc_halo: { name: '천사링', price: 0, type: 'acc', key: 'halo', gacha: 'legend' },
};
// v1.5 뽑기 (gacha): 60 coins/pull. 일반 70% (coins/snack), 희귀 25% (리본/꽃핀), 전설 5% (뽑기 전용 고양이귀).
// Duplicate 희귀 -> +40 coins, duplicate 전설 -> +150 coins. Pity: 전설 guaranteed on the 30th pull without one.
const GACHA = { cost: 60, tenCost: 540, tenN: 10, pity: 30, rates: { common: 70, rare: 25, legend: 5 }, dupRefund: { rare: 40, legend: 150 },
  // 10연 = 9×단품(60×9=540). 슬롯은 항상 의상 4, 소모품 4, 코인 2. 단품 천장은 그대로 두고 칸마다 +1.
  common: [{ coins: 20 }, { coins: 30 }, { coins: 45 }, { snack: 2 }, { medicine: 1 }],
  // v1.9 "전부 뽑기전용": every hair/top/accessory (except free base/none) comes only from 뽑기
  rare: ['acc_ribbon', 'acc_flower', 'hair_pony', 'hair_bob', 'hair_pigtail', 'hair_long', 'hair_bun', 'hair_spiky', 'outfit_hoodie', 'outfit_stripe', 'outfit_dress',
    'outfit_raincoat', 'outfit_xmas', 'outfit_sailor', 'outfit_dino', 'outfit_chef', 'outfit_jersey', 'outfit_cardigan', 'outfit_bee', 'outfit_bear', 'acc_sprout', 'acc_partyhat', 'acc_beret', 'acc_bunny'],
  legend: ['acc_catears', 'acc_crown', 'acc_halo', 'acc_headphones', 'hair_afro', 'hair_curly', 'hair_braid', 'outfit_hanbok', 'outfit_space',
    'outfit_tux', 'outfit_knight', 'outfit_idol', 'outfit_wizard', 'outfit_aodai'] };
for (const r of ['rare', 'legend']) for (const k of GACHA[r]) Object.assign(SHOP[k], { gacha: r, price: 0 }); // no coin purchase for cosmetics
const RARITY_KO = { common: '일반', rare: '희귀', legend: '전설' };
// v1.11 긁는 복권: mostly small coins, sometimes a snack/consumable, rare coin jackpot. No hair/outfit/acc.
// Pity counts only after the foil is claimed, so the shop counter can't spoil the card still under the foil.
const LOTTERY = { cost: LOTTERY_COST, pity: 25, hintAt: 0.34, revealAt: 0.56, prizes: [
  { id: 'c8', w: 24, coins: 8, tier: 'common' }, { id: 'c12', w: 20, coins: 12, tier: 'common' },
  { id: 'c15', w: 14, coins: 15, tier: 'common' }, { id: 'c20', w: 10, coins: 20, tier: 'common' },
  { id: 'c30', w: 6, coins: 30, tier: 'common' },
  { id: 'snack', w: 8, item: 'snack', n: 1, tier: 'item' }, { id: 'soap', w: 5, item: 'soap', n: 1, tier: 'item' },
  { id: 'snack2', w: 4, item: 'snack', n: 2, tier: 'item' }, { id: 'med', w: 3, item: 'medicine', n: 1, tier: 'item' },
  { id: 'meal', w: 3, item: 'meal', n: 1, tier: 'item' }, { id: 'drink', w: 1, item: 'drink', n: 1, tier: 'item' },
  { id: 'c60', w: 1, coins: 60, tier: 'jackpot' }, { id: 'c150', w: 1, coins: 150, tier: 'jackpot' } ] };
LOTTERY.byId = Object.fromEntries(LOTTERY.prizes.map(p => [p.id, p]));
LOTTERY.jackpots = LOTTERY.prizes.filter(p => p.tier === 'jackpot');
const HAIRS = ['base', 'pony', 'bob', 'pigtail', 'afro', 'long', 'bun', 'spiky', 'curly', 'braid'];
const OUTFITS = ['base', 'hoodie', 'stripe', 'dress', 'hanbok', 'space', 'raincoat', 'xmas', 'sailor', 'dino', 'tux', 'chef', 'knight', 'idol', 'wizard', 'aodai', 'jersey', 'cardigan', 'bee', 'bear']; // outfit = 상의 (top)
const ACCS = ['none', 'crown', 'ribbon', 'flower', 'catears', 'bunny', 'beret', 'halo', 'sprout', 'partyhat', 'headphones'];
const BOTTOMS = ['none']; // TODO(하의): bottom slot placeholder - no bottom sprites yet (tops include black pants). Add bottom_* items + layering here later.
const OLD_ITEMS = { hat_ribbon: 40, hat_crown: 80, cloth_blue: 50, cloth_pink: 50 }; // removed items: refunded on migration
// traits per character (default max is 100 for everything)
const TRAITS = {
  1: { name: '깔끔쟁이', desc: '청결 최대 150 · 병에 걸릴 확률 절반 · 약 반값', max: { clean: 150 } },
  2: { name: '애교쟁이', desc: '행복 최대 150 · 행복 120 넘으면 미니게임 코인 1.5배 · 레이드에서 모두 공격력 +10% (응원)', max: { happy: 150 } },
  3: { name: '잠꾸러기', desc: '에너지 최대 150', max: { energy: 150 } },
  4: { name: '부자', desc: '시작 코인 2배 · 코인 최대치 2배 (19998)', max: {} },
  5: { name: '운동광', desc: '에너지 최대 130 · 레이드 HP 최대 130', max: { energy: 130 }, raidHp: 130 },
  6: { name: '튼튼이', desc: '레이드 HP 최대 160', max: {}, raidHp: 160 },
  7: { name: '먹보', desc: '배고픔 최대 150 · 레이드 공격력 1.3배', max: { hunger: 150 }, raidAtk: 1.3 },
};
const COIN_CAP = 9999;
const NCHAR = 7;
const traitOf = c => TRAITS[c] || TRAITS[1];
const maxOf = (c, k) => traitOf(c).max[k] || 100;
const coinCap = c => +c === 4 ? COIN_CAP * 2 : COIN_CAP;
const raidHpOf = c => traitOf(c).raidHp || 100;
const raidAtkOf = c => traitOf(c).raidAtk || 1;
const clamp = (v, mx = 100) => Math.max(0, Math.min(mx, v));
function addCoins(player, n) { player.coins = Math.max(0, Math.min(coinCap(player.pet && player.pet.char), (player.coins || 0) + n)); return player.coins; }
function priceOf(player, k) { const it = SHOP[k]; if (!it) return Infinity; return k === 'medicine' && player.pet && player.pet.char === 1 ? Math.ceil(it.price / 2) : it.price; }
const ownKey = (player, type, key) => key === 'base' || key === 'none' || (player.owned || []).includes(type + '_' + key);
function migrate(player) { // old saves: hat/clothes items are gone -> refund; add hair/outfit (base)
  player.owned = Array.isArray(player.owned) ? player.owned.filter(k => typeof k === 'string') : []; let refund = 0;
  if (!player.inventory || typeof player.inventory !== 'object') player.inventory = { snack: 0, medicine: 0 };
  for (const k of CONSUMABLES) if (!Number.isInteger(player.inventory[k]) || player.inventory[k] < 0) player.inventory[k] = 0; // v1.6 new 소모품
  player.owned = player.owned.filter(k => { if (OLD_ITEMS[k]) { refund += OLD_ITEMS[k]; return false; } return !!SHOP[k]; });
  if (refund) addCoins(player, refund);
  if (!HAIRS.includes(player.hair) || !ownKey(player, 'hair', player.hair)) player.hair = 'base';
  if (!OUTFITS.includes(player.outfit) || !ownKey(player, 'outfit', player.outfit)) player.outfit = 'base';
  if (!ACCS.includes(player.acc) || !ownKey(player, 'acc', player.acc)) player.acc = 'none'; // v1.4: head accessory (머리장식)
  if (!BOTTOMS.includes(player.bottom)) player.bottom = 'none'; // v1.8 placeholder
  if (!Number.isInteger(player.gachaPity) || player.gachaPity < 0) player.gachaPity = 0; // v1.5: 뽑기 pity counter
  if (!Number.isInteger(player.lotteryPity) || player.lotteryPity < 0) player.lotteryPity = 0; // v1.11 긁는 복권 pity
  else if (player.lotteryPity > LOTTERY.pity) player.lotteryPity = LOTTERY.pity;
  if (!player.lotteryPending || !LOTTERY.byId[player.lotteryPending.id]) player.lotteryPending = null;
  else player.lotteryPending = { id: player.lotteryPending.id }; // ignore tampered coin amounts; claim uses the table
  if (!Array.isArray(player.redeemed)) player.redeemed = []; // v1.12 교환 코드: codes this save already used
  player.redeemed = player.redeemed.filter(k => typeof k === 'string' && k.length > 0 && k.length <= 24).slice(-80);
  if (player.pet) { if ('custom' in player.pet) { const c = validCustom(player.pet.custom); if (c) player.pet.custom = c; else delete player.pet.custom; } // v1.7
    if ('name' in player.pet) { const n = cleanName(player.pet.name); if (n) player.pet.name = n; else delete player.pet.name; } }
  delete player.wearing; }
const validChar = c => Number.isInteger(+c) && +c >= 1 && +c <= NCHAR;
// v1.7 custom character (기본 몸): eyes = eye/expression only (x2/x3 are derived from x1 by repainting the eyes, so the face outline is identical), color = runtime palette swap of the mint skin
const CUSTOM = { eyes: ['x1', 'x2', 'x3'], eyesKo: { x1: '동글눈', x2: '웃는눈', x3: '점눈' },
  colors: { mint: '#9ee8c0', peach: '#ffc9a8', sky: '#a8d8ff', lilac: '#d3b8ff', lemon: '#fff09a', pink: '#ffb8d6', cocoa: '#c89a78', snow: '#f2f2f2' },
  colorsKo: { mint: '민트', peach: '복숭아', sky: '하늘', lilac: '라일락', lemon: '레몬', pink: '분홍', cocoa: '코코아', snow: '눈송이' } };
function validCustom(c) { if (!c || typeof c !== 'object' || !CUSTOM.eyes.includes(c.eyes)) return null;
  return { eyes: c.eyes, color: CUSTOM.colors[c.color] ? c.color : 'mint' }; }
const cleanName = n => typeof n === 'string' ? n.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 10) : '';
function setLook(player, o) { o = o || {}; const p = player.pet; // edit later (꾸미기 > 캐릭터): name + body; 성격 only for a fresh egg
  if ('name' in o) p.name = cleanName(o.name);
  if ('custom' in o) { const c = validCustom(o.custom); if (c) p.custom = c; else delete p.custom; }
  if ('char' in o && validChar(o.char) && p.stage === 'egg') { const was = p.char; p.char = +o.char; if (was !== 4 && p.char === 4 && !p.richBonus) { p.richBonus = 1; addCoins(player, 30); } }
  return { msg: '캐릭터를 바꿨어요!' }; }
function newPet(now, char, custom, name) {
  const c = validCustom(custom), nm = cleanName(name);
  return { ...(c ? { custom: c } : {}), ...(nm ? { name: nm } : {}), stage: 'egg', char: validChar(char) ? +char : 1 + Math.floor(Math.random() * NCHAR), bornAt: now, hatchedAt: null, lastUpdate: now, style: Math.floor(Math.random() * 6),
    stats: { hunger: 80, happy: 80, energy: 80, clean: 80 }, sick: false, sleeping: false, zeroMin: 0,
    careScore: 0, cooldowns: {} };
}
function newPlayer(id, nickname, now, char, custom, name) {
  const pl = { id, nickname, coins: 30, inventory: { snack: 1, medicine: 0 }, owned: [], hair: 'base', outfit: 'base', bottom: 'none', acc: 'none', gachaPity: 0, lotteryPity: 0, lotteryPending: null, redeemed: [], pet: newPet(now, char, custom, name), wins: 0 };
  if (pl.pet.char === 4) { pl.coins *= 2; pl.pet.richBonus = 1; } return pl;
}
function stepMinute(p, t) {
  if (p.stage === 'egg') { if (t - p.bornAt >= CFG.hatchMs) { p.stage = 'baby'; p.hatchedAt = p.bornAt + CFG.hatchMs; } return; }
  if (p.stage === 'dead') return;
  const s = p.stats, m = (p.sick ? 1.5 : 1) * (p.sleeping ? CFG.sleepDecay : 1), X = k => maxOf(p.char, k); // asleep: 25% decay
  s.hunger = clamp(s.hunger - CFG.decay.hunger * m, X('hunger'));
  s.happy = clamp(s.happy - CFG.decay.happy * m, X('happy'));
  s.clean = clamp(s.clean - CFG.decay.clean * (p.sleeping ? CFG.sleepDecay : 1), X('clean'));
  if (p.sleeping) s.energy = clamp(s.energy + CFG.sleepEnergy, X('energy')); // stays asleep until woken (night mode)
  else s.energy = clamp(s.energy - CFG.decay.energy * m, X('energy'));
  const mn = Math.min(s.hunger, s.happy, s.energy, s.clean);
  // low stats make the pet sick with some chance each minute (깔끔쟁이: half the chance)
  if (mn < CFG.sickThreshold && !p.sick && !((p.immuneUntil || 0) > t) && CFG.rand() < CFG.sickChance * (p.char === 1 ? 0.5 : 1)) p.sick = true;
  if (mn <= 0) p.zeroMin++; else p.zeroMin = 0; // death timer resets as soon as every stat is above 0 again
  if (p.zeroMin >= CFG.deathZeroMin) { p.stage = 'dead'; p.sick = false; p.sleeping = false; return; }
  const age = t - p.hatchedAt;
  if (p.stage === 'baby' && age >= CFG.childMs) p.stage = 'child';
  if (p.stage === 'child' && age >= CFG.adultMs && p.careScore >= 5) p.stage = 'adult';
}
function update(player, now) {
  const p = player.pet;
  if (!validChar(p.char)) p.char = 1 + Math.floor(Math.random() * NCHAR); // migrate existing pets
  migrate(player);
  let steps = Math.floor((now - p.lastUpdate) / MIN);
  if (steps > 60 * 24 * 14) { p.lastUpdate = now - 60 * 24 * 14 * MIN; steps = 60 * 24 * 14; }
  for (let i = 1; i <= steps; i++) stepMinute(p, p.lastUpdate + i * MIN);
  p.lastUpdate += steps * MIN;
  if (p.stage === 'egg' && now - p.bornAt >= CFG.hatchMs) stepMinute(p, now);
  return player;
}
function act(player, action, arg, now) {
  update(player, now);
  const p = player.pet, s = p.stats, X = k => maxOf(p.char, k), C = (k, v) => (s[k] = clamp(v, X(k)));
  const alive = p.stage !== 'egg' && p.stage !== 'dead';
  const cd = (k, ms) => { if ((p.cooldowns[k] || 0) > now) return false; p.cooldowns[k] = now + ms; return true; };
  const reward = (k, c) => { if (cd('coin_' + k, 15000)) { addCoins(player, c); p.careScore++; return c; } return 0; };
  switch (action) {
    case 'feed': if (!alive) return '알에서 나오면 할 수 있어요';
      if (p.sleeping) return '자고 있어요 💤'; C('hunger', s.hunger + 25); p.zeroMin = 0; return { msg: '냠냠! 배불러요' }; // no coins for feeding (v1.1)
    case 'play': if (!alive) return '알에서 나오면 할 수 있어요'; if (p.sleeping) return '자고 있어요 💤';
      if (s.energy < 10) return '너무 피곤해요...'; C('happy', s.happy + 20); C('energy', s.energy - 8); C('hunger', s.hunger - 3); p.playedAt = now;
      return { msg: '신나요!', coins: reward('play', 3) };
    case 'sleep': if (!alive) return '알에서 나오면 할 수 있어요'; p.sleeping = !p.sleeping; return { msg: p.sleeping ? '쿨쿨... 잘 자요' : '일어났어요!' };
    case 'wash': if (!alive) return '알에서 나오면 할 수 있어요'; s.clean = X('clean'); return { msg: '뽀득뽀득 깨끗해요', coins: reward('wash', 2) };
    case 'use': {
      if (!alive) return '사용할 수 없어요'; if (!player.inventory[arg]) return '아이템이 없어요';
      if (arg === 'ticket') return '긁기 버튼으로 열어주세요'; // foil UI claims the prize; don't eat the ticket here
      if (arg === 'snack') { C('hunger', s.hunger + 40); C('happy', s.happy + 10); p.zeroMin = 0; }
      else if (arg === 'medicine') { if (!p.sick) return '아프지 않아요'; p.sick = false; p.zeroMin = 0; C('happy', s.happy + 5); }
      else if (arg === 'meal') { if (p.sleeping) return '자고 있어요 💤'; C('hunger', X('hunger')); p.zeroMin = 0; C('happy', s.happy + 5); }
      else if (arg === 'drink') { C('energy', s.energy + 60); C('happy', s.happy - 5); p.sleeping = false; }
      else if (arg === 'soap') { C('clean', X('clean')); C('happy', s.happy + 15); }
      else if (arg === 'toy') { if (p.sleeping) return '자고 있어요 💤'; C('happy', s.happy + 50); }
      else if (arg === 'vitamin') { p.sick = false; p.zeroMin = 0; p.immuneUntil = now + 60 * MIN; }
      else return '알 수 없는 아이템'; player.inventory[arg]--;
      return { msg: { snack: '간식 최고!', medicine: '병이 나았어요!', meal: '도시락 냠냠! 배불러요', drink: '기운이 번쩍! ⚡', soap: '거품 목욕 뽀득뽀득 🫧', toy: '장난감 너무 좋아요!', vitamin: '튼튼해졌어요! 1시간 동안 안 아파요' }[arg] };
    }
    case 'buy': {
      const it = SHOP[arg]; if (!it) return '없는 상품'; if (it.gacha) return '뽑기에서만 나와요'; const price = priceOf(player, arg); if (player.coins < price) return '코인이 부족해요';
      if (it.type !== 'consumable' && player.owned.includes(arg)) return '이미 가지고 있어요';
      player.coins -= price;
      if (it.type === 'consumable') player.inventory[arg] = (player.inventory[arg] || 0) + 1; else { player.owned.push(arg); player[it.type] = it.key; // auto-wear what you just bought
        return { msg: it.name + ' 구매 완료! 바로 입었어요' + (['egg', 'baby'].includes(p.stage) ? ' (어린이부터 보여요)' : '') }; }
      return { msg: it.name + ' 구매 완료!' };
    }
    case 'equip': { // arg: 'hair:pony' | 'outfit:base' | 'acc:crown' | 'acc:none'
      const [type, key] = String(arg).split(':'); const list = type === 'hair' ? HAIRS : type === 'outfit' ? OUTFITS : type === 'acc' ? ACCS : null;
      if (!list || !list.includes(key)) return '착용할 수 없어요'; if (!ownKey(player, type, key)) return '먼저 구매하세요';
      player[type] = key; return { msg: '갈아입었어요!' };
    }
    case 'gacha': return gacha(player);
    case 'gacha10': return gachaTen(player, typeof arg === 'function' ? arg : Math.random);
    case 'scratch': return scratchOpen(player, typeof arg === 'function' ? arg : Math.random);
    case 'scratchClaim': return scratchClaim(player);
    case 'redeem': return redeem(player, arg, now);
    case 'look': return setLook(player, arg);
    case 'restart': if (p.stage !== 'dead') return '아직 살아있어요'; { const o = arg && typeof arg === 'object' ? arg : {}; player.pet = newPet(now, 'char' in o ? o.char : p.char, 'custom' in o ? o.custom : p.custom, 'name' in o ? o.name : p.name); } return { msg: '새 알이 왔어요!' };
  }
  return '알 수 없는 행동';
}
function gacha(player, rnd = Math.random) {
  if ((player.coins || 0) < GACHA.cost) return '코인이 부족해요'; player.coins -= GACHA.cost;
  player.gachaPity = (Number.isInteger(player.gachaPity) ? player.gachaPity : 0) + 1;
  const roll = rnd() * 100, pick = a => a[Math.min(a.length - 1, Math.floor(rnd() * a.length))];
  const rarity = player.gachaPity >= GACHA.pity || roll < GACHA.rates.legend ? 'legend' : roll < GACHA.rates.legend + GACHA.rates.rare ? 'rare' : 'common';
  if (rarity === 'legend') player.gachaPity = 0;
  const res = { rarity, rarityKo: RARITY_KO[rarity] };
  if (rarity === 'common') { const g = pick(GACHA.common);
    if (g.coins) { addCoins(player, g.coins); Object.assign(res, { name: g.coins + '코인', coins: g.coins }); }
    else { const k = g.snack ? 'snack' : 'medicine', n = g.snack || g.medicine; player.inventory[k] = (player.inventory[k] || 0) + n; Object.assign(res, { name: SHOP[k].name + ' x' + n, item: k }); }
  } else { const k = pick(GACHA[rarity]), it = SHOP[k]; Object.assign(res, { name: it.name, item: k, key: it.key });
    if (player.owned.includes(k)) { const c = GACHA.dupRefund[rarity]; addCoins(player, c); Object.assign(res, { dup: true, coins: c }); }
    else { player.owned.push(k); player[it.type] = it.key; res.isNew = true; } }
  res.msg = `[${res.rarityKo}] ${res.name}` + (res.dup ? ` (중복! +${res.coins}코인)` : res.isNew ? ' 획득! 바로 썼어요' : ' 획득!');
  return res; }
function gachaTen(player, rnd = Math.random) {
  if ((player.coins || 0) < GACHA.tenCost) return '코인이 부족해요';
  player.coins -= GACHA.tenCost;
  const slots = ['costume', 'costume', 'costume', 'costume', 'item', 'item', 'item', 'item', 'coin', 'coin'];
  for (let i = slots.length - 1; i > 0; i--) { const j = Math.min(i, Math.floor(rnd() * (i + 1))); const t = slots[i]; slots[i] = slots[j]; slots[j] = t; }
  const coins = GACHA.common.filter(g => g.coins), items = GACHA.common.filter(g => !g.coins);
  const pick = a => a[Math.min(a.length - 1, Math.floor(rnd() * a.length))];
  const results = slots.map(slot => {
    player.gachaPity = (Number.isInteger(player.gachaPity) ? player.gachaPity : 0) + 1;
    if (slot === 'coin') { const g = pick(coins); addCoins(player, g.coins); return { slot, rarity: 'common', rarityKo: RARITY_KO.common, name: g.coins + '코인', coins: g.coins, msg: g.coins + '코인' }; }
    if (slot === 'item') { const g = pick(items), k = g.snack ? 'snack' : 'medicine', n = g.snack || g.medicine;
      player.inventory[k] = (player.inventory[k] || 0) + n; const name = SHOP[k].name + ' x' + n;
      return { slot, rarity: 'common', rarityKo: RARITY_KO.common, name, item: k, msg: name }; }
    const forced = player.gachaPity >= GACHA.pity, roll = forced ? 0 : rnd() * 100;
    const rarity = forced || roll < GACHA.rates.legend ? 'legend' : 'rare';
    if (rarity === 'legend') player.gachaPity = 0;
    const k = pick(GACHA[rarity]), it = SHOP[k];
    const res = { slot, rarity, rarityKo: RARITY_KO[rarity], name: it.name, item: k, key: it.key };
    if (player.owned.includes(k)) { const c = GACHA.dupRefund[rarity]; addCoins(player, c); res.dup = true; res.coins = c; }
    else { player.owned.push(k); player[it.type] = it.key; res.isNew = true; }
    res.msg = `[${res.rarityKo}] ${res.name}` + (res.dup ? ` (중복! +${res.coins}코인)` : res.isNew ? ' 획득!' : '');
    return res;
  });
  const n = k => results.filter(r => r.slot === k).length;
  return { ten: true, results, msg: `10연 완료! 의상 ${n('costume')} · 아이템 ${n('item')} · 코인 ${n('coin')}` };
}
// v1.12 교환 코드. 목록은 public/codes.js (브라우저) / 같은 파일을 Node가 읽어요.
// 1회용 코드: node tools/make-code.js --coins 100
function loadCodes() {
  if (typeof REDEEM_CODES === 'object' && REDEEM_CODES) return REDEEM_CODES;
  if (typeof require === 'function') {
    try {
      const fs = require('fs'), path = require('path');
      const src = fs.readFileSync(path.join(__dirname, 'public', 'codes.js'), 'utf8');
      const m = src.match(/var REDEEM_CODES\s*=\s*(\{[\s\S]*\})\s*;/);
      if (m) return JSON.parse(m[1]);
    } catch (e) {}
  }
  return {};
}
const CODES = loadCodes();
const normCode = s => String(s || '').trim().toUpperCase().replace(/\s+/g, '').slice(0, 24);
function redeem(player, raw, now) {
  const code = normCode(raw);
  if (!code) return '코드를 입력해주세요';
  const def = CODES[code];
  if (!def) return '없는 코드예요';
  if (def.expires && now >= def.expires) return '만료된 코드예요';
  if (!Array.isArray(player.redeemed)) player.redeemed = [];
  const limit = Number.isInteger(def.perSave) && def.perSave > 0 ? def.perSave : 1;
  const used = player.redeemed.filter(k => k === code).length;
  if (used >= limit) return '이미 사용한 코드예요';
  const parts = [];
  if (Number.isInteger(def.coins) && def.coins > 0) { addCoins(player, def.coins); parts.push('코인 ' + def.coins); }
  if (def.items && typeof def.items === 'object') for (const [k, n] of Object.entries(def.items)) {
    if (!SHOP[k] || SHOP[k].type !== 'consumable' || !Number.isInteger(n) || n <= 0) continue;
    player.inventory[k] = (player.inventory[k] || 0) + n;
    parts.push(SHOP[k].name + (n > 1 ? ' x' + n : ''));
  }
  if (Array.isArray(def.owned)) for (const k of def.owned) {
    const it = SHOP[k]; if (!it || it.type === 'consumable') continue;
    if ((player.owned || []).includes(k)) { parts.push(it.name + ' (이미 있어요)'); continue; }
    player.owned.push(k); parts.push(it.name);
  }
  if (!parts.length) return '받을 수 있는 선물이 없어요';
  player.redeemed.push(code);
  return { msg: '선물 도착! ' + parts.join(', ') };
}
function lotteryView(d) {
  const name = d.coins ? d.coins + '코인' : SHOP[d.item].name + (d.n > 1 ? ' x' + d.n : '');
  return { id: d.id, name, coins: d.coins || 0, item: d.item || '', n: d.n || 0, jackpot: d.tier === 'jackpot', tier: d.tier };
}
function rollLottery(player, rnd) { // pity is applied on claim so an unrevealed card can't spoil the counter
  const pity = Number.isInteger(player.lotteryPity) ? player.lotteryPity : 0;
  const pool = pity + 1 >= LOTTERY.pity ? LOTTERY.jackpots : LOTTERY.prizes;
  const total = pool.reduce((s, pr) => s + pr.w, 0);
  let x = rnd() * total, picked = pool[pool.length - 1];
  for (const pr of pool) { x -= pr.w; if (x < 0) { picked = pr; break; } }
  return picked;
}
function scratchOpen(player, rnd = Math.random) {
  if (player.lotteryPending && !LOTTERY.byId[player.lotteryPending.id]) player.lotteryPending = null;
  if (player.lotteryPending) return { scratch: true, resumed: true, prize: lotteryView(LOTTERY.byId[player.lotteryPending.id]), msg: '이어서 긁어요' };
  const pet = player.pet, alive = pet && pet.stage !== 'egg' && pet.stage !== 'dead';
  if (!alive) return '사용할 수 없어요';
  if (!player.inventory || !player.inventory.ticket) return '아이템이 없어요';
  player.inventory.ticket--;
  const d = rollLottery(player, rnd);
  player.lotteryPending = { id: d.id }; // prize granted only in scratchClaim
  return { scratch: true, resumed: false, prize: lotteryView(d), msg: '복권을 꺼냈어요' };
}
function scratchClaim(player) {
  const d = player.lotteryPending && LOTTERY.byId[player.lotteryPending.id];
  if (!d) { player.lotteryPending = null; return '확인할 복권이 없어요'; }
  player.lotteryPending = null;
  const pity = Number.isInteger(player.lotteryPity) ? player.lotteryPity : 0;
  player.lotteryPity = d.tier === 'jackpot' ? 0 : pity + 1;
  if (d.coins) addCoins(player, d.coins); else player.inventory[d.item] = (player.inventory[d.item] || 0) + (d.n || 1);
  const v = lotteryView(d);
  const msg = d.tier === 'jackpot' ? `대박!! ${v.name} 당첨!` : d.item ? `${v.name} 당첨! 가방에 넣었어요` : `${v.name} 당첨!`;
  return { ...v, msg };
}
function publicPet(pl) { return { nickname: pl.nickname, custom: validCustom(pl.pet.custom), petName: cleanName(pl.pet.name), stage: pl.pet.stage, char: pl.pet.char, style: pl.pet.style, hair: pl.hair, outfit: pl.outfit, acc: pl.acc || 'none', sick: pl.pet.sick, sleeping: pl.pet.sleeping }; }
const POWER = { egg: 0.5, baby: 1, child: 1.5, adult: 2.2 }; // raid damage multiplier by growth stage
const STAGES = ['egg', 'baby', 'child', 'adult', 'dead'];
// Light sanity check of a client-sent pet snapshot (cheating is accepted; this only keeps values in range).
function sanitizeSnap(s, nickname) {
  s = s && typeof s === 'object' ? s : {}; const st = s.stats || {}, char = validChar(s.char) ? +s.char : 1, num = (v, k) => clamp(Number.isFinite(+v) ? +v : 0, maxOf(char, k));
  return { nickname: String(nickname || s.nickname || '손님').slice(0, 12), char, custom: validCustom(s.custom), petName: cleanName(s.petName), stage: STAGES.includes(s.stage) ? s.stage : 'egg',
    stats: { hunger: num(st.hunger, 'hunger'), happy: num(st.happy, 'happy'), energy: num(st.energy, 'energy'), clean: num(st.clean, 'clean') }, sick: !!s.sick, sleeping: !!s.sleeping,
    hair: HAIRS.includes(s.hair) ? s.hair : 'base', outfit: OUTFITS.includes(s.outfit) ? s.outfit : 'base', acc: ACCS.includes(s.acc) ? s.acc : 'none', coins: clamp(Math.floor(+s.coins) || 0, COIN_CAP) };
}
function snapOf(player) { const p = player.pet; return { nickname: player.nickname, char: p.char, custom: validCustom(p.custom), petName: cleanName(p.name), stage: p.stage, stats: { ...p.stats }, sick: p.sick, sleeping: p.sleeping, hair: player.hair || 'base', outfit: player.outfit || 'base', acc: player.acc || 'none', coins: player.coins || 0 }; }
// single-player minigames (v1.2): cheap energy, modest coins; server validates time + score range
const MINI = { memory: { name: '짝맞추기', energy: 8, minMs: 6000, maxMs: 600000 }, pop: { name: '하트 팡팡', energy: 8, minMs: 29000, maxMs: 120000, maxScore: 90 } };
function miniCoins(game, score) { score = Math.floor(+score);
  if (game === 'memory') return score >= 8 && score <= 200 ? Math.max(10, Math.min(25, 25 - (score - 8))) : 0; // score = moves (8 = perfect)
  if (game === 'pop') return score >= 0 && score <= MINI.pop.maxScore ? (score < 5 ? 5 : Math.min(25, 10 + Math.floor((score - 5) / 3))) : 0; // score = hearts tapped
  return 0; }
const api = { CUSTOM, validCustom, setLook, cleanName, MINI, miniCoins, NCHAR, MIN, newPlayer, newPet, update, act, SHOP, CFG, POWER, publicPet, sanitizeSnap, snapOf, clamp, HAIRS, OUTFITS, ACCS, BOTTOMS, ITEM_FX, CONSUMABLES, GACHA, RARITY_KO, gacha, gachaTen, LOTTERY, scratchOpen, scratchClaim, CODES, normCode, redeem, TRAITS, COIN_CAP, maxOf, coinCap, raidHpOf, raidAtkOf, addCoins, priceOf, migrate, ownKey };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Game = api;
})(typeof window !== 'undefined' ? window : globalThis);
