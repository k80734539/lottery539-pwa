// 純邏輯（無 DOM）：台灣時間、選號、對獎、統計。可在 Node 與瀏覽器執行。
export const PRICE = 50; // 每注（每組）新台幣
export const PRIZES = { 2: 50, 3: 300, 4: 20000, 5: 'jackpot' };
export const JACKPOT_NOMINAL = 8000000; // 頭獎名目金額（官方固定頭獎 800 萬；實際依官方公告）
export const CUTOFF_MIN = 20 * 60 + 30; // 20:30 台灣時間
export const STRATEGIES = {
  random: '純隨機',
  hotcold: '冷熱混合',
  coverage: '覆蓋最大化',
  manual: '手動輸入',
};
export const BASE_STRATEGIES = ['random', 'hotcold', 'coverage'];

// ---------- 台灣時間 ----------
const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Taipei', hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
});
export function twNow(now = new Date()) {
  const p = Object.fromEntries(fmt.formatToParts(now).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: +p.hour * 60 + +p.minute, hour: +p.hour, minute: +p.minute };
}
export function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function dow(dateStr) { return new Date(dateStr + 'T00:00:00Z').getUTCDay(); } // 0=日
export const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
export function isDrawDay(dateStr) { return dow(dateStr) !== 0; } // 週一至週六開獎
export function cutoffInstant(dateStr) { return new Date(`${dateStr}T20:30:00+08:00`); }
export function cutoffPassed(dateStr, now = new Date()) { return now.getTime() >= cutoffInstant(dateStr).getTime(); }
/** 目前可選號／鎖定的下一個開獎日 */
export function nextDrawDate(now = new Date()) {
  const t = twNow(now);
  let d = t.date;
  if (!isDrawDay(d) || t.minutes >= CUTOFF_MIN) {
    d = addDays(d, 1);
    while (!isDrawDay(d)) d = addDays(d, 1);
  }
  return d;
}
export function monthOf(dateStr) { return dateStr.slice(0, 7); }

// ---------- 隨機 ----------
export function cryptoRng() {
  const buf = new Uint32Array(1);
  return () => { crypto.getRandomValues(buf); return buf[0] / 4294967296; };
}
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function pickOne(arr, rng) { return arr[Math.floor(rng() * arr.length)]; }
function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const ALL = Array.from({ length: 39 }, (_, i) => i + 1);
const sortNum = a => a.slice().sort((x, y) => x - y);

// ---------- 三種基準策略 ----------
export function randomSet(rng) { return sortNum(shuffle(ALL, rng).slice(0, 5)); }

/** draws：由舊到新的號碼陣列。冷熱混合：近 window 期最熱 10 碼取 2、遺漏最久 10 碼取 2、其餘任取 1。 */
export function hotColdSet(draws, rng, window = 100) {
  const recent = draws.slice(-window);
  if (recent.length < 10) return randomSet(rng);
  const freq = new Array(40).fill(0);
  for (const d of recent) for (const n of d) freq[n]++;
  const omit = new Array(40).fill(draws.length);
  for (let i = draws.length - 1, step = 0; i >= 0; i--, step++) {
    for (const n of draws[i]) if (omit[n] === draws.length) omit[n] = step;
  }
  const byHot = ALL.slice().sort((a, b) => freq[b] - freq[a] || a - b);
  const byCold = ALL.slice().sort((a, b) => omit[b] - omit[a] || a - b);
  const chosen = new Set();
  const take = (pool, k) => {
    const cand = shuffle(pool.filter(n => !chosen.has(n)), rng);
    for (const n of cand.slice(0, k)) chosen.add(n);
  };
  take(byHot.slice(0, 10), 2);
  take(byCold.slice(0, 10), 2);
  take(ALL.filter(n => !byHot.slice(0, 10).includes(n) && !byCold.slice(0, 10).includes(n)), 1);
  if (chosen.size < 5) take(ALL, 5 - chosen.size);
  return sortNum([...chosen]);
}

/** 覆蓋最大化：避開 used（其他組已用號碼），並盡量平均分布在 1-10/11-20/21-30/31-39 四個區間。 */
export function coverageSet(used, rng) {
  const zoneOf = n => (n <= 10 ? 0 : n <= 20 ? 1 : n <= 30 ? 2 : 3);
  const usedSet = new Set(used);
  const chosen = [];
  const zoneCount = [0, 0, 0, 0];
  const usedZone = [0, 0, 0, 0];
  for (const n of usedSet) usedZone[zoneOf(n)]++;
  while (chosen.length < 5) {
    let pool = ALL.filter(n => !usedSet.has(n) && !chosen.includes(n));
    if (pool.length === 0) pool = ALL.filter(n => !chosen.includes(n));
    // 優先選目前（本組＋他組）最少出現的區間
    const score = z => zoneCount[z] * 2 + usedZone[z] * 0.01;
    const minScore = Math.min(...pool.map(n => score(zoneOf(n))));
    const best = pool.filter(n => score(zoneOf(n)) === minScore);
    const n = pickOne(best, rng);
    chosen.push(n); zoneCount[zoneOf(n)]++;
  }
  return sortNum(chosen);
}

/** 產生一批 3 組（每種策略各 1 組），順序打亂以利盲測。 */
export function generateBatch(draws, rng) {
  const a = randomSet(rng);
  const b = hotColdSet(draws, rng);
  const c = coverageSet([...a, ...b], rng);
  return shuffle([
    { strategy: 'random', numbers: a },
    { strategy: 'hotcold', numbers: b },
    { strategy: 'coverage', numbers: c },
  ], rng);
}
export function regenerateSet(strategy, draws, rng, otherSets = []) {
  const used = otherSets.flat();
  if (strategy === 'hotcold') return hotColdSet(draws, rng);
  if (strategy === 'coverage') return coverageSet(used, rng);
  return randomSet(rng);
}

// ---------- 驗證／對獎 ----------
export function validNumbers(nums) {
  return Array.isArray(nums) && nums.length === 5 && new Set(nums).size === 5 && nums.every(n => Number.isInteger(n) && n >= 1 && n <= 39);
}
export function matchCount(set, draw) { const s = new Set(draw); return set.filter(n => s.has(n)).length; }
export function prizeFor(matches) { return PRIZES[matches] ?? 0; }
export function prizeAmount(matches) { const p = prizeFor(matches); return p === 'jackpot' ? JACKPOT_NOMINAL : p; }
export function fmtNums(nums) { return nums.map(n => String(n).padStart(2, '0')).join(' '); }
export function money(n) { return (n < 0 ? '-' : '') + 'NT$' + Math.abs(Math.round(n)).toLocaleString('en-US'); }

/** 合併開獎資料：優先順序 官方(history/results) > 手動。回傳 Map date -> {issue,date,numbers,source} */
export function buildDrawMap(history = [], remote = [], manual = {}) {
  const map = new Map();
  for (const [date, numbers] of Object.entries(manual)) if (validNumbers(numbers)) map.set(date, { issue: '', date, numbers: sortNum(numbers), source: 'manual' });
  for (const h of history) map.set(h[1], { issue: h[0], date: h[1], numbers: h[2], source: 'history' });
  for (const r of remote) if (validNumbers(r.numbers)) map.set(r.date, { issue: r.issue, date: r.date, numbers: sortNum(r.numbers), source: 'remote' });
  return map;
}
export function drawsChrono(map) { return [...map.values()].sort((a, b) => (a.date < b.date ? -1 : 1)); }

// ---------- 批次狀態 ----------
/** 狀態：draft 草稿 / locked 已鎖定等待開獎 / settled 已對獎 / expired 逾時未鎖定 / void 該日無開獎 */
export function batchStatus(batch, drawMap, now = new Date()) {
  const draw = drawMap.get(batch.drawDate);
  if (batch.lockedAt) {
    if (draw) return 'settled';
    const latest = latestDate(drawMap);
    if (latest && latest > batch.drawDate) return 'void';
    return 'locked';
  }
  if (cutoffPassed(batch.drawDate, now)) return 'expired';
  return 'draft';
}
export function latestDate(drawMap) { let m = ''; for (const k of drawMap.keys()) if (k > m) m = k; return m; }
export function settleBatch(batch, drawMap) {
  const draw = drawMap.get(batch.drawDate);
  if (!draw) return null;
  const sets = batch.sets.map(s => {
    const m = matchCount(s.numbers, draw.numbers);
    return { ...s, matches: m, prize: prizeFor(m), amount: s.bought === false ? 0 : prizeAmount(m), hitNumbers: s.numbers.filter(n => draw.numbers.includes(n)) };
  });
  return { draw, sets, spend: batch.sets.filter(s => s.bought !== false).length * PRICE, win: sets.reduce((a, s) => a + s.amount, 0) };
}

export function summarize(batches, drawMap, now = new Date()) {
  const out = { spendSettled: 0, win: 0, spendPending: 0, byMonth: {}, jackpots: 0, prizeCounts: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } };
  for (const b of batches) {
    const st = batchStatus(b, drawMap, now);
    const m = monthOf(b.drawDate);
    out.byMonth[m] ??= { spend: 0, win: 0 };
    const bought = b.sets.filter(s => s.bought !== false).length * PRICE;
    if (st === 'locked') { out.spendPending += bought; out.byMonth[m].spend += bought; }
    if (st === 'settled') {
      const r = settleBatch(b, drawMap);
      out.spendSettled += r.spend; out.win += r.win;
      out.byMonth[m].spend += r.spend; out.byMonth[m].win += r.win;
      for (const s of r.sets) { out.prizeCounts[s.matches]++; if (s.matches === 5) out.jackpots++; }
    }
  }
  out.spend = out.spendSettled + out.spendPending;
  out.net = out.win - out.spendSettled; // 淨損益僅計已開獎
  out.roi = out.spendSettled > 0 ? out.net / out.spendSettled : null;
  return out;
}

export function budgetState(committedThisMonth, cap) {
  if (!cap || cap <= 0) return { level: 'off', ratio: 0 };
  const ratio = committedThisMonth / cap;
  return { level: ratio >= 1 ? 'over' : ratio >= 0.8 ? 'warn' : 'ok', ratio };
}

// ---------- 策略盲測統計 ----------
function C(n, k) { if (k < 0 || k > n) return 0; let r = 1; for (let i = 1; i <= k; i++) r = r * (n - k + i) / i; return r; }
export const HYPER_P = Array.from({ length: 6 }, (_, k) => C(5, k) * C(34, 5 - k) / C(39, 5)); // 隨機一組命中 k 顆的機率
export const HYPER_MEAN = HYPER_P.reduce((a, p, k) => a + p * k, 0); // = 25/39
export const HYPER_VAR = HYPER_P.reduce((a, p, k) => a + p * (k - HYPER_MEAN) ** 2, 0);
export const P_GE2 = HYPER_P[2] + HYPER_P[3] + HYPER_P[4] + HYPER_P[5];

export function compareStats(matchList) {
  const n = matchList.length;
  const sum = matchList.reduce((a, b) => a + b, 0);
  const mean = n ? sum / n : 0;
  const z = n ? (sum - n * HYPER_MEAN) / Math.sqrt(n * HYPER_VAR) : 0;
  const ge2 = matchList.filter(m => m >= 2).length;
  const zGe2 = n ? (ge2 - n * P_GE2) / Math.sqrt(n * P_GE2 * (1 - P_GE2)) : 0;
  return { n, mean, z, ge2, zGe2, expected: HYPER_MEAN, expectedGe2: P_GE2 };
}
/** 3 種策略 × 2 個指標共 6 次檢定，用 Bonferroni 校正（α=0.05/6 → |z|≥2.64 才算顯著）。 */
export const Z_CRIT = 2.64;
export function verdict(stats) {
  if (stats.n < 30) return { kind: 'small', text: `樣本只有 ${stats.n} 組（至少需要數十組以上才有意義），目前無法判斷任何差異。` };
  if (Math.abs(stats.z) < Z_CRIT && Math.abs(stats.zGe2) < Z_CRIT) return { kind: 'none', text: '與純隨機的理論基準沒有顯著差異（這是預期中的結果：開獎彼此獨立）。' };
  return { kind: 'diff', text: '統計上出現差異。但這是反覆檢查、事後挑選的結果，且開獎彼此獨立，更可能是偶然；請勿據此加碼，建議累積更多樣本再看。' };
}

/** 歷史回測：對每一期，用「該期以前」的資料各策略出 1 組，對照該期開獎。 */
export function backtest(chrono, rng, minHistory = 100) {
  const nums = chrono.map(d => d.numbers);
  const res = { random: [], hotcold: [], coverage: [] };
  for (let i = minHistory; i < nums.length; i++) {
    const batch = generateBatch(nums.slice(0, i), rng);
    for (const s of batch) res[s.strategy].push(matchCount(s.numbers, nums[i]));
  }
  return res;
}

// ---------- 指紋（鎖定的防竄改紀錄） ----------
export async function fingerprint(drawDate, sets, lockedAt) {
  const text = `${drawDate}|${lockedAt}|` + sets.map(s => s.numbers.join(',')).join(';');
  if (globalThis.crypto?.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 12);
  }
  let h = 5381; for (const c of text) h = ((h << 5) + h + c.charCodeAt(0)) >>> 0;
  return h.toString(16).padStart(8, '0');
}
