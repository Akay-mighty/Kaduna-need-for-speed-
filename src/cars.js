// ============================================================
// Car catalog — three uploaded supercars as player choices
// ============================================================
export const CARS = [
  {
    id: 'rolls',
    name: 'Phantom Gold',
    tag: 'Luxury',
    img: '/car-rolls.jpg',
    color: 0xf4d77a,   // gold accent
    bodyColor: 0xfff8e7,
    stats: { speed: 65, accel: 50, handling: 70 },
    // Physics tuning
    maxSpeed: 78,        // m/s
    acceleration: 14,
    braking: 28,
    turnRate: 1.7
  },
  {
    id: 'orange',
    name: 'Apex GT',
    tag: 'Balanced',
    img: '/car-orange.jpg',
    color: 0xff6a1a,
    bodyColor: 0xff6a1a,
    stats: { speed: 80, accel: 75, handling: 78 },
    maxSpeed: 92,
    acceleration: 19,
    braking: 32,
    turnRate: 1.9
  },
  {
    id: 'lambo',
    name: 'Rosso Beast',
    tag: 'Beast',
    img: '/car-lambo.jpg',
    color: 0xd90a0a,
    bodyColor: 0xc8102e,
    stats: { speed: 95, accel: 90, handling: 60 },
    maxSpeed: 110,
    acceleration: 24,
    braking: 36,
    turnRate: 1.5
  }
];
