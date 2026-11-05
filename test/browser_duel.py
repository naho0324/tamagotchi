# v1.10 1:1 내기 대결 (server started with BOMB_FUSE_MS=9000 DRAW_MS=8000 for speed). Usage: python3 test/browser_duel.py
import asyncio, json, time
from playwright.async_api import async_playwright
U = 'http://localhost:3456/'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); errs = []; P = []; code = None
        for n in ['폭탄A', '폭탄B']:
            now = int(time.time() * 1000); sv = dict(id='x', nickname=n, coins=200, inventory=dict(snack=0, medicine=0), wins=0, owned=[], hair='base', outfit='base',
                pet=dict(stage='child', char=1 + len(P) * 2, bornAt=now - 3600000, hatchedAt=now - 3500000, lastUpdate=now, style=0, stats=dict(hunger=80, happy=80, energy=95, clean=80), sick=False, sleeping=False, zeroMin=0, careScore=9, cooldowns={}))
            ctx = await b.new_context(viewport={'width': 720, 'height': 900})
            await ctx.add_init_script(f"if(!localStorage.tg_pid){{localStorage.tg_pid='du-{len(P)}-{now}';localStorage.tg_nick={json.dumps(n)};localStorage.tg_save={json.dumps(json.dumps(sv))}}}")
            pg = await ctx.new_page()
            pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
            await pg.goto(U); await pg.wait_for_timeout(1500)
            await pg.click('[data-act=plaza]'); await pg.wait_for_timeout(300)
            if not code: await pg.click('#room-create'); await pg.wait_for_timeout(500); code = await pg.text_content('#room-code-show')
            else: await pg.fill('#room-code', code); await pg.click('#room-join'); await pg.wait_for_timeout(500)
            P.append(pg)
        A, B = P
        # baby is blocked
        await B.evaluate("S.pet.stage='baby'"); await B.click('#duel-btn'); assert await B.is_hidden('#duel'); await B.evaluate("S.pet.stage='child'; sendSnap()")
        for pg in P: await pg.click('#duel-btn'); await pg.wait_for_timeout(400)
        await A.click('#du-stakes [data-stake="30"]'); await A.wait_for_timeout(500)
        await B.screenshot(path='test/bomb_lobby.png'); assert '도전' in await B.text_content('#du-tables')
        await B.click('[data-join]'); await A.wait_for_timeout(700)
        assert await A.evaluate('S.coins') == 170 and await B.evaluate('S.coins') == 170, 'stakes locked'
        # holder passes once via sequence
        for _ in range(2):
            for pg in P:
                st = await pg.evaluate('BM && BM.st')
                if st and st['holder'] == await pg.evaluate('socket.id'):
                    for d in st['seq']: await pg.keyboard.press({'up': 'ArrowUp', 'down': 'ArrowDown', 'left': 'ArrowLeft', 'right': 'ArrowRight'}[d]); await pg.wait_for_timeout(120)
                    break
            await A.wait_for_timeout(1000)
        await A.screenshot(path='test/bomb_play.png'); passes = (await A.evaluate('BM.st.passes'))
        assert passes >= 1, passes
        await A.wait_for_timeout(8500)
        ca, cb = await A.evaluate('S.coins'), await B.evaluate('S.coins'); assert sorted([ca, cb]) == [170, 224], (ca, cb)
        W = A if ca == 224 else B; await W.screenshot(path='test/bomb_win.png'); print('bomb:', await W.text_content('#end-title'), await W.text_content('#end-msg'))
        for pg in P: await pg.click('#end-ok'); await pg.wait_for_timeout(300)
        # draw duel
        a0, b0 = await A.evaluate('S.coins'), await B.evaluate('S.coins')
        await A.click('#du-modes [data-mode=draw]'); await A.click('#du-stakes [data-stake="10"]'); await B.wait_for_timeout(500)
        await B.screenshot(path='test/draw_lobby.png'); await B.click('[data-join]'); await A.wait_for_timeout(600)
        BW.append((await B.text_content('#draw-word')).split(': ')[1].strip()); aw = (await A.text_content('#draw-word')).split(': ')[1].strip()
        await B.evaluate('w => window._aw = w', aw); assert BW[0] != aw
        for pg, shape in [(A, [(4+i, 6) for i in range(8)] + [(8, 3+j) for j in range(10)]), (B, [(5+i, 5+i) for i in range(7)])]:
            await pg.evaluate("c => { const pal=document.querySelectorAll('#draw-pal button'); pal[c].click() }", 2 if pg == A else 6)
            box = await pg.locator('#drawCv').bounding_box(); s = box['width'] / 16
            for x, y in shape: await pg.mouse.click(box['x'] + x*s + s/2, box['y'] + y*s + s/2)
        await A.screenshot(path='test/draw_play.png')
        for pg in P: await pg.click('#draw-done')
        await A.wait_for_timeout(600); await A.screenshot(path='test/draw_guess.png')
        wrong = await B.evaluate("[...document.querySelectorAll('#draw-choices button')].map(b=>b.textContent).find(w => w !== window._aw)")
        await B.locator('#draw-choices button', has_text=wrong).first.click()
        await A.locator('#draw-choices button', has_text=BW[0]).first.click()
        await A.wait_for_timeout(800)
        ca, cb = await A.evaluate('S.coins'), await B.evaluate('S.coins'); print('draw coins', ca, cb, await A.text_content('#end-msg')); assert (ca, cb) == (a0 + 8, b0 - 10), (a0, b0, ca, cb)
        W = A if ca > a0 else B; await W.screenshot(path='test/draw_win.png')
        # forfeit: B leaves mid-bomb -> A wins 90%
        for pg in P: await pg.click('#end-ok'); await pg.wait_for_timeout(300)
        a0, b0 = await A.evaluate('S.coins'), await B.evaluate('S.coins')
        await A.click('#du-modes [data-mode=bomb]'); await A.click('#du-stakes [data-stake="10"]'); await B.wait_for_timeout(500); await B.click('[data-join]'); await A.wait_for_timeout(600)
        B.once('dialog', lambda d: asyncio.ensure_future(d.accept())); await B.click('#du-back'); await A.wait_for_timeout(800)
        ca, cb = await A.evaluate('S.coins'), await B.evaluate('S.coins'); assert (ca, cb) == (a0 + 8, b0 - 10), (a0, b0, ca, cb)
        assert '기권승' in await A.text_content('#end-title'); await A.screenshot(path='test/duel_forfeit.png'); print('forfeit:', await A.text_content('#end-msg'))
        print('ERRORS:', errs); assert not errs; print('duel browser OK'); await b.close()
BW = []
asyncio.run(main())
