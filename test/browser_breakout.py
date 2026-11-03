# 벽돌부수기: plaza row, solo game, 2-player co-op, result. Usage: python3 test/browser_breakout.py [URL]
import asyncio, json, sys, time
from playwright.async_api import async_playwright
sys.path.insert(0, 'test'); from browser_outfit import save
URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:3456'
async def page(br, i, nick, char):
    ctx = await br.new_context(viewport={'width': 520, 'height': 900}); sv = save(nick, 'adult', char)
    await ctx.add_init_script(f"if(!localStorage.tg_pid){{localStorage.tg_pid='bk-{i}-{int(time.time()*1000)}';localStorage.tg_nick={json.dumps(nick)};localStorage.tg_save={json.dumps(json.dumps(sv))}}}")
    pg = await ctx.new_page(); pg.errs = []; pg.on('pageerror', lambda e: pg.errs.append(str(e))); await pg.goto(URL); await pg.wait_for_timeout(1500); return pg
BOT = "setInterval(()=>{ if(BK&&BK.cur){ const me=bkMine(); const bs=BK.cur.b.filter(b=>b[0]>=me.lo&&b[0]<me.hi); if(bs.length){ bs.sort((a,b)=>b[1]-a[1]); bkAim(bs[0][0]); } } },40)"
async def main():
    async with async_playwright() as p:
        br = await p.chromium.launch(); A = await page(br, 0, '벽돌왕', 3)
        await A.click('[data-act=plaza]'); await A.wait_for_timeout(300); await A.click('#room-create'); await A.wait_for_timeout(900)
        code = await A.text_content('#room-code-show'); await A.screenshot(path='test/bk_plaza.png', full_page=True)
        await A.click('#bk-btn'); await A.wait_for_timeout(500); await A.screenshot(path='test/bk_lobby.png')
        await A.click('#bk-start'); await A.evaluate(BOT); await A.wait_for_timeout(9000); await A.screenshot(path='test/bk_solo.png')
        await A.evaluate("for(let i=1;i<9999;i++)clearInterval(i)"); await A.evaluate("bkAim(5)")
        await A.wait_for_selector('#end-modal:not(.hidden)', timeout=90000); await A.screenshot(path='test/bk_result_solo.png'); print('solo:', await A.text_content('#end-msg'))
        await A.click('#end-ok'); await A.wait_for_timeout(500)
        B = await page(br, 1, '친구', 6); await B.click('[data-act=plaza]'); await B.wait_for_timeout(300); await B.fill('#room-code', code); await B.click('#room-join'); await B.wait_for_timeout(900)
        await A.click('#bk-btn'); await A.wait_for_timeout(300); await B.click('#bk-btn'); await A.wait_for_timeout(600); await A.screenshot(path='test/bk_lobby_2p.png')
        await A.click('#bk-start'); await A.wait_for_timeout(300)
        for P in (A, B): await P.evaluate(BOT)
        await A.wait_for_timeout(10000); await A.screenshot(path='test/bk_2p.png'); await B.screenshot(path='test/bk_2p_friend.png')
        for P in (A, B): await P.evaluate("for(let i=1;i<9999;i++)clearInterval(i)"); await P.evaluate("bkAim(bkMine().lo)")
        await A.wait_for_selector('#end-modal:not(.hidden)', timeout=120000); await A.screenshot(path='test/bk_result_2p.png'); print('2p:', await A.text_content('#end-msg'))
        await A.click('#end-ok'); await A.wait_for_timeout(400); assert await A.is_visible('#plaza')
        print('coins', await A.text_content('#coins'), 'errors', A.errs + B.errs); assert not (A.errs + B.errs); await br.close()
asyncio.run(main())
