# v1.8 꾸미기 try-on: tap unowned = preview only (no coins, no save), 구매하기 buys + wears, 취소 restores. Usage: python3 test/browser_preview.py [URL]
import asyncio, json, sys, time
from playwright.async_api import async_playwright
sys.path.insert(0, 'test'); from browser_outfit import save
URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:3456'
async def main():
    async with async_playwright() as p:
        br = await p.chromium.launch(); ctx = await br.new_context(viewport={'width': 520, 'height': 1100})
        sv = save('미리보기', 'adult', 2, coins=500)
        await ctx.add_init_script(f"localStorage.tg_pid='pv-{int(time.time()*1000)}';localStorage.tg_nick='미리보기';localStorage.tg_save={json.dumps(json.dumps(sv))}")
        pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); await pg.goto(URL); await pg.wait_for_timeout(1500)
        await pg.click('[data-act=wardrobe]'); await pg.click('#w-tabs [data-tab=outfit]')
        pic0 = await pg.evaluate('drawWardrobe(0), wcv.toDataURL()')
        await pg.click('#w-list [data-item="outfit:hanbok"]'); await pg.wait_for_timeout(1200)
        st = await pg.evaluate("[S.coins, S.outfit, S.owned.includes('outfit_hanbok'), JSON.parse(localStorage.tg_save).outfit]")
        assert st == [500, 'base', False, 'base'], st  # preview only: nothing spent, nothing saved
        assert await pg.evaluate('drawWardrobe(0), wcv.toDataURL()') != pic0, 'preview shows the outfit'
        assert await pg.is_visible('#w-try') and '구매하기' in await pg.text_content('#w-buy')
        await pg.screenshot(path='test/preview_before_buy.png', full_page=True)
        await pg.click('#w-cancel'); await pg.wait_for_timeout(1200)
        assert await pg.evaluate('drawWardrobe(0), wcv.toDataURL()') == pic0, '취소 restores look'; assert not await pg.is_visible('#w-try')
        # preview hair + switch to outfit tab clears; then buy outfit
        await pg.click('#w-list [data-item="outfit:hanbok"]'); price = await pg.evaluate("G.priceOf(S,'outfit_hanbok')")
        await pg.click('#w-buy'); await pg.wait_for_timeout(1200)
        st = await pg.evaluate("[S.coins, S.outfit, S.owned.includes('outfit_hanbok'), JSON.parse(localStorage.tg_save).outfit]")
        assert st == [500 - price, 'hanbok', True, 'hanbok'], st
        await pg.screenshot(path='test/preview_confirm.png', full_page=True)
        # too expensive: button disabled; gacha-only: previews, button goes to 뽑기; closing clears preview
        await pg.evaluate('S.coins = 1; renderHud()'); await pg.click('#w-tabs [data-tab=hair]'); await pg.click('#w-list [data-item="hair:afro"]')
        assert await pg.is_disabled('#w-buy') and await pg.evaluate("S.hair") == 'base'
        await pg.click('#w-tabs [data-tab=acc]'); await pg.click('#w-list [data-item="acc:catears"]'); assert '뽑기' in await pg.text_content('#w-buy')
        await pg.click('#w-buy'); assert await pg.evaluate('wTab') == 'gacha'
        await pg.click('#w-tabs [data-tab=acc]'); await pg.click('#w-list [data-item="acc:catears"]'); await pg.click('#wardrobe-modal .big.b-blue'); assert await pg.evaluate('wTry') is None
        assert not errs, errs; await br.close(); print('preview browser OK')
asyncio.run(main())
