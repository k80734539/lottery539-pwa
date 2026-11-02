// 全新樂合方法研究：1,668 期 walk-forward；前 2/3 選參數，後 1/3 樣本外；每方法 1000 組同結構隨機基準。
// 用法：node scripts/lehe_novel.mjs
import fs from 'node:fs';
import * as L from '../js/logic.js';
const rd = f => JSON.parse(fs.readFileSync(new URL('../data/' + f, import.meta.url)));
const chrono = L.drawsChrono(L.buildDrawMap([...rd('history_extra.json').draws, ...rd('history.json').draws], rd('results.json').draws, {}));
const nums = chrono.map(d => d.numbers), dates = chrono.map(d => d.date), wd = dates.map(d => new Date(d + 'T12:00:00Z').getUTCDay());
const PRICE = 25, PRIZE = { 2: 1125, 3: 11250, 4: 212500 }, ALL = Array.from({ length: 39 }, (_, k) => k + 1);
const i0 = dates.findIndex(d => d >= '2021-07-12'), N = nums.length, T = N - i0, split = Math.round(T * 2 / 3);
const sub = (a, k) => { const o = []; (function r(s, c) { if (c.length === k) return o.push(c.slice()); for (let i = s; i < a.length; i++) { c.push(a[i]); r(i + 1, c); c.pop(); } })(0, []); return o; };
const pk = (a, b) => a < b ? a * 40 + b : b * 40 + a;
const topK = (sc, k, pool = ALL) => pool.slice().sort((a, b) => sc[b] - sc[a] || a - b).slice(0, k);
// ---- 增量特徵（每期只用過去）----
const inc = { cnt: new Array(40).fill(0), last: new Array(40).fill(-1), gapSum: new Array(40).fill(0), gapN: new Array(40).fill(0),
  rep: new Array(40).fill(0), repN: new Array(40).fill(0), trans: Array.from({ length: 40 }, () => new Array(40).fill(0)), transN: new Array(40).fill(0),
  pc: new Map(), pLast: new Map(), pGap: new Map(), wdc: Array.from({ length: 7 }, () => new Array(40).fill(0)), wdn: new Array(7).fill(0) };
function push(i) { const d = nums[i], prev = i > 0 ? nums[i - 1] : null, s = new Set(d);
  if (prev) for (const x of prev) { inc.repN[x]++; if (s.has(x)) inc.rep[x]++; inc.transN[x]++; for (const y of d) inc.trans[x][y]++; }
  for (const x of d) { if (inc.last[x] >= 0) { inc.gapSum[x] += i - inc.last[x]; inc.gapN[x]++; } inc.last[x] = i; inc.cnt[x]++; inc.wdc[wd[i]][x]++; }
  inc.wdn[wd[i]]++;
  for (const [a, b] of sub(d, 2)) { const k = pk(a, b); inc.pc.set(k, (inc.pc.get(k) || 0) + 1); if (inc.pLast.has(k)) { const g = inc.pGap.get(k) || [0, 0]; g[0] += i - inc.pLast.get(k); g[1]++; inc.pGap.set(k, g); } inc.pLast.set(k, i); } }
const freq = (i, w) => { const c = new Array(40).fill(0); for (let k = Math.max(0, i - w); k < i; k++) for (const x of nums[k]) c[x]++; return c; };
const ALLP = sub(ALL, 2);
const bestPair = (score, excl) => { let b = null, bv = -Infinity; for (const p of ALLP) { if (excl && pk(...p) === pk(...excl)) continue; const v = score(p); if (v > bv) { bv = v; b = p; } } return b; };
const lastSorted = (i, c) => nums[i - 1].slice().sort((a, b) => c[b] - c[a] || a - b);
// ---- 方法族：每族多個參數變體；fn(i) 回傳 tickets [[t, nums, mult]]，空陣列 = 這期不買 ----
const fam = {};
const def = (f, v, fn) => (fam[f] ??= []).push({ v, fn });
const P = 5 / 39;
for (const a of [5, 20, 80]) def('重號傾向（貝氏）', 'a=' + a, i => { const r = x => (inc.rep[x] + a * P) / (inc.repN[x] + a); const l = nums[i - 1].slice().sort((x, y) => r(y) - r(x) || x - y); return [[2, [l[0], l[1]], 4]]; });
for (const a of [5, 20, 80]) def('馬可夫轉移（上期→本期）', 'a=' + a, i => { const sc = new Array(40).fill(0); for (const x of nums[i - 1]) for (const y of ALL) sc[y] += (inc.trans[x][y] + a * P) / (inc.transN[x] + a); return [[2, topK(sc, 2), 4]]; });
for (const m of ['due', 'over']) def('單號遺漏週期', m, i => { const sc = new Array(40).fill(0); for (const x of ALL) { const mg = inc.gapN[x] ? inc.gapSum[x] / inc.gapN[x] : 7.8, r = (i - inc.last[x]) / mg; sc[x] = m === 'due' ? -Math.abs(r - 1) : r; } return [[2, topK(sc, 2), 4]]; });
for (const minN of [3, 6, 10]) def('配對遺漏週期', 'minN=' + minN, i => [[2, bestPair(p => { const g = inc.pGap.get(pk(...p)); if (!g || g[1] < minN) return -1; return (i - inc.pLast.get(pk(...p))) / (g[0] / g[1]); }), 4]]);
for (const a of [10, 50, 200]) def('配對同開（貝氏收縮）', 'a=' + a, i => { const n = i, pr = 10 / 741; return [[2, bestPair(p => ((inc.pc.get(pk(...p)) || 0) + a * pr) / (n + a)), 4]]; });
for (const w of [60, 200, 100000]) def('連號對', 'w=' + w, i => { const c = new Array(40).fill(0); for (let k = Math.max(0, i - w); k < i; k++) { const s = new Set(nums[k]); for (let x = 1; x < 39; x++) if (s.has(x) && s.has(x + 1)) c[x]++; } const x = topK(c, 1, ALL.slice(0, 38))[0]; return [[2, [x, x + 1], 4]]; });
for (const a of [10, 40, 160]) def('星期效應', 'a=' + a, i => { const w = wd[i], tot = inc.cnt.map(x => x / Math.max(1, i)); const sc = ALL.reduce((s, x) => (s[x] = (inc.wdc[w][x] + a * tot[x]) / (inc.wdn[w] + a), s), new Array(40).fill(0)); return [[2, topK(sc, 2), 4]]; });
for (const th of [6, 7, 8]) def('只在強訊號期下注（推薦對）', 'top≥' + th, i => { const c = freq(i, 30), l = lastSorted(i, c); return c[l[0]] + c[l[1]] >= 2 * th ? [[2, [l[0], l[1]], 4]] : []; });
for (const [lo, hi] of [[1, 6], [2, 8], [1, 10]]) def('加碼：強訊號多買', `${lo}/${hi}`, i => { const c = freq(i, 30), l = lastSorted(i, c); const strong = c[l[0]] + c[l[1]] >= 14; return [[2, [l[0], l[1]], strong ? hi : lo]]; });
for (const m of [5, 6]) def('四合輪轉（熱號全包）', m + '碼', i => { const c = freq(i, 30), h = topK(c, m); return sub(h, 4).map(t => [4, t, 1]); });
for (const k of [2, 3]) def('集成投票（5 模型排名和）', 'top' + k, i => { const c30 = freq(i, 30), sc = new Array(40).fill(0);
  const models = [x => c30[x], x => (inc.rep[x] + 20 * P) / (inc.repN[x] + 20) * (nums[i - 1].includes(x) ? 1 : 0), x => { let s = 0; for (const y of nums[i - 1]) s += (inc.trans[y][x] + 20 * P) / (inc.transN[y] + 20); return s; }, x => (i - inc.last[x]) / (inc.gapN[x] ? inc.gapSum[x] / inc.gapN[x] : 7.8), x => inc.wdc[wd[i]][x] / Math.max(1, inc.wdn[wd[i]])];
  for (const f of models) { const r = ALL.slice().sort((a, b) => f(b) - f(a) || a - b); r.forEach((x, j) => (sc[x] += 39 - j)); }
  const t = topK(sc, k); return k === 2 ? [[2, t, 4]] : [[3, t, 4]]; });
for (const [lo, hi] of [[45, 75], [50, 70], [40, 80]]) def('三合 和值＋奇偶過濾', `${lo}-${hi}`, i => { const c = freq(i, 30), h = topK(c, 8); const ts = sub(h, 3).filter(t => { const s = t[0] + t[1] + t[2], o = t.filter(x => x % 2).length; return s * 5 / 3 >= lo * 1.5 && s * 5 / 3 <= hi * 1.5 && o > 0 && o < 3; }).sort((x, y) => (c[y[0]] + c[y[1]] + c[y[2]]) - (c[x[0]] + c[x[1]] + c[x[2]])).slice(0, 4); return ts.map(t => [3, t, 1]); });
for (const w of [100, 300]) def('同尾數對（尾數週期）', 'w=' + w, i => { const c = freq(i, w); let b = null, bv = -1; for (const p of ALLP) if (p[0] % 10 === p[1] % 10) { const v = c[p[0]] + c[p[1]]; if (v > bv) { bv = v; b = p; } } return [[2, b, 4]]; });
def('基準：推薦對×4', '-', i => { const c = freq(i, 30), l = lastSorted(i, c); return [[2, [l[0], l[1]], 4]]; });
// ---- 執行 ----
for (let i = 0; i < i0; i++) push(i);
const vs = Object.entries(fam).flatMap(([f, arr]) => arr.map(x => ({ f, ...x, s: [], tk: [] })));
for (let i = i0; i < N; i++) { const d = new Set(nums[i]);
  for (const m of vs) { const tk = m.fn(i).filter(t => t[1]); let cost = 0, win = 0; for (const [t, ns, mu] of tk) { cost += PRICE * mu; if (ns.every(x => d.has(x))) win += PRIZE[t] * mu; } m.s.push([cost, win]); m.tk.push(tk.map(([t, , mu]) => [t, mu])); }
  push(i); }
const agg = (s, a, b) => { let c = 0, w = 0; for (let j = a; j < b; j++) { c += s[j][0]; w += s[j][1]; } return c ? (w - c) / c : 0; };
const stats = (s, a, b) => { let cum = 0, pkv = 0, dd = 0, run = 0, ls = 0, wins = 0, bet = 0, cost = 0; for (let j = a; j < b; j++) { const [c, w] = s[j]; cost += c; cum += w - c; pkv = Math.max(pkv, cum); dd = Math.max(dd, pkv - cum); if (c) { bet++; if (w > 0) { wins++; run = 0; } else { run++; ls = Math.max(ls, run); } } } const roi = cost ? cum / cost : 0; return { roi, yr100: Math.round(roi * 100 * 312), wins, ls, bet, dd, net: cum }; };
// 隨機基準：同期同結構（同玩法、同倍數、同跳過）
function randPct(m, a, b, roi, S = 1000) { const r = L.mulberry32(99 + m.f.length * 131 + m.v.length); let below = 0; const res = [];
  for (let s = 0; s < S; s++) { let c = 0, w = 0; for (let j = a; j < b; j++) { const d = new Set(nums[i0 + j]); for (const [t, mu] of m.tk[j]) { c += PRICE * mu; const pick = new Set(); while (pick.size < t) pick.add(1 + Math.floor(r() * 39)); if ([...pick].every(x => d.has(x))) w += PRIZE[t] * mu; } } const v = c ? (w - c) / c : 0; res.push(v); if (v < roi) below++; }
  return 100 * below / S; }
const out = [];
for (const [f] of Object.entries(fam)) { const cands = vs.filter(m => m.f === f); const best = cands.sort((x, y) => agg(y.s, 0, split) - agg(x.s, 0, split))[0];
  const tr = stats(best.s, 0, split), te = stats(best.s, split, T); out.push({ 方法: f, 參數: best.v, 訓練ROI: (tr.roi * 100).toFixed(1) + '%', 樣本外ROI: (te.roi * 100).toFixed(1) + '%', '年(NT$100/期)': te.yr100, 中獎期: te.wins, 下注期: te.bet, 最長連槓: te.ls, 回撤: te.dd, 隨機分位: randPct(best, split, T, te.roi).toFixed(0) }); }
out.sort((a, b) => parseFloat(b.樣本外ROI) - parseFloat(a.樣本外ROI));
console.log(`總 ${T} 期 ${dates[i0]}～${dates[N - 1]}；訓練 ${split} 期（～${dates[i0 + split - 1]}），樣本外 ${T - split} 期（${dates[i0 + split]}～）`);
console.table(out);
fs.writeFileSync(new URL('../data/lehe_novel_result.json', import.meta.url), JSON.stringify({ T, split, from: dates[i0], splitDate: dates[i0 + split], to: dates[N - 1], rows: out }, null, 1));
