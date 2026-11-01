// 二合＋三合 NT$100/期 搭配搜尋（4 張 × NT$25；4二0三／3二1三／2二2三／1二3三，可重複買同一組）。
// 防過擬合：只用前段（前 855 期）挑選，最近 200 期當保留驗證。用法：node scripts/lehe_mix_search.mjs
import fs from 'node:fs';
import * as L from '../js/logic.js';
import * as A from '../js/arena.js';
const rd = f => JSON.parse(fs.readFileSync(new URL('../data/' + f, import.meta.url)));
const chrono = L.drawsChrono(L.buildDrawMap(rd('history.json').draws, rd('results.json').draws, {}));
const nums = chrono.map(d => d.numbers), WARM = 300, start = WARM, end = nums.length, T = end - start, split = T - 200;
const ALL = Array.from({ length: 39 }, (_, k) => k + 1), PRICE = 25, P2 = 1125, P3 = 11250, SEEDS = 2000;
const freq = (i, w) => { const c = new Array(40).fill(0); for (let k = i - w; k < i; k++) for (const x of nums[k]) c[x]++; return c; };
const srt = (a, c) => a.slice().sort((x, y) => c[y] - c[x] || x - y);
const heat = (t, c) => t.reduce((s, x) => s + c[x], 0);
const sub = (a, k) => { const o = []; (function r(s, cur) { if (cur.length === k) return o.push(cur.slice()); for (let i = s; i < a.length; i++) { cur.push(a[i]); r(i + 1, cur); cur.pop(); } })(0, []); return o; };
const byHeat = (ts, c) => ts.sort((x, y) => heat(y, c) - heat(x, c) || (x.join() < y.join() ? -1 : 1));
const topCoPair = (i, w) => { const m = new Map(); for (let k = i - w; k < i; k++) for (const p of sub(nums[k], 2)) { const key = p.join(); m.set(key, (m.get(key) || 0) + 1); } let best = null, bv = -1; for (const p of sub(ALL, 2)) { const v = m.get(p.join()) || 0; if (v > bv) { bv = v; best = p; } } return best; };
const sameTail = (mains, n, c) => { const o = []; for (const m of mains) { const p = srt(ALL.filter(x => x !== m && x % 10 === m % 10), c); for (const q of byHeat(sub(p, 2), c)) if (o.length < n) o.push([m, ...q]); if (o.length >= n) break; } return o; };

const PAIRS = { rep1: '上期重號最熱1對', rep2: '上期重號第2對', hot60: '近60期最常同開對', hot120: '近120期最常同開對', hotcold: '冷熱混合4碼最熱對', weighted: '多模型加權4碼最熱對' };
const TRIS = { pairPlus: '配對＋最熱第3碼', lastTop: '上期最熱3碼', weighted: '多模型加權最熱三合', tail: '同尾數（主支=上期最熱）' };
// 每期特徵
const F = [];
for (let i = start; i < end; i++) {
  const c = freq(i, 30), last = srt(nums[i - 1], c), picks = A.pickAll(nums.slice(0, i), chrono[i].date);
  const bestPair = a => byHeat(sub(a, 2), c)[0];
  const pairs = { rep1: [last[0], last[1]], rep2: [last[0], last[2]], hot60: topCoPair(i, 60), hot120: topCoPair(i, 120), hotcold: bestPair(picks.hotcold), weighted: bestPair(picks.o_weighted) };
  const tris = p => ({ pairPlus: srt(ALL.filter(x => !p.includes(x)), c).slice(0, 3).map(x => [...p, x]), lastTop: byHeat(sub(last.slice(0, 4), 3), c), weighted: byHeat(sub(picks.o_weighted, 3), c), tail: sameTail(last, 3, c) });
  F.push({ d: new Set(nums[i]), pairs, tris: Object.fromEntries(Object.keys(pairs).map(k => [k, tris(pairs[k])])) });
}
const hit = (t, d) => t.every(x => d.has(x));
// 設定
const configs = [];
for (const pm of Object.keys(PAIRS)) {
  configs.push({ pm, n2: 4, n3: 0, tm: null, mode: '-' });
  for (const n2 of [3, 2, 1]) for (const tm of Object.keys(TRIS)) for (const mode of n2 === 3 ? ['distinct'] : ['distinct', 'repeat']) configs.push({ pm, n2, n3: 4 - n2, tm, mode });
}
function series(cf) { return F.map(f => { const p = f.pairs[cf.pm]; let w = hit(p, f.d) ? cf.n2 * P2 : 0; if (cf.n3) { const ts = f.tris[cf.pm][cf.tm]; const pick = cf.mode === 'repeat' ? Array(cf.n3).fill(ts[0]) : ts.slice(0, cf.n3); w += pick.filter(t => hit(t, f.d)).length * P3; } return w - 100; }); }
function stats(s) { let cum = 0, pk = 0, dd = 0, st = 0, ls = 0; for (const v of s) { cum += v; pk = Math.max(pk, cum); dd = Math.max(dd, pk - cum); if (v <= -100) { st++; ls = Math.max(ls, st); } else st = 0; }
  const sm = (a, b) => s.slice(a, b).reduce((x, y) => x + y, 0); return { won: cum + T * 100, roi: cum / (T * 100), roiE: sm(0, split) / (split * 100), roiR: sm(split, T) / ((T - split) * 100), dd, ls, yr: Math.round(cum / T * 312) }; }
// 隨機基準：同樣的 n2/n3 結構（隨機一對×n2＋n3 組隨機三合）
const rbCache = {};
function rb(n2) { if (rbCache[n2]) return rbCache[n2]; const o = { all: [], early: [], recent: [] };
  for (let s = 0; s < SEEDS; s++) { const r = L.mulberry32(4242 + s * 7919 + n2); let e = 0, re = 0;
    const rnd = k => { const a = ALL.slice(); for (let q = 0; q < k; q++) { const j = q + Math.floor(r() * (39 - q)); [a[q], a[j]] = [a[j], a[q]]; } return a.slice(0, k); };
    F.forEach((f, j) => { let w = hit(rnd(2), f.d) ? n2 * P2 : 0; for (let q = 0; q < 4 - n2; q++) if (hit(rnd(3), f.d)) w += P3; if (j < split) e += w - 100; else re += w - 100; });
    o.all.push((e + re) / (T * 100)); o.early.push(e / (split * 100)); o.recent.push(re / ((T - split) * 100)); }
  for (const k in o) o[k].sort((a, b) => a - b); return (rbCache[n2] = o); }
const pct = (a, v) => 100 * a.filter(x => x < v).length / a.length;
const rows = configs.map(cf => { const st = stats(series(cf)), B = rb(cf.n2); return { ...cf, name: `${PAIRS[cf.pm]}×${cf.n2}` + (cf.n3 ? ` ＋ ${TRIS[cf.tm]}×${cf.n3}${cf.mode === 'repeat' ? '（同組重複）' : ''}` : ''), ...st, pAll: pct(B.all, st.roi), pE: pct(B.early, st.roiE), pR: pct(B.recent, st.roiR) }; });
rows.sort((a, b) => b.roiE - a.roiE);
const f1 = x => (x * 100).toFixed(1) + '%';
console.log(`搜尋 ${rows.length} 種設定；前段 ${split} 期（${chrono[start].date}～${chrono[start + split - 1].date}）挑選，保留最近 ${T - split} 期（${chrono[start + split].date}～${chrono[end - 1].date}）`);
const show = r => console.log([r.name, '前段' + f1(r.roiE), '近200' + f1(r.roiR), '全期' + f1(r.roi), `分位 前${r.pE.toFixed(0)}/近${r.pR.toFixed(0)}/全${r.pAll.toFixed(0)}`, '總中' + r.won, '回撤' + r.dd, '連槓' + r.ls, '年' + r.yr].join(' | '));
console.log('--- 前段 ROI 前 10 ---'); rows.slice(0, 10).forEach(show);
console.log('--- 基準：上期重號最熱1對×4 ---'); show(rows.find(r => r.pm === 'rep1' && r.n2 === 4));
const best = [...rows].sort((a, b) => b.roiR - a.roiR)[0]; console.log('--- （僅參考，事後看）近200最佳 ---'); show(best);
