import asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); errs = []; pages = []
        for i, n in enumerate(['스네이크A', '스네이크B']):
            ctx = await b.new_context(viewport={'width': 720, 'height': 820}); pg = await ctx.new_page()
            pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
            await pg.goto('http://localhost:3456'); await pg.fill('#nick', n); await pg.click('#nick-ok'); await pg.wait_for_timeout(500); await pg.click('#char-grid .char:nth-child(%d)' % (i % 7 + 1)); await pg.wait_for_timeout(1000)
            await pg.click('[data-act=plaza]'); await pg.wait_for_timeout(500); await pg.click('#snake-btn'); await pg.wait_for_timeout(700); pages.append(pg)
        A, B = pages
        await A.screenshot(path='test/snake_lobby.png')
        await A.click('#s-start'); await A.wait_for_timeout(600)
        await A.keyboard.press('ArrowDown'); await B.keyboard.press('ArrowUp'); await A.wait_for_timeout(700)
        await A.screenshot(path='test/snake_game.png')
        await A.wait_for_timeout(4000); print('end modal visible:', await A.is_visible('#end-modal'), await A.text_content('#end-msg'))
        print('ERRORS:', errs); await b.close()
asyncio.run(main())
