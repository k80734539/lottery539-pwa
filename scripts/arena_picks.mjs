// 伺服器端擂台選號：用與 App 相同的 js/arena.js，為「下一期」鎖定全部策略（含「你的策略」8 個）的 4 碼，追加到 data/arena_picks.json。
// 只產生下一期（不回補過去）；已存在的日期絕不覆寫；20:30 以後不產生當期。
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { makeEntry, entryCounts, appendOriginal } from '../js/arena.js';
import { nextDrawDate, buildDrawMap, drawsChrono } from '../js/logic.js';
const root = new URL('../', import.meta.url);
const read = f => JSON.parse(readFileSync(new URL(f, root), 'utf8'));
const out = new URL('data/arena_picks.json', root);
const hist = read('data/history.json').draws;
const res = read('data/results.json').draws;
const chrono = drawsChrono(buildDrawMap(hist, res, {}));
const file = existsSync(out) ? read('data/arena_picks.json') : { note: '伺服器每日自動鎖定的擂台選號（GitHub Actions，開獎日 20:30 前）。', entries: [] };
const now = new Date();
const date = process.argv[2] || nextDrawDate(now);
const old = file.entries.find(e => e.drawDate === date);
if (old) {
  // 已鎖定的 12 個策略不動；若還沒有「你的策略」且仍在 20:30 前，補上（另存補上時間與指紋）
  if (await appendOriginal(old, chrono, now)) {
    file.updated = now.toISOString();
    writeFileSync(out, JSON.stringify(file, null, 1) + '\n');
    console.log('appended original', date, JSON.stringify(Object.fromEntries(Object.entries(old.picks).filter(([k]) => k.startsWith('o_')))));
  } else console.log('exists', date);
  process.exit(0);
}
const e = await makeEntry(date, chrono, now);
if (!entryCounts(e)) { console.log('past cutoff, skip', date); process.exit(0); }
e.source = 'server';
file.entries.push(e);
file.entries.sort((a, b) => (a.drawDate < b.drawDate ? -1 : 1));
file.updated = now.toISOString();
writeFileSync(out, JSON.stringify(file, null, 1) + '\n');
console.log('added', date, JSON.stringify(e.picks));
