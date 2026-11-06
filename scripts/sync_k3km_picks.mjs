// 把追蹤資料（issue → 5 碼）複製成 App 可讀的 data/k3km8000_picks.json（保留已記錄的發文 id）
// Usage: node scripts/sync_k3km_picks.mjs [/workspace/track9800/picks.json] [issue=postId ...]
import fs from 'fs';
const src = process.argv[2] && !process.argv[2].includes('=') ? process.argv[2] : '/workspace/track9800/picks.json';
const out = new URL('../data/k3km8000_picks.json', import.meta.url);
let old = {}; try { old = JSON.parse(fs.readFileSync(out)); } catch {}
const picks = JSON.parse(fs.readFileSync(src));
const posts = { ...(old.posts || {}) };
for (const a of process.argv.slice(2)) { const m = a.match(/^(\d+)=(\d+)$/); if (m) posts[m[1]] = +m[2]; }
const sorted = Object.fromEntries(Object.entries(picks).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, [...v].sort((x, y) => x - y)]));
const j = { name: 'K3km8000', uid: 116496, forum: 'http://www.9800.com.tw/bbs/user.asp?uid=116496', updated: new Date().toISOString(), note: '期別 → 他報的今彩539 五個號碼（由小到大）；posts：期別 → 9800 論壇發文 id', picks: sorted, posts };
fs.writeFileSync(out, JSON.stringify(j) + '\n');
console.log('picks', Object.keys(sorted).length, 'latest', Object.keys(sorted).at(-1));
