# Whole-outfit sprites, wardrobe, shop, traits, and invite-code rooms. Usage: python3 test/browser_outfit.py [URL]
import asyncio, json, sys, time
from playwright.async_api import async_playwright
URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:3456'
def save(nick, stage, char, old=False, **kw):
    now = int(time.time() * 1000)
    pet = dict(stage=stage, char=char, bornAt=now - 3600000, hatchedAt=now - 3500000, lastUpdate=now, style=0,
               stats=dict(hunger=70, happy=70, energy=90, clean=70), sick=False, sleeping=False, zeroMin=0, careScore=9, cooldowns={})
    p = dict(id='x', nickname=nick, coins=1000, inventory=dict(snack=1, medicine=0), pet=pet, wins=0, owned=[], hair='base', outfit='base')
    if old: p.update(coins=10, owned=['hat_crown', 'cloth_blue'], wearing=dict(hat='hat_crown', clothes='cloth_blue')); del p['hair'], p['outfit']
    p.update(kw); return p
async def page(br, i, sv):
    ctx = await br.new_context(viewport={'width': 520, 'height': 900})
    await ctx.add_init_script(f"if(!localStorage.tg_pid){{localStorage.tg_pid='of-{i}-{int(time.time()*1000)}';localStorage.tg_nick={json.dumps(sv['nickname'])};localStorage.tg_save={json.dumps(json.dumps(sv))}}}")
    pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); pg.errs = errs; pg.ctx = ctx
    await pg.goto(URL); await pg.wait_for_timeout(1500); return pg
async def main():
    async with async_playwright() as p:
        br = await p.chromium.launch()
        # old save migrates: hat/clothes refunded (10 + 80 + 50)
        O = await page(br, 9, save('옛날', 'child', 1, old=True))
        assert await O.text_content('#coins') == '140', await O.text_content('#coins')
        A = await page(br, 0, save('도롱이', 'adult', 3))
        t = await A.text_content('#trait'); assert '잠꾸러기' in t, t
        assert (await A.text_content('#n-energy')).endswith('/150')
        await A.screenshot(path='test/home_trait.png', clip=dict(x=0, y=0, width=520, height=520))
        await A.click('[data-act=shop]'); await A.wait_for_timeout(800); await A.screenshot(path='test/shop_outfits.png', full_page=True)
        for k in ['hair_pigtail', 'outfit_hanbok', 'outfit_space']: await A.evaluate(f"act('buy','{k}')")
        assert await A.text_content('#coins') == str(1000 - 100 - 180 - 250)
        await A.click('#shop-modal .big'); await A.click('[data-act=wardrobe]'); await A.wait_for_timeout(300)
        await A.click('#w-tabs [data-tab=hair]'); await A.click('#w-list [data-item="hair:pigtail"]')
        await A.click('#w-tabs [data-tab=outfit]'); await A.click('#w-list [data-item="outfit:hanbok"]'); await A.wait_for_timeout(800)
        assert await A.evaluate('[S.hair, S.outfit]') == ['pigtail', 'hanbok']
        await A.screenshot(path='test/wardrobe.png')
        await A.click('#wardrobe-modal .big'); await A.wait_for_timeout(800); await A.screenshot(path='test/home_outfit.png')
        B = await page(br, 1, save('꼬마', 'child', 5, owned=['hair_afro', 'outfit_hoodie'], hair='afro', outfit='hoodie'))
        C = await page(br, 2, save('하늘', 'adult', 2, owned=['hair_bob', 'outfit_dress'], hair='bob', outfit='dress'))
        # rooms via invite code: creator's phone goes offline while sharing the code, friend joins, creator comes back
        await A.click('[data-act=plaza]'); await A.wait_for_timeout(300); await A.click('#room-create'); await A.wait_for_timeout(700)
        code = await A.text_content('#room-code-show'); assert len(code) == 6, code
        await A.ctx.set_offline(True); await A.wait_for_timeout(2500)
        await B.click('[data-act=plaza]'); await B.fill('#room-code', ' ' + code.lower() + ' '); await B.click('#room-join'); await B.wait_for_timeout(800)
        print('B:', await B.evaluate('[myRoom, socket.connected]'), await B.text_content('#toast') if await B.query_selector('#toast') else '')
        await A.ctx.set_offline(False); await A.wait_for_timeout(4000); print('A:', await A.evaluate('[myRoom, socket.connected, inPlaza]'))
        cnt = await A.text_content('#plaza-count'); assert '2/6' in cnt, cnt
        await A.screenshot(path='test/rooms_two_players.png')
        await C.click('[data-act=plaza]'); await C.fill('#room-code', code); await C.click('#room-join'); await A.wait_for_timeout(2500)
        assert '3/6' in await A.text_content('#plaza-count')
        await A.screenshot(path='test/plaza_outfits.png')
        for pg in (A, B, C, O): assert not pg.errs, pg.errs
        await br.close(); print('outfit browser OK, room', code)
if __name__ == "__main__": asyncio.run(main())
