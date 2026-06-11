# 🏒🏔️🏎️ SLAPSHOT SUMMIT

**Hockey × snowboarding × car racing.** A multiplayer browser game built with
[three.js](https://threejs.org), [cannon-es](https://github.com/pmndrs/cannon-es)
physics, and raw WebSockets. You pilot a rocket-kart on snowboard skis with a
hockey-blade bumper. It is exactly as ridiculous as it sounds.

## Game modes

| Mode | What happens |
|------|--------------|
| 🏒 **Avalanche Arena** | 3v3 puck mayhem under stadium floodlights. Puck-cam, boost pads, wall ramps, double jumps, goal horns, a synthesized crowd, cinematic goal cams, golden-goal overtime, and an MVP. Bots fill empty seats and rubber-band to the score. |
| 🏔️ **Glacier Run** | Downhill checkpoint race on a procedurally generated glacier with three weather rolls (bluebird / whiteout / golden hour). Boost gates, kicker jumps, a live minimap, PB splits at every gate — and an **avalanche of giant snowballs** chasing you down. |
| 🛹 **Halfpipe Heaven** | 90-second trick sessions in a giant halfpipe. Airtime, spins, flips, combo multipliers up to ×5, and floating bonus stars. Biggest score wins. |

Everywhere: drift mini-turbos (charge cyan → orange, release for a kick),
quick-chat (keys 1–6), kart toppers, touch controls, gamepad support, and
adaptive render quality that holds 60 fps on weak hardware.

## Controls

| Key | Action |
|-----|--------|
| `W A S D` / arrows | drive |
| `Shift` | boost (refills from pads, gates, tricks) |
| `Space` | jump / double-jump |
| `A/D` + `W/S` in the air | spin / flip (land it for points + boost) |
| `Ctrl` or `X` | drift |
| `R` | respawn |
| `H` | horn |
| `Tab` | scoreboard |
| `M` | mute |

## Running it

```bash
npm install
npm run build   # bundle the client into dist/
npm start       # serve game + websockets on :8080
```

Open `http://localhost:8080` — in as many tabs/machines as you like, it's
multiplayer. For development, `npm run dev` runs Vite (port 5173, hot reload)
plus the game server (8080) with the websocket proxied.

## Architecture

```
shared/   protocol, arena layout, seeded terrain generators (client + server agree)
server/   node + ws: rooms, match phases, server-authoritative puck (cannon-es),
          kinematic steering bots, snapshots at 20 Hz
client/   three.js renderer, raycast-vehicle physics, snapshot interpolation
          (120 ms) + local puck prediction, synthesized WebAudio sound, DOM HUD
```

- **Your kart** is simulated locally (cannon-es `RaycastVehicle`) for zero-latency
  handling; transforms stream to the server 20×/s.
- **The puck** is simulated authoritatively on the server with players as
  kinematic colliders, and *predicted* locally on each client between snapshots
  so hits feel instant.
- **Terrain** is generated from a seed shared in the welcome message, so every
  client and the server build bit-identical mountains.
- **Bots** live server-side, so a solo player always has a 3v3.

## Tests

```bash
npx tsx scripts/physics-test.ts   # heightfield orientation + vehicle conventions
npx tsx scripts/net-test.ts       # full server round-trip: join, score a goal, race
npx tsx scripts/browser-test.ts   # playwright smoke test, all 3 modes + screenshots
npm run typecheck
```
