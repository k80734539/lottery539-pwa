// 樂合「建議買法」：依 scripts/lehe_research.mjs / lehe_mix_search.mjs 的回測結果（純函式，可測試）
import { pickAll } from './arena.js';
const ALL = Array.from({ length: 39 }, (_, k) => k + 1);
function freq30(nums) { const c = new Array(40).fill(0); for (let k = Math.max(0, nums.length - 30); k < nums.length; k++) for (const x of nums[k]) c[x]++; return c; }
const srt = (a, c) => a.slice().sort((x, y) => c[y] - c[x] || x - y);
const heat = (t, c) => t.reduce((s, x) => s + c[x], 0);
function sub(a, k) { const o = []; (function r(s, cur) { if (cur.length === k) return o.push(cur.slice()); for (let i = s; i < a.length; i++) { cur.push(a[i]); r(i + 1, cur); cur.pop(); } })(0, []); return o; }
/** nums：依時間排序的每期 5 碼（最後一筆＝最新一期）；date：下一期開獎日 */
export function suggest(nums, date) {
  if (nums.length < 30) return null;
  const c = freq30(nums), last = srt(nums.at(-1), c);
  const pair = [last[0], last[1]];
  const w = pickAll(nums, date).o_weighted || [];
  const tris = sub(w.slice().sort((a, b) => a - b), 3).sort((x, y) => heat(y, c) - heat(x, c) || (x.join() < y.join() ? -1 : 1)).slice(0, 2);
  return { pair, weighted: w, tris, counts: Object.fromEntries(nums.at(-1).map(x => [x, c[x]])) };
}
