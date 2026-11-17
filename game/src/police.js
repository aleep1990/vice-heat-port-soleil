// Wanted level and the police who answer it: pursuit cars that ram, foot
// cops at high heat, heat decay when the player lies low, and the BUSTED timer.
import * as THREE from 'three';
import { TUNE } from './config.js';
import { Car } from './vehicles.js';

function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function makeCopMesh(scene) {
  const group = new THREE.Group();
  const uniform = new THREE.MeshStandardMaterial({ color: 0x1f3a5f, roughness: 0.85 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.8, 4, 8), uniform);
  body.position.y = 1.0;
  body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.25, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xd9a077, roughness: 0.7 }),
  );
  head.position.y = 1.78;
  head.castShadow = true;
  group.add(head);
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.27, 0.28, 0.12, 10),
    new THREE.MeshStandardMaterial({ color: 0x14263e, roughness: 0.8 }),
  );
  cap.position.y = 1.98;
  group.add(cap);
  scene.add(group);
  return group;
}

export function createPolice(scene, world, fx, rng, hooks) {
  const policeCars = [];
  const cops = [];
  let wanted = 0;
  let lastCrimeAt = -1000;
  let bustedTimer = 0;

  function spawnPositionNear(playerPos) {
    for (let i = 0; i < 10; i += 1) {
      const p = world.randomRoadPoint(rng);
      const d = Math.hypot(p.x - playerPos.x, p.z - playerPos.z);
      if (d > 45 && d < 90) return p;
    }
    const p = world.randomRoadPoint(rng);
    return p;
  }

  function setWanted(level, now) {
    wanted = Math.max(0, Math.min(5, level));
    if (level > 0) lastCrimeAt = now;
  }

  function addHeat(n, now) {
    setWanted(wanted + n, now);
  }

  function update(dt, now, player, playerCar, allCars) {
    const playerPos = playerCar ? playerCar.pos : player.pos;
    // Heat decays: after 14 quiet seconds, one star fades every 7 seconds,
    // but only while no police car is close.
    const nearPolice = policeCars.some(
      (c) => Math.hypot(c.pos.x - playerPos.x, c.pos.z - playerPos.z) < 42,
    );
    if (wanted > 0 && now - lastCrimeAt > TUNE.wantedDecaySeconds && !nearPolice) {
      setWanted(wanted - 1, now - 7);
    }

    // Match the car count to the wanted level.
    while (policeCars.length < wanted) {
      const p = spawnPositionNear(playerPos);
      const car = new Car(scene, world, fx, { police: true, x: p.x, z: p.z, heading: 0 });
      policeCars.push(car);
    }
    while (policeCars.length > wanted) {
      const car = policeCars.pop();
      car.remove(scene);
    }

    // Pursuit: steer at the player, ram on contact (car-car push does the rest).
    for (const car of policeCars) {
      const dx = playerPos.x - car.pos.x;
      const dz = playerPos.z - car.pos.z;
      const dist = Math.hypot(dx, dz);
      const desired = Math.atan2(dx, dz);
      const steer = Math.max(-1, Math.min(1, angleDiff(car.heading, desired) * 1.9));
      const throttle = dist > 4 ? 1 : 0.55;
      car.update(dt, { throttle, steer, brake: false }, allCars);
      car.flashLights(now);
      // Despawn a car that fell far behind.
      if (dist > 190) {
        const p = spawnPositionNear(playerPos);
        car.pos.set(p.x, 0, p.z);
        car.speed = 0;
      }
    }

    // Foot cops at wanted 3+.
    const wantCops = wanted >= 3 ? 2 : 0;
    while (cops.length < wantCops) {
      const mesh = makeCopMesh(scene);
      const p = spawnPositionNear(playerPos);
      mesh.position.set(p.x, 0, p.z);
      cops.push({ mesh, speed: 5.4 });
    }
    while (cops.length > wantCops) {
      const cop = cops.pop();
      scene.remove(cop.mesh);
    }
    for (const cop of cops) {
      const dx = playerPos.x - cop.mesh.position.x;
      const dz = playerPos.z - cop.mesh.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.1) {
        cop.mesh.position.x += (dx / dist) * cop.speed * dt;
        cop.mesh.position.z += (dz / dist) * cop.speed * dt;
        cop.mesh.rotation.y = Math.atan2(dx, dz);
      }
      if (dist < 1.9 && !playerCar) {
        if (hooks.onPlayerDamage) hooks.onPlayerDamage(TUNE.goonDamage * dt * 1.4, now);
      }
    }

    // BUSTED: on foot, a police car sits on the player while they crawl.
    if (!playerCar && wanted > 0) {
      const pinned = policeCars.some((c) => {
        const d = Math.hypot(c.pos.x - player.pos.x, c.pos.z - player.pos.z);
        return d < 5.5 && Math.abs(c.speed) < 4;
      });
      if (pinned && player.speedNow < 1.2) {
        bustedTimer += dt;
        if (bustedTimer > TUNE.bustedSeconds && hooks.onBusted) hooks.onBusted();
      } else {
        bustedTimer = Math.max(0, bustedTimer - dt * 2);
      }
    } else {
      bustedTimer = 0;
    }
  }

  function reset() {
    for (const car of policeCars) car.remove(scene);
    policeCars.length = 0;
    for (const cop of cops) scene.remove(cop.mesh);
    cops.length = 0;
    wanted = 0;
    bustedTimer = 0;
    lastCrimeAt = -1000;
  }

  return {
    get wanted() {
      return wanted;
    },
    get bustedProgress() {
      return Math.min(1, bustedTimer / TUNE.bustedSeconds);
    },
    policeCars,
    cops,
    setWanted,
    addHeat,
    update,
    reset,
  };
}
