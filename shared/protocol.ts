// WebSocket message protocol (JSON). c2s = client to server, s2c = server to client.

import type { LevelId } from './constants';

export type V3 = [number, number, number];
export type Q4 = [number, number, number, number];

export type Phase = 'waiting' | 'countdown' | 'play' | 'goalpause' | 'end';

export interface PlayerInfo {
  id: number;
  name: string;
  team: number; // 0 | 1 for arena, -1 otherwise
  bot: boolean;
}

export interface PlayerState {
  id: number;
  p: V3;
  q: Q4;
  v: V3;
  boost: boolean;
  // race / pipe extras
  cp?: number; // last checkpoint index
  score?: number; // trick score / goals scored
  finish?: number; // finish time ms (race)
}

export interface PuckState {
  p: V3;
  q: Q4;
  v: V3;
}

// ---- client -> server ----

export type C2S =
  | { t: 'join'; name: string; level: LevelId }
  | { t: 'state'; p: V3; q: Q4; v: V3; boost: boolean }
  | { t: 'checkpoint'; index: number }
  | { t: 'finish'; timeMs: number }
  | { t: 'trick'; points: number; label: string }
  | { t: 'horn' }
  | { t: 'chat'; i: number }
  | { t: 'ping'; ts: number };

export const QUICK_CHATS = [
  'NICE ONE! 👍',
  'OOPS… 🙈',
  'PASS IT! 🏒',
  'WHAT A SAVE! 🧤',
  "LET'S GO!! 🔥",
  'GG 🏁'
];

// ---- server -> client ----

export type S2C =
  | {
      t: 'welcome';
      id: number;
      level: LevelId;
      seed: number;
      players: PlayerInfo[];
      phase: Phase;
      clock: number;
      score: [number, number];
    }
  | { t: 'playerJoin'; player: PlayerInfo }
  | { t: 'playerLeave'; id: number }
  | {
      t: 'snap';
      players: PlayerState[];
      puck?: PuckState;
      clock: number;
      phase: Phase;
      score: [number, number];
    }
  | { t: 'goal'; team: number; scorerId: number; score: [number, number] }
  | { t: 'phase'; phase: Phase; clock: number }
  | { t: 'raceEnd'; standings: { id: number; timeMs: number }[] }
  | { t: 'trick'; id: number; points: number; label: string }
  | { t: 'horn'; id: number }
  | { t: 'chat'; id: number; i: number }
  | { t: 'pong'; ts: number };

export function encode(msg: C2S | S2C): string {
  return JSON.stringify(msg);
}

export function decode<T>(data: string): T | null {
  try {
    return JSON.parse(data) as T;
  } catch {
    return null;
  }
}
