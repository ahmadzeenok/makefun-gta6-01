// Palmera Bay — staged scenes for screenshots. `?shot=start` shows the
// title screen; the other shots drop the player straight into a lively
// moment (driving through traffic, a three-star police chase, a mission
// mid-fight) so a still frame shows the game at its best. The world seed
// is fixed, so every run stages the same streets.
import { addHeat } from './police.js';
import { startMission } from './missions.js';
import { makeCar, CAR_MODELS } from './vehicles.js';
import { makePed } from './people.js';

export function shotName() {
  const q = new URLSearchParams(window.location.search);
  return q.get('shot') || null;
}

export function applyShot(G, name) {
  if (!name) return false;
  if (name === 'start') {
    G.state = 'title';
    return true;
  }
  G.state = 'playing';
  G.audio.unlock();
  if (name === 'drive') {
    G.autoDrive = true;
    // Start on the long east-west road at y=1100 with a clear run ahead.
    const car = makeCar(G.world, G.rng, { x: 760, y: 1100, angle: 0, model: CAR_MODELS[1], color: '#c83a2e' });
    car.isPlayer = true;
    G.player.car = car;
    G.player.x = car.x;
    G.player.y = car.y;
    G.cars.push(car);
    // Clear traffic right around the spawn and down the road ahead, so
    // the hero car has a clean run in the frame.
    G.cars = G.cars.filter((c) => {
      if (c === car) return true;
      if (Math.hypot(c.x - car.x, c.y - car.y) < 260) return false;
      if (c.x > car.x && c.x < car.x + 800 && Math.abs(c.y - car.y) < 90) return false;
      return true;
    });
    return true;
  }
  if (name === 'chase') {
    G.autoDrive = true;
    const car = makeCar(G.world, G.rng, { x: 1560, y: 1100, angle: 0, model: CAR_MODELS[0], color: '#2e7dc8' });
    car.isPlayer = true;
    car.speed = 260;
    G.player.car = car;
    G.player.x = car.x;
    G.player.y = car.y;
    G.cars.push(car);
    addHeat(G.police, 55, G.time);
    G.police.spawnTimer = 0;
    // One cruiser right behind the player, in frame from the start.
    const cruiser = makeCar(G.world, G.rng, { x: car.x - 320, y: car.y, angle: 0, police: true, color: '#e8e8e8', model: CAR_MODELS[1] });
    cruiser.isTraffic = false;
    cruiser.speed = 240;
    G.police.cars.push(cruiser);
    G.cars.push(cruiser);
    return true;
  }
  if (name === 'mission') {
    G.player.x = 1500;
    G.player.y = 1180;
    G.player.ammo = 48;
    startMission(G);
    // Jump straight to the dockside-crates mission for a busy frame.
    G.missions.index = 2;
    G.missions.active = false;
    startMission(G);
    for (let i = 0; i < 3; i++) {
      const e = makePed(G.world, G.rng, { x: 1650 + i * 90, y: 1250 + (i % 2) * 80, enemy: true });
      G.peds.push(e);
    }
    addHeat(G.police, 25, G.time);
    return true;
  }
  if (name === 'foot') {
    G.player.x = 900;
    G.player.y = 700;
    G.player.ammo = 36;
    return true;
  }
  return false;
}
