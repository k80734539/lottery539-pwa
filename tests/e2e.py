"""Headless Chrome 手機尺寸端對端測試。先 `python3 -m http.server 50065` 於專案根目錄。"""
import json, sys
from playwright.sync_api import sync_playwright

import os
BASE = os.environ.get('BASE', 'http://localhost:50065/')
errors = []
def check(c, msg):
    print(('PASS ' if c else 'FAIL ') + msg)
    if not c: errors.append(msg)

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True, args=['--no-sandbox'])
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True,
                        locale='zh-TW', timezone_id='Asia/Taipei', permissions=['clipboard-read', 'clipboard-write'])
    page = ctx.new_page()
    logs = []
    page.on('pageerror', lambda e: logs.append('pageerror: ' + str(e)))
    page.on('console', lambda m: m.type == 'error' and logs.append('console: ' + m.text))
    page.clock.install(time='2026-10-29T10:00:00+08:00')
    page.goto(BASE)
    page.wait_for_selector('text=下一期')
    page.wait_for_timeout(800)
    check('沒有任何選號方法能提高中獎機率' in page.inner_text('body') or '沒有任何選號方法' in page.inner_text('body'), '免責聲明顯示')
    check('10/29（週四）' in page.inner_text('body'), '下一期為 10/29（週四）')
    page.screenshot(path='/tmp/s1_today.png')
    # 產生
    page.click('[data-act=gen]'); page.wait_for_selector('.setrow')
    check(page.locator('.setrow').count() == 3, '產生 3 組')
    check('盲測' in page.inner_text('#view'), '盲測隱藏策略名稱')
    check(page.locator('.setrow .ball').count() == 15, '15 顆球')
    page.click('[data-act=copy][data-i="0"]')
    clip = page.evaluate('navigator.clipboard.readText()')
    check(len(clip.split()) == 5, f'複製 5 個號碼：{clip}')
    page.click('[data-act=reroll][data-i="1"]')
    # 手動修改：移除一組後新增手動
    page.click('[data-act=del][data-i="2"]'); check(page.locator('.setrow').count() == 2, '移除一組')
    page.click('[data-act=manual-new]')
    for n in (1, 2, 3, 4, 5): page.click(f'.picker button[data-n="{n}"]')
    page.click('.picker button[data-n="6"]'); page.click('.picker button[data-n="6"]')
    page.click('#pk-save'); check(page.locator('.setrow').count() == 3, '手動新增組')
    page.screenshot(path='/tmp/s2_gen.png')
    # 鎖定
    page.click('[data-act=lock]'); page.wait_for_selector('text=已鎖定，不可再修改', timeout=3000) if False else page.wait_for_timeout(500)
    check('不可再修改' in page.inner_text('#view'), '鎖定成功')
    check(page.locator('[data-act=reroll]').count() == 0, '鎖定後不可編輯')
    st = json.loads(page.evaluate("localStorage.getItem('lottery539pwa:v1')"))
    check(len(st['batches']) == 1 and st['batches'][0]['lockedAt'] and len(st['batches'][0]['fp']) == 12, '儲存含鎖定與指紋')
    page.screenshot(path='/tmp/s3_locked.png')

    # 20:30 之後下一期變 10/30
    page.clock.set_fixed_time('2026-10-29T20:31:00+08:00'); page.wait_for_timeout(100)
    page.clock.run_for(16000); page.wait_for_timeout(300)
    check('10/30（週五）' in page.inner_text('#view'), '20:30 後下一期為 10/30')

    # 注入已鎖定歷史批次測試對獎 / 預算
    page.clock.set_fixed_time('2026-10-29T10:00:00+08:00')
    draw = [6, 11, 13, 19, 35]
    inject = {'drawDate': '2026-10-28', 'createdAt': '2026-10-28T08:00:00+08:00', 'lockedAt': '2026-10-28T08:01:00+08:00', 'fp': 'abcdef012345',
              'sets': [{'numbers': draw, 'strategy': 'random', 'bought': True}, {'numbers': [6, 11, 13, 20, 21], 'strategy': 'hotcold', 'bought': True}, {'numbers': [6, 11, 1, 2, 3], 'strategy': 'coverage', 'bought': True}]}
    st['batches'] = [inject]; st['settings']['cap'] = 300
    page.evaluate('s => localStorage.setItem("lottery539pwa:v1", s)', json.dumps(st))
    page.reload(); page.wait_for_selector('text=下一期'); page.wait_for_timeout(600)
    page.click('[data-tab=records]'); page.wait_for_timeout(200)
    txt = page.inner_text('#view')
    check('已對獎' in txt and '頭獎' in txt and 'NT$300' in txt and 'NT$50' in txt, '對獎：頭獎/300/50')
    check('冷熱混合' in txt, '結算後揭曉策略')
    page.screenshot(path='/tmp/s4_records.png', full_page=True)
    page.click('[data-tab=stats]'); page.wait_for_timeout(200)
    txt = page.inner_text('#view'); check('NT$150' in txt, '累計投入 NT$150')
    page.screenshot(path='/tmp/s5_stats.png', full_page=True)
    page.click('[data-act=bt]'); page.clock.run_for(200); page.wait_for_function("document.querySelectorAll('table').length===2", timeout=15000)
    txt = page.inner_text('#view'); check('沒有發現任何策略與純隨機有顯著差異' in txt or '偶然' in txt, '回測結論顯示：' + ('無顯著' if '沒有發現' in txt else '有差異'))
    page.screenshot(path='/tmp/s6_bt.png', full_page=True)
    # 預算超過：cap=300，已承諾 150+ 本期 150 =300 ->再鎖會超過? 今日產生 3 組 = 150 -> total 300 not over; 設 cap 200
    page.click('[data-tab=settings]'); page.fill('#cap', '200'); page.dispatch_event('#cap', 'change')
    page.click('[data-tab=today]'); page.wait_for_timeout(200)
    page.click('[data-act=gen]'); page.click('[data-act=lock]'); page.wait_for_timeout(300)
    check('超過每月預算' in page.inner_text('#sheet'), '超過預算時要求再確認')
    page.screenshot(path='/tmp/s7_budget.png')
    page.click('#cs-no'); check('不可再修改' not in page.inner_text('#view'), '取消後未鎖定')
    # 開獎頁
    page.click('[data-tab=draws]'); page.wait_for_timeout(300)
    check('115261' in page.inner_text('#view'), '最新開獎 115261 顯示')
    page.fill('#dq', '06 11 13'); page.wait_for_timeout(200)
    check('找到 ' in page.inner_text('#view'), '搜尋可用')
    page.fill('#dq', '')
    page.click('[data-act=manual-result]')
    for n in (1, 2, 3, 4, 5): page.click(f'.picker button[data-n="{n}"]')
    page.fill('#pk-date', '2026-10-29'); page.click('#pk-save'); page.wait_for_timeout(300)
    check('手動' in page.inner_text('#view'), '手動輸入開獎')
    page.screenshot(path='/tmp/s8_draws.png', full_page=True)
    page.click('[data-tab=settings]'); page.screenshot(path='/tmp/s9_settings.png', full_page=True)

    # 離線
    page.wait_for_timeout(1000)
    reg = page.evaluate('navigator.serviceWorker.getRegistration().then(r=>!!(r&&r.active))')
    check(reg, 'Service worker 已啟用')
    page.reload(); page.wait_for_timeout(1500)
    ctx.set_offline(True)
    page.reload(); page.wait_for_selector('text=下一期', timeout=8000); page.wait_for_timeout(800)
    check('下一期' in page.inner_text('#view'), '離線可開啟')
    page.click('[data-tab=draws]'); page.click('[data-act=sync]'); page.wait_for_timeout(800)
    check('無法取得最新開獎' in page.inner_text('#view'), '離線同步失敗有優雅提示')
    check('115261' in page.inner_text('#view'), '離線仍有歷史資料')
    # 暗色
    ctx.set_offline(False)
    page.emulate_media(color_scheme='dark'); page.click('[data-tab=today]'); page.screenshot(path='/tmp/s10_dark.png')
    print('LOGS', [l for l in logs if 'Failed to load resource' not in l and 'ERR_INTERNET_DISCONNECTED' not in l])
    real = [l for l in logs if 'Failed to load resource' not in l and 'ERR_INTERNET' not in l and 'net::' not in l]
    check(not real, 'JS 無錯誤')
    b.close()
print('FAILED' if errors else 'ALL PASSED', errors)
sys.exit(1 if errors else 0)
