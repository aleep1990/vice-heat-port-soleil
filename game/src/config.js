// VICE HEAT: Port Soleil — shared tuning and world constants.
// The city is an 8x8 grid of blocks. Streets run at -288..288 in steps of 72;
// blocks sit between them. South (+z) past the last street is the beach and water.
export const WORLD = {
  blocks: 8,
  block: 56, // building block side, in world units
  street: 16, // street width
  pitch: 72, // block + street
  half: 288, // outermost street coordinate
  ground: 720, // ground plane side (covers city + beach + park strips)
  beachZ0: 296,
  beachZ1: 360,
  waterZ: 360,
};

// Street centre lines, both axes.
export const STREETS = [];
for (let i = 0; i <= 8; i += 1) STREETS.push(-WORLD.half + i * WORLD.pitch);
// Block centre lines, both axes.
export const BLOCKS = [];
for (let i = 0; i < WORLD.blocks; i += 1) BLOCKS.push(-252 + i * WORLD.pitch);

// Sun-soaked coastal palette: warm plaster, terracotta, teal, cream.
export const PALETTE = {
  buildings: [0xe8dcc3, 0xd9a066, 0x7fb3a8, 0xf2ead8, 0xc96f4a, 0x9db8a6, 0xe5c07b, 0xb7c9d6, 0xd8b4a0, 0x8fae94],
  roofs: [0x8a6f5c, 0x6b5a4e, 0x9c8a76],
  cars: [0xc0392b, 0x2471a3, 0xf1c40f, 0x1e8449, 0xeaf2f8, 0x2c3e50, 0xaf7ac5, 0xe67e22, 0x16a085, 0x922b21],
  sport: 0xd7263d,
  policeBody: 0xf4f6f7,
  policeTrim: 0x1a252f,
  pedShirts: [0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12, 0x9b59b6, 0x1abc9c, 0xecf0f1, 0x34495e],
};

// Physics and gameplay tuning.
export const TUNE = {
  walkSpeed: 6.5,
  sprintMul: 1.7,
  jumpVel: 8,
  gravity: 22,
  playerRadius: 0.7,
  carAccel: 16,
  carBrake: 34,
  carReverseAccel: 10,
  carMaxSpeed: 40,
  carMaxReverse: 12,
  carDrag: 0.55,
  steerMax: 0.5,
  steerSpeed: 2.2,
  carRadius: 2.4,
  trafficCount: 14,
  pedCount: 18,
  policeMaxSpeed: 44,
  wantedDecaySeconds: 14,
  bustedSeconds: 2.2,
  gunRange: 90,
  gunDamage: 34,
  goonDamage: 7,
  playerMaxHealth: 100,
};

export const GAME = {
  title: 'VICE HEAT',
  city: 'Port Soleil',
  hero: 'Rex Marlowe',
};
