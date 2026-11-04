# v1.6 소모품 in 상점: buy, bag, 사용. Usage: python3 test/browser_consumables.py [URL]
import asyncio, json, sys, time
from playwright.async_api import async_playwright
sys.path.insert(0, 'test'); from browser_outfit import save
URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:3456'
async def main():
    async with async_playwright() as p:
        br = await p.chromium.launch(); ctx = await br.new_context(viewport={'width': 520, 'height': 1000})
        sv = save('소모품', 'adult', 2, coins=400, inventory={'snack': 1, 'medicine': 0})  # pre-v1.6 bag
        sv['pet']['stats'].update(energy=20, happy=30)
        await ctx.add_init_script(f"localStorage.tg_pid='cs-{int(time.time()*1000)}';localStorage.tg_nick='소모품';localStorage.tg_save={json.dumps(json.dumps(sv))}")
        pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); await pg.goto(URL); await pg.wait_for_timeout(1500)
        await pg.click('[data-act=shop]'); await pg.wait_for_timeout(300)
        for k in ['meal', 'drink', 'toy', 'vitamin']: await pg.click(f'#shop-list [data-item={k}] button')
        assert await pg.evaluate('S.coins') == 400 - 30 - 35 - 40 - 45
        await pg.click('#inv-list [data-inv=drink] button'); await pg.wait_for_timeout(200)
        assert await pg.evaluate('[S.inventory.drink, S.pet.stats.energy >= 79]') == [0, True]
        await pg.wait_for_timeout(600); await pg.screenshot(path='test/shop_consumables.png', full_page=True)
        assert not errs, errs; await br.close(); print('consumables browser OK')
asyncio.run(main())
