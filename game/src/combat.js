// Combat: raycast pistol fire from the crosshair, muzzle flash, tracers,
// sparks, and the armed goons who guard the mission targets.
import * as THREE from 'three';
import { TUNE } from './config.js';

const raycaster = new THREE.Raycaster();

function makeGoonMesh(scene) {
  const group = new THREE.Group();
  const jacket = new THREE.MeshStandardMaterial({ color: 0x3a2e2e, roughness: 0.9 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.85, 4, 8), jacket);
  body.position.y = 1.05;
  body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.26, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xc98f66, roughness: 0.7 }),
  );
  head.position.y = 1.8;
  head.castShadow = true;
  group.add(head);
  const band = new THREE.Mesh(
    new THREE.BoxGeometry(0.54, 0.1, 0.54),
    new THREE.MeshStandardMaterial({ color: 0xa02020, roughness: 0.8 }),
  );
  band.position.y = 1.92;
  group.add(band);
  const gun = new THREE.Mesh(
    new THREE.BoxGeometry(0.09, 0.14, 0.45),
    new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4, metalness: 0.6 }),
  );
  gun.position.set(0.4, 1.05, 0.3);
  group.add(gun);
  scene.add(group);
  return { group, body };
}

export function createCombat(scene, world, fx, audio, hooks) {
  const shootables = new Map(); // mesh -> { health, onDamage, onDeath, kind }
  const goons = [];

  function register(mesh, entry) {
    shootables.set(mesh, { health: entry.health ?? 100, ...entry });
  }

  function unregister(mesh) {
    shootables.delete(mesh);
  }

  // Fire from the camera through the crosshair. Returns the hit entry or null.
  function shoot(origin, dir) {
    raycaster.set(origin, dir);
    raycaster.far = TUNE.gunRange;
    const meshes = [...shootables.keys()];
    const hits = raycaster.intersectObjects(meshes, false);
    const muzzlePos = origin.clone().addScaledVector(dir, 1.2);
    fx.muzzleFlash(muzzlePos);
    if (audio) audio.shoot();
    if (hits.length === 0) return null;
    const hit = hits[0];
    const entry = shootables.get(hit.object);
    const end = hit.point.clone();
    fx.tracer(muzzlePos, end);
    fx.spawnSparks(end, 5);
    if (entry) {
      entry.health -= TUNE.gunDamage;
      if (entry.onDamage) entry.onDamage(TUNE.gunDamage, hit.point);
      if (entry.health <= 0 && entry.onDeath) {
        entry.onDeath(hit.point);
        shootables.delete(hit.object);
      }
    }
    return { entry, point: hit.point };
  }

  function spawnGoons(positions) {
    for (const pos of positions) {
      const { group, body } = makeGoonMesh(scene);
      group.position.set(pos.x, 0, pos.z);
      const goon = {
        group,
        body,
        health: 100,
        shootTimer: 1 + Math.random() * 0.8,
        dead: false,
        deadTimer: 0,
      };
      register(body, {
        health: 100,
        kind: 'goon',
        onDamage: () => {},
        onDeath: () => {
          goon.dead = true;
          goon.deadTimer = 2.5;
          goon.group.rotation.x = -Math.PI / 2;
          goon.group.position.y = 0.4;
          fx.spawnSmoke(goon.group.position, 2);
        },
      });
      goons.push(goon);
    }
  }

  function goonsAlive() {
    return goons.filter((g) => !g.dead).length;
  }

  function update(dt, now, playerPos, playerAlive) {
    for (const goon of goons) {
      if (goon.dead) {
        goon.deadTimer -= dt;
        continue;
      }
      const dx = playerPos.x - goon.group.position.x;
      const dz = playerPos.z - goon.group.position.z;
      const dist = Math.hypot(dx, dz);
      if (!playerAlive) continue;
      if (dist < 36) {
        goon.group.rotation.y = Math.atan2(dx, dz);
        goon.shootTimer -= dt;
        if (goon.shootTimer <= 0) {
          goon.shootTimer = 1.3 + Math.random() * 0.7;
          // Hit chance falls with distance; a hit hurts.
          const chance = Math.max(0.12, 0.5 - dist * 0.011);
          if (Math.random() < chance && hooks.onPlayerDamage) {
            hooks.onPlayerDamage(TUNE.goonDamage, now);
          }
          fx.muzzleFlash(goon.group.position.clone().setY(1.3));
          if (audio) audio.enemyShoot();
        }
      }
    }
    // Remove long-dead goons.
    for (let i = goons.length - 1; i >= 0; i -= 1) {
      if (goons[i].dead && goons[i].deadTimer <= 0) {
        scene.remove(goons[i].group);
        goons.splice(i, 1);
      }
    }
  }

  function reset() {
    for (const goon of goons) scene.remove(goon.group);
    goons.length = 0;
    shootables.clear();
  }

  return { register, unregister, shoot, spawnGoons, goonsAlive, update, reset, goons };
}
