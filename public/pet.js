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
for (const c of [1, 2, 3, 4, 5, 6, 7, 'x1', 'x2', 'x3']) { SPR[c] = {}; for (const s of STAGES) { const im = new Image(); im.src = `assets/pets/${c}/${s}.png`; SPR[c][s] = im; } }
// custom body: sprites are painted in peach. Other colors swap only the light peach skin
// (hue 8–40, sat ≥ 0.22, lightness ≥ 0.64) so brown hair and blush stay put.
const SKIN = { mint: '#9ee8c0', peach: '#ffc9a8', sky: '#a8d8ff', lilac: '#d3b8ff', lemon: '#fff09a', pink: '#ffb8d6', cocoa: '#c89a78', snow: '#f2f2f2' };
const SKIN_BASE = [255, 201, 168]; // #ffc9a8, the peach the base body is drawn with
const lookKey = look => look && look.custom && /^x[123]$/.test(look.custom.eyes) ? look.custom.eyes : look && look.char;
function rgb2hsl(r, g, b) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let h = 0, s = 0;
  if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; } return [h, s, l]; }
function hsl2rgb(h, s, l) { const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l), f = n => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)); return [f(0) * 255, f(8) * 255, f(4) * 255]; }
function recolorCanvas(img, color) { // light peach skin -> target, keeping relative shading
  const hex = SKIN[color]; const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height; const x = cv.getContext('2d'); x.drawImage(img, 0, 0);
  if (!hex || color === 'peach') return cv;
  const d = x.getImageData(0, 0, cv.width, cv.height), a = d.data, B = rgb2hsl(...SKIN_BASE), T = rgb2hsl(...[1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)));
  for (let i = 0; i < a.length; i += 4) { if (a[i + 3] < 8) continue; const [h, s, l] = rgb2hsl(a[i], a[i + 1], a[i + 2]);
    if (h < 8 || h > 40 || s < 0.22 || l < 0.64 || Math.max(a[i], a[i + 1], a[i + 2]) - Math.min(a[i], a[i + 1], a[i + 2]) < 24) continue;
    const ns = Math.max(0, Math.min(1, T[1] * s / B[1])), nl = Math.max(0, Math.min(1, T[2] + (l - B[2]))), c = hsl2rgb(T[0], ns, nl);
    a[i] = c[0]; a[i + 1] = c[1]; a[i + 2] = c[2]; }
  x.putImageData(d, 0, 0); return cv; }
function recolored(img, color) { if (!color || color === 'peach' || !SKIN[color] || !img.complete || !img.width) return img;
  const key = '_rc' + color; return img[key] || (img[key] = recolorCanvas(img, color)); }
const _rcUrl = {};
function recolorUrl(src, color, cb) { if (!SKIN[color] || color === 'peach') return cb(src); const k = src + '|' + color; if (_rcUrl[k]) return cb(_rcUrl[k]);
  const im = new Image(); im.onload = () => { try { cb(_rcUrl[k] = recolorCanvas(im, color).toDataURL()); } catch { cb(src); } }; im.src = src; }
function petSprite(char, stage) { const c = SPR[char] || SPR[1]; return c[stage] || c.baby; }
// Whole-outfit sprites for child/adult: assets/outfits/<char>/<stage>/<hair>_<outfit>.png (200x260, feet at y=256)
// v1.13: crisp 1px chibi-kid pixel art on this same grid (no anti-alias), so the crop, feet and head anchors stay put.
const OHAIR = ['base', 'pony', 'bob', 'pigtail', 'afro'], OOUT = ['base', 'hoodie', 'stripe', 'dress', 'hanbok', 'space']; // preset (1-7) sprites
// v1.8: custom body (x1-x3) has whole sprites for all 10 hairs x 20 tops; presets keep the old items only (new ones fall back to base)
const XHAIR = OHAIR.concat(['long', 'bun', 'spiky', 'curly', 'braid']);
const XOUT = OOUT.concat(['raincoat', 'xmas', 'sailor', 'dino', 'tux', 'chef', 'knight', 'idol', 'wizard', 'aodai', 'jersey', 'cardigan', 'bee', 'bear']);
const OFIT = { adult: { top: 16, h: 240 }, child: { top: 106, h: 150 } }, OSPR = {};
const OACC = ['crown', 'ribbon', 'flower', 'catears']; // presets: baked head accessory variants <hair>_<outfit>_<acc>.png (200x300, feet at y=296, 40px headroom)
// layered head accessories (assets/acc/<key>.png): [width as fraction of head width, overlap onto the head as fraction of acc height, x shift as fraction of head width]
const ACC_PL = { crown: [0.5, 0.35, 0], ribbon: [0.42, 0.45, 0.28], flower: [0.3, 0.5, 0.3], catears: [0.85, 0.5, 0], bunny: [0.6, 0.6, 0], beret: [0.8, 0.72, 0.05],
  halo: [0.6, -0.35, 0], sprout: [0.28, 0.15, 0], partyhat: [0.38, 0.22, 0], headphones: [1.02, 0.76, 0] };
const ACCIMG = {};
function accImg(k) { if (!ACC_PL[k]) return null; let im = ACCIMG[k]; if (!im) { im = ACCIMG[k] = new Image(); im.src = `assets/acc/${k}.png`; } return im.complete && im.width ? im : null; }
const isX = c => /^x[123]$/.test(c);
function outfitSprite(char, stage, hair, outfit, acc) {
  if (!OFIT[stage]) return null; char = SPR[char] ? char : 1; const x = isX(char); // char may be 'x1'..'x3' (custom body)
  hair = (x ? XHAIR : OHAIR).includes(hair) ? hair : 'base'; outfit = (x ? XOUT : OOUT).includes(outfit) ? outfit : 'base';
  const k = `${char}/${stage}/${hair}_${outfit}` + (!x && OACC.includes(acc) ? `_${acc}` : ''); let im = OSPR[k];
  if (!im) { im = OSPR[k] = new Image(); im.src = `assets/outfits/${k}.png`; }
  return im.complete && im.width ? im : null; }
const overlayAcc = (char, acc) => !!ACC_PL[acc] && (isX(char) || !OACC.includes(acc)); // custom: always layered; presets: only the new accessories
function headAnchor(img) { // hair-aware head anchor on the 200x260 sprite: first row that is >= 55% of the widest head row (skips buns/spikes)
  if (img._ha) return img._ha; const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height; const x = cv.getContext('2d'); x.drawImage(img, 0, 0);
  let d; try { d = x.getImageData(0, 0, cv.width, cv.height).data; } catch { return null; }
  const W = cv.width, H = cv.height, row = y => { let a = -1, b = -1; for (let i = 0; i < W; i++) if (d[(y * W + i) * 4 + 3] > 8) { if (a < 0) a = i; b = i; } return [a, b]; };
  let y0 = 0; while (y0 < H && row(y0)[0] < 0) y0++; let y1 = H - 1; while (y1 > y0 && row(y1)[0] < 0) y1--;
  const fh = y1 - y0, band = []; for (let y = y0; y < y0 + Math.floor(fh * 0.38); y++) { const [a, b] = row(y); band.push(a < 0 ? [0, a, b] : [b - a + 1, a, b]); }
  let mx = Math.max(...band.map(r => r[0])); const i = band.findIndex(r => r[0] >= 0.55 * mx); mx = Math.min(mx, 0.56 * fh);
  return (img._ha = { y: y0 + i, cx: (band[i][1] + band[i][2]) / 2, hw: mx }); }
let _tint = null;
function tinted(img, color, a) { // cached tinted copy (sick)
  const key = '_t' + color; if (img[key]) return img[key];
  if (img.complete === false || !img.width) return img;
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
  const lk = lookKey(look), osp = outfitSprite(lk, stage, look.hair, look.outfit, look.acc), F = osp && OFIT[stage];
  let img = osp || petSprite(lk, stage); if (!img.complete || !img.width) return;
  if (look.custom && look.custom.color) img = recolored(img, look.custom.color);
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
  if (F && overlayAcc(lk, look.acc)) { const ai = accImg(look.acc), ha = ai && headAnchor(osp); // v1.8 layered 머리장식
    if (ha) { const k = w / img.width, [f, dn, dx] = ACC_PL[look.acc], aw = ha.hw * f, ah = ai.height * aw / ai.width;
      const ax = ha.cx - aw / 2 + ha.hw * dx, ay = ha.y - ah + ah * dn; // sprite coords
      ctx.drawImage(ai, Math.round(cx - w / 2 + ax * k), Math.round(top + (ay - sy) * k), Math.round(aw * k), Math.round(ah * k)); } }
  ctx.globalAlpha = 1; ctx.imageSmoothingEnabled = prevSmooth;
  if (look.sleeping) { ctx.fillStyle = '#1d2557'; ctx.font = `${Math.round(px * 4)}px Galmuri11, monospace`; ctx.fillText('Z', cx + (F ? w * 0.36 : w / 2), ftop + px * 3 + Math.sin(t / 300) * px * 2); ctx.font = `${Math.round(px * 3)}px Galmuri11, monospace`; ctx.fillText('z', cx + (F ? w * 0.36 : w / 2) + 3 * px, ftop); }
  const fw = F ? w * 0.36 : w / 2; // outfit sprites have side padding
  if (look.sick) { ctx.font = `${Math.round(px * 5)}px sans-serif`; ctx.fillText('🤒', cx + fw - px * 2, ftop + px * 4); }
}
