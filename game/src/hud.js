// Palmera Bay — the HUD: health and cash, wanted stars, ammo and speed,
// the mission objective line, and a live minimap in the corner showing
// roads, the player, police, and the mission marker.
import { clamp, dist } from './util.js';
import { WORLD_W, WORLD_H, districtAt } from './world.js';
import { WANTED_NAMES } from './police.js';
import { currentMission, currentStep, missionTarget } from './missions.js';

export function drawHud(ctx, G, vw, vh) {
  const p = G.player;
  const police = G.police;
  const ms = G.missions;

  // Top-left: cash, health bar, ammo.
  ctx.textAlign = 'left';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillStyle = '#ffd94d';
  ctx.fillText('$' + p.cash.toLocaleString('en-US'), 16, 34);
  ctx.font = 'bold 13px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText(districtAt(G.world, p.x, p.y).name.toUpperCase() + '  •  ' + G.clockText, 16, 56);

  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(16, 66, 190, 16);
  ctx.fillStyle = p.health > 50 ? '#3fce5a' : p.health > 25 ? '#e8a832' : '#e83a2e';
  ctx.fillRect(18, 68, 186 * clamp(p.health / 100, 0, 1), 12);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 11px sans-serif';
  ctx.fillText('HP ' + Math.ceil(p.health), 212, 78);

  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(16, 88, 190, 22);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText(p.car ? '🚗 ' + p.car.model.name : 'ON FOOT', 24, 103);
  ctx.fillText('🔫 ' + p.ammo, 130, 103);

  // Wanted stars, top centre.
  ctx.textAlign = 'center';
  for (let i = 0; i < 5; i++) {
    ctx.font = '26px sans-serif';
    ctx.fillStyle = i < police.wanted ? '#ffd94d' : 'rgba(255,255,255,0.25)';
    ctx.fillText('★', vw / 2 - 52 + i * 26, 36);
  }
  ctx.font = 'bold 12px sans-serif';
  ctx.fillStyle = police.wanted > 0 ? '#ffb84d' : 'rgba(255,255,255,0.7)';
  ctx.fillText(WANTED_NAMES[police.wanted].toUpperCase(), vw / 2, 56);

  // Mission objective, under the stars.
  const m = currentMission(ms);
  if (m && ms.active) {
    const step = currentStep(ms);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    const label = m.title + ' — ' + (step ? ms.stepText : '');
    ctx.font = 'bold 14px sans-serif';
    const w = ctx.measureText(label).width + 24;
    ctx.fillRect(vw / 2 - w / 2, 66, w, 26);
    ctx.fillStyle = '#ffd94d';
    ctx.fillText(label, vw / 2, 84);
    if (step && step.time) {
      ctx.fillStyle = ms.timer < 15 ? '#ff5a4a' : '#fff';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText('⏱ ' + Math.ceil(ms.timer) + 's', vw / 2, 112);
    }
  } else if (m && !ms.done) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    const label = 'Press M to start: ' + m.title + '  •  $' + m.pay;
    ctx.font = 'bold 14px sans-serif';
    const w = ctx.measureText(label).width + 24;
    ctx.fillRect(vw / 2 - w / 2, 66, w, 26);
    ctx.fillStyle = '#fff';
    ctx.fillText(label, vw / 2, 84);
  } else if (ms.done) {
    ctx.fillStyle = '#ffd94d';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText('★ STORY COMPLETE — Palmera Bay is yours ★', vw / 2, 84);
  }

  // Speed, bottom right (when driving).
  if (p.car) {
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(vw - 128, vh - 62, 112, 46);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText(Math.round(Math.abs(p.car.speed) * 0.36) + '', vw - 26, vh - 30);
    ctx.font = '11px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText('km/h', vw - 26, vh - 18);
  }

  // Controls hint, bottom left.
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = '12px sans-serif';
  const hint = p.car
    ? 'W/S drive  •  A/D steer  •  Space handbrake  •  E exit car  •  P pause'
    : 'WASD move  •  Mouse aim, Click shoot  •  F punch  •  E steal car  •  M mission  •  P pause';
  ctx.fillText(hint, 16, vh - 16);

  // Toast message.
  if (G.toastText && G.toastTimer > 0) {
    ctx.textAlign = 'center';
    ctx.font = 'bold 15px sans-serif';
    const lines = wrapText(ctx, G.toastText, vw - 120);
    const h = lines.length * 20 + 16;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(vw / 2 - (vw - 80) / 2, vh - 150 - h, vw - 80, h);
    ctx.fillStyle = '#fff';
    lines.forEach((line, i) => ctx.fillText(line, vw / 2, vh - 150 - h + 26 + i * 20));
  }

  drawMinimap(ctx, G, vw, vh);
}

function wrapText(ctx, text, maxW) {
  const words = text.split(' ');
  const lines = [''];
  for (const w of words) {
    const test = lines[lines.length - 1] ? lines[lines.length - 1] + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && lines[lines.length - 1]) lines.push(w);
    else lines[lines.length - 1] = test;
  }
  return lines;
}

export function drawMinimap(ctx, G, vw, vh) {
  const size = 168;
  const x0 = vw - size - 14;
  const y0 = 14;
  const sx = size / WORLD_W;
  const sy = size / WORLD_H;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(x0 - 4, y0 - 4, size + 8, size + 8);
  ctx.fillStyle = '#3a6a35';
  ctx.fillRect(x0, y0, size, size);
  // Water + beach.
  ctx.fillStyle = '#2e6f9e';
  ctx.fillRect(x0, y0, 8, size);
  ctx.fillStyle = '#e8d8a0';
  ctx.fillRect(x0 + 8, y0, 4, size);
  // Roads.
  ctx.strokeStyle = '#555a63';
  ctx.lineWidth = 3;
  for (const rx of G.world.roadsX) {
    ctx.beginPath();
    ctx.moveTo(x0 + rx * sx, y0);
    ctx.lineTo(x0 + rx * sx, y0 + size);
    ctx.stroke();
  }
  for (const ry of G.world.roadsY) {
    ctx.beginPath();
    ctx.moveTo(x0, y0 + ry * sy);
    ctx.lineTo(x0 + size, y0 + ry * sy);
    ctx.stroke();
  }
  // Mission target.
  const target = missionTarget(G);
  if (target) {
    const pulse = 4 + Math.sin(G.time * 5) * 1.5;
    ctx.fillStyle = '#ffd94d';
    ctx.beginPath();
    ctx.arc(x0 + target.x * sx, y0 + target.y * sy, pulse + 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
  }
  // Police blips.
  ctx.fillStyle = '#4da6ff';
  for (const c of G.police.cars) {
    ctx.beginPath();
    ctx.arc(x0 + c.x * sx, y0 + c.y * sy, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // Player arrow.
  const px = x0 + G.player.x * sx;
  const py = y0 + G.player.y * sy;
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(G.player.angle);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(7, 0);
  ctx.lineTo(-5, -5);
  ctx.lineTo(-5, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x0 - 4, y0 - 4, size + 8, size + 8);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('PALMERA BAY', x0, y0 + size + 16);
}

// World-space objective marker: a bouncing diamond and a light pillar.
export function drawMissionMarker(ctx, G, cam) {
  const target = missionTarget(G);
  if (!target) return;
  const x = target.x - cam.x;
  const y = target.y - cam.y;
  const bob = Math.sin(G.time * 4) * 6;
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = '#ffd94d';
  ctx.fillRect(x - 14, y - 120, 28, 120);
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#ffd94d';
  ctx.strokeStyle = '#8a6d00';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y - 58 + bob);
  ctx.lineTo(x + 12, y - 46 + bob);
  ctx.lineTo(x, y - 34 + bob);
  ctx.lineTo(x - 12, y - 46 + bob);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  // Off-screen edge arrow pointing at the target.
  const vw = cam.w;
  const vh = cam.h;
  if (x < 0 || x > vw || y < 0 || y > vh) {
    const cx = vw / 2;
    const cy = vh / 2;
    const ang = Math.atan2(y - cy, x - cx);
    const ex = cx + Math.cos(ang) * (Math.min(vw, vh) / 2 - 40);
    const ey = cy + Math.sin(ang) * (Math.min(vw, vh) / 2 - 40);
    ctx.save();
    ctx.translate(ex, ey);
    ctx.rotate(ang);
    ctx.fillStyle = '#ffd94d';
    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.lineTo(-8, -9);
    ctx.lineTo(-8, 9);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#ffd94d';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(Math.round(dist(G.player.x, G.player.y, target.x, target.y)) + 'm', ex, ey + 26);
  }
}
