import asyncio
from playwright.async_api import async_playwright
BOT = """setInterval(() => { if (!RD || !RD.cur) return; const me = RD.cur.p.find(q => q[0] === socket.id); if (!me) return;
  const bx = RD.cur.b[0]; rkeys.l = me[1] > bx + 6; rkeys.r = me[1] < bx - 6; rSend(); rAct('atk'); rAct('skill'); }, 300)"""
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
        for i, n in enumerate(['레이드A', '레이드B']):
            ctx = await b.new_context(viewport={'width': 720, 'height': 900}); pg = await ctx.new_page()
            pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
            await pg.goto('http://localhost:3456/?hatch=1500'); await pg.fill('#nick', n); await pg.click('#nick-ok'); await pg.wait_for_timeout(2500)
            await enter_room(pg); await pg.wait_for_timeout(500); await pg.click('#raid-btn'); await pg.wait_for_timeout(700); pages.append(pg)
        A, B = pages
        await A.click('#r-diff [data-d=hard]'); await A.wait_for_timeout(400); await A.click('#r-diff [data-d=normal]'); await A.wait_for_timeout(400)
        await A.screenshot(path='test/raid_lobby.png'); await B.screenshot(path='test/raid_lobby_guest.png')
        await A.click('#r-start'); await A.wait_for_timeout(2500)
        for pg in pages: await pg.evaluate(BOT)
        await A.wait_for_timeout(1500); await A.screenshot(path='test/raid_game.png')
        for k in range(40):
            await A.wait_for_timeout(150)
            if await A.evaluate("RD && RD.cur && (RD.cur.m.length > 0 || (RD.cur.l && RD.cur.l[2] === 0) || RD.cur.f.length > 0)"): break
        await A.screenshot(path='test/raid_attack.png')
        for k in range(60):
            await A.wait_for_timeout(500)
            st = await A.evaluate("RD && RD.cur ? RD.cur.b[3] : -1")
            if st == 1: break
        await A.wait_for_timeout(1200); await A.screenshot(path='test/raid_enraged.png'); print('enraged:', st)
        await A.wait_for_timeout(1000)
        print('ERRORS:', errs); await b.close()
asyncio.run(main())
