import Matter from 'matter-js';
import { audioSynth } from '../utils/audioSynth.js';

// Utility: darken/lighten a hex color by a ratio (-1 to 1)
function shadeColor(hex, ratio) {
  if (!hex || typeof hex !== 'string') return '#00e5ff';
  const cleanHex = hex.replace('#', '');
  const num = parseInt(cleanHex, 16);
  if (isNaN(num)) return '#00e5ff';
  const r = Math.min(255, Math.max(0, Math.round(((num >> 16) & 0xff) * (1 + ratio))));
  const g = Math.min(255, Math.max(0, Math.round(((num >> 8) & 0xff) * (1 + ratio))));
  const b = Math.min(255, Math.max(0, Math.round((num & 0xff) * (1 + ratio))));
  return `rgb(${r},${g},${b})`;
}

export class PachinkoEngine {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    
    this.width = options.width || 800;
    this.height = options.height || 1040;
    this.canvas.width = this.width;
    this.canvas.height = this.height;

    this.participants = options.participants || [];
    this.totalBalls = this.participants.length || 250;

    // Target Duration in Minutes
    this.targetDurationMinutes = options.targetDurationMinutes || 1;
    this.elapsedSeconds = 0;
    
    // Spawning logic
    this.spawnTimer = 0;
    this.unspawnedBalls = [];

    // Callbacks
    this.onWinner = options.onWinner || (() => {});
    this.onFinisher = options.onFinisher || (() => {});
    this.onStageUpdate = options.onStageUpdate || (() => {});
    this.onTimerUpdate = options.onTimerUpdate || (() => {});

    // Gimmicks / States
    this.tiltActive = false;
    this.airCurtainActive = false;
    this.speedMultiplier = 1;
    this.isPaused = true;
    this.isFinished = false;

    // Game stats & records
    this.balls = [];
    this.finishers = [];
    this.eliminated = [];
    this.firstWinner = null;

    // Angles for rotating trays
    this.stage2Angle = 0;
    this.stage4Angle = 0;
    this.stage5Angle = 0;

    // Gates state
    this.gates = {
      1: { openAt: 0, isOpen: false, bodies: [] },
      2: { openAt: 0, isOpen: false, bodies: [] },
      3: { openAt: 0, isOpen: false, bodies: [] },
      4: { openAt: 0, isOpen: false, bodies: [] }
    };

    // Terrain data for 3D rendering
    this.terrains = [];
    this.drainZones = [];

    // Replay System for 1st Place Win
    this.frameBuffer = [];
    this.replayFrames = null;
    this.isPlayingReplay = false;
    this.replayIndex = 0;
    this.postWinDelay = 0;
    this.replayZoom = true; // Default 1.8x close-up zoom during replay

    this.canvas.addEventListener('click', () => {
      if (this.isPlayingReplay) {
        this.toggleReplayZoom();
      }
    });

    // Matter.js setup
    this.initPhysics();
    this.build5StageBogMachine();
  }

  initPhysics() {
    const { Engine, Composite } = Matter;
    
    this.engine = Engine.create({
      gravity: { x: 0, y: 0.95 }
    });
    this.world = this.engine.world;

    Matter.Events.on(this.engine, 'collisionStart', (evt) => {
      evt.pairs.forEach(pair => {
        const { bodyA, bodyB } = pair;
        const ball = bodyA.plugin?.ball || bodyB.plugin?.ball;
        const isPin = bodyA.plugin?.isPin || bodyB.plugin?.isPin;
        const holeType = bodyA.plugin?.holeType || bodyB.plugin?.holeType;

        if (ball && isPin) {
          audioSynth.playPinHit();
        }

        if (ball && holeType) {
          this.handleHoleCollision(ball, holeType);
        }
      });
    });
  }

  addTerrain(body, colorTop, colorSide) {
    Matter.Composite.add(this.world, body);
    this.terrains.push({ body, colorTop, colorSide });
  }

  createGate(x, y, width, height, stageNum) {
    const leftGate = Matter.Bodies.rectangle(x - width/4, y, width/2, height, { isStatic: true, friction: 0.1 });
    const rightGate = Matter.Bodies.rectangle(x + width/4, y, width/2, height, { isStatic: true, friction: 0.1 });
    
    Matter.Composite.add(this.world, [leftGate, rightGate]);
    this.gates[stageNum].bodies = [leftGate, rightGate];
    this.gates[stageNum].initialX = [x - width/4, x + width/4];
    
    // For rendering
    this.terrains.push({ body: leftGate, colorTop: '#ff9900', colorSide: '#b36b00', isGate: true });
    this.terrains.push({ body: rightGate, colorTop: '#ff9900', colorSide: '#b36b00', isGate: true });
  }

  createDrainZone(x, y, radius, label) {
    const drain = Matter.Bodies.circle(x, y, radius, {
      isSensor: true, isStatic: true, plugin: { holeType: 'DRAIN' }
    });
    Matter.Composite.add(this.world, drain);
    this.drainZones.push({ body: drain, radius, label });
  }

  build5StageBogMachine() {
    const { Bodies, Composite } = Matter;
    const wallOpts = { isStatic: true, friction: 0.05, restitution: 0.4 };

    // Outer Boundaries
    const leftWall = Bodies.rectangle(-30, this.height / 2 - 150, 60, this.height + 600, wallOpts);
    const rightWall = Bodies.rectangle(this.width + 30, this.height / 2 - 150, 60, this.height + 600, wallOpts);
    this.addTerrain(leftWall, '#1e293b', '#0f172a');
    this.addTerrain(rightWall, '#1e293b', '#0f172a');

    // ----------------------------------------------------
    // START GLASS HOPPER BOX: 250개 구슬 완전 수용 3D 투명 유리 박스 챔버
    // ----------------------------------------------------
    const hopperL = Bodies.rectangle(this.width / 2 - 215, -195, 20, 420, { isStatic: true, friction: 0.05 });
    const hopperR = Bodies.rectangle(this.width / 2 + 215, -195, 20, 420, { isStatic: true, friction: 0.05 });
    const hopperTop = Bodies.rectangle(this.width / 2, -400, 450, 20, { isStatic: true, friction: 0.05 });
    this.addTerrain(hopperL, 'rgba(0,229,255,0.35)', 'rgba(0,229,255,0.08)');
    this.addTerrain(hopperR, 'rgba(0,229,255,0.35)', 'rgba(0,229,255,0.08)');
    this.addTerrain(hopperTop, 'rgba(0,229,255,0.35)', 'rgba(0,229,255,0.08)');

    // Glass Box Bottom (at y = 15)
    const gateW = 220;
    const startGateL = Bodies.rectangle(this.width / 2 - gateW / 2 + 5, 15, gateW, 20, { isStatic: true, friction: 0.1 });
    const startGateR = Bodies.rectangle(this.width / 2 + gateW / 2 - 5, 15, gateW, 20, { isStatic: true, friction: 0.1 });
    Composite.add(this.world, [startGateL, startGateR]);
    this.startGate = {
      isOpen: false,
      bodies: [startGateL, startGateR],
      initialX: [this.width / 2 - gateW / 2 + 5, this.width / 2 + gateW / 2 - 5]
    };
    this.terrains.push({ body: startGateL, colorTop: 'rgba(0,229,255,0.45)', colorSide: 'rgba(0,229,255,0.12)', isGlassBox: true });
    this.terrains.push({ body: startGateR, colorTop: 'rgba(0,229,255,0.45)', colorSide: 'rgba(0,229,255,0.12)', isGlassBox: true });

    // Initial Drop Funnel Guide Walls (Wider gap funnel for smooth center drop)
    const startFunnelL = Bodies.rectangle(this.width / 2 - 165, 42, 130, 14, { isStatic: true, angle: 0.35, friction: 0.05 });
    const startFunnelR = Bodies.rectangle(this.width / 2 + 165, 42, 130, 14, { isStatic: true, angle: -0.35, friction: 0.05 });
    this.addTerrain(startFunnelL, 'rgba(0,229,255,0.4)', 'rgba(0,229,255,0.15)');
    this.addTerrain(startFunnelR, 'rgba(0,229,255,0.4)', 'rgba(0,229,255,0.15)');

    // ----------------------------------------------------
    // STAGE 1: 상단 핀 필드 (벽 각도 완만하게 Math.PI / 8)
    // ----------------------------------------------------
    this.stage1Pins = [];
    for (let r = 0; r < 5; r++) {
      const pinsInRow = (r % 2 === 0) ? 14 : 15;
      const spacingX = (this.width - 80) / pinsInRow;
      const offsetX = (r % 2 === 0) ? 40 + spacingX / 2 : 40;
      const py = 60 + r * 24;

      for (let c = 0; c < pinsInRow; c++) {
        const px = offsetX + c * spacingX;
        const pin = Bodies.circle(px, py, 4, { isStatic: true, restitution: 0.7, plugin: { isPin: true } });
        this.stage1Pins.push({ body: pin, x: px, y: py, r: 4 });
        Composite.add(this.world, pin);
      }
    }
    
    // Stage 1 Wide Funnel Walls (Gentler angle Math.PI / 8 & 180px length for smooth sliding)
    const funnel1L = Bodies.rectangle(this.width / 2 - 110, 220, 180, 15, { isStatic: true, angle: Math.PI / 8 });
    const funnel1R = Bodies.rectangle(this.width / 2 + 110, 220, 180, 15, { isStatic: true, angle: -Math.PI / 8 });
    this.addTerrain(funnel1L, '#334155', '#1e293b');
    this.addTerrain(funnel1R, '#334155', '#1e293b');

    // Stage 1 Small Drain Zones (Shifted far out with tiny 35px radius to minimize Stage 1 drains)
    this.createDrainZone(55, 250, 35, '탈락');
    this.createDrainZone(this.width - 55, 250, 35, '탈락');
    
    // Gate
    this.createGate(this.width / 2, 230, 80, 15, 1);

    // ----------------------------------------------------
    // STAGE 2: 회전 가이드 & 탈락 함정
    // ----------------------------------------------------
    this.stage2Center = { x: this.width / 2, y: 313, radius: 95 };
    this.stage2Pins = [];
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI * 2) / 4;
      const dist = 60;
      const px = this.stage2Center.x + Math.cos(angle) * dist;
      const py = this.stage2Center.y + Math.sin(angle) * dist;
      const pin = Bodies.circle(px, py, 6, { isStatic: true, restitution: 0.7, plugin: { isPin: true } });
      this.stage2Pins.push({ body: pin, angleOffset: angle, dist, r: 6 });
      Composite.add(this.world, pin);
    }
    
    // Stage 2 Wide Funnel Walls (Length 145px: shorter than Stage 1 180px, longer than Stage 3 115px)
    const funnel2L = Bodies.rectangle(this.width / 2 - 80, 390, 145, 15, { isStatic: true, angle: Math.PI / 6 });
    const funnel2R = Bodies.rectangle(this.width / 2 + 80, 390, 145, 15, { isStatic: true, angle: -Math.PI / 6 });
    this.addTerrain(funnel2L, '#334155', '#1e293b');
    this.addTerrain(funnel2R, '#334155', '#1e293b');

    // Stage 2 Drains
    this.createDrainZone(120, 420, 70, '탈락');
    this.createDrainZone(this.width - 120, 420, 70, '탈락');
    
    // Stage 2 Gate
    this.createGate(this.width / 2, 410, 70, 15, 2);

    // ----------------------------------------------------
    // STAGE 3: 병목 트랩
    // ----------------------------------------------------
    this.stage3Pins = [];
    for (let r = 0; r < 3; r++) {
      const pins = (r % 2 === 0) ? 7 : 8;
      const spacingX = 240 / pins;
      const offsetX = (this.width / 2 - 120) + (r % 2 === 0 ? spacingX / 2 : 0);
      const py = 460 + r * 24;

      for (let c = 0; c < pins; c++) {
        const px = offsetX + c * spacingX;
        const pin = Bodies.circle(px, py, 5, { isStatic: true, restitution: 0.75, plugin: { isPin: true } });
        this.stage3Pins.push({ body: pin, x: px, y: py, r: 5 });
        Composite.add(this.world, pin);
      }
    }
    
    // Stage 3 Tapered Funnel Walls (Length 115px: shorter than Stage 2 145px, longer than Stage 4 90px)
    const funnel3L = Bodies.rectangle(this.width / 2 - 65, 550, 115, 15, { isStatic: true, angle: Math.PI / 6 });
    const funnel3R = Bodies.rectangle(this.width / 2 + 65, 550, 115, 15, { isStatic: true, angle: -Math.PI / 6 });
    this.addTerrain(funnel3L, '#334155', '#1e293b');
    this.addTerrain(funnel3R, '#334155', '#1e293b');

    // Stage 3 Drains
    this.createDrainZone(140, 580, 60, '탈락');
    this.createDrainZone(this.width - 140, 580, 60, '탈락');
    
    // Stage 3 Gate
    this.createGate(this.width / 2, 570, 60, 15, 3);

    // ----------------------------------------------------
    // STAGE 4: 하단 회전 트레이
    // ----------------------------------------------------
    this.stage4Center = { x: this.width / 2, y: 653, radius: 80 };
    this.stage4Pins = [];
    for (let i = 0; i < 3; i++) {
      const angle = (i * Math.PI * 2) / 3;
      const dist = 50;
      const px = this.stage4Center.x + Math.cos(angle) * dist;
      const py = this.stage4Center.y + Math.sin(angle) * dist;
      const pin = Bodies.circle(px, py, 6, { isStatic: true, restitution: 0.8, plugin: { isPin: true } });
      this.stage4Pins.push({ body: pin, angleOffset: angle, dist, r: 6 });
      Composite.add(this.world, pin);
    }
    
    // Stage 4 Compact Funnel Walls (Length 90px: shorter than Stage 3 115px)
    const funnel4L = Bodies.rectangle(this.width / 2 - 50, 705, 90, 15, { isStatic: true, angle: Math.PI / 6 });
    const funnel4R = Bodies.rectangle(this.width / 2 + 50, 705, 90, 15, { isStatic: true, angle: -Math.PI / 6 });
    this.addTerrain(funnel4L, '#334155', '#1e293b');
    this.addTerrain(funnel4R, '#334155', '#1e293b');

    // Stage 4 Drains
    this.createDrainZone(160, 735, 50, '탈락');
    this.createDrainZone(this.width - 160, 735, 50, '탈락');
    
    // Stage 4 Gate (Moved up to Y=725 so closed gate never overlaps with Stage 5)
    this.createGate(this.width / 2, 725, 50, 15, 4);

    // ----------------------------------------------------
    // STAGE 5: 최종 3구 수반
    this.stage5Center = { x: this.width / 2, y: 818, radius: 65 };

    // Outer Roof Shield for Stage 5 (Extended Inverted V-shape /\ to block side entry)
    const bowlLeft = Bodies.rectangle(this.width / 2 - 75, 770, 115, 15, { isStatic: true, angle: -0.42 });
    const bowlRight = Bodies.rectangle(this.width / 2 + 75, 770, 115, 15, { isStatic: true, angle: 0.42 });
    this.addTerrain(bowlLeft, '#1e293b', '#0f172a');
    this.addTerrain(bowlRight, '#1e293b', '#0f172a');

    // ----------------------------------------------------
    // JACKPOT WINNER TRAY (Bottom Center Collection Bin - Lowered to Y=955)
    // ----------------------------------------------------
    const jackL = Bodies.rectangle(this.width / 2 - 110, 955, 8, 45, { isStatic: true, friction: 0.8 });
    const jackR = Bodies.rectangle(this.width / 2 + 110, 955, 8, 45, { isStatic: true, friction: 0.8 });
    const jackB = Bodies.rectangle(this.width / 2, 978, 228, 8, { isStatic: true, friction: 0.9 });
    this.addTerrain(jackL, '#ffd700', '#b39700');
    this.addTerrain(jackR, '#ffd700', '#b39700');
    this.addTerrain(jackB, '#ffd700', '#b39700');

    // Hole Sensors for Stage 5 (Orbit radius = 40)
    // RED JACKPOT HOLE (Target)
    this.winnerHoleSensor = Bodies.circle(this.stage5Center.x, this.stage5Center.y + 40, 10, {
      isSensor: true, isStatic: true, plugin: { holeType: 'WINNER' }
    });

    // DRAIN HOLES (꽝)
    this.drainHole1 = Bodies.circle(this.stage5Center.x - 35, this.stage5Center.y - 20, 11, {
      isSensor: true, isStatic: true, plugin: { holeType: 'DRAIN' }
    });
    this.drainHole2 = Bodies.circle(this.stage5Center.x + 35, this.stage5Center.y - 20, 11, {
      isSensor: true, isStatic: true, plugin: { holeType: 'DRAIN' }
    });

    Composite.add(this.world, [this.winnerHoleSensor, this.drainHole1, this.drainHole2]);

    // Force initial alignment of 2/4/5 stage rotating pins & hole sensors at angle 0
    this.stage2Angle = 0;
    this.stage4Angle = 0;
    this.stage5Angle = 0;
    this.updateRotatingComponents(0);
  }

  spawnBalls(participants = []) {
    // Reset
    this.balls.forEach(b => Matter.Composite.remove(this.world, b.body));
    this.balls = [];
    this.finishers = [];
    this.eliminated = [];
    this.firstWinner = null;
    this.isFinished = false;
    this.isPaused = true;
    this.elapsedSeconds = 0;
    this.spawnTimer = 0;

    // Reset Replay System
    this.isPlayingReplay = false;
    this.frameBuffer = [];
    this.replayFrames = null;
    this.replayIndex = 0;
    this.replayZoom = true;
    this.postWinDelay = 0;

    // Reset Start Gate & Stage Gates
    if (this.startGate) {
      this.startGate.isOpen = false;
      const [lGate, rGate] = this.startGate.bodies;
      const [lX, rX] = this.startGate.initialX;
      Matter.Body.setPosition(lGate, { x: lX, y: lGate.position.y });
      Matter.Body.setPosition(rGate, { x: rX, y: rGate.position.y });
    }

    [1, 2, 3, 4].forEach(stage => {
      this.gates[stage].isOpen = false;
      const [lGate, rGate] = this.gates[stage].bodies;
      const [lX, rX] = this.gates[stage].initialX;
      Matter.Body.setPosition(lGate, { x: lX, y: lGate.position.y });
      Matter.Body.setPosition(rGate, { x: rX, y: rGate.position.y });
    });

    // Calculate Gate Open Times based on target duration
    const totalSec = this.targetDurationMinutes * 60;
    this.gates[1].openAt = totalSec * 0.15;
    this.gates[2].openAt = totalSec * 0.40;
    this.gates[3].openAt = totalSec * 0.65;
    this.gates[4].openAt = totalSec * 0.85;

    this.participants = participants;
    const total = participants.length || 250;
    this.totalBalls = total;

    // --- Destiny Allocation System ---
    const s1Pass = Math.round(total * 0.50);
    const s2Pass = Math.round(s1Pass * 0.50);
    const s3Pass = Math.round(s2Pass * 0.40);
    const s4Pass = Math.max(1, Math.round(s3Pass * 0.40)); 

    const drainCounts = {
      1: total - s1Pass,
      2: s1Pass - s2Pass,
      3: s2Pass - s3Pass,
      4: s3Pass - s4Pass,
      5: s4Pass // These reach the final stage
    };

    let targetStages = [];
    for (let stage = 1; stage <= 5; stage++) {
      for (let i = 0; i < drainCounts[stage]; i++) {
        targetStages.push(stage);
      }
    }
    // Shuffle targetStages
    for (let i = targetStages.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [targetStages[i], targetStages[j]] = [targetStages[j], targetStages[i]];
    }

    const colors = ['#FF3366', '#33CCFF', '#FFCC00', '#00FF66', '#FF66FF', '#9966FF', '#FF9933', '#00FFFF', '#FF5050', '#70FF00'];

    this.unspawnedBalls = [];
    this.balls = [];

    // Pre-spawn all 250 balls completely inside the upper glass box chamber (y: -360 ~ -60)
    const cols = 16;
    const spacingX = 22;
    const spacingY = 18;
    const startX = this.width / 2 - ((cols - 1) * spacingX) / 2;
    const startY = -360;

    // Create shuffled position slot indices for 100% fair random placement every round
    const slotIndices = Array.from({ length: total }, (_, idx) => idx);
    for (let i = slotIndices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [slotIndices[i], slotIndices[j]] = [slotIndices[j], slotIndices[i]];
    }

    for (let i = 0; i < total; i++) {
      const p = participants[i] || { ballNumber: i + 1, name: `구슬 #${i + 1}` };

      // Shuffled random grid slot assignment for fair initial distribution
      const slotIndex = slotIndices[i];
      const col = slotIndex % cols;
      const row = Math.floor(slotIndex / cols);

      // Add staggered row offset & random jitter for natural random stacking
      const rowStagger = (row % 2) * (spacingX * 0.5);
      const jitterX = (Math.random() - 0.5) * 8;
      const jitterY = (Math.random() - 0.5) * 6;

      const spawnX = startX + col * spacingX + rowStagger + jitterX;
      const spawnY = startY + row * spacingY + jitterY;

      const ballBody = Matter.Bodies.circle(spawnX, spawnY, 8, {
        restitution: 0.5,
        friction: 0.01,
        frictionAir: 0.005,
        density: 0.002,
        plugin: { ball: null }
      });

      const ballObj = {
        id: p.ballNumber,
        number: p.ballNumber,
        name: p.name,
        color: colors[i % colors.length],
        targetStage: targetStages[i] || 1,
        body: ballBody,
        stage: 1,
        finished: false,
        finishTime: null
      };

      ballBody.plugin.ball = ballObj;
      this.balls.push(ballObj);
      Matter.Composite.add(this.world, ballBody);
    }

    // Reset rotating stage angles to 0 and align pins & hole sensors
    this.stage2Angle = 0;
    this.stage4Angle = 0;
    this.stage5Angle = 0;
    this.updateRotatingComponents(0);

    this.onStageUpdate(this.getStageCounts());
    this.onTimerUpdate(0, totalSec);
  }

  setTargetDurationMinutes(mins) {
    this.targetDurationMinutes = Math.max(0.2, mins);
  }

  shakeMachine() {
    if (this.isPaused) return;
    audioSynth.playZaZaSound();
    this.balls.forEach(b => {
      if (b.finished) return;
      const pos = b.body.position;
      const randX = (Math.random() - 0.5) * 0.015;
      const randY = 0.012 + Math.random() * 0.015;
      Matter.Body.applyForce(b.body, pos, { x: randX, y: randY });
      b.stuckTimer = 0;
    });
  }

  updateRotatingComponents(step = 1) {
    // Stage 2 Tray Rotation
    this.stage2Angle += step * 0.02;
    if (this.stage2Pins) {
      this.stage2Pins.forEach(p => {
        const nx = this.stage2Center.x + Math.cos(p.angleOffset + this.stage2Angle) * 58;
        const ny = (this.stage2Center.y - 5) + Math.sin(p.angleOffset + this.stage2Angle) * 27.8;
        Matter.Body.setPosition(p.body, { x: nx, y: ny });
      });
    }

    // Stage 4 Tray Rotation
    this.stage4Angle -= step * 0.025;
    if (this.stage4Pins) {
      this.stage4Pins.forEach(p => {
        const nx = this.stage4Center.x + Math.cos(p.angleOffset + this.stage4Angle) * 48;
        const ny = (this.stage4Center.y - 5) + Math.sin(p.angleOffset + this.stage4Angle) * 23.0;
        Matter.Body.setPosition(p.body, { x: nx, y: ny });
      });
    }

    // Stage 5 Tray Rotation
    this.stage5Angle += step * 0.022;
    if (this.winnerHoleSensor && this.drainHole1 && this.drainHole2) {
      const rX = 38;
      const rY = 18.2;
      const winnerX = this.stage5Center.x + Math.cos(this.stage5Angle) * rX;
      const winnerY = this.stage5Center.y + Math.sin(this.stage5Angle) * rY;
      Matter.Body.setPosition(this.winnerHoleSensor, { x: winnerX, y: winnerY });

      const d1X = this.stage5Center.x + Math.cos(this.stage5Angle + (Math.PI * 2 / 3)) * rX;
      const d1Y = this.stage5Center.y + Math.sin(this.stage5Angle + (Math.PI * 2 / 3)) * rY;
      Matter.Body.setPosition(this.drainHole1, { x: d1X, y: d1Y });

      const d2X = this.stage5Center.x + Math.cos(this.stage5Angle + (Math.PI * 4 / 3)) * rX;
      const d2Y = this.stage5Center.y + Math.sin(this.stage5Angle + (Math.PI * 4 / 3)) * rY;
      Matter.Body.setPosition(this.drainHole2, { x: d2X, y: d2Y });
    }
  }

  handleHoleCollision(ball, holeType) {
    if (ball.finished) return;

    if (holeType === 'WINNER') {
      ball.finished = true;
      ball.stage = 'WIN';
      ball.finishTime = new Date().toLocaleTimeString();

      // Teleport ball into lowered Jackpot Tray at bottom center (y=938)
      const dropX = this.width / 2 + (Math.random() - 0.5) * 160;
      Matter.Body.setPosition(ball.body, { x: dropX, y: 938 });
      Matter.Body.setVelocity(ball.body, { x: (Math.random() - 0.5) * 1.5, y: 2 });
      ball.body.friction = 0.8;
      ball.body.restitution = 0.25;

      this.finishers.push(ball);

      if (!this.firstWinner) {
        this.firstWinner = ball;
        audioSynth.playJackpot();
        this.postWinDelay = 60; // Record ~60 extra frames (1 sec) after winning hit
        this.onWinner(ball);
      } else {
        audioSynth.playStageDrop();
      }

      this.onFinisher(ball, this.finishers.length);
    } else if (holeType === 'DRAIN') {
      ball.finished = true;
      ball.eliminatedStage = ball.stage;
      ball.stage = 'DRAIN';
      Matter.Body.setStatic(ball.body, true);
      // Move offscreen to avoid clutter
      Matter.Body.setPosition(ball.body, { x: -100, y: -100 });
      this.eliminated.push(ball);
      audioSynth.playStageDrop(); // Re-use this sound for drain
    }

    this.onStageUpdate(this.getStageCounts());
  }

  getStageCounts() {
    let s1 = 0, s2 = 0, s3 = 0, s4 = 0, s5 = 0, win = 0, drain = 0;
    const activeBalls = [];

    this.balls.forEach(b => {
      if (b.stage === 'WIN') {
        win++;
      } else if (b.stage === 'DRAIN') {
        drain++;
      } else {
        if (b.stage === 1) s1++;
        else if (b.stage === 2) s2++;
        else if (b.stage === 3) s3++;
        else if (b.stage === 4) s4++;
        else if (b.stage === 5) s5++;
        activeBalls.push(b);
      }
    });

    return {
      total: this.totalBalls,
      active: activeBalls.length,
      unspawned: this.unspawnedBalls.length,
      s1, s2, s3, s4, s5, win, drain,
      finishers: this.finishers,
      eliminated: this.eliminated,
      activeBalls,
      allBalls: this.balls
    };
  }

  update(deltaTime) {
    if (this.isFinished && !this.isPlayingReplay) return;

    if (this.isPlayingReplay) {
      this.render();
      return;
    }

    if (this.isPaused) {
      this.render();
      return;
    } 

    const deltaSec = (deltaTime / 1000) * this.speedMultiplier;
    this.elapsedSeconds += deltaSec;
    const targetTotalSec = this.targetDurationMinutes * 60;
    this.onTimerUpdate(this.elapsedSeconds, targetTotalSec);

    this.stageUpdateTimer = (this.stageUpdateTimer || 0) + deltaSec;
    if (this.stageUpdateTimer > 0.25) {
      this.stageUpdateTimer = 0;
      this.onStageUpdate(this.getStageCounts());
    }

    // Start Glass Box Release Logic (Instant glass bottom release upon start)
    if (this.startGate && !this.startGate.isOpen && !this.isPaused) {
      this.startGate.isOpen = true;
      audioSynth.playZaZaSound();
    }

    if (this.startGate && this.startGate.isOpen) {
      const [lGate, rGate] = this.startGate.bodies;
      const [lX, rX] = this.startGate.initialX;
      // Retract glass box bottom instantly without visible door-opening delay
      if (lGate.position.x > lX - 250) {
        Matter.Body.setPosition(lGate, { x: lX - 350, y: lGate.position.y });
        Matter.Body.setPosition(rGate, { x: rX + 350, y: rGate.position.y });
      }
    }

    // Gate Logic
    [1, 2, 3, 4].forEach(stage => {
      const gate = this.gates[stage];
      if (!gate.isOpen && this.elapsedSeconds >= gate.openAt) {
        gate.isOpen = true;
        audioSynth.playZaZaSound();
      }
      
      // Smoothly slide gates open
      if (gate.isOpen) {
        const [lGate, rGate] = gate.bodies;
        const [lX, rX] = gate.initialX;
        // Slide outwards by 50px
        if (lGate.position.x > lX - 50) {
          Matter.Body.translate(lGate, { x: -2 * this.speedMultiplier, y: 0 });
          Matter.Body.translate(rGate, { x: 2 * this.speedMultiplier, y: 0 });
        }
      }
    });

    for (let s = 0; s < this.speedMultiplier; s++) {
      Matter.Engine.update(this.engine, 1000 / 60);

      // Rotate Stage 2, Stage 4, and Stage 5 trays
      this.updateRotatingComponents(1);

      // Stage Tracking & Strict Side Drain Detection
      this.balls.forEach(b => {
        if (b.finished) return;
        const pos = b.body.position;

        // Strict Side Drain & Out-of-Bounds Detection
        const isSideDrain = (pos.x < 170 || pos.x > this.width - 170) && pos.y > 220;
        const isBelowBoard = pos.y > 850 && b.stage !== 'WIN';

        if (isSideDrain || isBelowBoard) {
          b.finished = true;
          b.eliminatedStage = b.stage || 1;
          b.stage = 'DRAIN';
          Matter.Body.setStatic(b.body, true);
          Matter.Body.setPosition(b.body, { x: -100, y: -100 });
          if (!this.eliminated.includes(b)) {
            this.eliminated.push(b);
          }
          this.onStageUpdate(this.getStageCounts());
          return;
        }

        let prevStage = b.stage;
        if (pos.y > 750 && pos.x >= 180 && pos.x <= 500) b.stage = 5;
        else if (pos.y > 570) b.stage = 4;
        else if (pos.y > 410) b.stage = 3;
        else if (pos.y > 230) b.stage = 2;
        
        if (b.stage > prevStage) {
            audioSynth.playStageDrop();
            this.onStageUpdate(this.getStageCounts());
        }

        // --- Destiny Force & Automatic Anti-Stuck Agitator ---
        const dx = Math.abs(pos.x - (b.lastX || pos.x));
        const dy = Math.abs(pos.y - (b.lastY || pos.y));
        const speedSq = dx * dx + dy * dy;

        b.lastX = pos.x;
        b.lastY = pos.y;

        const isCurrentGateOpen = (b.stage >= 1 && b.stage <= 4) ? this.gates[b.stage].isOpen : true;

        if (isCurrentGateOpen && speedSq < 0.25) {
          b.stuckTimer = (b.stuckTimer || 0) + 1;
        } else {
          b.stuckTimer = Math.max(0, (b.stuckTimer || 0) - 0.5);
        }

        // Apply gentle anti-stuck agitation after ~2.5 seconds (150 frames)
        if (b.stuckTimer > 150) {
          const nudgeY = 0.004 + Math.random() * 0.004;
          const nudgeX = (Math.random() - 0.5) * 0.005;
          Matter.Body.applyForce(b.body, pos, { x: nudgeX, y: nudgeY });
        }

        // Apply stronger agitation push after ~4.5 seconds (270 frames)
        if (b.stuckTimer > 270) {
          const targetX = (b.targetStage > b.stage) ? (this.width / 2) : (pos.x < this.width / 2 ? 100 : this.width - 100);
          const dirX = Math.sign(targetX - pos.x) || 1;
          const strongY = 0.012 + Math.random() * 0.008;
          Matter.Body.applyForce(b.body, pos, { x: dirX * 0.008, y: strongY });
        }

        let inDecisionZone = false;
        if (b.stage === 1 && pos.y > 100 && pos.y < 210) inDecisionZone = true;
        else if (b.stage === 2 && pos.y > 280 && pos.y < 390) inDecisionZone = true;
        else if (b.stage === 3 && pos.y > 460 && pos.y < 550) inDecisionZone = true;
        else if (b.stage === 4 && pos.y > 620 && pos.y < 705) inDecisionZone = true;

        if (inDecisionZone) {
          const forceMag = 0.0025; // Subtle wind
          if (b.targetStage > b.stage) {
            // Must survive: pull towards center
            const dir = Math.sign((this.width / 2) - pos.x) || 1;
            Matter.Body.applyForce(b.body, pos, { x: dir * forceMag, y: 0 });
          } else if (b.targetStage === b.stage) {
            // Must drain: push towards nearest side
            const dir = Math.sign(pos.x - (this.width / 2)) || 1;
            Matter.Body.applyForce(b.body, pos, { x: dir * forceMag, y: 0 });
          }
        }

        // Air Curtain Gimmick
        if (this.airCurtainActive && b.stage === 5) {
          const dx = pos.x - winnerX;
          const dy = pos.y - winnerY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 70) {
            Matter.Body.applyForce(b.body, pos, {
              x: (dx / dist) * 0.004,
              y: (dy / dist) * 0.004 - 0.002
            });
          }
        }
      });
    }

    // Frame Buffer Recording for 1st Place Replay
    if (!this.isPaused && !this.isPlayingReplay) {
      try {
        const snapshot = {
          stage2Angle: this.stage2Angle || 0,
          stage4Angle: this.stage4Angle || 0,
          stage5Angle: this.stage5Angle || 0,
          winnerHolePos: this.winnerHoleSensor?.position ? { x: this.winnerHoleSensor.position.x, y: this.winnerHoleSensor.position.y } : { x: 400, y: 780 },
          drain1Pos: this.drainHole1?.position ? { x: this.drainHole1.position.x, y: this.drainHole1.position.y } : { x: 300, y: 800 },
          drain2Pos: this.drainHole2?.position ? { x: this.drainHole2.position.x, y: this.drainHole2.position.y } : { x: 500, y: 800 },
          gatePositions: [1, 2, 3, 4].map(s => ({
            lX: this.gates[s]?.bodies[0]?.position ? this.gates[s].bodies[0].position.x : 0,
            rX: this.gates[s]?.bodies[1]?.position ? this.gates[s].bodies[1].position.x : 0
          })),
          balls: this.balls
            .filter(b => b && b.body && b.body.position && b.stage !== 'DRAIN')
            .map(b => ({
              id: b.id || b.number || 1,
              number: b.number || b.id || 1,
              color: b.color || '#00e5ff',
              stage: b.stage || 1,
              x: b.body.position.x,
              y: b.body.position.y
            }))
        };
        this.frameBuffer.push(snapshot);
        if (this.frameBuffer.length > 400) {
          this.frameBuffer.shift();
        }
      } catch (err) {}

      if (this.postWinDelay > 0) {
        this.postWinDelay--;
        if (this.postWinDelay === 0) {
          this.replayFrames = [...this.frameBuffer];
        }
      }
    }

    this.render();
  }

  startReplay() {
    if (!this.replayFrames || this.replayFrames.length === 0) {
      if (this.frameBuffer && this.frameBuffer.length > 0) {
        this.replayFrames = [...this.frameBuffer];
      } else {
        return false;
      }
    }
    this.isPlayingReplay = true;
    this.isFinished = false;
    this.isPaused = false;
    this.replayIndex = 0;
    this.replayZoom = true;
    return true;
  }

  stopReplay() {
    this.isPlayingReplay = false;
    this.replayIndex = 0;
  }

  toggleReplay() {
    if (this.isPlayingReplay) {
      this.stopReplay();
    } else {
      this.startReplay();
    }
    return this.isPlayingReplay;
  }

  toggleReplayZoom() {
    this.replayZoom = !this.replayZoom;
    return this.replayZoom;
  }

  // Helper for 3D A-Frame Cyber Shield Archway rendering
  drawAFrameShield(body, angle, side) {
    const pos = body.position;
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(angle);

    const w = 76;
    const h = 14;
    const depth = 8;

    // 1. 3D Side/Bottom Extrusion Face (Depth shadow)
    ctx.fillStyle = '#080d1a';
    ctx.beginPath();
    ctx.roundRect(-w/2, -h/2 + depth, w, h, 5);
    ctx.fill();

    // 2. Metallic Bevel Body Gradient
    const bodyGrad = ctx.createLinearGradient(-w/2, -h/2, w/2, h/2);
    if (side === 'left') {
      bodyGrad.addColorStop(0, '#1e293b');
      bodyGrad.addColorStop(0.4, '#334155');
      bodyGrad.addColorStop(1, '#00f0ff');
    } else {
      bodyGrad.addColorStop(0, '#00f0ff');
      bodyGrad.addColorStop(0.6, '#334155');
      bodyGrad.addColorStop(1, '#1e293b');
    }

    ctx.fillStyle = bodyGrad;
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 12;

    ctx.beginPath();
    ctx.roundRect(-w/2, -h/2, w, h, 5);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    // 3. Top Specular Bevel Line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-w/2 + 6, -h/2 + 2);
    ctx.lineTo(w/2 - 6, -h/2 + 2);
    ctx.stroke();

    // 4. Metallic Rivet Studs
    [-w/2 + 8, w/2 - 8].forEach(rx => {
      ctx.fillStyle = '#ffd700';
      ctx.shadowColor = '#ffd700';
      ctx.shadowBlur = 4;
      ctx.beginPath();
      ctx.arc(rx, 0, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    });

    // 5. Center Neon LED Dot
    ctx.fillStyle = '#00f0ff';
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(0, 0, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.restore();
  }

  // Helper for 3D Cylinder rendering
  draw3DCylinder(x, y, radius, colorTop, colorSide, height) {
    const ctx = this.ctx;
    
    // Side body
    ctx.fillStyle = colorSide;
    ctx.beginPath();
    ctx.rect(x - radius, y, radius * 2, height);
    ctx.fill();
    
    // Bottom cap
    ctx.beginPath();
    ctx.ellipse(x, y + height, radius, radius * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Top cap
    ctx.fillStyle = colorTop;
    ctx.beginPath();
    ctx.ellipse(x, y, radius, radius * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    const isReplay = this.isPlayingReplay && this.replayFrames && this.replayFrames.length > 0;
    const currentReplayIdx = isReplay ? Math.min(Math.floor(this.replayIndex), this.replayFrames.length - 1) : 0;
    const replayFrame = isReplay ? this.replayFrames[currentReplayIdx] : null;

    const stage2Angle = replayFrame ? (replayFrame.stage2Angle || 0) : (this.stage2Angle || 0);
    const stage4Angle = replayFrame ? (replayFrame.stage4Angle || 0) : (this.stage4Angle || 0);
    const stage5Angle = replayFrame ? (replayFrame.stage5Angle || 0) : (this.stage5Angle || 0);

    // ── Premium Background ──────────────────────────────────────
    const bgGrad = ctx.createLinearGradient(0, 0, 0, this.height);
    bgGrad.addColorStop(0,   '#080b14');
    bgGrad.addColorStop(0.35,'#0d1221');
    bgGrad.addColorStop(0.7, '#0a0f1c');
    bgGrad.addColorStop(1,   '#060910');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, this.width, this.height);

    // Subtle dot-grid overlay
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.028)';
    for (let gx = 0; gx < this.width; gx += 22) {
      for (let gy = 0; gy < this.height; gy += 22) {
        ctx.beginPath();
        ctx.arc(gx, gy, 0.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();

    // ── Apply Replay Camera Zoom Transform ──────────────────────
    const isZoomed = this.isPlayingReplay && this.replayZoom;
    ctx.save();
    if (isZoomed) {
      const zoomScale = 1.8;
      const focusX = this.width / 2;
      const focusY = 780;
      ctx.translate(this.width / 2, this.height / 2);
      ctx.scale(zoomScale, zoomScale);
      ctx.translate(-focusX, -focusY);
    }

    // Left rail
    ctx.save();
    const railL = ctx.createLinearGradient(0, 0, 18, 0);
    railL.addColorStop(0, 'rgba(0,229,255,0.18)');
    railL.addColorStop(1, 'transparent');
    ctx.fillStyle = railL;
    ctx.fillRect(0, 0, 18, this.height);
    ctx.restore();

    // Right rail
    ctx.save();
    const railR = ctx.createLinearGradient(this.width, 0, this.width - 18, 0);
    railR.addColorStop(0, 'rgba(0,229,255,0.18)');
    railR.addColorStop(1, 'transparent');
    ctx.fillStyle = railR;
    ctx.fillRect(this.width - 18, 0, 18, this.height);
    ctx.restore();

    // Stage zone separator bands
    const zoneSeps = [
      { y: 185, label: '── STAGE 2 ──', color: 'rgba(0,229,255,0.06)' },
      { y: 380, label: '── STAGE 3 ──', color: 'rgba(255,45,107,0.05)' },
      { y: 590, label: '── STAGE 4 ──', color: 'rgba(168,85,247,0.05)' },
      { y: 745, label: '── STAGE 5 ──', color: 'rgba(255,201,71,0.05)' },
    ];
    zoneSeps.forEach(z => {
      ctx.save();
      const zg = ctx.createLinearGradient(0, z.y - 8, 0, z.y + 8);
      zg.addColorStop(0,   'transparent');
      zg.addColorStop(0.5, z.color);
      zg.addColorStop(1,   'transparent');
      ctx.fillStyle = zg;
      ctx.fillRect(0, z.y - 8, this.width, 16);
      ctx.restore();
    });

    // ----------------------------------------------------
    // Render 3D Terrain & Gates
    // ----------------------------------------------------
    this.terrains.forEach(t => {
      if (t.body.plugin && t.body.plugin.isAFrame) {
        this.drawAFrameShield(t.body, t.body.angle, t.body.plugin.side);
        return;
      }

      ctx.save();
      const pos = t.body.position;
      const angle = t.body.angle;
      
      // Determine width/height from bounds (approximate for rectangles)
      const bounds = t.body.bounds;
      const w = bounds.max.x - bounds.min.x;
      const h = bounds.max.y - bounds.min.y;
      
      // We will draw the polygon directly for accuracy, and add a 3D drop face
      ctx.translate(pos.x, pos.y);
      ctx.rotate(angle);
      
      // Draw 3D side face (depth)
      const depth = 20;
      ctx.fillStyle = t.colorSide;
      ctx.beginPath();
      const verts = t.body.vertices;
      // Vertices are in world coordinates, we need them local
      const localVerts = verts.map(v => ({ x: v.x - pos.x, y: v.y - pos.y }));
      // Reverse rotation for local coordinates
      const cos = Math.cos(-angle);
      const sin = Math.sin(-angle);
      const rotatedVerts = localVerts.map(v => ({
          x: v.x * cos - v.y * sin,
          y: v.x * sin + v.y * cos
      }));

      ctx.moveTo(rotatedVerts[0].x, rotatedVerts[0].y + depth);
      for (let j = 1; j < rotatedVerts.length; j++) {
          ctx.lineTo(rotatedVerts[j].x, rotatedVerts[j].y + depth);
      }
      ctx.closePath();
      ctx.fill();

      // Connect side faces
      ctx.beginPath();
      ctx.moveTo(rotatedVerts[0].x, rotatedVerts[0].y);
      ctx.lineTo(rotatedVerts[0].x, rotatedVerts[0].y + depth);
      ctx.lineTo(rotatedVerts[1].x, rotatedVerts[1].y + depth);
      ctx.lineTo(rotatedVerts[1].x, rotatedVerts[1].y);
      ctx.closePath();
      ctx.fill();
      
      ctx.beginPath();
      ctx.moveTo(rotatedVerts[3].x, rotatedVerts[3].y);
      ctx.lineTo(rotatedVerts[3].x, rotatedVerts[3].y + depth);
      ctx.lineTo(rotatedVerts[2].x, rotatedVerts[2].y + depth);
      ctx.lineTo(rotatedVerts[2].x, rotatedVerts[2].y);
      ctx.closePath();
      ctx.fill();

      // Draw Top Face with gradient
      ctx.fillStyle = t.colorTop;
      ctx.beginPath();
      ctx.moveTo(rotatedVerts[0].x, rotatedVerts[0].y);
      for (let j = 1; j < rotatedVerts.length; j++) {
          ctx.lineTo(rotatedVerts[j].x, rotatedVerts[j].y);
      }
      ctx.closePath();
      ctx.fill();

      // Specular rim highlight
      ctx.strokeStyle = t.isGlassBox
        ? 'rgba(0,229,255,0.7)'
        : (t.isGate ? 'rgba(255,180,0,0.7)' : 'rgba(255,255,255,0.22)');
      ctx.lineWidth = (t.isGlassBox || t.isGate) ? 1.5 : 1;
      ctx.stroke();

      // Top-edge bright bevel
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(rotatedVerts[0].x, rotatedVerts[0].y);
      ctx.lineTo(rotatedVerts[1].x, rotatedVerts[1].y);
      ctx.stroke();

      ctx.restore();
    });

    // ── Jackpot Tray Section ────────────────────────────────────
    ctx.save();

    // Ambient glow backdrop behind tray
    const trayAmbient = ctx.createRadialGradient(this.width/2, 950, 0, this.width/2, 950, 140);
    trayAmbient.addColorStop(0,   'rgba(255,201,71,0.14)');
    trayAmbient.addColorStop(0.6, 'rgba(255,201,71,0.04)');
    trayAmbient.addColorStop(1,   'transparent');
    ctx.fillStyle = trayAmbient;
    ctx.fillRect(0, 890, this.width, 100);

    // Separator line — dual stroke (dark base + neon top)
    ctx.strokeStyle = 'rgba(180,140,0,0.5)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(30, 918); ctx.lineTo(this.width - 30, 918);
    ctx.stroke();

    ctx.strokeStyle = '#ffc947';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = '#ffc947';
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.moveTo(30, 918); ctx.lineTo(this.width - 30, 918);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Label above tray
    ctx.fillStyle = '#ffc947';
    ctx.font = 'bold 10.5px "Space Grotesk", Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#ffc947';
    ctx.shadowBlur = 8;
    ctx.fillText('🏆  1등 당첨 구슬 수거함  ·  JACKPOT TRAY  🏆', this.width / 2, 910);
    ctx.shadowBlur = 0;

    // Tray body – layered gradients for depth
    const trayBg = ctx.createLinearGradient(this.width/2 - 115, 926, this.width/2 + 115, 980);
    trayBg.addColorStop(0,    'rgba(255,201,71,0.18)');
    trayBg.addColorStop(0.35, 'rgba(12,16,28,0.97)');
    trayBg.addColorStop(0.65, 'rgba(12,16,28,0.97)');
    trayBg.addColorStop(1,    'rgba(255,201,71,0.18)');

    // Drop shadow for tray box
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 6;
    ctx.fillStyle = trayBg;
    ctx.beginPath();
    ctx.roundRect(this.width/2 - 115, 926, 230, 54, 10);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // Outer neon border
    ctx.strokeStyle = '#ffc947';
    ctx.lineWidth = 1.8;
    ctx.shadowColor = '#ffc947';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.roundRect(this.width/2 - 115, 926, 230, 54, 10);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Inner highlight bevel
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(this.width/2 - 113, 928, 226, 50, 8);
    ctx.stroke();

    // Corner rivet dots
    [[-105, 933],[105, 933],[-105, 973],[105, 973]].forEach(([ox, oy]) => {
      ctx.fillStyle = '#ffc947';
      ctx.shadowColor = '#ffc947';
      ctx.shadowBlur = 5;
      ctx.beginPath();
      ctx.arc(this.width/2 + ox, oy, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    });

    ctx.restore();

    // ── Drain Zones ─────────────────────────────────────────────
    this.drainZones.forEach(dz => {
      const pos = dz.body.position;
      ctx.save();

      // Outer glow halo
      const haloGrad = ctx.createRadialGradient(pos.x, pos.y, dz.radius * 0.6, pos.x, pos.y, dz.radius * 1.4);
      haloGrad.addColorStop(0,   'rgba(255,45,107,0.22)');
      haloGrad.addColorStop(1,   'transparent');
      ctx.fillStyle = haloGrad;
      ctx.beginPath();
      ctx.ellipse(pos.x, pos.y, dz.radius * 1.4, dz.radius * 0.63, 0, 0, Math.PI * 2);
      ctx.fill();

      // Deep 3-layer pit
      const holeGrad = ctx.createRadialGradient(pos.x - 4, pos.y - 4, 2, pos.x, pos.y, dz.radius);
      holeGrad.addColorStop(0,    '#180008');
      holeGrad.addColorStop(0.45, '#380010');
      holeGrad.addColorStop(0.78, '#770022');
      holeGrad.addColorStop(1,    '#ff2d6b');

      ctx.fillStyle = holeGrad;
      ctx.shadowColor = '#ff2d6b';
      ctx.shadowBlur = 22;
      ctx.beginPath();
      ctx.ellipse(pos.x, pos.y, dz.radius, dz.radius * 0.46, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Double warning rim
      ctx.strokeStyle = 'rgba(255,45,107,0.35)';
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.strokeStyle = '#ff2d6b';
      ctx.lineWidth = 1.5;
      ctx.shadowColor = '#ff2d6b';
      ctx.shadowBlur = 10;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Label
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px Inter, "Noto Sans KR", sans-serif';
      ctx.textAlign = 'center';
      ctx.shadowColor = '#ff2d6b';
      ctx.shadowBlur = 6;
      ctx.fillText(`💀 ${dz.label}`, pos.x, pos.y + 4);
      ctx.restore();
    });

    // ── 3D Pins & Rotating Disks ────────────────────────────────
    const pinHeight = 11;

    // Stage 1 pins — golden
    this.stage1Pins.forEach(p => {
      // Pin base ring
      ctx.save();
      ctx.fillStyle = 'rgba(255,201,71,0.18)';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + pinHeight, p.r * 1.8, p.r * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      this.draw3DCylinder(p.x, p.y, p.r, '#ffd97a', '#c9850a', pinHeight);
    });

    // Stage 3 pins — crimson
    this.stage3Pins.forEach(p => {
      ctx.save();
      ctx.fillStyle = 'rgba(255,45,107,0.15)';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + pinHeight, p.r * 1.8, p.r * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      this.draw3DCylinder(p.x, p.y, p.r, '#ff6b97', '#990033', pinHeight);
    });

    // ── Stage 2 Disk ────────────────────────────────────────────
    ctx.save();
    // Outer glow ring
    ctx.strokeStyle = 'rgba(0,229,255,0.2)';
    ctx.lineWidth = 10;
    ctx.shadowColor = '#00e5ff';
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.ellipse(this.stage2Center.x, this.stage2Center.y + 3.5, 87, 41.8, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    // Fill plate with radial gradient for 3D dome feel
    const s2PlateFill = ctx.createRadialGradient(
      this.stage2Center.x - 18, this.stage2Center.y - 8, 4,
      this.stage2Center.x, this.stage2Center.y + 3.5, 88
    );
    s2PlateFill.addColorStop(0,   'rgba(0,229,255,0.22)');
    s2PlateFill.addColorStop(0.6, 'rgba(0,229,255,0.07)');
    s2PlateFill.addColorStop(1,   'rgba(0,100,180,0.04)');
    ctx.fillStyle = s2PlateFill;
    ctx.beginPath();
    ctx.ellipse(this.stage2Center.x, this.stage2Center.y + 3.5, 85, 40.8, 0, 0, Math.PI * 2);
    ctx.fill();
    // Neon rim
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#00e5ff';
    ctx.shadowBlur = 12;
    ctx.stroke();
    ctx.shadowBlur = 0;
    // Inner track ring
    ctx.strokeStyle = 'rgba(0,229,255,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(this.stage2Center.x, this.stage2Center.y + 3.5, 62, 29.8, 0, 0, Math.PI * 2);
    ctx.stroke();
    this.draw3DCylinder(this.stage2Center.x, this.stage2Center.y - 5, 5, '#e0ffff', '#007799', pinHeight);
    this.stage2Pins.forEach(p => {
      let px = p.body.position.x;
      let py = p.body.position.y;
      if (replayFrame) {
        const angle = p.angleOffset + stage2Angle;
        px = this.stage2Center.x + Math.cos(angle) * 58;
        py = (this.stage2Center.y - 5) + Math.sin(angle) * 27.8;
      }
      this.draw3DCylinder(px, py, p.r, '#66efff', '#007799', pinHeight);
    });
    ctx.restore();

    // ── Stage 4 Disk ────────────────────────────────────────────
    ctx.save();
    ctx.strokeStyle = 'rgba(168,85,247,0.2)';
    ctx.lineWidth = 10;
    ctx.shadowColor = '#a855f7';
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.ellipse(this.stage4Center.x, this.stage4Center.y + 3.5, 72, 34.6, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    const s4PlateFill = ctx.createRadialGradient(
      this.stage4Center.x - 14, this.stage4Center.y - 6, 3,
      this.stage4Center.x, this.stage4Center.y + 3.5, 72
    );
    s4PlateFill.addColorStop(0,   'rgba(168,85,247,0.22)');
    s4PlateFill.addColorStop(0.6, 'rgba(168,85,247,0.07)');
    s4PlateFill.addColorStop(1,   'rgba(80,0,160,0.04)');
    ctx.fillStyle = s4PlateFill;
    ctx.beginPath();
    ctx.ellipse(this.stage4Center.x, this.stage4Center.y + 3.5, 70, 33.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#a855f7';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#a855f7';
    ctx.shadowBlur = 12;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(168,85,247,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(this.stage4Center.x, this.stage4Center.y + 3.5, 50, 24, 0, 0, Math.PI * 2);
    ctx.stroke();
    this.draw3DCylinder(this.stage4Center.x, this.stage4Center.y - 5, 5, '#f0e0ff', '#660099', pinHeight);
    this.stage4Pins.forEach(p => {
      let px = p.body.position.x;
      let py = p.body.position.y;
      if (replayFrame) {
        const angle = p.angleOffset + stage4Angle;
        px = this.stage4Center.x + Math.cos(angle) * 48;
        py = (this.stage4Center.y - 5) + Math.sin(angle) * 23.0;
      }
      this.draw3DCylinder(px, py, p.r, '#cc88ff', '#660099', pinHeight);
    });
    ctx.restore();

    // ── Stage 5 Disk ────────────────────────────────────────────
    ctx.save();
    const s5Color = this.tiltActive ? '#ff00ff' : '#22d3a5';
    const s5ColorDim = this.tiltActive ? 'rgba(255,0,255,0.2)' : 'rgba(34,211,165,0.2)';
    // Outer glow ring
    ctx.strokeStyle = s5ColorDim;
    ctx.lineWidth = 10;
    ctx.shadowColor = s5Color;
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.ellipse(this.stage5Center.x, this.stage5Center.y + 3.5, 60, 28.8, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    // Fill
    const s5PlateFill = ctx.createRadialGradient(
      this.stage5Center.x - 12, this.stage5Center.y - 5, 2,
      this.stage5Center.x, this.stage5Center.y + 3.5, 60
    );
    s5PlateFill.addColorStop(0,   this.tiltActive ? 'rgba(255,0,255,0.22)' : 'rgba(34,211,165,0.22)');
    s5PlateFill.addColorStop(0.6, this.tiltActive ? 'rgba(255,0,255,0.07)' : 'rgba(34,211,165,0.07)');
    s5PlateFill.addColorStop(1,   'rgba(0,0,0,0.04)');
    ctx.fillStyle = s5PlateFill;
    ctx.beginPath();
    ctx.ellipse(this.stage5Center.x, this.stage5Center.y + 3.5, 58, 27.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = s5Color;
    ctx.lineWidth = 2;
    ctx.shadowColor = s5Color;
    ctx.shadowBlur = 14;
    ctx.stroke();
    ctx.shadowBlur = 0;
    // Inner track ring
    ctx.strokeStyle = 'rgba(34,211,165,0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(this.stage5Center.x, this.stage5Center.y + 3.5, 40, 19.2, 0, 0, Math.PI * 2);
    ctx.stroke();
    // Center hub
    this.draw3DCylinder(this.stage5Center.x, this.stage5Center.y, 6, '#22d3a5', '#0f766e', pinHeight);

    // WINNER HOLE – vivid red with gold rim
    let winPos = this.winnerHoleSensor.position;
    let d1Pos = this.drainHole1.position;
    let d2Pos = this.drainHole2.position;

    if (replayFrame) {
      const rX = 38;
      const rY = 18.2;
      winPos = {
        x: this.stage5Center.x + Math.cos(stage5Angle) * rX,
        y: this.stage5Center.y + Math.sin(stage5Angle) * rY
      };
      d1Pos = {
        x: this.stage5Center.x + Math.cos(stage5Angle + (Math.PI * 2 / 3)) * rX,
        y: this.stage5Center.y + Math.sin(stage5Angle + (Math.PI * 2 / 3)) * rY
      };
      d2Pos = {
        x: this.stage5Center.x + Math.cos(stage5Angle + (Math.PI * 4 / 3)) * rX,
        y: this.stage5Center.y + Math.sin(stage5Angle + (Math.PI * 4 / 3)) * rY
      };
    }

    const winGrad = ctx.createRadialGradient(winPos.x - 3, winPos.y - 2, 1, winPos.x, winPos.y, 13);
    winGrad.addColorStop(0,   '#ff4444');
    winGrad.addColorStop(0.5, '#cc0000');
    winGrad.addColorStop(1,   '#440000');
    ctx.fillStyle = winGrad;
    ctx.shadowColor = '#ff2020';
    ctx.shadowBlur = 22;
    ctx.beginPath();
    ctx.ellipse(winPos.x, winPos.y, 12, 5.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffc947';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 8.5px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#ff0000';
    ctx.shadowBlur = 5;
    ctx.fillText('1등', winPos.x, winPos.y + 10);
    ctx.shadowBlur = 0;

    // DRAIN HOLES (Stage 5)
    [d1Pos, d2Pos].forEach(pos => {
      const dGrad = ctx.createRadialGradient(pos.x - 2, pos.y - 2, 1, pos.x, pos.y, 13);
      dGrad.addColorStop(0, '#1e293b');
      dGrad.addColorStop(1, '#020508');
      ctx.fillStyle = dGrad;
      ctx.strokeStyle = 'rgba(100,116,139,0.5)';
      ctx.lineWidth = 1.5;
      ctx.shadowColor = 'rgba(255,45,107,0.3)';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.ellipse(pos.x, pos.y, 13, 6.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(148,163,184,0.75)';
      ctx.font = 'bold 8px Inter, sans-serif';
      ctx.fillText('꽝', pos.x, pos.y + 10);
    });
    ctx.restore();

    // ── 3D Spherical Balls ──────────────────────────────────────
    const ballsToRender = (isReplay && replayFrame && Array.isArray(replayFrame.balls))
      ? replayFrame.balls
      : (this.balls || []).filter(b => b && b.body && b.body.position && b.stage !== 'DRAIN').map(b => ({
          x: b.body.position.x,
          y: b.body.position.y,
          color: b.color || '#00e5ff',
          number: b.number || b.id || 1,
          stage: b.stage || 1
        }));

    ballsToRender.forEach(b => {
      if (!b) return;
      const pos = { x: b.x || 0, y: b.y || 0 };
      const radius = 8;
      const color = b.color || '#00e5ff';
      const isWin = b.stage === 'WIN';

      // Elliptical contact shadow
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.beginPath();
      ctx.ellipse(pos.x, pos.y + radius + 1, radius * 0.75, radius * 0.28, 0, 0, Math.PI * 2);
      ctx.fill();

      // Win ball outer glow
      if (isWin) {
        ctx.shadowColor = color;
        ctx.shadowBlur = 28;
      }

      // 3D sphere – dual radial gradient (highlight + base + rim)
      const ballGrad = ctx.createRadialGradient(
        pos.x - radius * 0.35, pos.y - radius * 0.38, radius * 0.05,
        pos.x + radius * 0.1,  pos.y + radius * 0.1,  radius
      );
      ballGrad.addColorStop(0,    '#ffffff');
      ballGrad.addColorStop(0.18, 'rgba(255,255,255,0.82)');
      ballGrad.addColorStop(0.42, color);
      ballGrad.addColorStop(0.82, shadeColor(color, -0.55));
      ballGrad.addColorStop(1,    '#000000');

      ctx.fillStyle = ballGrad;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Specular micro-highlight (upper-left)
      const specGrad = ctx.createRadialGradient(
        pos.x - radius * 0.3, pos.y - radius * 0.3, 0,
        pos.x - radius * 0.3, pos.y - radius * 0.3, radius * 0.55
      );
      specGrad.addColorStop(0,   'rgba(255,255,255,0.75)');
      specGrad.addColorStop(1,   'transparent');
      ctx.fillStyle = specGrad;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
      ctx.fill();

      // Number badge
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.ellipse(pos.x, pos.y - 0.5, 5, 3.8, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#000';
      ctx.font = 'bold 6.5px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(b.number, pos.x, pos.y - 0.5);
    });

    // End Replay Camera Zoom Transform
    ctx.restore();

    // ── Replay Overlay Banner (Screen Space UI) ────────────────
    if (this.isPlayingReplay && this.replayFrames && this.replayFrames.length > 0) {
      const totalFrames = this.replayFrames.length;
      const currentIdx = Math.min(Math.floor(this.replayIndex), totalFrames - 1);

      ctx.save();
      ctx.fillStyle = 'rgba(7, 9, 18, 0.92)';
      ctx.fillRect(0, 0, this.width, 60);
      ctx.strokeStyle = '#00e5ff';
      ctx.lineWidth = 1.5;
      ctx.shadowColor = '#00e5ff';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.rect(0, 0, this.width, 60);
      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.fillStyle = '#00e5ff';
      ctx.font = 'bold 14px "Space Grotesk", Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.shadowColor = '#00e5ff';
      ctx.shadowBlur = 8;
      const modeText = this.replayZoom ? '🔍 1.8x 확대 줌 모드' : '🔍 전체보기 모드';
      ctx.fillText(`🎬 1등 당첨 순간 REPLAY (${modeText})`, this.width / 2, 24);
      ctx.shadowBlur = 0;

      ctx.fillStyle = '#ffc947';
      ctx.font = 'bold 10.5px Inter, sans-serif';
      ctx.fillText('💡 보드를 클릭하거나 줌 버튼을 눌러 [확대 줌 ↔ 전체보기] 전환', this.width / 2, 40);

      // Progress bar
      const progress = (currentIdx + 1) / totalFrames;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.fillRect(40, 50, this.width - 80, 5);
      ctx.fillStyle = '#ffc947';
      ctx.shadowColor = '#ffc947';
      ctx.shadowBlur = 8;
      ctx.fillRect(40, 50, (this.width - 80) * progress, 5);
      ctx.shadowBlur = 0;

      ctx.restore();

      // Advance replay index (0.5x slow motion)
      this.replayIndex += 0.5;
      if (this.replayIndex >= totalFrames) {
        this.replayIndex = 0;
      }
    }
  }

  setSpeed(mult) {
    this.speedMultiplier = mult;
  }

  toggleTilt(val) {
    this.tiltActive = val;
    audioSynth.playZaZaSound();
  }

  toggleAirCurtain(val) {
    this.airCurtainActive = val;
    audioSynth.playZaZaSound();
  }
}
