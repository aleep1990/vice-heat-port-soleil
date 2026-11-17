// VICE HEAT — boot and the one loop. Owns the game state, wires every system,
// and moves between menu / play / pause / busted / wasted / complete.
//
// ?seed=N fixes the city. ?shot=start|drive|chase|mission (with &seed=N)
// stages that scene instead of running the loop, paints it and sets
// window.__shotReady for a screenshot.
import * as THREE from 'three';
import { TUNE, PALETTE, GAME } from './config.js';
import { makeRng } from './random.js';
import { Input } from './input.js';
import { createWorld } from './world.js';
import { createRenderer, createSky, Effects } from './render.js';
import { Player } from './player.js';
import { Car } from './vehicles.js';
import { createTraffic } from './traffic.js';
import { createPolice } from './police.js';
import { createCombat } from './combat.js';
import { createMissions } from './missions.js';
import { createHUD } from './hud.js';
import { createAudio } from './audio.js';
import { loadSave, saveSave, clearSave } from './save.js';
import { stageShot } from './shots.js';

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);
const rng = makeRng(seed);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 2200);
camera.position.set(120, 70, 160);
const renderer = createRenderer(canvas);
const sky = createSky(scene, rng);
const fx = new Effects(scene);
const world = createWorld(scene, rng);
const input = new Input(canvas);
const audio = createAudio();
const player = new Player(scene);
const traffic = createTraffic(scene, world, fx, rng);

const G = {
  screen: 'menu',
  cash: 0,
  bestCash: 0,
  now: 0,
  frozen: false,
  lastShot: -1,
  sportCar: null,
  registered: new Set(),
};

function announce(msg) {
  status.textContent = msg;
}

function damagePlayer(n) {
  if (G.screen !== 'play') return;
  if (player.takeDamage(n)) endRun('WASTED', 'Rex got wasted on the streets of Port Soleil.');
}

const police = createPolice(scene, world, fx, rng, {
  onBusted: () => endRun('BUSTED', 'The port police took Rex in. Bail cost $500.'),
  onPlayerDamage: (n) => damagePlayer(n),
});
const combat = createCombat(scene, world, fx, audio, {
  onPlayerDamage: (n) => damagePlayer(n),
});

function saveGame() {
  G.bestCash = Math.max(G.bestCash, G.cash);
  saveSave({ cash: G.cash, missionIndex: missions.missionIndex, bestCash: G.bestCash });
}

function registerCar(car, kind) {
  if (G.registered.has(car)) return;
  G.registered.add(car);
  combat.register(car.bodyMesh, {
    health: 100,
    kind,
    onDamage: () => {},
    onDeath: () => {
      car.dead = true;
      fx.spawnSmoke(new THREE.Vector3(car.pos.x, 1.2, car.pos.z), 4);
      fx.spawnSparks(new THREE.Vector3(car.pos.x, 1, car.pos.z), 8);
    },
  });
}

function registerPed(ped) {
  combat.register(ped.group.children[0], {
    health: 60,
    kind: 'ped',
    onDamage: () => {},
    onDeath: () => {
      ped.dead = true;
      ped.deadTimer = 3;
      ped.group.rotation.x = -Math.PI / 2;
      ped.group.position.y = 0.4;
      police.addHeat(1, G.now);
      hud.toast('You hit a pedestrian — the police noticed.');
    },
  });
}
for (const t of traffic.cars) registerCar(t.car, 'traffic');
for (const ped of traffic.peds) registerPed(ped);

// HUD first: missions.setupStage() toasts during construction, so the HUD
// must exist before createMissions runs.
const hud = createHUD({
  onStart: (isNew) => startGame(isNew),
  onResume: () => {
    G.screen = 'play';
    hud.showScreen(null);
    announce('Playing.');
  },
  onRestart: () => startGame(true),
});

const missions = createMissions(scene, {
  playerPos: () => (player.inCar ? player.inCar.pos : player.pos),
  inCar: () => player.inCar,
  wanted: () => police.wanted,
  setWanted: (n) => police.setWanted(n, G.now),
  addHeat: (n) => police.addHeat(n, G.now),
  goonsAlive: () => combat.goonsAlive(),
  spawnGoons: (spots) => combat.spawnGoons(spots),
  spawnSportCar: (pos) => {
    if (G.sportCar) return G.sportCar;
    const car = new Car(scene, world, fx, { sport: true, color: PALETTE.sport, x: pos.x, z: pos.z, heading: Math.PI / 2 });
    G.sportCar = car;
    registerCar(car, 'sport');
    return car;
  },
  toast: (m) => hud.toast(m),
  addCash: (n) => {
    G.cash += n;
  },
  audioSting: () => audio.sting(),
  onMissionComplete: () => saveGame(),
  onStoryComplete: () => {
    G.screen = 'complete';
    hud.setComplete(G.cash, 5);
    saveGame();
  },
});

function resetPositions() {
  player.pos.set(0, 0, 40);
  player.heading = 0;
  player.camYaw = Math.PI;
  player.health = TUNE.playerMaxHealth;
  if (player.inCar) player.exitCar();
  player.group.visible = true;
  player.group.position.copy(player.pos);
  if (G.sportCar) {
    G.sportCar.remove(scene);
    G.registered.delete(G.sportCar);
    G.sportCar = null;
  }
  traffic.reset();
  police.reset();
  combat.reset();
  // Re-register peds (combat.reset cleared the shootable map).
  for (const ped of traffic.peds) registerPed(ped);
  for (const t of traffic.cars) registerCar(t.car, 'traffic');
}

function startGame(isNew) {
  audio.start();
  if (isNew) {
    clearSave();
    G.cash = 0;
    resetPositions();
    missions.reset();
  } else {
    const saved = loadSave();
    resetPositions();
    G.cash = saved ? saved.cash : 0;
    missions.reset();
    if (saved && saved.missionIndex > 0) missions.jumpTo(saved.missionIndex, 0);
  }
  G.screen = 'play';
  hud.showScreen(null);
  announce(`${GAME.title}. ${missions.currentObjective().text}`);
}

function endRun(kind, sub) {
  if (G.screen !== 'play') return;
  G.screen = 'over';
  const fine = kind === 'BUSTED' ? 500 : 300;
  G.cash = Math.max(0, G.cash - fine);
  saveGame();
  audio.siren(false);
  audio.setEngine(0, false);
  hud.setOver(kind, `${sub} ($${fine} fine.)`);
  announce(`${kind}. ${sub}`);
}

function allCars() {
  const set = new Set(traffic.allCars());
  for (const c of police.policeCars) set.add(c);
  if (player.inCar) set.add(player.inCar);
  if (G.sportCar) set.add(G.sportCar);
  return [...set];
}

function nearestStealableCar(maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of allCars()) {
    if (car === player.inCar) continue;
    const d = Math.hypot(car.pos.x - player.pos.x, car.pos.z - player.pos.z);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}

function tryEnterExitCar() {
  if (player.inCar) {
    player.exitCar();
    return;
  }
  const car = nearestStealableCar(4.6);
  if (!car) return;
  player.enterCar(car);
  if (car.police) {
    police.addHeat(2, G.now);
    hud.toast('You stole a police cruiser! Heat +2.');
  } else if (car !== G.sportCar) {
    traffic.markStolen(car);
    police.addHeat(1, G.now);
    hud.toast('Car stolen — the police noticed.');
  }
}

function tryShoot() {
  if (player.inCar || G.now - G.lastShot < 0.22) return;
  G.lastShot = G.now;
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const hit = combat.shoot(camera.position, dir);
  traffic.notifyGunshot(player.pos, G.now);
  const nearPolice = police.policeCars.some(
    (c) => Math.hypot(c.pos.x - player.pos.x, c.pos.z - player.pos.z) < 55,
  );
  if (hit || nearPolice) police.addHeat(1, G.now);
}

function frame(nowMs) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (nowMs - (frame.last ?? nowMs)) / 1000 || 0.016);
  frame.last = nowMs;
  G.now += dt;

  if (G.frozen) {
    renderer.render(scene, camera);
    return;
  }

  // Global keys.
  if (input.wasPressed('KeyM')) audio.toggleMute();
  if (input.wasPressed('KeyP') || input.wasPressed('Escape')) {
    if (G.screen === 'play') {
      G.screen = 'pause';
      hud.showScreen('pause');
      announce('Paused.');
    } else if (G.screen === 'pause') {
      G.screen = 'play';
      hud.showScreen(null);
      announce('Playing.');
    }
  }

  if (G.screen === 'menu') {
    // Slow orbit over the city behind the title screen.
    const t = G.now * 0.045;
    camera.position.set(Math.sin(t) * 190, 95, Math.cos(t) * 190);
    camera.lookAt(0, 12, 40);
    world.update(dt, G.now);
    sky.update(dt);
    fx.update(dt);
  } else if (G.screen === 'play') {
    if (input.wasPressed('KeyE')) tryEnterExitCar();
    if (input.consumeClick() || input.down('KeyF')) tryShoot();

    if (player.inCar) {
      const mv = input.moveVector();
      const control = {
        throttle: mv.y,
        steer: -mv.x,
        brake: input.down('Space'),
      };
      player.inCar.update(dt, control, allCars());
      player.inCar.updateCamera(camera, dt);
      audio.setEngine(Math.abs(player.inCar.speed) / player.inCar.maxSpeed, true);
      if (player.inCar.dead) {
        hud.toast('The car is wrecked — get out!');
        player.exitCar();
      }
    } else {
      player.update(dt, input, world);
      player.updateCamera(camera);
      audio.setEngine(0, false);
    }

    traffic.update(dt, G.now, [player.inCar, ...police.policeCars].filter(Boolean));
    police.update(dt, G.now, player, player.inCar, allCars());
    combat.update(dt, G.now, player.inCar ? player.inCar.pos : player.pos, player.health > 0);
    missions.update(dt);
    world.update(dt, G.now);
    sky.update(dt);
    fx.update(dt);
    audio.siren(police.wanted > 0);

    // Register police cars as shootables once they exist.
    for (const car of police.policeCars) registerCar(car, 'police');

    const obj = missions.currentObjective();
    hud.update({
      wanted: police.wanted,
      cash: G.cash,
      health: player.health,
      speed: player.inCar ? player.inCar.speed : 0,
      objective: obj.text,
      dist: obj.dist,
      bustedProgress: police.bustedProgress,
      player: { x: player.inCar ? player.inCar.pos.x : player.pos.x, z: player.inCar ? player.inCar.pos.z : player.pos.z, heading: player.inCar ? player.inCar.heading : player.heading },
      police: police.policeCars.map((c) => ({ x: c.pos.x, z: c.pos.z })),
      marker: missions.markerPos(),
      inCar: !!player.inCar,
      screen: 'play',
    });
  }

  renderer.render(scene, camera);
  input.endFrame();
}

function runShot(name) {
  const game = {
    scene, camera, world, player, traffic, police, combat, missions, hud, audio, fx, rng, G,
    setScreen: (s) => {
      G.screen = s;
    },
  };
  stageShot(name, game);
  G.frozen = true;
  // Keep painting every frame (frozen simulation, live render): headless
  // --screenshot captures a presented frame, and a loop that stops after a
  // few paints can leave the compositor holding the pre-render blank.
  let painted = 0;
  function paint() {
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) window.__shotReady = true;
    requestAnimationFrame(paint);
  }
  requestAnimationFrame(paint);
}

// Boot: show the menu, restore the save for the Continue button.
const savedAtBoot = loadSave();
if (savedAtBoot) {
  G.cash = savedAtBoot.cash;
  G.bestCash = savedAtBoot.bestCash;
  if (!savedAtBoot.missionIndex && !savedAtBoot.cash) {
    document.getElementById('btn-continue').style.display = 'none';
  }
} else {
  document.getElementById('btn-continue').style.display = 'none';
}
hud.update({
  wanted: 0,
  cash: G.cash,
  health: 100,
  speed: 0,
  objective: missions.currentObjective().text,
  dist: null,
  bustedProgress: 0,
  player: { x: 0, z: 40, heading: 0 },
  police: [],
  marker: missions.markerPos(),
  inCar: false,
  screen: 'menu',
});
announce(`${GAME.title} — ${GAME.city}. Press New Game to start.`);
if (shot) runShot(shot);
else requestAnimationFrame(frame);
