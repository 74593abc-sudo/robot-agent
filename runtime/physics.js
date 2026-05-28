const { screen } = require('electron');
const { ROBOT_W, ROBOT_H, getRobotWindow, clampRobotSize } = require('./windows');
const { safeSend, isWinAlive } = require('./safeSend');

// Peek width: how many pixels of the robot stay on screen when it's snapped
// to an off-screen edge. ROBOT_W is 135, so 67 means the window is half on /
// half off — i.e. half of the body is hidden, which is the desired "靠墙偷看"
// look. (Left/right) For top/bottom we use the same value relative to ROBOT_H.
const PEEK_VISIBLE = 67;
const PEEK_VISIBLE_V = 90;   // vertical peeks expose more so the head still shows
const SNAP_THRESHOLD = 4;

let peekSide = '';
let peekSetAt = 0;
let smoothMoveAbort = false;
let smoothMoveTimer = 0;
let thrownLock = false;
let throwAbort = false;
let lastInteractionTs = Date.now();
let moodTired = false;

function noteInteraction() {
  lastInteractionTs = Date.now();
  if (moodTired) {
    moodTired = false;
    safeSend(getRobotWindow(), 'set-mood', { tired: false });
  }
}

function smoothMoveWindow(targetX, targetY, duration = 260) {
  const robotWindow = getRobotWindow();
  if (!robotWindow) return;
  const [startX, startY] = robotWindow.getPosition();
  if (startX === targetX && startY === targetY) return;
  smoothMoveAbort = false;
  // We use setTimeout, not rAF — main process has no requestAnimationFrame.
  // 16ms ≈ 60fps which is sufficient for a position tween.
  if (smoothMoveTimer) clearTimeout(smoothMoveTimer);
  const startTime = Date.now();
  let lastX = startX, lastY = startY;
  const tick = () => {
    const rw = getRobotWindow();
    if (!isWinAlive(rw) || smoothMoveAbort) { smoothMoveTimer = 0; return; }
    const t = Math.min(1, (Date.now() - startTime) / duration);
    const e = 1 - Math.pow(1 - t, 3);
    const nx = Math.round(startX + (targetX - startX) * e);
    const ny = Math.round(startY + (targetY - startY) * e);
    // Skip the setBounds Win32 call when sub-pixel movement — saves the
    // syscall round-trip (~0.3-0.8ms each on Windows). The final frame is
    // forced through to land exactly on target.
    if (t >= 1 || nx !== lastX || ny !== lastY) {
      try { rw.setBounds({ x: nx, y: ny, width: ROBOT_W, height: ROBOT_H }); }
      catch (_) { smoothMoveTimer = 0; return; }
      lastX = nx; lastY = ny;
    }
    if (t < 1) smoothMoveTimer = setTimeout(tick, 16); else smoothMoveTimer = 0;
  };
  tick();
}

function getEdgeSnap() {
  const robotWindow = getRobotWindow();
  if (!robotWindow) return null;
  const [rx, ry] = robotWindow.getPosition();
  const rw = ROBOT_W, rh = ROBOT_H;
  let disp;
  try { disp = screen.getDisplayMatching({ x: rx, y: ry, width: rw, height: rh }); }
  catch (_) { disp = null; }
  if (!disp) disp = screen.getPrimaryDisplay();
  const a = disp.workArea;
  const dL = rx - a.x, dR = (a.x + a.width) - (rx + rw), dT = ry - a.y, dB = (a.y + a.height) - (ry + rh);
  const candidates = [
    { side: 'l', d: dL, x: a.x - (rw - PEEK_VISIBLE),   y: ry },
    { side: 'r', d: dR, x: a.x + a.width - PEEK_VISIBLE, y: ry },
    { side: 't', d: dT, x: rx, y: a.y - (rh - PEEK_VISIBLE_V) },
    { side: 'b', d: dB, x: rx, y: a.y + a.height - PEEK_VISIBLE_V },
  ].filter(c => c.d < SNAP_THRESHOLD);
  if (!candidates.length) return null;
  candidates.sort((a, b) => a.d - b.d);
  return candidates[0];
}

function setPeek(side) {
  peekSide = side;
  peekSetAt = Date.now();
  safeSend(getRobotWindow(), 'set-peek', side);
}

function maybeSlideBack() {
  const robotWindow = getRobotWindow();
  if (!peekSide || !robotWindow) return;
  if (Date.now() - peekSetAt < 900) return;
  let pt; try { pt = screen.getCursorScreenPoint(); } catch (_) { return; }
  const [rx, ry] = robotWindow.getPosition();
  const rw = ROBOT_W, rh = ROBOT_H;
  let disp;
  try { disp = screen.getDisplayMatching({ x: rx, y: ry, width: rw, height: rh }); }
  catch (_) { disp = null; }
  if (!disp) disp = screen.getPrimaryDisplay();
  const a = disp.workArea;
  let near = false;
  const PROX = 90;
  if (peekSide === 'r' && pt.x > a.x + a.width  - PROX && pt.y > ry - 30 && pt.y < ry + rh + 30) near = true;
  if (peekSide === 'l' && pt.x < a.x + PROX            && pt.y > ry - 30 && pt.y < ry + rh + 30) near = true;
  if (peekSide === 't' && pt.y < a.y + PROX            && pt.x > rx - 30 && pt.x < rx + rw + 30) near = true;
  if (peekSide === 'b' && pt.y > a.y + a.height - PROX && pt.x > rx - 30 && pt.x < rx + rw + 30) near = true;
  if (near) {
    let tx = rx, ty = ry;
    if (peekSide === 'r') tx = a.x + a.width - rw - 6;
    if (peekSide === 'l') tx = a.x + 6;
    if (peekSide === 't') ty = a.y + 6;
    if (peekSide === 'b') ty = a.y + a.height - rh - 6;
    setPeek('');
    smoothMoveWindow(tx, ty, 240);
  }
}

function throwWindow(vx0, vy0, onThrowEnd) {
  const robotWindow = getRobotWindow();
  if (!robotWindow) return;
  const clamp = (v, m) => Math.max(-m, Math.min(m, v));
  let vx = clamp(vx0, 90), vy = clamp(vy0, 90);
  thrownLock = true;
  throwAbort = false;
  const [rx0, ry0] = robotWindow.getPosition();
  let disp;
  try { disp = screen.getDisplayMatching({ x: rx0, y: ry0, width: ROBOT_W, height: ROBOT_H }); }
  catch (_) { disp = null; }
  if (!disp) disp = screen.getPrimaryDisplay();
  const a = disp.workArea;
  const W_ = ROBOT_W, H_ = ROBOT_H;
  let x = rx0, y = ry0;
  const gravity      = 1.4;
  const airFriction  = 0.992;
  const floorFric    = 0.84;
  const elasticity   = 0.4;
  const minBounceVy  = 3.2;
  const minPostBounceVy = 2.4;
  const minSlideVx   = 0.7;
  const restThreshold = 0.6;
  const floorEps     = 0.5;
  let restFrames = 0;
  let frameCount = 0;
  let lastSetX = Math.round(rx0), lastSetY = Math.round(ry0);
  const MAX_FRAMES   = 360;

  const tick = () => {
    const rw = getRobotWindow();
    if (!rw || throwAbort) { thrownLock = false; return; }
    frameCount += 1;
    x += vx; y += vy;
    vy += gravity;
    vx *= airFriction;

    const floorY = a.y + a.height - H_;
    const ceilY  = a.y;
    const leftX  = a.x;
    const rightX = a.x + a.width - W_;

    let bounced = false;
    if (x < leftX)  { x = leftX;  vx = Math.abs(vx) < minSlideVx ? 0 : -vx * elasticity; if (vx) bounced = true; }
    if (x > rightX) { x = rightX; vx = Math.abs(vx) < minSlideVx ? 0 : -vx * elasticity; if (vx) bounced = true; }
    if (y < ceilY)  { y = ceilY;  vy = -vy * elasticity * 0.6; bounced = true; }

    const onFloor = y >= floorY - floorEps;
    if (onFloor) {
      y = floorY;
      const bounceVy = Math.abs(vy) * elasticity;
      if (Math.abs(vy) < minBounceVy || bounceVy < minPostBounceVy) {
        vy = 0;
        vx *= floorFric;
        if (Math.abs(vx) < minSlideVx) vx = 0;
        restFrames += 1;
      } else {
        vy = -bounceVy;
        vx *= 0.82;
        bounced = true;
        restFrames = 0;
      }
    } else {
      restFrames = 0;
    }

    const nx = Math.round(x), ny = Math.round(y);
    if (nx !== lastSetX || ny !== lastSetY) {
      try { rw.setBounds({ x: nx, y: ny, width: ROBOT_W, height: ROBOT_H }); }
      catch (_) {
        // Window died mid-throw. Release the lock so subsequent clicks
        // aren't ignored, and abort cleanly.
        thrownLock = false;
        if (onThrowEnd) {
          try { onThrowEnd(); } catch (_) {}
        }
        return;
      }
      lastSetX = nx; lastSetY = ny;
    }

    const stillMoving =
      !onFloor ||
      Math.hypot(vx, vy) > restThreshold ||
      restFrames < 4;
    if (stillMoving && frameCount < MAX_FRAMES) {
      setTimeout(tick, 16);
    } else {
      thrownLock = false;
      if (frameCount >= MAX_FRAMES && !onFloor) {
        try { rw.setBounds({ x: Math.round(x), y: floorY, width: ROBOT_W, height: ROBOT_H }); } catch (_) {}
      }
      setTimeout(() => {
        if (onThrowEnd) onThrowEnd();
      }, 120);
    }
  };
  tick();
}

function isThrownLock() { return thrownLock; }
function setThrowAbort(v) { throwAbort = v; thrownLock = false; }
function setSmoothMoveAbort(v) { smoothMoveAbort = v; }

function getPeekSide() { return peekSide; }
function clearPeek() { setPeek(''); }

let slideBackTimer = null;
let moodTimer = null;

function startPhysicsTimers() {
  if (slideBackTimer) return; // already running
  slideBackTimer = setInterval(() => {
    const robotWindow = getRobotWindow();
    if (isWinAlive(robotWindow)) maybeSlideBack();
  }, 200);
  moodTimer = setInterval(() => {
    const robotWindow = getRobotWindow();
    if (!isWinAlive(robotWindow)) return;
    const idleMs = Date.now() - lastInteractionTs;
    const shouldBeTired = idleMs > 5 * 60 * 1000;
    if (shouldBeTired !== moodTired) {
      moodTired = shouldBeTired;
      safeSend(robotWindow, 'set-mood', { tired: moodTired });
    }
  }, 20000);
}

function clearPhysicsTimers() {
  if (slideBackTimer) { clearInterval(slideBackTimer); slideBackTimer = null; }
  if (moodTimer) { clearInterval(moodTimer); moodTimer = null; }
}

module.exports = {
  noteInteraction, smoothMoveWindow, getEdgeSnap, setPeek, maybeSlideBack,
  throwWindow, isThrownLock, setThrowAbort, setSmoothMoveAbort,
  getPeekSide, clearPeek, startPhysicsTimers, clearPhysicsTimers,
};
