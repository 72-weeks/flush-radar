// Shared tuning constants for client + server.

export const SERVER_PORT = 8080;

export const PHYSICS_HZ = 60;
export const SNAPSHOT_HZ = 20;
export const CLIENT_SEND_HZ = 20;

export type LevelId = 'arena' | 'race' | 'pipe';

export const LEVELS: { id: LevelId; name: string; tagline: string }[] = [
  { id: 'arena', name: 'Avalanche Arena', tagline: 'Team puck mayhem. Slap it home.' },
  { id: 'race', name: 'Glacier Run', tagline: 'Downhill checkpoint race. Full send.' },
  { id: 'pipe', name: 'Halfpipe Heaven', tagline: 'Airtime + spins = glory.' }
];

export const MAX_PLAYERS_PER_ROOM = 8;

// Arena match
export const ARENA_MATCH_SECONDS = 240;
export const ARENA_TEAM_SIZE = 3; // bots fill up to 3v3
export const COUNTDOWN_SECONDS = 3;
export const GOAL_PAUSE_SECONDS = 4;
export const END_SCREEN_SECONDS = 8;

// Race
export const RACE_MAX_SECONDS = 300;
export const RACE_BOTS = 3;

// Pipe
export const PIPE_SESSION_SECONDS = 90;

// Puck
export const PUCK_RADIUS = 2.0;
export const PUCK_HEIGHT = 0.7;
export const PUCK_MASS = 6;

// Vehicle (client-side physics, but server uses size for puck contacts)
export const CHASSIS_LENGTH = 4.4;
export const CHASSIS_WIDTH = 2.3;
export const CHASSIS_HEIGHT = 0.9;
export const VEHICLE_MASS = 220;

// Forgiving kart collision box used for the puck's view of players,
// on the server and for client-side prediction of remote karts alike.
export const KART_COLLIDER_HALF: [number, number, number] = [
  CHASSIS_WIDTH / 2,
  CHASSIS_HEIGHT / 2 + 0.3,
  CHASSIS_LENGTH / 2
];

export const TEAM_COLORS = [0x2196f3, 0xff5722]; // blue, orange
export const TEAM_NAMES = ['ICE', 'FIRE'];
