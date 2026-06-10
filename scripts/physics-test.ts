// Numeric sanity tests for physics conventions (no graphics needed).
// 1) Heightfield orientation must match Terrain.heightAt
// 2) RaycastVehicle engine force sign must drive the chassis toward local +z

import * as CANNON from 'cannon-es';
import { raceTerrain } from '../shared/terrain';

let failures = 0;

function check(label: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label} ${detail}`);
  if (!ok) failures++;
}

// ---- 1. heightfield ----
{
  const terrain = raceTerrain(12345);
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -22, 0) });
  const body = new CANNON.Body({ mass: 0 });
  body.addShape(new CANNON.Heightfield(terrain.heights, { elementSize: terrain.cell }));
  body.position.set(-terrain.halfW, 0, terrain.halfL);
  body.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
  world.addBody(body);

  for (const [x, z] of [[0, 0], [30, 200], [-40, -350], [10, 411]] as const) {
    const r = 0.5;
    const sphere = new CANNON.Body({ mass: 5 });
    sphere.addShape(new CANNON.Sphere(r));
    const ground = terrain.heightAt(x, z);
    sphere.position.set(x, ground + 5, z);
    world.addBody(sphere);
    for (let i = 0; i < 600; i++) world.step(1 / 60);
    const expected = ground + r;
    // sphere may roll a little; recompute ground under its final spot
    const finalGround = terrain.heightAt(sphere.position.x, sphere.position.z) + r;
    const err = Math.abs(sphere.position.y - finalGround);
    check(
      `heightfield rest @ (${x},${z})`,
      err < 0.6,
      `y=${sphere.position.y.toFixed(2)} expected≈${expected.toFixed(2)} err=${err.toFixed(3)}`
    );
    world.removeBody(sphere);
  }
}

// ---- 2. vehicle drive direction ----
{
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -22, 0) });
  const ground = new CANNON.Body({ mass: 0 });
  ground.addShape(new CANNON.Plane());
  ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(ground);

  const chassis = new CANNON.Body({ mass: 220 });
  chassis.addShape(new CANNON.Box(new CANNON.Vec3(1.15, 0.45, 2.2)), new CANNON.Vec3(0, 0.1, 0));
  chassis.position.set(0, 2, 0);

  const vehicle = new CANNON.RaycastVehicle({ chassisBody: chassis, indexRightAxis: 0, indexUpAxis: 1, indexForwardAxis: 2 });
  const opts = {
    radius: 0.45,
    directionLocal: new CANNON.Vec3(0, -1, 0),
    suspensionStiffness: 38,
    suspensionRestLength: 0.55,
    frictionSlip: 3,
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
  for (const [x, z] of [[1.05, 1.6], [-1.05, 1.6], [1.05, -1.6], [-1.05, -1.6]]) {
    opts.chassisConnectionPointLocal = new CANNON.Vec3(x, -0.1, z);
    vehicle.addWheel(opts);
  }
  vehicle.addToWorld(world);

  for (let i = 0; i < 240; i++) {
    vehicle.applyEngineForce(-2600, 2);
    vehicle.applyEngineForce(-2600, 3);
    world.step(1 / 60);
    vehicle.updateWheelTransform(0);
  }
  check(
    'vehicle drives toward +z with negative engine force',
    chassis.position.z > 5,
    `z=${chassis.position.z.toFixed(2)} x=${chassis.position.x.toFixed(2)} y=${chassis.position.y.toFixed(2)}`
  );
  check('vehicle stays upright', chassis.position.y > 0.4 && chassis.position.y < 2, `y=${chassis.position.y.toFixed(2)}`);

  // steering check: positive steer should turn left (toward +x given forward +z)
  const before = chassis.position.x;
  for (let i = 0; i < 180; i++) {
    vehicle.applyEngineForce(-2600, 2);
    vehicle.applyEngineForce(-2600, 3);
    vehicle.setSteeringValue(0.4, 0);
    vehicle.setSteeringValue(0.4, 1);
    world.step(1 / 60);
  }
  console.log(`INFO steering with +0.4: dx=${(chassis.position.x - before).toFixed(2)} (positive = +x)`);
}

console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
