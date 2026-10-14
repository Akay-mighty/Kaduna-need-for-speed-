// ============================================================
// input.js — keyboard + touch input manager
// ============================================================
export class Input {
  constructor() {
    this.keys = {};
    this.touch = { left: false, right: false, gas: false, brake: false };
    this._bind();
  }

  _bind() {
    window.addEventListener('keydown', e => {
      this.keys[e.code] = true;
      // Prevent spacebar from scrolling
      if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', e => { this.keys[e.code] = false; });

    // Touch buttons
    const bind = (id, key) => {
      const el = document.getElementById(id);
      if (!el) return;
      const on = e => { e.preventDefault(); this.touch[key] = true; };
      const off = e => { e.preventDefault(); this.touch[key] = false; };
      el.addEventListener('touchstart', on, { passive: false });
      el.addEventListener('touchend', off, { passive: false });
      el.addEventListener('mousedown', on);
      el.addEventListener('mouseup', off);
      el.addEventListener('mouseleave', off);
    };
    bind('btn-left', 'left');
    bind('btn-right', 'right');
    bind('btn-gas', 'gas');
    bind('btn-brake', 'brake');
  }

  // Aggregate "intent" the game cares about
  get gas()      { return this.keys.KeyW || this.keys.ArrowUp    || this.touch.gas; }
  get brake()    { return this.keys.KeyS || this.keys.ArrowDown  || this.touch.brake; }
  get left()     { return this.keys.KeyA || this.keys.ArrowLeft || this.touch.left; }
  get right()    { return this.keys.KeyD || this.keys.ArrowRight|| this.touch.right; }
  get drift()    { return this.keys.Space; }
  get camera()   { return !!this.keys.KeyC; }
}
