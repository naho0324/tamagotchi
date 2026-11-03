# Rooms + local save + backup + raid multipliers. Usage: python3 test/browser_rooms.py [URL]
import asyncio, json, sys, time
from playwright.async_api import async_playwright
URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:3456'
def save(nick, stage, char):
    now = int(time.time() * 1000)
    pet = dict(stage=stage, char=char, bornAt=now - 3600000, hatchedAt=now - 3500000, lastUpdate=now, style=0,
               stats=dict(hunger=90, happy=90, energy=100, clean=90), sick=False, sleeping=False, zeroMin=0, careScore=9, cooldowns={})
    return dict(id='x', nickname=nick, coins=123, inventory=dict(snack=1, medicine=0), owned=[], wearing=dict(hat=None, clothes=None), pet=pet, wins=0)
async def main():
    async with async_playwright() as p:
        br = await p.chromium.launch(); pages = []
        for i, (n, st, ch) in enumerate([('아기', 'baby', 2), ('어린이', 'child', 4), ('어른', 'adult', 6)]):
            ctx = await br.new_context(viewport={'width': 520, 'height': 900})
            await ctx.add_init_script(f"if(!localStorage.tg_pid){{localStorage.tg_pid='br-{i}-{int(time.time())}';localStorage.tg_nick={json.dumps(n)};localStorage.tg_save={json.dumps(json.dumps(save(n, st, ch)))}}}")
            pg = await ctx.new_page(); await pg.goto(URL); await pg.wait_for_timeout(800); pages.append(pg)
        A, B, C = pages
        assert await A.text_content('#coins') == '123', 'local save loaded'
        await A.click('[data-act=plaza]'); await A.wait_for_timeout(300); await A.click('#room-create'); await A.wait_for_timeout(600)
        code = await A.text_content('#room-code-show'); assert len(code) == 6, code
        await B.click('[data-act=plaza]'); await B.fill('#room-code', code.lower()); await B.screenshot(path='test/room_join.png')
        await B.click('#room-join'); await C.click('[data-act=plaza]'); await C.fill('#room-code', code); await C.click('#room-join')
        await A.wait_for_timeout(2500); await A.screenshot(path='test/plaza_code.png')
        assert '3/6' in await A.text_content('#plaza-count')
        for pg in pages: await pg.click('#raid-btn'); await pg.wait_for_timeout(300)
        await A.wait_for_timeout(800); await A.screenshot(path='test/raid_lobby_mult.png')
        txt = await A.text_content('#r-players'); print(txt); assert 'x0.5' not in txt and 'x2.42' in txt and 'x1.65' in txt and 'x1.1' in txt  # 애교쟁이 (char 2) cheer +10%
        for pg in pages: await pg.click('#r-back')
        # backup: export from A, import into B with confirm
        await C.click('#plaza-back'); await C.click('#backup-btn'); await C.wait_for_timeout(300); code_bk = await C.input_value('#bk-export')
        assert code_bk.startswith('TG1.')
        await B.click('#plaza-back'); await B.click('#backup-btn'); await B.fill('#bk-import', code_bk); await B.click('#bk-load'); await B.wait_for_timeout(200)
        await B.screenshot(path='test/backup.png')
        await B.click('#bk-yes'); await B.wait_for_timeout(1200); st = await B.text_content('#status'); print(st); assert '어른' in st
        await C.screenshot(path='test/backup_export.png')
        await br.close(); print('rooms browser OK, room', code)
asyncio.run(main())
