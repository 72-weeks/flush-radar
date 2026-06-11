// Server-side bots: kinematic steering agents (no full physics) that are
// fed into the arena sim / race standings exactly like remote players.

import { RINK_LENGTH, RINK_WIDTH } from '../shared/arena';
import type { PlayerState, V3 } from '../shared/protocol';
import { raceCheckpoints, RACE_FINISH_Z, type Terrain } from '../shared/terrain';

export const BOT_NAMES = ['YETI', 'ZAMBONI', 'MOOSE', 'POWDER', 'SLUSH', 'ICEBERG', 'WALRUS', 'BLIZZARD'];

export interface Bot {
  id: number;
  name: string;
  team: number;
  pos: V3;
  vel: V3;
  yaw: number;
  role: 'attack' | 'defend';
  speed: number; // current top speed (rubber-banded in arena)
  baseSpeed: number;
  cp: number;
  finish: number; // ms, 0 = not finished
  score: number;
}

let nextBotId = 1000;

export function makeBot(team: number, role: 'attack' | 'defend'): Bot {
  const id = nextBotId++;
  const speed = 20 + Math.random() * 5;
  return {
    id,
    name: BOT_NAMES[id % BOT_NAMES.length],
    team,
    pos: [0, 0.9, 0],
    vel: [0, 0, 0],
    yaw: 0,
    role,
    speed,
    baseSpeed: speed,
    cp: 0,
    finish: 0,
    score: 0
  };
}

function steer(bot: Bot, tx: number, tz: number, dt: number, accel: number): void {
  const dx = tx - bot.pos[0];
  const dz = tz - bot.pos[2];
  const dist = Math.hypot(dx, dz) || 1e-4;
  const desiredX = (dx / dist) * bot.speed;
  const desiredZ = (dz / dist) * bot.speed;
  bot.vel[0] += Math.max(-accel * dt, Math.min(accel * dt, desiredX - bot.vel[0]));
  bot.vel[2] += Math.max(-accel * dt, Math.min(accel * dt, desiredZ - bot.vel[2]));
  bot.pos[0] += bot.vel[0] * dt;
  bot.pos[2] += bot.vel[2] * dt;
  const sp = Math.hypot(bot.vel[0], bot.vel[2]);
  if (sp > 1.5) bot.yaw = Math.atan2(bot.vel[0], bot.vel[2]);
}

export function stepArenaBot(bot: Bot, puckPos: V3, dt: number): void {
  const enemyGoalZ = bot.team === 0 ? RINK_LENGTH / 2 : -RINK_LENGTH / 2;
  const ownGoalZ = -enemyGoalZ;

  let tx: number;
  let tz: number;
  if (bot.role === 'defend') {
    // hold a point between the puck and our goal
    tx = puckPos[0] * 0.45;
    tz = ownGoalZ * 0.62 + puckPos[2] * 0.3;
  } else {
    // aim for the point behind the puck (relative to the enemy goal) to push it in
    const gx = 0;
    const dx = puckPos[0] - gx;
    const dz = puckPos[2] - enemyGoalZ;
    const d = Math.hypot(dx, dz) || 1e-4;
    tx = puckPos[0] + (dx / d) * 3.2;
    tz = puckPos[2] + (dz / d) * 3.2;
    // if we're on the wrong side of the puck, swing wide
    const botToGoal = Math.sign(enemyGoalZ - bot.pos[2]);
    const puckToGoal = Math.sign(enemyGoalZ - puckPos[2]);
    if (botToGoal !== puckToGoal && Math.abs(bot.pos[2] - puckPos[2]) < 6) {
      tx += bot.pos[0] < puckPos[0] ? -9 : 9;
    }
  }
  steer(bot, tx, tz, dt, 24);
  bot.pos[0] = Math.max(-RINK_WIDTH / 2 + 3, Math.min(RINK_WIDTH / 2 - 3, bot.pos[0]));
  bot.pos[2] = Math.max(-RINK_LENGTH / 2 + 3, Math.min(RINK_LENGTH / 2 - 3, bot.pos[2]));
  bot.pos[1] = 0.9;
}

const cps = raceCheckpoints();

export function stepRaceBot(bot: Bot, terrain: Terrain, dt: number, elapsedMs: number): void {
  if (bot.finish) return;
  if (bot.cp < cps.length) {
    const cp = cps[bot.cp];
    steer(bot, cp.x + Math.sin(bot.id * 3.7) * 6, cp.z, dt, 14);
    if (bot.pos[2] < cp.z + 8) bot.cp++;
  } else {
    steer(bot, bot.pos[0], bot.pos[2] - 50, dt, 14);
    if (bot.pos[2] < RACE_FINISH_Z) bot.finish = elapsedMs;
  }
  bot.pos[1] = terrain.heightAt(bot.pos[0], bot.pos[2]) + 0.9;
}

export function botState(bot: Bot): PlayerState {
  return {
    id: bot.id,
    p: [...bot.pos] as V3,
    q: [0, Math.sin(bot.yaw / 2), 0, Math.cos(bot.yaw / 2)],
    v: [...bot.vel] as V3,
    boost: false,
    cp: bot.cp,
    score: bot.score,
    finish: bot.finish || undefined
  };
}
