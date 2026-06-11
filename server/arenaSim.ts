// Server-authoritative puck physics for Avalanche Arena.
// Player vehicles are kinematic bodies driven by client-reported transforms;
// the puck is fully simulated here.

import * as CANNON from 'cannon-es';
import { arenaBoxes, goalVolumes, puckSpawn, GOAL_DEPTH, RINK_LENGTH, RINK_WIDTH } from '../shared/arena';
import { KART_COLLIDER_HALF, PUCK_HEIGHT, PUCK_MASS, PUCK_RADIUS } from '../shared/constants';
import type { PuckState, Q4, V3 } from '../shared/protocol';

export class ArenaSim {
  world: CANNON.World;
  puck: CANNON.Body;
  playerBodies = new Map<number, CANNON.Body>();
  lastToucher = -1;

  private puckMat = new CANNON.Material('puck');

  constructor() {
    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -22, 0) });
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);

    const groundMat = new CANNON.Material('ice');
    const ground = new CANNON.Body({ mass: 0, material: groundMat });
    ground.addShape(new CANNON.Plane());
    ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(ground);

    const wallMat = new CANNON.Material('wall');
    for (const b of arenaBoxes()) {
      const body = new CANNON.Body({ mass: 0, material: wallMat });
      body.addShape(new CANNON.Box(new CANNON.Vec3(b.size[0] / 2, b.size[1] / 2, b.size[2] / 2)));
      body.position.set(b.pos[0], b.pos[1], b.pos[2]);
      if (b.euler) body.quaternion.setFromEuler(b.euler[0], b.euler[1], b.euler[2]);
      this.world.addBody(body);
    }

    this.puck = new CANNON.Body({
      mass: PUCK_MASS,
      material: this.puckMat,
      angularDamping: 0.4,
      linearDamping: 0.18
    });
    this.puck.addShape(new CANNON.Cylinder(PUCK_RADIUS, PUCK_RADIUS, PUCK_HEIGHT, 16));
    this.resetPuck();
    this.world.addBody(this.puck);

    this.world.addContactMaterial(
      new CANNON.ContactMaterial(this.puckMat, groundMat, { friction: 0.02, restitution: 0.1 })
    );
    this.world.addContactMaterial(
      new CANNON.ContactMaterial(this.puckMat, wallMat, { friction: 0.05, restitution: 0.75 })
    );

    this.puck.addEventListener('collide', (e: { body: CANNON.Body }) => {
      for (const [id, body] of this.playerBodies) {
        if (e.body === body) {
          this.lastToucher = id;
          break;
        }
      }
    });
  }

  addPlayer(id: number): void {
    const body = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC });
    body.addShape(new CANNON.Box(new CANNON.Vec3(...KART_COLLIDER_HALF)));
    body.position.set(0, -50, 0);
    this.world.addBody(body);
    this.playerBodies.set(id, body);
  }

  removePlayer(id: number): void {
    const body = this.playerBodies.get(id);
    if (body) this.world.removeBody(body);
    this.playerBodies.delete(id);
  }

  updatePlayer(id: number, p: V3, q: Q4, v: V3): void {
    const body = this.playerBodies.get(id);
    if (!body) return;
    body.position.set(p[0], p[1], p[2]);
    body.quaternion.set(q[0], q[1], q[2], q[3]);
    body.velocity.set(v[0], v[1], v[2]);
  }

  step(dt: number): void {
    this.world.step(1 / 60, dt, 3);
    // Out of play (squeezed through / flew over a wall): back to center ice
    const p = this.puck.position;
    if (
      Math.abs(p.x) > RINK_WIDTH / 2 + 2.5 ||
      Math.abs(p.z) > RINK_LENGTH / 2 + GOAL_DEPTH + 2.5 ||
      p.y < -5 ||
      p.y > 80
    ) {
      this.resetPuck();
    }
  }

  /** Returns scoring team (0|1) or -1. */
  checkGoal(): number {
    const p = this.puck.position;
    for (const g of goalVolumes()) {
      if (
        p.x > g.min[0] && p.x < g.max[0] &&
        p.y > g.min[1] && p.y < g.max[1] &&
        p.z > g.min[2] && p.z < g.max[2]
      ) {
        return g.team;
      }
    }
    return -1;
  }

  resetPuck(): void {
    const s = puckSpawn();
    this.puck.position.set(s[0], s[1], s[2]);
    this.puck.velocity.setZero();
    this.puck.angularVelocity.setZero();
    this.puck.quaternion.set(0, 0, 0, 1);
    this.lastToucher = -1;
  }

  puckState(): PuckState {
    const b = this.puck;
    return {
      p: [b.position.x, b.position.y, b.position.z],
      q: [b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w],
      v: [b.velocity.x, b.velocity.y, b.velocity.z]
    };
  }
}
