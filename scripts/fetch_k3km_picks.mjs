// GitHub Actions 用：去 9800 論壇抓 K3km8000 最新的今彩539報號，合併進 data/k3km8000_picks.json。
// 抓不到（網站錯誤、逾時、格式變了）就保留舊檔，exit 0，不讓 workflow 變紅。
// Usage: node scripts/fetch_k3km_picks.mjs [--posts 3] [--dry]
//        node scripts/fetch_k3km_picks.mjs --parse-post file.html   （離線測試解析）
import fs from 'fs';

const UID = 116496;
const BASE = 'http://www.9800.com.tw/bbs/';
const LIST = `${BASE}user.asp?uid=${UID}`;
const OUT = new URL('../data/k3km8000_picks.json', import.meta.url);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const sleep = ms => new Promise(r => setTimeout(r, ms));

export function decodeBody(buf, contentType = '') {
  const bytes = new Uint8Array(buf);
  const head = new TextDecoder('latin1').decode(bytes.slice(0, 4096));
  let cs = (contentType.match(/charset=([\w-]+)/i) || head.match(/charset=["']?([\w-]+)/i) || [])[1] || 'utf-8';
  cs = cs.toLowerCase();
  if (cs === 'big5-hkscs' || cs === 'x-big5') cs = 'big5';
  try { return new TextDecoder(cs).decode(bytes); } catch { return new TextDecoder('utf-8').decode(bytes); }
}

async function get(url, { tries = 4, timeout = 20000 } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'zh-TW,zh;q=0.9', 'Referer': LIST }, signal: AbortSignal.timeout(timeout), redirect: 'follow' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const html = decodeBody(await r.arrayBuffer(), r.headers.get('content-type') || '');
      if (html.length < 200) throw new Error('內容太短');
      return html;
    } catch (e) { last = e; console.log(`  第 ${i + 1} 次失敗：${url} → ${e.message}`); await sleep(3000 * (i + 1)); }
  }
  throw last;
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
export function htmlText(h) {
  return h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, x) => String.fromCodePoint(parseInt(x, 16)))
    .replace(/&#(\d+);/g, (_, x) => String.fromCodePoint(+x))
    .replace(/&(\w+);/g, (m, k) => ENT[k.toLowerCase()] ?? m)
    .replace(/[\s\u3000]+/g, ' ');
}

const nums5 = s => { const a = (s.match(/\d{1,2}/g) || []).map(Number); return a.length === 5 && new Set(a).size === 5 && a.every(n => n >= 1 && n <= 39) ? a.sort((x, y) => x - y) : null; };

/** 他的文章列表 → [{id, title}]（新到舊）；只留今彩539報號文（⭐️MM/DD⭐️5⭐️3⭐️9⭐️） */
export function parseList(html) {
  const out = [], seen = new Set();
  const re = /<a\b[^>]*view\.asp\?id=(\d+)[^>]*>([\s\S]*?)<\/a>/gi; let m;
  while ((m = re.exec(html))) {
    const id = +m[1], title = htmlText(m[2]).trim();
    if (seen.has(id)) continue;
    const key = title.replace(/[^\d/]/g, '');
    if (/^\d{1,2}\/\d{1,2}539/.test(key)) { seen.add(id); out.push({ id, title }); }
  }
  if (!out.length) { // 標題編碼怪掉時：退而求其次，所有文章連結都拿來，靠內文判斷
    for (const x of html.matchAll(/view\.asp\?id=(\d+)/gi)) if (!seen.has(+x[1])) { seen.add(+x[1]); out.push({ id: +x[1], title: '' }); }
  }
  return out.sort((a, b) => b.id - a.id);
}

/** 單篇發文 → {issue, picks, history:[{issue,picks}]}；不是他的 539 報號就回 null */
export function parsePost(html) {
  const t = htmlText(html);
  if (!/k3km8000/i.test(t)) return null;
  if (!/539/.test(t)) return null;
  const m = t.match(/\((\d{6})\s*期\)\s*推薦獎號\s*[：:]?\s*((?:\d{1,2}\s*[,，、 ]\s*){4}\d{1,2})/);
  if (!m) return null;
  const picks = nums5(m[2]); if (!picks) return null;
  const history = [];
  for (const h of t.matchAll(/(\d{6})\s*期\s*\|?\s*((?:\d{1,2}\s*[,，、]\s*){4}\d{1,2})/g)) {
    const p = nums5(h[2]); if (p && h[1] !== m[1]) history.push({ issue: h[1], picks: p });
  }
  return { issue: m[1], picks, history };
}

/** 合併：新發文的主號碼可以覆蓋（同期有更新的發文時）；發文裡的近期成績表只補缺的期別 */
export function merge(old, found) {
  const picks = { ...(old.picks || {}) }, posts = { ...(old.posts || {}) }, added = [];
  const same = (a, b) => a && b && a.join() === b.join();
  for (const f of [...found].sort((a, b) => a.id - b.id)) {
    if (!picks[f.issue] || (!same(picks[f.issue], f.picks) && (!posts[f.issue] || f.id >= posts[f.issue]))) { picks[f.issue] = f.picks; added.push(f.issue); }
    if (!posts[f.issue] || f.id > posts[f.issue]) posts[f.issue] = f.id;
    for (const h of f.history) if (!picks[h.issue]) { picks[h.issue] = h.picks; added.push(h.issue); }
  }
  const sorted = Object.fromEntries(Object.entries(picks).sort(([a], [b]) => a.localeCompare(b)));
  const sp = Object.fromEntries(Object.entries(posts).sort(([a], [b]) => a.localeCompare(b)));
  const changed = JSON.stringify(sorted) !== JSON.stringify(old.picks || {}) || JSON.stringify(sp) !== JSON.stringify(old.posts || {});
  return { changed, added: [...new Set(added)].sort(), data: { ...old, picks: sorted, posts: sp } };
}

async function main() {
  const args = process.argv.slice(2);
  const pi = args.indexOf('--parse-post');
  if (pi >= 0) { console.log(JSON.stringify(parsePost(fs.readFileSync(args[pi + 1], 'utf8')))); return; }
  const nPosts = +(args[args.indexOf('--posts') + 1] || 0) || 3;
  const dry = args.includes('--dry');
  const old = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  console.log(`讀取文章列表：${LIST}`);
  const list = parseList(await get(LIST));
  console.log(`找到 ${list.length} 篇 539 報號文，看最新 ${nPosts} 篇`);
  if (!list.length) throw new Error('列表裡找不到報號文（網頁格式可能改了）');
  const found = [];
  for (const p of list.slice(0, nPosts)) {
    try {
      const r = parsePost(await get(`${BASE}view.asp?id=${p.id}`));
      if (r) { found.push({ id: p.id, ...r }); console.log(`  id=${p.id} ${p.title} → 第 ${r.issue} 期 ${r.picks.join(',')}`); }
      else console.log(`  id=${p.id} ${p.title} → 解析不到報號，略過`);
    } catch (e) { console.log(`  id=${p.id} 讀不到：${e.message}`); }
    await sleep(1500);
  }
  if (!found.length) throw new Error('一篇都沒解析成功');
  const { changed, added, data } = merge(old, found);
  if (!changed) { console.log('沒有新資料，檔案不變。'); return; }
  data.updated = new Date().toISOString();
  if (!dry) fs.writeFileSync(OUT, JSON.stringify(data) + '\n');
  console.log(`已更新${dry ? '（dry run，未寫檔）' : ''}：新增/修改期別 ${added.join(', ') || '（只更新發文 id）'}；最新 ${Object.keys(data.picks).at(-1)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => { console.log(`::warning::K3km8000 報號這次沒抓到，保留舊資料：${e.message}`); process.exitCode = 0; });
}
