# Single-player minigames: menu, 짝맞추기 (solve), 하트 팡팡 (tap), results. Usage: python3 test/browser_mini.py [URL]
import asyncio, json, sys, time
from playwright.async_api import async_playwright
sys.path.insert(0, 'test'); from browser_outfit import save
URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:3456'
async def main():
    async with async_playwright() as p:
        br = await p.chromium.launch(); ctx = await br.new_context(viewport={'width': 520, 'height': 900})
        sv = save('미니', 'adult', 4); sv['coins'] = 100
        await ctx.add_init_script(f"if(!localStorage.tg_pid){{localStorage.tg_pid='mini-{int(time.time()*1000)}';localStorage.tg_nick='미니';localStorage.tg_save={json.dumps(json.dumps(sv))}}}")
        pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); await pg.goto(URL); await pg.wait_for_timeout(1500)
        await pg.screenshot(path='test/mini_home.png', clip=dict(x=0, y=0, width=520, height=520))
        await pg.click('[data-act=plaza]'); await pg.wait_for_timeout(300); await pg.click('#room-create'); await pg.wait_for_timeout(900); await pg.screenshot(path='test/mini_plaza.png', full_page=True)
        c0 = int(await pg.text_content('#coins')) if await pg.is_visible('#coins') else None
        await pg.click('#m-memory'); await pg.wait_for_timeout(600)
        deck = await pg.evaluate('MG.cards.map(c=>c.f)'); box = await pg.locator('#mCv').bounding_box(); k = box['width'] / 480
        async def tap(i):
            r = await pg.evaluate(f'cardRect({i})'); await pg.mouse.click(box['x'] + (r['x'] + 48) * k, box['y'] + (r['y'] + 32) * k); await pg.wait_for_timeout(380)
        await tap(0); await tap(1 if deck[1] != deck[0] else 2); await pg.wait_for_timeout(100); await pg.screenshot(path='test/mini_memory.png')
        await pg.wait_for_timeout(800); t0 = time.time(); seen = set()
        for i, f in enumerate(deck):
            if i in seen: continue
            j = next(j for j in range(i + 1, 16) if deck[j] == f); seen |= {i, j}; await tap(i); await tap(j)
            if len(seen) == 8: await pg.screenshot(path='test/mini_memory_mid.png')
        await pg.wait_for_timeout(max(0, 6.5 - (time.time() - t0)) * 1000 + 800)
        await pg.wait_for_selector('#end-modal:not(.hidden)', timeout=10000); await pg.screenshot(path='test/mini_memory_result.png')
        print('memory:', await pg.text_content('#end-msg'))
        await pg.click('#end-ok'); await pg.wait_for_timeout(400); assert await pg.is_visible('#plaza'); await pg.click('#m-pop'); await pg.wait_for_timeout(300)
        shot = False; end = time.time() + 31
        while time.time() < end and not await pg.is_visible('#end-modal'):
            hs = await pg.evaluate('MG && MG.holes ? MG.holes.filter(o=>o.until>performance.now()+80).map(o=>HOLES[o.i]) : []')
            if not shot and hs and time.time() > end - 20: await pg.screenshot(path='test/mini_pop.png'); shot = True
            for h in hs: await pg.mouse.click(box['x'] + h['x'] * k, box['y'] + h['y'] * k)
            await pg.wait_for_timeout(150)
        await pg.wait_for_selector('#end-modal:not(.hidden)', timeout=8000); await pg.screenshot(path='test/mini_pop_result.png')
        print('pop:', await pg.text_content('#end-msg')); await pg.click('#end-ok'); await pg.wait_for_timeout(400); assert await pg.is_visible('#plaza'); await pg.click('#plaza-back'); await pg.wait_for_timeout(500); await pg.screenshot(path='test/mini_home.png', clip=dict(x=0, y=0, width=520, height=520))
        print('coins', c0, '->', await pg.text_content('#coins'), 'energy', await pg.text_content('#n-energy'), 'errors', errs); assert not errs
        await br.close()
asyncio.run(main())
