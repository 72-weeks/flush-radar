// The player vehicle: a rocket-kart on snowboard skis with a hockey-blade bumper.
// Physics = cannon-es RaycastVehicle. Forward is local +z.

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { CHASSIS_HEIGHT, CHASSIS_LENGTH, CHASSIS_WIDTH, VEHICLE_MASS } from '../../shared/constants';
import type { Input } from './input';

const MAX_STEER = 0.55;
const ENGINE_FORCE = 2600;
const BOOST_FORCE = 7500;
const JUMP_SPEED = 7.5;
const GRIP = 3.0;
const DRIFT_GRIP = 0.9;

export interface TrickResult {
  points: number;
  label: string;
  airTime: number;
}

export class Vehicle {
  body: CANNON.Body;
  raycast: CANNON.RaycastVehicle;
  mesh: THREE.Group;
  boostMeter = 50;
  boosting = false;
  drifting = false;
  grounded = true;
  justLanded: TrickResult | null = null;
  private airTime = 0;
  private spinRad = 0;
  private flipRad = 0;
  private jumpsLeft = 2;
  private flippedTimer = 0;
  driftCharge = 0; // seconds of sustained drift
  driftBoostLevel = 0; // set for one frame when a charged drift is released
  private lastVy = 0;
  landImpact = 0;

  constructor(world: CANNON.World, color: number) {
    this.body = new CANNON.Body({
      mass: VEHICLE_MASS,
      material: new CANNON.Material({ friction: 0.01, restitution: 0.1 }),
      angularDamping: 0.6,
      linearDamping: 0.02
    });
    this.body.addShape(
      new CANNON.Box(new CANNON.Vec3(CHASSIS_WIDTH / 2, CHASSIS_HEIGHT / 2, CHASSIS_LENGTH / 2)),
      new CANNON.Vec3(0, 0.1, 0)
    );

    this.raycast = new CANNON.RaycastVehicle({
      chassisBody: this.body,
      indexRightAxis: 0,
      indexUpAxis: 1,
      indexForwardAxis: 2
    });

    const wheelOptions = {
      radius: 0.45,
      directionLocal: new CANNON.Vec3(0, -1, 0),
      suspensionStiffness: 38,
      suspensionRestLength: 0.55,
      frictionSlip: GRIP,
      dampingRelaxation: 2.5,
      dampingCompression: 4.5,
      maxSuspensionForce: 100000,
      rollInfluence: 0.04,
      axleLocal: new CANNON.Vec3(-1, 0, 0),
      chassisConnectionPointLocal: new CANNON.Vec3(),
      maxSuspensionTravel: 0.4,
      customSlidingRotationalSpeed: -30,
      useCustomSlidingRotationalSpeed: true
    };

    // front-left, front-right, back-left, back-right (front = +z)
    const w = CHASSIS_WIDTH / 2 - 0.1;
    const l = CHASSIS_LENGTH / 2 - 0.6;
    for (const [x, z] of [[w, l], [-w, l], [w, -l], [-w, -l]]) {
      wheelOptions.chassisConnectionPointLocal = new CANNON.Vec3(x, -0.1, z);
      this.raycast.addWheel(wheelOptions);
    }
    this.raycast.addToWorld(world);

    this.mesh = buildVehicleMesh(color);
  }

  get speed(): number {
    return this.body.velocity.length();
  }

  get forwardSpeed(): number {
    const f = this.forward();
    const v = this.body.velocity;
    return f.x * v.x + f.y * v.y + f.z * v.z;
  }

  forward(): CANNON.Vec3 {
    return this.body.quaternion.vmult(new CANNON.Vec3(0, 0, 1));
  }

  up(): CANNON.Vec3 {
    return this.body.quaternion.vmult(new CANNON.Vec3(0, 1, 0));
  }

  update(input: Input, dt: number, allowDrive: boolean): void {
    const rc = this.raycast;
    const wasGrounded = this.grounded;
    let onGround = 0;
    for (const w of rc.wheelInfos) if (w.isInContact) onGround++;
    this.grounded = onGround >= 2;

    const throttle = allowDrive ? input.throttle : 0;
    const steer = allowDrive ? input.steer : 0;

    // steering softens with speed
    const steerScale = 1 / (1 + this.speed * 0.02);
    rc.setSteeringValue(steer * MAX_STEER * steerScale, 0);
    rc.setSteeringValue(steer * MAX_STEER * steerScale, 1);

    // drive / brake
    const reversing = throttle < 0 && this.forwardSpeed > 1;
    for (const i of [2, 3]) {
      rc.applyEngineForce(reversing ? 0 : -throttle * ENGINE_FORCE, i);
      rc.setBrake(reversing ? 18 : 0, i);
    }
    for (const i of [0, 1]) rc.setBrake(reversing ? 8 : 0, i);

    // drift: rear grip drops, slight steering kick; sustained drifts charge a mini-turbo
    const wasDrifting = this.drifting;
    this.drifting = allowDrive && input.drift && this.grounded && this.speed > 8;
    for (const i of [2, 3]) rc.wheelInfos[i].frictionSlip = this.drifting ? DRIFT_GRIP : GRIP;
    this.driftBoostLevel = 0;
    if (this.drifting) {
      if (steer !== 0) {
        this.body.angularVelocity.y += steer * 2.2 * dt;
        this.driftCharge += dt;
      }
    } else {
      if (wasDrifting && this.grounded) {
        const level = this.driftCharge > 2.0 ? 2 : this.driftCharge > 0.9 ? 1 : 0;
        if (level > 0) {
          const f = this.forward();
          const kick = level === 2 ? 7 : 4;
          this.body.applyImpulse(new CANNON.Vec3(f.x * kick * VEHICLE_MASS, 0, f.z * kick * VEHICLE_MASS));
          this.boostMeter = Math.min(100, this.boostMeter + (level === 2 ? 25 : 10));
          this.driftBoostLevel = level;
        }
      }
      this.driftCharge = 0;
    }

    // boost (tapers off near top speed, weaker in the air)
    this.boosting = allowDrive && input.boost && this.boostMeter > 0;
    if (this.boosting) {
      const f = this.forward();
      const topSpeed = 42;
      const taper = Math.max(0, 1 - this.speed / topSpeed);
      const power = BOOST_FORCE * taper * (this.grounded ? 1 : 0.55);
      this.body.applyForce(new CANNON.Vec3(f.x * power, Math.min(f.y, 0.35) * power, f.z * power));
      this.boostMeter = Math.max(0, this.boostMeter - 36 * dt);
    } else {
      this.boostMeter = Math.min(100, this.boostMeter + 4 * dt);
    }

    // jump & double-jump
    if (this.grounded) this.jumpsLeft = 2;
    if (allowDrive && input.jump && this.jumpsLeft > 0) {
      this.jumpsLeft--;
      const up = this.grounded ? this.up() : new CANNON.Vec3(0, 1, 0);
      this.body.velocity.y = Math.max(this.body.velocity.y, 0);
      this.body.applyImpulse(
        new CANNON.Vec3(up.x * JUMP_SPEED * VEHICLE_MASS * 0.8, JUMP_SPEED * VEHICLE_MASS * 0.8, up.z * JUMP_SPEED * VEHICLE_MASS * 0.8)
      );
    }

    // air control + trick accumulation
    this.justLanded = null;
    if (!this.grounded) {
      this.airTime += dt;
      if (allowDrive) {
        const av = this.body.angularVelocity;
        const right = this.body.quaternion.vmult(new CANNON.Vec3(1, 0, 0));
        // pitch (flips) with W/S, yaw (spins) with A/D
        const pitchTarget = throttle * 5.5;
        const yawTarget = steer * 4.5;
        const pitchNow = av.x * right.x + av.y * right.y + av.z * right.z;
        const dPitch = (pitchTarget - pitchNow) * 6 * dt;
        av.x += right.x * dPitch;
        av.y += right.y * dPitch + (yawTarget - av.y) * 4 * dt;
        av.z += right.z * dPitch;
      }
      const right = this.body.quaternion.vmult(new CANNON.Vec3(1, 0, 0));
      const av = this.body.angularVelocity;
      this.spinRad += av.y * dt;
      this.flipRad += (av.x * right.x + av.y * right.y + av.z * right.z) * dt;
    } else {
      if (!wasGrounded && this.airTime > 0.45) {
        this.justLanded = scoreTrick(this.airTime, this.spinRad, this.flipRad);
      }
      if (!wasGrounded) this.landImpact = Math.max(0, this.lastVy < 0 ? -this.lastVy : 0);
      this.airTime = 0;
      this.spinRad = 0;
      this.flipRad = 0;
    }
    this.lastVy = this.body.velocity.y;

    // auto-recover when stuck upside down
    if (this.up().y < 0.15 && this.speed < 3) {
      this.flippedTimer += dt;
      if (this.flippedTimer > 1.2) {
        const pos = this.body.position;
        this.teleport([pos.x, pos.y + 1.5, pos.z], this.yaw());
      }
    } else {
      this.flippedTimer = 0;
    }

    this.syncMesh();
  }

  yaw(): number {
    const f = this.forward();
    return Math.atan2(f.x, f.z);
  }

  teleport(pos: [number, number, number], yaw: number): void {
    this.body.position.set(pos[0], pos[1], pos[2]);
    this.body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), yaw);
    this.body.velocity.setZero();
    this.body.angularVelocity.setZero();
    this.airTime = 0;
    this.spinRad = 0;
    this.flipRad = 0;
    this.syncMesh();
  }

  syncMesh(): void {
    this.mesh.position.copy(this.body.position as unknown as THREE.Vector3);
    this.mesh.quaternion.copy(this.body.quaternion as unknown as THREE.Quaternion);
  }
}

function scoreTrick(airTime: number, spinRad: number, flipRad: number): TrickResult {
  const spins = Math.floor(Math.abs(spinRad) / Math.PI); // per 180°
  const flips = Math.floor(Math.abs(flipRad) / Math.PI);
  let points = Math.round(airTime * 40);
  const parts: string[] = [];
  if (spins > 0) {
    points += spins * 90;
    parts.push(`${spins * 180} SPIN`);
  }
  if (flips >= 2) {
    points += Math.floor(flips / 2) * 220;
    parts.push(flipRad < 0 ? 'BACKFLIP' : 'FRONTFLIP');
  }
  if (airTime > 1.6) parts.push('BIG AIR');
  if (parts.length === 0 && airTime > 0.8) parts.push('AIR');
  return { points, label: parts.join(' + '), airTime };
}

// ---------- visuals ----------

export function buildVehicleMesh(color: number): THREE.Group {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.5 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x10151c, roughness: 0.6, metalness: 0.3 });
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf2f6fa, roughness: 0.5 });

  // chassis
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(CHASSIS_WIDTH * 0.86, 0.55, CHASSIS_LENGTH * 0.88), bodyMat);
  chassis.position.y = 0.12;
  g.add(chassis);

  // nose wedge
  const nose = new THREE.Mesh(new THREE.BoxGeometry(CHASSIS_WIDTH * 0.7, 0.34, 1.2), bodyMat);
  nose.position.set(0, 0.05, CHASSIS_LENGTH * 0.44);
  nose.rotation.x = 0.18;
  g.add(nose);

  // cabin
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(CHASSIS_WIDTH * 0.55, 0.5, 1.6), darkMat);
  cabin.position.set(0, 0.55, -0.2);
  g.add(cabin);

  // spoiler
  const spoiler = new THREE.Mesh(new THREE.BoxGeometry(CHASSIS_WIDTH * 0.95, 0.08, 0.5), bodyMat);
  spoiler.position.set(0, 0.75, -CHASSIS_LENGTH * 0.42);
  g.add(spoiler);
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.45, 0.08), darkMat);
    post.position.set(sx * CHASSIS_WIDTH * 0.32, 0.5, -CHASSIS_LENGTH * 0.42);
    g.add(post);
  }

  // snowboard skis (4)
  const w = CHASSIS_WIDTH / 2 - 0.1;
  const l = CHASSIS_LENGTH / 2 - 0.6;
  for (const [x, z] of [[w, l], [-w, l], [w, -l], [-w, -l]]) {
    const ski = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 1.7), whiteMat);
    ski.position.set(x, -0.5, z);
    g.add(ski);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.45), whiteMat);
    tip.position.set(x, -0.42, z + 0.95);
    tip.rotation.x = -0.5;
    g.add(tip);
  }

  // hockey-blade front bumper
  const blade = new THREE.Mesh(new THREE.BoxGeometry(CHASSIS_WIDTH * 1.05, 0.3, 0.22), whiteMat);
  blade.position.set(0, -0.15, CHASSIS_LENGTH * 0.5);
  g.add(blade);
  const tape = new THREE.Mesh(new THREE.BoxGeometry(CHASSIS_WIDTH * 0.5, 0.32, 0.24), darkMat);
  tape.position.set(0, -0.15, CHASSIS_LENGTH * 0.5);
  g.add(tape);

  // boost nozzles
  for (const sx of [-1, 1]) {
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.4, 8), darkMat);
    nozzle.rotation.x = Math.PI / 2;
    nozzle.position.set(sx * 0.5, 0.15, -CHASSIS_LENGTH * 0.46);
    g.add(nozzle);
  }

  // headlights
  const lightMat = new THREE.MeshStandardMaterial({ color: 0xfff6c0, emissive: 0xfff6c0, emissiveIntensity: 1.2 });
  for (const sx of [-1, 1]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.08), lightMat);
    lamp.position.set(sx * 0.6, 0.2, CHASSIS_LENGTH * 0.46);
    g.add(lamp);
  }

  g.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
    }
  });
  return g;
}
