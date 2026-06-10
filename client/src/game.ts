// Game orchestration: scene, physics, networking, modes, camera, HUD.

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import {
  CHASSIS_HEIGHT,
  CHASSIS_LENGTH,
  CHASSIS_WIDTH,
  PUCK_HEIGHT,
  PUCK_MASS,
  PUCK_RADIUS,
  TEAM_COLORS,
  TEAM_NAMES,
  type LevelId
} from '../../shared/constants';
import { arenaSpawn } from '../../shared/arena';
import {
  pipeSpawn,
  pipeTerrain,
  raceCheckpoints,
  racePathX,
  raceSpawn,
  raceTerrain,
  RACE_FINISH_Z,
  type Terrain
} from '../../shared/terrain';
import { mulberry32 } from '../../shared/rng';
import type { Phase, PlayerInfo, PlayerState, S2C } from '../../shared/protocol';
import { GameAudio } from './audio';
import { CameraShake, ParticleSystem } from './effects';
import { Hud } from './hud';
import { Input } from './input';
import { Net } from './net';
import { buildVehicleMesh, Vehicle } from './vehicle';
import { buildArena, buildPuckMesh, buildTerrainLevel, makeSnowfall, setupEnvironment, type BuiltWorld } from './world';

interface SnapEntry {
  t: number;
  state: PlayerState;
}

interface Remote {
  info: PlayerInfo;
  mesh: THREE.Group;
  label: THREE.Sprite;
  body: CANNON.Body;
  buffer: SnapEntry[];
  lastState?: PlayerState;
}

const INTERP_DELAY = 120; // ms

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private world: CANNON.World;
  private vehicle!: Vehicle;
  private input = new Input();
  private audio = new GameAudio();
  private hud = new Hud();
  private net: Net;
  private shake = new CameraShake();
  private snowFx: ParticleSystem;
  private boostFx: ParticleSystem;
  private sparkFx: ParticleSystem;
  private snowfall: (camPos: THREE.Vector3, dt: number) => void;
  private sun!: THREE.DirectionalLight;
  private built!: BuiltWorld;
  private terrain: Terrain | null = null;

  private level: LevelId = 'arena';
  private myName = 'PLAYER';
  private myTeam = -1;
  private players = new Map<number, PlayerInfo>();
  private remotes = new Map<number, Remote>();

  private puckMesh: THREE.Group | null = null;
  private puckBody: CANNON.Body | null = null;
  private puckBuffer: SnapEntry[] = [];

  private phase: Phase = 'waiting';
  private clock = 0;
  private score: [number, number] = [0, 0];
  private lastCountdownShown = -1;

  private myCp = 0;
  private myScore = 0;
  private myFinish = 0;
  private playStart = 0;

  private running = false;
  private lastTime = 0;
  private camPos = new THREE.Vector3(0, 10, 30);

  // hazards & collectibles
  private boulders: { body: CANNON.Body; mesh: THREE.Mesh }[] = [];
  private boulderTimer = 4;
  private avalancheWarned = false;
  private stars: { mesh: THREE.Mesh; taken: boolean }[] = [];
  private wrongWayTimer = 0;
  private wrongWayShown = 0;

  onDisconnect: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, 2200);

    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -22, 0) });
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);

    this.snowFx = new ParticleSystem(this.scene, 0xffffff, 0.45);
    this.boostFx = new ParticleSystem(this.scene, 0xffa040, 0.6);
    this.sparkFx = new ParticleSystem(this.scene, 0x6fe3ff, 0.5);
    this.snowfall = makeSnowfall(this.scene);

    this.net = new Net({
      onMessage: (m) => this.onNet(m),
      onOpen: () => {},
      onClose: () => {
        this.running = false;
        this.onDisconnect?.();
      }
    });

    addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });
  }

  start(name: string, level: LevelId): void {
    this.myName = name;
    this.level = level;
    this.audio.init();
    this.net.connect(name, level);
  }

  // ---------- world construction (after welcome gives us the seed) ----------

  private buildLevel(seed: number): void {
    this.sun = setupEnvironment(this.scene, this.level);

    if (this.level === 'arena') {
      this.built = buildArena(this.scene, this.world);
      this.puckMesh = buildPuckMesh();
      this.scene.add(this.puckMesh);
      this.puckBody = new CANNON.Body({
        mass: PUCK_MASS,
        material: new CANNON.Material({ friction: 0.02, restitution: 0.6 }),
        angularDamping: 0.4,
        linearDamping: 0.18
      });
      this.puckBody.addShape(new CANNON.Cylinder(PUCK_RADIUS, PUCK_RADIUS, PUCK_HEIGHT, 16));
      this.puckBody.position.set(0, 3, 0);
      this.world.addBody(this.puckBody);
      this.puckBody.addEventListener('collide', (e: { body: CANNON.Body; contact: CANNON.ContactEquation }) => {
        if (e.body === this.vehicle.body) {
          const impact = Math.abs(e.contact.getImpactVelocityAlongNormal());
          if (impact > 2) {
            this.audio.puckHit(impact);
            this.shake.add(Math.min(0.4, impact * 0.03));
            this.sparkFx.burst(this.puckMesh!.position.clone(), 6, Math.min(30, impact * 3), 0.7);
          }
        }
      });
    } else {
      this.terrain = this.level === 'race' ? raceTerrain(seed) : pipeTerrain(seed);
      this.built = buildTerrainLevel(this.scene, this.world, this.terrain, this.level);
      if (this.level === 'pipe') this.buildStars();
    }

    const color = this.myTeam >= 0 ? TEAM_COLORS[this.myTeam] : 0x42d77d;
    this.vehicle = new Vehicle(this.world, color);
    this.scene.add(this.vehicle.mesh);
    this.respawn();

    this.hud.show();
    this.hud.setArenaMode(this.level === 'arena');
    this.running = true;
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  private spawnPoint(): { pos: [number, number, number]; yaw: number } {
    const slot = Math.abs(this.net.myId) % 3;
    if (this.level === 'arena') {
      const s = arenaSpawn(this.myTeam, slot);
      return { pos: [s.pos[0], 1.6, s.pos[2]], yaw: s.yaw };
    }
    const s = this.level === 'race' ? raceSpawn(slot) : pipeSpawn(Math.abs(this.net.myId) % 6);
    const y = this.terrain ? this.terrain.heightAt(s.pos[0], s.pos[2]) : 0;
    return { pos: [s.pos[0], y + 1.8, s.pos[2]], yaw: s.yaw };
  }

  private respawn(): void {
    const s = this.spawnPoint();
    if (this.level === 'race' && this.myCp > 0 && this.phase === 'play') {
      // respawn at last checkpoint
      const cp = raceCheckpoints()[this.myCp - 1];
      const y = this.terrain!.heightAt(cp.x, cp.z);
      this.vehicle.teleport([cp.x, y + 2, cp.z], Math.PI);
      return;
    }
    this.vehicle.teleport(s.pos, s.yaw);
    this.vehicle.boostMeter = 50;
  }

  // ---------- networking ----------

  private onNet(msg: S2C): void {
    switch (msg.t) {
      case 'welcome': {
        for (const p of msg.players) this.players.set(p.id, p);
        const me = msg.players.find((p) => p.id === msg.id);
        this.myTeam = me?.team ?? -1;
        this.phase = msg.phase;
        this.clock = msg.clock;
        this.score = msg.score;
        this.buildLevel(msg.seed);
        for (const p of msg.players) if (p.id !== msg.id) this.addRemote(p);
        break;
      }
      case 'playerJoin':
        if (!this.players.has(msg.player.id)) {
          this.players.set(msg.player.id, msg.player);
          if (msg.player.id !== this.net.myId) {
            this.addRemote(msg.player);
            if (!msg.player.bot) this.hud.feed(`${msg.player.name} joined`, '#9fe3ff');
          }
        }
        break;
      case 'playerLeave': {
        const info = this.players.get(msg.id);
        if (info && !info.bot) this.hud.feed(`${info.name} left`, '#88a');
        this.players.delete(msg.id);
        this.removeRemote(msg.id);
        break;
      }
      case 'snap': {
        const now = performance.now();
        this.clock = msg.clock;
        this.score = msg.score;
        if (msg.phase !== this.phase) this.applyPhase(msg.phase);
        for (const ps of msg.players) {
          if (ps.id === this.net.myId) continue;
          const r = this.remotes.get(ps.id);
          if (r) {
            r.buffer.push({ t: now, state: ps });
            if (r.buffer.length > 30) r.buffer.shift();
            r.lastState = ps;
          }
        }
        if (msg.puck && this.puckBody) {
          this.puckBuffer.push({ t: now, state: { id: -1, p: msg.puck.p, q: msg.puck.q, v: msg.puck.v, boost: false } });
          if (this.puckBuffer.length > 30) this.puckBuffer.shift();
          // blend the local predicted puck toward the server's truth
          const b = this.puckBody;
          const sp = msg.puck.p;
          const dx = sp[0] - b.position.x;
          const dy = sp[1] - b.position.y;
          const dz = sp[2] - b.position.z;
          const dist = Math.hypot(dx, dy, dz);
          if (dist > 5) {
            b.position.set(sp[0], sp[1], sp[2]);
            b.velocity.set(msg.puck.v[0], msg.puck.v[1], msg.puck.v[2]);
          } else {
            const k = 0.22;
            b.position.x += dx * k;
            b.position.y += dy * k;
            b.position.z += dz * k;
            b.velocity.x += (msg.puck.v[0] - b.velocity.x) * 0.5;
            b.velocity.y += (msg.puck.v[1] - b.velocity.y) * 0.5;
            b.velocity.z += (msg.puck.v[2] - b.velocity.z) * 0.5;
          }
        }
        break;
      }
      case 'goal': {
        this.score = msg.score;
        const scorer = this.players.get(msg.scorerId);
        const teamName = TEAM_NAMES[msg.team];
        this.audio.goalHorn();
        this.shake.add(0.7);
        if (this.puckMesh) this.sparkFx.burst(this.puckMesh.position.clone(), 18, 220, 1.6);
        const color = msg.team === 0 ? '#6fb9ff' : '#ff8a65';
        this.hud.banner('GOAL!!!', 3200, color);
        this.hud.subBanner(`${scorer?.name ?? '???'} scores for ${teamName}!`, 3200);
        if (scorer) this.hud.feed(`🚨 ${scorer.name} scored!`, color);
        break;
      }
      case 'phase':
        this.clock = msg.clock;
        this.applyPhase(msg.phase);
        break;
      case 'trick': {
        if (msg.id !== this.net.myId) {
          const who = this.players.get(msg.id);
          if (who) this.hud.feed(`✨ ${who.name}: ${msg.label} +${msg.points}`, '#ffe66d');
        }
        break;
      }
      case 'raceEnd': {
        const lines = msg.standings.slice(0, 5).map((s, i) => {
          const who = this.players.get(s.id);
          return `${i + 1}. ${who?.name ?? '???'} — ${(s.timeMs / 1000).toFixed(2)}s`;
        });
        const meIdx = msg.standings.findIndex((s) => s.id === this.net.myId);
        this.hud.banner(meIdx === 0 ? '🏆 VICTORY!' : 'RACE OVER', 6000, meIdx === 0 ? '#ffe66d' : '#fff');
        this.hud.subBanner(lines.join('   ·   ') || 'no finishers', 6000);
        break;
      }
      case 'horn': {
        this.audio.horn();
        const who = this.players.get(msg.id);
        if (who && msg.id !== this.net.myId) this.hud.feed(`📣 ${who.name}`, '#fff');
        break;
      }
    }
  }

  private applyPhase(phase: Phase): void {
    const prev = this.phase;
    this.phase = phase;
    if (phase === 'countdown') {
      this.lastCountdownShown = -1;
      this.myCp = 0;
      this.myScore = 0;
      this.myFinish = 0;
      this.avalancheWarned = false;
      this.resetStars();
      this.hud.hideBanner();
      this.respawn();
    } else if (phase === 'play') {
      this.playStart = performance.now();
      if (prev === 'countdown') {
        this.hud.banner('GO!', 900, '#7dffa0');
        this.audio.goBeep();
      }
      if (prev === 'goalpause') this.respawn();
    } else if (phase === 'end') {
      if (this.level === 'arena') {
        const [b, o] = this.score;
        const winner = b === o ? -1 : b > o ? 0 : 1;
        if (winner === -1) this.hud.banner('DRAW', 6000);
        else {
          const won = winner === this.myTeam;
          this.hud.banner(won ? '🏆 VICTORY!' : 'DEFEAT', 6000, won ? '#ffe66d' : '#ff8a8a');
          this.hud.subBanner(`${TEAM_NAMES[winner]} wins ${Math.max(b, o)}–${Math.min(b, o)}`, 6000);
        }
      } else if (this.level === 'pipe') {
        this.hud.banner('TIME!', 5000);
        this.hud.subBanner(`Your score: ${this.myScore}`, 6000);
      }
    }
  }

  // ---------- remote players ----------

  private addRemote(info: PlayerInfo): void {
    if (this.remotes.has(info.id)) return;
    const palette = [0xb86fd9, 0xffd84d, 0x4dd2ff, 0xff8a65, 0x7dffa0, 0xff6fae, 0xc0ccda, 0x9dff4d];
    const color = info.team >= 0 ? TEAM_COLORS[info.team] : palette[info.id % palette.length];
    const mesh = buildVehicleMesh(color);
    this.scene.add(mesh);
    const label = makeLabel(info.name, info.bot);
    label.position.y = 1.9;
    mesh.add(label);

    const body = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC });
    body.addShape(new CANNON.Box(new CANNON.Vec3(CHASSIS_WIDTH / 2, CHASSIS_HEIGHT / 2 + 0.3, CHASSIS_LENGTH / 2)));
    body.position.set(0, -100, 0);
    this.world.addBody(body);

    this.remotes.set(info.id, { info, mesh, label, body, buffer: [] });
  }

  private removeRemote(id: number): void {
    const r = this.remotes.get(id);
    if (!r) return;
    this.scene.remove(r.mesh);
    this.world.removeBody(r.body);
    this.remotes.delete(id);
  }

  private updateRemotes(dt: number): void {
    const renderT = performance.now() - INTERP_DELAY;
    for (const r of this.remotes.values()) {
      const buf = r.buffer;
      if (buf.length === 0) continue;
      let a = buf[0];
      let b = buf[buf.length - 1];
      for (let i = 0; i < buf.length - 1; i++) {
        if (buf[i].t <= renderT && buf[i + 1].t >= renderT) {
          a = buf[i];
          b = buf[i + 1];
          break;
        }
      }
      let p: [number, number, number];
      let q = b.state.q;
      if (b.t <= renderT) {
        // extrapolate from the newest state
        const ext = Math.min(0.25, (renderT - b.t) / 1000);
        p = [b.state.p[0] + b.state.v[0] * ext, b.state.p[1] + b.state.v[1] * ext, b.state.p[2] + b.state.v[2] * ext];
      } else {
        const span = Math.max(1, b.t - a.t);
        const k = Math.max(0, Math.min(1, (renderT - a.t) / span));
        p = [
          a.state.p[0] + (b.state.p[0] - a.state.p[0]) * k,
          a.state.p[1] + (b.state.p[1] - a.state.p[1]) * k,
          a.state.p[2] + (b.state.p[2] - a.state.p[2]) * k
        ];
        const qa = new THREE.Quaternion(...a.state.q);
        const qb = new THREE.Quaternion(...b.state.q);
        qa.slerp(qb, k);
        q = [qa.x, qa.y, qa.z, qa.w];
      }
      r.mesh.position.set(p[0], p[1], p[2]);
      r.mesh.quaternion.set(q[0], q[1], q[2], q[3]);
      r.body.position.set(p[0], p[1], p[2]);
      r.body.quaternion.set(q[0], q[1], q[2], q[3]);
      r.body.velocity.set(b.state.v[0], b.state.v[1], b.state.v[2]);
      // boost flames on remotes
      if (r.lastState?.boost) {
        const back = new THREE.Vector3(0, 0.2, -CHASSIS_LENGTH / 2).applyQuaternion(r.mesh.quaternion).add(r.mesh.position);
        this.boostFx.emit(back, new THREE.Vector3(0, 0, 0), 2, 0.4, 2);
      }
    }
  }

  // ---------- main loop ----------

  private loop(t: number): void {
    if (!this.running) return;
    requestAnimationFrame((t2) => this.loop(t2));
    const dt = Math.min(0.05, (t - this.lastTime) / 1000);
    this.lastTime = t;
    if (dt <= 0) return;

    const allowDrive = this.phase === 'play' || this.phase === 'waiting' || this.phase === 'end' || this.phase === 'goalpause';
    this.vehicle.update(this.input, dt, allowDrive);
    this.world.step(1 / 60, dt, 4);
    this.vehicle.syncMesh();

    this.updateRemotes(dt);
    this.updatePuck();
    this.updateMode(dt);
    this.updateBoulders(dt);
    this.updateStars();
    this.updateEffects(dt, t / 1000);
    this.updateCamera(dt);
    this.updateHud();
    this.handleKeys();

    this.net.sendState(t, () => {
      const b = this.vehicle.body;
      return {
        p: [b.position.x, b.position.y, b.position.z],
        q: [b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w],
        v: [b.velocity.x, b.velocity.y, b.velocity.z],
        boost: this.vehicle.boosting
      };
    });

    this.audio.update(this.vehicle.speed, Math.abs(this.input.throttle), this.vehicle.boosting);
    this.input.endFrame();
    this.renderer.render(this.scene, this.camera);
  }

  private updatePuck(): void {
    if (!this.puckMesh || !this.puckBody) return;
    const visible = this.phase === 'play' || this.phase === 'waiting';
    this.puckMesh.visible = visible;
    if (visible) {
      this.puckMesh.position.copy(this.puckBody.position as unknown as THREE.Vector3);
      this.puckMesh.quaternion.copy(this.puckBody.quaternion as unknown as THREE.Quaternion);
      // glowing trail when the puck is flying
      const sp = this.puckBody.velocity.length();
      if (sp > 9) {
        this.sparkFx.emit(this.puckMesh.position.clone(), new THREE.Vector3(0, 0.5, 0), 1.2, 0.5, Math.min(4, sp * 0.1));
      }
    }
    this.updatePuckArrow(visible);
  }

  /** Screen-edge arrow pointing at the puck when it's out of view. */
  private updatePuckArrow(puckVisible: boolean): void {
    const arrow = document.getElementById('puck-arrow')!;
    if (!puckVisible || !this.puckMesh) {
      arrow.classList.add('hidden');
      return;
    }
    const p = this.puckMesh.position.clone().project(this.camera);
    const camDir = new THREE.Vector3();
    this.camera.getWorldDirection(camDir);
    const toPuck = this.puckMesh.position.clone().sub(this.camera.position);
    const inFront = camDir.dot(toPuck) > 0;
    if (inFront && Math.abs(p.x) < 0.92 && Math.abs(p.y) < 0.92) {
      arrow.classList.add('hidden');
      return;
    }
    let nx = p.x;
    let ny = p.y;
    if (!inFront) {
      nx = -nx;
      ny = -ny;
    }
    const s = 0.88 / Math.max(Math.abs(nx), Math.abs(ny), 1e-4);
    const ex = nx * s;
    const ey = ny * s;
    const sx = ((ex + 1) / 2) * innerWidth;
    const sy = (1 - (ey + 1) / 2) * innerHeight;
    const angle = Math.atan2(ex, ey); // 0 = pointing up
    arrow.classList.remove('hidden');
    arrow.style.transform = `translate(${sx - 17}px, ${sy - 17}px) rotate(${angle}rad)`;
  }

  private updateMode(dt: number): void {
    const pos = this.vehicle.body.position;

    if (this.level === 'arena') {
      // boost pad pickup
      for (const pad of this.built.pads) {
        const d = Math.hypot(pos.x - pad.x, pos.z - pad.z);
        if (d < 2.4 && pos.y < 3 && this.vehicle.boostMeter < 99) {
          this.vehicle.boostMeter = 100;
          this.audio.checkpoint();
        }
      }
      // left the rink (over the glass) -> back to your side
      if (Math.abs(pos.x) > 45 || Math.abs(pos.z) > 75 || pos.y > 60 || pos.y < -10) this.respawn();
    } else if (this.terrain) {
      // fell off the mountain
      const edgeX = this.terrain.halfW - 1;
      const edgeZ = this.terrain.halfL - 1;
      if (Math.abs(pos.x) > edgeX + 30 || Math.abs(pos.z) > edgeZ + 30 || pos.y < this.terrain.heightAt(pos.x, pos.z) - 25) {
        this.respawn();
      }
    }

    if (this.level === 'race' && this.phase === 'play') {
      const cps = raceCheckpoints();
      if (this.myCp < cps.length) {
        const cp = cps[this.myCp];
        // forgiving progress check; flying through the ring itself earns boost
        if (pos.z < cp.z && Math.abs(pos.x - cp.x) < 70) {
          const precise = Math.abs(pos.x - cp.x) < 14;
          this.myCp++;
          this.net.send({ t: 'checkpoint', index: this.myCp });
          this.audio.checkpoint();
          if (cp.boost && precise) {
            this.vehicle.boostMeter = Math.min(100, this.vehicle.boostMeter + 55);
            this.hud.trickPopup('⚡ BOOST GATE +55');
          }
        }
      } else if (!this.myFinish && pos.z < RACE_FINISH_Z) {
        this.myFinish = performance.now() - this.playStart;
        this.net.send({ t: 'finish', timeMs: this.myFinish });
        this.hud.banner('FINISH!', 3000, '#7dffa0');
        this.hud.subBanner(`${(this.myFinish / 1000).toFixed(2)}s`, 3000);
        this.audio.trickChime(true);
      }
      // wrong way detection (the course always descends -z)
      if (!this.myFinish && this.vehicle.body.velocity.z > 8) this.wrongWayTimer += dt;
      else this.wrongWayTimer = 0;
      if (this.wrongWayTimer > 1.2 && performance.now() - this.wrongWayShown > 2500) {
        this.wrongWayShown = performance.now();
        this.hud.subBanner('⟲ WRONG WAY — turn around!', 2000);
      }
      // gate highlighting
      for (const gate of this.built.gates) {
        gate.mat.emissiveIntensity = gate.index === this.myCp ? 1.6 + Math.sin(performance.now() * 0.008) * 0.7 : gate.index < this.myCp ? 0.15 : 0.6;
      }
    }

    // tricks
    const landed = this.vehicle.justLanded;
    if (landed && landed.points >= 20 && this.phase === 'play') {
      const total = landed.points;
      this.hud.trickPopup(`${landed.label}<br>+${total}`);
      this.audio.trickChime(total > 200);
      this.vehicle.boostMeter = Math.min(100, this.vehicle.boostMeter + total * 0.1);
      if (this.level === 'pipe') {
        this.myScore += total;
        this.net.send({ t: 'trick', points: total, label: landed.label });
      }
    }
    if (this.vehicle.landImpact > 8) {
      this.shake.add(Math.min(0.5, this.vehicle.landImpact * 0.03));
      this.audio.landThud(this.vehicle.landImpact);
      const down = this.vehicle.mesh.position.clone();
      down.y -= 0.5;
      this.snowFx.burst(down, 7, 30, 0.9);
      this.vehicle.landImpact = 0;
    }

    // countdown display
    if (this.phase === 'countdown') {
      const n = Math.ceil(this.clock);
      if (n !== this.lastCountdownShown && n > 0) {
        this.lastCountdownShown = n;
        this.hud.banner(String(n), 800);
        this.audio.countdownBeep();
      }
    }
  }

  // ---------- hazards & collectibles ----------

  /** Giant snowballs that chase you down Glacier Run. */
  private updateBoulders(dt: number): void {
    if (this.level !== 'race' || !this.terrain) return;
    if (this.phase !== 'play') {
      for (const b of this.boulders) {
        this.scene.remove(b.mesh);
        this.world.removeBody(b.body);
      }
      this.boulders = [];
      this.boulderTimer = 4;
      return;
    }

    this.boulderTimer -= dt;
    const myZ = this.vehicle.body.position.z;
    if (this.boulderTimer <= 0 && this.boulders.length < 6 && !this.myFinish) {
      this.boulderTimer = 4 + Math.random() * 4;
      const r = 1.6 + Math.random() * 1.4;
      const z = myZ + 70 + Math.random() * 40; // uphill, behind the player
      const x = racePathX(z) + (Math.random() - 0.5) * 34;
      const body = new CANNON.Body({
        mass: 300 * r,
        material: new CANNON.Material({ friction: 0.25, restitution: 0.3 }),
        angularDamping: 0.05,
        linearDamping: 0.02
      });
      body.addShape(new CANNON.Sphere(r));
      body.position.set(x, this.terrain.heightAt(x, z) + r + 1, z);
      body.velocity.set(0, 0, -26 - Math.random() * 10);
      body.angularVelocity.set((26 + Math.random() * 10) / r, 0, 0);
      this.world.addBody(body);
      const mesh = new THREE.Mesh(
        new THREE.IcosahedronGeometry(r, 1),
        new THREE.MeshStandardMaterial({ color: 0xf0f7fd, roughness: 0.9, flatShading: true })
      );
      mesh.castShadow = true;
      this.scene.add(mesh);
      this.boulders.push({ body, mesh });
      body.addEventListener('collide', (e: { body: CANNON.Body; contact: CANNON.ContactEquation }) => {
        if (e.body === this.vehicle.body) {
          const impact = Math.abs(e.contact.getImpactVelocityAlongNormal());
          this.shake.add(Math.min(0.8, impact * 0.05));
          this.audio.landThud(impact);
          this.snowFx.burst(mesh.position.clone(), 9, 40, 1);
        }
      });
      if (!this.avalancheWarned) {
        this.avalancheWarned = true;
        this.hud.feed('⚠️ AVALANCHE! Watch your six!', '#ff8a65');
        this.audio.horn();
      }
    }

    for (let i = this.boulders.length - 1; i >= 0; i--) {
      const b = this.boulders[i];
      b.mesh.position.copy(b.body.position as unknown as THREE.Vector3);
      b.mesh.quaternion.copy(b.body.quaternion as unknown as THREE.Quaternion);
      // emit a powder trail while rolling fast
      if (b.body.velocity.length() > 10 && Math.random() < 0.3) {
        this.snowFx.emit(b.mesh.position.clone(), new THREE.Vector3(0, 2, 0), 2, 0.7, 1);
      }
      const gone = b.body.position.z < myZ - 220 || b.body.velocity.length() < 2 || b.body.position.y < -100;
      if (gone) {
        this.scene.remove(b.mesh);
        this.world.removeBody(b.body);
        this.boulders.splice(i, 1);
      }
    }
  }

  /** Floating bonus stars over the halfpipe walls. */
  private buildStars(): void {
    const rng = mulberry32(777);
    const starGeo = new THREE.OctahedronGeometry(1.1);
    const starMat = new THREE.MeshStandardMaterial({ color: 0xffd84d, emissive: 0xffc107, emissiveIntensity: 1.1 });
    for (let z = -100; z <= 100; z += 12) {
      const side = rng() > 0.5 ? 1 : -1;
      const x = side * (7 + rng() * 7);
      const y = this.terrain!.heightAt(x, z) + 3.5 + rng() * 4;
      const mesh = new THREE.Mesh(starGeo, starMat.clone());
      mesh.position.set(x, y, z);
      this.scene.add(mesh);
      const star = { mesh, taken: false };
      this.stars.push(star);
      this.built.animated.push((t) => {
        mesh.rotation.y = t * 2 + z;
        mesh.position.y = y + Math.sin(t * 2.2 + z) * 0.4;
      });
    }
  }

  private updateStars(): void {
    if (this.stars.length === 0) return;
    const pos = this.vehicle.body.position;
    for (const star of this.stars) {
      if (star.taken) continue;
      const d = star.mesh.position.distanceTo(new THREE.Vector3(pos.x, pos.y, pos.z));
      if (d < 3) {
        star.taken = true;
        star.mesh.visible = false;
        this.myScore += 50;
        this.vehicle.boostMeter = Math.min(100, this.vehicle.boostMeter + 25);
        this.net.send({ t: 'trick', points: 50, label: 'STAR' });
        this.audio.trickChime(false);
        this.sparkFx.burst(star.mesh.position.clone(), 8, 25, 0.8);
      }
    }
  }

  private resetStars(): void {
    for (const star of this.stars) {
      star.taken = false;
      star.mesh.visible = true;
    }
  }

  private updateEffects(dt: number, t: number): void {
    const v = this.vehicle;
    const pos = v.mesh.position;

    if (v.boosting) {
      for (const sx of [-0.5, 0.5]) {
        const nozzle = new THREE.Vector3(sx, 0.15, -CHASSIS_LENGTH * 0.48).applyQuaternion(v.mesh.quaternion).add(pos);
        const backVel = v.forward();
        this.boostFx.emit(nozzle, new THREE.Vector3(-backVel.x * 6, 1, -backVel.z * 6), 2.5, 0.45, 3);
      }
    }
    if (v.grounded && (v.drifting || (Math.abs(this.input.steer) > 0 && v.speed > 14))) {
      const rear = new THREE.Vector3(0, -0.4, -CHASSIS_LENGTH * 0.4).applyQuaternion(v.mesh.quaternion).add(pos);
      this.snowFx.emit(rear, new THREE.Vector3(0, 2.5, 0), 3.5, 0.8, v.drifting ? 5 : 2);
    }

    this.snowFx.update(dt);
    this.boostFx.update(dt);
    this.sparkFx.update(dt);
    this.snowfall(this.camPos, dt);
    for (const fn of this.built.animated) fn(t, dt);

    // keep the sun shadow box on the player
    this.sun.position.set(pos.x + 80, pos.y + 140, pos.z + 60);
    this.sun.target.position.copy(pos);
  }

  private camDir = new THREE.Vector3(0, 0, 1);

  private updateCamera(dt: number): void {
    const v = this.vehicle;
    const pos = v.mesh.position;

    // follow direction: horizontal velocity when moving, else horizontal facing
    const vel = v.body.velocity;
    const hSpeed = Math.hypot(vel.x, vel.z);
    const f = v.forward();
    const target = new THREE.Vector3();
    if (hSpeed > 6) target.set(vel.x / hSpeed, 0, vel.z / hSpeed);
    else if (Math.hypot(f.x, f.z) > 0.2) target.set(f.x, 0, f.z).normalize();
    else target.copy(this.camDir);
    this.camDir.lerp(target, Math.min(1, 5 * dt)).normalize();
    const fwd = this.camDir;

    const dist = 10 + v.speed * 0.06;
    const desired = new THREE.Vector3(pos.x - fwd.x * dist, pos.y + 4.2, pos.z - fwd.z * dist);
    const k = 1 - Math.exp(-6 * dt);
    this.camPos.lerp(desired, k);
    // never go below the terrain
    if (this.terrain) {
      const floor = this.terrain.heightAt(this.camPos.x, this.camPos.z) + 1.5;
      if (this.camPos.y < floor) this.camPos.y = floor;
    } else if (this.camPos.y < 1.2) {
      this.camPos.y = 1.2;
    }

    const offset = this.shake.update(dt);
    this.camera.position.copy(this.camPos).add(offset);
    const look = new THREE.Vector3(pos.x + fwd.x * 6, pos.y + 1.4, pos.z + fwd.z * 6);
    this.camera.lookAt(look);

    const targetFov = v.boosting ? 84 : 72;
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, 8 * dt);
    this.camera.updateProjectionMatrix();
  }

  private updateHud(): void {
    this.hud.setSpeed(this.vehicle.speed * 3.6);
    this.hud.setBoost(this.vehicle.boostMeter / 100);
    this.hud.setClock(this.clock);
    this.hud.setScore(this.score);
    this.hud.setPing(this.net.latency);

    if (this.level === 'race') {
      if (this.myFinish) {
        this.hud.setRacePos(`FINISHED — ${(this.myFinish / 1000).toFixed(2)}s`);
      } else {
        let ahead = 0;
        let total = 1;
        for (const r of this.remotes.values()) {
          const s = r.lastState;
          if (!s) continue;
          total++;
          const theirCp = s.cp ?? 0;
          if (s.finish || theirCp > this.myCp || (theirCp === this.myCp && s.p[2] < this.vehicle.body.position.z)) ahead++;
        }
        this.hud.setRacePos(`POS ${ahead + 1}/${total} · CP ${this.myCp}/${raceCheckpoints().length}`);
      }
    } else if (this.level === 'pipe') {
      this.hud.setRacePos(`SCORE ${this.myScore}`);
    } else {
      this.hud.setRacePos('');
    }

    // leaderboard
    const show = this.input.down('Tab') || this.phase === 'end';
    if (show) {
      const rows: { name: string; team: number; value: string; me: boolean; bot: boolean }[] = [];
      const me = { id: this.net.myId, cp: this.myCp, score: this.myScore, finish: this.myFinish };
      const all: { info: PlayerInfo; state?: PlayerState }[] = [];
      for (const [id, info] of this.players) {
        if (id === this.net.myId) continue;
        all.push({ info, state: this.remotes.get(id)?.lastState });
      }
      const myInfo: PlayerInfo = { id: me.id, name: this.myName, team: this.myTeam, bot: false };
      all.push({
        info: myInfo,
        state: { id: me.id, p: [0, 0, 0], q: [0, 0, 0, 1], v: [0, 0, 0], boost: false, cp: me.cp, score: me.score, finish: me.finish || undefined }
      });
      const metric = (s?: PlayerState) => (this.level === 'race' ? (s?.finish ? 1e9 - s.finish / 1000 : (s?.cp ?? 0)) : (s?.score ?? 0));
      all.sort((a, b) => metric(b.state) - metric(a.state));
      for (const e of all) {
        const s = e.state;
        let value: string;
        if (this.level === 'race') value = s?.finish ? `${(s.finish / 1000).toFixed(2)}s` : `CP ${s?.cp ?? 0}`;
        else if (this.level === 'pipe') value = `${s?.score ?? 0} pts`;
        else value = `${s?.score ?? 0} ⚽`;
        rows.push({ name: e.info.name, team: e.info.team, value, me: e.info.id === this.net.myId, bot: e.info.bot });
      }
      const title = this.level === 'arena' ? 'AVALANCHE ARENA' : this.level === 'race' ? 'GLACIER RUN' : 'HALFPIPE HEAVEN';
      this.hud.showLeaderboard(rows, title, true);
    } else {
      this.hud.showLeaderboard([], '', false);
    }
  }

  private handleKeys(): void {
    if (this.input.justPressed('KeyR')) this.respawn();
    if (this.input.justPressed('KeyM')) this.audio.toggleMute();
    if (this.input.justPressed('KeyH')) {
      this.net.send({ t: 'horn' });
      this.audio.horn();
    }
  }
}

function makeLabel(name: string, bot: boolean): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.font = 'bold 34px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  const text = bot ? `🤖 ${name}` : name;
  const w = ctx.measureText(text).width + 24;
  ctx.beginPath();
  ctx.roundRect(128 - w / 2, 8, w, 48, 10);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.fillText(text, 128, 43);
  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sprite.scale.set(4.2, 1.05, 1);
  return sprite;
}
