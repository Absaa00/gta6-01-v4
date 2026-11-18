// SPDX-License-Identifier: MIT
// Solmar Bay — input: keyboard state plus mouse position, with edge-triggered
// "just pressed" keys so actions (steal, punch, shoot, interact) fire once.

const KEYMAP = {
  KeyW: 'up',
  ArrowUp: 'up',
  KeyS: 'down',
  ArrowDown: 'down',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  ShiftLeft: 'run',
  ShiftRight: 'run',
  KeyE: 'interact',
  Space: 'punch',
  KeyF: 'shoot',
  KeyM: 'mute',
  KeyP: 'pause',
  Escape: 'pause',
  Enter: 'confirm',
};

export function createInput() {
  const held = new Set();
  const pressed = new Set();
  let mouseX = 0;
  let mouseY = 0;
  let mouseDown = false;

  function onKeyDown(e) {
    const action = KEYMAP[e.code];
    if (!action) return;
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    if (!e.repeat) pressed.add(action);
    held.add(action);
  }
  function onKeyUp(e) {
    const action = KEYMAP[e.code];
    if (action) held.delete(action);
  }
  function onMouseMove(e) {
    mouseX = e.clientX;
    mouseY = e.clientY;
  }
  function onMouseDown(e) {
    mouseX = e.clientX;
    mouseY = e.clientY;
    mouseDown = true;
  }
  function onMouseUp() {
    mouseDown = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);

  return {
    isDown(action) {
      return held.has(action);
    },
    // true only on the frame the key went down; consumed by endFrame()
    wasPressed(action) {
      return pressed.has(action);
    },
    // drop a just-pressed edge so another handler in the same frame does not re-read it
    consume(action) {
      pressed.delete(action);
    },
    axis() {
      let x = 0;
      let y = 0;
      if (held.has('left')) x -= 1;
      if (held.has('right')) x += 1;
      if (held.has('up')) y -= 1;
      if (held.has('down')) y += 1;
      return { x, y };
    },
    mouse() {
      return { x: mouseX, y: mouseY, down: mouseDown };
    },
    endFrame() {
      pressed.clear();
    },
    // Test / staging helper: pretend a key is held or pressed.
    fakePress(action) {
      pressed.add(action);
      held.add(action);
    },
    fakeHold(action) {
      held.add(action);
    },
    fakeRelease(action) {
      held.delete(action);
    },
  };
}
