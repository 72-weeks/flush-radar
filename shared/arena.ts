// Avalanche Arena layout — used by the client (visuals + local collision)
// and the server (authoritative puck physics).

export interface ArenaBox {
  pos: [number, number, number];
  size: [number, number, number]; // full extents
  euler?: [number, number, number];
  kind: 'wall' | 'ramp' | 'glass';
}

export const RINK_LENGTH = 110; // along z
export const RINK_WIDTH = 64; // along x
export const WALL_HEIGHT = 3.2;
export const GOAL_WIDTH = 14;
export const GOAL_DEPTH = 5;
export const GOAL_HEIGHT = 4.2;

const L = RINK_LENGTH;
const W = RINK_WIDTH;
const H = WALL_HEIGHT;
const T = 1.2; // wall thickness
const G = GOAL_WIDTH;
const D = GOAL_DEPTH;

export function arenaBoxes(): ArenaBox[] {
  const boxes: ArenaBox[] = [];
  const corner = 14; // corner cut length

  // Side walls (full length, corners cut visually by diagonal walls)
  for (const sx of [-1, 1]) {
    boxes.push({
      pos: [sx * (W / 2 + T / 2), H / 2, 0],
      size: [T, H, L - corner],
      kind: 'wall'
    });
  }

  // End walls, split around the goal mouth
  const segW = (W - G) / 2 - corner / 2;
  for (const sz of [-1, 1]) {
    for (const sx of [-1, 1]) {
      boxes.push({
        pos: [sx * (G / 2 + segW / 2 + corner / 2), H / 2, sz * (L / 2 + T / 2)],
        size: [segW, H, T],
        kind: 'wall'
      });
    }
  }

  // Diagonal corner walls
  const cLen = corner * Math.SQRT2;
  for (const sz of [-1, 1]) {
    for (const sx of [-1, 1]) {
      boxes.push({
        pos: [sx * (W / 2 - corner / 4), H / 2, sz * (L / 2 - corner / 4)],
        size: [cLen * 0.75, H, T],
        euler: [0, sx * sz * Math.PI / 4, 0],
        kind: 'wall'
      });
    }
  }

  // Goal boxes (back wall, two sides, roof)
  for (const sz of [-1, 1]) {
    boxes.push({
      pos: [0, GOAL_HEIGHT / 2, sz * (L / 2 + D + T / 2)],
      size: [G + 2 * T, GOAL_HEIGHT, T],
      kind: 'wall'
    });
    for (const sx of [-1, 1]) {
      boxes.push({
        pos: [sx * (G / 2 + T / 2), GOAL_HEIGHT / 2, sz * (L / 2 + D / 2)],
        size: [T, GOAL_HEIGHT, D],
        kind: 'wall'
      });
    }
    boxes.push({
      pos: [0, GOAL_HEIGHT + T / 2, sz * (L / 2 + D / 2)],
      size: [G + 2 * T, T, D + T],
      kind: 'glass'
    });
  }

  // Side ramps — launch off the walls for aerial plays
  const rampLen = 14;
  const rampW = 7;
  for (const sx of [-1, 1]) {
    for (const z of [-L / 4, L / 4]) {
      boxes.push({
        pos: [sx * (W / 2 - rampW / 2 - 0.3), 0.9, z],
        size: [rampW, 0.5, rampLen],
        euler: [0, 0, sx * 0.34],
        kind: 'ramp'
      });
    }
  }

  return boxes;
}

// Goal trigger volumes: puck fully inside scores for the attacking team.
// Goal at -z is defended by team 0 (so team 1 scores there).
export function goalVolumes(): { team: number; min: [number, number, number]; max: [number, number, number] }[] {
  return [
    { team: 1, min: [-G / 2, 0, -(L / 2 + D)], max: [G / 2, GOAL_HEIGHT, -(L / 2 + 1.0)] },
    { team: 0, min: [-G / 2, 0, L / 2 + 1.0], max: [G / 2, GOAL_HEIGHT, L / 2 + D] }
  ];
}

export function boostPads(): [number, number, number][] {
  const pads: [number, number, number][] = [];
  for (const sx of [-1, 0, 1]) {
    for (const sz of [-1, 1]) {
      pads.push([sx * (W / 3), 0.1, sz * (L / 3)]);
    }
  }
  pads.push([-W / 2 + 6, 0.1, 0], [W / 2 - 6, 0.1, 0]);
  return pads;
}

export function arenaSpawn(team: number, slot: number): { pos: [number, number, number]; yaw: number } {
  const side = team === 0 ? -1 : 1;
  const x = (slot - 1) * 12;
  return { pos: [x, 1.5, side * L * 0.3], yaw: side === -1 ? 0 : Math.PI };
}

export function puckSpawn(): [number, number, number] {
  return [0, 3, 0];
}
