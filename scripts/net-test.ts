// End-to-end server test: connect, join arena, ram the puck into a goal, verify events.

import WebSocket from 'ws';
import { decode, encode, type C2S, type S2C } from '../shared/protocol';

const url = 'ws://localhost:8080/ws';
let failures = 0;

function check(label: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label} ${detail}`);
  if (!ok) failures++;
}

function send(ws: WebSocket, msg: C2S): void {
  ws.send(encode(msg));
}

async function testArena(): Promise<void> {
  const ws = new WebSocket(url);
  await new Promise((r) => ws.on('open', r));
  send(ws, { t: 'join', name: 'TESTBOT', level: 'arena' });

  let myId = -1;
  let snaps = 0;
  let sawBots = false;
  let sawPuck = false;
  let sawGoal = false;
  let sawPlay = false;
  let puckMoved = false;
  let puckStart: [number, number, number] | null = null;
  let phase = 'waiting';
  let puck: [number, number, number] = [0, 0, 0];

  ws.on('message', (raw) => {
    const msg = decode<S2C>(raw.toString());
    if (!msg) return;
    if (msg.t === 'welcome') {
      myId = msg.id;
      check('welcome received', true, `id=${myId} level=${msg.level} players=${msg.players.length}`);
      sawBots = msg.players.filter((p) => p.bot).length >= 5;
      check('bots fill 3v3 (>=5 bots for 1 human)', sawBots, `bots=${msg.players.filter((p) => p.bot).length}`);
    }
    if (msg.t === 'snap') {
      snaps++;
      phase = msg.phase;
      if (msg.phase === 'play') sawPlay = true;
      if (msg.puck) {
        sawPuck = true;
        puck = msg.puck.p;
        if (!puckStart && msg.phase === 'play') puckStart = [...msg.puck.p];
        if (puckStart && Math.hypot(puck[0] - puckStart[0], puck[2] - puckStart[2]) > 3) puckMoved = true;
      }
    }
    if (msg.t === 'goal') {
      sawGoal = true;
      console.log(`INFO goal by #${msg.scorerId} for team ${msg.team}, score=${msg.score}`);
    }
  });

  // Drive a fake kinematic player: chase the puck and push it toward +z goal
  const pos: [number, number, number] = [0, 0.9, -20];
  const tick = setInterval(() => {
    if (phase === 'play') {
      // approach the puck from the -z side so contacts shove it toward +z
      const target = [puck[0], 0.9, puck[2] - 3.5];
      const dx = target[0] - pos[0];
      const dz = target[2] - pos[2];
      const d = Math.hypot(dx, dz) || 1e-4;
      const sp = 24;
      pos[0] += (dx / d) * sp * 0.05;
      pos[2] += (dz / d) * sp * 0.05;
      send(ws, { t: 'state', p: [...pos], q: [0, 0, 0, 1], v: [(dx / d) * sp, 0, (dz / d) * sp], boost: false });
    }
  }, 50);

  // wait up to 60s, finish as soon as a goal happens
  const start = Date.now();
  while (Date.now() - start < 60000 && !sawGoal) {
    await new Promise((r) => setTimeout(r, 500));
  }
  clearInterval(tick);

  check('snapshots streaming', snaps > 100, `snaps=${snaps}`);
  check('reached play phase', sawPlay);
  check('puck in snapshots', sawPuck);
  check('puck moved when pushed', puckMoved, `puck=(${puck.map((n) => n.toFixed(1)).join(',')})`);
  check('goal scored by pushing puck', sawGoal);
  ws.close();
}

async function testRace(): Promise<void> {
  const ws = new WebSocket(url);
  await new Promise((r) => ws.on('open', r));
  send(ws, { t: 'join', name: 'RACER', level: 'race' });

  let botsMove = false;
  let firstBotPos: Record<number, [number, number, number]> = {};
  let raceEnded = false;
  let phase = 'waiting';

  ws.on('message', (raw) => {
    const msg = decode<S2C>(raw.toString());
    if (!msg) return;
    if (msg.t === 'welcome') {
      check('race welcome', true, `players=${msg.players.length} seed=${msg.seed}`);
    }
    if (msg.t === 'snap') {
      phase = msg.phase;
      for (const p of msg.players) {
        if (p.id >= 1000 && msg.phase === 'play') {
          if (!firstBotPos[p.id]) firstBotPos[p.id] = [...p.p];
          else if (Math.hypot(p.p[0] - firstBotPos[p.id][0], p.p[2] - firstBotPos[p.id][2]) > 20) botsMove = true;
        }
      }
    }
    if (msg.t === 'raceEnd') raceEnded = true;
  });

  // give bots time to race, then finish
  const start = Date.now();
  const tick = setInterval(() => {
    if (phase === 'play') {
      send(ws, { t: 'state', p: [0, 5, 100], q: [0, 0, 0, 1], v: [0, 0, -20], boost: false });
      if (Date.now() - start > 12000) send(ws, { t: 'finish', timeMs: 1 });
    }
  }, 200);

  await new Promise((r) => setTimeout(r, 18000));
  clearInterval(tick);
  check('race bots move downhill', botsMove);
  check('race ends when all humans finish', raceEnded);
  ws.close();
}

await testArena();
await testRace();
console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
