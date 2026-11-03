import sys, asyncio
from playwright.async_api import async_playwright
URL = sys.argv[1]
ROOM = {}
async def enter_room(pg):  # first page creates a room, the rest join by code
    await pg.click('[data-act=plaza]'); await pg.wait_for_timeout(300)
    if 'code' not in ROOM:
        await pg.click('#room-create'); await pg.wait_for_timeout(500); ROOM['code'] = await pg.text_content('#room-code-show')
    else:
        await pg.fill('#room-code', ROOM['code']); await pg.click('#room-join'); await pg.wait_for_timeout(500)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        errs = []
        pages = []
        for i, n in enumerate(['브라우저A', '브라우저B']):
            ctx = await b.new_context(viewport={'width': 720, 'height': 820})
            pg = await ctx.new_page()
            pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
            await pg.goto(URL + '?hatch=1500'); await pg.fill('#nick', n); await pg.click('#nick-ok'); await pg.wait_for_timeout(600)
            await pg.wait_for_timeout(1500)
            pages.append(pg)
        A, B = pages
        await A.click('[data-act=feed]'); await A.wait_for_timeout(800)
        await A.screenshot(path='test/home_baby.png')
        await A.click('[data-act=shop]'); await A.wait_for_timeout(500); await A.screenshot(path='test/shop.png'); await A.click('#shop-modal .big')
        for pg in pages: await enter_room(pg)
        await A.wait_for_timeout(1000); await A.mouse.click(200, 250); await A.wait_for_timeout(1000)
        await A.screenshot(path='test/plaza_baby.png')
        await A.click('#match'); await A.wait_for_timeout(500); await B.click('#match'); await A.wait_for_timeout(1500)
        await A.keyboard.down('ArrowRight'); await A.wait_for_timeout(600); await A.keyboard.up('ArrowRight'); await A.keyboard.press('ArrowUp')
        await A.wait_for_timeout(300); await A.screenshot(path='test/volley_live.png')
        print('A score', await A.text_content('#v-score'), 'B score', await B.text_content('#v-score'))
        await B.click('#v-quit'); await A.wait_for_timeout(1500)
        print('A end:', await A.text_content('#end-title'), await A.text_content('#end-msg')); await A.screenshot(path='test/result_volley.png')
        print('ERRORS:', errs)
        await b.close()
asyncio.run(main())
