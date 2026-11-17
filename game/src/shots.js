// Screenshot staging: ?shot=start|drive|chase|mission (with &seed=N) puts the
// real game into a composed, reproducible frame and freezes the simulation
// so the screenshot is stable.
import * as THREE from 'three';
import { PALETTE } from './config.js';
import { Car } from './vehicles.js';

// stagedKmh: optional display-only speed (km/h) for frozen staged shots —
// the sim is frozen so the live speed reads 0; gameplay physics untouched.
function syncHud(game, stagedKmh) {
  const { player, police, missions, hud, G } = game;
  const obj = missions.currentObjective();
  hud.update({
    wanted: police.wanted,
    cash: G.cash,
    health: player.health,
    speed: stagedKmh != null ? stagedKmh / 3.6 : (player.inCar ? player.inCar.speed : 0),
    objective: obj.text,
    dist: obj.dist,
    bustedProgress: police.bustedProgress,
    player: {
      x: player.inCar ? player.inCar.pos.x : player.pos.x,
      z: player.inCar ? player.inCar.pos.z : player.pos.z,
      heading: player.inCar ? player.inCar.heading : player.heading,
    },
    police: police.policeCars.map((c) => ({ x: c.pos.x, z: c.pos.z })),
    marker: missions.markerPos(),
    inCar: !!player.inCar,
    screen: G.screen,
  });
}

function resetAll(game) {
  const { player, traffic, police, combat, missions, G } = game;
  if (player.inCar) player.exitCar();
  player.pos.set(0, 0, 40);
  player.heading = 0;
  player.health = 100;
  player.group.visible = true;
  player.group.position.copy(player.pos);
  traffic.reset();
  police.reset();
  combat.reset();
  missions.reset();
  G.cash = 0;
}

function chaseCam(camera, car, back = 10.5, height = 4.6) {
  const f = car.forward();
  camera.position.set(car.pos.x - f.x * back, height, car.pos.z - f.z * back);
  camera.lookAt(car.pos.x + f.x * 6, 1.4, car.pos.z + f.z * 6);
}

export function stageShot(name, game) {
  const { scene, camera, world, player, traffic, police, combat, missions, hud, fx, G } = game;
  resetAll(game);

  if (name === 'drive') {
    // Rex driving the red sportscar down the main drag, traffic ahead.
    const car = new Car(scene, world, fx, { sport: true, color: PALETTE.sport, x: -120, z: 3.6, heading: Math.PI / 2 });
    G.sportCar = car;
    player.enterCar(car);
    for (let i = 0; i < 3; i += 1) {
      const t = traffic.cars[i];
      t.car.pos.set(-95 + i * 22, 0, i % 2 === 0 ? 3.6 : -3.6);
      t.car.heading = Math.PI / 2;
      t.car.speed = 9;
      t.car.group.position.copy(t.car.pos);
      t.car.group.rotation.y = t.car.heading;
    }
    chaseCam(camera, car);
    game.setScreen('play');
    hud.showScreen(null);
    syncHud(game, 68);
    return;
  }

  if (name === 'chase') {
    // Three stars: police cruisers right on Rex's bumper.
    missions.jumpTo(3, 0);
    const car = new Car(scene, world, fx, { sport: true, color: PALETTE.sport, x: 0, z: -120, heading: Math.PI });
    G.sportCar = car;
    player.enterCar(car);
    police.update(0.1, G.now, player, car, [car]);
    // Staggered pursuit formation, all inside the pulled-back chase frame,
    // with alternating red/blue light bars lit. The nearest cruiser sits at
    // back=10 (not 13) so it stays fully in frame ahead of the camera.
    const slots = [[-4.2, 7], [4.2, 10], [-1.5, 10]];
    police.policeCars.forEach((pc, i) => {
      const [side, back] = slots[i % slots.length];
      pc.pos.set(car.pos.x + side, 0, car.pos.z + back);
      pc.heading = Math.PI;
      pc.speed = 13;
      pc.group.position.copy(pc.pos);
      pc.group.rotation.y = pc.heading;
      if (pc.lightRed) {
        pc.lightRed.material.emissiveIntensity = i % 2 === 0 ? 3.2 : 0.1;
        pc.lightBlue.material.emissiveIntensity = i % 2 === 0 ? 0.1 : 3.2;
      }
    });
    for (let i = 0; i < 2; i += 1) {
      const t = traffic.cars[i];
      t.car.pos.set(i === 0 ? 3.6 : -3.6, 0, -150 - i * 26);
      t.car.heading = Math.PI;
      t.car.speed = 10;
      t.car.group.position.copy(t.car.pos);
      t.car.group.rotation.y = t.car.heading;
    }
    chaseCam(camera, car, 17, 6);
    game.setScreen('play');
    hud.showScreen(null);
    syncHud(game, 87);
    return;
  }

  if (name === 'mission') {
    // On foot at the Meridian office: three goons, the beacon, the crosshair.
    missions.jumpTo(2, 1);
    player.pos.set(-58, 0, -128);
    player.heading = Math.atan2(-72 - -58, -144 - -128);
    player.camYaw = 0.71;
    player.camPitch = 0.35;
    player.group.position.copy(player.pos);
    player.group.rotation.y = player.heading;
    player.updateCamera(camera);
    game.setScreen('play');
    hud.showScreen(null);
    syncHud(game);
    return;
  }

  // Default: start — the title screen over a city vista.
  camera.position.set(95, 62, 195);
  camera.lookAt(0, 14, 0);
  game.setScreen('menu');
  hud.showScreen('menu');
  syncHud(game);
}
