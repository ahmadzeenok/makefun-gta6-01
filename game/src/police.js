// Palmera Bay — the wanted system and the Palmera Bay Police Department.
// Crimes raise the star level; police cars spawn at the city edge and
// chase, ram and (at three stars and up) shoot. Stay out of sight and out
// of trouble and the heat slowly cools off.
import { clamp, dist, angleDiff, randRange } from './util.js';
import { makeCar, CAR_MODELS } from './vehicles.js';
import { hitsSolid } from './world.js';

export const WANTED_NAMES = ['Clean', 'Suspect', 'Wanted', 'Dangerous', 'Most Wanted', 'Citywide Manhunt'];

export function makePoliceState() {
  return {
    wanted: 0,
    heat: 0, // 0..100; crossing 20/45/70/90 adds a star
    coolTimer: 0,
    cars: [],
    footCops: [],
    spawnTimer: 0,
    lastCrimeAt: 0,
    busted: false,
    bustTimer: 0,
  };
}

export function addHeat(police, amount, now) {
  police.heat = clamp(police.heat + amount, 0, 100);
  police.lastCrimeAt = now;
  police.coolTimer = 0;
  const stars = police.heat >= 90 ? 5 : police.heat >= 70 ? 4 : police.heat >= 45 ? 3 : police.heat >= 20 ? 2 : police.heat > 0 ? 1 : 0;
  if (stars > police.wanted) police.wanted = stars;
}

export function clearWanted(police) {
  police.wanted = 0;
  police.heat = 0;
  police.coolTimer = 0;
}

export function wantedTargetCount(wanted) {
  return wanted <= 0 ? 0 : wanted === 1 ? 1 : wanted === 2 ? 2 : wanted === 3 ? 3 : wanted === 4 ? 4 : 5;
}

export function updatePolice(G, dt) {
  const police = G.police;
  const player = G.player;
  const now = G.time;
  police.spawnTimer -= dt;

  // Cooling off: no crime for a while and no cop nearby.
  const nearestCop = police.cars.reduce((m, c) => Math.min(m, dist(c.x, c.y, player.x, player.y)), Infinity);
  if (police.wanted > 0 && now - police.lastCrimeAt > 14 && nearestCop > 520) {
    police.coolTimer += dt;
    if (police.coolTimer > 6) {
      police.wanted -= 1;
      police.heat = Math.max(0, police.heat - 25);
      police.coolTimer = 0;
      G.toast(`Heat cooling off — ${WANTED_NAMES[police.wanted]}`);
    }
  } else {
    police.coolTimer = 0;
  }

  // Spawn police cars up to the wanted level's count.
  const want = wantedTargetCount(police.wanted);
  if (police.cars.length < want && police.spawnTimer <= 0) {
    police.spawnTimer = 2.2;
    const edge = G.rng() < 0.5
      ? { x: player.x + (G.rng() < 0.5 ? -750 : 750), y: player.y + randRange(G.rng, -500, 500) }
      : { x: player.x + randRange(G.rng, -500, 500), y: player.y + (G.rng() < 0.5 ? -650 : 650) };
    const car = makeCar(G.world, G.rng, {
      x: clamp(edge.x, 200, 3300), y: clamp(edge.y, 120, 2500),
      police: true, color: '#e8e8e8', model: CAR_MODELS[1],
    });
    car.isTraffic = false;
    police.cars.push(car);
    G.cars.push(car);
  }

  // Chase: steer towards the player, ram when close, give up never.
  for (const car of police.cars) {
    const d = dist(car.x, car.y, player.x, player.y);
    const targetSpeed = clamp(240 + police.wanted * 28, 0, 430);
    car.policeTargetSpeed = targetSpeed;
    const wantAngle = Math.atan2(player.y - car.y, player.x - car.x);
    car.angle += angleDiff(car.angle, wantAngle) * Math.min(1, 3.2 * dt);
    car.speed += clamp(targetSpeed - car.speed, -300 * dt, 220 * dt);
    const nx = car.x + Math.cos(car.angle) * car.speed * dt;
    const ny = car.y + Math.sin(car.angle) * car.speed * dt;
    // Cops cut corners, but they cannot drive through buildings: slide
    // along the wall instead of passing through it.
    if (!hitsSolid(G.world, nx, ny, 16)) {
      car.x = nx;
      car.y = ny;
    } else if (!hitsSolid(G.world, nx, car.y, 16)) {
      car.x = nx;
    } else if (!hitsSolid(G.world, car.x, ny, 16)) {
      car.y = ny;
    } else {
      car.speed *= 0.5;
    }
    // Ram the player's car.
    if (player.car && d < 46) {
      player.car.speed *= 0.86;
      player.car.x += Math.cos(car.angle) * 26 * dt * 10;
      player.car.y += Math.sin(car.angle) * 26 * dt * 10;
      if (Math.abs(player.car.speed) > 60 && G.rng() < dt * 2) {
        G.audio.crash();
        G.shake = Math.max(G.shake, 6);
      }
    }
    // On foot, a cop who pulls up alongside and holds position can bust
    // the player — but only after sitting on them for a moment, so a
    // drive-by does not end the game.
    if (!player.car && d < 34) {
      police.bustTimer += dt;
      if (police.bustTimer > 1.4) police.busted = true;
    } else {
      police.bustTimer = Math.max(0, police.bustTimer - dt);
    }
    // Cops shoot at three stars and up when on foot and in range.
    if (!player.car && police.wanted >= 3 && d < 380 && d > 60) {
      car.shootTimer = (car.shootTimer || 0) - dt;
      if (car.shootTimer <= 0) {
        car.shootTimer = 1.1 + G.rng() * 0.7;
        if (G.rng() < 0.3) {
          G.damagePlayer(7, car.x, car.y);
          G.audio.enemyShot();
          G.particles.push({ x: car.x, y: car.y, vx: 0, vy: 0, life: 0.12, max: 0.12, color: '#ffd94d', size: 5, kind: 'flash' });
        }
      }
    }
    car.x = clamp(car.x, 130, 3380);
    car.y = clamp(car.y, 60, 2580);
  }

  // Remove police cars that fell far behind a clean player.
  if (police.wanted === 0) {
    for (const car of police.cars) {
      const i = G.cars.indexOf(car);
      if (i >= 0) G.cars.splice(i, 1);
    }
    police.cars.length = 0;
  }
}
