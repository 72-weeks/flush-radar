import WebSocket from 'ws';
import { decode, encode, type S2C } from '../shared/protocol';
const ws = new WebSocket('ws://localhost:8080/ws');
ws.on('open', () => ws.send(encode({ t: 'join', name: 'PROBE', level: 'arena' })));
let n = 0;
ws.on('message', (raw) => {
  const m = decode<S2C>(raw.toString());
  if (m?.t === 'snap' && n++ % 20 === 0) {
    console.log(m.phase, 'clock', m.clock.toFixed(1), 'puck', m.puck?.p.map((x) => x.toFixed(1)).join(','), 'players', m.players.length);
  }
  if (n > 100) process.exit(0);
});
