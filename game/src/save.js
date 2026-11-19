// Palmera Bay — saving. Progress (cash, health, ammo, mission, position,
// story completion and the clock) lives in localStorage under one key.
// Nothing sensitive is stored; the save is the player's own progress.
const SAVE_KEY = 'palmera-bay-save-v1';

export function saveGame(G) {
  try {
    const data = {
      v: 1,
      cash: Math.round(G.player.cash),
      health: Math.round(G.player.health),
      ammo: G.player.ammo,
      missionIndex: G.missions.index,
      storyDone: G.missions.done,
      x: Math.round(G.player.x),
      y: Math.round(G.player.y),
      clock: G.clockMinutes,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch (err) {
    return false;
  }
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.v !== 1) return null;
    return data;
  } catch (err) {
    return null;
  }
}

export function hasSave() {
  return loadSave() !== null;
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch (err) { /* ignore */ }
}
