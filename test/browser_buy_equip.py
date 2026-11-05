# Repro: buying an outfit should show on home. Usage: python3 test/browser_buy_equip.py [URL] [tag]
import asyncio, json, sys, time
from playwright.async_api import async_playwright
sys.path.insert(0, 'test'); from browser_outfit import save
URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:3456'; TAG = sys.argv[2] if len(sys.argv) > 2 else 'after'
async def run(br, stage, old=False):
    sv = save('테스트', stage, 2, old=old); stage = stage + ('_v0save' if old else ''); ctx = await br.new_context(viewport={'width': 520, 'height': 900})
    await ctx.add_init_script(f"localStorage.tg_pid='be-{stage}-{int(time.time()*1000)}';localStorage.tg_nick='테스트';localStorage.tg_save={json.dumps(json.dumps(sv))}")
    pg = await ctx.new_page(); await pg.goto(URL); await pg.wait_for_timeout(1500)
    await pg.click('[data-act=shop]'); await pg.wait_for_timeout(300)
    await pg.evaluate("(S.owned.push('outfit_hoodie'), act('equip','outfit:hoodie'))"); toast = await pg.evaluate("document.querySelector('#toast')?.textContent||''")
    await pg.screenshot(path=f'test/buy_shop_{stage}_{TAG}.png', full_page=True)
    await pg.click('#shop-modal .big'); await pg.wait_for_timeout(800)
    await pg.screenshot(path=f'test/buy_home_{stage}_{TAG}.png', clip=dict(x=0, y=0, width=520, height=520))
    o = await pg.evaluate('S.outfit'); print(stage, 'outfit after buy =', o, '| toast:', toast); await ctx.close(); return o
async def main():
    async with async_playwright() as p:
        br = await p.chromium.launch(); r = await run(br, 'adult'); await run(br, 'child'); r2 = await run(br, 'adult', True); await br.close()
        if TAG == 'after': assert r == r2 == 'hoodie', (r, r2)
asyncio.run(main())
