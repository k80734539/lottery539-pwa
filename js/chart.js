// 輕量 SVG 折線圖（無外部套件）。series: [{id, name, color, values:[number]}]，x 為索引。
export const COLORS = ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#42d4f4', '#f032e6', '#9a6324', '#469990', '#808000', '#000075', '#a9a9a9'];
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fmt = (v, d) => (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString() : v.toFixed(d));
export function lineChart({ series, labels = [], baseline = null, baselineLabel = '', height = 220, digits = 2, zeroLine = false }) {
  const W = 360, H = height, L = 44, R = 8, T = 10, B = 22;
  const vis = series.filter(s => s.values.length);
  const all = vis.flatMap(s => s.values).concat(baseline !== null ? [baseline] : []).concat(zeroLine ? [0] : []);
  if (!all.length) return '<div class="small-print">還沒有資料可以畫圖。</div>';
  let lo = Math.min(...all), hi = Math.max(...all); if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
  const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
  const n = Math.max(...vis.map(s => s.values.length), labels.length, 2);
  const x = i => L + (W - L - R) * (n === 1 ? 0 : i / (n - 1));
  const y = v => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => lo + (hi - lo) * f);
  const grid = ticks.map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="currentColor" stroke-opacity=".12"/><text x="${L - 4}" y="${y(v) + 3}" text-anchor="end" font-size="9" fill="currentColor" fill-opacity=".6">${fmt(v, digits)}</text>`).join('');
  const xl = labels.length ? [0, Math.floor((n - 1) / 2), n - 1].filter((v, i, a) => a.indexOf(v) === i && labels[v]).map(i => `<text x="${x(i)}" y="${H - 6}" text-anchor="${i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}" font-size="9" fill="currentColor" fill-opacity=".6">${esc(labels[i])}</text>`).join('') : '';
  const base = baseline !== null ? `<line x1="${L}" x2="${W - R}" y1="${y(baseline)}" y2="${y(baseline)}" stroke="currentColor" stroke-dasharray="4 3" stroke-width="1.4"/><text x="${W - R}" y="${y(baseline) - 3}" text-anchor="end" font-size="9" fill="currentColor">${esc(baselineLabel)}</text>` : '';
  const zero = zeroLine ? `<line x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}" stroke="currentColor" stroke-opacity=".5"/>` : '';
  const lines = vis.map(s => {
    const pts = s.values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    return s.values.length === 1 ? `<circle cx="${x(0)}" cy="${y(s.values[0])}" r="3" fill="${s.color}"/>` : `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="${s.bold ? 2.4 : 1.6}" stroke-linejoin="round"/>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" style="display:block;max-width:100%;height:auto">${grid}${zero}${base}${lines}${xl}</svg>`;
}
/** 可切換的圖例：hidden 為 Set */
export function legend(items, hidden, act) {
  return `<div class="row" style="flex-wrap:wrap;gap:4px;margin-top:6px">${items.map(it => `<button class="small" data-act="${act}" data-id="${esc(it.id)}" aria-pressed="${!hidden.has(it.id)}" style="opacity:${hidden.has(it.id) ? 0.4 : 1}"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${it.color};margin-right:4px;vertical-align:middle"></span>${esc(it.name)}</button>`).join('')}
  <button class="small" data-act="${act}" data-id="__all">全選</button><button class="small" data-act="${act}" data-id="__none">全不選</button></div>`;
}
export function toggle(hidden, id, ids) {
  if (id === '__all') hidden.clear(); else if (id === '__none') ids.forEach(i => hidden.add(i)); else if (hidden.has(id)) hidden.delete(id); else hidden.add(id);
}
