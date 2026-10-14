// ============================================================
// Neon Drive 3D — Entry point
// Bootstraps the game, loads assets, then hands off to the Game.
// ============================================================
import { Game } from './game.js';
import { CARS } from './cars.js';

const loaderFill = document.getElementById('loader-fill');
const loaderPct = document.getElementById('loader-pct');
const loaderEl = document.getElementById('loader');
const selectEl = document.getElementById('car-select');
const grid = document.getElementById('car-grid');

// Populate car-select UI from CARS metadata
CARS.forEach((car, idx) => {
  const card = document.createElement('div');
  card.className = 'car-card';
  card.innerHTML = `
    <span class="tag">${car.tag}</span>
    <img src="${car.img}" alt="${car.name}" />
    <h3>${car.name}</h3>
    <div class="stats">
      <div class="stat">SPD<div class="stat-bar"><div style="width:${car.stats.speed}%"></div></div></div>
      <div class="stat">ACC<div class="stat-bar"><div style="width:${car.stats.accel}%"></div></div></div>
      <div class="stat">HND<div class="stat-bar"><div style="width:${car.stats.handling}%"></div></div></div>
    </div>
  `;
  card.addEventListener('click', () => startGame(idx));
  grid.appendChild(card);
});

// Preload the three car textures + city texture so the loader is meaningful
const allImgs = [...CARS.map(c => c.img), '/city-scene.jpg'];
let loaded = 0;
allImgs.forEach(src => {
  const im = new Image();
  im.onload = im.onerror = () => {
    loaded++;
    const pct = Math.round((loaded / allImgs.length) * 100);
    loaderFill.style.width = pct + '%';
    loaderPct.textContent = pct + '%';
    if (loaded === allImgs.length) {
      setTimeout(() => {
        loaderEl.classList.add('hidden');
        selectEl.classList.add('active');
      }, 400);
    }
  };
  im.src = src;
});

// Boot the game engine once, then drive it via startGame()
const game = new Game();
game.init();

function startGame(carIdx) {
  selectEl.classList.remove('active');
  game.startWithCar(CARS[carIdx]);
}
