# v1.5 뽑기 + new head accessories screenshots. Usage: python3 test/browser_gacha.py [URL]
import asyncio, json, sys, time
from playwright.async_api import async_playwright
sys.path.insert(0, 'test'); from browser_outfit import save
URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:3456'
async def ctxpage(br, tag, sv):
    ctx = await br.new_context(viewport={'width': 520, 'height': 900})
    await ctx.add_init_script(f"localStorage.tg_pid='ga-{tag}-{int(time.time()*1000)}';localStorage.tg_nick={json.dumps(sv['nickname'])};localStorage.tg_save={json.dumps(json.dumps(sv))}")
    pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); pg.errs = errs
    await pg.goto(URL); await pg.wait_for_timeout(1500); return ctx, pg
async def main():
    async with async_playwright() as p:
        br = await p.chromium.launch()
        ctx, pg = await ctxpage(br, 'shop', save('뽑기', 'adult', 4, coins=900))
        await pg.click('[data-act=wardrobe]'); await pg.click('#w-tabs [data-tab=gacha]'); await pg.wait_for_timeout(400)
        await pg.evaluate("document.querySelector('#gacha-btn').scrollIntoView({block:'end'})"); await pg.screenshot(path='test/gacha_shop.png')
        # force a 전설 pull for the reveal shot
        await pg.evaluate("(()=>{const r=Math.random;let n=0;Math.random=()=>(n++<2?0.01:r());})()")
        await pg.click('#gacha-btn'); await pg.wait_for_timeout(500); await pg.screenshot(path='test/gacha_shake.png')
        await pg.wait_for_timeout(1700); await pg.screenshot(path='test/gacha_reveal_legend.png')
        assert await pg.evaluate('S.acc') == 'catears'
        await pg.evaluate("(()=>{let n=0;Math.random=()=>(n++<1?0.2:0.0)})()"); await pg.click('#g-again'); await pg.wait_for_timeout(2300)
        await pg.screenshot(path='test/gacha_reveal_rare.png')
        await pg.evaluate("Math.random=()=>0.9"); await pg.click('#g-again'); await pg.wait_for_timeout(2300)
        await pg.screenshot(path='test/gacha_reveal_common.png'); await pg.click('#g-ok')
        assert not pg.errs, pg.errs; await ctx.close()
        for acc, ch, st, hair, out in [('ribbon', 3, 'child', 'pigtail', 'hanbok'), ('flower', 2, 'adult', 'bob', 'dress'), ('catears', 6, 'adult', 'afro', 'hoodie')]:
            ctx, pg = await ctxpage(br, acc, save('장식', st, ch, owned=[f'acc_{acc}', f'hair_{hair}', f'outfit_{out}'], hair=hair, outfit=out, acc=acc))
            await pg.wait_for_timeout(500); await pg.screenshot(path=f'test/acc_{acc}_home.png', clip=dict(x=0, y=0, width=520, height=520))
            await pg.evaluate("openWardrobe(); wTab='acc'; renderWardrobe()"); await pg.wait_for_timeout(600)
            await pg.screenshot(path=f'test/acc_{acc}_wardrobe.png'); assert await pg.evaluate('S.acc') == acc; assert not pg.errs, pg.errs; await ctx.close()
        await br.close(); print('gacha browser OK')
asyncio.run(main())
