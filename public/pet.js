// Pixel chibi renderer (yellow round-faced people, navy outlines)
const EGG = new Image(); EGG.src = 'assets/egg.png';
const HAIR = ['#7a4a2a', '#2f2f4a', '#f29ab8', '#a98be0', '#f2a25c', '#e8c25a'];
const PAL = { O: '#1d2557', Y: '#ffe98a', E: '#1d2557', W: '#ffffff', P: '#f7a8b8', M: '#c2455a', L: '#1d2557' };
const CLOTH = { null: '#3a3a4a', cloth_blue: '#6aa9f2', cloth_pink: '#f27a9a' };
const HEAD = [
'....OOOOOOOO....','...OHHHHHHHHO...','..OHHHHHHHHHHO..','.OHHHHHHHHHHHHO.','.OHHYYHHHHYYHHO.',
'OHHYYYYYYYYYYHHO','OHYYYYYYYYYYYYHO','OHYYEEYYYYEEYYHO','OHYYEWYYYYEWYYHO','OHYPPYYYYYYPPYHO',
'OHYYYYYMMYYYYYHO','OHHYYYYYYYYYYHHO','.OHOOOOOOOOOOHO.'];
const BODY = ['..OOBBBBBBBBOO..','..OYBBBBBBBBYO..','...OBBBBBBBBO...','...OLLOOOOLLO...','...OOO....OOO...'];
const BODY2 = ['..OOBBBBBBBBOO..','..OYBBBBBBBBYO..','...OBBBBBBBBO...','...OLLO..OLLO...','...OOO....OOO...'];
const SLEEP_EYES = { 7: 'OHYYYYYYYYYYYYHO', 8: 'OHYEEEYYYYEEEYHO' };
const HATS = {
  hat_ribbon: ['..OO......OO....', '.OPPO....OPPO...', '..OPPOOOOPPO....', '...OOPPPPOO.....'].map(r => r.replace(/P/g, 'R')),
  hat_crown: ['...O..O..O..O...', '...OCOOCOOCO....'.padEnd(16, '.'), '...OCCCCCCCCO...', '...OOOOOOOOOO...'],
};
function drawGrid(ctx, rows, x0, y0, px, pal) {
  rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) { const c = r[i]; if (c === '.') continue; ctx.fillStyle = pal[c] || '#f0f'; ctx.fillRect(Math.round(x0 + i * px), Math.round(y0 + j * px), Math.ceil(px), Math.ceil(px)); } });
}
// cx: center x, by: bottom y, size: target height in px
function drawPet(ctx, cx, by, size, look, t = 0, opts = {}) {
  look = look || {}; const stage = look.stage || 'egg';
  if (stage === 'egg') {
    const h = size, w = h * EGG.width / (EGG.height || 1); const wob = Math.sin(t / 150) * 0.06 * (opts.still ? 0 : 1);
    ctx.save(); ctx.translate(cx, by); ctx.rotate(wob); if (EGG.complete) ctx.drawImage(EGG, -w / 2, -h, w, h); ctx.restore(); return;
  }
  if (stage === 'dead') { // gravestone
    const px = size / 18; const g = ['..OOOOOOOOOO....', '.OSSSSSSSSSSO...', 'OSSSSOOSSSSSSO..', 'OSSSOOOOSSSSSO..', 'OSSSSOOSSSSSSO..', 'OSSSSOOSSSSSSO..', 'OSSSSSSSSSSSSO..', 'OSSSSSSSSSSSSO..', 'OOOOOOOOOOOOOO..'];
    drawGrid(ctx, g, cx - 7 * px, by - 9 * px, px, { O: '#1d2557', S: '#c9c9d9' }); return;
  }
  const baby = stage === 'baby';
  const rows = baby ? HEAD.length + 1 : HEAD.length + BODY.length;
  const px = size / (rows + 3);
  const pal = { ...PAL, H: HAIR[look.style % 6 || 0], B: CLOTH[(look.wearing && look.wearing.clothes) || 'null'] || CLOTH.null, R: '#f27a9a', C: '#ffd23f' };
  if (look.sick) pal.Y = '#d6e89a';
  const hop = opts.walking ? Math.abs(Math.sin(t / 120)) * px * 1.5 : (look.sleeping ? 0 : Math.abs(Math.sin(t / 400)) * px * 0.6);
  const x0 = cx - 8 * px, top = by - rows * px - hop;
  let head = HEAD.slice();
  if (look.sleeping) { head[7] = SLEEP_EYES[7]; head[8] = SLEEP_EYES[8]; }
  else if (Math.floor(t / 2800) !== Math.floor((t + 140) / 2800)) { head[7] = SLEEP_EYES[7]; head[8] = 'OHYYEEYYYYEEYYHO'; } // blink
  // shadow
  ctx.fillStyle = 'rgba(29,37,87,.18)'; ctx.fillRect(cx - 5 * px, by - px * 0.6, 10 * px, px);
  if (baby) { drawGrid(ctx, head, x0, top, px, pal); drawGrid(ctx, ['....OO....OO....'], x0, top + head.length * px, px, pal); }
  else { drawGrid(ctx, head, x0, top, px, pal); drawGrid(ctx, (opts.walking && Math.floor(t / 150) % 2) ? BODY2 : BODY, x0, top + head.length * px, px, pal); }
  const hat = look.wearing && look.wearing.hat;
  if (hat && HATS[hat]) drawGrid(ctx, HATS[hat], x0, top - (HATS[hat].length - 1) * px, px, pal);
  if (look.sleeping) { ctx.fillStyle = '#1d2557'; ctx.font = `${Math.round(px * 4)}px Galmuri11, monospace`; ctx.fillText('Z', cx + 7 * px, top + Math.sin(t / 300) * px * 2); ctx.font = `${Math.round(px * 3)}px Galmuri11, monospace`; ctx.fillText('z', cx + 10 * px, top - 3 * px); }
  if (look.sick) { ctx.font = `${Math.round(px * 5)}px sans-serif`; ctx.fillText('🤒', cx + 6 * px, top + 3 * px); }
}
