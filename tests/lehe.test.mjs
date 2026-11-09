import assert from 'node:assert/strict';
import * as H from '../js/lehe.js';
assert.equal(H.C(4, 2), 6); assert.equal(H.C(4, 3), 4); assert.equal(H.C(4, 4), 1);
assert.ok(Math.abs(H.P_HIT[2] - 10 / 741) < 1e-12);
assert.ok(Math.abs(H.P_HIT[3] - 10 / 9139) < 1e-12);
assert.ok(Math.abs(H.P_HIT[4] - 5 / 82251) < 1e-12);
const e = { drawDate: '2026-10-31', numbers: [2, 5, 17, 30], plays: [2, 3, 4], bought: true };
assert.equal(H.entryCost(e), (6 + 4 + 1) * 25);
const r = H.settle(e, { numbers: [2, 5, 17, 28, 37] });
assert.equal(r.byPlay[2].hits, 3); assert.equal(r.byPlay[3].hits, 1); assert.equal(r.byPlay[4].hits, 0);
assert.equal(r.win, 3 * 1125 + 11250); assert.equal(r.cost, 275);
const nb = H.settle({ ...e, bought: false }, { numbers: [2, 5, 17, 28, 37] });
assert.equal(nb.cost, 0); assert.equal(nb.win, 0); assert.equal(nb.byPlay[2].hits, 3);
const m = new Map([['2026-10-31', { numbers: [2, 5, 17, 28, 37] }]]);
const s = H.summarize([e, { ...e, drawDate: '2026-11-02' }], m);
assert.equal(s.spent, 275); assert.equal(s.pending, 275); assert.equal(s.byPlay[2].tickets, 6);
const a = H.arenaLehe([{ hits: { x: 3, y: 4 } }], ['x', 'y']);
assert.deepEqual(a.x, { draws: 1, 2: 3, 3: 1, 4: 0 }); assert.deepEqual(a.y, { draws: 1, 2: 6, 3: 4, 4: 1 });
assert.equal(H.combos([1, 2, 3, 4, 5], 2).length, 10);
console.log('lehe tests ok');
{
  const dm = new Map([['2026-11-02', { numbers: [1, 2, 3, 10, 11] }], ['2026-11-03', { numbers: [20, 21, 22, 23, 24] }]]);
  const pl = H.plSeries([{ drawDate: '2026-11-02', numbers: [1, 2], plays: [2] }, { drawDate: '2026-11-03', numbers: [1, 2], plays: [2] }, { drawDate: '2026-11-03', numbers: [5, 6], plays: [2], bought: false }], dm);
  assert.deepEqual(pl.dates, ['2026-11-02', '2026-11-03']); assert.deepEqual(pl.values, [1100, 1075]);
  const ap = H.arenaPLSeries([{ date: '2026-11-03', hits: { a: 0 } }, { date: '2026-11-02', hits: { a: 2 } }], ['a']);
  assert.equal(ap.costPerDraw, 275); assert.deepEqual(ap.byId.a, [1125 - 275, 1125 - 550]);
  console.log('lehe chart series ok');
}
{
  const e4 = { drawDate: 'x', numbers: [2, 28], plays: [2], mult: 4 };
  assert.equal(H.entryCost(e4), 100);
  const r4 = H.settle(e4, { numbers: [2, 5, 17, 28, 37] }); assert.equal(r4.win, 4 * 1125); assert.equal(r4.byPlay[2].tickets, 4);
  const { suggest } = await import('../js/suggest.js');
  const fs = await import('node:fs'); const L = await import('../js/logic.js');
  const rd = f => JSON.parse(fs.readFileSync(new URL('../data/' + f, import.meta.url)));
  const ch = L.drawsChrono(L.buildDrawMap(rd('history.json').draws, rd('results.json').draws, {}));
  const n = ch.map(d => d.numbers), i = ch.findIndex(d => d.date === '2026-10-31');
  const g = suggest(n.slice(0, i + 1), '2026-11-02');
  assert.deepEqual(g.pair, [28, 2]); assert.equal(g.tris.length, 2); g.tris.forEach(t => t.forEach(x => assert.ok(g.weighted.includes(x))));
  // 和研究腳本的配對（上期 5 碼依近30期次數排序、同次數小號優先）一致：最近 100 期
  for (let j = n.length - 100; j < n.length; j++) { const c = new Array(40).fill(0); for (let k = j - 30; k < j; k++) for (const x of n[k]) c[x]++; const l = n[j - 1].slice().sort((a, b) => c[b] - c[a] || a - b); assert.deepEqual(suggest(n.slice(0, j), ch[j].date).pair, [l[0], l[1]]); }
  console.log('lehe suggest ok');
}

{
  const { suggest, buildSugB } = await import('../js/suggest.js');
  const fs = await import('node:fs'); const L = await import('../js/logic.js');
  const rd = f => JSON.parse(fs.readFileSync(new URL('../data/' + f, import.meta.url)));
  const ch = L.drawsChrono(L.buildDrawMap(rd('history.json').draws, rd('results.json').draws, {}));
  const date = '2026-11-09';
  const past = ch.filter(d => d.date < date);
  const g = suggest(past.map(d => d.numbers), date);
  const sets = buildSugB(g, date);
  assert.equal(sets.length, 3);
  assert.deepEqual(sets[0], { id: 'sug_b:2026-11-09:pair', numbers: [24, 32], plays: [2], mult: 2 });
  assert.equal(sets[1].plays[0], 3); assert.equal(sets[1].numbers.length, 3);
  assert.equal(sets[2].plays[0], 3);
  // 只用目標日之前的獎號：多塞一筆當日假開獎也不該改變建議
  const leak = suggest([...past.map(d => d.numbers), [1, 2, 3, 4, 5]], date);
  assert.notDeepEqual(buildSugB(leak, date)[0].numbers, sets[0].numbers); // 若誤用當日會不同；腳本必須先 filter
  const g2 = suggest(past.map(d => d.numbers), date);
  assert.deepEqual(buildSugB(g2, date), sets);
  // 與手動 lh-sug b 結構一致
  assert.equal(sets[0].mult, 2); assert.equal(sets.filter(s => s.plays[0] === 3).length, 2);
  // 鎖定檔存在且不可覆寫語意：同日再跑腳本應 exists（整合測由腳本 exit 驗證）
  const pack = rd('lehe_picks.json').entries.find(e => e.drawDate === date);
  assert.ok(pack); assert.equal(pack.template, 'sug_b'); assert.equal(pack.sets.length, 3);
  assert.equal(pack.bought, undefined); // 花費由 App 合併時 bought:false
  assert.deepEqual(pack.sets[0].numbers, [24, 32]);
  console.log('lehe sug_b auto lock ok');
}

