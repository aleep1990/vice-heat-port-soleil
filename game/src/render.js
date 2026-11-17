// Rendering only: the WebGL renderer, sun + sky + clouds, and the small
// effects pool (smoke, sparks, muzzle flash, tracers) the gameplay calls on.
import * as THREE from 'three';

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
  return renderer;
}

export function createSky(scene, rng) {
  scene.background = new THREE.Color(0x8ec8e8);
  scene.fog = new THREE.Fog(0x9fc8e0, 240, 980);

  const sun = new THREE.DirectionalLight(0xfff2d9, 2.7);
  sun.position.set(190, 270, 130);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -340;
  sun.shadow.camera.right = 340;
  sun.shadow.camera.top = 340;
  sun.shadow.camera.bottom = -340;
  sun.shadow.camera.near = 20;
  sun.shadow.camera.far = 800;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5f, 0.75));

  // Sun disc + drifting clouds.
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(26, 24),
    new THREE.MeshBasicMaterial({ color: 0xfff6cf, fog: false }),
  );
  disc.position.set(420, 320, 300);
  disc.lookAt(0, 0, 0);
  scene.add(disc);

  const clouds = [];
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.92 });
  for (let i = 0; i < 9; i += 1) {
    const cloud = new THREE.Group();
    const puffs = 3 + Math.floor(rng.next() * 3);
    for (let p = 0; p < puffs; p += 1) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(rng.range(7, 15), 8, 6), cloudMat);
      s.position.set(rng.range(-16, 16), rng.range(-2, 3), rng.range(-6, 6));
      s.scale.y = 0.55;
      cloud.add(s);
    }
    cloud.position.set(rng.range(-420, 420), rng.range(110, 160), rng.range(-420, 420));
    scene.add(cloud);
    clouds.push(cloud);
  }

  function update(dt) {
    for (const cloud of clouds) {
      cloud.position.x += dt * 1.6;
      if (cloud.position.x > 460) cloud.position.x = -460;
    }
  }
  return { update };
}

// Pooled smoke puffs, sparks and tracers, plus one muzzle light.
export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.smoke = [];
    const smokeGeo = new THREE.SphereGeometry(0.9, 6, 5);
    for (let i = 0; i < 24; i += 1) {
      const m = new THREE.Mesh(
        smokeGeo,
        new THREE.MeshBasicMaterial({ color: 0x555550, transparent: true, opacity: 0 }),
      );
      m.visible = false;
      scene.add(m);
      this.smoke.push({ mesh: m, life: 0, vel: new THREE.Vector3() });
    }
    this.sparks = [];
    const sparkGeo = new THREE.BoxGeometry(0.22, 0.22, 0.22);
    for (let i = 0; i < 24; i += 1) {
      const m = new THREE.Mesh(
        sparkGeo,
        new THREE.MeshBasicMaterial({ color: 0xffc861 }),
      );
      m.visible = false;
      scene.add(m);
      this.sparks.push({ mesh: m, life: 0, vel: new THREE.Vector3() });
    }
    this.tracers = [];
    const tracerGeo = new THREE.BoxGeometry(0.08, 0.08, 1);
    for (let i = 0; i < 8; i += 1) {
      const m = new THREE.Mesh(
        tracerGeo,
        new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0 }),
      );
      m.visible = false;
      scene.add(m);
      this.tracers.push({ mesh: m, life: 0 });
    }
    this.muzzle = new THREE.PointLight(0xffc861, 0, 26, 1.6);
    scene.add(this.muzzle);
  }

  spawnSmoke(pos, count = 3) {
    let placed = 0;
    for (const p of this.smoke) {
      if (placed >= count) break;
      if (p.life > 0) continue;
      p.life = 1;
      p.mesh.visible = true;
      p.mesh.position.set(pos.x + (Math.random() - 0.5), pos.y + 0.6 + Math.random(), pos.z + (Math.random() - 0.5));
      p.mesh.scale.setScalar(0.7 + Math.random() * 0.8);
      p.vel.set((Math.random() - 0.5) * 1.2, 1.4 + Math.random(), (Math.random() - 0.5) * 1.2);
      placed += 1;
    }
  }

  spawnSparks(pos, count = 6) {
    let placed = 0;
    for (const p of this.sparks) {
      if (placed >= count) break;
      if (p.life > 0) continue;
      p.life = 0.45;
      p.mesh.visible = true;
      p.mesh.position.copy(pos);
      p.vel.set((Math.random() - 0.5) * 14, Math.random() * 8 + 2, (Math.random() - 0.5) * 14);
      placed += 1;
    }
  }

  muzzleFlash(pos) {
    this.muzzle.position.copy(pos);
    this.muzzle.intensity = 60;
  }

  tracer(from, to) {
    for (const t of this.tracers) {
      if (t.life > 0) continue;
      t.life = 0.12;
      t.mesh.visible = true;
      const mid = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);
      t.mesh.position.copy(mid);
      t.mesh.lookAt(to);
      t.mesh.scale.set(1, 1, from.distanceTo(to));
      t.mesh.material.opacity = 0.9;
      return;
    }
  }

  update(dt) {
    for (const p of this.smoke) {
      if (p.life <= 0) continue;
      p.life -= dt * 0.55;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.scale.multiplyScalar(1 + dt * 0.9);
      p.mesh.material.opacity = Math.max(0, p.life * 0.42);
      if (p.life <= 0) p.mesh.visible = false;
    }
    for (const p of this.sparks) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.vel.y -= 22 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      if (p.life <= 0) p.mesh.visible = false;
    }
    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      t.mesh.material.opacity = Math.max(0, t.life / 0.12) * 0.9;
      if (t.life <= 0) t.mesh.visible = false;
    }
    if (this.muzzle.intensity > 0) this.muzzle.intensity = Math.max(0, this.muzzle.intensity - dt * 420);
  }
}
