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
