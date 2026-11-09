// 伺服器端樂合建議②（比較常中）：用與 App 相同的 js/suggest.js，為「下一期」鎖定二合×2＋三合×2，寫入 data/lehe_picks.json。
// 只產生下一期（不回補過去）；已存在的日期絕不覆寫；20:30 以後不產生當期；只用目標日之前已開完的獎號。
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { suggest, buildSugB } from '../js/suggest.js';
import { nextDrawDate, buildDrawMap, drawsChrono, cutoffPassed, fingerprint } from '../js/logic.js';

const root = new URL('../', import.meta.url);
const read = f => JSON.parse(readFileSync(new URL(f, root), 'utf8'));
const out = new URL('data/lehe_picks.json', root);
const hist = read('data/history.json').draws;
const res = read('data/results.json').draws;
const chrono = drawsChrono(buildDrawMap(hist, res, {}));
const file = existsSync(out) ? read('data/lehe_picks.json') : {
  note: '伺服器每日自動鎖定的樂合建議②比較常中（二合×2＋三合×2；GitHub Actions，開獎日 20:30 前）。bought 預設 false，不計花費。',
  template: 'sug_b',
  entries: [],
};
const now = new Date();
const date = process.argv[2] || nextDrawDate(now);
if (file.entries.some(e => e.drawDate === date)) {
  console.log('exists', date);
  process.exit(0);
}
if (cutoffPassed(date, now)) {
  console.log('past cutoff, skip', date);
  process.exit(0);
}
const past = chrono.filter(d => d.date < date);
if (past.length < 30) {
  console.log('insufficient history', past.length);
  process.exit(0);
}
const g = suggest(past.map(d => d.numbers), date);
const sets = buildSugB(g, date);
if (!sets) {
  console.log('suggest failed', date);
  process.exit(0);
}
const lockedAt = now.toISOString();
const entry = {
  drawDate: date,
  lockedAt,
  template: 'sug_b',
  histLast: past.at(-1)?.date || null,
  histCount: past.length,
  fp: await fingerprint(date, sets, lockedAt),
  sets,
};
file.entries.push(entry);
file.entries.sort((a, b) => (a.drawDate < b.drawDate ? -1 : 1));
file.updated = lockedAt;
writeFileSync(out, JSON.stringify(file, null, 1) + '\n');
console.log('added', date, JSON.stringify(sets.map(s => ({ numbers: s.numbers, plays: s.plays, mult: s.mult }))));
