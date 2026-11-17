// Save / load through localStorage: cash, mission progress and best stats.
// Storage can be off (private windows); then the game simply plays unsaved.
const KEY = 'viceheat-save-v1';

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return {
      cash: typeof data.cash === 'number' ? data.cash : 0,
      missionIndex: typeof data.missionIndex === 'number' ? data.missionIndex : 0,
      bestCash: typeof data.bestCash === 'number' ? data.bestCash : 0,
    };
  } catch {
    return null;
  }
}

export function saveSave(data) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Storage off: ignore.
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Ignore.
  }
}
