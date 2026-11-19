// Palmera Bay — the city itself. A seeded grid of avenues and streets,
// five named districts, a beach and harbour on the west edge, parks,
// palm trees and hundreds of buildings. The layout is deterministic for a
// given seed, so a screenshot run always shows the same streets.
import { mulberry32, randRange, pick, clamp } from './util.js';

export const WORLD_W = 3400;
export const WORLD_H = 2600;
export const ROAD_W = 96;

export const DISTRICTS = [
  { name: 'Marina', x: 0, y: 0, w: 900, h: 900, tint: '#2e6f8e' },
  { name: 'Old Town', x: 900, y: 0, w: 1000, h: 900, tint: '#8e6f2e' },
  { name: 'Palm Heights', x: 1900, y: 0, w: 1500, h: 900, tint: '#3e7d4a' },
  { name: 'Dockside', x: 0, y: 900, w: 1100, h: 900, tint: '#6e4a8e' },
  { name: 'Coral Bay', x: 1100, y: 900, w: 1100, h: 900, tint: '#2e8e7a' },
  { name: 'Southside', x: 2200, y: 900, w: 1200, h: 800, tint: '#8e3a2e' },
  { name: 'The Strip', x: 0, y: 1800, w: 3400, h: 800, tint: '#7d5a2e' },
];

const PALETTES = {
  Marina: ['#7fb3c8', '#a8c8d8', '#5d8fa8', '#c8d8e0'],
  'Old Town': ['#c8a878', '#b89868', '#d8c090', '#a8825a'],
  'Palm Heights': ['#8fb8a0', '#a8c8b8', '#7aa88e', '#b8d0c0'],
  Dockside: ['#8a7a8a', '#9a8a7a', '#7a6a72', '#a89a8a'],
  'Coral Bay': ['#e0a890', '#d89880', '#f0c0a0', '#c89078'],
  Southside: ['#a87868', '#b88878', '#987058', '#c09888'],
  'The Strip': ['#d8b878', '#c8a868', '#e0c890', '#b89a58'],
};

export function makeWorld(seed) {
  const rng = mulberry32(seed);
  const world = {
    seed,
    roadsX: [],
    roadsY: [],
    buildings: [],
    trees: [],
    parks: [],
    water: { x: -400, y: 0, w: 460, h: WORLD_H },
    beach: { x: 0, y: 0, w: 130, h: WORLD_H },
    docks: [],
    lighthouse: { x: 170, y: 2350 },
  };

  // Avenues run north-south, streets east-west, roughly every 420px.
  for (let x = 320; x < WORLD_W; x += 420) world.roadsX.push(x);
  for (let y = 300; y < WORLD_H; y += 400) world.roadsY.push(y);

  const onRoad = (x, y) => {
    for (const rx of world.roadsX) if (Math.abs(x - rx) < ROAD_W / 2 + 24) return true;
    for (const ry of world.roadsY) if (Math.abs(y - ry) < ROAD_W / 2 + 24) return true;
    return false;
  };
  const inBeach = (x, y) => x < 130;

  // Parks: a few open green blocks.
  world.parks = [
    { x: 1250, y: 640, w: 320, h: 220, name: 'Palmera Park' },
    { x: 2350, y: 1140, w: 300, h: 240, name: 'Coral Gardens' },
    { x: 1550, y: 2050, w: 340, h: 260, name: 'Strip Green' },
  ];
  const inPark = (x, y) => world.parks.some((p) => x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h);

  // Fill each block between roads with buildings, leaving gaps for parks.
  for (let gx = 0; gx < world.roadsX.length; gx++) {
    for (let gy = 0; gy < world.roadsY.length; gy++) {
      const x0 = world.roadsX[gx] + ROAD_W / 2 + 26;
      const y0 = world.roadsY[gy] + ROAD_W / 2 + 26;
      const x1 = (world.roadsX[gx + 1] ?? WORLD_W) - ROAD_W / 2 - 26;
      const y1 = (world.roadsY[gy + 1] ?? WORLD_H) - ROAD_W / 2 - 26;
      if (x1 - x0 < 90 || y1 - y0 < 90) continue;
      const district = districtAt(world, (x0 + x1) / 2, (y0 + y1) / 2);
      const palette = PALETTES[district.name] || PALETTES['Old Town'];
      // One or two buildings per block, sized to the block.
      const cols = x1 - x0 > 260 ? 2 : 1;
      const rows = y1 - y0 > 260 ? 2 : 1;
      for (let cx = 0; cx < cols; cx++) {
        for (let cy = 0; cy < rows; cy++) {
          const bw = (x1 - x0) / cols - 24;
          const bh = (y1 - y0) / rows - 24;
          const bx = x0 + cx * ((x1 - x0) / cols) + 12;
          const by = y0 + cy * ((y1 - y0) / rows) + 12;
          if (inPark(bx + bw / 2, by + bh / 2) || inBeach(bx + bw / 2, by + bh / 2)) continue;
          if (rng() < 0.12) continue; // empty lot / car park
          world.buildings.push({
            x: bx, y: by, w: bw, h: bh,
            color: pick(rng, palette),
            roof: pick(rng, ['#3a3f4a', '#4a3a2e', '#2e4a3a', '#5a5a5a']),
            height: 1 + Math.floor(rng() * 3),
            district: district.name,
            sign: rng() < 0.16,
            signText: pick(rng, ['HOTEL', 'BAR', 'TACOS', '24H', 'PIZZA', 'MOTEL', 'CLUB', 'CAFE']),
          });
        }
      }
    }
  }

  // Palm trees along the beach, in parks and scattered on sidewalks.
  for (let y = 40; y < WORLD_H; y += 90) {
    world.trees.push({ x: randRange(rng, 90, 150), y: y + randRange(rng, -20, 20), s: randRange(rng, 0.8, 1.3) });
  }
  for (const p of world.parks) {
    for (let i = 0; i < 10; i++) {
      world.trees.push({ x: randRange(rng, p.x + 20, p.x + p.w - 20), y: randRange(rng, p.y + 20, p.y + p.h - 20), s: randRange(rng, 0.9, 1.4) });
    }
  }
  for (let i = 0; i < 90; i++) {
    const x = randRange(rng, 200, WORLD_W - 100);
    const y = randRange(rng, 100, WORLD_H - 100);
    if (!onRoad(x, y) && !inPark(x, y)) world.trees.push({ x, y, s: randRange(rng, 0.7, 1.1) });
  }

  // Harbour cranes and containers along the Dockside water edge.
  for (let i = 0; i < 6; i++) {
    world.docks.push({ x: 150 + i * 0, y: 1000 + i * 130, w: 90, h: 60, color: pick(rng, ['#c8552e', '#2e7dc8', '#3a9a4a', '#d8a02e']) });
  }

  world.districtAt = (x, y) => districtAt(world, x, y);
  world.onRoad = onRoad;
  world.inBeach = inBeach;
  return world;
}

export function districtAt(world, x, y) {
  for (const d of DISTRICTS) {
    if (x >= d.x && x < d.x + d.w && y >= d.y && y < d.y + d.h) return d;
  }
  return DISTRICTS[DISTRICTS.length - 1];
}

export function nearestRoadPoint(world, x, y) {
  let best = null;
  let bestD = Infinity;
  for (const rx of world.roadsX) {
    const d = Math.abs(x - rx);
    if (d < bestD) { bestD = d; best = { x: rx, y: clamp(y, 60, WORLD_H - 60), vertical: true }; }
  }
  for (const ry of world.roadsY) {
    const d = Math.abs(y - ry);
    if (d < bestD) { bestD = d; best = { x: clamp(x, 60, WORLD_W - 60), y: ry, vertical: false }; }
  }
  return best;
}

// True when a circle at (x, y) with radius r overlaps a building or the
// sea. Cars and people use this to stay out of walls and water.
export function hitsSolid(world, x, y, r) {
  if (x < 130 + r && !(y > 0)) return true;
  if (x < 118 + r) return true; // the sea wall / beach edge keeps cars out
  if (x < 60 || y < 40 || x > WORLD_W - 20 || y > WORLD_H - 20) return true;
  for (const b of world.buildings) {
    const cx = clamp(x, b.x, b.x + b.w);
    const cy = clamp(y, b.y, b.y + b.h);
    const dx = x - cx;
    const dy = y - cy;
    if (dx * dx + dy * dy < r * r) return true;
  }
  return false;
}

export function drawWorld(ctx, world, cam) {
  const { x: cx, y: cy, w: vw, h: vh } = cam;
  const x0 = Math.max(0, cx - 60);
  const y0 = Math.max(0, cy - 60);
  const x1 = Math.min(WORLD_W, cx + vw + 60);
  const y1 = Math.min(WORLD_H, cy + vh + 60);

  // Everything below is drawn in world coordinates.
  ctx.save();
  ctx.translate(-cx, -cy);

  // Ground: grassy base with a sandy beach strip and the sea beyond.
  ctx.fillStyle = '#4a7a3f';
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  ctx.fillStyle = '#2e6f9e';
  ctx.fillRect(Math.max(x0, -400), y0, Math.min(x1, 60) - Math.max(x0, -400), y1 - y0);
  ctx.fillStyle = '#e8d8a0';
  ctx.fillRect(Math.max(x0, 60), y0, Math.min(x1, 140) - Math.max(x0, 60), y1 - y0);
  // Gentle waves on the water.
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  for (let wy = Math.floor(y0 / 70) * 70; wy < y1; wy += 70) {
    ctx.beginPath();
    for (let wx = 0; wx <= 60; wx += 12) ctx.lineTo(wx, wy + Math.sin(wx * 0.3 + wy) * 3);
    ctx.stroke();
  }

  // District tint washes, faint so the map stays readable.
  for (const d of DISTRICTS) {
    if (d.x > x1 || d.x + d.w < x0 || d.y > y1 || d.y + d.h < y0) continue;
    ctx.fillStyle = d.tint + '22';
    ctx.fillRect(d.x, d.y, d.w, d.h);
  }

  // Parks.
  for (const p of world.parks) {
    if (p.x > x1 || p.x + p.w < x0 || p.y > y1 || p.y + p.h < y0) continue;
    ctx.fillStyle = '#5d9a4a';
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.strokeStyle = '#3f7a32';
    ctx.lineWidth = 3;
    ctx.strokeRect(p.x, p.y, p.w, p.h);
    ctx.fillStyle = '#3f7a32';
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(p.name, p.x + p.w / 2, p.y + p.h / 2);
  }

  // Roads: dark asphalt, pale centre dashes, sidewalks.
  ctx.fillStyle = '#33363d';
  for (const rx of world.roadsX) ctx.fillRect(rx - ROAD_W / 2, Math.max(y0, 0), ROAD_W, y1 - Math.max(y0, 0));
  for (const ry of world.roadsY) ctx.fillRect(Math.max(x0, 0), ry - ROAD_W / 2, x1 - Math.max(x0, 0), ROAD_W);
  ctx.fillStyle = '#c8c8c0';
  for (const rx of world.roadsX) {
    ctx.fillRect(rx - ROAD_W / 2 - 8, Math.max(y0, 0), 8, y1 - Math.max(y0, 0));
    ctx.fillRect(rx + ROAD_W / 2, Math.max(y0, 0), 8, y1 - Math.max(y0, 0));
  }
  for (const ry of world.roadsY) {
    ctx.fillRect(Math.max(x0, 0), ry - ROAD_W / 2 - 8, x1 - Math.max(x0, 0), 8);
    ctx.fillRect(Math.max(x0, 0), ry + ROAD_W / 2, x1 - Math.max(x0, 0), 8);
  }
  ctx.fillStyle = '#e8d44d';
  for (const rx of world.roadsX) {
    for (let y = Math.floor(y0 / 44) * 44; y < y1; y += 44) ctx.fillRect(rx - 2, y, 4, 22);
  }
  for (const ry of world.roadsY) {
    for (let x = Math.floor(x0 / 44) * 44; x < x1; x += 44) ctx.fillRect(x, ry - 2, 22, 4);
  }

  // Dock containers.
  for (const d of world.docks) {
    ctx.fillStyle = d.color;
    ctx.fillRect(d.x, d.y, d.w, d.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.strokeRect(d.x, d.y, d.w, d.h);
  }

  // Lighthouse at the south beach.
  ctx.fillStyle = '#e8e0d0';
  ctx.fillRect(world.lighthouse.x - 10, world.lighthouse.y - 46, 20, 46);
  ctx.fillStyle = '#c83a2e';
  ctx.fillRect(world.lighthouse.x - 10, world.lighthouse.y - 46, 20, 12);
  ctx.fillStyle = '#f8e05a';
  ctx.beginPath();
  ctx.arc(world.lighthouse.x, world.lighthouse.y - 50, 7, 0, Math.PI * 2);
  ctx.fill();

  // Buildings, with a fake height shadow and a roof.
  for (const b of world.buildings) {
    if (b.x > x1 || b.x + b.w < x0 || b.y > y1 || b.y + b.h < y0) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(b.x + 6, b.y + 6, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = b.roof;
    ctx.fillRect(b.x + 5, b.y + 5, b.w - 10, b.h - 10);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    for (let wx = b.x + 12; wx < b.x + b.w - 10; wx += 22) {
      for (let wy = b.y + 12; wy < b.y + b.h - 10; wy += 22) ctx.fillRect(wx, wy, 8, 6);
    }
    if (b.sign) {
      ctx.fillStyle = '#222';
      ctx.fillRect(b.x + b.w / 2 - 26, b.y - 12, 52, 15);
      ctx.fillStyle = '#ffd94d';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(b.signText, b.x + b.w / 2, b.y - 1);
    }
  }

  // Palm trees.
  for (const t of world.trees) {
    if (t.x < x0 || t.x > x1 || t.y < y0 || t.y > y1) continue;
    ctx.strokeStyle = '#6a4a2a';
    ctx.lineWidth = 3 * t.s;
    ctx.beginPath();
    ctx.moveTo(t.x, t.y);
    ctx.lineTo(t.x + 3 * t.s, t.y - 14 * t.s);
    ctx.stroke();
    ctx.fillStyle = '#2f8a3a';
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.4;
      ctx.beginPath();
      ctx.ellipse(t.x + 3 * t.s + Math.cos(a) * 9 * t.s, t.y - 14 * t.s + Math.sin(a) * 7 * t.s, 10 * t.s, 4 * t.s, a, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // District name labels on the ground.
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = 'bold 22px sans-serif';
  ctx.textAlign = 'center';
  for (const d of DISTRICTS) {
    const lx = d.x + d.w / 2;
    const ly = d.y + d.h / 2;
    if (lx < x0 || lx > x1 || ly < y0 || ly > y1) continue;
    ctx.fillText(d.name.toUpperCase(), lx, ly);
  }
  ctx.restore();
}
