// 用法：node scripts/arena_backtest.mjs   —— 以全部歷史做 walk-forward 回測並印出表格
import fs from 'node:fs';
import * as L from '../js/logic.js';
import * as A from '../js/arena.js';
const rd = f => JSON.parse(fs.readFileSync(new URL('../data/' + f, import.meta.url)));
const map = L.buildDrawMap(rd('history.json').draws, rd('results.json').draws, {});
const chrono = L.drawsChrono(map);
const t0 = Date.now();
const bt = A.backtestArena(chrono);
const ev = A.evaluateAll(bt.dist);
console.log(`總期數 ${bt.total}，暖身 ${bt.warm}，評估 ${bt.evaluated} 期（${bt.from} ~ ${bt.to}），耗時 ${Date.now() - t0}ms`);
console.log(`理論：平均 ${A.MEAN4.toFixed(4)}，分布 ` + A.P4.map(p => (p * 100).toFixed(3) + '%').join(' / '));
console.log('策略\t平均\t95%CI\t0\t1\t2\t3\t4\tz\tp(z)\tHolm\tχ²p\tHolm');
for (const r of ev.rows) console.log([A.nameOf(r.id), r.mean.toFixed(4), `${r.lo.toFixed(3)}~${r.hi.toFixed(3)}`, ...r.dist, r.z.toFixed(2), r.pZ.toFixed(3), r.adjZ.toFixed(3), r.pChi?.toFixed(3), r.adjChi?.toFixed(3)].join('\t'));
console.log('理論期望次數', A.P4.map(p => (p * bt.evaluated).toFixed(1)).join(' / '));
console.log('檢定數', ev.m, '可偵測差異(80%檢定力)±', ev.detect.toFixed(4));
console.log(A.verdictText(ev).text);
