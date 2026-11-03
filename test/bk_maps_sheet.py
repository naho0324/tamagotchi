# Contact sheet of sample breakout maps (same colors as the game). Usage: python3 test/bk_maps_sheet.py
import json, subprocess
from PIL import Image, ImageDraw, ImageFont
STAGES = [1, 5, 10, 20, 30, 40, 45, 50]
data = json.loads(subprocess.check_output(['node', '-e', "const b=require('./breakout');console.log(JSON.stringify(%s.map(l=>{const i=b.mapFor(l,0.5);return {l,i,kind:b.KIND[i],m:b.MAPS[i]}})))" % json.dumps(STAGES)]))
ROWC = ['#f9a8c0', '#ffd88a', '#a8e0a0', '#a8d0f7', '#c9b6f2']; HP = {'2': '#e0913a', '3': '#6a4fb3'}
CW, CH, BW, BH = 480, 230, 43, 14
try: font = ImageFont.truetype('/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttc', 18)
except Exception:
    try: font = ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc', 18)
    except Exception: font = ImageFont.load_default()
img = Image.new('RGB', (CW * 4 + 50, CH * 2 + 30), '#ffd0dc'); d = ImageDraw.Draw(img)
for k, e in enumerate(data):
    ox, oy = 10 + (k % 4) * (CW + 10), 10 + (k // 4) * (CH + 10)
    d.rectangle([ox, oy, ox + CW - 1, oy + CH - 1], fill='#fff5f8', outline='#1d2557', width=3)
    for r, row in enumerate(e['m']):
        for c, ch in enumerate(row):
            if ch == '.': continue
            x, y = ox + 25 + c * BW, oy + 34 + r * BH
            d.rectangle([x, y, x + BW - 3, y + BH - 3], fill='#1d2557')
            col = '#7d869a' if ch == '#' else HP.get(ch, ROWC[r % 5])
            d.rectangle([x + 2, y + 2, x + BW - 5, y + BH - 5], fill=col)
            if ch in '23':
                for j in range(int(ch)): d.rectangle([x + BW // 2 - int(ch) * 3 + j * 6, y + 5, x + BW // 2 - int(ch) * 3 + j * 6 + 3, y + 7], fill='white')
    d.text((ox + 8, oy + 6), f"{e['l']}단계 · #{e['i'] + 1}/200 · {e['kind']}", fill='#1d2557', font=font)
img.save('test/bk_maps_sheet.png'); print([(e['l'], e['kind']) for e in data])
