# Showcase: forces stages client-side to screenshot all character sprites (home adult, plaza mixed, volley, char select)
import asyncio
from playwright.async_api import async_playwright
URL = 'http://localhost:3456'
FORCE = """window._realDraw = window._realDraw || drawPet; window.drawPet = (ctx, x, y, sz, look, t, o) => {
  const st = window.FORCE_STAGE === 'mix' ? ['baby','child','adult'][(look && look.char || 0) % 3] : window.FORCE_STAGE; if (st && look && look.stage !== 'dead') { look = { ...look, stage: st }; if (st === 'adult') sz *= 1.3; }
  return window._realDraw(ctx, x, y, sz, look, t, o); };"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); errs = []; pages = []
        for i in range(7):
            ctx = await b.new_context(viewport={'width': 720, 'height': 820}); pg = await ctx.new_page()
            pg.on('pageerror', lambda e: errs.append(str(e)))
            await pg.goto(URL); await pg.fill('#nick', f'캐릭{i+1}'); await pg.click('#nick-ok'); await pg.wait_for_timeout(400)
            if i == 0: await pg.screenshot(path='test/char_select.png')
            await pg.click(f'#char-grid .char:nth-child({i+1})'); await pg.wait_for_timeout(2500); pages.append(pg)
        A = pages[6]
        await A.evaluate(FORCE + "window.FORCE_STAGE='adult'"); await A.wait_for_timeout(500); await A.screenshot(path='test/home.png')
        await A.evaluate("S.pet.sick = true"); await A.wait_for_timeout(300); await A.screenshot(path='test/home_sick.png')
        for i, pg in enumerate(pages):
            await pg.evaluate(FORCE + f"window.FORCE_STAGE={['baby','child','adult'][i % 3]!r}"); await pg.click('[data-act=plaza]')
        await pages[0].wait_for_timeout(800); await pages[0].evaluate("window.FORCE_STAGE='mix'")
        for i, pg in enumerate(pages):
            await pg.mouse.click(60 + i * 95, 260 + (i % 2) * 110)
        await pages[0].wait_for_timeout(4000); await pages[0].screenshot(path='test/plaza.png')
        V = pages[3]; await V.evaluate("window.FORCE_STAGE='child'"); await V.click('#practice'); await V.wait_for_timeout(2500)
        await V.screenshot(path='test/volley.png')
        print('ERRORS:', errs); await b.close()
asyncio.run(main())
