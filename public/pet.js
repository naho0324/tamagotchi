// Pixel chibi renderer (yellow round-faced people, navy outlines)
const HAIR = ['#7a4a2a', '#2f2f4a', '#f29ab8', '#a98be0', '#f2a25c', '#e8c25a'];
const PAL = { O: '#1d2557', Y: '#ffe98a', E: '#1d2557', W: '#ffffff', P: '#f7a8b8', M: '#c2455a', L: '#1d2557' };
const HEAD = [
'....OOOOOOOO....','...OHHHHHHHHO...','..OHHHHHHHHHHO..','.OHHHHHHHHHHHHO.','.OHHYYHHHHYYHHO.',
'OHHYYYYYYYYYYHHO','OHYYYYYYYYYYYYHO','OHYYEEYYYYEEYYHO','OHYYEWYYYYEWYYHO','OHYPPYYYYYYPPYHO',
'OHYYYYYMMYYYYYHO','OHHYYYYYYYYYYHHO','.OHOOOOOOOOOOHO.'];
const BODY = ['..OOBBBBBBBBOO..','..OYBBBBBBBBYO..','...OBBBBBBBBO...','...OLLOOOOLLO...','...OOO....OOO...'];
const BODY2 = ['..OOBBBBBBBBOO..','..OYBBBBBBBBYO..','...OBBBBBBBBO...','...OLLO..OLLO...','...OOO....OOO...'];
const SLEEP_EYES = { 7: 'OHYYYYYYYYYYYYHO', 8: 'OHYEEEYYYYEEEYHO' };
function drawGrid(ctx, rows, x0, y0, px, pal) {
  rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) { const c = r[i]; if (c === '.') continue; ctx.fillStyle = pal[c] || '#f0f'; ctx.fillRect(Math.round(x0 + i * px), Math.round(y0 + j * px), Math.ceil(px), Math.ceil(px)); } });
}
// Character sprites: assets/pets/<char 1-7>/<stage>.png
const STAGES = ['egg', 'baby', 'child', 'adult'];
const SPR = {};
for (let c = 1; c <= 7; c++) { SPR[c] = {}; for (const s of STAGES) { const im = new Image(); im.src = `assets/pets/${c}/${s}.png`; SPR[c][s] = im; } }
function petSprite(char, stage) { const c = SPR[char] || SPR[1]; return c[stage] || c.baby; }
// Whole-outfit sprites for child/adult: assets/outfits/<char>/<stage>/<hair>_<outfit>.png (200x260, feet at y=256)
const OHAIR = ['base', 'pony', 'bob', 'pigtail', 'afro'], OOUT = ['base', 'hoodie', 'stripe', 'dress', 'hanbok', 'space'];
const OFIT = { adult: { top: 16, h: 240 }, child: { top: 106, h: 150 } }, OSPR = {};
const OACC = ['crown', 'ribbon', 'flower', 'catears']; // head accessory variants: <hair>_<outfit>_<acc>.png (200x300, feet at y=296, 40px headroom)
function outfitSprite(char, stage, hair, outfit, acc) {
  if (!OFIT[stage]) return null; char = SPR[char] ? char : 1; hair = OHAIR.includes(hair) ? hair : 'base'; outfit = OOUT.includes(outfit) ? outfit : 'base';
  const k = `${char}/${stage}/${hair}_${outfit}` + (OACC.includes(acc) ? `_${acc}` : ''); let im = OSPR[k];
  if (!im) { im = OSPR[k] = new Image(); im.src = `assets/outfits/${k}.png`; }
  return im.complete && im.width ? im : null; }
let _tint = null;
function tinted(img, color, a) { // cached tinted copy (sick)
  const key = '_t' + color; if (img[key]) return img[key];
  if (!img.complete || !img.width) return img;
  const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height; const x = cv.getContext('2d');
  x.drawImage(img, 0, 0); x.globalCompositeOperation = 'source-atop'; x.globalAlpha = a; x.fillStyle = color; x.fillRect(0, 0, cv.width, cv.height);
  return (img[key] = cv);
}
// cx: center x, by: bottom y, size: target height in px
function drawPet(ctx, cx, by, size, look, t = 0, opts = {}) {
  look = look || {}; const stage = look.stage || 'egg';
  if (stage === 'dead') { // gravestone
    const px = size / 18; const g = ['..OOOOOOOOOO....', '.OSSSSSSSSSSO...', 'OSSSSOOSSSSSSO..', 'OSSSOOOOSSSSSO..', 'OSSSSOOSSSSSSO..', 'OSSSSOOSSSSSSO..', 'OSSSSSSSSSSSSO..', 'OSSSSSSSSSSSSO..', 'OOOOOOOOOOOOOO..'];
    drawGrid(ctx, g, cx - 7 * px, by - 9 * px, px, { O: '#1d2557', S: '#c9c9d9' }); return;
  }
  const osp = outfitSprite(look.char, stage, look.hair, look.outfit, look.acc), F = osp && OFIT[stage];
  let img = osp || petSprite(look.char, stage); if (!img.complete || !img.width) return;
  if (look.sick) img = tinted(img, '#7fc23a', 0.35);
  // outfit sprites: map the 240/150px figure band to `size`; crop region = full width, [top, 256]
  const AH = F && img.height > 260 ? img.height - 260 : 0; // accessory headroom (drawn above the normal figure band)
  const sy = F ? F.top : 0, sh = F ? F.h + AH : img.height, h = size * sh / (F ? F.h : sh), w = size * img.width / (F ? F.h : sh), px = size / 18;
  const prevSmooth = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
  if (stage === 'egg') {
    const wob = Math.sin(t / 150) * 0.06 * (opts.still ? 0 : 1);
    ctx.save(); ctx.translate(cx, by); ctx.rotate(wob); ctx.drawImage(img, -w / 2, -h, w, h); ctx.restore();
    ctx.imageSmoothingEnabled = prevSmooth; return;
  }
  const hop = opts.still ? 0 : opts.walking ? Math.abs(Math.sin(t / 120)) * px * 1.5 : (look.sleeping ? 0 : Math.abs(Math.sin(t / 400)) * px * 0.6);
  const top = by - h - hop, ftop = top + (h - size); // ftop: top of the figure band (ignores accessory headroom)
  if (!opts.still) { ctx.fillStyle = 'rgba(29,37,87,.18)'; ctx.fillRect(cx - w * 0.3, by - px * 0.6, w * 0.6, px); }
  if (look.sleeping) ctx.globalAlpha = 0.8;
  ctx.drawImage(img, 0, sy, img.width, sh, Math.round(cx - w / 2), Math.round(top), Math.round(w), Math.round(h));
  ctx.globalAlpha = 1; ctx.imageSmoothingEnabled = prevSmooth;
  if (look.sleeping) { ctx.fillStyle = '#1d2557'; ctx.font = `${Math.round(px * 4)}px Galmuri11, monospace`; ctx.fillText('Z', cx + (F ? w * 0.36 : w / 2), ftop + px * 3 + Math.sin(t / 300) * px * 2); ctx.font = `${Math.round(px * 3)}px Galmuri11, monospace`; ctx.fillText('z', cx + (F ? w * 0.36 : w / 2) + 3 * px, ftop); }
  const fw = F ? w * 0.36 : w / 2; // outfit sprites have side padding
  if (look.sick) { ctx.font = `${Math.round(px * 5)}px sans-serif`; ctx.fillText('🤒', cx + fw - px * 2, ftop + px * 4); }
}
