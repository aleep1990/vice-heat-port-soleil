// The story: five missions for Rex Marlowe, each a short chain of stages
// (go to, steal, shoot out, evade, deliver), with a beacon marking the goal
// and cash rewards that feed the save.
import * as THREE from 'three';

const MISSIONS = [
  {
    id: 1,
    title: 'The Pickup',
    briefing: 'Rex is back in Port Soleil. An old friend left a package at the docks. Go get it.',
    reward: 800,
    stages: [{ type: 'goto', pos: { x: 0, z: 330 }, text: 'Pick up the package at the docks' }],
  },
  {
    id: 2,
    title: 'Hot Wheels',
    briefing: 'The package needs wheels. A red sportscar is parked by the Meridian arcade. Take it.',
    reward: 1200,
    stages: [
      { type: 'steal', pos: { x: -144, z: 72 }, text: 'Steal the red sportscar' },
      { type: 'evade', text: 'Lose the heat — get your wanted level to zero' },
    ],
  },
  {
    id: 3,
    title: 'Payday',
    briefing: 'The buyer waits at the Meridian office. His crew is not friendly. Settle it, then deliver.',
    reward: 1800,
    stages: [
      { type: 'goto', pos: { x: -72, z: -144 }, text: 'Reach the Meridian office' },
      { type: 'shootout', count: 3, around: { x: -72, z: -144 }, text: 'Clear the office crew' },
      { type: 'deliver', pos: { x: 216, z: -72 }, text: 'Deliver the package to the buyer' },
    ],
  },
  {
    id: 4,
    title: 'The Long Way Home',
    briefing: 'The whole port police is on you. Three stars, one delivery, no shortcuts.',
    reward: 2400,
    stages: [
      { type: 'chase', wanted: 3, pos: { x: 0, z: -288 }, text: 'Deliver the package uptown — with three stars on you' },
    ],
  },
  {
    id: 5,
    title: 'King of the Port',
    briefing: 'One last job. The marina, the crew, the yacht. Finish it and Port Soleil is yours.',
    reward: 5000,
    stages: [
      { type: 'goto', pos: { x: 144, z: 320 }, text: 'Reach the marina' },
      { type: 'shootout', count: 4, around: { x: 144, z: 320 }, text: 'Clear the marina crew' },
      { type: 'deliver', pos: { x: 252, z: 330 }, text: 'Board the yacht and finish the job' },
    ],
  },
];

export function createMissions(scene, api) {
  // Beacon: a light pillar + a floating marker over the current goal.
  const beacon = new THREE.Group();
  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(2.4, 2.4, 34, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
  );
  pillar.position.y = 17;
  beacon.add(pillar);
  const diamond = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.6),
    new THREE.MeshBasicMaterial({ color: 0xffd23e }),
  );
  diamond.position.y = 9;
  beacon.add(diamond);
  beacon.visible = false;
  scene.add(beacon);

  let missionIndex = 0;
  let stageIndex = 0;
  let stageTimer = 0;
  let stageSpawned = false;
  let sportCar = null;
  let storyDone = false;

  function mission() {
    return MISSIONS[missionIndex];
  }
  function stage() {
    return mission().stages[stageIndex];
  }

  function setBeacon(pos) {
    if (pos) {
      beacon.position.set(pos.x, 0, pos.z);
      beacon.visible = true;
    } else {
      beacon.visible = false;
    }
  }

  function setupStage() {
    const st = stage();
    stageTimer = 0;
    stageSpawned = false;
    if (st.type === 'goto' || st.type === 'deliver' || st.type === 'chase') {
      setBeacon(st.pos);
    } else if (st.type === 'steal') {
      sportCar = api.spawnSportCar(st.pos);
      setBeacon(st.pos);
    } else if (st.type === 'shootout') {
      const spots = [];
      for (let i = 0; i < st.count; i += 1) {
        const a = (i / st.count) * Math.PI * 2;
        spots.push({ x: st.around.x + Math.cos(a) * 9, z: st.around.z + Math.sin(a) * 9 });
      }
      api.spawnGoons(spots);
      stageSpawned = true;
      setBeacon(st.around);
    } else if (st.type === 'evade') {
      setBeacon(null);
    }
    if (st.type === 'chase' && st.wanted) api.setWanted(st.wanted);
    api.toast(`${mission().title} — ${st.text}`);
  }

  function advance() {
    const m = mission();
    stageIndex += 1;
    if (stageIndex >= m.stages.length) {
      api.addCash(m.reward);
      api.toast(`Mission complete: ${m.title} — $${m.reward.toLocaleString('en-US')}`);
      if (api.audioSting) api.audioSting();
      if (api.onMissionComplete) api.onMissionComplete(m);
      missionIndex += 1;
      stageIndex = 0;
      if (missionIndex >= MISSIONS.length) {
        storyDone = true;
        setBeacon(null);
        if (api.onStoryComplete) api.onStoryComplete();
        return;
      }
    }
    setupStage();
  }

  function jumpTo(mi, si) {
    missionIndex = Math.max(0, Math.min(MISSIONS.length - 1, mi));
    stageIndex = Math.max(0, Math.min(MISSIONS[missionIndex].stages.length - 1, si));
    storyDone = false;
    setupStage();
  }

  function start() {
    missionIndex = 0;
    stageIndex = 0;
    storyDone = false;
    sportCar = null;
    setupStage();
  }

  function reset() {
    start();
  }

  function atPos(pos, radius) {
    const p = api.playerPos();
    return Math.hypot(p.x - pos.x, p.z - pos.z) < radius;
  }

  function update(dt) {
    if (storyDone) return;
    const st = stage();
    stageTimer += dt;
    // Beacon pulse.
    if (beacon.visible) {
      diamond.rotation.y += dt * 1.6;
      diamond.position.y = 9 + Math.sin(performance.now() * 0.003) * 0.8;
      pillar.material.opacity = 0.18 + 0.08 * Math.sin(performance.now() * 0.004);
    }
    if (st.type === 'goto' || st.type === 'deliver') {
      if (atPos(st.pos, 7)) advance();
    } else if (st.type === 'steal') {
      if (api.inCar() && sportCar && api.inCar() === sportCar) {
        api.addHeat(1);
        api.toast('Stolen! The police noticed.');
        advance();
      }
    } else if (st.type === 'evade') {
      if (api.wanted() === 0) advance();
    } else if (st.type === 'shootout') {
      if (api.goonsAlive() === 0) advance();
    } else if (st.type === 'chase') {
      // Keep the heat on: the chase only ends at the delivery.
      if (api.wanted() < 3) api.setWanted(3);
      if (atPos(st.pos, 7)) advance();
    }
  }

  function currentObjective() {
    if (storyDone) return { text: 'Story complete — free roam Port Soleil', dist: null };
    const st = stage();
    const p = api.playerPos();
    let dist = null;
    if (st.pos) dist = Math.round(Math.hypot(p.x - st.pos.x, p.z - st.pos.z));
    else if (st.around) dist = Math.round(Math.hypot(p.x - st.around.x, p.z - st.around.z));
    return { text: `${mission().title}: ${st.text}`, dist };
  }

  function markerPos() {
    if (storyDone) return null;
    const st = stage();
    return st.pos || st.around || null;
  }

  start();

  return {
    get missionIndex() {
      return missionIndex;
    },
    get storyDone() {
      return storyDone;
    },
    mission,
    stage,
    start,
    jumpTo,
    reset,
    update,
    currentObjective,
    markerPos,
    MISSIONS,
  };
}
