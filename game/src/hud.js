// The DOM HUD: wanted stars, cash, health, speed, objective, a 2D minimap,
// crosshair, toasts and the menu / pause / busted / wasted / complete screens.
import { WORLD, STREETS } from './config.js';

export function createHUD(api) {
  const el = (id) => document.getElementById(id);
  const starsEl = el('stars');
  const cashEl = el('cash');
  const healthFill = el('health-fill');
  const speedEl = el('speed');
  const objectiveEl = el('objective-text');
  const objectiveDist = el('objective-dist');
  const toastEl = el('toast');
  const crosshairEl = el('crosshair');
  const bustedEl = el('busted-bar');
  const bustedFill = el('busted-fill');
  const mapCanvas = el('minimap');
  const mapCtx = mapCanvas.getContext('2d');
  const screens = {
    menu: el('screen-menu'),
    pause: el('screen-pause'),
    over: el('screen-over'),
    complete: el('screen-complete'),
  };
  const overTitle = el('over-title');
  const overSub = el('over-sub');
  const completeStats = el('complete-stats');

  let toastTimer = 0;

  el('btn-new').addEventListener('click', () => api.onStart(true));
  el('btn-continue').addEventListener('click', () => api.onStart(false));
  el('btn-resume').addEventListener('click', () => api.onResume());
  el('btn-restart').addEventListener('click', () => api.onRestart());
  el('btn-retry').addEventListener('click', () => api.onRestart());
  el('btn-roam').addEventListener('click', () => api.onResume());
  el('btn-menu-restart').addEventListener('click', () => api.onRestart());

  function showScreen(name) {
    for (const key of Object.keys(screens)) {
      screens[key].classList.toggle('hidden', key !== name);
    }
  }

  function setOver(kind, sub) {
    overTitle.textContent = kind;
    overSub.textContent = sub;
    showScreen('over');
  }

  function setComplete(cash, missionsDone) {
    completeStats.textContent = `Story complete — ${missionsDone} missions, $${cash.toLocaleString('en-US')} earned. Port Soleil is yours.`;
    showScreen('complete');
  }

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3600);
  }

  function drawMinimap(state) {
    const w = mapCanvas.width;
    const h = mapCanvas.height;
    const s = w / WORLD.ground;
    const toX = (x) => (x + WORLD.ground / 2) * s;
    const toY = (z) => (z + WORLD.ground / 2) * s;
    mapCtx.fillStyle = '#16222e';
    mapCtx.fillRect(0, 0, w, h);
    // Beach + water.
    mapCtx.fillStyle = '#e6d199';
    mapCtx.fillRect(0, toY(WORLD.beachZ0), w, toY(WORLD.beachZ1) - toY(WORLD.beachZ0));
    mapCtx.fillStyle = '#2e86ab';
    mapCtx.fillRect(0, toY(WORLD.beachZ1), w, h - toY(WORLD.beachZ1));
    // Blocks.
    mapCtx.fillStyle = '#3a4a58';
    for (const bx of [-252, -180, -108, -36, 36, 108, 180, 252]) {
      for (const bz of [-252, -180, -108, -36, 36, 108, 180, 252]) {
        mapCtx.fillRect(toX(bx - 28), toY(bz - 28), 56 * s, 56 * s);
      }
    }
    // Streets.
    mapCtx.strokeStyle = '#8b98a5';
    mapCtx.lineWidth = 2;
    for (const st of STREETS) {
      mapCtx.beginPath();
      mapCtx.moveTo(toX(st), toY(-296));
      mapCtx.lineTo(toX(st), toY(296));
      mapCtx.stroke();
      mapCtx.beginPath();
      mapCtx.moveTo(toX(-296), toY(st));
      mapCtx.lineTo(toX(296), toY(st));
      mapCtx.stroke();
    }
    // Mission marker.
    if (state.marker) {
      const pulse = 3 + Math.sin(performance.now() * 0.006) * 1.5;
      mapCtx.fillStyle = '#ffd23e';
      mapCtx.beginPath();
      mapCtx.arc(toX(state.marker.x), toY(state.marker.z), pulse + 2, 0, Math.PI * 2);
      mapCtx.fill();
    }
    // Police dots.
    for (const p of state.police) {
      mapCtx.fillStyle = '#ff4444';
      mapCtx.beginPath();
      mapCtx.arc(toX(p.x), toY(p.z), 3, 0, Math.PI * 2);
      mapCtx.fill();
    }
    // Player arrow.
    const px = toX(state.player.x);
    const py = toY(state.player.z);
    mapCtx.save();
    mapCtx.translate(px, py);
    // Map x is world +x (right), map y is world +z (down): the forward vector
    // (sin h, cos h) points at canvas angle atan2(cos h, sin h) from +x, and
    // the triangle points up (-y) at rotation 0, so add PI/2.
    mapCtx.rotate(Math.atan2(Math.cos(state.player.heading), Math.sin(state.player.heading)) + Math.PI / 2);
    mapCtx.fillStyle = '#ffffff';
    mapCtx.beginPath();
    mapCtx.moveTo(0, -6);
    mapCtx.lineTo(4.5, 5);
    mapCtx.lineTo(-4.5, 5);
    mapCtx.closePath();
    mapCtx.fill();
    mapCtx.restore();
    // North.
    mapCtx.fillStyle = '#ffffff';
    mapCtx.font = 'bold 11px system-ui, sans-serif';
    mapCtx.textAlign = 'left';
    mapCtx.fillText('N', 6, 13);
  }

  function update(state) {
    starsEl.textContent = '★'.repeat(state.wanted) + '☆'.repeat(5 - state.wanted);
    starsEl.style.color = state.wanted > 0 ? '#ffd23e' : '#cfd6dd';
    cashEl.textContent = `$${state.cash.toLocaleString('en-US')}`;
    healthFill.style.width = `${Math.max(0, state.health)}%`;
    healthFill.style.background = state.health > 55 ? '#2ecc71' : state.health > 25 ? '#f39c12' : '#e74c3c';
    speedEl.textContent = state.inCar ? `${Math.round(Math.abs(state.speed) * 3.6)} km/h` : '';
    objectiveEl.textContent = state.objective;
    objectiveDist.textContent = state.dist !== null && state.dist !== undefined ? `${state.dist}m` : '';
    crosshairEl.classList.toggle('hidden', !(state.screen === 'play' && !state.inCar));
    if (state.bustedProgress > 0.02) {
      bustedEl.classList.remove('hidden');
      bustedFill.style.width = `${Math.round(state.bustedProgress * 100)}%`;
    } else {
      bustedEl.classList.add('hidden');
    }
    drawMinimap(state);
  }

  return { update, toast, showScreen, setOver, setComplete };
}
