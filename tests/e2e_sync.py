"""圖表＋同步端對端測試（GitHub API 以假伺服器模擬）。先 `node tests/make_seed.mjs > /tmp/seed.json`，並 `python3 -m http.server 50065`。"""
import json, os
from playwright.sync_api import sync_playwright
BASE = os.environ.get('BASE', 'http://localhost:50065/')
seed = open('/tmp/seed.json').read()
errors = []
def check(c, msg):
    print(('PASS ' if c else 'FAIL ') + msg)
    if not c: errors.append(msg)
gist = {'content': None, 'patches': 0}
def handle(route):
    req = route.request; u = req.url
    if req.headers.get('authorization') != 'Bearer ghp_' + 'x' * 36: return route.fulfill(status=401, body='{}')
    if req.method == 'GET' and '/gists?' in u:
        return route.fulfill(json=[] if gist['content'] is None else [{'id': 'g1', 'files': {'539-sync.json': {}}}])
    if req.method == 'GET': return route.fulfill(json={'id': 'g1', 'files': {'539-sync.json': {'content': gist['content'], 'truncated': False}}})
    body = json.loads(req.post_data); gist['content'] = body['files']['539-sync.json']['content']; gist['patches'] += 1
    if req.method == 'POST': check(body.get('public') is False, '建立的是私人 Gist')
    return route.fulfill(json={'id': 'g1'})
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True, args=['--no-sandbox'])
    def dev(state):
        ctx = b.new_context(viewport={'width': 393, 'height': 852}, device_scale_factor=3, is_mobile=True, has_touch=True, locale='zh-TW', timezone_id='Asia/Taipei', service_workers='block')
        ctx.route('https://api.github.com/**', handle)
        pg = ctx.new_page(); logs = []
        pg.on('pageerror', lambda e: logs.append(str(e)))
        pg.add_init_script(f"if(!localStorage.getItem('lottery539pwa:v1')) localStorage.setItem('lottery539pwa:v1', {json.dumps(state)})")
        pg.goto(BASE); pg.wait_for_timeout(1500); return pg, logs
    a, la = dev(seed)
    a.click('[data-tab=arena]'); a.click('[data-aseg=live]'); a.wait_for_timeout(300)
    check(a.locator('#view svg polyline').count() >= 12, '擂台即時排行有 12 條線')
    check('理論 0.5128' in a.inner_html('#view'), '有理論基準線')
    a.click('[data-act=chart-live][data-id=random]'); a.wait_for_timeout(200)
    check(a.locator('#view svg polyline').count() == 11, '可隱藏策略')
    a.click('[data-act=chart-live][data-id=__none]'); a.click('[data-act=chart-live][data-id=hot30]'); a.wait_for_timeout(200)
    check(a.locator('#view svg polyline').count() == 1, '全不選後只顯示一條')
    w = a.evaluate("document.querySelector('#view svg').getBoundingClientRect().width")
    check(w <= 393, f'圖表寬度符合手機 {w}')
    a.screenshot(path='/tmp/c1_live.png', full_page=True)
    a.click('[data-aseg=bt]'); a.click('[data-act=abt]'); a.wait_for_selector('text=歷史回測結果', timeout=60000)
    check(a.locator('#view svg polyline').count() == 12, '回測走勢 12 條線')
    a.click('[data-tab=lehe]'); a.wait_for_timeout(300)
    t = a.inner_text('#view')
    check('你的樂合彩累計損益' in t and '擂台策略模擬樂合損益' in t, '樂合兩張圖')
    a.screenshot(path='/tmp/c2_lehe.png', full_page=True)
    # 同步：裝置 A 連線
    a.click('[data-tab=settings]'); a.fill('#gtoken', 'ghp_' + 'x' * 36); a.click('[data-act=gconnect]'); a.wait_for_timeout(1500)
    check('已連線' in a.inner_text('#synccard'), '連線成功')
    check(gist['content'] and 'e1' in gist['content'], '資料已上傳')
    check('ghp_' not in gist['content'], '上傳內容不含 token')
    # 裝置 B（空白）連線 → 下載
    b2, lb = dev(json.dumps({'v': 1, 'batches': []}))
    b2.click('[data-tab=settings]'); b2.fill('#gtoken', 'ghp_' + 'x' * 36); b2.click('[data-act=gconnect]'); b2.wait_for_timeout(1500)
    st = b2.evaluate("JSON.parse(localStorage.getItem('lottery539pwa:v1'))")
    check(len(st['arena']['entries']) >= 3 and any(e['id'] == 'e1' for e in st['lehe']['entries']), 'B 下載到 A 的資料')
    # B 新增 → 自動上傳 → A 立即同步拿到
    b2.evaluate("""(async()=>{})()""")
    b2.click('[data-tab=lehe]'); b2.click('[data-act=lh-new]'); 
    for n in (3, 8): b2.click(f'#sheet button[data-n="{n}"]')
    b2.click('#sheet .primary:not([disabled])'); b2.wait_for_timeout(6000)
    a.click('[data-act=gsync]'); a.wait_for_timeout(1500)
    st = a.evaluate("JSON.parse(localStorage.getItem('lottery539pwa:v1'))")
    check(len(st['lehe']['entries']) == 2, f"A 收到 B 新增的紀錄（{len(st['lehe']['entries'])}）")
    check('上次成功同步' in a.inner_text('#synccard'), '顯示上次同步時間')
    a.screenshot(path='/tmp/c3_sync.png', full_page=True)
    # 錯誤 token
    a.click('[data-act=gdisconnect]'); a.click('#sheet .primary, #sheet .danger'); a.wait_for_timeout(300)
    a.fill('#gtoken', 'ghp_' + 'y' * 36); a.click('[data-act=gconnect]'); a.wait_for_timeout(1000)
    check('失敗' in a.inner_text('#synccard'), '錯誤 token 顯示失敗')
    check(a.evaluate("localStorage.getItem('lottery539pwa:v1').includes('ghp_')") is False, 'token 不在主資料（匯出檔）中')
    print('LOGS', la, lb)
    check(not la and not lb, '沒有頁面錯誤')
print('FAILED' if errors else 'ALL OK', errors)
