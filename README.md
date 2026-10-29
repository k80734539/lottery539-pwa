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

## 開獎資料更新
`.github/workflows/update-results.yml`（目前放在 `workflow-template/update-results.yml`，因為推送用的 token 沒有 `workflow` 權限，需複製到 `.github/workflows/` 才會生效）在週一至週六台灣時間 21:35（及 22:30、23:45、隔日 08:10 備援）執行
`scripts/update_results.py`，向 `https://api.taiwanlottery.com/TLCAPIWeB/Lottery/Daily539Result`（官網內部端點，非正式公開 API）抓取，
更新 `data/results.json` 並 commit。App 啟動時讀取該檔；失敗會使用手機內已存資料，並可手動輸入開獎號碼。

## 開發 / 測試
```
python3 -m http.server 8000     # 然後開 http://localhost:8000
node tests/logic.test.mjs       # 邏輯單元測試
python3 tests/e2e.py            # 需 playwright + Chrome，手機尺寸 E2E（先改 BASE 埠號）
```

## 假設
見 App「設定 → 規則與假設」。實際投注截止時間、獎金與兌領請以台灣彩券公告為準。
