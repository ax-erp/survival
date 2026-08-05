/**
 * Stage and Map terrain configuration & Unified Stage Colors
 */

export const WORLD_CONFIG = {
  width: 800,
  height: 1040
};

export const STAGE_COLORS = {
  1: '#ffc947', // 1단: Gold / Yellow
  2: '#00e5ff', // 2단: Cyan / Light Blue
  3: '#ff2d6b', // 3단: Red / Crimson
  4: '#a855f7', // 4단: Purple
  5: '#22d3a5'  // 5단: Green / Emerald
};

export const STAGE_COLORS_3D = {
  1: 0xffc947,
  2: 0x00e5ff,
  3: 0xff2d6b,
  4: 0xa855f7,
  5: 0x22d3a5
};

export const STAGES = [
  {
    stage: 1,
    color: STAGE_COLORS[1],
    color3D: STAGE_COLORS_3D[1],
    funnel: {
      left: { x: 330, y: 210, width: 120, height: 15, angle: Math.PI / 6 },
      right: { x: 470, y: 210, width: 120, height: 15, angle: -Math.PI / 6 }
    },
    gate: {
      left: { x: 380, y: 230, width: 40, height: 15 },
      right: { x: 420, y: 230, width: 40, height: 15 }
    },
    pinRows: {
      rows: 5,
      startY: 60,
      rowSpacing: 24,
      evenPins: 14,
      oddPins: 15,
      margin: 40
    }
  },
  {
    stage: 2,
    color: STAGE_COLORS[2],
    color3D: STAGE_COLORS_3D[2],
    funnel: {
      left: { x: 340, y: 390, width: 100, height: 15, angle: Math.PI / 6 },
      right: { x: 460, y: 390, width: 100, height: 15, angle: -Math.PI / 6 }
    },
    gate: {
      left: { x: 382.5, y: 410, width: 35, height: 15 },
      right: { x: 417.5, y: 410, width: 35, height: 15 }
    },
    center: { x: 400, y: 313 },
    pins: { count: 4, distance: 60 }
  },
  {
    stage: 3,
    color: STAGE_COLORS[3],
    color3D: STAGE_COLORS_3D[3],
    funnel: {
      left: { x: 345, y: 570, width: 90, height: 15, angle: Math.PI / 6 },
      right: { x: 455, y: 570, width: 90, height: 15, angle: -Math.PI / 6 }
    },
    gate: {
      left: { x: 385, y: 590, width: 30, height: 15 },
      right: { x: 415, y: 590, width: 30, height: 15 }
    },
    pinRows: {
      rows: 3,
      startY: 460,
      rowSpacing: 24,
      width: 240,
      centerX: 400,
      evenPins: 7,
      oddPins: 8
    }
  },
  {
    stage: 4,
    color: STAGE_COLORS[4],
    color3D: STAGE_COLORS_3D[4],
    funnel: {
      left: { x: 350, y: 750, width: 80, height: 15, angle: Math.PI / 6 },
      right: { x: 450, y: 750, width: 80, height: 15, angle: -Math.PI / 6 }
    },
    gate: {
      left: { x: 387.5, y: 770, width: 25, height: 15 },
      right: { x: 412.5, y: 770, width: 25, height: 15 }
    },
    center: { x: 400, y: 653 },
    pins: { count: 3, distance: 50 }
  },
  {
    stage: 5,
    color: STAGE_COLORS[5],
    color3D: STAGE_COLORS_3D[5],
    center: { x: 400, y: 885 }
  }
];

export const DRAIN_ZONES = [
  { x: 100, y: 240, radius: 80, label: 'STAGE 1 DRAIN LEFT' },
  { x: 700, y: 240, radius: 80, label: 'STAGE 1 DRAIN RIGHT' },
  { x: 120, y: 420, radius: 70, label: 'STAGE 2 DRAIN LEFT' },
  { x: 680, y: 420, radius: 70, label: 'STAGE 2 DRAIN RIGHT' }
];
