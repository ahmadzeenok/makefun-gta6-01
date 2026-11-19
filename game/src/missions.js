// Palmera Bay — story missions. Rico Vega, a courier who owes the
// Dockside crew $4,000, works it off job by job for fixer Marisol Kane.
// Each mission is a list of steps; a step is done when its check passes,
// and the mission pays cash on completion. Steps: reach a marker, drive
// somewhere, pick up crates, take out a crew, or lose the police.
import { dist, clamp } from './util.js';
import { makePed } from './people.js';
import { addHeat, clearWanted } from './police.js';

const MARKERS = {
  marina: { x: 560, y: 300, label: 'Marina Pier' },
  kaneOffice: { x: 1300, y: 320, label: "Kane's Office" },
  docks: { x: 320, y: 1300, label: 'Dockside Warehouses' },
  coral: { x: 1650, y: 1250, label: 'Coral Bay Plaza' },
  strip: { x: 900, y: 2100, label: 'The Strip' },
  lighthouse: { x: 220, y: 2320, label: 'Old Lighthouse' },
  heights: { x: 2600, y: 500, label: 'Palm Heights' },
  southside: { x: 2700, y: 1300, label: 'Southside Garage' },
};

export const MISSIONS = [
  {
    id: 'wheels', title: '1 — Wheels', pay: 150,
    brief: 'Marisol Kane: "You owe the crew, Rico. First, get yourself a car. Any car. Then bring it to my office in Old Town."',
    steps: [
      { type: 'inCar', text: 'Steal a car — walk up to one and press E' },
      { type: 'reach', at: MARKERS.kaneOffice, text: "Drive to Kane's Office in Old Town" },
    ],
  },
  {
    id: 'courier', title: '2 — The Courier', pay: 300,
    brief: 'Kane: "A package for the Marina. No stops, no questions. You have 75 seconds — the tide waits for nobody."',
    steps: [
      { type: 'reach', at: MARKERS.marina, text: 'Deliver the package to Marina Pier', time: 75 },
    ],
  },
  {
    id: 'crates', title: '3 — Dockside Crates', pay: 400,
    brief: 'Kane: "Three crates went missing at the docks. Walk in, grab them all, walk out. The dock crew will not be happy."',
    steps: [
      { type: 'collect', at: MARKERS.docks, count: 3, text: 'Collect 3 crates at Dockside (0/3)' },
      { type: 'reach', at: MARKERS.coral, text: 'Take the crates to Coral Bay Plaza' },
    ],
  },
  {
    id: 'heat', title: '4 — Hot Cargo', pay: 500,
    brief: 'Kane: "The cops are onto the drop. Get to Palm Heights and lose them. Do NOT get busted."',
    steps: [
      { type: 'heatUp', text: 'The police are coming — run!' },
      { type: 'escape', at: MARKERS.heights, text: 'Reach Palm Heights with no wanted level' },
    ],
  },
  {
    id: 'crew', title: '5 — The Rival Crew', pay: 700,
    brief: 'Kane: "Rival crew muscled into Southside. Clear them out, Rico. All four of them."',
    steps: [
      { type: 'defeat', at: MARKERS.southside, count: 4, text: 'Take out the rival crew in Southside (0/4)' },
      { type: 'reach', at: MARKERS.strip, text: 'Meet Kane on The Strip' },
    ],
  },
  {
    id: 'finale', title: '6 — The Last Run', pay: 1200,
    brief: 'Kane: "One last run, then your debt is gone. Drive the evidence to the Old Lighthouse and burn it. Make it count."',
    steps: [
      { type: 'reach', at: MARKERS.lighthouse, text: 'Drive to the Old Lighthouse', time: 90 },
    ],
  },
];

export function makeMissionState() {
  return {
    index: 0, step: 0, active: false, done: false,
    pickups: [], enemies: [], timer: 0, stepText: '',
    startedAt: 0, banner: '',
  };
}

export function currentMission(ms) {
  return MISSIONS[ms.index] || null;
}

export function currentStep(ms) {
  const m = currentMission(ms);
  return m ? m.steps[ms.step] : null;
}

export function startMission(G) {
  const ms = G.missions;
  const m = currentMission(ms);
  if (!m || ms.active) return;
  ms.active = true;
  ms.step = 0;
  ms.pickups = [];
  ms.enemies = [];
  ms.timer = 0;
  ms.banner = m.title;
  G.toast(m.brief, 7);
  G.audio.pickup();
  enterStep(G);
}

function enterStep(G) {
  const ms = G.missions;
  const step = currentStep(ms);
  if (!step) return;
  ms.stepText = step.text;
  if (step.type === 'collect') {
    ms.pickups = [];
    for (let i = 0; i < step.count; i++) {
      ms.pickups.push({
        x: step.at.x + (i - 1) * 130 + (G.rng() * 40 - 20),
        y: step.at.y + ((i % 2) * 110 - 40),
        taken: false,
      });
    }
  }
  if (step.type === 'defeat') {
    ms.enemies = [];
    for (let i = 0; i < step.count; i++) {
      const e = makePed(G.world, G.rng, { x: step.at.x + (i - 1) * 120, y: step.at.y + (i % 2 ? 90 : -90), enemy: true });
      ms.enemies.push(e);
      G.peds.push(e);
    }
    G.toast('Rival crew spotted — take them all out!', 4);
  }
  if (step.type === 'heatUp') {
    addHeat(G.police, 55, G.time);
    G.toast('Police alerted! Lose them!', 4);
  }
  if (step.time) ms.timer = step.time;
}

function advanceStep(G) {
  const ms = G.missions;
  const m = currentMission(ms);
  ms.step += 1;
  if (ms.step >= m.steps.length) {
    completeMission(G);
  } else {
    enterStep(G);
    G.audio.pickup();
  }
}

function completeMission(G) {
  const ms = G.missions;
  const m = currentMission(ms);
  G.player.cash += m.pay;
  G.player.ammo += 12;
  ms.active = false;
  ms.index += 1;
  ms.banner = '';
  G.toast(`${m.title} COMPLETE — +$${m.pay}, +12 ammo`, 6);
  G.audio.missionDone();
  G.saveGame(true);
  if (ms.index >= MISSIONS.length) {
    ms.done = true;
    G.toast('STORY COMPLETE! Rico is free — debt paid. Palmera Bay is yours.', 9);
  }
}

export function failMission(G, reason) {
  const ms = G.missions;
  if (!ms.active) return;
  ms.active = false;
  ms.pickups = [];
  for (const e of ms.enemies) {
    const i = G.peds.indexOf(e);
    if (i >= 0) G.peds.splice(i, 1);
  }
  ms.enemies = [];
  ms.step = 0;
  G.toast(`Mission failed: ${reason}. Press M to retry.`, 6);
  G.audio.failed();
}

export function updateMissions(G, dt) {
  const ms = G.missions;
  if (!ms.active) return;
  const step = currentStep(ms);
  if (!step) return;
  const p = G.player;

  if (step.time) {
    ms.timer -= dt;
    if (ms.timer <= 0) {
      failMission(G, 'Out of time');
      return;
    }
  }

  if (step.type === 'inCar') {
    if (p.car) advanceStep(G);
    return;
  }
  if (step.type === 'reach') {
    if (dist(p.x, p.y, step.at.x, step.at.y) < 70) advanceStep(G);
    return;
  }
  if (step.type === 'collect') {
    let got = 0;
    for (const pk of ms.pickups) {
      if (!pk.taken && dist(p.x, p.y, pk.x, pk.y) < 34) {
        pk.taken = true;
        G.audio.cash();
        G.player.cash += 25;
        G.particles.push({ x: pk.x, y: pk.y, vx: 0, vy: -40, life: 0.6, max: 0.6, color: '#ffd94d', size: 6, kind: 'spark' });
      }
      if (pk.taken) got += 1;
    }
    ms.stepText = step.text.replace(/\(\d+\/\d+\)/, `(${got}/${step.count})`);
    if (got >= step.count) advanceStep(G);
    return;
  }
  if (step.type === 'heatUp') {
    advanceStep(G);
    return;
  }
  if (step.type === 'escape') {
    if (G.police.wanted === 0 && dist(p.x, p.y, step.at.x, step.at.y) < 90) advanceStep(G);
    return;
  }
  if (step.type === 'defeat') {
    const left = ms.enemies.filter((e) => !e.dead).length;
    ms.stepText = step.text.replace(/\(\d+\/\d+\)/, `(${step.count - left}/${step.count})`);
    if (left === 0) {
      clearWanted(G.police);
      advanceStep(G);
    }
    return;
  }
}

export function missionTarget(G) {
  const ms = G.missions;
  if (!ms.active) return null;
  const step = currentStep(ms);
  if (!step) return null;
  if (step.at) return { x: step.at.x, y: step.at.y, label: step.at.label || '' };
  if (step.type === 'collect') {
    const next = ms.pickups.find((pk) => !pk.taken);
    return next ? { x: next.x, y: next.y, label: 'Crate' } : null;
  }
  if (step.type === 'defeat') {
    const next = ms.enemies.find((e) => !e.dead);
    return next ? { x: next.x, y: next.y, label: 'Rival' } : null;
  }
  return null;
}

export { MARKERS };
