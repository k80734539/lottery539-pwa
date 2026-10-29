import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as L from '../js/logic.js';

const hist = JSON.parse(fs.readFileSync(new URL('../data/history.json', import.meta.url))).draws;
const res = JSON.parse(fs.readFileSync(new URL('../data/results.json', import.meta.url))).draws;
const map = L.buildDrawMap(hist, res);
assert.ok(map.size >= 1300);

// 時間：2026-10-29(四) 10:00 台灣 -> 當天；20:30 後 -> 10/30；週六 20:30 後 -> 下週一
assert.equal(L.nextDrawDate(new Date('2026-10-29T10:00:00+08:00')), '2026-10-29');
assert.equal(L.nextDrawDate(new Date('2026-10-29T20:29:59+08:00')), '2026-10-29');
assert.equal(L.nextDrawDate(new Date('2026-10-29T20:30:00+08:00')), '2026-10-30');
assert.equal(L.nextDrawDate(new Date('2026-10-31T21:00:00+08:00')), '2026-11-02');
assert.equal(L.nextDrawDate(new Date('2026-11-01T09:00:00+08:00')), '2026-11-02');
assert.equal(L.nextDrawDate(new Date('2026-10-29T12:30:00Z')), '2026-10-30'); // UTC 12:30 = 台灣 20:30

// 對獎
assert.equal(L.matchCount([1, 2, 3, 4, 5], [3, 4, 5, 6, 7]), 3);
assert.equal(L.prizeAmount(2), 50); assert.equal(L.prizeAmount(3), 300); assert.equal(L.prizeAmount(4), 20000);
assert.equal(L.prizeFor(5), 'jackpot'); assert.equal(L.prizeAmount(1), 0);

// 機率
assert.ok(Math.abs(L.HYPER_P.reduce((a, b) => a + b) - 1) < 1e-12);
assert.ok(Math.abs(L.HYPER_MEAN - 25 / 39) < 1e-12);

// 策略輸出皆合法
const chrono = L.drawsChrono(map).map(d => d.numbers);
const rng = L.mulberry32(42);
for (let i = 0; i < 300; i++) {
  const b = L.generateBatch(chrono, rng);
  assert.equal(b.length, 3);
  for (const s of b) assert.ok(L.validNumbers(s.numbers), JSON.stringify(s));
  assert.equal(new Set(b.flatMap(s => s.numbers)).size >= 10, true);
}
// 覆蓋最大化應與其他組重疊少
let overlap = 0; for (let i = 0; i < 200; i++) { const b = L.generateBatch(chrono, rng); const c = b.find(s => s.strategy === 'coverage'); const o = b.filter(s => s !== c).flatMap(s => s.numbers); overlap += c.numbers.filter(n => o.includes(n)).length; }
assert.ok(overlap / 200 < 1.0, 'coverage overlap ' + overlap / 200);

// 批次狀態與結算
const now = new Date('2026-10-29T10:00:00+08:00');
const draw = [...map.values()].find(d => d.date === '2026-10-28');
const batch = { drawDate: '2026-10-28', lockedAt: '2026-10-28T09:00:00+08:00', sets: [{ numbers: draw.numbers, bought: true }, { numbers: [1, 2, 3, 4, 5], bought: true }, { numbers: [1, 2, 3, 4, 5], bought: false }] };
assert.equal(L.batchStatus(batch, map, now), 'settled');
const r = L.settleBatch(batch, map);
assert.equal(r.spend, 100); assert.equal(r.sets[0].matches, 5);
assert.equal(L.batchStatus({ drawDate: '2026-10-30', sets: [], lockedAt: null }, map, now), 'draft');
assert.equal(L.batchStatus({ drawDate: '2026-10-29', sets: [], lockedAt: null }, map, new Date('2026-10-29T21:00:00+08:00')), 'expired');
assert.equal(L.batchStatus({ drawDate: '2026-10-29', sets: [], lockedAt: 'x' }, map, now), 'locked');
assert.equal(L.batchStatus({ drawDate: '2026-10-25', sets: [], lockedAt: 'x' }, map, now), 'void'); // 週日無開獎

// 回測：均值應接近 25/39
const bt = L.backtest(L.drawsChrono(map), L.mulberry32(7));
for (const k of L.BASE_STRATEGIES) { const s = L.compareStats(bt[k]); console.log(k, s.n, s.mean.toFixed(3), 'z=' + s.z.toFixed(2)); assert.ok(s.n > 1000); }
assert.equal(L.budgetState(1500, 1500).level, 'over'); assert.equal(L.budgetState(1200, 1500).level, 'warn'); assert.equal(L.budgetState(100, 1500).level, 'ok');
console.log('all ok');
