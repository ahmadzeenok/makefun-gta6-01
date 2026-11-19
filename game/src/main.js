// Palmera Bay — the game itself: state, the main loop, the player on
// foot and behind the wheel, combat, the camera, particles and the menus.
// The city, cars, people, police and missions live in their own modules;
// this file wires them together and draws each frame.
import { mulberry32, clamp, dist, angleDiff } from './util.js';
import { makeWorld, drawWorld, hitsSolid, WORLD_W, WORLD_H } from './world.js';
import { makeAudio } from './audio.js';
import { makeInput } from './input.js';
import { makeCar, spawnTraffic, updateTrafficCar, drivePlayerCar, drawCar } from './vehicles.js';
import { spawnPeds, updatePed, enemyShoot, drawPed } from './people.js';
import { makePoliceState, updatePolice, addHeat, clearWanted } from './police.js';
import { makeMissionState, startMission, updateMissions, failMission, currentMission } from './missions.js';
import { drawHud, drawMissionMarker } from './hud.js';
import { saveGame as persistSave, loadSave, hasSave, clearSave } from './save.js';
import { shotName, applyShot } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');

function resize() {
  canvas.width = Math.floor(window.innerWidth);
  canvas.height = Math.floor(window.innerHeight);
}
window.addEventListener('resize', resize);
resize();

const G = {
  seed: 20261119,
  rng: null,
  world: null,
  audio: makeAudio(),
  input: makeInput(canvas),
  player: null,
  cars: [],
  peds: [],
  police: makePoliceState(),
  missions: makeMissionState(),
  particles: [],
  skids: [],
  time: 0,
  clockMinutes: 9 * 60,
  state: 'title', // title | playing | paused | dead | busted
  cam: { x: 0, y: 0, w: 0, h: 0 },
  shake: 0,
  toastText: '',
  toastTimer: 0,
  gunfireAt: null,
  damageCooldown: 0,
  regenTimer: 0,
  shotCooldown: 0,
  punchCooldown: 0,
  interactCooldown: 0,
  spawnTimer: 0,
  muzzle: 0,
};

G.toast = function toast(text, seconds) {
  G.toastText = text;
  G.toastTimer = seconds || 4;
  statusEl.textContent = text;
};

G.saveGame = function saveGame(silent) {
  const ok = persistSave(G);
  if (!silent) G.toast(ok ? 'Progress saved.' : 'Save failed — storage unavailable.');
  return ok;
};

function newPlayer(x, y) {
  return {
    x, y, angle: -Math.PI / 2, speed: 0,
    health: 100, cash: 120, ammo: 24,
    car: null, walkPhase: 0, dead: false,
  };
}

function resetGame(fromSave) {
  const save = fromSave ? loadSave() : null;
  G.rng = mulberry32(G.seed);
  G.world = makeWorld(G.seed);
  G.cars = spawnTraffic(G.world, G.rng, 26);
  G.peds = spawnPeds(G.world, G.rng, 42);
  G.police = makePoliceState();
  G.missions = makeMissionState();
  G.particles = [];
  G.skids = [];
  G.time = 0;
  G.clockMinutes = 9 * 60;
  G.shake = 0;
  G.toastText = '';
  G.toastTimer = 0;
  const startX = 1300;
  const startY = 700;
  G.player = newPlayer(save ? save.x : startX, save ? save.y : startY);
  if (save) {
    G.player.cash = save.cash;
    G.player.health = save.health;
    G.player.ammo = save.ammo;
    G.missions.index = save.missionIndex;
    G.missions.done = save.storyDone;
    G.clockMinutes = save.clock;
    G.toast('Welcome back, Rico. Save loaded.');
  }
  G.state = 'playing';
  showOverlay(null);
}

G.damagePlayer = function damagePlayer(amount, fromX, fromY) {
  const p = G.player;
  if (G.state !== 'playing' || p.health <= 0) return;
  p.health -= amount;
  G.shake = Math.max(G.shake, 5);
  G.regenTimer = 0;
  if (p.health <= 0) {
    p.health = 0;
    die('wasted');
  }
};

function die(kind) {
  const p = G.player;
  if (p.car) {
    p.car.isPlayer = false;
    p.car.speed = 0;
    p.car = null;
  }
  G.audio.failed();
  if (kind === 'busted') {
    G.state = 'busted';
    G.police.busted = false;
    clearWanted(G.police);
    showOverlay('busted');
  } else {
    G.state = 'dead';
    showOverlay('dead');
  }
  failMission(G, kind === 'busted' ? 'You got busted' : 'You got wasted');
}

// ---- player: on foot -------------------------------------------------

function updateOnFoot(dt) {
  const p = G.player;
  const input = G.input;
  const cam = G.cam;
  // Face the mouse.
  const wx = cam.x + input.mouseX;
  const wy = cam.y + input.mouseY;
  p.angle = Math.atan2(wy - p.y, wx - p.x);
  const mx = (input.down('d', 'arrowright') ? 1 : 0) - (input.down('a', 'arrowleft') ? 1 : 0);
  const my = (input.down('s', 'arrowdown') ? 1 : 0) - (input.down('w', 'arrowup') ? 1 : 0);
  const sprint = input.down('shift');
  const speed = sprint ? 235 : 150;
  let nx = p.x;
  let ny = p.y;
  if (mx !== 0 || my !== 0) {
    const len = Math.sqrt(mx * mx + my * my);
    nx = p.x + (mx / len) * speed * dt;
    ny = p.y + (my / len) * speed * dt;
    p.walkPhase += dt * 10;
  }
  if (!hitsSolid(G.world, nx, p.y, 11)) p.x = nx;
  if (!hitsSolid(G.world, p.x, ny, 11)) p.y = ny;
  p.x = clamp(p.x, 70, WORLD_W - 30);
  p.y = clamp(p.y, 50, WORLD_H - 30);

  G.shotCooldown -= dt;
  G.punchCooldown -= dt;
  if (input.clicked && G.shotCooldown <= 0) {
    if (p.ammo > 0) shoot(wx, wy);
    else punch();
  }
  if (input.wasPressed('f') && G.punchCooldown <= 0) punch();

  // Steal / enter a car.
  G.interactCooldown -= dt;
  if (input.wasPressed('e') && G.interactCooldown <= 0) {
    G.interactCooldown = 0.35;
    let best = null;
    let bestD = 56;
    for (const c of G.cars) {
      const d = dist(p.x, p.y, c.x, c.y);
      if (d < bestD) { bestD = d; best = c; }
    }
    if (best) enterCar(best);
  }
}

function enterCar(car) {
  const p = G.player;
  if (car.isPolice) {
    G.toast('That is a police cruiser — stealing it is a terrible idea. (It is also locked.)');
    return;
  }
  const wasTraffic = car.isTraffic;
  if (wasTraffic && car.driver) {
    // The driver bails out and runs.
    const driver = { x: car.x + 30, y: car.y + 10, angle: 0, speed: 130, shirt: '#e8e8e8', pants: '#222831', walkPhase: 0, target: null, fleeing: true, fleeTimer: 5, enemy: false, health: 30, shootCooldown: 0, dead: false, cash: 0 };
    G.peds.push(driver);
    addHeat(G.police, 14, G.time);
    G.toast('Car stolen! The cops noticed. (+1 heat)');
    G.audio.crash();
  }
  car.isPlayer = true;
  car.isTraffic = false;
  car.driver = true;
  p.car = car;
  p.x = car.x;
  p.y = car.y;
  G.audio.blip(300, 500, 0.12, 'square', 0.15);
}

function exitCar() {
  const p = G.player;
  const car = p.car;
  if (!car) return;
  car.isPlayer = false;
  car.speed = 0;
  p.car = null;
  p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 34;
  p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 34;
  if (hitsSolid(G.world, p.x, p.y, 11)) {
    p.x = car.x - Math.cos(car.angle + Math.PI / 2) * 34;
    p.y = car.y - Math.sin(car.angle + Math.PI / 2) * 34;
  }
}

function shoot(wx, wy) {
  const p = G.player;
  p.ammo -= 1;
  G.shotCooldown = 0.22;
  G.muzzle = 0.07;
  G.audio.shot();
  G.gunfireAt = { x: p.x, y: p.y };
  const aim = Math.atan2(wy - p.y, wx - p.x);
  // Nearest living target near the aim line, within range.
  let best = null;
  let bestD = 560;
  const consider = (x, y, obj) => {
    const d = dist(p.x, p.y, x, y);
    if (d > bestD) return;
    const a = Math.atan2(y - p.y, x - p.x);
    if (Math.abs(angleDiff(aim, a)) < 0.16 + 26 / Math.max(d, 40)) {
      bestD = d;
      best = obj;
    }
  };
  for (const ped of G.peds) if (!ped.dead) consider(ped.x, ped.y, { kind: 'ped', ped });
  for (const c of G.cars) {
    if (c === p.car) continue;
    consider(c.x, c.y, { kind: 'car', car: c });
  }
  const endX = p.x + Math.cos(aim) * (best ? bestD : 560);
  const endY = p.y + Math.sin(aim) * (best ? bestD : 560);
  G.particles.push({ x: p.x + Math.cos(aim) * 18, y: p.y + Math.sin(aim) * 18, vx: 0, vy: 0, life: 0.08, max: 0.08, color: '#ffd94d', size: 6, kind: 'flash' });
  G.particles.push({ x: endX, y: endY, vx: 0, vy: 0, life: 0.25, max: 0.25, color: '#fff', size: 3, kind: 'spark' });
  if (best && best.kind === 'ped') {
    const ped = best.ped;
    ped.health -= 34;
    ped.fleeing = true;
    ped.fleeTimer = 4;
    if (ped.health <= 0 && !ped.dead) {
      ped.dead = true;
      burst(ped.x, ped.y, '#c83a2e', 10);
      if (ped.enemy) {
        p.cash += 60;
        G.toast('Rival down! +$60');
      } else {
        addHeat(G.police, 10, G.time);
      }
    }
  } else if (best && best.kind === 'car') {
    const car = best.car;
    car.health -= 20;
    car.smoke = 1;
    burst(endX, endY, '#ffb84d', 6);
    if (car.health <= 0) explodeCar(car);
    if (car.isPolice) addHeat(G.police, 8, G.time);
  }
  addHeat(G.police, 2, G.time);
}

function punch() {
  const p = G.player;
  G.punchCooldown = 0.45;
  G.audio.punch();
  let hit = false;
  for (const ped of G.peds) {
    if (ped.dead) continue;
    if (dist(p.x, p.y, ped.x, ped.y) < 42) {
      ped.health -= 30;
      ped.fleeing = true;
      ped.fleeTimer = 3;
      hit = true;
      if (ped.health <= 0) {
        ped.dead = true;
        burst(ped.x, ped.y, '#c83a2e', 8);
        if (ped.enemy) p.cash += 60;
        else addHeat(G.police, 8, G.time);
      }
    }
  }
  if (!hit) G.particles.push({ x: p.x + Math.cos(p.angle) * 26, y: p.y + Math.sin(p.angle) * 26, vx: 0, vy: 0, life: 0.15, max: 0.15, color: '#fff', size: 4, kind: 'flash' });
}

function explodeCar(car) {
  burst(car.x, car.y, '#ff7a2e', 26);
  burst(car.x, car.y, '#333', 14);
  G.audio.crash();
  G.shake = Math.max(G.shake, 10);
  car.health = 100;
  car.smoke = 0;
  car.speed = 0;
  car.x += 60;
  car.y += 60;
  addHeat(G.police, 12, G.time);
}

function burst(x, y, color, n) {
  for (let i = 0; i < n; i++) {
    const a = G.rng() * Math.PI * 2;
    const s = 40 + G.rng() * 160;
    G.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.4 + G.rng() * 0.4, max: 0.8, color, size: 3 + G.rng() * 3, kind: 'spark' });
  }
}

// ---- main update ------------------------------------------------------

function update(dt) {
  G.time += dt;
  G.clockMinutes += dt * 0.55;
  if (G.clockMinutes >= 1440) G.clockMinutes -= 1440;
  const p = G.player;
  if (G.toastTimer > 0) G.toastTimer -= dt;
  if (G.muzzle > 0) G.muzzle -= dt;
  if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 26);
  if (G.gunfireAt && G.time - 0 > 0) G.gunfireAt = null;

  // Health slowly regenerates when the player stays out of trouble.
  G.regenTimer += dt;
  if (G.regenTimer > 9 && p.health > 0 && p.health < 100) p.health = Math.min(100, p.health + 4 * dt);

  if (G.input.wasPressed('m')) {
    if (!G.missions.active && currentMission(G.missions)) startMission(G);
  }
  if (G.input.wasPressed('p', 'escape')) {
    G.state = 'paused';
    showOverlay('paused');
  }

  if (p.car) {
    if (G.autoDrive) G.input.keys['w'] = true;
    const crashed = drivePlayerCar(p.car, G.input, dt, G.world, G.cars, () => {
      G.audio.crash();
      G.shake = Math.max(G.shake, 7);
      burst(p.car.x, p.car.y, '#ffb84d', 5);
      // A fender-bender draws a little heat, but not on every scrape.
      if (G.time - (G.lastCrashHeat || -99) > 3) {
        G.lastCrashHeat = G.time;
        addHeat(G.police, 1, G.time);
      }
    });
    if (crashed && Math.abs(p.car.speed) > 60) p.health -= 2;
    p.x = p.car.x;
    p.y = p.car.y;
    p.angle = p.car.angle;
    if (Math.abs(p.car.speed) > 120) {
      G.skids.push({ x: p.car.x - Math.cos(p.car.angle) * 14, y: p.car.y - Math.sin(p.car.angle) * 14, life: 1.4 });
      if (G.skids.length > 220) G.skids.shift();
    }
    G.interactCooldown -= dt;
    if (G.input.wasPressed('e') && G.interactCooldown <= 0) {
      G.interactCooldown = 0.35;
      exitCar();
    }
  } else {
    updateOnFoot(dt);
  }

  // Traffic and peds.
  for (const c of G.cars) {
    if (c.isPlayer || c.isPolice) continue;
    updateTrafficCar(G.world, c, dt, G.rng, G.cars);
  }
  for (const ped of G.peds) {
    if (ped.dead) continue;
    updatePed(G.world, ped, dt, G.rng, p, G.cars, null);
    if (ped.enemy) {
      if (enemyShoot(ped, p, dt, G.rng)) {
        G.damagePlayer(6, ped.x, ped.y);
        G.audio.enemyShot();
        G.particles.push({ x: ped.x, y: ped.y, vx: 0, vy: 0, life: 0.1, max: 0.1, color: '#ffd94d', size: 5, kind: 'flash' });
      }
    }
  }
  // A car running over a ped is a crime, and a messy one.
  for (const c of G.cars) {
    if (Math.abs(c.speed) < 60) continue;
    for (const ped of G.peds) {
      if (ped.dead) continue;
      if (dist(c.x, c.y, ped.x, ped.y) < 22) {
        ped.dead = true;
        burst(ped.x, ped.y, '#c83a2e', 8);
        if (c.isPlayer) addHeat(G.police, 12, G.time);
      }
    }
  }

  updatePolice(G, dt);
  if (G.police.busted) {
    G.police.busted = false;
    die('busted');
    return;
  }
  updateMissions(G, dt);

  // Keep the streets populated near the player.
  G.spawnTimer -= dt;
  if (G.spawnTimer <= 0) {
    G.spawnTimer = 3;
    const nearTraffic = G.cars.filter((c) => !c.isPolice && dist(c.x, c.y, p.x, p.y) < 900).length;
    if (nearTraffic < 10) {
      const car = makeCar(G.world, G.rng);
      car.x = clamp(p.x + (G.rng() < 0.5 ? -700 : 700), 200, 3300);
      car.y = clamp(p.y + (G.rng() < 0.5 ? -500 : 500), 120, 2500);
      G.cars.push(car);
    }
    const nearPeds = G.peds.filter((pd) => !pd.dead && dist(pd.x, pd.y, p.x, p.y) < 800).length;
    if (nearPeds < 14) {
      const ped = spawnPeds(G.world, G.rng, 1)[0];
      ped.x = clamp(p.x + (G.rng() < 0.5 ? -600 : 600), 200, 3300);
      ped.y = clamp(p.y + (G.rng() < 0.5 ? -400 : 400), 120, 2500);
      G.peds.push(ped);
    }
    // Prune the dead and the far away so the arrays stay small.
    G.peds = G.peds.filter((pd) => !pd.dead || G.rng() < 0.02);
    if (G.cars.length > 60) G.cars = G.cars.filter((c) => c.isPlayer || c.isPolice || dist(c.x, c.y, p.x, p.y) < 1400);
  }

  // Particles.
  for (const pt of G.particles) {
    pt.life -= dt;
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vx *= 0.92;
    pt.vy *= 0.92;
  }
  G.particles = G.particles.filter((pt) => pt.life > 0);
  for (const s of G.skids) s.life -= dt;
  G.skids = G.skids.filter((s) => s.life > 0);

  // Camera follows the player, looking a little ahead when driving.
  const lookX = p.car ? Math.cos(p.angle) * 70 : 0;
  const lookY = p.car ? Math.sin(p.angle) * 70 : 0;
  G.cam.w = canvas.width;
  G.cam.h = canvas.height;
  const tx = clamp(p.x + lookX - G.cam.w / 2, 0, Math.max(0, WORLD_W - G.cam.w));
  const ty = clamp(p.y + lookY - G.cam.h / 2, 0, Math.max(0, WORLD_H - G.cam.h));
  G.cam.x += (tx - G.cam.x) * Math.min(1, 6 * dt);
  G.cam.y += (ty - G.cam.y) * Math.min(1, 6 * dt);

  // Engine + siren follow the game.
  const speed01 = p.car ? clamp(Math.abs(p.car.speed) / 420, 0, 1) : 0;
  G.audio.update(dt, speed01, G.police.wanted);
}

Object.defineProperty(G, 'clockText', {
  get() {
    const h = Math.floor(G.clockMinutes / 60) % 24;
    const m = Math.floor(G.clockMinutes % 60);
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  },
});

// ---- rendering ----------------------------------------------------------

function draw() {
  const vw = canvas.width;
  const vh = canvas.height;
  ctx.clearRect(0, 0, vw, vh);
  if (G.state === 'title') {
    drawTitle(vw, vh);
    return;
  }
  const shakeX = G.shake > 0 ? (G.rng() * 2 - 1) * G.shake : 0;
  const shakeY = G.shake > 0 ? (G.rng() * 2 - 1) * G.shake : 0;
  const cam = { x: G.cam.x + shakeX, y: G.cam.y + shakeY, w: vw, h: vh };
  drawWorld(ctx, G.world, cam);

  // Skid marks.
  ctx.strokeStyle = 'rgba(20,20,20,0.45)';
  ctx.lineWidth = 4;
  for (const s of G.skids) {
    ctx.globalAlpha = clamp(s.life, 0, 1) * 0.6;
    ctx.beginPath();
    ctx.moveTo(s.x - cam.x, s.y - cam.y);
    ctx.lineTo(s.x - cam.x + 3, s.y - cam.y + 3);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Pickups (mission crates).
  for (const pk of G.missions.pickups) {
    if (pk.taken) continue;
    const x = pk.x - cam.x;
    const y = pk.y - cam.y;
    ctx.fillStyle = '#8a6d2e';
    ctx.fillRect(x - 13, y - 13, 26, 26);
    ctx.strokeStyle = '#ffd94d';
    ctx.lineWidth = 2;
    ctx.strokeRect(x - 13, y - 13, 26, 26);
    ctx.fillStyle = '#ffd94d';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('CRATE', x, y + 4);
  }

  drawMissionMarker(ctx, G, cam);

  // Cars, then people, then the player on foot.
  for (const c of G.cars) drawCar(ctx, c, cam);
  for (const ped of G.peds) drawPed(ctx, ped, cam);
  if (!G.player.car) drawPlayerOnFoot(ctx, cam);
  if (G.muzzle > 0) {
    const p = G.player;
    ctx.fillStyle = '#ffe98a';
    ctx.beginPath();
    ctx.arc(p.x + Math.cos(p.angle) * 22 - cam.x, p.y + Math.sin(p.angle) * 22 - cam.y, 7, 0, Math.PI * 2);
    ctx.fill();
  }

  // Particles.
  for (const pt of G.particles) {
    ctx.globalAlpha = clamp(pt.life / pt.max, 0, 1);
    ctx.fillStyle = pt.color;
    ctx.beginPath();
    ctx.arc(pt.x - cam.x, pt.y - cam.y, pt.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Aim reticle.
  if (!G.player.car && G.state === 'playing') {
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(G.input.mouseX, G.input.mouseY, 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(G.input.mouseX - 14, G.input.mouseY);
    ctx.lineTo(G.input.mouseX - 6, G.input.mouseY);
    ctx.moveTo(G.input.mouseX + 6, G.input.mouseY);
    ctx.lineTo(G.input.mouseX + 14, G.input.mouseY);
    ctx.moveTo(G.input.mouseX, G.input.mouseY - 14);
    ctx.lineTo(G.input.mouseX, G.input.mouseY - 6);
    ctx.moveTo(G.input.mouseX, G.input.mouseY + 6);
    ctx.lineTo(G.input.mouseX, G.input.mouseY + 14);
    ctx.stroke();
  }

  // Night falls gradually after 19:00, lifts after 06:00 — a soft tint.
  const hour = Math.floor(G.clockMinutes / 60) % 24;
  if (hour >= 19 || hour < 6) {
    ctx.fillStyle = 'rgba(10,10,40,0.22)';
    ctx.fillRect(0, 0, vw, vh);
  }

  drawHud(ctx, G, vw, vh);

  if (G.state === 'dead' || G.state === 'busted') {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, vw, vh);
    ctx.textAlign = 'center';
    ctx.fillStyle = G.state === 'busted' ? '#4da6ff' : '#ff5a4a';
    ctx.font = 'bold 64px sans-serif';
    ctx.fillText(G.state === 'busted' ? 'BUSTED!' : 'WASTED', vw / 2, vh / 2 - 20);
    ctx.fillStyle = '#fff';
    ctx.font = '18px sans-serif';
    ctx.fillText(G.state === 'busted' ? 'The PBPD caught you. Your cash took a hit.' : 'Rico went down. The Bay keeps moving.', vw / 2, vh / 2 + 16);
  }
}

function drawPlayerOnFoot(ctx, cam) {
  const p = G.player;
  const x = p.x - cam.x;
  const y = p.y - cam.y;
  const bob = Math.sin(p.walkPhase) * 1.5;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(p.angle);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(0, 2, 10, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#222831';
  ctx.fillRect(-7 + bob, -6, 5, 5);
  ctx.fillRect(-7 - bob, 1, 5, 5);
  // Rico's yellow jacket — the one thing you can spot in a crowd.
  ctx.fillStyle = '#e8c832';
  ctx.beginPath();
  ctx.roundRect(-8, -8, 17, 16, 6);
  ctx.fill();
  ctx.fillStyle = '#222';
  ctx.fillRect(-8, -2, 17, 3);
  ctx.fillStyle = '#e8b88a';
  ctx.beginPath();
  ctx.arc(11, 0, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath();
  ctx.arc(11, -1, 6, Math.PI * 0.95, Math.PI * 2.05);
  ctx.fill();
  // Pistol in hand.
  ctx.fillStyle = '#222';
  ctx.fillRect(13, -2, 10, 3);
  ctx.restore();
}

function drawTitle(vw, vh) {
  // A painted backdrop: sea, beach, skyline and a setting sun.
  const grad = ctx.createLinearGradient(0, 0, 0, vh);
  grad.addColorStop(0, '#1a2a4a');
  grad.addColorStop(0.55, '#c85a3a');
  grad.addColorStop(1, '#2e1a2a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, vw, vh);
  ctx.fillStyle = '#ff9a4d';
  ctx.beginPath();
  ctx.arc(vw * 0.72, vh * 0.42, 60, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1a1a2e';
  for (let i = 0; i < 14; i++) {
    const bx = (i / 14) * vw + 20;
    const bh = 60 + ((i * 37) % 90);
    ctx.fillRect(bx, vh * 0.62 - bh, 54, bh);
    ctx.fillStyle = '#ffd94d';
    for (let wy = vh * 0.62 - bh + 10; wy < vh * 0.62 - 8; wy += 18) {
      if ((i + wy) % 3 === 0) ctx.fillRect(bx + 8, wy, 7, 9);
    }
    ctx.fillStyle = '#1a1a2e';
  }
  ctx.fillStyle = '#2e6f9e';
  ctx.fillRect(0, vh * 0.62, vw, vh * 0.38);
  ctx.fillStyle = '#e8d8a0';
  ctx.fillRect(0, vh * 0.62, vw, 14);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd94d';
  ctx.font = 'bold 84px sans-serif';
  ctx.fillText('PALMERA BAY', vw / 2, vh * 0.3);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText('An open-world crime story  •  Rico Vega owes the crew $4,000', vw / 2, vh * 0.3 + 40);
  ctx.font = '15px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText('Steal cars  •  Outrun the PBPD  •  Six missions  •  One way out', vw / 2, vh * 0.3 + 66);
}

// ---- menus (DOM overlays) ----------------------------------------------

const overlays = {
  title: document.getElementById('menu-title'),
  paused: document.getElementById('menu-paused'),
  dead: document.getElementById('menu-dead'),
  busted: document.getElementById('menu-busted'),
  help: document.getElementById('menu-help'),
};

function showOverlay(name) {
  for (const [key, el] of Object.entries(overlays)) {
    if (el) el.style.display = key === name ? 'flex' : 'none';
  }
  if (name === 'title') {
    const cont = document.getElementById('btn-continue');
    if (cont) cont.style.display = hasSave() ? 'block' : 'none';
  }
}

function bind(id, fn) {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', () => { G.audio.unlock(); G.audio.click(); fn(); });
}

bind('btn-new', () => { clearSave(); resetGame(false); });
bind('btn-continue', () => resetGame(true));
bind('btn-help', () => showOverlay('help'));
bind('btn-help-close', () => showOverlay(G.state === 'playing' ? null : 'title'));
bind('btn-resume', () => { G.state = 'playing'; showOverlay(null); });
bind('btn-restart', () => resetGame(false));
bind('btn-quit', () => { G.saveGame(true); G.state = 'title'; showOverlay('title'); });
bind('btn-retry', () => {
  G.player.cash = Math.max(0, G.player.cash - 100);
  G.player.health = 100;
  G.player.x = 1300;
  G.player.y = 700;
  G.player.car = null;
  G.missions.active = false;
  G.missions.step = 0;
  G.state = 'playing';
  showOverlay(null);
  G.toast('Back on your feet. That cost you $100.');
});
bind('btn-busted-retry', () => {
  G.player.cash = Math.max(0, G.player.cash - 150);
  G.player.health = 100;
  G.player.x = 1300;
  G.player.y = 700;
  G.player.car = null;
  G.missions.active = false;
  G.missions.step = 0;
  G.state = 'playing';
  showOverlay(null);
  G.toast('Out on bail. That cost you $150.');
});
bind('btn-mute', () => {
  G.audio.unlock();
  G.audio.setMuted(!G.audio.muted);
  document.getElementById('btn-mute').textContent = G.audio.muted ? '🔇 Sound: Off' : '🔊 Sound: On';
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'm' || e.key === 'M') { /* handled in update */ }
  if ((e.key === 'p' || e.key === 'P' || e.key === 'Escape') && G.state === 'paused') {
    G.state = 'playing';
    showOverlay(null);
  }
});

// ---- boot ---------------------------------------------------------------

G.rng = mulberry32(G.seed);
G.world = makeWorld(G.seed);
G.cars = spawnTraffic(G.world, G.rng, 26);
G.peds = spawnPeds(G.world, G.rng, 42);
G.player = newPlayer(1300, 700);
G.cam.x = clamp(G.player.x - canvas.width / 2, 0, Math.max(0, WORLD_W - canvas.width));
G.cam.y = clamp(G.player.y - canvas.height / 2, 0, Math.max(0, WORLD_H - canvas.height));
G.cam.w = canvas.width;
G.cam.h = canvas.height;
showOverlay('title');

const shot = shotName();
if (shot) {
  // Stage the requested scene, then let the loop run so traffic and
  // police settle into the frame before the screenshot is taken.
  applyShot(G, shot);
  if (G.state === 'playing') showOverlay(null);
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
  last = now;
  if (G.state === 'playing') update(dt);
  draw();
  G.input.endFrame();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
