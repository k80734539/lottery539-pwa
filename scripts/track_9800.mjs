// Usage: node scripts/track_9800.mjs [picks.json]  (picks: {"115262":[3,15,...]}; fetch posts via WebFetch, site 500s curl)
// 二三合全包P/L: node /workspace/track9800/pl.js
import fs from 'fs';
const f=process.argv[2]||'/workspace/track9800/picks.json';
const picks=JSON.parse(fs.readFileSync(f));
const rows=[];for(const p of ['data/history.json','data/results.json'])try{const j=JSON.parse(fs.readFileSync(p));(Array.isArray(j)?j:j.draws||Object.values(j)).forEach(r=>rows.push(r))}catch{}
const draw={};for(const r of rows){if(Array.isArray(r))draw[String(r[0])]=r[2];else if(r&&r.issue)draw[String(r.issue)]=r.nums||r.numbers}
let n=0,H=0,N=0,w2=0,w3=0,w4=0;
for(const [k,p] of Object.entries(picks).sort()){const d=draw[k];if(!d){console.log(k,p.join(','),'未開獎/無資料');continue}
const h=p.filter(x=>d.includes(x)).length,near=p.filter(x=>!d.includes(x)&&(d.includes(x-1)||d.includes(x+1))).length;
n++;H+=h;N+=near;if(h>=2)w2++;if(h>=3)w3++;if(h>=4)w4++;
console.log(k,'選',p.join(','),'開',d.join(','),'中',h,'差一號',near);}
console.log(`\n${n}期: 平均中 ${(H/n).toFixed(2)} (隨機期望 0.64), 平均差一號 ${(N/n).toFixed(2)}, 中≥2(二合有中) ${w2}期, ≥3 ${w3}, ≥4 ${w4}`);
