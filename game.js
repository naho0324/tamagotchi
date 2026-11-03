// Shared care rules (browser + Node). Pet simulation: all state derived from timestamps, simulated in 1-minute steps.
(function (root) {
const MIN = 60000;
const CFG = {
  hatchMs: (typeof process !== 'undefined' && process.env && +process.env.HATCH_MS) || 2 * MIN, childMs: 10 * MIN, adultMs: 30 * MIN,
  decay: { hunger: 0.25, happy: 0.2, energy: 0.15, clean: 0.15 }, // per minute
  sleepEnergy: 4, deathZeroMin: 720, sickThreshold: 15, sickChance: 0.25, rand: Math.random,
};
const SHOP = {
  snack: { name: '간식', price: 10, type: 'consumable' },
  medicine: { name: '약', price: 25, type: 'consumable' },
  hair_pony: { name: '포니테일', price: 80, type: 'hair', key: 'pony' }, hair_bob: { name: '단발', price: 80, type: 'hair', key: 'bob' },
  hair_pigtail: { name: '양갈래', price: 100, type: 'hair', key: 'pigtail' }, hair_afro: { name: '아프로', price: 150, type: 'hair', key: 'afro' },
  outfit_hoodie: { name: '후드티', price: 90, type: 'outfit', key: 'hoodie' }, outfit_stripe: { name: '줄무늬티+청바지', price: 100, type: 'outfit', key: 'stripe' },
  outfit_dress: { name: '원피스', price: 120, type: 'outfit', key: 'dress' }, outfit_hanbok: { name: '한복', price: 180, type: 'outfit', key: 'hanbok' },
  outfit_space: { name: '우주복', price: 250, type: 'outfit', key: 'space' },
};
const HAIRS = ['base', 'pony', 'bob', 'pigtail', 'afro'], OUTFITS = ['base', 'hoodie', 'stripe', 'dress', 'hanbok', 'space'];
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
const ownKey = (player, type, key) => key === 'base' || (player.owned || []).includes(type + '_' + key);
function migrate(player) { // old saves: hat/clothes items are gone -> refund; add hair/outfit (base)
  player.owned = Array.isArray(player.owned) ? player.owned.filter(k => typeof k === 'string') : []; let refund = 0;
  if (!player.inventory || typeof player.inventory !== 'object') player.inventory = { snack: 0, medicine: 0 };
  player.owned = player.owned.filter(k => { if (OLD_ITEMS[k]) { refund += OLD_ITEMS[k]; return false; } return !!SHOP[k]; });
  if (refund) addCoins(player, refund);
  if (!HAIRS.includes(player.hair) || !ownKey(player, 'hair', player.hair)) player.hair = 'base';
  if (!OUTFITS.includes(player.outfit) || !ownKey(player, 'outfit', player.outfit)) player.outfit = 'base';
  delete player.wearing; }
const validChar = c => Number.isInteger(+c) && +c >= 1 && +c <= NCHAR;
function newPet(now, char) {
  return { stage: 'egg', char: validChar(char) ? +char : 1 + Math.floor(Math.random() * NCHAR), bornAt: now, hatchedAt: null, lastUpdate: now, style: Math.floor(Math.random() * 6),
    stats: { hunger: 80, happy: 80, energy: 80, clean: 80 }, sick: false, sleeping: false, zeroMin: 0,
    careScore: 0, cooldowns: {} };
}
function newPlayer(id, nickname, now, char) {
  const pl = { id, nickname, coins: 30, inventory: { snack: 1, medicine: 0 }, owned: [], hair: 'base', outfit: 'base', pet: newPet(now, char), wins: 0 };
  if (pl.pet.char === 4) pl.coins *= 2; return pl;
}
function stepMinute(p, t) {
  if (p.stage === 'egg') { if (t - p.bornAt >= CFG.hatchMs) { p.stage = 'baby'; p.hatchedAt = p.bornAt + CFG.hatchMs; } return; }
  if (p.stage === 'dead') return;
  const s = p.stats, m = p.sick ? 1.5 : 1, X = k => maxOf(p.char, k);
  s.hunger = clamp(s.hunger - CFG.decay.hunger * m, X('hunger'));
  s.happy = clamp(s.happy - CFG.decay.happy * m, X('happy'));
  s.clean = clamp(s.clean - CFG.decay.clean, X('clean'));
  if (p.sleeping) { s.energy = clamp(s.energy + CFG.sleepEnergy, X('energy')); if (s.energy >= X('energy')) p.sleeping = false; }
  else s.energy = clamp(s.energy - CFG.decay.energy * m, X('energy'));
  const mn = Math.min(s.hunger, s.happy, s.energy, s.clean);
  // low stats make the pet sick with some chance each minute (깔끔쟁이: half the chance)
  if (mn < CFG.sickThreshold && !p.sick && CFG.rand() < CFG.sickChance * (p.char === 1 ? 0.5 : 1)) p.sick = true;
  if (mn <= 0) p.zeroMin++; else p.zeroMin = Math.max(0, p.zeroMin - 1);
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
      if (p.sleeping) return '자고 있어요 💤'; C('hunger', s.hunger + 25); return { msg: '냠냠! 배불러요' }; // no coins for feeding (v1.1)
    case 'play': if (!alive) return '알에서 나오면 할 수 있어요'; if (p.sleeping) return '자고 있어요 💤';
      if (s.energy < 10) return '너무 피곤해요...'; C('happy', s.happy + 20); C('energy', s.energy - 8); C('hunger', s.hunger - 3); p.playedAt = now;
      return { msg: '신나요!', coins: reward('play', 3) };
    case 'sleep': if (!alive) return '알에서 나오면 할 수 있어요'; p.sleeping = !p.sleeping; return { msg: p.sleeping ? '쿨쿨... 잘 자요' : '일어났어요!' };
    case 'wash': if (!alive) return '알에서 나오면 할 수 있어요'; s.clean = X('clean'); return { msg: '뽀득뽀득 깨끗해요', coins: reward('wash', 2) };
    case 'use': {
      if (!alive) return '사용할 수 없어요'; if (!player.inventory[arg]) return '아이템이 없어요';
      if (arg === 'snack') { C('hunger', s.hunger + 40); C('happy', s.happy + 10); }
      else if (arg === 'medicine') { if (!p.sick) return '아프지 않아요'; p.sick = false; p.zeroMin = 0; C('happy', s.happy + 5); }
      else return '알 수 없는 아이템'; player.inventory[arg]--; return { msg: arg === 'snack' ? '간식 최고!' : '병이 나았어요!' };
    }
    case 'buy': {
      const it = SHOP[arg]; if (!it) return '없는 상품'; const price = priceOf(player, arg); if (player.coins < price) return '코인이 부족해요';
      if (it.type !== 'consumable' && player.owned.includes(arg)) return '이미 가지고 있어요';
      player.coins -= price;
      if (it.type === 'consumable') player.inventory[arg] = (player.inventory[arg] || 0) + 1; else { player.owned.push(arg); player[it.type] = it.key; // auto-wear what you just bought
        return { msg: it.name + ' 구매 완료! 바로 입었어요' + (['egg', 'baby'].includes(p.stage) ? ' (어린이부터 보여요)' : '') }; }
      return { msg: it.name + ' 구매 완료!' };
    }
    case 'equip': { // arg: 'hair:pony' | 'outfit:base'
      const [type, key] = String(arg).split(':'); const list = type === 'hair' ? HAIRS : type === 'outfit' ? OUTFITS : null;
      if (!list || !list.includes(key)) return '착용할 수 없어요'; if (!ownKey(player, type, key)) return '먼저 구매하세요';
      player[type] = key; return { msg: '갈아입었어요!' };
    }
    case 'restart': if (p.stage !== 'dead') return '아직 살아있어요'; player.pet = newPet(now); return { msg: '새 알이 왔어요!' };
  }
  return '알 수 없는 행동';
}
function publicPet(pl) { return { nickname: pl.nickname, stage: pl.pet.stage, char: pl.pet.char, style: pl.pet.style, hair: pl.hair, outfit: pl.outfit, sick: pl.pet.sick, sleeping: pl.pet.sleeping }; }
const POWER = { egg: 0.5, baby: 1, child: 1.5, adult: 2.2 }; // raid damage multiplier by growth stage
const STAGES = ['egg', 'baby', 'child', 'adult', 'dead'];
// Light sanity check of a client-sent pet snapshot (cheating is accepted; this only keeps values in range).
function sanitizeSnap(s, nickname) {
  s = s && typeof s === 'object' ? s : {}; const st = s.stats || {}, char = validChar(s.char) ? +s.char : 1, num = (v, k) => clamp(Number.isFinite(+v) ? +v : 0, maxOf(char, k));
  return { nickname: String(nickname || s.nickname || '손님').slice(0, 12), char, stage: STAGES.includes(s.stage) ? s.stage : 'egg',
    stats: { hunger: num(st.hunger, 'hunger'), happy: num(st.happy, 'happy'), energy: num(st.energy, 'energy'), clean: num(st.clean, 'clean') }, sick: !!s.sick, sleeping: !!s.sleeping,
    hair: HAIRS.includes(s.hair) ? s.hair : 'base', outfit: OUTFITS.includes(s.outfit) ? s.outfit : 'base' };
}
function snapOf(player) { const p = player.pet; return { nickname: player.nickname, char: p.char, stage: p.stage, stats: { ...p.stats }, sick: p.sick, sleeping: p.sleeping, hair: player.hair || 'base', outfit: player.outfit || 'base' }; }
const api = { NCHAR, MIN, newPlayer, newPet, update, act, SHOP, CFG, POWER, publicPet, sanitizeSnap, snapOf, clamp, HAIRS, OUTFITS, TRAITS, COIN_CAP, maxOf, coinCap, raidHpOf, raidAtkOf, addCoins, priceOf, migrate, ownKey };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Game = api;
})(typeof window !== 'undefined' ? window : globalThis);
