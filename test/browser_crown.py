# Crown (머리장식) screenshots: shop, home, wardrobe, plaza. Usage: python3 test/browser_crown.py [URL]
import asyncio, json, sys, time
from playwright.async_api import async_playwright
sys.path.insert(0, 'test'); from browser_outfit import save
URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:3456'
async def run(br, stage, char):
    sv = save('왕관', stage, char); sv['coins'] = 900; sv['owned'] = ['hair_pigtail', 'outfit_hanbok']; sv['hair'] = 'pigtail'; sv['outfit'] = 'hanbok'
    ctx = await br.new_context(viewport={'width': 520, 'height': 900})
    await ctx.add_init_script(f"localStorage.tg_pid='cr-{stage}-{int(time.time()*1000)}';localStorage.tg_nick='왕관';localStorage.tg_save={json.dumps(json.dumps(sv))}")
    pg = await ctx.new_page(); await pg.goto(URL); await pg.wait_for_timeout(1500)
    await pg.click('[data-act=shop]'); await pg.wait_for_timeout(300)
    await pg.evaluate("act('buy','acc_crown')"); await pg.wait_for_timeout(300)
    await pg.evaluate("document.querySelector('#shop-list h3:last-of-type')?.scrollIntoView()")
    await pg.screenshot(path=f'test/crown_shop_{stage}.png')
    await pg.click('#shop-modal .big'); await pg.wait_for_timeout(800)
    await pg.screenshot(path=f'test/crown_home_{stage}.png', clip=dict(x=0, y=0, width=520, height=520))
    await pg.evaluate("openWardrobe(); wTab='acc'; renderWardrobe()"); await pg.wait_for_timeout(600)
    await pg.screenshot(path=f'test/crown_wardrobe_{stage}.png')
    acc = await pg.evaluate('S.acc'); print(stage, 'acc =', acc); assert acc == 'crown'; await ctx.close()
async def main():
    async with async_playwright() as p:
        br = await p.chromium.launch(); await run(br, 'adult', 4); await run(br, 'child', 7); await br.close()
asyncio.run(main())
