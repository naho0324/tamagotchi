# 벽돌부수기: after dragging the paddle, the drawn paddle must sit on the server collider (solo + 2p). Usage: python3 test/browser_breakout_paddle.py [URL]
import asyncio, sys
sys.path.insert(0, 'test'); from browser_breakout import page, async_playwright
URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:3456'
import browser_breakout; browser_breakout.URL = URL
GAP = "(()=>{const me=bkMine(),s=BK.cur.p.find(q=>q[0]===socket.id);return Math.abs(bkDrawX(me,s[1],performance.now())-s[1])})()"
async def drag(P, xs):
    box = await P.locator('#bkCv').bounding_box(); await P.mouse.move(box['x'] + box['width'] * xs[0] / 480, box['y'] + box['height'] * 0.9); await P.mouse.down()
    for x in xs: await P.mouse.move(box['x'] + box['width'] * x / 480, box['y'] + box['height'] * 0.9, steps=3)
    await P.mouse.up(); await P.wait_for_timeout(1300); return await P.evaluate(GAP), await P.evaluate("BK.cur.p.find(q=>q[0]===socket.id)[1]"), await P.evaluate("BK.tx")
async def main():
    async with async_playwright() as p:
        br = await p.chromium.launch(); A = await page(br, 30, '발판', 3)
        await A.click('[data-act=plaza]'); await A.wait_for_timeout(300); await A.click('#room-create'); await A.wait_for_timeout(900); code = await A.text_content('#room-code-show')
        await A.click('#bk-btn'); await A.wait_for_timeout(400); await A.click('#bk-start'); await A.wait_for_timeout(1000)
        for xs in ([240, 400, 430], [430, 60, 50], [50, 300, 333]):
            gap, sx, tx = await drag(A, xs); print('solo drag', xs, '-> server x', sx, 'target', round(tx), 'drawn-server gap', gap); assert gap <= 1 and abs(sx - tx) <= 1
        await A.screenshot(path='test/bk_paddle_solo.png'); await A.wait_for_selector('#end-modal:not(.hidden)', timeout=90000); await A.click('#end-ok'); await A.wait_for_timeout(500)
        B = await page(br, 31, '친구', 6); await B.click('[data-act=plaza]'); await B.wait_for_timeout(300); await B.fill('#room-code', code); await B.click('#room-join'); await B.wait_for_timeout(900)
        await A.click('#bk-btn'); await A.wait_for_timeout(300); await B.click('#bk-btn'); await A.wait_for_timeout(500); await A.click('#bk-start'); await A.wait_for_timeout(1200)
        for P, xs in ((A, [120, 230, 235]), (B, [300, 250, 245]), (B, [250, 470, 475])):
            gap, sx, tx = await drag(P, xs); print('2p drag', xs, '-> server x', sx, 'target', round(tx), 'gap', gap); assert gap <= 1 and abs(sx - tx) <= 1
        await A.screenshot(path='test/bk_paddle_2p.png'); errs = A.errs + B.errs; print('errors', errs); assert not errs; await br.close()
if __name__ == '__main__': asyncio.run(main())
