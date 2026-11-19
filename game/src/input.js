// Palmera Bay — keyboard and mouse state. The game polls `keys` and the
// mouse each frame instead of reacting to single events, which keeps
// movement smooth and lets the same code drive screenshots and replays.
export function makeInput(canvas) {
  const input = {
    keys: Object.create(null),
    mouseX: 0,
    mouseY: 0,
    mouseDown: false,
    clicked: false, // true for exactly one frame after a press
    pressed: Object.create(null), // keys pressed this frame only
  };

  const keyName = (e) => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    return k;
  };

  window.addEventListener('keydown', (e) => {
    const k = keyName(e);
    if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
    if (!input.keys[k]) input.pressed[k] = true;
    input.keys[k] = true;
  });
  window.addEventListener('keyup', (e) => {
    input.keys[e.key.length === 1 ? e.key.toLowerCase() : e.key] = false;
  });
  window.addEventListener('blur', () => {
    input.keys = Object.create(null);
  });

  canvas.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    input.mouseX = e.clientX - r.left;
    input.mouseY = e.clientY - r.top;
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    input.mouseDown = true;
    input.clicked = true;
    const r = canvas.getBoundingClientRect();
    input.mouseX = e.clientX - r.left;
    input.mouseY = e.clientY - r.top;
  });
  window.addEventListener('mouseup', () => {
    input.mouseDown = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  input.down = function down(...names) {
    return names.some((n) => !!input.keys[n]);
  };

  input.wasPressed = function wasPressed(...names) {
    return names.some((n) => !!input.pressed[n]);
  };

  // Call at the end of every frame so one-frame flags clear.
  input.endFrame = function endFrame() {
    input.clicked = false;
    input.pressed = Object.create(null);
  };

  return input;
}
