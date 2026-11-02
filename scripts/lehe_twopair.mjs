// 兩組二合各×2（NT$100/期）walk-forward。用法：node scripts/lehe_twopair.mjs
import fs from 'node:fs';
import * as L from '../js/logic.js';
const rd = f => JSON.parse(fs.readFileSync(new URL('../data/' + f, import.meta.url)));
const chrono = L.drawsChrono(L.buildDrawMap(rd('history.json').draws, rd('results.json').draws, {}));
const nums = chrono.map(d => d.numbers), start = 300, end = nums.length, T = end - start, split = T - 200;
const ALL = Array.from({ length: 39 }, (_, k) => k + 1);
const freq = (i, w) => { const c = new Array(40).fill(0); for (let k = i - w; k < i; k++) for (const x of nums[k]) c[x]++; return c; };
const srt = (a, c) => a.slice().sort((x, y) => c[y] - c[x] || x - y);
const co = (i, w) => { const m = new Map(); for (let k = i - w; k < i; k++) { const d = nums[k]; for (let a = 0; a < 5; a++) for (let b = a + 1; b < 5; b++) { const key = Math.min(d[a], d[b]) * 40 + Math.max(d[a], d[b]); m.set(key, (m.get(key) || 0) + 1); } } return [...m].sort((x, y) => y[1] - x[1] || x[0] - y[0]).map(([k]) => [Math.floor(k / 40), k % 40]); };
const same = (p, q) => p[0] + p[1] === q[0] + q[1] && Math.min(...p) === Math.min(...q);
const M = {
  'base 推薦對×4': null,
  'a 推薦對＋上期第3+4熱': (l) => [[l[0], l[1]], [l[2], l[3]]],
  'b 推薦對＋上期第1+3熱': (l) => [[l[0], l[1]], [l[0], l[2]]],
  'b2 推薦對＋上期第2+3熱': (l) => [[l[0], l[1]], [l[1], l[2]]],
  'c 推薦對＋近30期最熱2碼': (l, c) => { const h = srt(ALL, c); let q = [h[0], h[1]]; if (same(q, [l[0], l[1]])) q = [h[0], h[2]]; return [[l[0], l[1]], q]; },
  'd 近60期同開最多2對': (l, c, i) => co(i, 60).slice(0, 2),
  'e 推薦對＋近60期同開最多對': (l, c, i) => { const p = [l[0], l[1]]; const q = co(i, 60).find(q => !same(q, p)); return [p, q]; },
  'f 推薦對＋上期最熱配全期近30最熱（不在上期）': (l, c) => [[l[0], l[1]], [l[0], srt(ALL.filter(x => !l.includes(x)), c)[0]]],
};
const out = [];
for (const [name, fn] of Object.entries(M)) {
  const s = [];
  for (let i = start; i < end; i++) { const c = freq(i, 30), l = srt(nums[i - 1], c), d = new Set(nums[i]);
    const ps = fn ? fn(l, c, i) : [[l[0], l[1]], [l[0], l[1]]];
    s.push(ps.filter(p => d.has(p[0]) && d.has(p[1])).length * 2 * 1125 - 100); }
  let cum = 0, pk = 0, dd = 0, st = 0, ls = 0, wins = 0; for (const v of s) { cum += v; pk = Math.max(pk, cum); dd = Math.max(dd, pk - cum); if (v < 0) { st++; ls = Math.max(ls, st); } else { st = 0; wins++; } }
  const r = s.slice(split).reduce((a, b) => a + b, 0);
  out.push({ name, roi: +(cum / T).toFixed(1), yr: Math.round(cum / T * 312), dd, ls, wins, winRate: +(wins / T * 100).toFixed(1), roi200: +(r / 200).toFixed(1) });
}
console.log(`${T} 期 ${chrono[start].date}～${chrono[end - 1].date}`); console.table(out);
