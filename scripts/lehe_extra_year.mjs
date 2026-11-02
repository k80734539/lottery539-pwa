// 多一年樣本外檢驗：data/history_extra.json（2020-01～2022-07-11）＋原資料。用法：node scripts/lehe_extra_year.mjs
import fs from 'node:fs';
import * as L from '../js/logic.js';
import * as A from '../js/arena.js';
const rd = f => JSON.parse(fs.readFileSync(new URL('../data/' + f, import.meta.url)));
const ex = rd('history_extra.json').draws;
for (const [, , n] of ex) if (n.length !== 5 || new Set(n).size !== 5 || n.some(x => x < 1 || x > 39)) throw Error('bad ' + n);
for (let k = 1; k < ex.length; k++) { const a = +ex[k - 1][0], b = +ex[k][0]; if (b !== a + 1 && !(b % 1000 === 1)) console.log('issue gap', ex[k - 1][0], ex[k][0]); }
const chrono = L.drawsChrono(L.buildDrawMap([...ex, ...rd('history.json').draws], rd('results.json').draws, {}));
const nums = chrono.map(d => d.numbers), dates = chrono.map(d => d.date);
const ALL = Array.from({ length: 39 }, (_, k) => k + 1);
const freq = (i, w) => { const c = new Array(40).fill(0); for (let k = i - w; k < i; k++) for (const x of nums[k]) c[x]++; return c; };
const srt = (a, c) => a.slice().sort((x, y) => c[y] - c[x] || x - y);
const sub = (a, k) => { const o = []; (function r(s, cur) { if (cur.length === k) return o.push(cur.slice()); for (let i = s; i < a.length; i++) { cur.push(a[i]); r(i + 1, cur); cur.pop(); } })(0, []); return o; };
const heat = (t, c) => t.reduce((s, x) => s + c[x], 0);
const co = (i, w) => { const m = new Map(); for (let k = i - w; k < i; k++) for (const p of sub(nums[k], 2)) { const key = p[0] * 40 + p[1]; m.set(key, (m.get(key) || 0) + 1); } return [...m].sort((x, y) => y[1] - x[1] || x[0] - y[0]).map(([k]) => [Math.floor(k / 40), k % 40]); };
const hit = (t, d) => t.every(x => d.has(x));
const i0 = dates.indexOf('2021-07-12') >= 0 ? dates.findIndex(d => d >= '2021-07-12') : -1, iOrig = dates.indexOf('2023-06-27');
const S = { base: [], e: [], mix: [] };
for (let i = i0; i < nums.length; i++) {
  const c = freq(i, 30), l = srt(nums[i - 1], c), d = new Set(nums[i]), p = [l[0], l[1]];
  S.base.push((hit(p, d) ? 4 * 1125 : 0) - 100);
  const q = co(i, 60).find(q => !(q[0] === Math.min(...p) && q[1] === Math.max(...p)));
  S.e.push((hit(p, d) ? 2250 : 0) + (hit(q, d) ? 2250 : 0) - 100);
  const w = A.pickAll(nums.slice(0, i), dates[i]).o_weighted;
  const ts = sub(w.slice().sort((a, b) => a - b), 3).sort((x, y) => heat(y, c) - heat(x, c) || (x.join() < y.join() ? -1 : 1)).slice(0, 2);
  S.mix.push((hit(p, d) ? 2250 : 0) + ts.filter(t => hit(t, d)).length * 11250 - 100);
}
const st = s => { let cum = 0, pk = 0, dd = 0, run = 0, ls = 0, w = 0; for (const v of s) { cum += v; pk = Math.max(pk, cum); dd = Math.max(dd, pk - cum); if (v < 0) { run++; ls = Math.max(ls, run); } else { run = 0; w++; } } return { n: s.length, roi: (cum / s.length).toFixed(1) + '%', yr: Math.round(cum / s.length * 312), dd, ls, wins: w }; };
const cut = iOrig - i0, cutY = dates.findIndex(d => d >= '2022-07-12') - i0;
console.log('extra draws', ex.length, ex[0][1], ex.at(-1)[1], '| test from', dates[i0], '| orig from', dates[iOrig]);
const out = [];
for (const k in S) out.push({ k, span: '新一年 2021-07-12～2022-07-11', ...st(S[k].slice(0, cutY)) }, { k, span: '銜接 2022-07-12～2023-06-26', ...st(S[k].slice(cutY, cut)) }, { k, span: '原 1,055 期', ...st(S[k].slice(cut)) }, { k, span: '全部延長', ...st(S[k]) });
console.table(out);
