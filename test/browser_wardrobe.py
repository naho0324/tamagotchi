# v1.8 옷장 확장: new tops on the custom body, layered head accessories, gacha-only tops (preview + 뽑기로 가기), presets unchanged. Usage: python3 test/browser_wardrobe.py [URL]
import asyncio, json, sys, time
from playwright.async_api import async_playwright
sys.path.insert(0, 'test'); from browser_outfit import save
URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:3456'
async def open_(br, sv, tag):
    ctx = await br.new_context(viewport={'width': 520, 'height': 1100})
    await ctx.add_init_script(f"localStorage.tg_pid='wd-{tag}-{int(time.time()*1000)}';localStorage.tg_nick='{tag}';localStorage.tg_save={json.dumps(json.dumps(sv))}")
    pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); await pg.goto(URL); await pg.wait_for_timeout(1500); return pg, errs
async def main():
    async with async_playwright() as p:
        br = await p.chromium.launch()
        # 1) custom body wearing gacha tops + layered accessories
        sv = save('옷장', 'adult', 1, coins=500, owned=['outfit_tux', 'outfit_bee', 'acc_beret', 'acc_bunny', 'hair_bun'], hair='bun', outfit='tux', acc='beret')
        sv['pet']['custom'] = {'eyes': 'x1', 'color': 'peach'}
        pg, errs = await open_(br, sv, 'x')
        await pg.click('[data-act=wardrobe]'); await pg.wait_for_timeout(800)
        await pg.screenshot(path='test/wardrobe_bun_tux_beret.png', full_page=True)
        await pg.click('#w-tabs [data-tab=outfit]'); n = await pg.locator('#w-list .w-item').count(); assert n == 20, n
        assert '상의' in await pg.text_content('#w-tabs')
        # gacha-only top: preview, buy blocked -> 뽑기로 가기
        pic0 = await pg.evaluate('drawWardrobe(0), wcv.toDataURL()')
        await pg.click('#w-list [data-item="outfit:knight"]'); await pg.wait_for_timeout(1200)
        assert await pg.evaluate('drawWardrobe(0), wcv.toDataURL()') != pic0
        assert '뽑기' in await pg.text_content('#w-buy'); await pg.screenshot(path='test/wardrobe_knight_preview.png', full_page=True)
        assert await pg.evaluate("G.act(S,'buy','outfit_knight',Date.now())") == '뽑기에서만 나와요'
        await pg.click('#w-buy'); assert await pg.evaluate('wTab') == 'gacha'
        st = await pg.evaluate("[S.coins, S.outfit, S.owned.includes('outfit_knight')]"); assert st == [500, 'tux', False], st
        # accessory layer changes the picture
        await pg.click('#w-tabs [data-tab=acc]'); a = await pg.locator('#w-list .w-item').count(); assert a == 11, a
        await pg.click('#w-list [data-item="acc:bunny"]'); await pg.wait_for_timeout(1200); assert await pg.evaluate('S.acc') == 'bunny'
        await pg.click('#w-tabs [data-tab=outfit]'); await pg.click('#w-list [data-item="outfit:bee"]'); await pg.wait_for_timeout(1200)
        await pg.screenshot(path='test/wardrobe_bee_bunny.png', full_page=True)
        await pg.click('#w-tabs [data-tab=acc]'); await pg.click('#w-list [data-item="acc:halo"]'); await pg.wait_for_timeout(1200)
        await pg.screenshot(path='test/wardrobe_halo_preview.png', full_page=True)
        assert not errs, errs
        # 2) preset: old crown sprite path unchanged; new top falls back to base
        sv = save('프리셋', 'adult', 3, coins=500, owned=['acc_crown', 'outfit_hanbok', 'outfit_wizard'], outfit='hanbok', acc='crown')
        pg, errs = await open_(br, sv, 'p')
        await pg.click('[data-act=wardrobe]'); await pg.wait_for_timeout(1200)
        src = await pg.evaluate("outfitSprite(3,'adult','base','hanbok','crown').src"); assert src.endswith('outfits/3/adult/base_hanbok_crown.png'), src
        fb = await pg.evaluate("outfitSprite(3,'adult','bun','wizard','none') ? 1 : 0; new Promise(r=>setTimeout(()=>r(outfitSprite(3,'adult','bun','wizard','none').src),600))"); assert fb.endswith('outfits/3/adult/base_base.png'), fb
        await pg.screenshot(path='test/wardrobe_preset_crown.png', full_page=True)
        await pg.click('#w-tabs [data-tab=outfit]'); assert '기본 몸 전용' in await pg.text_content('#w-list')
        await pg.click('#w-list [data-item="outfit:wizard"]'); await pg.wait_for_timeout(1000)
        await pg.screenshot(path='test/wardrobe_preset_wizard_fallback.png', full_page=True)
        assert not errs, errs; await br.close(); print('wardrobe browser OK')
asyncio.run(main())
