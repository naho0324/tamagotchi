# v1.7 character creator: new game, custom body, edit in 꾸미기, outfit on custom pet, plaza. Usage: python3 test/browser_creator.py [URL]
import asyncio, json, sys, time
from playwright.async_api import async_playwright
URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:3456'
async def main():
    async with async_playwright() as p:
        br = await p.chromium.launch(); ctx = await br.new_context(viewport={'width': 520, 'height': 1000})
        await ctx.add_init_script(f"if(!localStorage.tg_pid){{localStorage.tg_pid='cr-{int(time.time()*1000)}';localStorage.tg_nick='만들기'}}")
        pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); await pg.goto(URL); await pg.wait_for_timeout(1500)
        assert await pg.is_visible('#creator-modal'), 'creator shown on new game'
        await pg.screenshot(path='test/creator_new.png', full_page=True)
        await pg.click('[data-opt="body:custom"]'); await pg.click('[data-opt="eyes:x2"]'); await pg.click('[data-opt="color:peach"]'); await pg.click('[data-opt="trait:5"]')
        await pg.fill('#cr-name', '몽실이'); await pg.wait_for_timeout(500); await pg.screenshot(path='test/creator_custom.png', full_page=True)
        await pg.click('#cr-ok'); await pg.wait_for_timeout(800)
        assert await pg.evaluate('[S.pet.char, S.pet.custom.eyes, S.pet.custom.color, S.pet.name]') == [5, 'x2', 'peach', '몽실이']
        # grow up, wear outfit + accessory
        await pg.evaluate("S.pet.stage='adult'; S.coins=5000; S.owned.push('hair_twin','outfit_dress','acc_crown'); S.hair='twin'; S.outfit='dress'; S.acc='crown'; save(); renderHud()")
        await pg.wait_for_timeout(1200); await pg.screenshot(path='test/custom_outfit_acc.png')
        await pg.evaluate("S.hair='base'; S.outfit='base'; S.acc='none'; save(); renderHud()"); await pg.wait_for_timeout(1000); await pg.screenshot(path='test/custom_home.png')
        # edit later from 꾸미기: trait locked after hatch
        await pg.click('[data-act=wardrobe]'); await pg.click('#w-tabs [data-tab=char]'); await pg.click('#w-edit-char'); await pg.wait_for_timeout(300)
        assert await pg.is_disabled('[data-opt="trait:1"]')
        await pg.click('[data-opt="eyes:x3"]'); await pg.click('[data-opt="color:sky"]'); await pg.fill('#cr-name', '구름'); await pg.wait_for_timeout(500)
        await pg.screenshot(path='test/creator_edit.png', full_page=True); await pg.click('#cr-ok'); await pg.wait_for_timeout(500)
        assert await pg.evaluate('[S.pet.char, S.pet.custom.eyes, S.pet.custom.color, S.pet.name]') == [5, 'x3', 'sky', '구름']
        await pg.evaluate("closeModal('wardrobe-modal')"); await pg.click('[data-act=plaza]'); await pg.wait_for_timeout(800); await pg.click('#room-create'); await pg.wait_for_timeout(2500); await pg.screenshot(path='test/custom_plaza.png')
        assert not errs, errs; await br.close(); print('creator browser OK')
asyncio.run(main())
