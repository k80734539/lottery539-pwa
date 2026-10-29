# 今彩539 記帳本（PWA）

手機優先的離線網頁 App：**選號紀錄、自動對獎、花費管理**。純 HTML/CSS/JS，無需建置。

> ⚠️ 開獎是彼此獨立的隨機事件，沒有任何選號方法能提高中獎機率。本專案不是預測工具，也不含 AI 預測。

## 功能
- 每期 3 組（純隨機／冷熱混合／覆蓋最大化各 1 組，順序打亂以便盲測），可手動輸入、一鍵複製
- 鎖定：每個開獎日台灣時間 20:30 截止；鎖定後不可修改，記錄時間與 SHA-256 指紋
- 自動對獎：中 2 顆 NT$50、3 顆 NT$300、4 顆 NT$20,000、5 顆頭獎（官方頭獎 NT$800 萬，統計以此名目計）；每組 NT$50
- 累計投入／獎金／淨損益／ROI；每月預算上限與停損警示
- 策略盲測：對照理論隨機基準（Bonferroni 校正的 z 檢定），並提供歷史回測；沒有顯著差異時會明說
- 歷史開獎瀏覽／搜尋（`data/history.json`，1,275 期來自舊專案 `lottery539-mobile` 的 `data/history.csv`）
- 資料存在 localStorage，可匯出／匯入；離線可用（service worker）、淺色／深色、safe-area

## 🏟️ 策略擂台（v2）

- 12 個策略（3 個基準＋9 個新策略），**每期每個策略自動選 4 碼**，命中以「4 碼對 5 個開獎號碼」計（與舊工具一致）。
- 策略：純隨機、冷熱混合、覆蓋最大化、近期熱號、遺漏回補、短期趨勢、共現配對、區間均衡、尾數分散、鄰號、加權隨機、多策略投票。
- **前向追蹤**：開 App 時（同步最新開獎之後）自動為「下一期」產生並鎖定所有策略的選號（時間戳＋指紋），開獎後自動結算、累積排行（期數、平均命中、95% 區間）。只有開獎日台灣時間 20:30 前鎖定的紀錄才計入；沒開 App 的日子不事後補。
- **歷史回測**：walk-forward，逐期只用該期以前的資料，全部 1,300+ 期（前 30 期暖身），含命中分布、z 檢定、卡方檢定與 Holm 多重比較校正。`node scripts/arena_backtest.mjs` 可在命令列重現。
- 選號以「開獎日＋策略」為種子，同資料必得同結果（可重現、可驗證）。
- 理論隨機 4 碼平均命中 = 20/39 ≈ 0.5128；每期開獎彼此獨立，沒有任何策略能提高命中機率，擂台只是誠實地把這件事量出來。

## 開獎資料更新
`.github/workflows/update-results.yml`在週一至週六台灣時間 21:35（及 22:30、23:45、隔日 08:10 備援）執行
`scripts/update_results.py`，向 `https://api.taiwanlottery.com/TLCAPIWeB/Lottery/Daily539Result`（官網內部端點，非正式公開 API）抓取，
更新 `data/results.json` 並 commit。App 啟動時讀取該檔；失敗會使用手機內已存資料，並可手動輸入開獎號碼。

## 開發 / 測試
```
python3 -m http.server 8000     # 然後開 http://localhost:8000
node tests/logic.test.mjs       # 邏輯單元測試
node tests/arena.test.mjs       # 擂台策略／結算／統計單元測試
BASE=http://localhost:PORT/ python3 tests/e2e_arena.py   # 擂台手機 E2E
BASE=http://localhost:PORT/ python3 tests/e2e.py   # 需 playwright + Chrome，手機尺寸 E2E
```

## 假設
見 App「設定 → 規則與假設」。實際投注截止時間、獎金與兌領請以台灣彩券公告為準。
