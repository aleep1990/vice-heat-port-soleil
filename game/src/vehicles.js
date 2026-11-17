// Cars: a low-poly factory (body, cabin, wheels, lights, police light bar)
// and one arcade Car class used by the player, traffic and the police.
import * as THREE from 'three';
import { TUNE, PALETTE } from './config.js';

const bodyGeo = new THREE.BoxGeometry(2.1, 0.62, 4.4);
const cabinGeo = new THREE.BoxGeometry(1.8, 0.55, 2.2);
const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10);
const lightGeo = new THREE.BoxGeometry(0.42, 0.16, 0.08);
const barGeo = new THREE.BoxGeometry(1.1, 0.18, 0.5);
const glassMat = new THREE.MeshStandardMaterial({ color: 0x1c2733, roughness: 0.15, metalness: 0.7 });
const tyreMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.95 });
const headMat = new THREE.MeshStandardMaterial({ color: 0xfff6c9, emissive: 0xffedb0, emissiveIntensity: 1.4 });
const tailMat = new THREE.MeshStandardMaterial({ color: 0xc0392b, emissive: 0x7a1a12, emissiveIntensity: 1.2 });

export function createCarMesh(color, police = false) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({
    color: police ? PALETTE.policeBody : color,
    roughness: 0.35,
    metalness: 0.55,
  });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 0.55;
  body.castShadow = true;
  group.add(body);
  const cabin = new THREE.Mesh(cabinGeo, glassMat);
  cabin.position.set(0, 1.1, -0.25);
  cabin.castShadow = true;
  group.add(cabin);
  if (police) {
    const trim = new THREE.Mesh(new THREE.BoxGeometry(2.12, 0.22, 4.42), new THREE.MeshStandardMaterial({ color: PALETTE.policeTrim, roughness: 0.5 }));
    trim.position.y = 0.42;
    group.add(trim);
  }
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const wheel = new THREE.Mesh(wheelGeo, tyreMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.42, wz);
    wheel.castShadow = true;
    group.add(wheel);
    wheels.push(wheel);
  }
  const hl = new THREE.Mesh(lightGeo, headMat);
  hl.position.set(-0.6, 0.62, 2.21);
  group.add(hl);
  const hr = hl.clone();
  hr.position.x = 0.6;
  group.add(hr);
  const tl = new THREE.Mesh(lightGeo, tailMat);
  tl.position.set(-0.6, 0.62, -2.21);
  group.add(tl);
  const tr = tl.clone();
  tr.position.x = 0.6;
  group.add(tr);

  let lightRed = null;
  let lightBlue = null;
  if (police) {
    const bar = new THREE.Mesh(barGeo, new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.4 }));
    bar.position.set(0, 1.48, -0.25);
    group.add(bar);
    lightRed = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.14, 0.4),
      new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff0000, emissiveIntensity: 0 }),
    );
    lightRed.position.set(-0.28, 1.6, -0.25);
    group.add(lightRed);
    lightBlue = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.14, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x2266ff, emissive: 0x0044ff, emissiveIntensity: 0 }),
    );
    lightBlue.position.set(0.28, 1.6, -0.25);
    group.add(lightBlue);
  }
  return { group, wheels, body, lightRed, lightBlue };
}

export class Car {
  constructor(scene, world, fx, opts = {}) {
    this.world = world;
    this.fx = fx;
    this.police = !!opts.police;
    this.sport = !!opts.sport;
    this.color = opts.color ?? 0x888888;
    this.pos = new THREE.Vector3(opts.x ?? 0, 0, opts.z ?? 0);
    this.heading = opts.heading ?? 0;
    this.speed = 0;
    this.steer = 0;
    this.damage = 0;
    this.dead = false;
    this.maxSpeed = (this.sport ? 1.18 : 1) * TUNE.carMaxSpeed;
    if (this.police) this.maxSpeed = TUNE.policeMaxSpeed;
    const built = createCarMesh(this.color, this.police);
    this.group = built.group;
    this.bodyMesh = built.body;
    this.wheels = built.wheels;
    this.lightRed = built.lightRed;
    this.lightBlue = built.lightBlue;
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.heading;
    scene.add(this.group);
  }

  forward() {
    return { x: Math.sin(this.heading), z: Math.cos(this.heading) };
  }

  // control: { throttle: -1..1, steer: -1..1, brake: bool }. others: other cars
  // for car-car collision. Returns 'wall' when a building was hit hard.
  update(dt, control, others = []) {
    // A wrecked car coasts to a stop and stays an obstacle.
    if (this.dead) {
      this.speed -= this.speed * 2 * dt;
      const f = this.forward();
      this.pos.x += f.x * this.speed * dt;
      this.pos.z += f.z * this.speed * dt;
      this.group.position.set(this.pos.x, 0, this.pos.z);
      return false;
    }
    const maxFwd = this.maxSpeed;
    if (control.throttle > 0) this.speed += TUNE.carAccel * control.throttle * dt;
    else if (control.throttle < 0) {
      if (this.speed > 0.5) this.speed -= TUNE.carBrake * dt;
      else this.speed += TUNE.carReverseAccel * control.throttle * dt;
    }
    if (control.brake) this.speed -= Math.sign(this.speed) * TUNE.carBrake * dt;
    // Drag + rolling resistance.
    this.speed -= this.speed * TUNE.carDrag * dt;
    if (Math.abs(this.speed) < 0.08 && control.throttle === 0) this.speed = 0;
    this.speed = Math.max(-TUNE.carMaxReverse, Math.min(maxFwd, this.speed));

    const targetSteer = control.steer * TUNE.steerMax;
    this.steer += (targetSteer - this.steer) * Math.min(1, dt * TUNE.steerSpeed * 2.4);
    const speedFactor = Math.max(-1, Math.min(1, this.speed / 12));
    this.heading += this.steer * speedFactor * dt * 1.9;

    const f = this.forward();
    this.pos.x += f.x * this.speed * dt;
    this.pos.z += f.z * this.speed * dt;

    // Buildings.
    const p = { x: this.pos.x, z: this.pos.z };
    const hitWall = this.world.collideCircle(p, TUNE.carRadius);
    if (hitWall) {
      const hard = Math.abs(this.speed) > 9;
      this.pos.x = p.x;
      this.pos.z = p.z;
      if (hard) {
        this.damage += 12;
        this.fx.spawnSparks(new THREE.Vector3(this.pos.x, 0.8, this.pos.z), 5);
      }
      this.speed *= 0.35;
    }
    // Other cars: soft circle push.
    for (const other of others) {
      if (other === this || other.dead) continue;
      const dx = this.pos.x - other.pos.x;
      const dz = this.pos.z - other.pos.z;
      const d2 = dx * dx + dz * dz;
      const min = TUNE.carRadius * 2 - 0.4;
      if (d2 < min * min && d2 > 0.001) {
        const d = Math.sqrt(d2);
        const push = (min - d) / 2;
        this.pos.x += (dx / d) * push;
        this.pos.z += (dz / d) * push;
        other.pos.x -= (dx / d) * push;
        other.pos.z -= (dz / d) * push;
        const bump = Math.abs(this.speed - other.speed);
        if (bump > 7) {
          this.damage += 5;
          this.speed *= 0.7;
          other.speed *= 0.7;
        }
      }
    }

    this.pos.x = Math.max(-352, Math.min(352, this.pos.x));
    this.pos.z = Math.max(-352, Math.min(356, this.pos.z));

    this.group.position.set(this.pos.x, 0, this.pos.z);
    this.group.rotation.y = this.heading;
    // Wheels spin with speed; fronts steer.
    const spin = (this.speed * dt) / 0.42;
    for (let i = 0; i < 4; i += 1) {
      this.wheels[i].rotation.x += spin;
      if (i < 2) this.wheels[i].rotation.y = this.steer * 0.9;
    }
    // Damage smoke.
    if (this.damage > 45 && Math.random() < dt * 6) {
      this.fx.spawnSmoke(new THREE.Vector3(this.pos.x, 1.1, this.pos.z), 1);
    }
    if (this.damage >= 100) this.dead = true;
    return hitWall;
  }

  // Chase camera behind the car.
  updateCamera(camera, dt) {
    const back = 10.5;
    const height = 4.6;
    const tx = this.pos.x - Math.sin(this.heading) * back;
    const tz = this.pos.z - Math.cos(this.heading) * back;
    const k = Math.min(1, dt * 5);
    camera.position.x += (tx - camera.position.x) * k;
    camera.position.y += (height - camera.position.y) * k;
    camera.position.z += (tz - camera.position.z) * k;
    camera.lookAt(this.pos.x + Math.sin(this.heading) * 6, 1.4, this.pos.z + Math.cos(this.heading) * 6);
  }

  flashLights(t) {
    if (!this.lightRed) return;
    const on = Math.sin(t * 11) > 0;
    this.lightRed.material.emissiveIntensity = on ? 3.2 : 0.1;
    this.lightBlue.material.emissiveIntensity = on ? 0.1 : 3.2;
  }

  remove(scene) {
    scene.remove(this.group);
  }
}
