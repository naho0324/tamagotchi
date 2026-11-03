import asyncio
from playwright.async_api import async_playwright
ROOM = {}
async def enter_room(pg):  # first page creates a room, the rest join by code
    await pg.click('[data-act=plaza]'); await pg.wait_for_timeout(300)
    if 'code' not in ROOM:
        await pg.click('#room-create'); await pg.wait_for_timeout(500); ROOM['code'] = await pg.text_content('#room-code-show')
    else:
        await pg.fill('#room-code', ROOM['code']); await pg.click('#room-join'); await pg.wait_for_timeout(500)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); errs = []; pages = []
        for i, n in enumerate(['스네이크A', '스네이크B']):
            ctx = await b.new_context(viewport={'width': 720, 'height': 820}); pg = await ctx.new_page()
            pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
            await pg.goto('http://localhost:3456/?hatch=1500'); await pg.fill('#nick', n); await pg.click('#nick-ok'); await pg.wait_for_timeout(1500)
            await enter_room(pg); await pg.wait_for_timeout(500); await pg.click('#snake-btn'); await pg.wait_for_timeout(700); pages.append(pg)
        A, B = pages
        await A.screenshot(path='test/snake_lobby.png')
        await A.click('#s-start'); await A.wait_for_timeout(600)
        await A.keyboard.press('ArrowDown'); await B.keyboard.press('ArrowUp'); await A.wait_for_timeout(700)
        await A.screenshot(path='test/snake_game.png')
        await A.wait_for_timeout(4000); await A.screenshot(path='test/result_snake.png'); print('end modal visible:', await A.is_visible('#end-modal'), await A.text_content('#end-msg'))
        print('ERRORS:', errs); await b.close()
asyncio.run(main())
