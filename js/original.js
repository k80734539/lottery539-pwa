// 「你的策略」：忠實移植自原版 Python 專案（lottery539/ensemble.py、advanced.py、core.py）的 8 個每日策略。
// 每個策略取原版「排名1」那一組（4 碼、候選池 18 碼，與原版自動選號預設相同）。
// 純邏輯、確定性、只用該期以前的資料。原版用 numpy 亂數的地方（純隨機分數、組合抖動 0–2.5）改用擂台同款種子亂數。
export const ORIGINAL = [
  { id: 'o_hot', py: '近期熱號', desc: '近 30／60／120 期出現率平均（正規化 0–100），由池中組出結構均衡的最高分組' },
  { id: 'o_hotcold', py: '冷熱混合', desc: '0.5×近期熱號模型＋0.5×遺漏值模型（遺漏以約 +0.75 個標準差最高分）' },
  { id: 'o_trend', py: '短期趨勢', desc: '0.6×(近10期−近30期出現率)＋0.4×(近20期−近30期)' },
  { id: 'o_cooc', py: '共現模型', desc: '與初步前 10 名錨點號碼的共現提升度（收縮 10）平均' },
  { id: 'o_votes', py: '多模型票數', desc: '五模型各自前 10 名的得票數×100＋加權分數' },
  { id: 'o_weighted', py: '多模型加權', desc: '熱號、遺漏、趨勢、共現、規則模型五模型等權平均' },
  { id: 'o_pair', py: '二合配對覆蓋', desc: '進階號碼分數前 18 碼中，二碼校正共現分數平均最高的 4 碼組合' },
  { id: 'o_random', py: '純隨機', desc: '每個號碼隨機給分，再用同一套結構均衡規則組 4 碼（對照組）' },
];
const SIZE = 4, POOL = 18;
const N39 = Array.from({ length: 39 }, (_, i) => i + 1);
const r2 = x => { const y = x * 100, f = Math.floor(y); let r = y - f === 0.5 ? (f % 2 === 0 ? f : f + 1) : Math.round(y); return r / 100; }; // numpy round（半數取偶）
const isclose = (a, b) => Math.abs(a - b) <= 1e-8 + 1e-5 * Math.abs(b);
function normalize(a) { // ensemble.normalize_0_100（輸入皆有限）
  let lo = Infinity, hi = -Infinity; for (const v of a) { if (v < lo) lo = v; if (v > hi) hi = v; }
  if (isclose(lo, hi)) return a.map(() => 50);
  return a.map(v => Math.min(100, Math.max(0, 100 * (v - lo) / (hi - lo))));
}
function scale(a) { // core._scale
  let lo = Infinity, hi = -Infinity; for (const v of a) { if (v < lo) lo = v; if (v > hi) hi = v; }
  if (Math.abs(lo - hi) <= 1e-9 * Math.max(Math.abs(lo), Math.abs(hi))) return a.map(() => 50);
  return a.map(v => 100 * (v - lo) / (hi - lo));
}
function quantile(a, q) { const s = a.slice().sort((x, y) => x - y); const p = (s.length - 1) * q, f = Math.floor(p); return f + 1 < s.length ? s[f] + (s[f + 1] - s[f]) * (p - f) : s[f]; }
const median = s => { const a = s.slice().sort((x, y) => x - y), m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
function npStd(a) { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length); }
function combos(pool, k, fn) { const c = []; (function rec(s) { if (c.length === k) { fn(c.slice()); return; } for (let i = s; i <= pool.length - (k - c.length); i++) { c.push(pool[i]); rec(i + 1); c.pop(); } })(0); }

/** 共用統計：idx[n] = 出現的期索引；count(w) */
function base(past) {
  const n = past.length, idx = Array.from({ length: 40 }, () => []);
  past.forEach((d, i) => { for (const x of d) idx[x].push(i); });
  const win = w => { const f = new Array(40).fill(0); for (let i = Math.max(0, n - w); i < n; i++) for (const x of past[i]) f[x]++; return f; };
  const omit = N39.map(x => idx[x].length ? n - 1 - idx[x][idx[x].length - 1] : n);
  const pair = Array.from({ length: 40 }, () => new Array(40).fill(0));
  for (const d of past) for (let a = 0; a < d.length; a++) for (let b = a + 1; b < d.length; b++) { pair[d[a]][d[b]]++; pair[d[b]][d[a]]++; }
  return { n, idx, win, omit, pair, last: n ? past[n - 1] : [] };
}
function scoreNumbersTotal(B, past) { // core.score_numbers 的「總分」（index 0 = 號碼 1）
  const { n, win, omit, last } = B;
  const f10 = win(10), f30 = win(30), f100 = win(100);
  const q = Math.max(1, quantile(omit, 0.9));
  const pos = N39.map(() => [0, 0, 0, 0, 0]); for (const d of past) d.forEach((x, p) => pos[x - 1][p]++);
  const raw = [
    [N39.map(x => f10[x]), 20], [N39.map(x => f30[x]), 20], [N39.map(x => f100[x]), 10],
    [omit.map(o => Math.min(o, q)), 10], [N39.map(x => last.includes(x) ? 100 : 0), 10],
    [N39.map(x => last.filter(y => Math.abs(x - y) === 1).length), 10], [N39.map(x => last.filter(y => x % 10 === y % 10).length), 5],
    [pos.map(p => Math.max(...p)), 5], [N39.map(x => 100 - Math.abs(x - 20) * 3), 10]];
  const w = new Array(39).fill(0);
  for (const [vals, wt] of raw) { const s = scale(vals); for (let i = 0; i < 39; i++) w[i] += s[i] * wt / 100; }
  return w.map(r2);
}
/** ensemble.five_model_scores → 表格（皆為四捨五入到 2 位後的值，index 0 = 號碼 1） */
export function fiveModelTable(past) {
  const B = base(past), { n, idx, pair } = B;
  const fr = w => { const a = Math.min(w, n), f = B.win(w); return N39.map(x => f[x] / Math.max(1, a)); };
  const f10 = fr(10), f20 = fr(20), f30 = fr(30), f60 = fr(60), f120 = fr(120);
  const heat = normalize(N39.map((_, i) => (f30[i] + f60[i] + f120[i]) / 3));
  const omission = normalize(N39.map((x, i) => {
    const ap = idx[x], gaps = []; for (let k = 1; k < ap.length; k++) gaps.push(ap[k] - ap[k - 1] - 1);
    const center = gaps.length ? median(gaps) : 6.8, spread = gaps.length >= 2 ? npStd(gaps) : Math.max(2, center * 0.75);
    const s = (B.omit[i] - center) / Math.max(1, spread); return Math.exp(-0.5 * ((s - 0.75) / 1.5) ** 2);
  }));
  const trend = normalize(N39.map((_, i) => 0.6 * (f10[i] - f30[i]) + 0.4 * (f20[i] - f30[i])));
  const pre = normalize(N39.map((_, i) => (heat[i] + omission[i] + trend[i]) / 3));
  const anchors = N39.map((_, i) => i).sort((a, b) => pre[b] - pre[a] || b - a).slice(0, 10); // np.argsort()[::-1]
  const cnt = N39.map(x => idx[x].length);
  const adj = (i, j) => { const e = cnt[i] * cnt[j] / Math.max(1, n); const pc = i === j ? cnt[i] : pair[i + 1][j + 1]; return (pc + 10 * e) / Math.max(e * 11, 1e-9); };
  const coRaw = N39.map((_, i) => anchors.includes(i) ? anchors.filter(a => a !== i).reduce((s, a) => s + adj(i, a), 0) / (anchors.length - 1) : anchors.reduce((s, a) => s + adj(i, a), 0) / anchors.length);
  const cooc = n ? normalize(coRaw) : N39.map(() => 50);
  const repl = normalize(scoreNumbersTotal(B, past));
  const models = [heat, omission, trend, cooc, repl];
  const votes = new Array(39).fill(0);
  for (const m of models) N39.map((_, i) => i).sort((a, b) => m[b] - m[a] || a - b).slice(0, 10).forEach(i => votes[i]++);
  const weighted = N39.map((_, i) => models.reduce((s, m) => s + m[i] * 1, 0) / 5);
  return { heat: heat.map(r2), omission: omission.map(r2), trend: trend.map(r2), cooc: cooc.map(r2), repl: repl.map(r2), votes, weighted: weighted.map(r2), voteScore: N39.map((_, i) => r2(votes[i] * 100 + weighted[i])) };
}
/** ensemble._generate_three_groups 的排名1（jitter() 取代 rng.uniform(0,2.5) 的 0–1 亂數） */
function topGroup(score, wsc, rand) {
  const ind = normalize(score);
  const pool = N39.slice().sort((a, b) => score[b - 1] - score[a - 1] || wsc[b - 1] - wsc[a - 1] || a - b).slice(0, POOL).sort((a, b) => a - b);
  let best = null, bv = -Infinity;
  combos(pool, SIZE, c => {
    const odd = c.filter(x => x % 2).length, small = c.filter(x => x <= 20).length;
    const z = Math.max(c.filter(x => x <= 13).length, c.filter(x => x >= 14 && x <= 26).length, c.filter(x => x >= 27).length);
    const os = odd === 2 ? 100 : Math.max(0, 100 - 35 * Math.abs(odd - 2)), ss = small === 2 ? 100 : Math.max(0, 100 - 35 * Math.abs(small - 2));
    const zs = z <= 3 ? 100 : Math.max(0, 100 - 45 * (z - 3));
    const structure = (os + ss + zs) / 3, individual = c.reduce((s, x) => s + ind[x - 1], 0) / 4;
    const v = 0.82 * individual + 0.18 * structure + 2.5 * rand();
    if (v > bv) { bv = v; best = c; }
  });
  return best;
}
const lexGt = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] > b[i]; return false; };
function pairCoverageTop(past) { // advanced.generate_pair_coverage_three_groups 的排名1
  const B = base(past), { n, idx, pair, last } = B;
  const q = Math.max(1, quantile(B.omit, 0.9)), f10 = B.win(10), f30 = B.win(30);
  const comps = [[scale(N39.map(x => f10[x])), 0.28], [scale(N39.map(x => f30[x])), 0.24], [scale(N39.map(x => idx[x].length)), 0], [scale(B.omit.map(o => Math.min(o, q))), 0.16],
    [scale(N39.map(x => (last.includes(x) ? 2 : 0) + last.filter(y => Math.abs(x - y) === 1).length)), 0.12]];
  const tot = new Array(39).fill(0); for (const [v, w] of comps) for (let i = 0; i < 39; i++) tot[i] += v[i] * w / 0.8;
  const ns = tot.map(r2);
  const pool = N39.slice().sort((a, b) => ns[b - 1] - ns[a - 1] || a - b).slice(0, POOL).sort((a, b) => a - b);
  const cnt = N39.map(x => idx[x].length);
  const co = (a, b) => { const e = cnt[a - 1] * cnt[b - 1] / n; if (e <= 0) return 50; const lift = (pair[a][b] + 10 * e) / (e * 11); return Math.min(100, Math.max(0, 50 + 50 * Math.tanh(2 * Math.log(Math.max(lift, 1e-9))))); };
  let best = null, bk = null;
  combos(pool, SIZE, c => {
    let ps = 0; for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) ps += co(c[i], c[j]); ps /= 6;
    const k = [ps, c.reduce((s, x) => s + ns[x - 1], 0) / 4, c];
    if (!bk || k[0] > bk[0] || (k[0] === bk[0] && (k[1] > bk[1] || (k[1] === bk[1] && lexGt(c, bk[2]))))) { bk = k; best = c; }
  });
  return best;
}
/** past：由舊到新；R(id)：種子亂數。回傳 {o_*: [4 碼]}。至少需要 1 期歷史。 */
export function originalPicks(past, R) {
  if (!past.length) return null;
  const T = fiveModelTable(past), out = {};
  const g = (id, sc) => { out[id] = topGroup(sc, T.weighted, R(id)); };
  g('o_hot', T.heat);
  g('o_hotcold', normalize(T.heat.map((h, i) => 0.5 * h + 0.5 * T.omission[i])));
  g('o_trend', T.trend); g('o_cooc', T.cooc); g('o_votes', T.voteScore); g('o_weighted', T.weighted);
  out.o_pair = pairCoverageTop(past);
  { const rng = R('o_random'); const sc = N39.map(() => rng() * 100); out.o_random = topGroup(sc, T.weighted, rng); }
  return out;
}
