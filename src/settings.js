// ============================================================
// settings.js — game settings with localStorage persistence
//
// Settings stored:
//   - graphicsQuality: 'low' | 'medium' | 'high'
//   - soundEnabled: bool
//   - soundVolume: 0..1
//   - musicEnabled: bool
//   - musicVolume: 0..1
//   - steerSensitivity: 0.5..2.0
//   - cameraDistance: 5..25
//   - showFPS: bool
//
// The Settings class:
//   - Loads from localStorage on construction
//   - Provides get/set methods
//   - Saves to localStorage on every set
//   - Has a `resetToDefault()` method
//   - Notifies listeners when a setting changes (so the game can react)
//
// The SettingsUI class:
//   - Manages the HTML overlay (#settings-overlay)
//   - Wires up all controls (sliders, toggles, buttons)
//   - Shows/hides the overlay
// ============================================================

const STORAGE_KEY = 'lagos-drift-settings';

const DEFAULTS = {
  graphicsQuality: 'high',
  soundEnabled: true,
  soundVolume: 0.7,
  musicEnabled: true,
  musicVolume: 0.4,
  steerSensitivity: 1.0,
  cameraDistance: 14,
  showFPS: false,
};

export class Settings {
  constructor() {
    this.values = { ...DEFAULTS };
    this.listeners = [];
    this._load();
  }

  _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        // Merge with defaults to handle new keys added in updates
        this.values = { ...DEFAULTS, ...data };
      }
    } catch (e) { /* ignore */ }
  }

  _save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.values));
    } catch (e) { /* storage full or disabled */ }
  }

  get(key) {
    return this.values[key];
  }

  set(key, value) {
    const old = this.values[key];
    this.values[key] = value;
    this._save();
    if (old !== value) {
      this.listeners.forEach(fn => fn(key, value, old));
    }
  }

  resetToDefault() {
    this.values = { ...DEFAULTS };
    this._save();
    this.listeners.forEach(fn => fn('reset', null, null));
  }

  onChange(fn) {
    this.listeners.push(fn);
  }
}

// ===== Settings UI controller =====
export class SettingsUI {
  constructor(settings) {
    this.settings = settings;
    this.overlay = document.getElementById('settings-overlay');
    this.onClose = null;   // callback when settings is closed
    this._wire();
    this._refresh();
  }

  _wire() {
    // Close buttons
    document.getElementById('settings-back-game').addEventListener('click', () => this.hide('game'));
    document.getElementById('settings-back-menu').addEventListener('click', () => this.hide('menu'));

    // Reset to defaults
    document.getElementById('settings-reset').addEventListener('click', () => {
      this.settings.resetToDefault();
      this._refresh();
    });

    // Graphics quality buttons
    document.querySelectorAll('.quality-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.settings.set('graphicsQuality', btn.dataset.quality);
        this._refresh();
      });
    });

    // Sound on/off — wire the switch div + checkbox together
    const soundToggle = document.getElementById('sound-toggle');
    const soundSwitch = document.getElementById('sound-switch');
    soundToggle.addEventListener('change', () => {
      this.settings.set('soundEnabled', soundToggle.checked);
      soundSwitch.classList.toggle('on', soundToggle.checked);
    });
    soundSwitch.addEventListener('click', () => {
      soundToggle.checked = !soundToggle.checked;
      soundToggle.dispatchEvent(new Event('change'));
    });
    document.getElementById('sound-volume').addEventListener('input', e => {
      this.settings.set('soundVolume', parseFloat(e.target.value));
      this._updateVolumeLabel('sound');
    });

    // Music on/off
    const musicToggle = document.getElementById('music-toggle');
    const musicSwitch = document.getElementById('music-switch');
    musicToggle.addEventListener('change', () => {
      this.settings.set('musicEnabled', musicToggle.checked);
      musicSwitch.classList.toggle('on', musicToggle.checked);
    });
    musicSwitch.addEventListener('click', () => {
      musicToggle.checked = !musicToggle.checked;
      musicToggle.dispatchEvent(new Event('change'));
    });
    document.getElementById('music-volume').addEventListener('input', e => {
      this.settings.set('musicVolume', parseFloat(e.target.value));
      this._updateVolumeLabel('music');
    });

    // Steering sensitivity
    document.getElementById('steer-sens').addEventListener('input', e => {
      this.settings.set('steerSensitivity', parseFloat(e.target.value));
      document.getElementById('steer-sens-value').textContent = parseFloat(e.target.value).toFixed(2);
    });

    // Camera distance
    document.getElementById('cam-dist').addEventListener('input', e => {
      this.settings.set('cameraDistance', parseFloat(e.target.value));
      document.getElementById('cam-dist-value').textContent = parseFloat(e.target.value).toFixed(0) + 'm';
    });

    // Show FPS
    const fpsToggle = document.getElementById('fps-toggle');
    const fpsSwitch = document.getElementById('fps-switch');
    fpsToggle.addEventListener('change', () => {
      this.settings.set('showFPS', fpsToggle.checked);
      fpsSwitch.classList.toggle('on', fpsToggle.checked);
    });
    fpsSwitch.addEventListener('click', () => {
      fpsToggle.checked = !fpsToggle.checked;
      fpsToggle.dispatchEvent(new Event('change'));
    });
  }

  _updateVolumeLabel(which) {
    const vol = this.settings.get(which === 'sound' ? 'soundVolume' : 'musicVolume');
    const el = document.getElementById(which + '-volume-value');
    if (el) el.textContent = Math.round(vol * 100) + '%';
  }

  _refresh() {
    // Graphics quality buttons
    const quality = this.settings.get('graphicsQuality');
    document.querySelectorAll('.quality-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.quality === quality);
    });

    // Sound
    const soundOn = this.settings.get('soundEnabled');
    document.getElementById('sound-toggle').checked = soundOn;
    document.getElementById('sound-switch').classList.toggle('on', soundOn);
    document.getElementById('sound-volume').value = this.settings.get('soundVolume');
    this._updateVolumeLabel('sound');

    // Music
    const musicOn = this.settings.get('musicEnabled');
    document.getElementById('music-toggle').checked = musicOn;
    document.getElementById('music-switch').classList.toggle('on', musicOn);
    document.getElementById('music-volume').value = this.settings.get('musicVolume');
    this._updateVolumeLabel('music');

    // Steering sensitivity
    document.getElementById('steer-sens').value = this.settings.get('steerSensitivity');
    document.getElementById('steer-sens-value').textContent = this.settings.get('steerSensitivity').toFixed(2);

    // Camera distance
    document.getElementById('cam-dist').value = this.settings.get('cameraDistance');
    document.getElementById('cam-dist-value').textContent = this.settings.get('cameraDistance').toFixed(0) + 'm';

    // FPS
    const fpsOn = this.settings.get('showFPS');
    document.getElementById('fps-toggle').checked = fpsOn;
    document.getElementById('fps-switch').classList.toggle('on', fpsOn);
  }

  show() {
    this._refresh();
    this.overlay.classList.add('active');
  }

  hide(target = 'game') {
    this.overlay.classList.remove('active');
    if (this.onClose) this.onClose(target);
  }

  isVisible() {
    return this.overlay.classList.contains('active');
  }
}
