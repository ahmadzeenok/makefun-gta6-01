// Palmera Bay — pedestrians and mission enemies. Peds stroll the
// sidewalks, chat in pairs, and run screaming from gunfire or a speeding
// car. Enemies are peds with a gun, a health bar and a grudge: they chase
// the player and shoot back.
import { clamp, dist, angleDiff, pick, randRange } from './util.js';
import { nearestRoadPoint, hitsSolid } from './world.js';

const SHIRTS = ['#e8e8e8', '#c83a2e', '#2e7dc8', '#e8c832', '#3a9a4a', '#8a4ac8', '#e87a2e', '#2ec8c8', '#f0a0c0', '#7a5a3a'];
const PANTS = ['#222831', '#3a4a5a', '#5a3a2e', '#2e4a3a', '#4a4a4a'];

export function makePed(world, rng, opts) {
  const o = opts || {};
  const spot = o.x !== undefined ? { x: o.x, y: o.y } : nearestRoadPoint(world, randRange(rng, 300, 3200), randRange(rng, 200, 2400));
  return {
    x: spot.x + randRange(rng, -50, 50), y: spot.y + randRange(rng, -50, 50),
    angle: randRange(rng, 0, Math.PI * 2),
    speed: randRange(rng, 28, 52),
    shirt: pick(rng, SHIRTS), pants: pick(rng, PANTS),
    walkPhase: randRange(rng, 0, 6),
    target: null, fleeing: false, fleeTimer: 0,
    enemy: !!o.enemy, health: o.enemy ? 100 : 30,
    shootCooldown: randRange(rng, 0.5, 1.5),
    dead: false, cash: o.enemy ? 0 : Math.floor(randRange(rng, 2, 18)),
  };
}

export function spawnPeds(world, rng, count) {
  const peds = [];
  for (let i = 0; i < count; i++) peds.push(makePed(world, rng));
  return peds;
}

function pickStrollTarget(world, ped, rng) {
  const spot = nearestRoadPoint(world, ped.x + randRange(rng, -500, 500), ped.y + randRange(rng, -500, 500));
  ped.target = { x: spot.x + randRange(rng, -55, 55), y: spot.y + randRange(rng, -55, 55) };
}

export function updatePed(world, ped, dt, rng, player, cars, gunfireAt) {
  if (ped.dead) return;
  ped.walkPhase += dt * 6;
  // Flee from nearby gunfire or a fast car.
  if (gunfireAt && dist(ped.x, ped.y, gunfireAt.x, gunfireAt.y) < 320) {
    ped.fleeing = true;
    ped.fleeTimer = 3;
  }
  for (const c of cars) {
    if (Math.abs(c.speed) > 150 && dist(ped.x, ped.y, c.x, c.y) < 90) {
      ped.fleeing = true;
      ped.fleeTimer = 2;
    }
  }
  if (ped.fleeTimer > 0) ped.fleeTimer -= dt;
  else ped.fleeing = false;

  let tx;
  let ty;
  let speed = ped.speed;
  if (ped.enemy) {
    // Enemies close in on the player and shoot when in range.
    tx = player.x;
    ty = player.y;
    speed = 95;
  } else if (ped.fleeing) {
    const away = Math.atan2(ped.y - player.y, ped.x - player.x);
    tx = ped.x + Math.cos(away) * 200;
    ty = ped.y + Math.sin(away) * 200;
    speed = 130;
  } else {
    if (!ped.target || dist(ped.x, ped.y, ped.target.x, ped.target.y) < 24) pickStrollTarget(world, ped, rng);
    tx = ped.target.x;
    ty = ped.target.y;
  }
  const want = Math.atan2(ty - ped.y, tx - ped.x);
  ped.angle += angleDiff(ped.angle, want) * Math.min(1, 8 * dt);
  const nx = ped.x + Math.cos(ped.angle) * speed * dt;
  const ny = ped.y + Math.sin(ped.angle) * speed * dt;
  if (!hitsSolid(world, nx, ny, 10)) {
    ped.x = nx;
    ped.y = ny;
  } else {
    ped.target = null;
  }
  ped.x = clamp(ped.x, 80, 3360);
  ped.y = clamp(ped.y, 50, 2570);
}

// An enemy takes a shot at the player. Returns true when it fired.
export function enemyShoot(ped, player, dt, rng) {
  ped.shootCooldown -= dt;
  const d = dist(ped.x, ped.y, player.x, player.y);
  if (ped.shootCooldown > 0 || d > 420 || d < 40) return false;
  ped.shootCooldown = randRange(rng, 0.9, 1.7);
  // Inaccurate at range: a hit chance that falls off with distance.
  return rng() < clamp(0.75 - d / 700, 0.15, 0.7);
}

export function drawPed(ctx, ped, cam) {
  if (ped.dead) return;
  const x = ped.x - cam.x;
  const y = ped.y - cam.y;
  const bob = Math.sin(ped.walkPhase) * 1.5;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ped.angle);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(0, 2, 9, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  // Legs, swinging as they walk.
  ctx.fillStyle = ped.pants;
  ctx.fillRect(-6 + bob, -5, 5, 4);
  ctx.fillRect(-6 - bob, 1, 5, 4);
  // Body.
  ctx.fillStyle = ped.enemy ? '#5a2020' : ped.shirt;
  ctx.beginPath();
  ctx.roundRect(-7, -7, 15, 14, 5);
  ctx.fill();
  // Head.
  ctx.fillStyle = '#e8b88a';
  ctx.beginPath();
  ctx.arc(10, 0, 5.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2a2018';
  ctx.beginPath();
  ctx.arc(10, -1, 5, Math.PI * 0.9, Math.PI * 2.1);
  ctx.fill();
  if (ped.enemy) {
    // Gun in hand.
    ctx.fillStyle = '#222';
    ctx.fillRect(12, -2, 9, 3);
    ctx.fillStyle = '#ff4a3a';
    ctx.fillRect(-8, -11, 16 * clamp(ped.health / 100, 0, 1), 3);
  }
  ctx.restore();
}
