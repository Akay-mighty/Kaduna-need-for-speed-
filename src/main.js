// ============================================================
// main.js — bootstrap: hide loader when models load, show start screen
// ============================================================
import { Game } from './game.js';

const loaderFill = document.getElementById('loader-fill');
const loaderPct = document.getElementById('loader-pct');
const loaderStatus = document.getElementById('loader-status');
const loaderEl = document.getElementById('loader');
const startEl = document.getElementById('start');
const endEl = document.getElementById('end');

const game = new Game();

// Coarse progress: a few discrete jumps while the heavy GLBs download
let progress = 0;
const tick = setInterval(() => {
  progress = Math.min(95, progress + 1);
  loaderFill.style.width = progress + '%';
  loaderPct.textContent = progress + '%';
}, 80);

game.init((pct, status) => {
  if (pct) {
    progress = Math.max(progress, pct);
    loaderFill.style.width = progress + '%';
    loaderPct.textContent = progress + '%';
  }
  if (status) loaderStatus.textContent = status;
}).then(() => {
  clearInterval(tick);
  loaderFill.style.width = '100%';
  loaderPct.textContent = '100%';
  loaderStatus.textContent = 'Ready';
  setTimeout(() => {
    loaderEl.classList.add('hidden');
    startEl.classList.add('active');
  }, 500);
}).catch(err => {
  clearInterval(tick);
  console.error(err);
  loaderStatus.textContent = 'Error: ' + (err.message || err);
});

document.getElementById('start-race').addEventListener('click', () => {
  startEl.classList.remove('active');
  game.startRace();
});

document.getElementById('end-restart').addEventListener('click', () => {
  endEl.classList.remove('active');
  document.getElementById('cp-arrow').style.display = 'block';
  document.getElementById('cp-distance').style.display = 'block';
  // Reset HUD state
  document.getElementById('lap-current').textContent = '1';
  document.getElementById('cp-current').textContent = '1';
  document.getElementById('lap-time-last').textContent = '--:--.---';
  document.getElementById('lap-time-best').textContent = 'Best: ' + (game.race.bestLap ? formatTimeLocal(game.race.bestLap) : '--:--.---');
  game._refreshBestTime();
  game.startRace();
});

document.getElementById('end-menu').addEventListener('click', () => {
  endEl.classList.remove('active');
  document.getElementById('cp-arrow').style.display = 'block';
  document.getElementById('cp-distance').style.display = 'block';
  startEl.classList.add('active');
  game.started = false;
  document.getElementById('hud').classList.remove('active');
  document.getElementById('touch').classList.remove('active');
});

function formatTimeLocal(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(ms).padStart(3,'0')}`;
}
