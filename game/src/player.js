// Rex Marlowe on foot: WASD movement relative to the camera, sprint, jump,
// a third-person orbit camera, and entering / leaving cars.
import * as THREE from 'three';
import { TUNE } from './config.js';

function lerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export class Player {
  constructor(scene) {
    this.pos = new THREE.Vector3(0, 0, 40);
    this.heading = 0;
    this.vy = 0;
    this.onGround = true;
    this.health = TUNE.playerMaxHealth;
    this.inCar = null;
    this.camYaw = Math.PI;
    this.camPitch = 0.42;
    this.camDist = 7.5;
    this.speedNow = 0;

    this.group = new THREE.Group();
    const jacket = new THREE.MeshStandardMaterial({ color: 0x2e6f73, roughness: 0.85 });
    const pants = new THREE.MeshStandardMaterial({ color: 0x2c3e50, roughness: 0.9 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xd9a077, roughness: 0.7 });
    const hair = new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 0.95 });

    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.85, 4, 10), jacket);
    body.position.y = 1.05;
    body.castShadow = true;
    this.group.add(body);
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.7, 0.26), pants);
    legL.position.set(-0.17, 0.35, 0);
    legL.castShadow = true;
    this.group.add(legL);
    const legR = legL.clone();
    legR.position.x = 0.17;
    this.group.add(legR);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 10), skin);
    head.position.y = 1.82;
    head.castShadow = true;
    this.group.add(head);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8, 0, Math.PI * 2, 0, 1.2), hair);
    cap.position.y = 1.86;
    this.group.add(cap);
    // Pistol in the right hand, shown when armed.
    this.gun = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 0.14, 0.42),
      new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4, metalness: 0.6 }),
    );
    this.gun.position.set(0.42, 1.05, 0.3);
    this.group.add(this.gun);

    this.group.position.copy(this.pos);
    scene.add(this.group);
  }

  get armed() {
    return true;
  }

  // Move on foot. Returns nothing; main.js reads pos / heading.
  update(dt, input, world) {
    if (this.inCar) return;
    const { dx, dy } = input.consumeMouse();
    this.camYaw -= dx * 0.0032;
    this.camPitch = Math.max(0.12, Math.min(1.05, this.camPitch + dy * 0.0026));

    const mv = input.moveVector();
    const sprint = input.down('ShiftLeft') || input.down('ShiftRight');
    const speed = TUNE.walkSpeed * (sprint ? TUNE.sprintMul : 1);
    // Forward is where the camera looks (yaw), right is 90 deg clockwise.
    const fx = -Math.sin(this.camYaw);
    const fz = -Math.cos(this.camYaw);
    const rx = -fz;
    const rz = fx;
    let mx = fx * mv.y + rx * mv.x;
    let mz = fz * mv.y + rz * mv.x;
    const len = Math.hypot(mx, mz);
    if (len > 0.001) {
      mx /= len;
      mz /= len;
      this.pos.x += mx * speed * dt;
      this.pos.z += mz * speed * dt;
      this.speedNow = speed;
      const targetHeading = Math.atan2(mx, mz);
      this.heading = lerpAngle(this.heading, targetHeading, Math.min(1, dt * 12));
    } else {
      this.speedNow = 0;
    }

    if (input.wasPressed('Space') && this.onGround) {
      this.vy = TUNE.jumpVel;
      this.onGround = false;
    }
    if (!this.onGround) {
      this.vy -= TUNE.gravity * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= 0) {
        this.pos.y = 0;
        this.vy = 0;
        this.onGround = true;
      }
    }

    // Keep out of buildings and inside the playable area.
    const p = { x: this.pos.x, z: this.pos.z };
    world.collideCircle(p, TUNE.playerRadius);
    this.pos.x = Math.max(-350, Math.min(350, p.x));
    this.pos.z = Math.max(-350, Math.min(355, p.z));

    // Walk-cycle bob.
    const bob = this.speedNow > 0.1 ? Math.sin(performance.now() * 0.016) * 0.05 : 0;
    this.group.position.set(this.pos.x, this.pos.y + Math.abs(bob), this.pos.z);
    this.group.rotation.y = this.heading;
  }

  updateCamera(camera) {
    if (this.inCar) return;
    const cx = this.pos.x + Math.sin(this.camYaw) * Math.cos(this.camPitch) * this.camDist;
    const cz = this.pos.z + Math.cos(this.camYaw) * Math.cos(this.camPitch) * this.camDist;
    const cy = this.pos.y + 1.6 + Math.sin(this.camPitch) * this.camDist;
    camera.position.set(cx, Math.max(1.4, cy), cz);
    camera.lookAt(this.pos.x, this.pos.y + 1.6, this.pos.z);
  }

  takeDamage(n) {
    this.health = Math.max(0, this.health - n);
    return this.health <= 0;
  }

  heal(n) {
    this.health = Math.min(TUNE.playerMaxHealth, this.health + n);
  }

  enterCar(car) {
    this.inCar = car;
    this.group.visible = false;
  }

  exitCar() {
    if (!this.inCar) return;
    const car = this.inCar;
    this.inCar = null;
    // Step out to the car's left side.
    const side = car.heading + Math.PI / 2;
    this.pos.set(car.pos.x + Math.sin(side) * 2.6, 0, car.pos.z + Math.cos(side) * 2.6);
    this.group.visible = true;
    this.group.position.copy(this.pos);
  }
}
