import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as L from '../js/logic.js';
import * as T from '../js/track.js';
const rd = f => JSON.parse(fs.readFileSync(new URL('../data/' + f, import.meta.url)));
// 單期對照
const c = T.compare([1, 16, 25, 28, 31], [20, 28, 32, 36, 37]);
assert.deepEqual(c.hits, [{ pos: 4, n: 28 }]);
assert.deepEqual(c.near, [{ pos: 5, n: 31, dir: 1, to: [32] }]);
assert.equal(T.compare([34], [33, 35]).near[0].dir, 0);
assert.equal(T.normIssue('115000268'), '115268');
// 用真實資料：截至 115268 的最近 20 期
const map = L.buildDrawMap(rd('history.json').draws, rd('results.json').draws, {});
const kp = rd('k3km8000_picks.json');
const upto = Object.fromEntries(Object.entries(kp.picks).filter(([k]) => k <= '115269'));
const rows = T.buildRows(upto, T.issueMap(L.drawsChrono(map)));
const st = T.analyze(rows, 20);
assert.equal(st.to, '115268'); assert.equal(st.total, 21); assert.equal(st.withNear, 16);
assert.deepEqual(st.pos, { 1: 6, 2: 3, 3: 2, 4: 5, 5: 5 });
assert.equal(st.up, 9); assert.equal(st.down, 11);
assert.equal(st.dirByPos[4].down, 5); assert.equal(st.dirByPos[4].up, 0);
const sg = T.suggestNext([4, 12, 22, 35, 38], st);
assert.deepEqual(sg.spots.slice(0, 2).map(s => s.pos).sort(), [1, 4]);
assert.deepEqual(sg.four, [3, 5, 34, 36]);
assert.equal(sg.spots.find(s => s.pos === 4).nums[0], 34);
assert.equal(T.suggestNext([1, 2, 3, 4, 39], null).spots[0].nums.join(), '2'); // 邊界：不出 0
console.log('track tests ok');
