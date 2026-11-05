# 상점/꾸미기 split: 상점 = consumables only, 꾸미기 = buy + wear + 뽑기. Usage: python3 test/browser_decor.py [URL]
import asyncio, json, sys, time
from playwright.async_api import async_playwright
sys.path.insert(0, 'test'); from browser_outfit import save
URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:3456'
async def main():
    async with async_playwright() as p:
        br = await p.chromium.launch(); ctx = await br.new_context(viewport={'width': 520, 'height': 900})
        sv = save('분리', 'adult', 4, coins=600, owned=['hair_bob', 'acc_crown'], hair='bob', acc='crown')  # pre-split save
        await ctx.add_init_script(f"localStorage.tg_pid='dc-{int(time.time()*1000)}';localStorage.tg_nick='분리';localStorage.tg_save={json.dumps(json.dumps(sv))}")
        pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); await pg.goto(URL); await pg.wait_for_timeout(1500)
        await pg.click('[data-act=shop]'); await pg.wait_for_timeout(400)
        txt = await pg.text_content('#shop-list'); assert '간식' in txt and '약' in txt and '왕관' not in txt and '한복' not in txt and not await pg.query_selector('#gacha-btn'), txt
        await pg.screenshot(path='test/shop_split.png')
        await pg.click('#shop-to-decor'); await pg.wait_for_timeout(300)
        await pg.click('#w-tabs [data-tab=outfit]'); await pg.click('#w-list [data-item="outfit:hanbok"]'); assert '뽑기' in await pg.text_content('#w-buy')  # all cosmetics gacha-only
        await pg.evaluate("S.owned.push('outfit_hanbok','acc_ribbon')"); await pg.click('#w-tabs [data-tab=outfit]'); await pg.click('#w-list [data-item="outfit:hanbok"]'); await pg.wait_for_timeout(300)
        assert await pg.evaluate('[S.outfit, S.coins]') == ['hanbok', 600]
        await pg.click('#w-tabs [data-tab=acc]')
        await pg.click('#w-list [data-item="acc:crown"]'); assert await pg.evaluate('S.acc') == 'crown'  # owned -> equip, no charge
        assert await pg.evaluate('S.coins') == 600
        await pg.click('#w-list [data-item="acc:catears"]'); await pg.click('#w-buy'); assert await pg.evaluate('wTab') == 'gacha'  # gacha-only jumps to 뽑기
        await pg.click('#w-tabs [data-tab=acc]'); await pg.wait_for_timeout(800); await pg.screenshot(path='test/decor_shop.png')
        await pg.click('#w-tabs [data-tab=gacha]'); await pg.wait_for_timeout(300); await pg.screenshot(path='test/decor_gacha_tab.png')
        assert not errs, errs; await br.close(); print('decor split OK')
asyncio.run(main())
