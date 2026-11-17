// The city of Port Soleil: ground texture, buildings, palms, streetlights,
// beach and water, plus collision and road helpers for the other systems.
import * as THREE from 'three';
import { WORLD, STREETS, BLOCKS, PALETTE } from './config.js';

const S = 1024 / WORLD.ground; // ground-texture pixels per world unit
const X = (x) => (x + WORLD.ground / 2) * S;
const Z = (z) => (z + WORLD.ground / 2) * S;
const W = (w) => w * S;

function makeGroundTexture(rng) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 1024;
  const g = c.getContext('2d');
  // Base: park grass.
  g.fillStyle = '#77815f';
  g.fillRect(0, 0, 1024, 1024);
  // City slab: sidewalks.
  g.fillStyle = '#b3ac9c';
  g.fillRect(X(-296), Z(-296), W(592), W(592));
  // Streets: asphalt in both directions.
  g.fillStyle = '#34373d';
  for (const s of STREETS) {
    g.fillRect(X(s - 8), Z(-296), W(16), W(592));
    g.fillRect(X(-296), Z(s - 8), W(592), W(16));
  }
  // Lane dashes down every street centre.
  g.fillStyle = '#d8d2b8';
  for (const s of STREETS) {
    for (let t = -288; t < 288; t += 14) {
      g.fillRect(X(s - 0.7), Z(t), W(1.4), W(7));
      g.fillRect(X(t), Z(s - 0.7), W(7), W(1.4));
    }
  }
  // Crosswalks at every intersection.
  g.fillStyle = '#e8e4d4';
  for (const sx of STREETS) {
    for (const sz of STREETS) {
      for (let k = -3; k <= 3; k += 1) {
        g.fillRect(X(sx + k * 2 - 0.8), Z(sz - 11), W(1.6), W(6));
        g.fillRect(X(sx + k * 2 - 0.8), Z(sz + 5), W(1.6), W(6));
        g.fillRect(X(sx - 11), Z(sz + k * 2 - 0.8), W(6), W(1.6));
        g.fillRect(X(sx + 5), Z(sz + k * 2 - 0.8), W(6), W(1.6));
      }
    }
  }
  // Beach sand south of the city, wet band at the waterline.
  g.fillStyle = '#e6d199';
  g.fillRect(X(-360), Z(WORLD.beachZ0), W(720), W(WORLD.beachZ1 - WORLD.beachZ0));
  g.fillStyle = '#d9c48f';
  g.fillRect(X(-360), Z(WORLD.beachZ0), W(720), W(6));
  // North park: darker green with tree dots.
  g.fillStyle = '#6d7f57';
  g.fillRect(X(-360), Z(-360), W(720), W(64));
  g.fillStyle = '#5d7048';
  for (let i = 0; i < 60; i += 1) {
    g.beginPath();
    g.arc(X(rng.range(-350, 350)), Z(rng.range(-352, -304)), W(rng.range(3, 7)), 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function makeWindowTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 128, 256);
  g.fillStyle = '#2c3540';
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      g.fillRect(10 + col * 30, 12 + row * 30, 18, 20);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createWorld(scene, rng) {
  const group = new THREE.Group();
  scene.add(group);
  const windowTex = makeWindowTexture();

  // Ground.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.ground, WORLD.ground),
    new THREE.MeshStandardMaterial({ map: makeGroundTexture(rng), roughness: 0.95, metalness: 0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  // Water south of the beach + a foam strip at the waterline.
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(1500, 700),
    new THREE.MeshStandardMaterial({ color: 0x2e86ab, roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.94 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -0.4, WORLD.waterZ + 350);
  group.add(water);
  const foam = new THREE.Mesh(
    new THREE.PlaneGeometry(1400, 5),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 }),
  );
  foam.rotation.x = -Math.PI / 2;
  foam.position.set(0, -0.2, WORLD.waterZ + 2);
  group.add(foam);

  // Buildings, one or two per block, with rooftop boxes.
  const buildings = [];
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const roofGeo = new THREE.BoxGeometry(1, 1, 1);
  for (const bx of BLOCKS) {
    for (const bz of BLOCKS) {
      const dist = Math.hypot(bx, bz);
      const lots = [];
      for (const ox of [-15, 15]) {
        for (const oz of [-15, 15]) lots.push([bx + ox, bz + oz]);
      }
      // Shuffle lots, take 1-2.
      for (let i = lots.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rng.next() * (i + 1));
        [lots[i], lots[j]] = [lots[j], lots[i]];
      }
      const take = rng.chance(0.55) ? 2 : 1;
      for (let k = 0; k < take; k += 1) {
        const [cx, cz] = lots[k];
        const w = rng.range(17, 25);
        const d = rng.range(17, 25);
        const h = 10 + rng.range(0, 16) + (1 - dist / 420) * rng.range(8, 34);
        const color = rng.pick(PALETTE.buildings);
        const tex = windowTex.clone();
        tex.needsUpdate = true;
        tex.repeat.set(Math.max(1, Math.round(w / 7)), Math.max(1, Math.round(h / 9)));
        const mat = new THREE.MeshStandardMaterial({ color, map: tex, roughness: 0.9, metalness: 0 });
        const mesh = new THREE.Mesh(unitBox, mat);
        mesh.scale.set(w, h, d);
        mesh.position.set(cx, h / 2, cz);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
        const roof = new THREE.Mesh(
          roofGeo,
          new THREE.MeshStandardMaterial({ color: rng.pick(PALETTE.roofs), roughness: 1 }),
        );
        roof.scale.set(w * 0.36, 1.6, d * 0.36);
        roof.position.set(cx + rng.range(-3, 3), h + 0.8, cz + rng.range(-3, 3));
        roof.castShadow = true;
        group.add(roof);
        buildings.push({ x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2, h });
      }
    }
  }

  // Palms along the sidewalks.
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.38, 6.5, 6);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 1 });
  const frondGeo = new THREE.ConeGeometry(0.55, 2.6, 4);
  const frondMat = new THREE.MeshStandardMaterial({ color: 0x3d8b4f, roughness: 0.9 });
  for (let i = 0; i < 46; i += 1) {
    const along = rng.pick(STREETS);
    const t = rng.range(-280, 280);
    const side = rng.chance(0.5) ? 1 : -1;
    const horizontal = rng.chance(0.5);
    const px = horizontal ? t : along + side * 11;
    const pz = horizontal ? along + side * 11 : t;
    if (Math.abs(px) > 292 || Math.abs(pz) > 292) continue;
    const palm = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 3.25;
    trunk.castShadow = true;
    palm.add(trunk);
    for (let f = 0; f < 6; f += 1) {
      const frond = new THREE.Mesh(frondGeo, frondMat);
      const a = (f / 6) * Math.PI * 2;
      frond.position.set(Math.cos(a) * 1.1, 6.9, Math.sin(a) * 1.1);
      frond.rotation.set(Math.sin(a) * 1.1, 0, -Math.cos(a) * 1.1);
      frond.castShadow = true;
      palm.add(frond);
    }
    palm.position.set(px, 0, pz);
    group.add(palm);
  }

  // Streetlights at intersections.
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.14, 7, 6);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x3a3f45, roughness: 0.6, metalness: 0.5 });
  const lampGeo = new THREE.SphereGeometry(0.35, 8, 6);
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xffe9a8, emissive: 0xffdf8a, emissiveIntensity: 0.9 });
  for (const sx of STREETS) {
    for (const sz of STREETS) {
      if ((sx + sz) % 144 !== 0) continue;
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(sx + 9.5, 3.5, sz + 9.5);
      pole.castShadow = true;
      group.add(pole);
      const lamp = new THREE.Mesh(lampGeo, lampMat);
      lamp.position.set(sx + 9.5, 7.1, sz + 9.5);
      group.add(lamp);
    }
  }

  // Beach umbrellas.
  const umbMat = new THREE.MeshStandardMaterial({ color: 0xe74c3c, roughness: 0.8 });
  const umbPoleMat = new THREE.MeshStandardMaterial({ color: 0xd8cfc0, roughness: 0.8 });
  for (let i = 0; i < 7; i += 1) {
    const ux = rng.range(-260, 260);
    const uz = rng.range(308, 348);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 3, 6), umbPoleMat);
    pole.position.set(ux, 1.5, uz);
    group.add(pole);
    const top = new THREE.Mesh(new THREE.ConeGeometry(2.6, 1.1, 8), umbMat);
    top.position.set(ux, 3.4, uz);
    top.castShadow = true;
    group.add(top);
  }

  // Circle (x, z, radius) vs building AABBs: push the circle out, report a hit.
  function collideCircle(p, r) {
    let hit = false;
    for (const b of buildings) {
      const nx = Math.max(b.x0, Math.min(p.x, b.x1));
      const nz = Math.max(b.z0, Math.min(p.z, b.z1));
      const dx = p.x - nx;
      const dz = p.z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      hit = true;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        p.x = nx + (dx / d) * r;
        p.z = nz + (dz / d) * r;
      } else {
        // Centre inside the box: push out along the smallest overlap.
        const ox = Math.min(p.x - b.x0, b.x1 - p.x) + r;
        const oz = Math.min(p.z - b.z0, b.z1 - p.z) + r;
        if (ox < oz) p.x = p.x - b.x0 < b.x1 - p.x ? b.x0 - r : b.x1 + r;
        else p.z = p.z - b.z0 < b.z1 - p.z ? b.z0 - r : b.z1 + r;
      }
    }
    return hit;
  }

  function randomRoadPoint(rng2) {
    const horizontal = rng2.chance(0.5);
    const line = rng2.pick(STREETS);
    const along = rng2.range(-280, 280);
    const lane = rng2.chance(0.5) ? 3.6 : -3.6;
    return horizontal ? { x: along, z: line + lane, axis: 'x', dir: lane > 0 ? 1 : -1 } : { x: line + lane, z: along, axis: 'z', dir: lane > 0 ? -1 : 1 };
  }

  function randomSidewalkPoint(rng2) {
    const bx = rng2.pick(BLOCKS);
    const bz = rng2.pick(BLOCKS);
    const edge = rng2.int(0, 3);
    const t = rng2.range(-24, 24);
    if (edge === 0) return { x: bx + t, z: bz - 31 };
    if (edge === 1) return { x: bx + t, z: bz + 31 };
    if (edge === 2) return { x: bx - 31, z: bz + t };
    return { x: bx + 31, z: bz + t };
  }

  function isOnRoad(x, z) {
    for (const s of STREETS) {
      if (Math.abs(x - s) < 8 || Math.abs(z - s) < 8) return true;
    }
    return false;
  }

  function update(_dt, t) {
    foam.material.opacity = 0.3 + 0.18 * Math.sin(t * 1.3);
  }

  return { group, buildings, collideCircle, randomRoadPoint, randomSidewalkPoint, isOnRoad, update };
}
