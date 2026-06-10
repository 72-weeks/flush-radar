// All sound is synthesized with WebAudio — no asset files.

export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private windGain: GainNode | null = null;
  private boostGain: GainNode | null = null;
  muted = false;

  /** Must be called from a user gesture. */
  init(): void {
    if (this.ctx) return;
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(ctx.destination);

    // engine: saw -> lowpass
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 50;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 400;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(this.engineFilter).connect(this.engineGain).connect(this.master);
    this.engineOsc.start();

    // wind + boost share a looping noise source
    const noise = this.makeNoise();
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 700;
    windFilter.Q.value = 0.6;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    noise.connect(windFilter).connect(this.windGain).connect(this.master);

    const boostFilter = ctx.createBiquadFilter();
    boostFilter.type = 'highpass';
    boostFilter.frequency.value = 1800;
    this.boostGain = ctx.createGain();
    this.boostGain.gain.value = 0;
    noise.connect(boostFilter).connect(this.boostGain).connect(this.master);

    this.startMusic();
  }

  // ---- music: tiny synthwave loop, scheduled with lookahead ----

  private musicStep = 0;
  private musicNextTime = 0;

  private startMusic(): void {
    const ctx = this.ctx!;
    const musicGain = ctx.createGain();
    musicGain.gain.value = 0.16;
    musicGain.connect(this.master!);

    const bpm = 126;
    const stepDur = 60 / bpm / 2; // 8th notes
    const bass = [55, 0, 55, 0, 65.4, 0, 55, 0, 82.4, 0, 73.4, 0, 65.4, 0, 49, 0];
    this.musicNextTime = ctx.currentTime + 0.1;

    setInterval(() => {
      while (this.musicNextTime < ctx.currentTime + 0.25) {
        const t = this.musicNextTime;
        const step = this.musicStep % 16;
        // kick on the beat
        if (step % 4 === 0) {
          const osc = ctx.createOscillator();
          osc.frequency.setValueAtTime(150, t);
          osc.frequency.exponentialRampToValueAtTime(45, t + 0.1);
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.5, t);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
          osc.connect(g).connect(musicGain);
          osc.start(t);
          osc.stop(t + 0.16);
        }
        // offbeat hat
        if (step % 4 === 2) {
          const buf = ctx.createBuffer(1, ctx.sampleRate * 0.04, ctx.sampleRate);
          const d = buf.getChannelData(0);
          for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
          const src = ctx.createBufferSource();
          src.buffer = buf;
          const f = ctx.createBiquadFilter();
          f.type = 'highpass';
          f.frequency.value = 7000;
          const g = ctx.createGain();
          g.gain.value = 0.12;
          src.connect(f).connect(g).connect(musicGain);
          src.start(t);
        }
        // bass line
        const note = bass[step];
        if (note > 0) {
          const osc = ctx.createOscillator();
          osc.type = 'sawtooth';
          osc.frequency.value = note;
          const f = ctx.createBiquadFilter();
          f.type = 'lowpass';
          f.frequency.value = 300;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.18, t);
          g.gain.exponentialRampToValueAtTime(0.01, t + stepDur * 0.9);
          osc.connect(f).connect(g).connect(musicGain);
          osc.start(t);
          osc.stop(t + stepDur);
        }
        this.musicNextTime += stepDur;
        this.musicStep++;
      }
    }, 100);
  }

  private makeNoise(): AudioBufferSourceNode {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.start();
    return src;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }

  /** Called every frame. speed m/s, throttle 0..1, boosting. */
  update(speed: number, throttle: number, boosting: boolean): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.engineOsc!.frequency.setTargetAtTime(45 + speed * 2.6 + throttle * 14, t, 0.05);
    this.engineFilter!.frequency.setTargetAtTime(300 + speed * 30, t, 0.05);
    this.engineGain!.gain.setTargetAtTime(0.04 + throttle * 0.05 + Math.min(speed, 40) * 0.001, t, 0.08);
    this.windGain!.gain.setTargetAtTime(Math.min(0.16, speed * 0.004), t, 0.1);
    this.boostGain!.gain.setTargetAtTime(boosting ? 0.14 : 0, t, 0.05);
  }

  private blip(freq: number, dur: number, type: OscillatorType = 'square', vol = 0.25): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.connect(g).connect(this.master);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  }

  countdownBeep(): void {
    this.blip(660, 0.18);
  }

  goBeep(): void {
    this.blip(1100, 0.4);
  }

  puckHit(strength: number): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.08, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = Math.min(0.5, 0.1 + strength * 0.04);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1200;
    src.connect(f).connect(g).connect(this.master);
    src.start();
  }

  /** Classic hockey goal horn. */
  goalHorn(): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    for (const [freq, vol] of [[233, 0.22], [466, 0.12], [699, 0.05]] as const) {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = freq;
      const vib = ctx.createOscillator();
      vib.frequency.value = 7;
      const vibGain = ctx.createGain();
      vibGain.gain.value = 4;
      vib.connect(vibGain).connect(osc.frequency);
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, ctx.currentTime);
      g.gain.setValueAtTime(vol, ctx.currentTime + 1.2);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.7);
      osc.connect(g).connect(this.master);
      osc.start();
      osc.stop(ctx.currentTime + 1.7);
      vib.start();
      vib.stop(ctx.currentTime + 1.7);
    }
  }

  horn(): void {
    this.blip(311, 0.35, 'square', 0.18);
  }

  trickChime(big: boolean): void {
    const notes = big ? [523, 659, 784, 1047] : [523, 784];
    notes.forEach((n, i) => setTimeout(() => this.blip(n, 0.22, 'triangle', 0.2), i * 70));
  }

  checkpoint(): void {
    this.blip(880, 0.15, 'sine', 0.22);
    setTimeout(() => this.blip(1175, 0.2, 'sine', 0.22), 80);
  }

  landThud(strength: number): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.15);
    const g = ctx.createGain();
    g.gain.setValueAtTime(Math.min(0.4, strength * 0.05), ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
    osc.connect(g).connect(this.master);
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
  }
}
