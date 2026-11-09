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
const upto = Object.fromEntries(Object.entries(kp.picks).filter(([k]) => k <= '115268')); // 凍結到 115268，避免新開獎改斷言
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
// 自己補報號
assert.deepEqual(T.parsePicks('38 4,22、12 35'), [4, 12, 22, 35, 38]);
assert.equal(T.parsePicks('1 1 2 3 4'), null); assert.equal(T.parsePicks('1 2 3 4 40'), null); assert.equal(T.parsePicks([1, 2, 3, 4, '']), null);
assert.equal(T.parsePostId('http://www.9800.com.tw/bbs/view.asp?id=350158'), 350158); assert.equal(T.parsePostId(''), null);
assert.equal(T.parseIssue('115000270'), '115270'); assert.equal(T.parseIssue('12'), null);
const man = { picks: { '115269': [4, 12, 22, 35, 38], '115270': [1, 2, 3, 4, 5] }, posts: { '115270': 9 } };
const pr = T.pruneManual(kp, man);
assert.deepEqual(pr.removed, ['115269']); assert.deepEqual(Object.keys(pr.manual.picks), ['115270']);
const mg = T.mergeManual(kp, pr.manual);
assert.deepEqual(mg.picks['115270'], [1, 2, 3, 4, 5]); assert.equal(mg.posts['115270'], 9); assert.deepEqual(mg.manual, ['115270']);
assert.equal(T.buildRows(mg.picks, T.issueMap(L.drawsChrono(map))).at(-1).issue, Object.keys(mg.picks).sort().at(-1)); // 最新期（含自己補覆蓋）
// 抓取腳本解析（離線樣本）
const F = await import('../scripts/fetch_k3km_picks.mjs');
const post = `<title>&#11088;&#65039;11/06&#11088;&#65039;5&#11088;&#65039;3&#11088;&#65039;9&#11088;&#65039;_115269期 - 今彩539討論區</title><a>K3km8000</a>
  <td>開獎日期：</td><td> 11月 06日(115269期)</td><td>推薦獎號：</td><td>04,12,22,35,38</td>
  <tr><td>115268期</td><td>01,16,25,28,31,</td><td>5中 1</td></tr>`;
const pp = F.parsePost(post);
assert.equal(pp.issue, '115269'); assert.deepEqual(pp.picks, [4, 12, 22, 35, 38]); assert.deepEqual(pp.history, [{ issue: '115268', picks: [1, 16, 25, 28, 31] }]);
assert.equal(F.parsePost(post.replace(/K3km8000/g, 'someone')), null);
const lst = F.parseList('<a href="view.asp?id=350117">⭐️11/05⭐️5⭐️3⭐️9⭐️(5中 1)</a><a href="view.asp?id=350158">&#11088;11/06&#11088;5&#11088;3&#11088;9&#11088;</a><a href="view.asp?id=1">⭐️11/05⭐️大樂透</a>');
assert.deepEqual(lst.map(x => x.id), [350158, 350117]);
const mr = F.merge(kp, [{ id: 999999, issue: '115270', picks: [1, 2, 3, 4, 5], history: [] }]);
assert.ok(mr.changed); assert.deepEqual(mr.added, ['115270']); assert.equal(mr.data.posts['115270'], 999999);
assert.equal(F.merge(kp, [{ id: kp.posts['115269'], issue: '115269', picks: kp.picks['115269'], history: [] }]).changed, false);

// 球號標記：差1 綠、真中優先、未開獎不標
assert.equal(T.ballMark(22, [32], [22, 35]), 'near');
assert.equal(T.ballMark(32, [32], [22, 35]), 'hit');
assert.equal(T.ballMark(35, [32], [22, 35]), 'near');
assert.equal(T.ballMark(4, [32], [22, 35]), '');
assert.equal(T.ballMark(22, [], []), ''); // 等開獎
const ex = T.compare([4, 15, 22, 32, 35], [10, 21, 24, 32, 34]);
assert.deepEqual(ex.hits.map(x => x.n), [32]);
assert.deepEqual(ex.near.map(x => x.n).sort((a,b)=>a-b), [22, 35]);
assert.equal(T.ballMark(22, ex.hits.map(x => x.n), ex.near.map(x => x.n)), 'near');
assert.equal(T.ballMark(32, ex.hits.map(x => x.n), ex.near.map(x => x.n)), 'hit');
console.log('track tests ok');
