// 本機儲存（localStorage；資料很小）。壞資料時保留備份並重新開始。
const KEY = 'lottery539pwa:v1';
const defaults = () => ({
  v: 1,
  settings: { cap: 1500, blind: true, theme: 'auto' },
  batches: [], // {drawDate, createdAt, lockedAt, fp, sets:[{numbers,strategy,bought}]}
  manualResults: {}, // date -> numbers
  remote: { draws: [], updated: null, fetchedAt: null },
  arena: { entries: [] }, // 策略擂台：每期自動記錄的 4 碼選號
});
export let state = defaults();
export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw);
      state = { ...defaults(), ...p, settings: { ...defaults().settings, ...(p.settings || {}) }, remote: { ...defaults().remote, ...(p.remote || {}) }, arena: { entries: [], ...(p.arena || {}) } };
    }
  } catch (e) {
    try { localStorage.setItem(KEY + ':corrupt-' + Date.now(), localStorage.getItem(KEY) || ''); } catch {}
    state = defaults();
  }
  return state;
}
export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); return true; } catch { return false; }
}
export function replaceAll(obj) {
  state = { ...defaults(), ...obj, settings: { ...defaults().settings, ...(obj.settings || {}) }, remote: { ...defaults().remote, ...(obj.remote || {}) }, arena: { entries: [], ...(obj.arena || {}) } };
  save();
}
export function reset() { state = defaults(); save(); }
