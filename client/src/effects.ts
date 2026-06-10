// Particle effects + camera shake.

import * as THREE from 'three';

interface Particle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  size: number;
}

export class ParticleSystem {
  private particles: Particle[] = [];
  private points: THREE.Points;
  private geo: THREE.BufferGeometry;
  private readonly MAX = 1200;

  constructor(scene: THREE.Scene, color: number, size = 0.5) {
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.MAX * 3), 3));
    const mat = new THREE.PointsMaterial({
      color,
      size,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  emit(pos: THREE.Vector3, vel: THREE.Vector3, spread: number, life: number, count: number): void {
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.MAX) this.particles.shift();
      this.particles.push({
        pos: pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5)),
        vel: vel.clone().add(new THREE.Vector3((Math.random() - 0.5) * spread, Math.random() * spread * 0.7, (Math.random() - 0.5) * spread)),
        life,
        maxLife: life,
        size: 1
      });
    }
  }

  burst(pos: THREE.Vector3, speed: number, count: number, life = 1.2): void {
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.MAX) this.particles.shift();
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize();
      this.particles.push({
        pos: pos.clone(),
        vel: dir.multiplyScalar(speed * (0.4 + Math.random() * 0.6)),
        life: life * (0.5 + Math.random() * 0.5),
        maxLife: life,
        size: 1
      });
    }
  }

  update(dt: number): void {
    const arr = this.geo.attributes.position.array as Float32Array;
    let n = 0;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vel.y -= 9 * dt;
      p.vel.multiplyScalar(1 - 1.5 * dt);
      p.pos.addScaledVector(p.vel, dt);
      arr[n * 3] = p.pos.x;
      arr[n * 3 + 1] = p.pos.y;
      arr[n * 3 + 2] = p.pos.z;
      n++;
    }
    // park unused slots far away
    for (let i = n; i < this.MAX; i++) {
      arr[i * 3 + 1] = -9999;
    }
    this.geo.attributes.position.needsUpdate = true;
  }
}

export class CameraShake {
  private trauma = 0;

  add(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  /** Returns offset to add to the camera. */
  update(dt: number): THREE.Vector3 {
    this.trauma = Math.max(0, this.trauma - dt * 1.8);
    const s = this.trauma * this.trauma;
    const t = performance.now() * 0.02;
    return new THREE.Vector3(
      Math.sin(t * 1.1) * s * 0.5,
      Math.sin(t * 1.7 + 2) * s * 0.4,
      Math.sin(t * 1.3 + 4) * s * 0.5
    );
  }
}
