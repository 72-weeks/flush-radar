// A Room hosts one match: players, bots, phases, scoring, snapshots.

import type { WebSocket } from 'ws';
import {
  ARENA_MATCH_SECONDS,
  ARENA_TEAM_SIZE,
  COUNTDOWN_SECONDS,
  END_SCREEN_SECONDS,
  GOAL_PAUSE_SECONDS,
  MAX_PLAYERS_PER_ROOM,
  PIPE_SESSION_SECONDS,
  RACE_BOTS,
  RACE_MAX_SECONDS,
  SNAPSHOT_HZ,
  type LevelId
} from '../shared/constants';
import { arenaSpawn } from '../shared/arena';
import { raceTerrain, type Terrain } from '../shared/terrain';
import {
  encode,
  type C2S,
  type Phase,
  type PlayerInfo,
  type PlayerState,
  type Q4,
  type S2C,
  type V3
} from '../shared/protocol';
import { ArenaSim } from './arenaSim';
import { makeBot, stepArenaBot, stepRaceBot, botState, type Bot } from './bots';

interface Client {
  id: number;
  name: string;
  team: number;
  ws: WebSocket;
  state: { p: V3; q: Q4; v: V3; boost: boolean } | null;
  cp: number;
  score: number;
  finish: number; // ms, 0 = not finished
}

let nextClientId = 1;

export class Room {
  level: LevelId;
  seed: number;
  clients = new Map<number, Client>();
  bots: Bot[] = [];
  phase: Phase = 'waiting';
  clock = 0;
  matchRemain = 0;
  score: [number, number] = [0, 0];
  sim: ArenaSim | null = null;
  terrain: Terrain | null = null;
  playStartMs = 0;

  private snapAccum = 0;

  constructor(level: LevelId) {
    this.level = level;
    this.seed = (Math.random() * 0xffffffff) >>> 0;
    if (level === 'arena') this.sim = new ArenaSim();
    if (level === 'race') this.terrain = raceTerrain(this.seed);
    this.balanceBots();
  }

  get humanCount(): number {
    return this.clients.size;
  }

  // ---- membership ----

  addClient(ws: WebSocket, name: string): Client {
    const team = this.level === 'arena' ? this.pickTeam() : -1;
    const client: Client = {
      id: nextClientId++,
      name: name.slice(0, 14) || 'PLAYER',
      team,
      ws,
      state: null,
      cp: 0,
      score: 0,
      finish: 0
    };
    this.clients.set(client.id, client);
    this.sim?.addPlayer(client.id);
    this.balanceBots();

    ws.send(
      encode({
        t: 'welcome',
        id: client.id,
        level: this.level,
        seed: this.seed,
        players: this.playerInfos(),
        phase: this.phase,
        clock: this.clock,
        score: this.score
      })
    );
    this.broadcast(
      { t: 'playerJoin', player: { id: client.id, name: client.name, team, bot: false } },
      client.id
    );
    // first human into an idle room gets a fresh match
    if (this.clients.size === 1 && this.phase !== 'waiting' && this.phase !== 'countdown') {
      this.startCountdown();
    }
    return client;
  }

  removeClient(id: number): void {
    if (!this.clients.has(id)) return;
    this.clients.delete(id);
    this.sim?.removePlayer(id);
    this.balanceBots();
    this.broadcast({ t: 'playerLeave', id });
  }

  private pickTeam(): number {
    let t0 = 0;
    let t1 = 0;
    for (const c of this.clients.values()) {
      if (c.team === 0) t0++;
      else if (c.team === 1) t1++;
    }
    return t0 <= t1 ? 0 : 1;
  }

  /** Keep teams filled with bots (arena) or a fixed bot field (race). */
  private balanceBots(): void {
    const before = this.bots.map((b) => b.id);
    if (this.level === 'arena') {
      for (const team of [0, 1]) {
        const humans = [...this.clients.values()].filter((c) => c.team === team).length;
        let bots = this.bots.filter((b) => b.team === team);
        while (humans + bots.length > ARENA_TEAM_SIZE && bots.length > 0) {
          const gone = bots.pop()!;
          this.bots = this.bots.filter((b) => b.id !== gone.id);
          this.sim?.removePlayer(gone.id);
        }
        while (humans + bots.length < ARENA_TEAM_SIZE) {
          const bot = makeBot(team, bots.length === 0 ? 'defend' : 'attack');
          this.respawnBot(bot, humans + bots.length);
          this.bots.push(bot);
          this.sim?.addPlayer(bot.id);
          bots = this.bots.filter((b) => b.team === team);
        }
      }
    } else if (this.level === 'race') {
      while (this.bots.length < RACE_BOTS) {
        const bot = makeBot(-1, 'attack');
        bot.speed = 17 + this.bots.length * 3 + Math.random() * 3;
        bot.baseSpeed = bot.speed;
        this.respawnBot(bot, this.bots.length);
        this.bots.push(bot);
      }
    }
    // announce bot roster changes
    for (const b of this.bots) {
      if (!before.includes(b.id)) {
        this.broadcast({ t: 'playerJoin', player: { id: b.id, name: b.name, team: b.team, bot: true } });
      }
    }
    for (const id of before) {
      if (!this.bots.some((b) => b.id === id)) this.broadcast({ t: 'playerLeave', id });
    }
  }

  private respawnBot(bot: Bot, slot: number): void {
    bot.vel = [0, 0, 0];
    bot.cp = 0;
    bot.finish = 0;
    if (this.level === 'arena') {
      const s = arenaSpawn(bot.team, slot);
      bot.pos = [s.pos[0], 0.9, s.pos[2]];
      bot.yaw = s.yaw;
    } else if (this.level === 'race' && this.terrain) {
      const z = 450 - slot * 5;
      const x = (slot - 1.5) * 7;
      bot.pos = [x, this.terrain.heightAt(x, z) + 0.9, z];
      bot.yaw = Math.PI;
    }
  }

  // ---- messages ----

  onMessage(client: Client, msg: C2S): void {
    switch (msg.t) {
      case 'state':
        client.state = { p: msg.p, q: msg.q, v: msg.v, boost: msg.boost };
        this.sim?.updatePlayer(client.id, msg.p, msg.q, msg.v);
        break;
      case 'checkpoint':
        client.cp = Math.max(client.cp, msg.index);
        break;
      case 'finish':
        if (!client.finish && this.phase === 'play') {
          client.finish = Date.now() - this.playStartMs;
          if ([...this.clients.values()].every((c) => c.finish > 0)) {
            this.endRace();
          }
        }
        break;
      case 'trick':
        if (typeof msg.points === 'number' && msg.points > 0 && msg.points < 50000) {
          if (this.level === 'pipe') client.score += msg.points;
          this.broadcast({ t: 'trick', id: client.id, points: msg.points, label: String(msg.label).slice(0, 40) });
        }
        break;
      case 'horn':
        this.broadcast({ t: 'horn', id: client.id });
        break;
      case 'ping':
        client.ws.send(encode({ t: 'pong', ts: msg.ts }));
        break;
    }
  }

  // ---- simulation ----

  tick(dt: number): void {
    this.tickPhase(dt);

    if (this.phase === 'play' || this.phase === 'goalpause') {
      const elapsed = Date.now() - this.playStartMs;
      for (const bot of this.bots) {
        if (this.level === 'arena' && this.sim) {
          // rubber-banding: trailing team's bots speed up, leaders ease off
          const deficit = this.score[1 - bot.team] - this.score[bot.team];
          bot.speed = Math.min(31, Math.max(bot.baseSpeed - 2, bot.baseSpeed + deficit * 1.3));
          if (this.phase === 'play') stepArenaBot(bot, this.sim.puckState().p, dt);
          this.sim.updatePlayer(bot.id, [...bot.pos] as V3, [0, Math.sin(bot.yaw / 2), 0, Math.cos(bot.yaw / 2)], [
            ...bot.vel
          ] as V3);
        } else if (this.level === 'race' && this.terrain && this.phase === 'play') {
          stepRaceBot(bot, this.terrain, dt, elapsed);
        }
      }
      if (this.sim && this.phase === 'play') {
        this.sim.step(dt);
        const team = this.sim.checkGoal();
        if (team >= 0) this.onGoal(team);
      }
    }

    this.snapAccum += dt;
    if (this.snapAccum >= 1 / SNAPSHOT_HZ) {
      this.snapAccum = 0;
      this.broadcastSnapshot();
    }
  }

  private tickPhase(dt: number): void {
    if (this.phase === 'waiting') {
      if (this.humanCount > 0) this.startCountdown();
      return;
    }
    this.clock -= dt;
    if (this.clock > 0) return;

    switch (this.phase) {
      case 'countdown':
        this.playStartMs = Date.now();
        this.setPhase('play', this.matchRemain || this.matchSeconds());
        this.matchRemain = 0;
        break;
      case 'goalpause':
        this.sim?.resetPuck();
        this.resetAllBots();
        this.setPhase('play', this.matchRemain);
        break;
      case 'play':
        if (this.level === 'race') this.endRace();
        else this.setPhase('end', END_SCREEN_SECONDS);
        break;
      case 'end':
        if (this.humanCount > 0) this.startCountdown();
        else this.setPhase('waiting', 0);
        break;
    }
  }

  private matchSeconds(): number {
    return this.level === 'arena' ? ARENA_MATCH_SECONDS : this.level === 'race' ? RACE_MAX_SECONDS : PIPE_SESSION_SECONDS;
  }

  private startCountdown(): void {
    this.score = [0, 0];
    this.matchRemain = 0;
    this.sim?.resetPuck();
    for (const c of this.clients.values()) {
      c.cp = 0;
      c.score = 0;
      c.finish = 0;
    }
    this.resetAllBots();
    this.setPhase('countdown', COUNTDOWN_SECONDS);
  }

  private resetAllBots(): void {
    let slot = 0;
    for (const bot of this.bots) this.respawnBot(bot, slot++ % 3);
  }

  private setPhase(phase: Phase, clock: number): void {
    this.phase = phase;
    this.clock = clock;
    this.broadcast({ t: 'phase', phase, clock });
  }

  private onGoal(team: number): void {
    if (!this.sim) return;
    this.score[team]++;
    const scorer = this.sim.lastToucher;
    const scorerClient = this.clients.get(scorer);
    if (scorerClient) scorerClient.score++;
    const scorerBot = this.bots.find((b) => b.id === scorer);
    if (scorerBot) scorerBot.score++;
    this.broadcast({ t: 'goal', team, scorerId: scorer, score: this.score });
    this.matchRemain = Math.max(5, this.clock);
    this.setPhase('goalpause', GOAL_PAUSE_SECONDS);
    // park the puck far away during the pause so no double goals fire
    this.sim.puck.position.set(0, 200, 0);
    this.sim.puck.velocity.setZero();
  }

  private endRace(): void {
    const standings: { id: number; timeMs: number }[] = [];
    for (const c of this.clients.values()) if (c.finish) standings.push({ id: c.id, timeMs: c.finish });
    for (const b of this.bots) if (b.finish) standings.push({ id: b.id, timeMs: b.finish });
    standings.sort((a, b) => a.timeMs - b.timeMs);
    this.broadcast({ t: 'raceEnd', standings });
    this.setPhase('end', END_SCREEN_SECONDS);
  }

  // ---- output ----

  private playerInfos(): PlayerInfo[] {
    const infos: PlayerInfo[] = [];
    for (const c of this.clients.values()) infos.push({ id: c.id, name: c.name, team: c.team, bot: false });
    for (const b of this.bots) infos.push({ id: b.id, name: b.name, team: b.team, bot: true });
    return infos;
  }

  private broadcastSnapshot(): void {
    const players: PlayerState[] = [];
    for (const c of this.clients.values()) {
      if (!c.state) continue;
      players.push({
        id: c.id,
        p: c.state.p,
        q: c.state.q,
        v: c.state.v,
        boost: c.state.boost,
        cp: c.cp,
        score: c.score,
        finish: c.finish || undefined
      });
    }
    for (const b of this.bots) players.push(botState(b));
    const snap: S2C = {
      t: 'snap',
      players,
      puck: this.sim?.puckState(),
      clock: Math.max(0, this.clock),
      phase: this.phase,
      score: this.score
    };
    this.broadcast(snap);
  }

  broadcast(msg: S2C, exceptId?: number): void {
    const data = encode(msg);
    for (const c of this.clients.values()) {
      if (c.id === exceptId) continue;
      if (c.ws.readyState === c.ws.OPEN) c.ws.send(data);
    }
  }

  isFull(): boolean {
    return this.humanCount >= MAX_PLAYERS_PER_ROOM;
  }
}
