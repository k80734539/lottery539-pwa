import * as A from '../js/arena.js';
import fs from 'node:fs';
const hist = JSON.parse(fs.readFileSync('data/history.json')); const res = JSON.parse(fs.readFileSync('data/results.json'));
const all = [...(hist.draws || hist), ...(res.draws || [])].map(d => ({ date: d.date, numbers: d.numbers })).filter(d => d.date).sort((a, b) => a.date < b.date ? -1 : 1);
const dates = ['2026-10-29', '2026-10-30', '2026-10-31'];
const entries = [];
for (const d of dates) entries.push(await A.makeEntry(d, all, new Date(d + 'T02:00:00Z')));
console.log(JSON.stringify({ v: 1, settings: { cap: 1500, blind: true, theme: 'auto' }, batches: [], manualResults: {}, arena: { entries },
  lehe: { entries: [{ id: 'e1', drawDate: '2026-10-31', numbers: [2, 5, 17, 30], plays: [2, 3], bought: true, source: 'manual', createdAt: '2026-10-31T01:00:00Z' }], settings: { price: 25, prizes: { 2: 1125, 3: 11250, 4: 212500 } } } }));
