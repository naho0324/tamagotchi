// Pet simulation: all state derived from timestamps, simulated in 1-minute steps.
const MIN = 60000;
const CFG = {
  hatchMs: +process.env.HATCH_MS || 2 * MIN, childMs: 10 * MIN, adultMs: 30 * MIN,
  decay: { hunger: 0.25, happy: 0.2, energy: 0.15, clean: 0.15 }, // per minute
  sleepEnergy: 4, deathZeroMin: 720, sickThreshold: 15,
};
const SHOP = {
  snack: { name: '간식', price: 10, type: 'consumable' },
  medicine: { name: '약', price: 25, type: 'consumable' },
  hat_ribbon: { name: '리본', price: 40, type: 'hat' },
  hat_crown: { name: '왕관', price: 80, type: 'hat' },
  cloth_blue: { name: '파란 옷', price: 50, type: 'clothes' },
  cloth_pink: { name: '분홍 옷', price: 50, type: 'clothes' },
};
const clamp = v => Math.max(0, Math.min(100, v));
const NCHAR = 7;
const validChar = c => Number.isInteger(+c) && +c >= 1 && +c <= NCHAR;
function newPet(now, char) {
  return { stage: 'egg', char: validChar(char) ? +char : 1 + Math.floor(Math.random() * NCHAR), bornAt: now, hatchedAt: null, lastUpdate: now, style: Math.floor(Math.random() * 6),
    stats: { hunger: 80, happy: 80, energy: 80, clean: 80 }, sick: false, sleeping: false, zeroMin: 0,
    careScore: 0, cooldowns: {} };
}
function newPlayer(id, nickname, now) {
  return { id, nickname, coins: 30, inventory: { snack: 1, medicine: 0 }, owned: [], wearing: { hat: null, clothes: null }, pet: newPet(now), wins: 0 };
}
function stepMinute(p, t) {
  if (p.stage === 'egg') { if (t - p.bornAt >= CFG.hatchMs) { p.stage = 'baby'; p.hatchedAt = p.bornAt + CFG.hatchMs; } return; }
  if (p.stage === 'dead') return;
  const s = p.stats, m = p.sick ? 1.5 : 1;
  s.hunger = clamp(s.hunger - CFG.decay.hunger * m);
  s.happy = clamp(s.happy - CFG.decay.happy * m);
  s.clean = clamp(s.clean - CFG.decay.clean);
  if (p.sleeping) { s.energy = clamp(s.energy + CFG.sleepEnergy); if (s.energy >= 100) p.sleeping = false; }
  else s.energy = clamp(s.energy - CFG.decay.energy * m);
  const mn = Math.min(s.hunger, s.happy, s.energy, s.clean);
  if (mn < CFG.sickThreshold) p.sick = true;
  if (mn <= 0) p.zeroMin++; else p.zeroMin = Math.max(0, p.zeroMin - 1);
  if (p.zeroMin >= CFG.deathZeroMin) { p.stage = 'dead'; p.sick = false; p.sleeping = false; return; }
  const age = t - p.hatchedAt;
  if (p.stage === 'baby' && age >= CFG.childMs) p.stage = 'child';
  if (p.stage === 'child' && age >= CFG.adultMs && p.careScore >= 5) p.stage = 'adult';
}
function update(player, now) {
  const p = player.pet;
  if (!validChar(p.char)) p.char = 1 + Math.floor(Math.random() * NCHAR); // migrate existing pets
  let steps = Math.floor((now - p.lastUpdate) / MIN);
  if (steps > 60 * 24 * 14) { p.lastUpdate = now - 60 * 24 * 14 * MIN; steps = 60 * 24 * 14; }
  for (let i = 1; i <= steps; i++) stepMinute(p, p.lastUpdate + i * MIN);
  p.lastUpdate += steps * MIN;
  if (p.stage === 'egg' && now - p.bornAt >= CFG.hatchMs) stepMinute(p, now);
  return player;
}
function act(player, action, arg, now) {
  update(player, now);
  const p = player.pet, s = p.stats;
  const alive = p.stage !== 'egg' && p.stage !== 'dead';
  const cd = (k, ms) => { if ((p.cooldowns[k] || 0) > now) return false; p.cooldowns[k] = now + ms; return true; };
  const reward = (k, c) => { if (cd('coin_' + k, 15000)) { player.coins += c; p.careScore++; return c; } return 0; };
  switch (action) {
    case 'feed': if (!alive) return '알에서 나오면 할 수 있어요';
      if (p.sleeping) return '자고 있어요 💤'; s.hunger = clamp(s.hunger + 25); return { msg: '냠냠! 배불러요', coins: reward('feed', 2) };
    case 'play': if (!alive) return '알에서 나오면 할 수 있어요'; if (p.sleeping) return '자고 있어요 💤';
      if (s.energy < 10) return '너무 피곤해요...'; s.happy = clamp(s.happy + 20); s.energy = clamp(s.energy - 8); s.hunger = clamp(s.hunger - 3);
      return { msg: '신나요!', coins: reward('play', 3) };
    case 'sleep': if (!alive) return '알에서 나오면 할 수 있어요'; p.sleeping = !p.sleeping; return { msg: p.sleeping ? '쿨쿨... 잘 자요' : '일어났어요!' };
    case 'wash': if (!alive) return '알에서 나오면 할 수 있어요'; s.clean = 100; return { msg: '뽀득뽀득 깨끗해요', coins: reward('wash', 2) };
    case 'use': {
      if (!alive) return '사용할 수 없어요'; if (!player.inventory[arg]) return '아이템이 없어요';
      if (arg === 'snack') { s.hunger = clamp(s.hunger + 40); s.happy = clamp(s.happy + 10); }
      else if (arg === 'medicine') { if (!p.sick) return '아프지 않아요'; p.sick = false; p.zeroMin = 0; s.happy = clamp(s.happy + 5); }
      else return '알 수 없는 아이템'; player.inventory[arg]--; return { msg: arg === 'snack' ? '간식 최고!' : '병이 나았어요!' };
    }
    case 'buy': {
      const it = SHOP[arg]; if (!it) return '없는 상품'; if (player.coins < it.price) return '코인이 부족해요';
      if (it.type !== 'consumable' && player.owned.includes(arg)) return '이미 가지고 있어요';
      player.coins -= it.price;
      if (it.type === 'consumable') player.inventory[arg] = (player.inventory[arg] || 0) + 1; else player.owned.push(arg);
      return { msg: it.name + ' 구매 완료!' };
    }
    case 'equip': {
      const it = SHOP[arg]; if (!it || it.type === 'consumable') return '착용할 수 없어요';
      if (!player.owned.includes(arg)) return '먼저 구매하세요';
      player.wearing[it.type === 'hat' ? 'hat' : 'clothes'] = player.wearing[it.type] === arg ? null : arg;
      return { msg: '갈아입었어요!' };
    }
    case 'choose': if (!validChar(arg)) return '없는 캐릭터'; if (p.stage !== 'egg') return '알일 때만 고를 수 있어요'; p.char = +arg; return { msg: '캐릭터를 골랐어요!' };
    case 'restart': if (p.stage !== 'dead') return '아직 살아있어요'; player.pet = newPet(now, arg); return { msg: '새 알이 왔어요!' };
  }
  return '알 수 없는 행동';
}
function publicPet(pl) { return { nickname: pl.nickname, stage: pl.pet.stage, char: pl.pet.char, style: pl.pet.style, wearing: pl.wearing, sick: pl.pet.sick, sleeping: pl.pet.sleeping }; }
module.exports = { NCHAR, newPlayer, update, act, SHOP, CFG, publicPet };
