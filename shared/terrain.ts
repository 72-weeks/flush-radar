// Procedural terrain for Glacier Run (downhill race) and Halfpipe Heaven.
// Heightfields are generated identically on client and server from a seed.

import { fbm } from './rng';

export interface Terrain {
  nx: number; // grid points across (x)
  nz: number; // grid points along (z)
  cell: number; // meters between grid points
  halfW: number;
  halfL: number;
  heights: number[][]; // heights[ix][iz], world x = -halfW + ix*cell, world z = halfL - iz*cell
  heightAt(x: number, z: number): number;
}

function buildTerrain(nx: number, nz: number, cell: number, fn: (x: number, z: number) => number): Terrain {
  const halfW = ((nx - 1) * cell) / 2;
  const halfL = ((nz - 1) * cell) / 2;
  const heights: number[][] = [];
  for (let ix = 0; ix < nx; ix++) {
    const col: number[] = [];
    const x = -halfW + ix * cell;
    for (let iz = 0; iz < nz; iz++) {
      const z = halfL - iz * cell;
      col.push(fn(x, z));
    }
    heights.push(col);
  }
  function heightAt(x: number, z: number): number {
    const fx = (x + halfW) / cell;
    const fz = (halfL - z) / cell;
    const ix = Math.max(0, Math.min(nx - 2, Math.floor(fx)));
    const iz = Math.max(0, Math.min(nz - 2, Math.floor(fz)));
    const tx = Math.max(0, Math.min(1, fx - ix));
    const tz = Math.max(0, Math.min(1, fz - iz));
    const a = heights[ix][iz];
    const b = heights[ix + 1][iz];
    const c = heights[ix][iz + 1];
    const d = heights[ix + 1][iz + 1];
    return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
  }
  return { nx, nz, cell, halfW, halfL, heights, heightAt };
}

// ---------- Glacier Run ----------

export const RACE_LENGTH = 960; // meters along z, start at +z (top), finish at -z
export const RACE_WIDTH = 168;
export const RACE_DROP = 150;

/** Course centerline x for a given z. */
export function racePathX(z: number): number {
  return 34 * Math.sin(z * 0.011) + 18 * Math.sin(z * 0.0047 + 1.7);
}

export function raceTerrain(seed: number): Terrain {
  const cell = 3;
  const nx = Math.round(RACE_WIDTH / cell) + 1;
  const nz = Math.round(RACE_LENGTH / cell) + 1;
  const slope = RACE_DROP / RACE_LENGTH;

  // Kicker (jump) positions along the course
  const kickers: number[] = [];
  for (let z = RACE_LENGTH / 2 - 140; z > -RACE_LENGTH / 2 + 80; z -= 130) {
    kickers.push(z);
  }

  return buildTerrain(nx, nz, cell, (x, z) => {
    let h = slope * z; // base downhill
    const dx = x - racePathX(z);
    // Banked valley walls keep you on course
    const half = 26;
    const lat = Math.abs(dx) / half;
    h += Math.pow(Math.min(lat, 2.6), 2.2) * 9;
    // Rolling bumps on the course, bigger chaos outside it
    h += fbm(x * 0.02, z * 0.02, 3, seed) * 3.0;
    h += Math.max(0, lat - 1) * fbm(x * 0.05, z * 0.05, 2, seed + 7) * 10;
    // Kickers: ridge across the channel -> jumps
    for (const kz of kickers) {
      const dz = z - kz;
      if (Math.abs(dz) < 14 && lat < 1.1) {
        // asymmetric: gentle uphill approach (downhill side), steep lip
        const s = dz > 0 ? 5.5 : 3.0;
        h += 4.2 * Math.exp(-(dz * dz) / (2 * s * s)) * (1 - Math.min(1, lat));
      }
    }
    return h;
  });
}

export interface Checkpoint {
  x: number;
  z: number;
  boost: boolean;
}

export function raceCheckpoints(): Checkpoint[] {
  const cps: Checkpoint[] = [];
  let i = 0;
  for (let z = RACE_LENGTH / 2 - 100; z > -RACE_LENGTH / 2 + 50; z -= 85) {
    cps.push({ x: racePathX(z), z, boost: i % 2 === 1 });
    i++;
  }
  return cps;
}

export const RACE_FINISH_Z = -RACE_LENGTH / 2 + 30;

export function raceSpawn(slot: number): { pos: [number, number, number]; yaw: number } {
  const z = RACE_LENGTH / 2 - 30;
  const x = racePathX(z) + (slot - 1.5) * 6;
  return { pos: [x, 0, z], yaw: Math.PI }; // facing -z (downhill)
}

// ---------- Halfpipe Heaven ----------

export const PIPE_LENGTH = 240;
export const PIPE_RADIUS = 15;
export const PIPE_SLOPE = 0.09;

export function pipeTerrain(seed: number): Terrain {
  const cell = 1.5;
  const width = PIPE_RADIUS * 2 + 36;
  const nx = Math.round(width / cell) + 1;
  const nz = Math.round((PIPE_LENGTH + 60) / cell) + 1;
  const R = PIPE_RADIUS;

  return buildTerrain(nx, nz, cell, (x, z) => {
    let h = PIPE_SLOPE * z;
    const ax = Math.abs(x);
    if (ax < R) {
      // half-cylinder cross section
      h += R - Math.sqrt(Math.max(0, R * R - x * x));
    } else {
      // deck beyond the coping
      h += R + Math.min(6, (ax - R) * 0.8);
    }
    // closed, ramped ends
    const endDist = PIPE_LENGTH / 2 - Math.abs(z);
    if (endDist < 0) h += Math.min(14, -endDist * 0.9);
    h += fbm(x * 0.05, z * 0.05, 2, seed) * 0.3;
    return h;
  });
}

export function pipeSpawn(slot: number): { pos: [number, number, number]; yaw: number } {
  const z = PIPE_LENGTH / 2 - 14 - (slot % 3) * 8;
  return { pos: [(slot % 2 === 0 ? -1 : 1) * 3, 0, z], yaw: Math.PI };
}
