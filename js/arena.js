// 策略擂台：每期每個策略自動選 4 碼（虛擬前向測試），並用歷史資料做 walk-forward 回測。
// 純邏輯（無 DOM），可在 Node 與瀏覽器執行。所有策略只看「該期以前」的開獎資料。
import { mulberry32, validNumbers, cutoffInstant } from './logic.js';

export const PICK_N = 4;
export const WARMUP = 30; // 回測前 30 期只當暖身資料，不計分

export const ARENA = [
  { id: 'random', name: '純隨機', kind: 'baseline', desc: '從 1–39 隨機抽 4 碼（基準線）' },
  { id: 'hotcold', name: '冷熱混合', kind: 'baseline', desc: '近 100 期最熱 10 碼抽 2、遺漏最久 10 碼抽 2' },
  { id: 'coverage', name: '覆蓋最大化', kind: 'baseline', desc: '4 碼等距分散（r、r+10、r+20、r+30），涵蓋整個號碼範圍' },
  { id: 'hot30', name: '近期熱號', kind: 'new', desc: '近 30 期出現次數最多的 4 碼' },
  { id: 'omission', name: '遺漏回補', kind: 'new', desc: '目前連續未開出期數最長的 4 碼' },
  { id: 'momentum', name: '短期趨勢', kind: 'new', desc: '近 10 期出現率減近 100 期出現率，上升最多的 4 碼' },
  { id: 'pair', name: '共現配對', kind: 'new', desc: '近 300 期最常一起開出的號碼組合，貪婪擴充到 4 碼' },
  { id: 'balance', name: '區間均衡', kind: 'new', desc: '四個區間（1–10、11–20、21–30、31–39）各 1 碼，且 2 單 2 雙' },
  { id: 'lastdigit', name: '尾數分散', kind: 'new', desc: '4 碼的尾數各不相同' },
  { id: 'neighbor', name: '鄰號', kind: 'new', desc: '上一期開獎號碼的前後鄰號（±1）中隨機取 4 碼' },
  { id: 'weighted', name: '加權隨機', kind: 'new', desc: '依近 100 期出現次數加權的隨機抽 4 碼' },
  { id: 'ensemble', name: '多策略投票', kind: 'new', desc: '其他非隨機策略各投票，得票最高的 4 碼' },
];
export const ARENA_IDS = ARENA.map(s => s.id);
export const nameOf = id => ARENA.find(s => s.id === id)?.name ?? id;

// ---------- 確定性隨機：同一天、同一策略、同一份歷史 → 永遠同一組 ----------
export function seedFor(date, id) {
  let h = 2166136261;
  for (const c of `${date}|${id}`) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
const ALL = Array.from({ length: 39 }, (_, i) => i + 1);
const sortNum = a => a.slice().sort((x, y) => x - y);
function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function topK(score, k, rng, pool = ALL) {
  const tie = new Array(40).fill(0).map(() => rng());
  return pool.slice().sort((a, b) => score[b] - score[a] || tie[b] - tie[a]).slice(0, k);
}
function freqOf(past, window) {
  const f = new Array(40).fill(0);
  const from = Math.max(0, past.length - window);
  for (let i = from; i < past.length; i++) for (const n of past[i]) f[n]++;
  return f;
}
function omissionOf(past) {
  const o = new Array(40).fill(past.length); // 沒出現過 = 整段歷史長度
  const seen = new Array(40).fill(false);
  for (let i = past.length - 1, step = 0; i >= 0; i--, step++) {
    for (const x of past[i]) if (!seen[x]) { seen[x] = true; o[x] = step; }
  }
  return o;
}

/** past：由舊到新的開獎號碼陣列（只含該期以前）。回傳 {strategyId: [4 碼]}。 */
export function pickAll(past, date) {
  const R = id => mulberry32(seedFor(date, id));
  const n = past.length;
  const f10 = freqOf(past, 10), f30 = freqOf(past, 30), f100 = freqOf(past, 100);
  const omit = omissionOf(past);
  const out = {};

  out.random = sortNum(shuffle(ALL, R('random')).slice(0, 4));

  { // 冷熱混合
    const rng = R('hotcold');
    if (n < 10) out.hotcold = sortNum(shuffle(ALL, rng).slice(0, 4));
    else {
      const hot = topK(f100, 10, rng), cold = topK(omit, 10, rng);
      const chosen = new Set();
      for (const x of shuffle(hot, rng)) if (chosen.size < 2) chosen.add(x);
      for (const x of shuffle(cold.filter(c => !chosen.has(c)), rng)) if (chosen.size < 4) chosen.add(x);
      out.hotcold = sortNum([...chosen]);
    }
  }
  { const r = 1 + Math.floor(R('coverage')() * 9); out.coverage = [r, r + 10, r + 20, r + 30]; }
  out.hot30 = sortNum(topK(f30, 4, R('hot30')));
  out.omission = sortNum(topK(omit, 4, R('omission')));
  { // 短期趨勢
    const w10 = Math.min(10, n) || 1, w100 = Math.min(100, n) || 1;
    const sc = new Array(40).fill(0);
    for (const x of ALL) sc[x] = f10[x] / w10 - f100[x] / w100;
    out.momentum = sortNum(topK(sc, 4, R('momentum')));
  }
  { // 共現配對
    const rng = R('pair');
    const cnt = Array.from({ length: 40 }, () => new Array(40).fill(0));
    for (let i = Math.max(0, n - 300); i < n; i++) {
      const d = past[i];
      for (let a = 0; a < 5; a++) for (let b = a + 1; b < 5; b++) { cnt[d[a]][d[b]]++; cnt[d[b]][d[a]]++; }
    }
    const tie = new Array(40).fill(0).map(() => rng());
    let best = -1, bp = [1, 2];
    for (let a = 1; a <= 39; a++) for (let b = a + 1; b <= 39; b++) {
      const s = cnt[a][b] + 1e-6 * (tie[a] + tie[b]);
      if (s > best) { best = s; bp = [a, b]; }
    }
    const chosen = [...bp];
    while (chosen.length < 4) {
      let bn = 0, bs = -1;
      for (const x of ALL) {
        if (chosen.includes(x)) continue;
        const s = chosen.reduce((acc, c) => acc + cnt[x][c], 0) + 1e-6 * tie[x];
        if (s > bs) { bs = s; bn = x; }
      }
      chosen.push(bn);
    }
    out.pair = sortNum(chosen);
  }
  { // 區間均衡
    const rng = R('balance');
    const zones = [[1, 10], [11, 20], [21, 30], [31, 39]];
    const par = shuffle([1, 1, 0, 0], rng);
    out.balance = sortNum(zones.map(([lo, hi], i) => {
      const c = ALL.filter(x => x >= lo && x <= hi && x % 2 === par[i]);
      return c[Math.floor(rng() * c.length)];
    }));
  }
  { // 尾數分散
    const rng = R('lastdigit');
    const digits = shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], rng).slice(0, 4);
    out.lastdigit = sortNum(digits.map(d => { const c = ALL.filter(x => x % 10 === d); return c[Math.floor(rng() * c.length)]; }));
  }
  { // 鄰號
    const rng = R('neighbor');
    const last = n ? past[n - 1] : [];
    const cand = new Set();
    for (const x of last) for (const y of [x - 1, x + 1]) if (y >= 1 && y <= 39 && !last.includes(y)) cand.add(y);
    let pool = shuffle([...cand], rng);
    if (pool.length < 4) pool = pool.concat(shuffle(ALL.filter(x => !cand.has(x)), rng));
    out.neighbor = sortNum(pool.slice(0, 4));
  }
  { // 加權隨機
    const rng = R('weighted');
    const w = ALL.map(x => f100[x] + 1);
    const chosen = [];
    for (let k = 0; k < 4; k++) {
      let tot = 0; for (let i = 0; i < 39; i++) if (!chosen.includes(i + 1)) tot += w[i];
      let r = rng() * tot;
      for (let i = 0; i < 39; i++) {
        if (chosen.includes(i + 1)) continue;
        r -= w[i]; if (r <= 0) { chosen.push(i + 1); break; }
      }
      if (chosen.length <= k) chosen.push(ALL.find(x => !chosen.includes(x)));
    }
    out.weighted = sortNum(chosen);
  }
  { // 多策略投票：除了隨機與自己以外的策略
    const votes = new Array(40).fill(0);
    for (const id of ARENA_IDS) if (id !== 'random' && id !== 'ensemble') for (const x of out[id]) votes[x]++;
    out.ensemble = sortNum(topK(votes, 4, R('ensemble')));
  }
  return out;
}

// ---------- 理論分布（隨機 4 碼對 5 個開獎號碼）：超幾何 ----------
function C(n, k) { if (k < 0 || k > n) return 0; let r = 1; for (let i = 1; i <= k; i++) r = r * (n - k + i) / i; return r; }
export const P4 = Array.from({ length: 5 }, (_, k) => C(5, k) * C(34, 4 - k) / C(39, 4));
export const MEAN4 = P4.reduce((a, p, k) => a + p * k, 0); // = 20/39 ≈ 0.5128
export const VAR4 = P4.reduce((a, p, k) => a + p * (k - MEAN4) ** 2, 0);

export function hits(pick, draw) { const s = new Set(draw); return pick.filter(n => s.has(n)).length; }

// ---------- 統計 ----------
function erfc(x) { // Numerical Recipes erfcc，相對誤差 < 1.2e-7
  const z = Math.abs(x), t = 1 / (1 + 0.5 * z);
  const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? r : 2 - r;
}
export const pFromZ = z => erfc(Math.abs(z) / Math.SQRT2); // 雙尾
/** 卡方（df=3）上尾機率：Q(3/2, x/2) = erfc(√(x/2)) + 2√(x/(2π))·e^(−x/2) */
export function pChi2df3(chi2) { const x = chi2 / 2; return erfc(Math.sqrt(x)) + 2 * Math.sqrt(x / Math.PI) * Math.exp(-x); }
/** Holm–Bonferroni 校正後 p 值（保持原順序）。 */
export function holm(ps) {
  const m = ps.length;
  const order = ps.map((p, i) => [p, i]).sort((a, b) => a[0] - b[0]);
  const adj = new Array(m); let run = 0;
  order.forEach(([p, i], k) => { run = Math.max(run, Math.min(1, p * (m - k))); adj[i] = run; });
  return adj;
}
/** dist: 命中 0..4 顆的次數 */
export function statsFromDist(dist) {
  const n = dist.reduce((a, b) => a + b, 0);
  const sum = dist.reduce((a, c, k) => a + c * k, 0);
  const mean = n ? sum / n : 0;
  const z = n ? (sum - n * MEAN4) / Math.sqrt(n * VAR4) : 0;
  const sampleVar = n > 1 ? dist.reduce((a, c, k) => a + c * (k - mean) ** 2, 0) / (n - 1) : VAR4;
  const se = Math.sqrt((n > 1 ? sampleVar : VAR4) / Math.max(n, 1));
  const cats = [dist[0], dist[1], dist[2], dist[3] + dist[4]];
  const pr = [P4[0], P4[1], P4[2], P4[3] + P4[4]];
  const exp = pr.map(p => n * p);
  const chiOk = n > 0 && exp.every(e => e >= 5);
  const chi2 = chiOk ? cats.reduce((a, o, i) => a + (o - exp[i]) ** 2 / exp[i], 0) : null;
  return { n, sum, mean, z, pZ: n ? pFromZ(z) : 1, se, lo: mean - 1.96 * se, hi: mean + 1.96 * se, chi2, pChi: chiOk ? pChi2df3(chi2) : null, dist: dist.slice() };
}
/** 對全部策略做 Holm 校正（Z 檢定＋可用的卡方檢定共同一個家族）。 */
export function evaluateAll(distById, minN = 0) {
  const ids = ARENA_IDS.filter(id => distById[id]);
  const rows = ids.map(id => ({ id, ...statsFromDist(distById[id]) }));
  const ps = []; const idx = [];
  rows.forEach((r, i) => { if (r.n < minN) return; ps.push(r.pZ); idx.push([i, 'z']); if (r.pChi !== null) { ps.push(r.pChi); idx.push([i, 'chi']); } });
  const adj = holm(ps);
  adj.forEach((a, k) => { const [i, t] = idx[k]; if (t === 'z') rows[i].adjZ = a; else rows[i].adjChi = a; });
  rows.forEach(r => {
    r.adjMin = r.n < minN ? null : Math.min(r.adjZ ?? 1, r.adjChi ?? 1);
    r.sig = r.adjMin !== null && r.adjMin < 0.05;
    r.better = r.sig && r.mean > MEAN4;
    r.worse = r.sig && r.mean < MEAN4;
  });
  const n = Math.max(0, ...rows.map(r => r.n));
  // 在 Holm 校正下（最嚴格的門檻 α/m），80% 檢定力能偵測到的最小平均命中差
  let zc = 0, lo = 0, hi = 10; const target = 0.05 / ps.length;
  for (let k = 0; k < 50; k++) { zc = (lo + hi) / 2; if (pFromZ(zc) > target) lo = zc; else hi = zc; }
  const detect = n ? (zc + 0.8416) * Math.sqrt(VAR4 / n) : null;
  if (!ps.length) return { rows, m: 0, detect: null, n };
  return { rows, m: ps.length, detect, n };
}
export function verdictText(ev, minN = 30) {
  if (!ev.n || ev.n < minN) return { kind: 'small', text: `樣本只有 ${ev.n} 期，太少了，無法判斷任何策略是否比隨機好。` };
  const better = ev.rows.filter(r => r.better), worse = ev.rows.filter(r => r.worse);
  if (!better.length && !worse.length) return { kind: 'none', text: `✅ 結論：經 Holm 多重比較校正（共 ${ev.m} 項檢定）後，沒有任何策略顯著優於（或劣於）純隨機理論基準。這符合預期：每期開獎彼此獨立，選號方法不會改變命中機率。` };
  const nm = a => a.map(r => nameOf(r.id)).join('、');
  return { kind: 'diff', text: `${better.length ? `${nm(better)} 在校正後顯著高於隨機基準` : ''}${better.length && worse.length ? '；' : ''}${worse.length ? `${nm(worse)} 顯著低於基準` : ''}。請謹慎：這是事後檢視，且開獎彼此獨立，更可能是資料窺探或統計誤差；請累積新的樣本外資料再驗證，不要據此加碼。` };
}

// ---------- walk-forward 回測 ----------
/** chrono: [{date, numbers}] 由舊到新。第 i 期只用 0..i-1 期的資料選號。前 warm 期只當暖身。 */
export function backtestArena(chrono, warm = WARMUP) {
  const nums = chrono.map(d => d.numbers);
  const dist = Object.fromEntries(ARENA_IDS.map(id => [id, [0, 0, 0, 0, 0]]));
  let evaluated = 0;
  for (let i = warm; i < nums.length; i++) {
    const picks = pickAll(nums.slice(0, i), chrono[i].date);
    for (const id of ARENA_IDS) dist[id][hits(picks[id], nums[i])]++;
    evaluated++;
  }
  return { dist, evaluated, total: nums.length, warm, from: chrono[warm]?.date, to: chrono[chrono.length - 1]?.date };
}

// ---------- 前向（即時）追蹤 ----------
export function validPicks(p) { return p && ARENA_IDS.every(id => validNumbers4(p[id])); }
export function validNumbers4(a) { return Array.isArray(a) && a.length === 4 && new Set(a).size === 4 && a.every(n => Number.isInteger(n) && n >= 1 && n <= 39); }
/** 為 date 這一期建立紀錄：用 date 以前的開獎資料。 */
export async function makeEntry(date, chrono, now = new Date()) {
  const past = chrono.filter(d => d.date < date);
  const picks = pickAll(past.map(d => d.numbers), date);
  const lockedAt = now.toISOString();
  return { drawDate: date, lockedAt, histLast: past.length ? past[past.length - 1].date : null, histCount: past.length, picks, fp: await entryFingerprint(date, lockedAt, picks) };
}
export async function entryFingerprint(date, lockedAt, picks) {
  const text = `${date}|${lockedAt}|` + ARENA_IDS.map(id => `${id}:${picks[id].join(',')}`).join(';');
  if (globalThis.crypto?.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 12);
  }
  let h = 5381; for (const c of text) h = ((h << 5) + h + c.charCodeAt(0)) >>> 0;
  return h.toString(16).padStart(8, '0');
}
/** 只有在開獎日台灣時間 20:30 以前鎖定的紀錄才算前向測試。 */
export function entryCounts(entry) {
  return validPicks(entry.picks) && !isNaN(Date.parse(entry.lockedAt)) && new Date(entry.lockedAt) < cutoffInstant(entry.drawDate);
}
/** 結算：回傳 {dist, settled:[{date, draw, hits:{id:n}}]}（僅計入有效、已開獎者） */
export function settleEntries(entries, drawMap) {
  const dist = Object.fromEntries(ARENA_IDS.map(id => [id, [0, 0, 0, 0, 0]]));
  const settled = [];
  for (const e of entries) {
    if (!entryCounts(e)) continue;
    const draw = drawMap.get(e.drawDate);
    if (!draw) continue;
    const h = {};
    for (const id of ARENA_IDS) { h[id] = hits(e.picks[id], draw.numbers); dist[id][h[id]]++; }
    settled.push({ date: e.drawDate, draw, hits: h, picks: e.picks, fp: e.fp });
  }
  settled.sort((a, b) => (a.date < b.date ? 1 : -1));
  return { dist, settled };
}
