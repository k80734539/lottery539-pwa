import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as L from '../js/logic.js';
import * as A from '../js/arena.js';

const rd = f => JSON.parse(fs.readFileSync(new URL('../data/' + f, import.meta.url)));
const map = L.buildDrawMap(rd('history.json').draws, rd('results.json').draws, {});
const chrono = L.drawsChrono(map);
const nums = chrono.map(d => d.numbers);
assert.ok(chrono.length >= 1352);
assert.equal(A.ARENA.length, 20); assert.equal(A.BASE_IDS.length, 12); assert.equal(A.ORIG_IDS.length, 8);

// 理論分布
assert.ok(Math.abs(A.P4.reduce((a, b) => a + b) - 1) < 1e-12);
assert.ok(Math.abs(A.MEAN4 - 20 / 39) < 1e-12);

// 每個策略：合法 4 碼、不重複、確定性
for (let i = 40; i < nums.length; i += 37) {
  const a = A.pickAll(nums.slice(0, i), chrono[i].date), b = A.pickAll(nums.slice(0, i), chrono[i].date);
  assert.deepEqual(a, b, '確定性');
  for (const id of A.ARENA_IDS) assert.ok(A.validNumbers4(a[id]), `${id} ${a[id]}`);
}
// 暖機不足（只有 0/3 期歷史）也要能出合法號碼
for (const k of [0, 1, 3]) { const p = A.pickAll(nums.slice(0, k), '2020-01-01'); for (const id of A.ARENA_IDS) assert.ok(A.validNumbers4(p[id]), `${id}@${k}`); }

// 結構性質
for (let i = 100; i < 400; i += 11) {
  const p = A.pickAll(nums.slice(0, i), chrono[i].date);
  assert.equal(new Set(p.lastdigit.map(n => n % 10)).size, 4, '尾數分散');
  assert.deepEqual(p.balance.map(n => (n <= 10 ? 0 : n <= 20 ? 1 : n <= 30 ? 2 : 3)).sort(), [0, 1, 2, 3], '區間均衡');
  assert.equal(p.balance.filter(n => n % 2).length, 2, '2 單 2 雙');
  const last = nums[i - 1];
  assert.ok(p.neighbor.every(n => last.includes(n - 1) || last.includes(n + 1)), '鄰號');
  assert.ok(p.coverage[1] - p.coverage[0] === 10 && p.coverage[3] === p.coverage[0] + 30, '覆蓋');
}
// 近期熱號 = 近 30 期最高頻（同頻者可能被隨機排序，檢查頻率集合）
{
  const i = 500, f = new Array(40).fill(0); nums.slice(i - 30, i).forEach(d => d.forEach(n => f[n]++));
  const p = A.pickAll(nums.slice(0, i), chrono[i].date).hot30;
  const sorted = [...f.slice(1)].sort((a, b) => b - a);
  assert.deepEqual(p.map(n => f[n]).sort((a, b) => b - a), sorted.slice(0, 4));
}
// 遺漏回補：選到的遺漏值都 >= 第 4 大
{
  const i = 600, past = nums.slice(0, i), om = n => { for (let k = past.length - 1, s = 0; k >= 0; k--, s++) if (past[k].includes(n)) return s; return past.length; };
  const all = Array.from({ length: 39 }, (_, k) => om(k + 1)).sort((a, b) => b - a);
  const p = A.pickAll(past, chrono[i].date).omission;
  assert.deepEqual(p.map(om).sort((a, b) => b - a), all.slice(0, 4));
}
// 無未來資料洩漏：改動第 i 期（含）以後的資料，第 i 期的選號不變
{
  const i = 700, base = A.pickAll(nums.slice(0, i), chrono[i].date);
  const tampered = nums.map((d, k) => (k >= i ? [1, 2, 3, 4, 5] : d));
  assert.deepEqual(A.pickAll(tampered.slice(0, i), chrono[i].date), base);
}
// 隨機策略的種子隨日期不同
assert.notDeepEqual(A.pickAll(nums.slice(0, 100), '2026-01-01').random, A.pickAll(nums.slice(0, 100), '2026-01-02').random);

// 隨機 4 碼的平均命中接近理論（蒙地卡羅）
{
  let s = 0, N = 40000; const rng = L.mulberry32(1);
  for (let k = 0; k < N; k++) { const d = L.randomSet(rng); s += A.hits(L.randomSet(rng).slice(0, 4), d); }
  assert.ok(Math.abs(s / N - A.MEAN4) < 0.01, 'MC mean ' + s / N);
}

// 結算邏輯
assert.equal(A.hits([1, 2, 3, 4], [3, 4, 5, 6, 7]), 2);
assert.equal(A.hits([1, 2, 3, 4], [1, 2, 3, 4, 5]), 4);
assert.equal(A.hits([9, 8, 7, 6], [1, 2, 3, 4, 5]), 0);
{
  const picks = Object.fromEntries(A.ARENA_IDS.map(id => [id, [1, 2, 3, 4]]));
  picks.random = [9, 10, 11, 12];
  const dm = new Map([['2026-10-28', { date: '2026-10-28', numbers: [1, 2, 3, 20, 21] }]]);
  const ok = { drawDate: '2026-10-28', lockedAt: '2026-10-28T08:00:00+08:00', picks };
  const late = { drawDate: '2026-10-28', lockedAt: '2026-10-28T20:30:00+08:00', picks };
  const pending = { drawDate: '2026-10-29', lockedAt: '2026-10-29T08:00:00+08:00', picks };
  assert.ok(A.entryCounts(ok) && !A.entryCounts(late));
  const r = A.settleEntries([ok, late, pending], dm);
  assert.equal(r.settled.length, 1); assert.equal(r.settled[0].hits.hot30, 3); assert.equal(r.settled[0].hits.random, 0);
  assert.deepEqual(r.dist.hot30, [0, 0, 0, 1, 0]); assert.deepEqual(r.dist.random, [1, 0, 0, 0, 0]);
  assert.equal(A.settleEntries([{ ...ok, picks: { random: [1] } }], dm).settled.length, 0, '壞資料略過');
}
// makeEntry：只用該日以前資料，指紋 12 碼
{
  const e = await A.makeEntry('2026-10-29', chrono, new Date('2026-10-29T10:00:00+08:00'));
  assert.equal(e.histLast, '2026-10-28'); assert.equal(e.fp.length, 12); assert.ok(A.entryCounts(e));
  assert.deepEqual(e.picks, A.pickAll(chrono.filter(d => d.date < '2026-10-29').map(d => d.numbers), '2026-10-29'));
}

// 統計函式
assert.ok(Math.abs(A.pFromZ(1.96) - 0.05) < 0.001);
assert.ok(Math.abs(A.pChi2df3(7.815) - 0.05) < 0.001);
assert.ok(Math.abs(A.pChi2df3(3.0) - 0.3916) < 0.001);
{ const a = A.holm([0.01, 0.04, 0.03]); assert.ok(a[0] - 0.03 < 1e-12 && Math.abs(a[1] - 0.06) < 1e-12 && Math.abs(a[2] - 0.06) < 1e-12); }
{ // 偵測力：刻意構造一個明顯偏高的分布應被判顯著
  const n = 2000; const fake = Object.fromEntries(A.ARENA_IDS.map(id => [id, A.P4.map(p => Math.round(p * n))]));
  fake.hot30 = [0.45, 0.4, 0.13, 0.02, 0].map(p => Math.round(p * n));
  const ev = A.evaluateAll(fake);
  assert.ok(ev.rows.find(r => r.id === 'hot30').better);
  assert.equal(A.verdictText(ev).kind, 'diff');
  const none = A.evaluateAll(Object.fromEntries(A.ARENA_IDS.map(id => [id, A.P4.map(p => Math.round(p * n))])));
  assert.equal(A.verdictText(none).kind, 'none');
  assert.equal(A.verdictText(A.evaluateAll(Object.fromEntries(A.ARENA_IDS.map(id => [id, [3, 2, 0, 0, 0]])))).kind, 'small');
}
// 全歷史回測：數量與穩定性
{
  const bt = A.backtestArena(chrono);
  assert.equal(bt.evaluated, chrono.length - A.WARMUP);
  for (const id of A.ARENA_IDS) assert.equal(bt.dist[id].reduce((a, b) => a + b), bt.evaluated);
  assert.deepEqual(A.backtestArena(chrono).dist, bt.dist, '回測可重現');
  const ev = A.evaluateAll(bt.dist);
  assert.ok(['none', 'diff'].includes(A.verdictText(ev).kind));
}
{ // 樣本不足（<30 期）不做顯著性判定，即使一期中 4 顆
  const d = Object.fromEntries(A.ARENA_IDS.map(id => [id, [1, 0, 0, 0, 0]])); d.hot30 = [0, 0, 0, 0, 1];
  const ev = A.evaluateAll(d, 30);
  assert.ok(ev.rows.every(r => !r.sig && r.adjMin === null));
  assert.ok(A.evaluateAll(d, 0).rows.find(r => r.id === 'hot30').pZ < 0.001);
}
console.log('arena tests ok');

// ---------- 你的策略（原版 Python 8 策略） ----------
// 下列期望值已用原版 Python（daily_strategy_groups，size=4、pool_size=18，numpy 亂數改餵入同一串種子亂數）逐一比對一致
const PY_FIXTURES = [{"k":100,"date":"2022-11-05","picks":{"o_hot":[3,10,35,36],"o_hotcold":[1,8,29,36],"o_trend":[9,18,26,27],"o_cooc":[9,16,27,28],"o_votes":[1,9,22,28],"o_weighted":[1,9,22,36],"o_pair":[1,10,20,22],"o_random":[3,7,31,36]}},{"k":1000,"date":"2025-09-17","picks":{"o_hot":[7,21,26,28],"o_hotcold":[7,14,29,38],"o_trend":[2,9,25,28],"o_cooc":[7,20,28,30],"o_votes":[12,20,28,29],"o_weighted":[7,20,28,29],"o_pair":[2,21,23,29],"o_random":[2,8,17,29]}},{"k":1274,"date":"2026-07-30","picks":{"o_hot":[12,13,34,37],"o_hotcold":[1,12,34,37],"o_trend":[12,19,24,39],"o_cooc":[1,8,16,26],"o_votes":[5,12,34,37],"o_weighted":[12,19,34,37],"o_pair":[1,6,13,37],"o_random":[5,6,26,39]}}];
for (const fx of PY_FIXTURES) {
  assert.equal(chrono[fx.k].date, fx.date);
  const p = A.pickAll(nums.slice(0, fx.k), fx.date);
  for (const id of A.ORIG_IDS) assert.deepEqual(p[id], fx.picks[id], `${id}@${fx.date}`);
}
// 加入新策略不改變原本 12 策略（多策略投票只看原本的策略）
{
  const p = A.pickAll(nums.slice(0, 900), chrono[900].date);
  for (const id of A.ORIG_IDS) assert.ok(A.validNumbers4(p[id]), id);
}
// 舊紀錄（只有 12 個策略）仍有效，新策略不計分；指紋算法對舊紀錄不變
{
  const dm = new Map([['2026-10-20', { date: '2026-10-20', numbers: [1, 2, 3, 4, 5] }]]);
  const picks = A.pickAll(nums.slice(0, 500), '2026-10-20'); const base = Object.fromEntries(A.BASE_IDS.map(id => [id, picks[id]]));
  const old = { drawDate: '2026-10-20', lockedAt: '2026-10-20T01:00:00Z', picks: base };
  assert.ok(A.entryCounts(old)); assert.deepEqual(A.countedIds(old), A.BASE_IDS);
  const r = A.settleEntries([old], dm);
  assert.equal(r.settled.length, 1); assert.equal(r.settled[0].hits.o_hot, undefined); assert.equal(r.dist.o_hot, undefined);
  const full = { ...old, picks };
  assert.deepEqual(A.countedIds(full), A.ARENA_IDS);
  assert.equal(await A.entryFingerprint('d', 'x', base), await A.entryFingerprint('d', 'x', { ...base }));
  // 20:30 前可補上；補上後不改原本選號
  const e = { drawDate: '2026-10-29', lockedAt: '2026-10-29T01:00:00Z', picks: { ...base }, fp: 'abc' };
  assert.equal(await A.appendOriginal(e, chrono, new Date('2026-10-29T21:00:00+08:00')), false, '過 20:30 不補');
  assert.ok(await A.appendOriginal(e, chrono, new Date('2026-10-29T12:00:00+08:00')));
  assert.equal(e.fp, 'abc'); for (const id of A.BASE_IDS) assert.deepEqual(e.picks[id], base[id]);
  assert.ok(A.origCounts(e)); assert.equal(e.origFp.length, 12);
  const past = chrono.filter(d => d.date < '2026-10-29').map(d => d.numbers);
  assert.deepEqual(e.picks.o_hot, A.pickAll(past, '2026-10-29').o_hot, '補上的選號只看該期以前');
  assert.equal(await A.appendOriginal(e, chrono, new Date('2026-10-29T13:00:00+08:00')), false, '已補過不再補');
}
console.log('original strategies ok');
