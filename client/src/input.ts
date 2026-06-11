// Keyboard + virtual (touch) + gamepad state tracking.

export class Input {
  private keys = new Set<string>();
  private pressed = new Set<string>(); // edge-triggered, cleared each frame
  private gp = { steer: 0, throttle: 0, boost: false, drift: false };
  private prevGpJump = false;
  private prevGpCam = false;

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab') e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  /** Touch overlay buttons inject synthetic key state here. */
  setVirtual(code: string, down: boolean): void {
    if (down) {
      if (!this.keys.has(code)) this.pressed.add(code);
      this.keys.add(code);
    } else {
      this.keys.delete(code);
    }
  }

  /** Call once per frame, before reading inputs. */
  pollGamepad(): void {
    const pads = navigator.getGamepads?.() ?? [];
    const pad = pads.find((p) => p && p.connected);
    if (!pad) {
      this.gp.steer = 0;
      this.gp.throttle = 0;
      this.gp.boost = false;
      this.gp.drift = false;
      return;
    }
    const dead = (v: number) => (Math.abs(v) < 0.12 ? 0 : v);
    this.gp.steer = dead(pad.axes[0] ?? 0);
    const rt = pad.buttons[7]?.value ?? 0;
    const lt = pad.buttons[6]?.value ?? 0;
    this.gp.throttle = rt - lt;
    this.gp.boost = (pad.buttons[2]?.pressed || pad.buttons[5]?.pressed) ?? false;
    this.gp.drift = pad.buttons[1]?.pressed ?? false;
    const jump = pad.buttons[0]?.pressed ?? false;
    if (jump && !this.prevGpJump) this.pressed.add('Space');
    this.prevGpJump = jump;
    const camBtn = pad.buttons[3]?.pressed ?? false;
    if (camBtn && !this.prevGpCam) this.pressed.add('KeyC');
    this.prevGpCam = camBtn;
  }

  down(...codes: string[]): boolean {
    return codes.some((c) => this.keys.has(c));
  }

  justPressed(code: string): boolean {
    return this.pressed.has(code);
  }

  endFrame(): void {
    this.pressed.clear();
  }

  get throttle(): number {
    const kb = (this.down('KeyW', 'ArrowUp') ? 1 : 0) - (this.down('KeyS', 'ArrowDown') ? 1 : 0);
    return kb !== 0 ? kb : Math.max(-1, Math.min(1, this.gp.throttle));
  }

  get steer(): number {
    const kb = (this.down('KeyA', 'ArrowLeft') ? 1 : 0) - (this.down('KeyD', 'ArrowRight') ? 1 : 0);
    return kb !== 0 ? kb : Math.max(-1, Math.min(1, -this.gp.steer));
  }

  get boost(): boolean {
    return this.down('ShiftLeft', 'ShiftRight') || this.gp.boost;
  }

  get jump(): boolean {
    return this.justPressed('Space');
  }

  get drift(): boolean {
    return this.down('ControlLeft', 'ControlRight', 'KeyX') || this.gp.drift;
  }
}
