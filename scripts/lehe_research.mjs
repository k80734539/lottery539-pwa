// 樂合彩（二合／三合／四合）選號方法研究：walk-forward 回測（每期只用該期以前的資料）＋隨機基準分布＋Holm 校正。
// 用法：node scripts/lehe_research.mjs [輸出 JSON 路徑]
// 賠率：每注 NT$25；二合 1125、三合 11250、四合 212500（每中一注的派彩）。
import fs from 'node:fs';
import * as L from '../js/logic.js';
import * as A from '../js/arena.js';
const rd = f => JSON.parse(fs.readFileSync(new URL('../data/' + f, import.meta.url)));
const chrono = L.drawsChrono(L.buildDrawMap(rd('history.json').draws, rd('results.json').draws, {}));
const nums = chrono.map(d => d.numbers);
const PRICE = 25, PRIZE = { 2: 1125, 3: 11250, 4: 212500 }, TNAME = { 2: '二合', 3: '三合', 4: '四合' };
const WARM = 300, RECENT = 200, SEEDS = 2000;
const start = WARM, end = nums.length, T = end - start, splitAt = T - RECENT;
const ALL = Array.from({ length: 39 }, (_, i) => i + 1);
const C = (n, k) => { if (k < 0 || k > n) return 0; let r = 1; for (let i = 1; i <= k; i++) r = r * (n - k + i) / i; return r; };
function combos(a, k) { const out = [], c = []; (function rec(s) { if (c.length === k) { out.push(c.slice()); return; } for (let i = s; i < a.length; i++) { c.push(a[i]); rec(i + 1); c.pop(); } })(0); return out; }
const pk = (a, b) => a < b ? a * 40 + b : b * 40 + a;
const top = (score, k, pool = ALL) => pool.slice().sort((a, b) => score[b] - score[a] || a - b).slice(0, k);

// ---------- 方法定義：每期回傳 [{t, nums}]（同一 t 的組合）或 {pack, t, filter} ----------
const methods = [];
const add = (id, name, group, fn, base) => methods.push({ id, name, group, fn, base });
// 每期的特徵（只看過去）
function features(i) {
  const past = nums.slice(0, i), n = past.length;
  const f = w => { const c = new Array(40).fill(0); for (let k = Math.max(0, n - w); k < n; k++) for (const x of past[k]) c[x]++; return c; };
  const omit = new Array(40).fill(n); for (let k = n - 1; k >= 0; k--) for (const x of past[k]) if (omit[x] === n) omit[x] = n - 1 - k;
  const pairCnt = w => { const m = new Map(); for (let k = Math.max(0, n - w); k < n; k++) { const d = past[k]; for (let a = 0; a < 5; a++) for (let b = a + 1; b < 5; b++) { const key = pk(d[a], d[b]); m.set(key, (m.get(key) || 0) + 1); } } return m; };
  const pairLast = new Map(); for (let k = 0; k < n; k++) { const d = past[k]; for (let a = 0; a < 5; a++) for (let b = a + 1; b < 5; b++) pairLast.set(pk(d[a], d[b]), k); }
  return { past, n, f, omit, pairCnt, pairLast, last: past[n - 1] };
}
const ALLPAIRS = combos(ALL, 2);
const topPairs = (score, k) => ALLPAIRS.map(p => [p, score(p)]).sort((x, y) => y[1] - x[1] || x[0][0] - y[0][0] || x[0][1] - y[0][1]).slice(0, k).map(x => x[0]);
for (const N of [30, 60, 120, 300]) for (const k of [1, 3]) add(`hotpair${N}_${k}`, `熱門配對 近${N}期 前${k}對`, '二合配對', F => { const m = F.cache['pc' + N] ??= F.pairCnt(N); return { t: 2, sets: topPairs(p => m.get(pk(p[0], p[1])) || 0, k) }; }, { kind: 'pairs', k });
for (const k of [1, 3]) add(`coldpair_${k}`, `最久未同開配對 前${k}對`, '二合配對', F => ({ t: 2, sets: topPairs(p => F.n - (F.pairLast.get(pk(p[0], p[1])) ?? -1), k) }), { kind: 'pairs', k });
for (const k of [1, 3]) add(`mixpair_${k}`, `熱號×冷號混搭 ${k}對`, '二合配對', F => { const f = F.f(30); const h = top(f, 6), c = top(F.omit, 12).filter(x => !h.includes(x)); return { t: 2, sets: Array.from({ length: k }, (_, j) => [h[j], c[j]].sort((a, b) => a - b)) }; }, { kind: 'pairs', k });
add('repeat_1', '上期重號 最熱 1 對', '型態', F => { const f = F.f(30); return { t: 2, sets: [top(f, 2, F.last).sort((a, b) => a - b)] }; }, { kind: 'pairs', k: 1 });
add('repeat_10', '上期 5 碼全包二合（10 注）', '型態', F => ({ t: 2, pack: F.last }), { kind: 'pack', m: 5, t: 2 });
add('neighbor_1', '上期鄰號 最熱 1 對', '型態', F => { const cand = [...new Set(F.last.flatMap(x => [x - 1, x + 1]).filter(y => y >= 1 && y <= 39 && !F.last.includes(y)))]; return { t: 2, sets: [top(F.f(30), 2, cand).sort((a, b) => a - b)] }; }, { kind: 'pairs', k: 1 });
add('tail_1', '同尾數配對 近120期最常同開', '型態', F => { const m = F.cache.pc120 ??= F.pairCnt(120); return { t: 2, sets: topPairs(p => p[0] % 10 === p[1] % 10 ? (m.get(pk(p[0], p[1])) || 0) : -1, 1) }; }, { kind: 'pairs', k: 1 });
// 包牌：m 碼全包
for (const m of [5, 6, 7]) for (const t of [2, 3]) add(`hotpack${m}_${t}`, `熱號包牌 ${m} 碼全包${TNAME[t]}（${C(m, t)} 注）`, '包牌', F => ({ t, pack: top(F.f(30), m) }), { kind: 'pack', m, t });
add('hotpack5_4', '熱號包牌 5 碼全包四合（5 注）', '包牌', F => ({ t: 4, pack: top(F.f(30), 5) }), { kind: 'pack', m: 5, t: 4 });
for (const t of [2, 3]) add(`coldpack6_${t}`, `冷號包牌 6 碼全包${TNAME[t]}（${C(6, t)} 注）`, '包牌', F => ({ t, pack: top(F.omit, 6) }), { kind: 'pack', m: 6, t });
const sumOk = c => { const s = c.reduce((a, b) => a + b, 0); return s >= 45 && s <= 75; };
add('hot7_3_sum', '熱號 7 碼三合＋和值 45–75 過濾', '和值過濾', F => ({ t: 3, pack: top(F.f(30), 7), filter: sumOk }), { kind: 'pack', m: 7, t: 3, filter: sumOk });
// 擂台 20 個策略的 4 碼 → 二合 6 注／三合 4 注／四合 1 注
for (const s of A.ARENA) for (const t of [2, 3, 4]) add(`arena_${s.id}_${t}`, `${s.name} 4 碼→${TNAME[t]}`, s.kind === 'original' ? '擂台（你的策略）' : '擂台', F => ({ t, pack: (F.cache.arena ??= A.pickAll(F.past, F.date))[s.id] }), { kind: 'pack', m: 4, t });

// ---------- 回測 ----------
const res = methods.map(() => ({ net: new Float64Array(T), cost: new Float64Array(T), wins: new Int32Array(T) }));
for (let i = start; i < end; i++) {
  const F = features(i); F.cache = {}; F.date = chrono[i].date; const d = new Set(nums[i]), j = i - start;
  methods.forEach((m, mi) => {
    const o = m.fn(F); let sets = o.sets ?? combos(o.pack.slice().sort((a, b) => a - b), o.t); if (o.filter) sets = sets.filter(o.filter);
    let w = 0; for (const c of sets) if (c.every(x => d.has(x))) w++;
    const r = res[mi]; r.cost[j] = sets.length * PRICE; r.wins[j] = w; r.net[j] = w * PRIZE[o.t] - sets.length * PRICE; r.t = o.t; r.combos = (r.combos || 0) + sets.length;
  });
}
// ---------- 隨機基準：同樣注數結構的隨機選號，SEEDS 組 ----------
const baseKey = b => `${b.kind}|${b.k ?? b.m}|${b.t ?? 2}|${b.filter ? 'f' : ''}`;
const baseCache = new Map();
function baseline(b) {
  const key = baseKey(b); if (baseCache.has(key)) return baseCache.get(key);
  const out = { all: [], early: [], recent: [] };
  for (let s = 0; s < SEEDS; s++) {
    const rng = L.mulberry32(0x5eed0000 + s * 7919 + key.length * 131 + [...key].reduce((a, c) => a * 31 + c.charCodeAt(0) | 0, 0));
    let ce = 0, we = 0, cr = 0, wr = 0;
    for (let i = start; i < end; i++) {
      const d = new Set(nums[i]); let cost, win;
      const a = ALL.slice(); for (let q = 0; q < 7; q++) { const r = q + Math.floor(rng() * (39 - q)); [a[q], a[r]] = [a[r], a[q]]; }
      if (b.kind === 'pairs') {
        const chosen = new Set(); let w = 0;
        while (chosen.size < b.k) { const x = 1 + Math.floor(rng() * 39), y = 1 + Math.floor(rng() * 39); if (x === y) continue; const kk = pk(x, y); if (chosen.has(kk)) continue; chosen.add(kk); if (d.has(x) && d.has(y)) w++; }
        cost = b.k * PRICE; win = w * PRIZE[2];
      } else {
        const pick = a.slice(0, b.m);
        if (b.filter) { const sets = combos(pick.sort((x, y) => x - y), b.t).filter(b.filter); cost = sets.length * PRICE; win = sets.filter(c => c.every(x => d.has(x))).length * PRIZE[b.t]; }
        else { const h = pick.filter(x => d.has(x)).length; cost = C(b.m, b.t) * PRICE; win = C(h, b.t) * PRIZE[b.t]; }
      }
      if (i - start < splitAt) { ce += cost; we += win; } else { cr += cost; wr += win; }
    }
    out.all.push((we + wr - ce - cr) / (ce + cr)); out.early.push((we - ce) / ce); out.recent.push((wr - cr) / cr);
  }
  for (const k of ['all', 'early', 'recent']) out[k].sort((x, y) => x - y);
  baseCache.set(key, out); return out;
}
const pctile = (arr, v) => { let lo = 0; for (const x of arr) if (x < v) lo++; return 100 * lo / arr.length; };
const pUpper = (arr, v) => (arr.filter(x => x >= v).length + 1) / (arr.length + 1);
const q = (arr, p) => arr[Math.min(arr.length - 1, Math.floor(p * arr.length))];
const rows = methods.map((m, mi) => {
  const r = res[mi]; let cum = 0, peak = 0, dd = 0, streak = 0, ls = 0, ce = 0, we = 0, cr = 0, wr = 0, hits = 0;
  const curve = [];
  for (let j = 0; j < T; j++) {
    cum += r.net[j]; peak = Math.max(peak, cum); dd = Math.max(dd, peak - cum); curve.push(cum);
    if (r.wins[j] === 0 && r.cost[j] > 0) { streak++; ls = Math.max(ls, streak); } else if (r.wins[j] > 0) streak = 0;
    hits += r.wins[j]; const win = r.net[j] + r.cost[j];
    if (j < splitAt) { ce += r.cost[j]; we += win; } else { cr += r.cost[j]; wr += win; }
  }
  const B = baseline(m.base), roi = (we + wr - ce - cr) / (ce + cr), roiE = (we - ce) / ce, roiR = (wr - cr) / cr;
  const pAnalytic = { 2: C(37, 3) / C(39, 5), 3: C(36, 2) / C(39, 5), 4: 35 / C(39, 5) }[r.t];
  return { id: m.id, name: m.name, group: m.group, type: TNAME[r.t], combosPerDraw: +(r.combos / T).toFixed(2), costPerDraw: +(r.combos / T * PRICE).toFixed(0), hits, hitRate: hits / r.combos, theoryHitRate: pAnalytic,
    roi, roiEarly: roiE, roiRecent: roiR, pctAll: pctile(B.all, roi), pctEarly: pctile(B.early, roiE), pctRecent: pctile(B.recent, roiR), p: pUpper(B.all, roi), pRecent: pUpper(B.recent, roiR),
    baseMedian: q(B.all, 0.5), base5: q(B.all, 0.05), base95: q(B.all, 0.95), net: cum, maxDD: dd, longestLosing: ls, curve };
});
// Holm（單尾：比隨機好）
const order = rows.map((r, i) => [r.p, i]).sort((a, b) => a[0] - b[0]); let run = 0;
order.forEach(([p, i], k) => { run = Math.max(run, Math.min(1, p * (rows.length - k))); rows[i].holm = run; });
rows.sort((a, b) => b.roi - a.roi);
const out = { generated: new Date().toISOString(), draws: { total: nums.length, tested: T, from: chrono[start].date, to: chrono[end - 1].date, early: [chrono[start].date, chrono[start + splitAt - 1].date], recent: [chrono[start + splitAt].date, chrono[end - 1].date] }, seeds: SEEDS, warm: WARM, price: PRICE, prize: PRIZE, methods: rows.length, rows };
fs.writeFileSync(process.argv[2] || '/tmp/lehe_research.json', JSON.stringify(out));
console.log(`測試 ${T} 期（${out.draws.from}～${out.draws.to}），${rows.length} 種方法，每種 ${SEEDS} 組隨機基準`);
console.log('方法\t類型\t注/期\tROI\t前段ROI\t近200ROI\t隨機分位(全/前/近)\tHolm\t最大回撤\t最長連槓');
for (const r of rows) console.log([r.name, r.type, r.combosPerDraw, (r.roi * 100).toFixed(1) + '%', (r.roiEarly * 100).toFixed(1) + '%', (r.roiRecent * 100).toFixed(1) + '%', `${r.pctAll.toFixed(0)}/${r.pctEarly.toFixed(0)}/${r.pctRecent.toFixed(0)}`, r.holm.toFixed(3), Math.round(r.maxDD), r.longestLosing].join('\t'));
