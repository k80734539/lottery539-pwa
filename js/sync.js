// 跨裝置同步：逐筆合併（last-write-wins），刪除用墓碑，絕不整批刪除。
// 純函式（stamp / toDoc / mergeDocs / applyDoc）不碰網路，方便測試；gist* 才連 GitHub。
export const MAX_TOMBS_PER_SAVE = 3; // 一次存檔若「消失」超過 3 筆，視為異常，不產生刪除墓碑
const h = s => { let x = 5381; for (let i = 0; i < s.length; i++) x = ((x << 5) + x + s.charCodeAt(i)) >>> 0; return x.toString(36) + ':' + s.length; };

/** 把 state 攤平成 {key: record}。key 前綴：b 選號批次、a 擂台、l 樂合、m 手動開獎、s 設定、ls 樂合設定 */
export function flatten(state) {
  const out = {};
  for (const b of state.batches || []) if (b?.drawDate) out['b:' + b.drawDate] = b;
  for (const e of state.arena?.entries || []) if (e?.drawDate) out['a:' + e.drawDate] = e;
  for (const e of state.lehe?.entries || []) if (e?.id) out['l:' + e.id] = e;
  for (const [d, n] of Object.entries(state.manualResults || {})) out['m:' + d] = n;
  if (state.settings) out.s = state.settings;
  if (state.lehe?.settings) out.ls = state.lehe.settings;
  return out;
}
function ensureMeta(state) { state._sync = { meta: {}, tomb: {}, h: {}, ...(state._sync || {}) }; return state._sync; }

/** 每次存檔前呼叫：有變動的紀錄蓋上 updatedAt；消失的紀錄留下墓碑。 */
export function stamp(state, now = Date.now()) {
  const m = ensureMeta(state); const flat = flatten(state); const first = !Object.keys(m.h).length;
  const nh = {};
  for (const [k, v] of Object.entries(flat)) {
    nh[k] = h(JSON.stringify(v));
    if (m.h[k] !== nh[k]) { m.meta[k] = first && !m.meta[k] ? 1 : (m.h[k] === undefined && m.meta[k] ? m.meta[k] : now); delete m.tomb[k]; }
    else if (!m.meta[k]) m.meta[k] = 1;
  }
  const gone = Object.keys(m.h).filter(k => !(k in nh) && k !== 's' && k !== 'ls');
  if (gone.length <= MAX_TOMBS_PER_SAVE) for (const k of gone) { m.tomb[k] = now; delete m.meta[k]; }
  m.h = nh;
  return state;
}
/** 要上傳的文件 */
export function toDoc(state) {
  const m = ensureMeta(state);
  return { v: 1, records: flatten(state), meta: { ...m.meta }, tomb: { ...m.tomb } };
}
/** 合併兩份文件：每筆取 updatedAt 較新者；墓碑時間 ≥ 紀錄時間才刪除。 */
export function mergeDocs(a, b) {
  a = a || { records: {}, meta: {}, tomb: {} }; b = b || { records: {}, meta: {}, tomb: {} };
  const out = { v: 1, records: {}, meta: {}, tomb: {} };
  const keys = new Set([...Object.keys(a.records || {}), ...Object.keys(b.records || {}), ...Object.keys(a.tomb || {}), ...Object.keys(b.tomb || {})]);
  for (const k of keys) {
    const ta = (a.records || {})[k] !== undefined ? (a.meta?.[k] || 0) : -1;
    const tb = (b.records || {})[k] !== undefined ? (b.meta?.[k] || 0) : -1;
    const tomb = Math.max(a.tomb?.[k] || 0, b.tomb?.[k] || 0);
    let rec, t;
    if (ta >= tb && ta >= 0) { rec = a.records[k]; t = ta; } else if (tb >= 0) { rec = b.records[k]; t = tb; }
    // 擂台紀錄一旦鎖定不該改；兩邊都有時保留較早鎖定的（較誠實）
    if (k.startsWith('a:') && ta >= 0 && tb >= 0) { const ra = a.records[k], rb = b.records[k]; rec = (Date.parse(rb.lockedAt) < Date.parse(ra.lockedAt)) ? rb : ra; }
    if (rec !== undefined && (!tomb || t > tomb)) { out.records[k] = rec; out.meta[k] = t; }
    else if (tomb) out.tomb[k] = tomb;
  }
  return out;
}
/** 把合併結果寫回 state（不另外蓋時間戳）。 */
export function applyDoc(state, doc) {
  const r = doc.records; const sorted = p => Object.keys(r).filter(k => k.startsWith(p)).sort().map(k => r[k]);
  state.batches = sorted('b:');
  state.arena = { ...(state.arena || {}), entries: sorted('a:') };
  state.lehe = { ...(state.lehe || {}), entries: sorted('l:') };
  state.manualResults = Object.fromEntries(Object.keys(r).filter(k => k.startsWith('m:')).map(k => [k.slice(2), r[k]]));
  if (r.s) state.settings = { ...state.settings, ...r.s };
  if (r.ls) state.lehe.settings = { ...state.lehe.settings, ...r.ls, prizes: { ...(state.lehe.settings?.prizes || {}), ...(r.ls.prizes || {}) } };
  const m = ensureMeta(state); m.meta = { ...doc.meta }; m.tomb = { ...doc.tomb };
  const nh = {}; for (const [k, v] of Object.entries(flatten(state))) nh[k] = h(JSON.stringify(v)); m.h = nh;
  return state;
}
export const sameDoc = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---------- GitHub Gist ----------
export const GIST_FILE = '539-sync.json';
export const GIST_DESC = '539app 同步資料（請勿刪除）';
const API = 'https://api.github.com';
const hdr = token => ({ Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' });
async function gh(token, path, opt = {}) {
  const res = await fetch(API + path, { ...opt, headers: hdr(token), cache: 'no-store' });
  if (res.status === 401) throw new Error('Token 無效或已過期（401）');
  if (res.status === 403 || res.status === 404) throw new Error(`沒有權限（${res.status}），請確認 token 有勾 gist`);
  if (!res.ok) throw new Error('GitHub 回應 ' + res.status);
  return res.json();
}
/** 找到（或建立）私人 gist，回傳 {id, doc} */
export async function gistPull(token, gistId) {
  let g = null;
  if (gistId) { try { g = await gh(token, '/gists/' + gistId); } catch (e) { if (!/404/.test(e.message)) throw e; } }
  if (!g) {
    for (let page = 1; page <= 5 && !g; page++) {
      const list = await gh(token, `/gists?per_page=100&page=${page}`);
      g = list.find(x => x.files?.[GIST_FILE]) || null;
      if (list.length < 100) break;
    }
    if (g) g = await gh(token, '/gists/' + g.id);
  }
  if (!g) return { id: null, doc: null };
  const f = g.files[GIST_FILE];
  let text = f?.content || '';
  if (f?.truncated) text = await (await fetch(f.raw_url, { cache: 'no-store' })).text();
  let doc = null; try { doc = text ? JSON.parse(text) : null; } catch { doc = null; }
  return { id: g.id, doc };
}
export async function gistPush(token, gistId, doc) {
  const files = { [GIST_FILE]: { content: JSON.stringify(doc) } };
  if (gistId) return (await gh(token, '/gists/' + gistId, { method: 'PATCH', body: JSON.stringify({ files }) })).id;
  return (await gh(token, '/gists', { method: 'POST', body: JSON.stringify({ description: GIST_DESC, public: false, files }) })).id;
}
