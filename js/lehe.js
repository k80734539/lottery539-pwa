// 39樂合彩：用同期今彩539的 5 個獎號對獎（純函式，可測試）
// 官方規則（請以台灣彩券公告為準）：每注 NT$25；二合 1,125、三合 11,250、四合 212,500（固定獎金，超過單期上限改均分）。
export const DEFAULT_SETTINGS = { price: 25, prizes: { 2: 1125, 3: 11250, 4: 212500 } };
export const PLAYS = [2, 3, 4];
export const PLAY_NAME = { 2: '二合', 3: '三合', 4: '四合' };
export const MAX_NUMS = 10;
export function C(n, k) { if (k < 0 || k > n) return 0; let r = 1; for (let i = 1; i <= k; i++) r = r * (n - k + i) / i; return Math.round(r); }
/** 單注中獎機率：C(5,k)/C(39,k) */
export const P_HIT = { 2: C(5, 2) / C(39, 2), 3: C(5, 3) / C(39, 3), 4: C(5, 4) / C(39, 4) }; // 10/741, 10/9139, 5/82251
export function combos(nums, k) {
  const a = [...nums].sort((x, y) => x - y), out = [];
  const rec = (s, cur) => { if (cur.length === k) { out.push(cur.slice()); return; } for (let i = s; i < a.length; i++) { cur.push(a[i]); rec(i + 1, cur); cur.pop(); } };
  rec(0, []); return out;
}
export function validEntryNums(nums) { return Array.isArray(nums) && nums.length >= 2 && nums.length <= MAX_NUMS && new Set(nums).size === nums.length && nums.every(n => Number.isInteger(n) && n >= 1 && n <= 39); }
export function validPlays(plays, n) { return Array.isArray(plays) && plays.length > 0 && plays.every(k => PLAYS.includes(k) && k <= n); }
/** 每種玩法的注數 */
export function ticketCount(nums, plays) { return Object.fromEntries(plays.map(k => [k, C(nums.length, k)])); }
export function entryCost(entry, settings = DEFAULT_SETTINGS) { return Object.values(ticketCount(entry.numbers, entry.plays)).reduce((a, b) => a + b, 0) * settings.price; }
/** 結算：回傳 {draw, hitNumbers, byPlay:{k:{tickets, hits, hitCombos, win}}, cost, win} */
export function settle(entry, draw, settings = DEFAULT_SETTINGS) {
  if (!draw) return null;
  const ds = new Set(draw.numbers);
  const hitNumbers = entry.numbers.filter(n => ds.has(n));
  const byPlay = {};
  let win = 0, cost = 0;
  for (const k of entry.plays) {
    const tickets = C(entry.numbers.length, k);
    const hitCombos = combos(hitNumbers, k);
    const w = entry.bought === false ? 0 : hitCombos.length * (settings.prizes[k] || 0);
    byPlay[k] = { tickets, hits: hitCombos.length, hitCombos, win: w };
    win += w; cost += tickets * settings.price;
  }
  if (entry.bought === false) cost = 0;
  return { draw, hitNumbers, byPlay, cost, win };
}
/** 累計：只計已開獎；花費／獎金只計有買；命中率計所有已開獎（含沒買，因為是觀察號碼） */
export function summarize(entries, drawMap, settings = DEFAULT_SETTINGS) {
  const out = { spent: 0, won: 0, pending: 0, settled: 0, byPlay: Object.fromEntries(PLAYS.map(k => [k, { tickets: 0, hits: 0, boughtTickets: 0, boughtHits: 0 }])) };
  for (const e of entries) {
    const d = drawMap.get(e.drawDate);
    if (!d) { if (e.bought !== false) out.pending += entryCost(e, settings); continue; }
    const r = settle(e, d, settings); out.settled++;
    out.spent += r.cost; out.won += r.win;
    for (const k of e.plays) {
      const p = out.byPlay[k]; p.tickets += r.byPlay[k].tickets; p.hits += r.byPlay[k].hits;
      if (e.bought !== false) { p.boughtTickets += r.byPlay[k].tickets; p.boughtHits += r.byPlay[k].hits; }
    }
  }
  return out;
}
/** 擂台策略的 4 碼若拿去包二合/三合/四合，各會中幾注。settled 來自 arena.settleEntries */
export function arenaLehe(settled, ids) {
  const out = Object.fromEntries(ids.map(id => [id, { draws: 0, 2: 0, 3: 0, 4: 0 }]));
  for (const st of settled) for (const id of ids) {
    const h = st.hits[id]; const o = out[id]; o.draws++;
    o[2] += C(h, 2); o[3] += C(h, 3); o[4] += C(h, 4);
  }
  return out;
}
/** 4 碼一期的期望中獎注數 */
export const EXPECT4 = { 2: 6 * P_HIT[2], 3: 4 * P_HIT[3], 4: 1 * P_HIT[4] };
/** 已開獎、有買的紀錄依開獎日累計淨損益：{dates, values} */
export function plSeries(entries, drawMap, settings = DEFAULT_SETTINGS) {
  const byDate = new Map();
  for (const e of entries) {
    if (e.bought === false) continue; const d = drawMap.get(e.drawDate); if (!d) continue;
    const r = settle(e, d, settings); byDate.set(e.drawDate, (byDate.get(e.drawDate) || 0) + r.win - r.cost);
  }
  const dates = [...byDate.keys()].sort(); let c = 0;
  return { dates, values: dates.map(d => (c += byDate.get(d))) };
}
/** 擂台每個策略 4 碼若每期都包二合+三合+四合（11 注）的累計模擬損益。settled 任意順序 */
export function arenaPLSeries(settled, ids, settings = DEFAULT_SETTINGS) {
  const chrono = [...settled].sort((a, b) => (a.date < b.date ? -1 : 1));
  const cost = (C(4, 2) + C(4, 3) + C(4, 4)) * settings.price;
  const byId = Object.fromEntries(ids.map(id => [id, []])); const cum = Object.fromEntries(ids.map(id => [id, 0]));
  for (const st of chrono) for (const id of ids) {
    const h = st.hits[id]; cum[id] += C(h, 2) * settings.prizes[2] + C(h, 3) * settings.prizes[3] + C(h, 4) * settings.prizes[4] - cost; byId[id].push(cum[id]);
  }
  return { dates: chrono.map(s => s.date), byId, costPerDraw: cost };
}
