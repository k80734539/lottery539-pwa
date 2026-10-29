import * as L from './logic.js';
import * as S from './store.js';

const $ = s => document.querySelector(s);
const view = $('#view');
let tab = 'today';
let drawMap = new Map();
let drawChrono = [];
let rng;
try { rng = L.cryptoRng(); } catch { rng = Math.random; }
let btResult = null; // 歷史回測（僅記憶體）
let drawsShown = 40;
let drawsQuery = '';
let syncState = { status: 'idle', msg: '' };

const NOTICE = `<div class="card notice"><b>請先讀這段：</b>開獎是彼此獨立的隨機事件，<b>沒有任何選號方法能提高中獎機率</b>。本 App 只負責<b>紀錄、對獎與花費管理</b>，不是預測工具，也不含任何「AI 預測」。長期買彩券的期望值是負的，請只用玩樂預算。</div>`;

// ---------- 資料 ----------
let historyRows = [];
async function loadHistory() {
  try {
    const r = await fetch('data/history.json');
    historyRows = (await r.json()).draws;
  } catch (e) { historyRows = []; }
}
function rebuild() {
  drawMap = L.buildDrawMap(historyRows, S.state.remote.draws, S.state.manualResults);
  drawChrono = L.drawsChrono(drawMap);
}
function batchOf(date) { return S.state.batches.find(b => b.drawDate === date); }
function sortedBatches() { return [...S.state.batches].sort((a, b) => (a.drawDate < b.drawDate ? 1 : -1)); }
function summary() { return L.summarize(S.state.batches, drawMap); }
function monthCommitted(month) { return summary().byMonth[month]?.spend || 0; }

async function sync(manual = false) {
  syncState = { status: 'loading', msg: '同步中…' };
  if (tab === 'draws') render();
  try {
    const r = await fetch('data/results.json?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    if (r.headers.get('x-from-cache')) throw new Error('offline');
    const j = await r.json();
    if (!Array.isArray(j.draws)) throw new Error('格式錯誤');
    const draws = j.draws.filter(d => L.validNumbers(d.numbers) && /^\d{4}-\d{2}-\d{2}$/.test(d.date));
    S.state.remote = { draws, updated: j.updated || null, fetchedAt: new Date().toISOString() };
    S.save(); rebuild();
    syncState = { status: 'ok', msg: '已同步' };
    if (manual) toast('已同步開獎資料');
  } catch (e) {
    syncState = { status: 'fail', msg: '無法取得最新開獎（離線或來源異常），改用手機內已存的資料；也可手動輸入開獎號碼。' };
    if (manual) toast('同步失敗，使用已存資料');
  }
  render();
}

// ---------- 小工具 ----------
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 2200);
}
function fmtDate(d) { const [y, m, day] = d.split('-'); return `${+m}/${+day}（週${L.WEEKDAYS[L.dow(d)]}）`; }
function balls(nums, opts = {}) {
  const hit = new Set(opts.hit || []);
  return `<div class="balls">${nums.map(n => `<span class="ball${opts.small ? ' small' : ''}${opts.draw ? ' draw' : ''}${hit.has(n) ? ' hit' : ''}">${String(n).padStart(2, '0')}</span>`).join('')}</div>`;
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); }
  catch {
    const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = 0;
    document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch {} ta.remove();
  }
  toast('已複製：' + text.split('\n').length + ' 組');
}
function showSheet(html) { const s = $('#sheet'); s.innerHTML = `<div class="panel" role="dialog" aria-modal="true">${html}</div>`; s.hidden = false; return s; }
function closeSheet() { const s = $('#sheet'); s.hidden = true; s.innerHTML = ''; }
function confirmSheet(html, okText = '確定', cancelText = '取消') {
  return new Promise(res => {
    const s = showSheet(`<div>${html}</div><div class="row" style="margin-top:14px"><button class="grow" id="cs-no">${cancelText}</button><button class="grow danger" id="cs-ok">${okText}</button></div>`);
    s.querySelector('#cs-no').onclick = () => { closeSheet(); res(false); };
    s.querySelector('#cs-ok').onclick = () => { closeSheet(); res(true); };
  });
}
/** 號碼選擇器 */
function pickerSheet({ title, initial = [], extraHtml = '', dateField = null, onSave }) {
  const sel = new Set(initial);
  const s = showSheet(`<h2>${title}</h2>${dateField ? `<label class="field">開獎日期<input type="date" id="pk-date" value="${dateField}"></label>` : ''}
    <div class="muted">請選 5 個號碼（1–39），已選 <b id="pk-n">0</b>/5</div>
    <div class="picker">${Array.from({ length: 39 }, (_, i) => `<button type="button" data-n="${i + 1}" aria-pressed="false">${i + 1}</button>`).join('')}</div>
    ${extraHtml}
    <div class="row"><button class="grow" id="pk-cancel">取消</button><button class="grow primary" id="pk-save" disabled>儲存</button></div>`);
  const upd = () => {
    s.querySelectorAll('.picker button').forEach(b => b.setAttribute('aria-pressed', sel.has(+b.dataset.n)));
    s.querySelector('#pk-n').textContent = sel.size; s.querySelector('#pk-save').disabled = sel.size !== 5;
  };
  s.querySelector('.picker').onclick = e => {
    const b = e.target.closest('button'); if (!b) return; const n = +b.dataset.n;
    if (sel.has(n)) sel.delete(n); else if (sel.size < 5) sel.add(n); upd();
  };
  s.querySelector('#pk-cancel').onclick = closeSheet;
  s.querySelector('#pk-save').onclick = () => {
    const nums = [...sel].sort((a, b) => a - b);
    const date = dateField ? s.querySelector('#pk-date').value : null;
    if (onSave(nums, date) !== false) closeSheet();
  };
  upd();
  return s;
}

// ---------- 今日／選號 ----------
function label(batch, i, st) {
  const set = batch.sets[i];
  if (set.strategy === 'manual') return '手動輸入';
  if (S.state.settings.blind && st !== 'settled') return `第 ${i + 1} 組（盲測，結算後揭曉策略）`;
  return L.STRATEGIES[set.strategy];
}
function budgetBlock(month, extraSpend = 0) {
  const cap = S.state.settings.cap;
  const committed = monthCommitted(month) + extraSpend;
  const b = L.budgetState(committed, cap);
  const pct = cap > 0 ? Math.min(100, Math.round(b.ratio * 100)) : 0;
  let alert = '';
  if (b.level === 'over') alert = `<div class="alert bad">⛔ 停損警示：${month} 已承諾花費 ${L.money(committed)}，超過每月上限 ${L.money(cap)}。建議這個月到此為止。</div>`;
  else if (b.level === 'warn') alert = `<div class="alert warn">⚠️ ${month} 已用掉預算的 ${pct}%（${L.money(committed)} / ${L.money(cap)}），快到上限了。</div>`;
  return `<div><div class="row between"><span>${month} 本月花費</span><b>${L.money(committed)}${cap > 0 ? ` / ${L.money(cap)}` : '（未設上限）'}</b></div>
    ${cap > 0 ? `<div class="meter ${b.level}"><i style="width:${pct}%"></i></div>` : ''}${alert}</div>`;
}
function renderToday() {
  const date = L.nextDrawDate();
  const batch = batchOf(date);
  const st = batch ? L.batchStatus(batch, drawMap) : 'none';
  const locked = !!batch?.lockedAt;
  let body = '';
  if (!batch || batch.sets.length === 0) {
    body = `<p class="muted">還沒有選號。按下面的按鈕一次產生 3 組（純隨機／冷熱混合／覆蓋最大化各 1 組，順序打亂），也可以自己輸入。</p>
      <div class="row"><button class="primary grow" data-act="gen">🎲 一鍵產生 3 組</button><button class="grow" data-act="manual-new">✍️ 手動輸入</button></div>`;
  } else {
    body = batch.sets.map((s, i) => `<div class="setrow">
      <div class="row between"><span><span class="tag">${label(batch, i, st)}</span></span>
      ${locked ? '' : `<label class="small-print"><input type="checkbox" data-act="bought" data-i="${i}" ${s.bought !== false ? 'checked' : ''}> 我有買（NT$${L.PRICE}）</label>`}</div>
      <div class="row between" style="margin-top:6px">${balls(s.numbers)}</div>
      <div class="row" style="margin-top:8px"><button class="small" data-act="copy" data-i="${i}">📋 複製</button>
      ${locked ? `<span class="small-print">${s.bought === false ? '（沒買，只記錄）' : ''}</span>` : `<button class="small" data-act="reroll" data-i="${i}">${s.strategy === 'manual' ? '✏️ 修改' : '🔁 重抽'}</button><button class="small" data-act="del" data-i="${i}">移除</button>`}</div></div>`).join('');
    if (!locked) {
      body += `<div class="row" style="margin-top:10px">
        ${batch.sets.length < 3 ? `<button class="grow" data-act="manual-new">✍️ 新增手動組</button>` : ''}
        <button class="grow" data-act="gen">🎲 全部重新產生</button></div>`;
    }
    body += `<div class="row" style="margin-top:8px"><button class="grow" data-act="copyall">📋 複製全部</button>
      ${locked ? '' : `<button class="grow primary" data-act="lock">🔒 鎖定這 ${batch.sets.length} 組</button>`}</div>`;
    if (locked) body += `<div class="alert info" style="margin-top:10px">🔒 已於 ${new Date(batch.lockedAt).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false })}（台灣時間）鎖定，不可再修改。指紋 <code>${batch.fp || '-'}</code></div>`;
  }
  const bought = batch ? batch.sets.filter(s => s.bought !== false).length * L.PRICE : 0;
  view.innerHTML = `${NOTICE}
  <div class="card"><div class="row between"><h2 style="margin:0">下一期：${fmtDate(date)}</h2>${locked ? '<span class="tag ok">已鎖定</span>' : '<span class="tag">草稿</span>'}</div>
    <div class="muted">鎖定截止 20:30（台灣時間）· <b id="cd"></b></div>
    <div class="muted">本期預計花費 ${L.money(bought)}（每組 NT$${L.PRICE}）</div></div>
  <div class="card">${body}</div>
  <div class="card">${budgetBlock(L.monthOf(date), locked ? 0 : bought)}</div>
  <p class="small-print">冷熱混合與覆蓋最大化只是不同的「選號風格」，用來做對照實驗；它們跟純隨機的中獎機率相同。實際投注截止時間請以彩券行／台灣彩券公告為準。</p>`;
  tickCountdown();
}
function tickCountdown() {
  const el = $('#cd'); if (!el) return;
  const date = L.nextDrawDate();
  const ms = L.cutoffInstant(date) - Date.now();
  if (ms <= 0) { el.textContent = '已截止'; return; }
  const m = Math.floor(ms / 60000); const d = Math.floor(m / 1440); const h = Math.floor((m % 1440) / 60);
  el.textContent = `還有 ${d ? d + ' 天 ' : ''}${h} 小時 ${m % 60} 分`;
}
function ensureDraft(date) {
  let b = batchOf(date);
  if (!b) { b = { drawDate: date, createdAt: new Date().toISOString(), lockedAt: null, fp: null, sets: [] }; S.state.batches.push(b); }
  return b;
}
async function doLock(date) {
  const b = batchOf(date);
  if (!b || b.lockedAt || b.sets.length === 0) return;
  if (L.cutoffPassed(date)) { toast('已超過 20:30，無法鎖定'); render(); return; }
  const bought = b.sets.filter(s => s.bought !== false).length * L.PRICE;
  const month = L.monthOf(date);
  const cap = S.state.settings.cap;
  const after = monthCommitted(month) + bought;
  if (cap > 0 && after > cap) {
    const ok = await confirmSheet(`<h2>⛔ 超過每月預算</h2><p>鎖定後 ${month} 預計花費 ${L.money(after)}，已超過上限 ${L.money(cap)}。</p><p>建議取消。若這幾組你其實不打算買，可以取消勾選「我有買」，只做紀錄。</p>`, '我了解，仍然鎖定', '取消（建議）');
    if (!ok) return;
  } else if (cap > 0 && after >= cap * 0.8) {
    toast('⚠️ 已超過本月預算 80%');
  }
  b.lockedAt = new Date().toISOString();
  b.fp = await L.fingerprint(b.drawDate, b.sets, b.lockedAt);
  S.save(); toast('已鎖定'); render();
}
function onTodayClick(e) {
  const t = e.target.closest('[data-act]'); if (!t) return;
  const date = L.nextDrawDate();
  const act = t.dataset.act; const i = +t.dataset.i;
  const cur = batchOf(date);
  if (cur?.lockedAt && !['copy', 'copyall'].includes(act)) return;
  const hist = drawChrono.map(d => d.numbers);
  if (act === 'gen') {
    const b = ensureDraft(date);
    b.sets = L.generateBatch(hist, rng).map(s => ({ ...s, bought: true }));
    S.save(); render();
  } else if (act === 'manual-new') {
    pickerSheet({ title: '手動輸入號碼', onSave: nums => { const b = ensureDraft(date); b.sets.push({ numbers: nums, strategy: 'manual', bought: true }); S.save(); render(); } });
  } else if (act === 'reroll') {
    const b = batchOf(date); const s = b.sets[i];
    if (s.strategy === 'manual') {
      pickerSheet({ title: `修改第 ${i + 1} 組`, initial: s.numbers, onSave: nums => { s.numbers = nums; S.save(); render(); } });
    } else {
      const others = b.sets.filter((_, k) => k !== i).map(x => x.numbers);
      s.numbers = L.regenerateSet(s.strategy, hist, rng, others); S.save(); render();
    }
  } else if (act === 'del') {
    batchOf(date).sets.splice(i, 1); S.save(); render();
  } else if (act === 'copy') {
    copyText(L.fmtNums(batchOf(date).sets[i].numbers));
  } else if (act === 'copyall') {
    copyText(batchOf(date).sets.map(s => L.fmtNums(s.numbers)).join('\n'));
  } else if (act === 'lock') {
    doLock(date);
  }
}
function onTodayChange(e) {
  const t = e.target.closest('[data-act=bought]'); if (!t) return;
  const b = batchOf(L.nextDrawDate()); if (!b || b.lockedAt) return;
  b.sets[+t.dataset.i].bought = t.checked; S.save(); render();
}

// ---------- 紀錄 ----------
function renderRecords() {
  const list = sortedBatches().filter(b => b.sets.length);
  const sm = summary();
  const items = list.map(b => {
    const st = L.batchStatus(b, drawMap);
    const r = st === 'settled' ? L.settleBatch(b, drawMap) : null;
    const tag = { draft: '<span class="tag">草稿</span>', locked: '<span class="tag warn">已鎖定・等開獎</span>', settled: '<span class="tag ok">已對獎</span>', expired: '<span class="tag bad">逾時未鎖定・不計入</span>', void: '<span class="tag bad">該日無開獎・不計入</span>' }[st];
    const sets = b.sets.map((s, i) => {
      const rs = r?.sets[i];
      const strat = (S.state.settings.blind && st !== 'settled' && s.strategy !== 'manual') ? `第 ${i + 1} 組` : L.STRATEGIES[s.strategy];
      return `<div class="setrow"><div class="row between"><span class="small-print">${strat}${s.bought === false ? '・沒買' : ''}</span>
        ${rs ? `<span class="tag ${rs.matches >= 2 ? 'ok' : ''}">中 ${rs.matches} 顆${rs.prize === 'jackpot' ? ' 🎉頭獎！' : rs.amount ? ' ・' + L.money(rs.amount) : ''}</span>` : ''}</div>
        ${balls(s.numbers, { small: true, hit: rs?.hitNumbers })}</div>`;
    }).join('');
    const draw = r?.draw;
    return `<div class="card"><div class="row between"><b>${fmtDate(b.drawDate)}</b>${tag}</div>
      ${draw ? `<div class="row" style="margin:6px 0"><span class="small-print">開獎${draw.issue ? ' 第' + draw.issue + '期' : ''}</span>${balls(draw.numbers, { small: true, draw: true })}</div>` : ''}
      ${sets}
      ${r ? `<div class="row between" style="margin-top:6px"><span>投入 ${L.money(r.spend)}</span><b class="${r.win - r.spend >= 0 ? 'pos' : 'neg'}">獎金 ${L.money(r.win)}（${L.money(r.win - r.spend)}）</b></div>` : ''}
      ${b.lockedAt ? `<div class="small-print">鎖定於 ${new Date(b.lockedAt).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false })}・指紋 ${b.fp || '-'}${st === 'locked' ? ' ・<a href="#" data-act="togglebuy" data-d="' + b.drawDate + '">切換「有買／沒買」</a>' : ''}</div>` : ''}
      ${!b.lockedAt ? `<div class="row" style="margin-top:6px"><button class="small danger" data-act="delbatch" data-d="${b.drawDate}">刪除這筆草稿</button></div>` : ''}</div>`;
  }).join('');
  view.innerHTML = `${NOTICE}
  <div class="card"><div class="tiles"><div class="tile">累計投入（已開獎）<b>${L.money(sm.spendSettled)}</b></div><div class="tile">累計獎金<b>${L.money(sm.win)}</b></div></div></div>
  ${items || '<div class="card muted">還沒有紀錄。到「選號」建立並鎖定第一批吧。</div>'}`;
}
async function onRecordsClick(e) {
  const t = e.target.closest('[data-act]'); if (!t) return;
  e.preventDefault();
  const b = batchOf(t.dataset.d); if (!b) return;
  if (t.dataset.act === 'delbatch' && !b.lockedAt) { if (await confirmSheet('<p>確定刪除這筆草稿？</p>', '刪除')) { S.state.batches = S.state.batches.filter(x => x !== b); S.save(); render(); } }
  if (t.dataset.act === 'togglebuy') {
    const allBought = b.sets.every(s => s.bought !== false);
    b.sets.forEach(s => (s.bought = !allBought)); S.save(); render(); toast(allBought ? '改為「沒買」（不計花費）' : '改為「有買」');
  }
}

// ---------- 統計 ----------
function compareTable(data) {
  const rows = L.BASE_STRATEGIES.map(k => ({ k, st: L.compareStats(data[k] || []) }));
  const expected = L.HYPER_MEAN;
  const html = `<table><thead><tr><th>策略</th><th>組數</th><th>平均命中</th><th>≥2顆比例</th><th>z</th></tr></thead><tbody>
    ${rows.map(({ k, st }) => `<tr><td>${L.STRATEGIES[k]}</td><td>${st.n}</td><td>${st.n ? st.mean.toFixed(3) : '-'}</td><td>${st.n ? (st.ge2 / st.n * 100).toFixed(1) + '%' : '-'}</td><td>${st.n ? st.z.toFixed(2) : '-'}</td></tr>`).join('')}
    <tr><td><b>理論隨機基準</b></td><td>-</td><td>${expected.toFixed(3)}</td><td>${(L.P_GE2 * 100).toFixed(1)}%</td><td>0</td></tr></tbody></table>`;
  const verdicts = rows.map(({ k, st }) => ({ k, v: L.verdict(st) }));
  const kinds = new Set(verdicts.map(x => x.v.kind));
  let statement;
  if (kinds.has('diff')) statement = `<div class="alert warn">${verdicts.filter(x => x.v.kind === 'diff').map(x => L.STRATEGIES[x.k]).join('、')}：${L.verdict({ n: 99, z: 9, zGe2: 9 }).text}</div>`;
  else if (kinds.size === 1 && kinds.has('small')) statement = `<div class="alert info">${verdicts[0].v.text}</div>`;
  else statement = `<div class="alert info">✅ <b>結論：沒有發現任何策略與純隨機有顯著差異。</b>${kinds.has('small') ? '（部分策略樣本仍偏少）' : ''}這符合預期：每期開獎彼此獨立，任何選號方法的中獎機率都一樣。</div>`;
  return html + statement + `<div class="small-print">z 為相對理論隨機基準（每組期望命中 25/39 ≈ 0.641 顆）的標準分數；已對 3 策略 × 2 指標做多重比較校正，|z|&lt;2.64 視為無顯著差異。每組命中 ≥2 顆的理論機率為 ${(L.P_GE2 * 100).toFixed(1)}%。</div>`;
}
function realCompareData() {
  const data = { random: [], hotcold: [], coverage: [] };
  for (const b of S.state.batches) {
    if (L.batchStatus(b, drawMap) !== 'settled') continue;
    const r = L.settleBatch(b, drawMap);
    for (const s of r.sets) if (data[s.strategy]) data[s.strategy].push(s.matches);
  }
  return data;
}
function renderStats() {
  const sm = summary();
  const month = L.monthOf(L.twNow().date);
  const m = sm.byMonth[month] || { spend: 0, win: 0 };
  const roi = sm.roi === null ? '-' : (sm.roi * 100).toFixed(1) + '%';
  const real = realCompareData();
  view.innerHTML = `${NOTICE}
  <div class="card"><h2>累計成績（只計已開獎、有買的組）</h2><div class="tiles">
    <div class="tile">累計投入<b>${L.money(sm.spendSettled)}</b></div>
    <div class="tile">累計獎金<b>${L.money(sm.win)}</b></div>
    <div class="tile">淨損益<b class="${sm.net >= 0 ? 'pos' : 'neg'}">${L.money(sm.net)}</b></div>
    <div class="tile">報酬率 ROI<b class="${sm.roi !== null && sm.roi < 0 ? 'neg' : ''}">${roi}</b></div></div>
    ${sm.spendPending ? `<div class="small-print" style="margin-top:6px">另有 ${L.money(sm.spendPending)} 已鎖定、等待開獎。</div>` : ''}
    <div class="small-print">命中分布：中2顆 ${sm.prizeCounts[2]} 組、中3顆 ${sm.prizeCounts[3]} 組、中4顆 ${sm.prizeCounts[4]} 組、頭獎 ${sm.jackpots} 組。</div></div>
  <div class="card"><h2>每月預算與停損</h2>${budgetBlock(month)}
    <div class="small-print">預算包含已鎖定、等待開獎的花費。上限在「設定」調整。</div></div>
  <div class="card"><h2>策略盲測：和純隨機比</h2>
    <div class="small-print" style="margin-bottom:6px">用你「已鎖定、已開獎」的紀錄比較三種基準策略。盲測模式下，策略名稱在結算前不會顯示。</div>
    ${compareTable(real)}</div>
  <div class="card"><h2>歷史回測（約 ${Math.max(0, drawChrono.length - 100).toLocaleString()} 期）</h2>
    <div class="small-print">用當時以前的資料各策略出 1 組，對照該期實際開獎。看看過去有沒有策略贏過隨機。</div>
    <div class="row" style="margin:8px 0"><button data-act="bt" class="grow">▶ 執行回測</button></div>
    ${btResult ? compareTable(btResult) : ''}</div>`;
}
function onStatsClick(e) {
  if (!e.target.closest('[data-act=bt]')) return;
  const btn = e.target.closest('button'); btn.disabled = true; btn.textContent = '計算中…';
  setTimeout(() => { btResult = L.backtest(drawChrono, rng); render(); }, 30);
}

// ---------- 開獎 ----------
function numberHeat() {
  const recent = drawChrono.slice(-100);
  const f = new Array(40).fill(0); recent.forEach(d => d.numbers.forEach(n => f[n]++));
  const max = Math.max(...f);
  return `<div class="heat">${Array.from({ length: 39 }, (_, i) => `<div style="--h:${(f[i + 1] / max).toFixed(2)}" title="${i + 1} 號出現 ${f[i + 1]} 次">${i + 1}<small>${f[i + 1]}</small></div>`).join('')}</div>`;
}
function renderDraws() {
  const latest = drawChrono[drawChrono.length - 1];
  const q = drawsQuery.trim();
  let list = [...drawChrono].reverse();
  if (q) {
    const nums = q.split(/[\s,，]+/).filter(x => /^\d{1,2}$/.test(x)).map(Number);
    list = list.filter(d => d.date.includes(q) || (d.issue && d.issue.includes(q)) || (nums.length && nums.every(n => d.numbers.includes(n))));
  }
  const shown = list.slice(0, drawsShown);
  const rem = S.state.remote;
  view.innerHTML = `
  <div class="card"><h2>開獎資料</h2>
    <div>最新：${latest ? `${fmtDate(latest.date)} ${latest.issue ? '第' + latest.issue + '期' : '（手動輸入）'}` : '-'}</div>
    ${latest ? balls(latest.numbers, { draw: true }) : ''}
    <div class="small-print" style="margin-top:6px">共 ${drawChrono.length.toLocaleString()} 期・上次同步：${rem.fetchedAt ? new Date(rem.fetchedAt).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false }) : '尚未'}${rem.updated ? `（資料更新 ${rem.updated.replace('T', ' ').slice(0, 16)}）` : ''}</div>
    ${syncState.status === 'fail' ? `<div class="alert warn">${syncState.msg}</div>` : ''}
    <div class="row" style="margin-top:8px"><button class="grow" data-act="sync" ${syncState.status === 'loading' ? 'disabled' : ''}>${syncState.status === 'loading' ? '同步中…' : '🔄 立即同步'}</button><button class="grow" data-act="manual-result">✍️ 手動輸入開獎</button></div>
    <div class="small-print">資料由 GitHub Actions 於開獎日晚間自動更新；若沒更新，可手動輸入，之後官方資料到了會自動覆蓋手動輸入。</div></div>
  <div class="card"><h2>歷史開獎</h2>
    <input type="search" id="dq" placeholder="搜尋：日期、期別或號碼（例 05 12）" value="${q.replace(/"/g, '&quot;')}">
    <div class="small-print">找到 ${list.length.toLocaleString()} 期</div>
    ${shown.map(d => `<div class="drawitem"><div><b>${d.date.slice(5)}</b> <span class="small-print">${d.date.slice(0, 4)} 週${L.WEEKDAYS[L.dow(d.date)]} ${d.issue ? '#' + d.issue : '手動'}</span></div>${balls(d.numbers, { small: true, draw: true })}</div>`).join('')}
    ${list.length > shown.length ? '<button class="grow" style="width:100%;margin-top:8px" data-act="more">載入更多</button>' : ''}</div>
  <div class="card"><details><summary>近 100 期各號出現次數（僅描述過去，不代表未來）</summary>${numberHeat()}</details></div>`;
  const dq = $('#dq');
  if (dq) dq.oninput = e => { drawsQuery = e.target.value; drawsShown = 40; const pos = e.target.selectionStart; renderDraws(); const n = $('#dq'); n.focus(); n.setSelectionRange(pos, pos); };
}
function onDrawsClick(e) {
  const t = e.target.closest('[data-act]'); if (!t) return;
  if (t.dataset.act === 'sync') sync(true);
  if (t.dataset.act === 'more') { drawsShown += 40; render(); }
  if (t.dataset.act === 'manual-result') {
    const latest = drawChrono[drawChrono.length - 1]?.date || L.twNow().date;
    let d = L.addDays(latest, 1); while (!L.isDrawDay(d)) d = L.addDays(d, 1);
    if (d > L.twNow().date) d = latest;
    pickerSheet({ title: '手動輸入開獎號碼', dateField: d, extraHtml: '<div class="small-print">請照官方公告輸入。官方資料同步後會覆蓋這筆。</div>', onSave: (nums, date) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { toast('請選日期'); return false; }
      if (!L.isDrawDay(date)) { toast('週日沒有開獎'); return false; }
      if (date > L.twNow().date) { toast('不能輸入未來的日期'); return false; }
      const ex = drawMap.get(date);
      if (ex && ex.source !== 'manual') { toast('該日已有官方資料'); return false; }
      S.state.manualResults[date] = nums; S.save(); rebuild(); toast('已儲存，並重新對獎'); render();
    } });
  }
}

// ---------- 設定 ----------
function renderSettings() {
  const s = S.state.settings;
  view.innerHTML = `${NOTICE}
  <div class="card"><h2>每月預算上限</h2>
    <label class="field">每月上限（NT$，0＝不設）<input type="number" inputmode="numeric" min="0" step="50" id="cap" value="${s.cap}"></label>
    <div class="small-print">達 80% 會警示；鎖定會讓當月花費超過上限時，會要求你再次確認。</div></div>
  <div class="card"><h2>顯示</h2>
    <label class="row between field"><span>盲測模式（結算前隱藏策略名稱）</span><input type="checkbox" id="blind" ${s.blind ? 'checked' : ''}></label>
    <label class="field">主題<select id="theme"><option value="auto">跟隨系統</option><option value="light">淺色</option><option value="dark">深色</option></select></label></div>
  <div class="card"><h2>資料備份</h2>
    <div class="small-print">資料只存在這支手機的瀏覽器裡。清除網站資料或換手機會消失，建議偶爾匯出備份。</div>
    <div class="row" style="margin-top:8px"><button class="grow" data-act="export">⬇️ 匯出</button><button class="grow" data-act="import">⬆️ 匯入</button><button class="grow danger" data-act="wipe">清除全部</button></div>
    <input type="file" id="importfile" accept="application/json" hidden></div>
  <div class="card"><h2>規則與假設</h2><div class="small-print" style="font-size:13px">
    <p>• 玩法：今彩539，從 1–39 選 5 個號碼，週一至週六開獎；每注（本 App 的一「組」）NT$${L.PRICE}。</p>
    <p>• 獎金（依台灣彩券公告的固定金額）：中 2 顆 NT$50、中 3 顆 NT$300、中 4 顆 NT$20,000；中 5 顆為頭獎（官方頭獎 NT$8,000,000，本 App 只標示「頭獎」，統計時以此名目金額計入，實際請依官方公告與兌領規定）。中 0–1 顆沒有獎。</p>
    <p>• 鎖定：每個開獎日台灣時間 20:30 為鎖定截止，之後不能再鎖定；逾時未鎖定的草稿不計入統計。鎖定後號碼不可修改，並記錄時間與 SHA-256 指紋。這是你自己的紀律工具，不是官方投注憑證；真正的投注截止請以彩券行為準。</p>
    <p>• 「有買」勾選只用來計算花費，預設有買。該日若沒有開獎（例如休市），已鎖定的組會標示「無開獎」且不計入花費。</p>
    <p>• 開獎資料來自台灣彩券官網使用的內部端點（非正式公開 API），可能變動；一切以台灣彩券公告為準。</p>
    <p>• 若覺得難以控制購買行為，可撥 1925 安心專線（24 小時免費）。未滿 18 歲不得購買彩券。</p></div></div>
  <p class="small-print">今彩539 記帳本 v1 ・ 離線可用 ・ <span id="swstate"></span></p>`;
  $('#theme').value = s.theme;
  $('#cap').onchange = e => { s.cap = Math.max(0, Math.round(+e.target.value || 0)); S.save(); toast('已儲存預算'); };
  $('#blind').onchange = e => { s.blind = e.target.checked; S.save(); };
  $('#theme').onchange = e => { s.theme = e.target.value; S.save(); applyTheme(); };
  $('#importfile').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const j = JSON.parse(await f.text());
      if (!j || !Array.isArray(j.batches)) throw new Error();
      if (await confirmSheet('<p>匯入會<b>取代</b>目前所有資料，確定？</p>', '匯入')) { S.replaceAll(j); rebuild(); applyTheme(); toast('已匯入'); render(); }
    } catch { toast('檔案格式不正確'); }
  };
  if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistration().then(r => { const el = $('#swstate'); if (el) el.textContent = r?.active ? '離線快取：已啟用' : '離線快取：未啟用'; });
}
async function onSettingsClick(e) {
  const t = e.target.closest('[data-act]'); if (!t) return;
  if (t.dataset.act === 'export') {
    const blob = new Blob([JSON.stringify(S.state, null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `539-backup-${L.twNow().date}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  if (t.dataset.act === 'import') $('#importfile').click();
  if (t.dataset.act === 'wipe' && await confirmSheet('<h2>清除全部資料？</h2><p>所有選號紀錄、預算設定都會刪除，無法復原。</p>', '清除')) { S.reset(); rebuild(); applyTheme(); toast('已清除'); render(); }
}

// ---------- 主流程 ----------
function applyTheme() {
  const t = S.state.settings.theme;
  if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.dataset.theme = t;
}
function render() {
  document.querySelectorAll('#tabs button').forEach(b => { if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  ({ today: renderToday, records: renderRecords, stats: renderStats, draws: renderDraws, settings: renderSettings })[tab]();
  $('#clock').textContent = '台灣時間 ' + new Date().toLocaleTimeString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false, hour: '2-digit', minute: '2-digit' });
}
function go(t) { tab = t; window.scrollTo(0, 0); render(); }

view.addEventListener('click', e => {
  if (tab === 'today') onTodayClick(e);
  else if (tab === 'records') onRecordsClick(e);
  else if (tab === 'stats') onStatsClick(e);
  else if (tab === 'draws') onDrawsClick(e);
  else if (tab === 'settings') onSettingsClick(e);
});
view.addEventListener('change', e => { if (tab === 'today') onTodayChange(e); });
$('#tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) go(b.dataset.tab); });
$('#sheet').addEventListener('click', e => { if (e.target.id === 'sheet') closeSheet(); });

let lastNext = null;
setInterval(() => {
  const n = L.nextDrawDate();
  if (lastNext && n !== lastNext && tab === 'today') render(); else tickCountdown();
  lastNext = n;
  $('#clock').textContent = '台灣時間 ' + new Date().toLocaleTimeString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false, hour: '2-digit', minute: '2-digit' });
}, 15000);
window.addEventListener('online', () => sync(false));
document.addEventListener('visibilitychange', () => { if (!document.hidden) { rebuild(); if (tab !== 'draws') render(); } });

window.addEventListener('error', e => console.error('app error', e.message));
(async function init() {
  S.load(); applyTheme();
  await loadHistory();
  rebuild(); lastNext = L.nextDrawDate();
  render();
  try { navigator.storage?.persist?.(); } catch {}
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  sync(false);
})();
