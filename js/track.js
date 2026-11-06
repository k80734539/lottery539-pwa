// 追蹤分析：論壇 K3km8000 的報號 vs 開獎，重點看「沒中但差 1 號」（純函式，可測試）
export const WINDOW = 20;
export const PREF = [1, 4, 5, 2, 3]; // 同分時的位置優先順序（依 20 期觀察：第 1、4 個最常，再來第 5 個）
export function normIssue(p) { const t = String(p ?? '').trim(); return /^\d{9}$/.test(t) ? t.slice(0, 3) + t.slice(-3) : t; }
/** draws：[{issue,date,numbers}] → Map(期別 → draw) */
export function issueMap(draws) { const m = new Map(); for (const d of draws) if (d && d.issue) m.set(normIssue(d.issue), d); return m; }
/** 單期對照：picks 5 碼（由小到大，位置 1–5）vs 開獎 5 碼 */
export function compare(picks, draw) {
  const ds = new Set(draw);
  const hits = [], near = [];
  picks.forEach((n, i) => {
    if (ds.has(n)) { hits.push({ pos: i + 1, n }); return; }
    const up = ds.has(n + 1), dn = ds.has(n - 1);
    if (up || dn) near.push({ pos: i + 1, n, dir: up && dn ? 0 : up ? 1 : -1, to: [dn && n - 1, up && n + 1].filter(Boolean) });
  });
  return { hits, near };
}
/** 依期別排序的列：{issue, picks, draw|null, date|null, hits, near} */
export function buildRows(pickMap, imap) {
  return Object.keys(pickMap).sort().map(issue => {
    const picks = [...pickMap[issue]].sort((a, b) => a - b), d = imap.get(issue) || null;
    return { issue, picks, draw: d ? d.numbers : null, date: d ? d.date : null, ...(d ? compare(picks, d.numbers) : { hits: [], near: [] }) };
  });
}
const consecutive = (a, b) => a.slice(0, 3) === b.slice(0, 3) && +b - +a === 1;
/** 最近 n 期（已開獎）的差 1 統計，以及「這期有差 1 → 下期差 1 落在哪個位置」 */
export function analyze(rows, n = WINDOW) {
  const settled = rows.filter(r => r.draw).slice(-n);
  const pos = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, dirByPos = Object.fromEntries([1, 2, 3, 4, 5].map(p => [p, { up: 0, down: 0, both: 0 }]));
  let total = 0, withNear = 0, hitsTotal = 0, up = 0, down = 0, both = 0;
  for (const r of settled) {
    hitsTotal += r.hits.length; if (r.near.length) withNear++;
    for (const x of r.near) { total++; pos[x.pos]++; if (x.dir === 1) { up++; dirByPos[x.pos].up++; } else if (x.dir === -1) { down++; dirByPos[x.pos].down++; } else { both++; dirByPos[x.pos].both++; } }
  }
  const nextPos = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }; let signals = 0, again = 0;
  for (let i = 0; i + 1 < settled.length; i++) {
    const a = settled[i], b = settled[i + 1];
    if (!consecutive(a.issue, b.issue) || !a.near.length) continue;
    signals++; if (b.near.length) again++;
    for (const x of b.near) nextPos[x.pos]++;
  }
  return { draws: settled.length, from: settled[0]?.issue, to: settled.at(-1)?.issue, total, withNear, hitsTotal, pos, up, down, both, dirByPos, nextPos, signals, again };
}
const rank = cnt => [1, 2, 3, 4, 5].sort((a, b) => cnt[b] - cnt[a] || PREF.indexOf(a) - PREF.indexOf(b));
/** 隔天可盯：挑下期差 1 最常落到的位置（前 2 個為主、第 3 個備選），列出他這期報號在該位置的 ±1 */
export function suggestNext(picks, stats) {
  if (!picks || picks.length !== 5) return null;
  const order = stats && stats.signals ? rank(stats.nextPos) : PREF.slice();
  const mk = (p, main) => {
    const n = picks[p - 1], d = stats ? stats.dirByPos[p] : { up: 0, down: 0 };
    const lean = d.down > d.up ? -1 : d.up > d.down ? 1 : 0;
    const cands = [n - 1, n + 1].filter(x => x >= 1 && x <= 39);
    const nums = lean === 1 ? cands.slice().reverse() : cands; // 偏向的方向排前面
    return { pos: p, n, nums, lean, main, dir: d, nextCount: stats ? stats.nextPos[p] : 0 };
  };
  const spots = [mk(order[0], true), mk(order[1], true), mk(order[2], false)];
  const four = [...new Set(spots.filter(s => s.main).flatMap(s => s.nums))].sort((a, b) => a - b);
  return { spots, four, order };
}
