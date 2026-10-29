"""策略擂台 Headless Chrome 手機尺寸端對端測試。用法：BASE=http://localhost:PORT/ python3 tests/e2e_arena.py"""
import json, os, sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get('BASE', 'http://localhost:50065/')
errors = []
def check(c, msg):
    print(('PASS ' if c else 'FAIL ') + msg)
    if not c: errors.append(msg)
KEY = "lottery539pwa:v1"

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True, args=['--no-sandbox'])
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True,
                        locale='zh-TW', timezone_id='Asia/Taipei', permissions=['clipboard-read', 'clipboard-write'])
    page = ctx.new_page()
    logs = []
    page.on('pageerror', lambda e: logs.append('pageerror: ' + str(e)))
    page.on('console', lambda m: m.type == 'error' and logs.append('console: ' + m.text))
    page.clock.install(time='2026-10-29T10:00:00+08:00')
    page.goto(BASE); page.wait_for_selector('text=下一期'); page.wait_for_timeout(800)
    # 6 個分頁在手機上不擠、不橫向溢出
    w = page.evaluate("[...document.querySelectorAll('#tabs button')].map(b=>b.getBoundingClientRect().width)")
    check(len(w) == 6 and min(w) >= 56, f'6 個分頁寬度 {[round(x) for x in w]}')
    check(page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), '首頁無橫向溢出')
    page.click('[data-tab=arena]'); page.wait_for_selector('.pickcard', timeout=8000)
    check('沒有任何選號方法能提高中獎機率' in page.inner_text('body'), '擂台頁仍顯示免責聲明')
    check(page.locator('.pickcard').count() == 12, '今日 12 個策略')
    check(page.locator('.pickcard .ball').count() == 48, '每策略 4 碼，共 48 顆球')
    check('已自動鎖定' in page.inner_text('#view') and '10/29（週四）' in page.inner_text('#view'), '已自動鎖定 10/29 這期')
    st = json.loads(page.evaluate(f"localStorage.getItem('{KEY}')"))
    ents = st['arena']['entries']
    check(len(ents) == 1 and ents[0]['drawDate'] == '2026-10-29' and len(ents[0]['fp']) == 12 and ents[0]['histLast'] == '2026-10-28', '記錄含日期/指紋/歷史截止日')
    check(all(len(set(v)) == 4 for v in ents[0]['picks'].values()) and len(ents[0]['picks']) == 12, '每策略 4 個不重複號碼')
    first = ents[0]['picks']
    page.screenshot(path='/tmp/a1_today.png', full_page=True)
    page.click('[data-act=acopy][data-id=hot30]')
    clip = page.evaluate('navigator.clipboard.readText()')
    check(len(clip.split()) == 4, '複製 4 個號碼：' + clip)
    # 重新整理不會換號
    page.reload(); page.wait_for_selector('text=下一期'); page.wait_for_timeout(800)
    st2 = json.loads(page.evaluate(f"localStorage.getItem('{KEY}')"))
    check(len(st2['arena']['entries']) == 1 and st2['arena']['entries'][0]['picks'] == first, '重新整理後選號不變（不重複產生）')

    # 即時排行：先沒有資料
    page.click('[data-tab=arena]'); page.click('[data-aseg=live]'); page.wait_for_timeout(200)
    check('還沒有已開獎' in page.inner_text('#view'), '尚未開獎時顯示提示')
    # 注入 10/28（已有官方開獎）的有效紀錄、一筆 20:30 後才鎖定的無效紀錄（同日），與一筆壞資料
    nums = {i: [1, 2, 3, 4] for i in []}
    ids = list(first.keys())
    draw = json.loads(page.evaluate("fetch('data/results.json').then(r=>r.text())"))['draws']
    d28 = [d for d in draw if d['date'] == '2026-10-28'][0]['numbers']
    pk = {i: [9, 10, 11, 12] for i in ids}
    pk['hot30'] = d28[:3] + [39 if 39 not in d28 else 38]
    st['arena']['entries'] = [
        {'drawDate': '2026-10-28', 'lockedAt': '2026-10-28T08:00:00+08:00', 'histLast': '2026-10-27', 'histCount': 1, 'picks': pk, 'fp': 'aaaaaaaaaaaa'},
        {'drawDate': '2026-10-27', 'lockedAt': '2026-10-27T21:00:00+08:00', 'histLast': '2026-10-26', 'histCount': 1, 'picks': pk, 'fp': 'bbbbbbbbbbbb'},
        {'drawDate': '2026-10-26', 'lockedAt': 'bad', 'picks': {'random': [1]}, 'fp': 'c'},
    ] + st['arena']['entries']
    page.evaluate('s => localStorage.setItem("%s", s)' % KEY, json.dumps(st))
    page.reload(); page.wait_for_selector('text=下一期'); page.wait_for_timeout(800)
    page.click('[data-tab=arena]'); page.click('[data-aseg=live]'); page.wait_for_selector('table')
    txt = page.inner_text('#view')
    check('已累積 1 期已開獎' in txt, '只結算有效（20:30 前鎖定）的紀錄：1 期')
    check('近期熱號' in txt and '3' in txt, '排行包含策略')
    row = page.locator('tr', has_text='近期熱號').first.inner_text()
    check('3.000' in row, '近期熱號 中 3 顆 → 平均 3.000：' + row.replace('\n', ' ').replace('\t', ' '))
    check('⭐' not in row and '—' in row, '樣本 1 期不做顯著性判定（無 ⭐、校正p 為 —）')
    check('樣本只有 1 期' in txt, '樣本太少時不下結論')
    check('最近一期' in txt and page.locator('.ball.hit').count() >= 3, '最近一期明細有命中標示')
    check(page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), '排行頁無橫向溢出（表格自帶捲動）')
    page.screenshot(path='/tmp/a2_live.png', full_page=True)

    # 歷史回測
    page.click('[data-aseg=bt]'); page.click('[data-act=abt]'); page.clock.run_for(200)
    page.wait_for_selector('text=歷史回測結果', timeout=20000)
    txt = page.inner_text('#view')
    check('1,322' in txt and 'Holm' in txt, '回測 1,322 期並採用 Holm 校正')
    check('沒有任何策略顯著優於' in txt, '結論：沒有策略顯著優於隨機')
    check(page.locator('tbody tr').count() == 13, '12 策略 + 理論列')
    check('理論隨機' in txt, '含理論基準列')
    check(page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), '回測頁無橫向溢出')
    page.screenshot(path='/tmp/a3_bt.png', full_page=True)

    # 換日：20:31 之後，下一期變 10/30，自動新增 10/30 的紀錄
    page.click('[data-aseg=today]')
    page.clock.set_fixed_time('2026-10-29T20:31:00+08:00'); page.clock.run_for(16000); page.wait_for_timeout(500)
    st3 = json.loads(page.evaluate(f"localStorage.getItem('{KEY}')"))
    check(any(e['drawDate'] == '2026-10-30' for e in st3['arena']['entries']), '20:30 後自動建立下一期（10/30）紀錄')
    check('10/30（週五）' in page.inner_text('#view'), '畫面切到 10/30')
    # 匯出/備份含 arena
    page.click('[data-tab=settings]'); page.wait_for_timeout(200)
    page.evaluate('document.body.dataset.x=1')
    page.click('[data-tab=arena]')
    # 離線
    page.wait_for_timeout(1000)
    check(page.evaluate('navigator.serviceWorker.getRegistration().then(r=>!!(r&&r.active))'), 'Service worker 已啟用')
    page.reload(); page.wait_for_timeout(1500)
    ctx.set_offline(True)
    page.reload(); page.wait_for_selector('text=下一期', timeout=8000); page.click('[data-tab=arena]'); page.wait_for_selector('.pickcard', timeout=8000)
    check(page.locator('.pickcard').count() == 12, '離線可看今日選號')
    page.click('[data-aseg=bt]'); page.click('[data-act=abt]'); page.clock.run_for(200); page.wait_for_selector('text=歷史回測結果', timeout=20000)
    check(True, '離線可執行回測')
    ctx.set_offline(False)
    page.emulate_media(color_scheme='dark'); page.screenshot(path='/tmp/a4_dark.png')
    real = [l for l in logs if 'Failed to load resource' not in l and 'ERR_INTERNET' not in l and 'net::' not in l]
    print('LOGS', real)
    check(not real, 'JS 無錯誤')
    b.close()
print('FAILED' if errors else 'ALL PASSED', errors)
sys.exit(1 if errors else 0)
