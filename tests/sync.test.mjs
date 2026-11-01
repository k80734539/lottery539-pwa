import assert from 'node:assert/strict';
import { stamp, toDoc, mergeDocs, applyDoc, MAX_TOMBS_PER_SAVE } from '../js/sync.js';
const base = () => ({ settings: { cap: 1500, blind: true, theme: 'auto' }, batches: [], manualResults: {}, arena: { entries: [] }, lehe: { entries: [], settings: { price: 25, prizes: { 2: 1125, 3: 11250, 4: 212500 } } } });
const clone = x => JSON.parse(JSON.stringify(x));

// 兩台裝置各自新增不同紀錄 → 合併後兩筆都在
const A = base(), B = base();
stamp(A, 100); stamp(B, 100);
A.lehe.entries.push({ id: 'x1', drawDate: '2026-11-02', numbers: [1, 2, 3, 4], plays: [2] }); stamp(A, 200);
B.lehe.entries.push({ id: 'y1', drawDate: '2026-11-02', numbers: [5, 6, 7, 8], plays: [3] }); stamp(B, 210);
B.batches.push({ drawDate: '2026-11-02', sets: [] }); stamp(B, 220);
let m = mergeDocs(toDoc(A), toDoc(B));
assert.deepEqual(Object.keys(m.records).filter(k => k.startsWith('l:')).sort(), ['l:x1', 'l:y1']);
assert.ok(m.records['b:2026-11-02']);
applyDoc(A, m); applyDoc(B, clone(m));
assert.equal(A.lehe.entries.length, 2); assert.equal(B.lehe.entries.length, 2);

// 同一筆兩邊都改 → 較新的贏
A.lehe.entries.find(e => e.id === 'x1').bought = false; stamp(A, 300);
B.lehe.entries.find(e => e.id === 'x1').bought = true; stamp(B, 400);
m = mergeDocs(toDoc(A), toDoc(B)); assert.equal(m.records['l:x1'].bought, true);
m = mergeDocs(toDoc(B), toDoc(A)); assert.equal(m.records['l:x1'].bought, true, '順序無關');
applyDoc(A, m); applyDoc(B, clone(m));

// 刪除一筆 → 墓碑傳到另一台
A.lehe.entries = A.lehe.entries.filter(e => e.id !== 'y1'); stamp(A, 500);
assert.equal(A._sync.tomb['l:y1'], 500);
m = mergeDocs(toDoc(B), toDoc(A)); assert.ok(!m.records['l:y1']); applyDoc(B, m);
assert.equal(B.lehe.entries.length, 1);
// 刪除後另一台又更新那筆（時間較新）→ 紀錄復活
const C = clone(B); C.lehe.entries.push({ id: 'y1', numbers: [9, 10], plays: [2] }); stamp(C, 600);
assert.ok(mergeDocs(toDoc(A), toDoc(C)).records['l:y1']);

// 大量消失（例如清除資料）不產生墓碑 → 不會整批刪掉雲端
const D = base(); for (let i = 0; i < 10; i++) D.lehe.entries.push({ id: 'z' + i, numbers: [1, 2], plays: [2] }); stamp(D, 700);
const remote = toDoc(D);
D.lehe.entries = []; stamp(D, 800);
assert.equal(Object.keys(D._sync.tomb).length, 0);
assert.ok(10 > MAX_TOMBS_PER_SAVE);
assert.equal(Object.keys(mergeDocs(toDoc(D), remote).records).filter(k => k.startsWith('l:')).length, 10);

// 全新裝置（舊資料沒有時間戳）的既有紀錄以 1 起算，不會蓋掉雲端上有編輯過的版本
const E = base(); E.lehe.entries.push({ id: 'x1', numbers: [1, 2, 3, 4], plays: [2], bought: false }); stamp(E, 900);
assert.equal(E._sync.meta['l:x1'], 1);
assert.equal(mergeDocs(toDoc(E), toDoc(A)).records['l:x1'].bought, true);

// 擂台紀錄兩邊都有時保留較早鎖定者
const F = base(), G = base(); stamp(F, 1); stamp(G, 1);
F.arena.entries.push({ drawDate: '2026-11-03', lockedAt: '2026-11-02T02:00:00Z', picks: { a: [1] } }); stamp(F, 50);
G.arena.entries.push({ drawDate: '2026-11-03', lockedAt: '2026-11-03T02:00:00Z', picks: { a: [2] } }); stamp(G, 60);
assert.deepEqual(mergeDocs(toDoc(F), toDoc(G)).records['a:2026-11-03'].picks.a, [1]);

// 手動開獎、設定也能同步；applyDoc 後再 stamp 不會誤蓋新時間
const H = base(); stamp(H, 1); H.manualResults['2026-11-04'] = [1, 2, 3, 4, 5]; H.settings.cap = 999; stamp(H, 70);
const I = base(); stamp(I, 1); applyDoc(I, mergeDocs(toDoc(I), toDoc(H)));
assert.deepEqual(I.manualResults['2026-11-04'], [1, 2, 3, 4, 5]); assert.equal(I.settings.cap, 999);
const before = clone(I._sync.meta); stamp(I, 9999); assert.deepEqual(I._sync.meta, before);
console.log('sync tests ok');
