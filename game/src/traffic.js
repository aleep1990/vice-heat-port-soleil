// Traffic: cars that follow the street grid (waypoint steering, right-hand
// lanes, random turns at intersections) and pedestrians on the sidewalks
// who run from gunfire.
import * as THREE from 'three';
import { STREETS, TUNE, PALETTE } from './config.js';
import { Car } from './vehicles.js';

function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// Lane offset (right-hand traffic) for a direction of travel.
function laneOffset(axis, dir) {
  if (axis === 'x') return dir > 0 ? 3.6 : -3.6; // moving +x: right is +z
  return dir > 0 ? -3.6 : 3.6; // moving +z: right is -x
}

function headingFor(axis, dir) {
  if (axis === 'x') return dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  return dir > 0 ? 0 : Math.PI;
}

class TrafficCar {
  constructor(scene, world, fx, rng) {
    const color = rng.pick(PALETTE.cars);
    this.car = new Car(scene, world, fx, { color, x: 0, z: 0 });
    this.rng = rng;
    this.cruise = rng.range(8, 13);
    this.axis = 'x';
    this.dir = 1;
    this.line = 0;
    this.target = new THREE.Vector3();
    this.respawn(true);
  }

  respawn(initial = false) {
    const rng = this.rng;
    this.axis = rng.chance(0.5) ? 'x' : 'z';
    this.dir = rng.chance(0.5) ? 1 : -1;
    this.line = rng.pick(STREETS);
    const along = rng.range(-280, 280);
    const off = laneOffset(this.axis, this.dir);
    if (this.axis === 'x') {
      this.car.pos.set(along, 0, this.line + off);
    } else {
      this.car.pos.set(this.line + off, 0, along);
    }
    this.car.heading = headingFor(this.axis, this.dir);
    this.car.speed = initial ? this.cruise : 0;
    this.pickNextWaypoint();
  }

  // Next intersection ahead, with the lane offset of the (possibly new) leg.
  pickNextWaypoint() {
    const rng = this.rng;
    const pos = this.car.pos;
    const step = 72;
    let nx;
    let nz;
    let nAxis = this.axis;
    let nDir = this.dir;
    let nLine = this.line;
    // Current position along the road.
    const along = this.axis === 'x' ? pos.x : pos.z;
    // Next intersection coordinate in the direction of travel.
    let nextCoord = Math.ceil((along + 0.1) / step) * step;
    if (this.dir < 0) nextCoord = Math.floor((along - 0.1) / step) * step;
    nextCoord = Math.max(-288, Math.min(288, nextCoord));
    if (rng.chance(0.32)) {
      // Turn at the intersection.
      nAxis = this.axis === 'x' ? 'z' : 'x';
      nDir = rng.chance(0.5) ? 1 : -1;
      nLine = nextCoord;
    }
    const off = laneOffset(nAxis, nDir);
    if (nAxis === 'x') {
      nx = nextCoord + nDir * step;
      nz = nLine + off;
    } else {
      nx = nLine + off;
      nz = nextCoord + nDir * step;
    }
    // Clamp inside the city; if the leg would leave it, keep going straight.
    if (Math.abs(nx) > 292 || Math.abs(nz) > 292) {
      nAxis = this.axis;
      nDir = this.dir;
      nLine = this.line;
      const off2 = laneOffset(nAxis, nDir);
      if (nAxis === 'x') {
        nx = nextCoord + nDir * step;
        nz = nLine + off2;
      } else {
        nx = nLine + off2;
        nz = nextCoord + nDir * step;
      }
      if (Math.abs(nx) > 292 || Math.abs(nz) > 292) {
        // At the edge: turn around.
        nDir = -this.dir;
        const off3 = laneOffset(nAxis, nDir);
        if (nAxis === 'x') {
          nx = along + nDir * step;
          nz = nLine + off3;
        } else {
          nx = nLine + off3;
          nz = along + nDir * step;
        }
      }
    }
    this.axis = nAxis;
    this.dir = nDir;
    this.line = nLine;
    this.target.set(nx, 0, nz);
  }

  update(dt, world, others) {
    if (this.stolen) return;
    const car = this.car;
    const dx = this.target.x - car.pos.x;
    const dz = this.target.z - car.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 5) this.pickNextWaypoint();
    const desired = Math.atan2(dx, dz);
    const steer = Math.max(-1, Math.min(1, angleDiff(car.heading, desired) * 1.6));
    // Brake if a car is close ahead.
    let blocked = false;
    for (const o of others) {
      if (o === car) continue;
      const ox = o.pos.x - car.pos.x;
      const oz = o.pos.z - car.pos.z;
      const d = Math.hypot(ox, oz);
      if (d < 10 && d > 0.01) {
        const f = car.forward();
        if ((ox * f.x + oz * f.z) / d > 0.6) {
          blocked = true;
          break;
        }
      }
    }
    const throttle = blocked ? 0 : car.speed < this.cruise ? 0.55 : 0;
    car.update(dt, { throttle, steer, brake: blocked }, others);
    // Keep on the road: if pushed off (collision), snap back to the lane.
    if (!world.isOnRoad(car.pos.x, car.pos.z) && Math.abs(car.speed) < 2) {
      this.respawn();
    }
  }
}

class Pedestrian {
  constructor(scene, world, rng) {
    this.rng = rng;
    this.world = world;
    this.speed = rng.range(1.2, 2.1);
    this.group = new THREE.Group();
    const shirt = new THREE.MeshStandardMaterial({ color: rng.pick(PALETTE.pedShirts), roughness: 0.9 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.75, 4, 8), shirt);
    body.position.y = 0.95;
    body.castShadow = true;
    this.group.add(body);
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.24, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xd9a077, roughness: 0.7 }),
    );
    head.position.y = 1.68;
    head.castShadow = true;
    this.group.add(head);
    scene.add(this.group);
    this.fleeUntil = 0;
    this.target = new THREE.Vector3();
    this.respawn();
  }

  respawn() {
    this.dead = false;
    this.deadTimer = 0;
    this.group.visible = true;
    this.group.rotation.x = 0;
    const p = this.world.randomSidewalkPoint(this.rng);
    this.group.position.set(p.x, 0, p.z);
    this.pickTarget();
  }

  pickTarget() {
    const p = this.world.randomSidewalkPoint(this.rng);
    this.target.set(p.x, 0, p.z);
  }

  fleeFrom(pos, now) {
    const dx = this.group.position.x - pos.x;
    const dz = this.group.position.z - pos.z;
    const d = Math.hypot(dx, dz) || 1;
    this.target.set(
      this.group.position.x + (dx / d) * 40,
      0,
      this.group.position.z + (dz / d) * 40,
    );
    this.fleeUntil = now + 3;
  }

  update(dt, now) {
    const pos = this.group.position;
    if (this.dead) {
      this.deadTimer -= dt;
      if (this.deadTimer <= 0) this.group.visible = false;
      return;
    }
    const dx = this.target.x - pos.x;
    const dz = this.target.z - pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 1.5) {
      this.pickTarget();
      return;
    }
    const fleeing = now < this.fleeUntil;
    const speed = fleeing ? 4.4 : this.speed;
    pos.x += (dx / dist) * speed * dt;
    pos.z += (dz / dist) * speed * dt;
    const p = { x: pos.x, z: pos.z };
    this.world.collideCircle(p, 0.5);
    pos.x = p.x;
    pos.z = p.z;
    this.group.rotation.y = Math.atan2(dx, dz);
    pos.y = Math.abs(Math.sin(now * (fleeing ? 11 : 7))) * 0.04;
  }
}

export function createTraffic(scene, world, fx, rng) {
  const cars = [];
  for (let i = 0; i < TUNE.trafficCount; i += 1) {
    cars.push(new TrafficCar(scene, world, fx, rng));
  }
  const peds = [];
  for (let i = 0; i < TUNE.pedCount; i += 1) {
    peds.push(new Pedestrian(scene, world, rng));
  }

  function allCars() {
    return cars.map((t) => t.car);
  }

  function notifyGunshot(pos, now) {
    for (const ped of peds) {
      const d = Math.hypot(ped.group.position.x - pos.x, ped.group.position.z - pos.z);
      if (d < 32) ped.fleeFrom(pos, now);
    }
  }

  function update(dt, now, extraCars = []) {
    const others = [...allCars(), ...extraCars];
    for (const t of cars) t.update(dt, world, others);
    for (const ped of peds) ped.update(dt, now);
  }

  function markStolen(car) {
    for (const t of cars) {
      if (t.car === car) {
        t.stolen = true;
        return;
      }
    }
  }

  function reset() {
    for (const t of cars) t.respawn(true);
    for (const ped of peds) ped.respawn();
  }

  return { cars, peds, allCars, notifyGunshot, update, reset, markStolen };
}
