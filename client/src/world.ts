// Builds the visual + physical world for each level.

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { arenaBoxes, boostPads, GOAL_WIDTH, GOAL_HEIGHT, GOAL_DEPTH, RINK_LENGTH, RINK_WIDTH } from '../../shared/arena';
import { PUCK_HEIGHT, PUCK_RADIUS, TEAM_COLORS, type LevelId } from '../../shared/constants';
import { mulberry32 } from '../../shared/rng';
import { raceCheckpoints, racePathX, RACE_FINISH_Z, type Terrain } from '../../shared/terrain';

export interface BuiltWorld {
  pads: THREE.Vector3[];
  gates: GateVisual[];
  animated: ((t: number, dt: number) => void)[];
}

export interface GateVisual {
  index: number;
  pos: THREE.Vector3;
  boost: boolean;
  ring: THREE.Mesh;
  mat: THREE.MeshStandardMaterial;
}

export function setupEnvironment(scene: THREE.Scene, level: LevelId): THREE.DirectionalLight {
  const skyColor = level === 'arena' ? 0x16294a : 0x9fc8e8;
  scene.background = new THREE.Color(skyColor);
  scene.fog = new THREE.Fog(skyColor, level === 'arena' ? 140 : 180, level === 'arena' ? 500 : 850);

  const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x4a6584, level === 'arena' ? 1.1 : 1.0);
  scene.add(hemi);

  if (level === 'arena') {
    // stadium floodlights
    for (const [x, z] of [[-40, -45], [40, -45], [-40, 45], [40, 45]] as const) {
      const lamp = new THREE.PointLight(0xeaf4ff, 900, 220, 1.8);
      lamp.position.set(x, 32, z);
      scene.add(lamp);
      const poleMat = new THREE.MeshStandardMaterial({ color: 0x44597a, roughness: 0.8 });
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 32, 6), poleMat);
      pole.position.set(x, 16, z);
      scene.add(pole);
      const head = new THREE.Mesh(
        new THREE.BoxGeometry(3.4, 1.4, 1.4),
        new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xeaf4ff, emissiveIntensity: 2 })
      );
      head.position.set(x, 32, z);
      scene.add(head);
    }
  }

  const sun = new THREE.DirectionalLight(0xfff2dd, level === 'arena' ? 1.2 : 2.2);
  sun.position.set(80, 140, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -70;
  sun.shadow.camera.right = 70;
  sun.shadow.camera.top = 70;
  sun.shadow.camera.bottom = -70;
  sun.shadow.camera.far = 400;
  sun.shadow.bias = -0.0005;
  scene.add(sun);
  scene.add(sun.target);

  // distant mountain ring
  const rng = mulberry32(7);
  const mountainMat = new THREE.MeshStandardMaterial({ color: 0xe8f2fb, roughness: 0.9, flatShading: true });
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x9eb2c8, roughness: 1, flatShading: true });
  for (let i = 0; i < 26; i++) {
    const angle = (i / 26) * Math.PI * 2 + rng() * 0.2;
    const dist = 650 + rng() * 350;
    const h = 120 + rng() * 260;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(90 + rng() * 130, h, 5 + Math.floor(rng() * 3)), rng() > 0.4 ? mountainMat : rockMat);
    cone.position.set(Math.cos(angle) * dist, h / 2 - 40, Math.sin(angle) * dist);
    cone.rotation.y = rng() * Math.PI;
    scene.add(cone);
  }

  return sun;
}

export function makeSnowfall(scene: THREE.Scene): (camPos: THREE.Vector3, dt: number) => void {
  const COUNT = 1600;
  const RANGE = 110;
  const positions = new Float32Array(COUNT * 3);
  const speeds = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) {
    positions[i * 3] = (Math.random() - 0.5) * RANGE * 2;
    positions[i * 3 + 1] = Math.random() * RANGE;
    positions[i * 3 + 2] = (Math.random() - 0.5) * RANGE * 2;
    speeds[i] = 3 + Math.random() * 6;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.35, transparent: true, opacity: 0.85, depthWrite: false });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);

  return (camPos, dt) => {
    const arr = geo.attributes.position.array as Float32Array;
    for (let i = 0; i < COUNT; i++) {
      arr[i * 3 + 1] -= speeds[i] * dt;
      arr[i * 3] += Math.sin(performance.now() * 0.001 + i) * dt * 1.5;
      // wrap vertically and keep the cloud near the camera
      if (arr[i * 3 + 1] < camPos.y - 10) {
        arr[i * 3 + 1] = camPos.y + RANGE * 0.8;
        arr[i * 3] = camPos.x + (Math.random() - 0.5) * RANGE * 2;
        arr[i * 3 + 2] = camPos.z + (Math.random() - 0.5) * RANGE * 2;
      }
    }
    geo.attributes.position.needsUpdate = true;
  };
}

// ---------- Avalanche Arena ----------

export function buildArena(scene: THREE.Scene, world: CANNON.World): BuiltWorld {
  const animated: ((t: number, dt: number) => void)[] = [];

  // ice floor
  const iceMat = new THREE.MeshStandardMaterial({ color: 0xbfe3f2, roughness: 0.08, metalness: 0.25 });
  const floor = new THREE.Mesh(new THREE.BoxGeometry(RINK_WIDTH + 4, 1, RINK_LENGTH + GOAL_DEPTH * 2 + 6), iceMat);
  floor.position.y = -0.5;
  floor.receiveShadow = true;
  scene.add(floor);

  const groundBody = new CANNON.Body({ mass: 0, material: new CANNON.Material({ friction: 0.02, restitution: 0.1 }) });
  groundBody.addShape(new CANNON.Plane());
  groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(groundBody);

  // rink markings
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xd23b3b });
  const blueLineMat = new THREE.MeshBasicMaterial({ color: 0x2b6bd2 });
  const centerLine = new THREE.Mesh(new THREE.BoxGeometry(RINK_WIDTH, 0.02, 0.5), lineMat);
  centerLine.position.y = 0.02;
  scene.add(centerLine);
  for (const sz of [-1, 1]) {
    const blueLine = new THREE.Mesh(new THREE.BoxGeometry(RINK_WIDTH, 0.02, 0.5), blueLineMat);
    blueLine.position.set(0, 0.02, sz * RINK_LENGTH * 0.2);
    scene.add(blueLine);
  }
  const circle = new THREE.Mesh(new THREE.RingGeometry(7.6, 8.2, 48), lineMat);
  circle.rotation.x = -Math.PI / 2;
  circle.position.y = 0.02;
  scene.add(circle);

  // walls
  const wallMat3 = new THREE.MeshStandardMaterial({ color: 0xf4f8fb, roughness: 0.6 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.22, roughness: 0.1 });
  const rampMat = new THREE.MeshStandardMaterial({ color: 0x6fb9e8, roughness: 0.3, metalness: 0.2 });
  const wallPhys = new CANNON.Material({ friction: 0.05, restitution: 0.4 });
  for (const b of arenaBoxes()) {
    const mat = b.kind === 'glass' ? glassMat : b.kind === 'ramp' ? rampMat : wallMat3;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(b.size[0], b.size[1], b.size[2]), mat);
    mesh.position.set(b.pos[0], b.pos[1], b.pos[2]);
    if (b.euler) mesh.rotation.set(b.euler[0], b.euler[1], b.euler[2]);
    mesh.receiveShadow = true;
    scene.add(mesh);

    const body = new CANNON.Body({ mass: 0, material: wallPhys });
    body.addShape(new CANNON.Box(new CANNON.Vec3(b.size[0] / 2, b.size[1] / 2, b.size[2] / 2)));
    body.position.set(b.pos[0], b.pos[1], b.pos[2]);
    if (b.euler) body.quaternion.setFromEuler(b.euler[0], b.euler[1], b.euler[2]);
    world.addBody(body);
  }

  // glowing goal mouths
  for (const [i, sz] of [-1, 1].entries()) {
    const goalMat = new THREE.MeshStandardMaterial({
      color: TEAM_COLORS[i],
      emissive: TEAM_COLORS[i],
      emissiveIntensity: 0.9
    });
    const frame = new THREE.Mesh(new THREE.BoxGeometry(GOAL_WIDTH + 1, 0.4, 0.4), goalMat);
    frame.position.set(0, GOAL_HEIGHT, sz * RINK_LENGTH / 2);
    scene.add(frame);
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, GOAL_HEIGHT, 0.4), goalMat);
      post.position.set(sx * (GOAL_WIDTH / 2 + 0.3), GOAL_HEIGHT / 2, sz * RINK_LENGTH / 2);
      scene.add(post);
    }
    const glow = new THREE.PointLight(TEAM_COLORS[i], 60, 40);
    glow.position.set(0, 3, sz * (RINK_LENGTH / 2 + 2));
    scene.add(glow);
  }

  // boost pads
  const pads: THREE.Vector3[] = [];
  const padMat = new THREE.MeshStandardMaterial({ color: 0xffb347, emissive: 0xff8c00, emissiveIntensity: 1.2 });
  for (const p of boostPads()) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.18, 8, 24), padMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(p[0], 0.15, p[2]);
    scene.add(ring);
    pads.push(new THREE.Vector3(p[0], 0, p[2]));
    animated.push((t) => {
      ring.position.y = 0.15 + Math.sin(t * 2.5 + p[0]) * 0.07;
      ring.rotation.z = t * 0.8;
    });
  }

  // snow berms outside the rink for scenery
  const bermMat = new THREE.MeshStandardMaterial({ color: 0xeef6fc, roughness: 1, flatShading: true });
  const rng = mulberry32(42);
  for (let i = 0; i < 30; i++) {
    const angle = (i / 30) * Math.PI * 2;
    const r = Math.max(RINK_WIDTH, RINK_LENGTH) * 0.75 + rng() * 30;
    const berm = new THREE.Mesh(new THREE.ConeGeometry(8 + rng() * 14, 6 + rng() * 14, 5), bermMat);
    berm.position.set(Math.cos(angle) * r, 2, Math.sin(angle) * r * 1.1);
    scene.add(berm);
  }

  return { pads, gates: [], animated };
}

// ---------- terrain levels (Glacier Run / Halfpipe) ----------

export function buildTerrainLevel(
  scene: THREE.Scene,
  world: CANNON.World,
  terrain: Terrain,
  level: LevelId
): BuiltWorld {
  const animated: ((t: number, dt: number) => void)[] = [];
  const { nx, nz, cell, halfW, halfL, heights } = terrain;

  // ----- visual mesh with vertex colors -----
  const positions = new Float32Array(nx * nz * 3);
  const colors = new Float32Array(nx * nz * 3);
  const snow = new THREE.Color(0xf4f9fd);
  const ice = new THREE.Color(0xa8dcf0);
  const rock = new THREE.Color(0x8195ab);
  const tmp = new THREE.Color();
  for (let ix = 0; ix < nx; ix++) {
    for (let iz = 0; iz < nz; iz++) {
      const i = ix * nz + iz;
      const x = -halfW + ix * cell;
      const z = halfL - iz * cell;
      const h = heights[ix][iz];
      positions[i * 3] = x;
      positions[i * 3 + 1] = h;
      positions[i * 3 + 2] = z;

      // slope estimate for rock coloring
      const hx = ix + 1 < nx ? heights[ix + 1][iz] : h;
      const hz = iz + 1 < nz ? heights[ix][iz + 1] : h;
      const slope = Math.min(1, (Math.abs(hx - h) + Math.abs(hz - h)) / cell / 1.4);
      tmp.copy(snow);
      if (level === 'race' && Math.abs(x - racePathX(z)) < 24) tmp.lerp(ice, 0.55);
      if (level === 'pipe' && Math.abs(x) < 15) tmp.lerp(ice, 0.5);
      tmp.lerp(rock, slope * slope * 0.9);
      colors[i * 3] = tmp.r;
      colors[i * 3 + 1] = tmp.g;
      colors[i * 3 + 2] = tmp.b;
    }
  }
  const indices: number[] = [];
  for (let ix = 0; ix < nx - 1; ix++) {
    for (let iz = 0; iz < nz - 1; iz++) {
      const a = ix * nz + iz;
      const b = (ix + 1) * nz + iz;
      const c = ix * nz + iz + 1;
      const d = (ix + 1) * nz + iz + 1;
      indices.push(a, b, c, b, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const terrainMesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.02 })
  );
  terrainMesh.receiveShadow = true;
  scene.add(terrainMesh);

  // ----- physics heightfield -----
  // cannon heightfield: local x = i*cell (world +x), local y = j*cell (world -z after rotation)
  const body = new CANNON.Body({ mass: 0, material: new CANNON.Material({ friction: 0.03, restitution: 0.05 }) });
  body.addShape(new CANNON.Heightfield(heights, { elementSize: cell }));
  body.position.set(-halfW, 0, halfL);
  body.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
  world.addBody(body);

  // ----- decor: trees off-course -----
  const rng = mulberry32(99);
  const treeGeo = new THREE.ConeGeometry(2.2, 6.5, 6);
  const treeMat = new THREE.MeshStandardMaterial({ color: 0x2e6b4f, roughness: 0.9, flatShading: true });
  const trunkGeo = new THREE.CylinderGeometry(0.4, 0.5, 2, 5);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 1 });
  const treeCount = level === 'race' ? 260 : 60;
  const trees = new THREE.InstancedMesh(treeGeo, treeMat, treeCount);
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
  const m = new THREE.Matrix4();
  let placed = 0;
  let guard = 0;
  while (placed < treeCount && guard++ < treeCount * 30) {
    const x = (rng() - 0.5) * (halfW * 2 - 8);
    const z = (rng() - 0.5) * (halfL * 2 - 8);
    if (level === 'race' && Math.abs(x - racePathX(z)) < 30) continue;
    if (level === 'pipe' && Math.abs(x) < 19) continue;
    const y = terrain.heightAt(x, z);
    const s = 0.7 + rng() * 1.1;
    m.makeScale(s, s, s).setPosition(x, y + 3.2 * s, z);
    trees.setMatrixAt(placed, m);
    m.makeScale(s, s, s).setPosition(x, y + 0.8 * s, z);
    trunks.setMatrixAt(placed, m);
    placed++;
  }
  trees.count = placed;
  trunks.count = placed;
  scene.add(trees, trunks);

  // ----- race gates -----
  const gates: GateVisual[] = [];
  if (level === 'race') {
    const cps = raceCheckpoints();
    for (const [index, cp] of cps.entries()) {
      const y = terrain.heightAt(cp.x, cp.z);
      const color = cp.boost ? 0xffb347 : 0x6fe3ff;
      const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.8, transparent: true, opacity: 0.95 });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(8, 0.55, 8, 32), mat);
      ring.position.set(cp.x, y + 6.5, cp.z);
      scene.add(ring);
      for (const sx of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 9, 6), mat);
        post.position.set(cp.x + sx * 10, y + 4.5, cp.z);
        scene.add(post);
      }
      gates.push({ index, pos: new THREE.Vector3(cp.x, y, cp.z), boost: cp.boost, ring, mat });
      animated.push((t) => {
        ring.rotation.y = 0;
        ring.rotation.x = Math.sin(t * 1.5 + index) * 0.08;
      });
    }
    // finish banner
    const fy = terrain.heightAt(racePathX(RACE_FINISH_Z), RACE_FINISH_Z);
    const banMat = new THREE.MeshStandardMaterial({ color: 0xff3355, emissive: 0xff3355, emissiveIntensity: 1 });
    const banner = new THREE.Mesh(new THREE.BoxGeometry(44, 1.6, 0.6), banMat);
    banner.position.set(racePathX(RACE_FINISH_Z), fy + 10, RACE_FINISH_Z);
    scene.add(banner);
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 11, 6), banMat);
      post.position.set(racePathX(RACE_FINISH_Z) + sx * 22, fy + 5, RACE_FINISH_Z);
      scene.add(post);
    }
  }

  if (level === 'pipe') {
    // coping lines along the pipe edges (follow the slope)
    const copeMat = new THREE.MeshStandardMaterial({ color: 0xff6f61, emissive: 0xff6f61, emissiveIntensity: 0.8 });
    for (const sx of [-1, 1]) {
      for (let z = -110; z <= 110; z += 20) {
        const seg = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 21), copeMat);
        const y1 = terrain.heightAt(sx * 15, z - 10);
        const y2 = terrain.heightAt(sx * 15, z + 10);
        seg.position.set(sx * 15, (y1 + y2) / 2 + 0.3, z);
        seg.rotation.x = Math.atan2(y1 - y2, 20);
        scene.add(seg);
      }
    }
    // flags on the deck
    const flagColors = [0xffe66d, 0x6fe3ff, 0xff6f61, 0x7dffa0];
    for (let z = -100; z <= 100; z += 25) {
      for (const sx of [-1, 1]) {
        const x = sx * 21;
        const y = terrain.heightAt(x, z);
        const pole = new THREE.Mesh(
          new THREE.CylinderGeometry(0.12, 0.15, 5, 5),
          new THREE.MeshStandardMaterial({ color: 0xdddddd })
        );
        pole.position.set(x, y + 2.5, z);
        scene.add(pole);
        const color = flagColors[Math.abs(z / 25) % flagColors.length];
        const flag = new THREE.Mesh(
          new THREE.BoxGeometry(1.6, 1, 0.08),
          new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.4 })
        );
        flag.position.set(x + 0.85, y + 4.4, z);
        scene.add(flag);
        animated.push((t) => {
          flag.rotation.y = Math.sin(t * 3 + z) * 0.3;
        });
      }
    }
    // big banner over the drop-in
    const banY = terrain.heightAt(0, 105);
    const banner = new THREE.Mesh(
      new THREE.BoxGeometry(46, 2.4, 0.6),
      new THREE.MeshStandardMaterial({ color: 0x6fe3ff, emissive: 0x6fe3ff, emissiveIntensity: 0.9 })
    );
    banner.position.set(0, banY + 14, 105);
    scene.add(banner);
  }

  return { pads: [], gates, animated };
}

// ---------- puck ----------

export function buildPuckMesh(): THREE.Group {
  const g = new THREE.Group();
  const puckMat = new THREE.MeshStandardMaterial({ color: 0x14181f, roughness: 0.35, metalness: 0.4 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(PUCK_RADIUS, PUCK_RADIUS, PUCK_HEIGHT, 24), puckMat);
  body.castShadow = true;
  g.add(body);
  const bandMat = new THREE.MeshStandardMaterial({ color: 0x6fe3ff, emissive: 0x6fe3ff, emissiveIntensity: 0.9 });
  const band = new THREE.Mesh(new THREE.TorusGeometry(PUCK_RADIUS, 0.09, 8, 32), bandMat);
  band.rotation.x = Math.PI / 2;
  g.add(band);
  const glow = new THREE.PointLight(0x6fe3ff, 30, 18);
  glow.position.y = 1;
  g.add(glow);
  // beacon pillar so the puck is visible across the rink
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 1.1, 26, 12, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0x6fe3ff,
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false
    })
  );
  beam.position.y = 13;
  g.add(beam);
  return g;
}
