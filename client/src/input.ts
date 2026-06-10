// Keyboard state tracking.

export class Input {
  private keys = new Set<string>();
  private pressed = new Set<string>(); // edge-triggered, cleared each frame

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab') e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
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
    return (this.down('KeyW', 'ArrowUp') ? 1 : 0) - (this.down('KeyS', 'ArrowDown') ? 1 : 0);
  }

  get steer(): number {
    return (this.down('KeyA', 'ArrowLeft') ? 1 : 0) - (this.down('KeyD', 'ArrowRight') ? 1 : 0);
  }

  get boost(): boolean {
    return this.down('ShiftLeft', 'ShiftRight');
  }

  get jump(): boolean {
    return this.justPressed('Space');
  }

  get drift(): boolean {
    return this.down('ControlLeft', 'ControlRight', 'KeyX');
  }
}
