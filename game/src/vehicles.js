// Palmera Bay — cars. Traffic cars cruise the road grid, turn at
// intersections and stop for nothing; the player can steal any of them
// (press E nearby) and then drive with simple arcade physics: accel,
// steering that bites harder at speed, braking and a handbrake slide.
import { clamp, dist, angleDiff, pick, randRange } from './util.js';
import { nearestRoadPoint, hitsSolid } from './world.js';

export const CAR_COLORS = ['#c83a2e', '#2e7dc8', '#e8c832', '#3a9a4a', '#8a4ac8', '#e8e8e8', '#222831', '#e87a2e', '#2ec8c8', '#c82e7a'];
export const CAR_MODELS = [
  { name: 'Palm Sedan', top: 330, accel: 210, grip: 3.2 },
  { name: 'Bay Coupe', top: 410, accel: 260, grip: 3.8 },
  { name: 'Dock Van', top: 260, accel: 170, grip: 2.6 },
  { name: 'Strip Taxi', top: 350, accel: 230, grip: 3.4 },
  { name: 'Beach Buggy', top: 300, accel: 240, grip: 3.0 },
];

export function makeCar(world, rng, opts) {
  const o = opts || {};
  const model = o.model || pick(rng, CAR_MODELS);
  const spot = o.x !== undefined ? { x: o.x, y: o.y, vertical: o.vertical !== false } : nearestRoadPoint(world, randRange(rng, 300, 3200), randRange(rng, 200, 2400));
  const angle = o.angle !== undefined ? o.angle : spot.vertical ? (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (rng() < 0.5 ? 0 : Math.PI);
  return {
    x: spot.x, y: spot.y, angle,
    speed: 0, model, color: o.color || pick(rng, CAR_COLORS),
    isPlayer: false, isPolice: !!o.police, isTraffic: !o.police && !o.player,
    driver: o.driver !== undefined ? o.driver : true,
    vertical: spot.vertical,
    turnCooldown: 0, stuck: 0, brakeLight: false,
    siren: !!o.police, health: 100, smoke: 0,
  };
}

export function spawnTraffic(world, rng, count) {
  const cars = [];
  for (let i = 0; i < count; i++) cars.push(makeCar(world, rng));
  return cars;
}

// Traffic AI: follow the current road; at an intersection, sometimes turn.
export function updateTrafficCar(world, car, dt, rng, others) {
  if (car.isPlayer) return;
  const target = car.isPolice ? car.policeTargetSpeed || 300 : randRange(rng, 110, 190);
  car.speed += clamp(target - car.speed, -260 * dt, 150 * dt);
  car.turnCooldown -= dt;
  const atX = world.roadsX.some((rx) => Math.abs(car.x - rx) < 14);
  const atY = world.roadsY.some((ry) => Math.abs(car.y - ry) < 14);
  if (atX && atY && car.turnCooldown <= 0 && rng() < 0.35) {
    car.vertical = !car.vertical;
    car.angle = car.vertical ? (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (rng() < 0.5 ? 0 : Math.PI);
    car.turnCooldown = 2.5;
  } else if (car.vertical) {
    car.angle += angleDiff(car.angle, car.angle > 0 ? Math.PI / 2 : -Math.PI / 2) * Math.min(1, 6 * dt);
  } else {
    const want = Math.abs(angleDiff(car.angle, 0)) < Math.PI / 2 ? 0 : Math.PI;
    car.angle += angleDiff(car.angle, want) * Math.min(1, 6 * dt);
  }
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  // Stop short of the car ahead instead of piling up.
  let blocked = false;
  for (const o of others) {
    if (o === car) continue;
    if (dist(nx, ny, o.x, o.y) < 44) { blocked = true; break; }
  }
  if (blocked) {
    car.speed = Math.max(0, car.speed - 300 * dt);
  } else if (!hitsSolid(world, nx, ny, 16)) {
    car.x = nx;
    car.y = ny;
  } else {
    // Hit a wall: turn around and try the other way.
    car.angle += Math.PI;
    car.vertical = !car.vertical;
    car.speed *= 0.4;
    car.turnCooldown = 1.5;
  }
  if (car.x < 150) car.x = 150;
  if (car.y < 60) car.y = 60;
  if (car.x > 3380) car.x = 3380;
  if (car.y > 2580) car.y = 2580;
}

// Arcade driving for the player's car.
export function drivePlayerCar(car, input, dt, world, others, onCrash) {
  const fwd = input.down('w', 'arrowup');
  const back = input.down('s', 'arrowdown');
  const left = input.down('a', 'arrowleft');
  const right = input.down('d', 'arrowright');
  const hand = input.down(' ', 'shift');
  const steer = (left ? -1 : 0) + (right ? 1 : 0);
  if (fwd) car.speed += car.model.accel * dt;
  if (back) car.speed -= (car.speed > 5 ? 320 : 150) * dt;
  if (!fwd && !back) car.speed -= Math.sign(car.speed) * 60 * dt;
  if (hand) car.speed -= Math.sign(car.speed) * 260 * dt;
  car.speed = clamp(car.speed, -140, car.model.top);
  if (Math.abs(car.speed) < 4 && !fwd && !back) car.speed = 0;
  const grip = hand ? 1.4 : car.model.grip;
  car.angle += steer * clamp(Math.abs(car.speed) / 130, 0, 1) * grip * dt * (car.speed < 0 ? -1 : 1);
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  let crashed = false;
  if (hitsSolid(world, nx, ny, 17)) {
    crashed = Math.abs(car.speed) > 120;
    car.speed *= -0.25;
  } else {
    car.x = nx;
    car.y = ny;
  }
  for (const o of others) {
    if (o === car) continue;
    if (dist(car.x, car.y, o.x, o.y) < 40) {
      crashed = Math.abs(car.speed) > 90 || Math.abs(o.speed) > 90;
      const push = 40 - dist(car.x, car.y, o.x, o.y);
      const a = Math.atan2(car.y - o.y, car.x - o.x);
      car.x += Math.cos(a) * push * 0.5;
      car.y += Math.sin(a) * push * 0.5;
      // Shove the other car aside too, so the two do not grind together.
      o.x -= Math.cos(a) * push * 0.5;
      o.y -= Math.sin(a) * push * 0.5;
      o.speed *= 0.6;
      car.speed *= 0.7;
      car.angle += 0.06;
      if (o.isTraffic) { o.angle += 0.2; }
    }
  }
  car.brakeLight = back || hand;
  if (crashed && onCrash) onCrash();
  return crashed;
}

export function drawCar(ctx, car, cam) {
  const x = car.x - cam.x;
  const y = car.y - cam.y;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(car.angle);
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(-19, -11, 40, 26);
  // Body.
  ctx.fillStyle = car.color;
  const len = car.model.name === 'Dock Van' ? 46 : 40;
  const wid = car.model.name === 'Dock Van' ? 24 : 20;
  ctx.beginPath();
  ctx.roundRect(-len / 2, -wid / 2, len, wid, 6);
  ctx.fill();
  // Cabin and windows.
  ctx.fillStyle = '#1c2733';
  ctx.beginPath();
  ctx.roundRect(-len / 2 + 10, -wid / 2 + 3, len / 2 - 8, wid - 6, 4);
  ctx.fill();
  ctx.fillStyle = 'rgba(180,220,255,0.55)';
  ctx.fillRect(-len / 2 + 13, -wid / 2 + 5, 6, wid - 10);
  // Headlights / brake lights.
  ctx.fillStyle = '#fff8c0';
  ctx.fillRect(len / 2 - 2, -wid / 2 + 2, 3, 4);
  ctx.fillRect(len / 2 - 2, wid / 2 - 6, 3, 4);
  ctx.fillStyle = car.brakeLight ? '#ff2e2e' : '#a02020';
  ctx.fillRect(-len / 2 - 1, -wid / 2 + 2, 3, 4);
  ctx.fillRect(-len / 2 - 1, wid / 2 - 6, 3, 4);
  if (car.isPolice) {
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 8px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PBPD', 0, 3);
  }
  if (car.siren) {
    const t = (performance.now() / 300) % 2;
    ctx.fillStyle = t < 1 ? '#ff2222' : '#2244ff';
    ctx.beginPath();
    ctx.arc(0, -wid / 2 - 2, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = t < 1 ? '#2244ff' : '#ff2222';
    ctx.beginPath();
    ctx.arc(6, -wid / 2 - 2, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  if (car.smoke > 0) {
    ctx.fillStyle = 'rgba(120,120,120,0.5)';
    ctx.beginPath();
    ctx.arc(-len / 2, 0, 5 + Math.random() * 5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
