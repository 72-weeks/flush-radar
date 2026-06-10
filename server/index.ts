// SLAPSHOT SUMMIT server: static file hosting + WebSocket game rooms.

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import { PHYSICS_HZ, SERVER_PORT, type LevelId } from '../shared/constants';
import { decode, type C2S } from '../shared/protocol';
import { Room } from './room';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, '..', 'dist');

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

const server = http.createServer(async (req, res) => {
  try {
    const url = (req.url || '/').split('?')[0];
    let file = path.normalize(path.join(DIST, url === '/' ? 'index.html' : url));
    if (!file.startsWith(DIST)) {
      res.writeHead(403).end();
      return;
    }
    if (!existsSync(file)) file = path.join(DIST, 'index.html');
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(500).end('server error');
  }
});

const wss = new WebSocketServer({ server, path: '/ws' });

const rooms: Room[] = [];

function findRoom(level: LevelId): Room {
  let room = rooms.find((r) => r.level === level && !r.isFull());
  if (!room) {
    room = new Room(level);
    rooms.push(room);
    console.log(`[room] created ${level} room (total ${rooms.length})`);
  }
  return room;
}

wss.on('connection', (ws: WebSocket) => {
  let room: Room | null = null;
  let clientId = -1;

  ws.on('message', (raw) => {
    const msg = decode<C2S>(raw.toString());
    if (!msg) return;
    if (msg.t === 'join' && !room) {
      const level: LevelId = ['arena', 'race', 'pipe'].includes(msg.level) ? msg.level : 'arena';
      room = findRoom(level);
      const client = room.addClient(ws, String(msg.name || 'PLAYER'));
      clientId = client.id;
      console.log(`[join] #${clientId} ${client.name} -> ${level} (${room.humanCount} humans)`);
      return;
    }
    if (room && clientId >= 0 && msg.t !== 'join') {
      const client = room.clients.get(clientId);
      if (client) room.onMessage(client, msg);
    }
  });

  ws.on('close', () => {
    if (room && clientId >= 0) {
      room.removeClient(clientId);
      console.log(`[leave] #${clientId} (${room.humanCount} humans left in ${room.level})`);
    }
  });

  ws.on('error', () => ws.close());
});

// Game loop
let last = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  for (const room of rooms) room.tick(dt);
  // GC: drop empty duplicate rooms (keep one per level)
  for (let i = rooms.length - 1; i >= 0; i--) {
    const r = rooms[i];
    if (r.humanCount === 0 && rooms.filter((o) => o.level === r.level).indexOf(r) > 0) {
      rooms.splice(i, 1);
    }
  }
}, 1000 / PHYSICS_HZ);

const port = Number(process.env.PORT) || SERVER_PORT;
server.listen(port, () => {
  console.log(`SLAPSHOT SUMMIT server on http://localhost:${port}`);
});
