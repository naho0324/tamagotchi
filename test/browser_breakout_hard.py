# 벽돌부수기 preview: hard layout + active timed effect. Run server with BK_LEVEL=45 BK_DROP=0.6 (preview-only env). Usage: python3 test/browser_breakout_hard.py [URL]
import asyncio, sys
sys.path.insert(0, 'test'); from browser_breakout import page, BOT, async_playwright
async def main():
    async with async_playwright() as p:
        br = await p.chromium.launch(); A = await page(br, 7, '고수', 3)
        await A.click('[data-act=plaza]'); await A.wait_for_timeout(300); await A.click('#room-create'); await A.wait_for_timeout(900)
        await A.click('#bk-btn'); await A.wait_for_timeout(500); await A.click('#bk-start'); await A.wait_for_timeout(1200); await A.screenshot(path='test/bk_hard.png')
        await A.evaluate(BOT)
        await A.wait_for_function("BK&&BK.cur&&(BK.cur.fx[0]||BK.cur.fx[1]||BK.cur.p.some(q=>q[4]||q[5]||q[6]))", timeout=90000); await A.wait_for_timeout(700); await A.screenshot(path='test/bk_effect_timer.png')
        print('lv', await A.evaluate("BK.cur.lv"), 'errors', A.errs); assert not A.errs; await br.close()
asyncio.run(main())
