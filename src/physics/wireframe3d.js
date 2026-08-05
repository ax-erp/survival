import * as THREE from 'three';

export class Wireframe3DRenderer {
  constructor(container, options = {}) {
    this.container = container;
    this.isClientView = !!options.isClientView;

    this.width = container.clientWidth || 340;
    this.height = container.clientHeight || 260;

    // Camera Modes: 'cockpit' | 'shoulder' | 'overview'
    this.cameraMode = 'cockpit'; // Cockpit FPV set as default!
    this.targetBallId = 0; // Target ball index 0..249 (corresponding to Ball #1..#250)

    // Motion-Sickness Filter: Heavy Low-Pass Smoothing to prevent camera jitter/shake
    this.smoothedPos = { x: 0, y: 0, z: 0 };
    this.smoothedVel = { x: 0, y: 0 };

    // Gyroscope / Touch Orientation Angles (Euler Pitch & Yaw in degrees)
    this.gyroOffset = { pitch: 0, yaw: 0 };
    this.smoothedGyro = { pitch: 0, yaw: 0 };

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x070a14);

    // Perspective Camera with 68 FOV & 0.05 near plane to prevent close pin clipping
    this.camera = new THREE.PerspectiveCamera(68, this.width / this.height, 0.05, 4000);

    // WebGL Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(this.width, this.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    // 250 Wireframe Materials for maximum visibility & non-obscured see-through 3D view!
    this.ballMaterials = [];
    for (let i = 0; i < 250; i++) {
      const hue = (i * 137.5) % 360; // Golden angle distribution for distinct colors
      const color = new THREE.Color().setHSL(hue / 360, 0.95, 0.6);
      this.ballMaterials.push(new THREE.MeshBasicMaterial({ wireframe: true, color }));
    }

    // Materials: See-through Wireframe Spheres & Solid 3D Terrains/Pins
    this.materials = {
      ballTarget: new THREE.MeshBasicMaterial({ wireframe: true, color: 0xffd700 }),  // Neon Gold Wireframe Sphere
      ballWinner: new THREE.MeshBasicMaterial({ wireframe: true, color: 0xff1493 }),  // Neon Pink Winner Wireframe Sphere
      
      // Vibrant Glowing Red for Eliminated/Dead Balls (Smartphone Client Only)
      ballEliminated: new THREE.MeshBasicMaterial({ wireframe: true, color: 0xff0033, transparent: true, opacity: 0.95 }),
      
      // Stage Specific Pins (Matching 1~5 Stage Colors in UI: 1-Gold, 2-Cyan, 3-Red, 4-Purple)
      pinStage1: new THREE.MeshBasicMaterial({ color: 0xffc947, transparent: true, opacity: 0.9 }),  // Stage 1 Gold
      pinStage2: new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.9 }),  // Stage 2 Cyan
      pinStage3: new THREE.MeshBasicMaterial({ color: 0xff2d6b, transparent: true, opacity: 0.9 }),  // Stage 3 Red
      pinStage4: new THREE.MeshBasicMaterial({ color: 0xa855f7, transparent: true, opacity: 0.9 }),  // Stage 4 Purple
      
      // Solid Low-Resource 3D Pins & Rotating Discs
      pin: new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.9 }),          // Sky Blue Solid Cylinder Pin
      
      // Solid Low-Resource Panel Materials for Terrains & Gates
      wall: new THREE.MeshBasicMaterial({ color: 0x1e293b, transparent: true, opacity: 0.85 }),        // Dark Slate Solid Panel
      funnel: new THREE.MeshBasicMaterial({ color: 0x0f172a, transparent: true, opacity: 0.9 }),      // Deep Slate Solid Panel
      gateClosed: new THREE.MeshBasicMaterial({ color: 0xd97706, transparent: true, opacity: 0.9 }),  // Amber Orange Gate Solid Panel
      gateOpen: new THREE.MeshBasicMaterial({ color: 0x16a34a, transparent: true, opacity: 0.7 }),    // Emerald Green Gate Solid Panel
      drain: new THREE.MeshBasicMaterial({ color: 0xb91c1c, transparent: true, opacity: 0.85 }),       // Red Drain Solid Cylinder
      basin: new THREE.MeshBasicMaterial({ color: 0x22d3a5, transparent: true, opacity: 0.85 }),       // Green Basin Solid Disc (Stage 5 Green)
      archway: new THREE.MeshBasicMaterial({ color: 0x9333ea, transparent: true, opacity: 0.85 }),     // Purple Archway Panel
      glassBox: new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.3, wireframe: true }), // Transparent Cyan Glass Box
      targetIndicator: new THREE.MeshBasicMaterial({ wireframe: true, color: 0xffc947 })
    };

    // Mesh Pools & References
    this.ballMeshes = [];
    this.terrainMeshes = [];
    this.drainMeshes = [];

    this.dynamicGroup = new THREE.Group();
    this.terrainGroup = new THREE.Group();
    this.scene.add(this.terrainGroup);
    this.scene.add(this.dynamicGroup);

    this.stage2PinsGroup = new THREE.Group();
    this.stage4PinsGroup = new THREE.Group();
    this.stage5BasinGroup = new THREE.Group();
    this.scene.add(this.stage2PinsGroup);
    this.scene.add(this.stage4PinsGroup);
    this.scene.add(this.stage5BasinGroup);

    this.speedLinesGroup = new THREE.Group();
    this.scene.add(this.speedLinesGroup);

    // Target Indicator Ring around target ball
    const indicatorGeo = new THREE.RingGeometry(14, 18, 16);
    this.targetIndicatorMesh = new THREE.Mesh(indicatorGeo, this.materials.targetIndicator);
    this.scene.add(this.targetIndicatorMesh);

    // Resize observer
    this.resizeObserver = new ResizeObserver(() => this.onResize());
    this.resizeObserver.observe(this.container);

    this.machineWidth = 800;
    this.machineHeight = 1040;

    this.isInitialized = false;
  }

  onResize() {
    if (!this.container) return;
    this.width = this.container.clientWidth || 340;
    this.height = this.container.clientHeight || 260;
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.width, this.height);
  }

  // Map 2D Matter.js coordinates (0~800, 0~1040) to 3D Space with 1.45x Extended Vertical Length
  map2DTo3D(x, y, z = 0) {
    const scaleY = 1.45; // 45% extended vertical travel distance
    return {
      x: x - this.machineWidth / 2,
      y: -(y - this.machineHeight / 2) * scaleY,
      z: z
    };
  }

  setGyroOffset(beta, gamma) {
    // Clamp tilt angles (-35 ~ 35 deg Pitch, -45 ~ 45 deg Yaw)
    const clampPitch = Math.max(-35, Math.min(35, beta || 0));
    const clampYaw = Math.max(-45, Math.min(45, gamma || 0));

    // Pitch: Up/Down angle in degrees, Yaw: Left/Right angle in degrees
    this.gyroOffset.pitch = clampPitch * 0.85;
    this.gyroOffset.yaw = clampYaw * 0.95;
  }

  // Build Retro Wireframe Speed Tunnel & Tapered 3D Cabinet Box
  buildTaperedCageAndTunnel(scaledHeight) {
    const topY = scaledHeight / 2;
    const botY = -scaledHeight / 2;
    const wTop = 860; // Wide top
    const wBot = 540; // Narrow bottom for tapered perspective & tension!
    const zFront = 80; // Elevated ceiling front wireframe height to match 50px tall pins
    const zBack = -40;

    // 1. Tapered Outer Cabinet Box Wireframe (Retro Crimson Red + Neon Cyan Wireframe)
    const cagePositions = [
      // Front Quad
      -wTop / 2, topY, zFront,   wTop / 2, topY, zFront,
       wTop / 2, topY, zFront,   wBot / 2, botY, zFront,
       wBot / 2, botY, zFront,  -wBot / 2, botY, zFront,
      -wBot / 2, botY, zFront,  -wTop / 2, topY, zFront,

      // Back Quad
      -wTop / 2, topY, zBack,    wTop / 2, topY, zBack,
       wTop / 2, topY, zBack,    wBot / 2, botY, zBack,
       wBot / 2, botY, zBack,   -wBot / 2, botY, zBack,
      -wBot / 2, botY, zBack,   -wTop / 2, topY, zBack,

      // Connecting Edges (Front to Back)
      -wTop / 2, topY, zFront,  -wTop / 2, topY, zBack,
       wTop / 2, topY, zFront,   wTop / 2, topY, zBack,
       wBot / 2, botY, zFront,   wBot / 2, botY, zBack,
      -wBot / 2, botY, zFront,  -wBot / 2, botY, zBack
    ];

    const cageGeo = new THREE.BufferGeometry();
    cageGeo.setAttribute('position', new THREE.Float32BufferAttribute(cagePositions, 3));

    // Outer Cage Lines (Neon Red / Crimson for intense retro arcade look like captured image!)
    const cageMat = new THREE.LineBasicMaterial({
      color: 0xff0044,
      transparent: true,
      opacity: 0.6,
      linewidth: 2
    });
    const cageWire = new THREE.LineSegments(cageGeo, cageMat);
    this.scene.add(cageWire);

    // 2. CEILING TOP GRID: HORIZONTAL & VERTICAL SPEED LINES (Ceiling Plane Z = zFront = 80 ONLY)
    const tunnelPositions = [];

    // Ceiling Horizontal Lines
    const ceilingRungs = 24;
    for (let r = 1; r < ceilingRungs; r++) {
      const t = r / ceilingRungs;
      const y = topY - t * (topY - botY);
      const w = wTop * (1 - t) + wBot * t;
      const hw = w / 2;
      tunnelPositions.push(-hw, y, zFront,  hw, y, zFront);
    }

    // Ceiling Vertical Lines (On Ceiling Plane Z = zFront = 80 ONLY)
    const ceilingCols = 8;
    for (let c = 1; c < ceilingCols; c++) {
      const frac = c / ceilingCols;
      const xTop = -wTop / 2 + frac * wTop;
      const xBot = -wBot / 2 + frac * wBot;
      tunnelPositions.push(xTop, topY, zFront,  xBot, botY, zFront);
    }

    const tunnelGeo = new THREE.BufferGeometry();
    tunnelGeo.setAttribute('position', new THREE.Float32BufferAttribute(tunnelPositions, 3));
    const tunnelMat = new THREE.LineBasicMaterial({
      color: 0xff1744, // Vibrant Retro Vector Red
      transparent: true,
      opacity: 0.3
    });
    const tunnelWire = new THREE.LineSegments(tunnelGeo, tunnelMat);
    this.scene.add(tunnelWire);

    // 3. FLOOR BOTTOM GRID: HORIZONTAL & VERTICAL SPEED LINES (Floor Plane Z = -18.0 ONLY)
    const floorPositions = [
      // Outer Boundary Frame
      -wTop / 2, topY, -18.0,   wTop / 2, topY, -18.0,
       wTop / 2, topY, -18.0,   wBot / 2, botY, -18.0,
       wBot / 2, botY, -18.0,  -wBot / 2, botY, -18.0,
      -wBot / 2, botY, -18.0,  -wTop / 2, topY, -18.0
    ];

    // Floor Horizontal Lines
    const floorRungs = 24;
    for (let r = 1; r < floorRungs; r++) {
      const t = r / floorRungs;
      const y = topY - t * (topY - botY);
      const w = wTop * (1 - t) + wBot * t;
      const hw = w / 2;
      floorPositions.push(-hw, y, -18.0,  hw, y, -18.0);
    }

    // Floor Vertical Lines (On Floor Plane Z = -18.0 ONLY)
    const floorCols = 8;
    for (let c = 1; c < floorCols; c++) {
      const frac = c / floorCols;
      const xTop = -wTop / 2 + frac * wTop;
      const xBot = -wBot / 2 + frac * wBot;
      floorPositions.push(xTop, topY, -18.0,  xBot, botY, -18.0);
    }

    const floorGeo = new THREE.BufferGeometry();
    floorGeo.setAttribute('position', new THREE.Float32BufferAttribute(floorPositions, 3));

    // High-visibility vibrant red for floor speed grid lines
    const floorMat = new THREE.LineBasicMaterial({
      color: 0xff0033,
      transparent: true,
      opacity: 0.35,
      linewidth: 1.5
    });
    const floorWire = new THREE.LineSegments(floorGeo, floorMat);
    floorWire.renderOrder = 1;
    this.scene.add(floorWire);

    // Backboard Solid Panel with Tapered Trapeze Geometry
    const backShape = new THREE.Shape();
    backShape.moveTo(-wTop / 2, topY);
    backShape.lineTo(wTop / 2, topY);
    backShape.lineTo(wBot / 2, botY);
    backShape.lineTo(-wBot / 2, botY);
    backShape.closePath();

    const backGeo = new THREE.ShapeGeometry(backShape);
    const backMat = new THREE.MeshBasicMaterial({ color: 0x050914 });
    const backMesh = new THREE.Mesh(backGeo, backMat);
    backMesh.position.set(0, 0, -25);
    this.scene.add(backMesh);

    // 3. Initialize Dynamic Speed Lines Particle Group
    this.initSpeedLines();
  }

  initSpeedLines() {
    this.speedLines = [];
    const count = 30;
    const speedLineGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 6); // 2 vertices per line segment

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.2;
      const radius = 180 + Math.random() * 220;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      const z = (Math.random() - 0.5) * 800;
      const len = 30 + Math.random() * 50;

      positions[i * 6 + 0] = x;
      positions[i * 6 + 1] = y;
      positions[i * 6 + 2] = z;

      positions[i * 6 + 3] = x;
      positions[i * 6 + 4] = y;
      positions[i * 6 + 5] = z - len;

      this.speedLines.push({
        baseX: x,
        baseY: y,
        z: z,
        length: len,
        speedFactor: 0.8 + Math.random() * 0.6
      });
    }

    speedLineGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const speedLineMat = new THREE.LineBasicMaterial({
      color: 0x00e5ff,
      transparent: true,
      opacity: 0.5
    });

    this.speedLineMesh = new THREE.LineSegments(speedLineGeo, speedLineMat);
    this.speedLinesGroup.add(this.speedLineMesh);
  }

  updateSpeedLines(speed) {
    if (!this.speedLineMesh || !this.speedLines) return;
    const positions = this.speedLineMesh.geometry.attributes.position.array;
    const activeMult = Math.min(3.5, Math.max(0.5, speed * 0.15));

    for (let i = 0; i < this.speedLines.length; i++) {
      const line = this.speedLines[i];
      line.z -= 18 * line.speedFactor * activeMult;

      if (line.z < -400) {
        line.z = 400;
      }

      const zCur = line.z;
      const zTail = line.z - line.length * activeMult;

      positions[i * 6 + 0] = line.baseX;
      positions[i * 6 + 1] = line.baseY;
      positions[i * 6 + 2] = zCur;

      positions[i * 6 + 3] = line.baseX;
      positions[i * 6 + 4] = line.baseY;
      positions[i * 6 + 5] = zTail;
    }

    this.speedLineMesh.geometry.attributes.position.needsUpdate = true;
    this.speedLinesGroup.position.copy(this.camera.position);
    this.speedLinesGroup.rotation.copy(this.camera.rotation);
  }

  initMachineStructure(pachinkoEngine) {
    if (this.isInitialized) return;
    this.isInitialized = true;

    const scaledHeight = this.machineHeight * 1.45;
    
    // Build Tapered 3D Box Cabinet & Retro Wireframe Speed Tunnel
    this.buildTaperedCageAndTunnel(scaledHeight);

    // 2. Build 3D Solid Panels for Funnels, Walls, and Gates from pachinkoEngine.terrains
    if (pachinkoEngine.terrains && pachinkoEngine.terrains.length > 0) {
      pachinkoEngine.terrains.forEach(t => {
        if (!t.body) return;
        const pos = t.body.position;
        const angle = t.body.angle;
        const verts = t.body.vertices;

        if (verts && verts.length >= 3) {
          const shape = new THREE.Shape();
          const localCenter = this.map2DTo3D(pos.x, pos.y);

          const localVerts = verts.map(v => {
            const p = this.map2DTo3D(v.x, v.y);
            return new THREE.Vector2(p.x - localCenter.x, p.y - localCenter.y);
          });

          shape.moveTo(localVerts[0].x, localVerts[0].y);
          for (let i = 1; i < localVerts.length; i++) {
            shape.lineTo(localVerts[i].x, localVerts[i].y);
          }
          shape.closePath();

          const extrudeSettings = { depth: 50, bevelEnabled: false };
          const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);

          let mat = this.materials.wall;
          if (t.isGlassBox) mat = this.materials.glassBox;
          else if (t.isGate) mat = this.materials.gateClosed;
          else if (t.body.plugin?.isAFrame) mat = this.materials.archway;

          const mesh = new THREE.Mesh(geo, mat);
          mesh.position.set(localCenter.x, localCenter.y, -25);
          mesh.rotation.z = -angle;

          const borderWire = new THREE.LineSegments(
            new THREE.WireframeGeometry(geo),
            new THREE.LineBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.4 })
          );
          mesh.add(borderWire);

          this.terrainGroup.add(mesh);
          this.terrainMeshes.push({ mesh, body: t.body, isGate: t.isGate });
        }
      });
    }

    // 3. Drain Zones Recessed 3D Holes (바닥 Z = -12.5 보다 깊게 파인 3D 탈락 구멍)
    if (pachinkoEngine.drainZones && pachinkoEngine.drainZones.length > 0) {
      pachinkoEngine.drainZones.forEach(d => {
        const pos = this.map2DTo3D(d.body.position.x, d.body.position.y);
        const r = d.radius;

        // Recessed Pit Tube (Dipping down from floor Z = -12.5 down to Z = -40)
        const tubeGeo = new THREE.CylinderGeometry(r, r * 0.82, 28, 24, 1, true);
        const tubeMat = new THREE.MeshBasicMaterial({ color: 0x880022, side: THREE.DoubleSide });
        const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
        tubeMesh.position.set(pos.x, pos.y, -26);
        tubeMesh.rotation.x = Math.PI / 2;
        this.scene.add(tubeMesh);

        // Inner Wireframe Grid for Deep Hole Look
        const wireGeo = new THREE.WireframeGeometry(tubeGeo);
        const wireMesh = new THREE.LineSegments(wireGeo, new THREE.LineBasicMaterial({ color: 0xff0044, transparent: true, opacity: 0.7 }));
        tubeMesh.add(wireMesh);

        // Pitch Black Floor Disc at Bottom of Hole (Z = -40)
        const bottomGeo = new THREE.CircleGeometry(r * 0.82, 24);
        const bottomMesh = new THREE.Mesh(bottomGeo, new THREE.MeshBasicMaterial({ color: 0x020308, side: THREE.DoubleSide }));
        bottomMesh.position.set(pos.x, pos.y, -40);
        this.scene.add(bottomMesh);

        // Glowing Crimson Surface Ring around Top Rim at Floor Level (Z = -12.2)
        const rimGeo = new THREE.RingGeometry(r - 1, r + 4.5, 24);
        const rimMesh = new THREE.Mesh(rimGeo, new THREE.MeshBasicMaterial({ color: 0xff0044, side: THREE.DoubleSide }));
        rimMesh.position.set(pos.x, pos.y, -12.2);
        this.scene.add(rimMesh);

        const innerRimGeo = new THREE.RingGeometry(r - 2.5, r - 1, 24);
        const innerRimMesh = new THREE.Mesh(innerRimGeo, new THREE.MeshBasicMaterial({ color: 0xef4444, side: THREE.DoubleSide }));
        innerRimMesh.position.set(pos.x, pos.y, -12.25);
        this.scene.add(innerRimMesh);
      });
    }

    // 4. Stage 1 Pins (Gold)
    if (pachinkoEngine.stage1Pins) {
      const pinGeo = new THREE.CylinderGeometry(4, 4, 50, 10);
      pachinkoEngine.stage1Pins.forEach(p => {
        const pos = this.map2DTo3D(p.x, p.y, -12.5 + 25);
        const mesh = new THREE.Mesh(pinGeo, this.materials.pinStage1);
        mesh.position.set(pos.x, pos.y, pos.z);
        mesh.rotation.x = Math.PI / 2;
        this.scene.add(mesh);
      });
    }

    // 5. Stage 2 Rotating Pins Group (Cyan)
    if (pachinkoEngine.stage2Center) {
      const centerPos = this.map2DTo3D(pachinkoEngine.stage2Center.x, pachinkoEngine.stage2Center.y);
      this.stage2PinsGroup.position.set(centerPos.x, centerPos.y, 0);
      this.stage2PinsGroup.renderOrder = 10; // Render above floor grid lines

      // Solid Opaque Backing Disc Plate
      const baseDiscGeo = new THREE.CircleGeometry(70, 32);
      const baseDiscMesh = new THREE.Mesh(baseDiscGeo, new THREE.MeshBasicMaterial({ color: 0x070d1e, side: THREE.DoubleSide }));
      baseDiscMesh.position.set(0, 0, -12.6);
      this.stage2PinsGroup.add(baseDiscMesh);

      const ringGeo = new THREE.RingGeometry(50, 70, 24);
      const ringMesh = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.9 }));
      ringMesh.position.set(0, 0, -12.5);
      this.stage2PinsGroup.add(ringMesh);

      const pinGeo = new THREE.CylinderGeometry(6, 6, 50, 10);
      pachinkoEngine.stage2Pins.forEach(p => {
        const mesh = new THREE.Mesh(pinGeo, this.materials.pinStage2);
        mesh.position.set(Math.cos(p.angleOffset) * p.dist, Math.sin(p.angleOffset) * p.dist, -12.5 + 25);
        mesh.rotation.x = Math.PI / 2;
        this.stage2PinsGroup.add(mesh);
      });
    }

    // 6. Stage 3 Pins (Red)
    if (pachinkoEngine.stage3Pins) {
      const pinGeo = new THREE.CylinderGeometry(5, 5, 50, 10);
      pachinkoEngine.stage3Pins.forEach(p => {
        const pos = this.map2DTo3D(p.x, p.y, -12.5 + 25);
        const mesh = new THREE.Mesh(pinGeo, this.materials.pinStage3);
        mesh.position.set(pos.x, pos.y, pos.z);
        mesh.rotation.x = Math.PI / 2;
        this.scene.add(mesh);
      });
    }

    // 7. Stage 4 Rotating Pins Group (Purple)
    if (pachinkoEngine.stage4Center) {
      const centerPos = this.map2DTo3D(pachinkoEngine.stage4Center.x, pachinkoEngine.stage4Center.y);
      this.stage4PinsGroup.position.set(centerPos.x, centerPos.y, 0);
      this.stage4PinsGroup.renderOrder = 10; // Render above floor grid lines

      // Solid Opaque Backing Disc Plate
      const baseDiscGeo = new THREE.CircleGeometry(60, 32);
      const baseDiscMesh = new THREE.Mesh(baseDiscGeo, new THREE.MeshBasicMaterial({ color: 0x0c071e, side: THREE.DoubleSide }));
      baseDiscMesh.position.set(0, 0, -12.6);
      this.stage4PinsGroup.add(baseDiscMesh);

      const ringGeo = new THREE.RingGeometry(40, 60, 20);
      const ringMesh = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xa855f7, transparent: true, opacity: 0.9 }));
      ringMesh.position.set(0, 0, -12.5);
      this.stage4PinsGroup.add(ringMesh);

      const pinGeo = new THREE.CylinderGeometry(6, 6, 50, 10);
      pachinkoEngine.stage4Pins.forEach(p => {
        const mesh = new THREE.Mesh(pinGeo, this.materials.pinStage4);
        mesh.position.set(Math.cos(p.angleOffset) * p.dist, Math.sin(p.angleOffset) * p.dist, -12.5 + 25);
        mesh.rotation.x = Math.PI / 2;
        this.stage4PinsGroup.add(mesh);
      });
    }

    // 8. Stage 5 Basin Group (Green)
    if (pachinkoEngine.stage5Center) {
      const centerPos = this.map2DTo3D(pachinkoEngine.stage5Center.x, pachinkoEngine.stage5Center.y);
      this.stage5BasinGroup.position.set(centerPos.x, centerPos.y, 0);
      this.stage5BasinGroup.renderOrder = 10; // Render above floor grid lines

      // Flat Green Disc Plate (Z = -12.5)
      const basinGeo = new THREE.CircleGeometry(65, 32);
      const basinMesh = new THREE.Mesh(basinGeo, this.materials.basin);
      basinMesh.position.set(0, 0, -12.5);
      this.stage5BasinGroup.add(basinMesh);

      // Glowing Green Outer Rim (matching Stage 5 Green #22d3a5)
      const basinBorderGeo = new THREE.RingGeometry(64, 68, 32);
      const basinBorderMesh = new THREE.Mesh(basinBorderGeo, new THREE.MeshBasicMaterial({ color: 0x22d3a5, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }));
      basinBorderMesh.position.set(0, 0, -12.4);
      this.stage5BasinGroup.add(basinBorderMesh);

      // Hole dimensions & orbit radius
      const holeRadius = 11;
      const orbitDist = 38;

      // 1) WINNER HOLE (1등 당첨 구멍 - Flat floor hole flush at Z = -12.3)
      const winHoleDarkGeo = new THREE.CircleGeometry(holeRadius - 1, 24);
      this.winHoleMesh = new THREE.Mesh(winHoleDarkGeo, new THREE.MeshBasicMaterial({ color: 0x050914, side: THREE.DoubleSide }));
      this.winHoleMesh.position.set(orbitDist, 0, -12.3);
      this.stage5BasinGroup.add(this.winHoleMesh);

      const winRingGeo = new THREE.RingGeometry(holeRadius - 1, holeRadius + 3.5, 24);
      const winRingMesh = new THREE.Mesh(winRingGeo, new THREE.MeshBasicMaterial({ color: 0xffd700, side: THREE.DoubleSide }));
      winRingMesh.position.set(orbitDist, 0, -12.2);
      this.stage5BasinGroup.add(winRingMesh);

      const winInnerRedRingGeo = new THREE.RingGeometry(holeRadius - 2.5, holeRadius - 1, 24);
      const winInnerRedRingMesh = new THREE.Mesh(winInnerRedRingGeo, new THREE.MeshBasicMaterial({ color: 0xef4444, side: THREE.DoubleSide }));
      winInnerRedRingMesh.position.set(orbitDist, 0, -12.25);
      this.stage5BasinGroup.add(winInnerRedRingMesh);

      // 2) DRAIN HOLE 1 (꽝 구멍 #1 - Crimson Red at +120 deg, Flat floor hole at Z = -12.3)
      const d1Angle = Math.PI * 2 / 3;
      const d1X = Math.cos(d1Angle) * orbitDist;
      const d1Y = Math.sin(d1Angle) * orbitDist;

      const drainDarkGeo1 = new THREE.CircleGeometry(holeRadius - 1, 24);
      this.drainHoleMesh1 = new THREE.Mesh(drainDarkGeo1, new THREE.MeshBasicMaterial({ color: 0x050914, side: THREE.DoubleSide }));
      this.drainHoleMesh1.position.set(d1X, d1Y, -12.3);
      this.stage5BasinGroup.add(this.drainHoleMesh1);

      const drainRingGeo1 = new THREE.RingGeometry(holeRadius - 1, holeRadius + 3, 24);
      const drainRingMesh1 = new THREE.Mesh(drainRingGeo1, new THREE.MeshBasicMaterial({ color: 0xef4444, side: THREE.DoubleSide }));
      drainRingMesh1.position.set(d1X, d1Y, -12.2);
      this.stage5BasinGroup.add(drainRingMesh1);

      // 3) DRAIN HOLE 2 (꽝 구멍 #2 - Crimson Red at +240 deg, Flat floor hole at Z = -12.3)
      const d2Angle = Math.PI * 4 / 3;
      const d2X = Math.cos(d2Angle) * orbitDist;
      const d2Y = Math.sin(d2Angle) * orbitDist;

      const drainDarkGeo2 = new THREE.CircleGeometry(holeRadius - 1, 24);
      this.drainHoleMesh2 = new THREE.Mesh(drainDarkGeo2, new THREE.MeshBasicMaterial({ color: 0x050914, side: THREE.DoubleSide }));
      this.drainHoleMesh2.position.set(d2X, d2Y, -12.3);
      this.stage5BasinGroup.add(this.drainHoleMesh2);

      const drainRingGeo2 = new THREE.RingGeometry(holeRadius - 1, holeRadius + 3, 24);
      const drainRingMesh2 = new THREE.Mesh(drainRingGeo2, new THREE.MeshBasicMaterial({ color: 0xef4444, side: THREE.DoubleSide }));
      drainRingMesh2.position.set(d2X, d2Y, -12.2);
      this.stage5BasinGroup.add(drainRingMesh2);
    }

    // 9. Initialize 250 Wireframe Ball Mesh Pool with see-through geometry
    const ballGeo = new THREE.IcosahedronGeometry(7, 1);
    for (let i = 0; i < 250; i++) {
      const mesh = new THREE.Mesh(ballGeo, this.ballMaterials[i]);
      mesh.visible = false;
      this.dynamicGroup.add(mesh);
      this.ballMeshes.push(mesh);
    }
  }

  setTargetBall(index) {
    this.targetBallId = Math.max(0, Math.min(249, index));
  }

  setCameraMode(mode) {
    if (['shoulder', 'cockpit', 'overview'].includes(mode)) {
      this.cameraMode = mode;
    }
  }

  renderFrame(pachinkoEngine) {
    if (!pachinkoEngine) return;
    if (!this.isInitialized) {
      this.initMachineStructure(pachinkoEngine);
    }

    // Safe replay frame check
    const isReplay = pachinkoEngine.isPlayingReplay && pachinkoEngine.replayFrames && pachinkoEngine.replayFrames.length > 0;
    const replayFrame = isReplay ? pachinkoEngine.replayFrames[Math.min(Math.floor(pachinkoEngine.replayIndex), pachinkoEngine.replayFrames.length - 1)] : null;

    const s2Angle = replayFrame ? (replayFrame.stage2Angle || 0) : (pachinkoEngine.stage2Angle || 0);
    const s4Angle = replayFrame ? (replayFrame.stage4Angle || 0) : (pachinkoEngine.stage4Angle || 0);
    const s5Angle = replayFrame ? (replayFrame.stage5Angle || 0) : (pachinkoEngine.stage5Angle || 0);

    // 1. Update rotating stages & dynamic terrain positions (gates)
    if (this.stage2PinsGroup) {
      this.stage2PinsGroup.rotation.z = -s2Angle;
    }
    if (this.stage4PinsGroup) {
      this.stage4PinsGroup.rotation.z = -s4Angle;
    }
    if (this.stage5BasinGroup) {
      this.stage5BasinGroup.rotation.z = -s5Angle;
    }

    this.terrainMeshes.forEach(t => {
      if (t.body && t.body.position) {
        const p = this.map2DTo3D(t.body.position.x, t.body.position.y);
        t.mesh.position.set(p.x, p.y, -15);
        t.mesh.rotation.z = -t.body.angle;
      }
    });

    // 2. Fetch ball array from PachinkoEngine (use replayFrame balls during replay if available)
    const activeBalls = (isReplay && replayFrame && Array.isArray(replayFrame.balls))
      ? replayFrame.balls
      : (pachinkoEngine.balls || []);
    let targetPos3D = { x: 0, y: 0, z: 0 };
    let targetVel = { x: 0, y: 0 };
    let targetStage = 1;
    let targetBallFound = false;
    let targetIsEliminated = false;

    // Hide all ball meshes by default
    for (let i = 0; i < 250; i++) {
      this.ballMeshes[i].visible = false;
    }

    let isTargetWinner = false;

    activeBalls.forEach(b => {
      if (!b) return;

      const num = b.number || b.id || (b.ballNumber);
      if (!num || num < 1 || num > 250) return;

      const meshIdx = num - 1; // 0-indexed mesh array (0 to 249)
      const mesh = this.ballMeshes[meshIdx];
      if (!mesh) return;

      let posX = 0;
      let posY = 0;
      let velX = 0;
      let velY = 0;

      if (b.body && b.body.position) {
        posX = b.body.position.x;
        posY = b.body.position.y;
        velX = b.body.velocity ? b.body.velocity.x : 0;
        velY = b.body.velocity ? b.body.velocity.y : 0;
      } else if (b.x !== undefined && b.y !== undefined) {
        posX = b.x;
        posY = b.y;
        velX = b.vx || 0;
        velY = b.vy || 0;
      } else {
        return;
      }

      mesh.visible = true;

      // Status check
      const isTarget = (meshIdx === this.targetBallId);
      const isWinner = (b.stage === 'WIN' || b.isWinner === true);
      const isEliminated = (b.stage === 'DRAIN' || b.eliminated);

      let pos3D = this.map2DTo3D(posX, posY, 0);

      // Plunge eliminated ball down into deep 3D drain hole (below floor level Z = -12.5 -> Z = -32)
      if (isEliminated) {
        pos3D.z = -32;
      }
      mesh.position.set(pos3D.x, pos3D.y, pos3D.z);

      if (isTarget) {
        targetPos3D = pos3D;
        targetVel = { x: velX, y: velY };
        targetStage = b.stage || 1;
        targetBallFound = true;
        targetIsEliminated = isEliminated;

        // Trigger 3D winning hole plunge animation EXACTLY when target ball enters the winning hole in frame
        if (b.stage === 'WIN' || (posY >= 810 && Math.abs(posX - 400) < 40 && b.stage === 5)) {
          isTargetWinner = true;
        }

        if (this.cameraMode === 'cockpit') {
          // Hide own target ball mesh in cockpit mode for 100% unobstructed 1st person driver seat!
          mesh.visible = false;
          this.targetIndicatorMesh.visible = false;
        } else {
          mesh.material = this.materials.ballTarget;
          mesh.scale.set(2.0, 2.0, 2.0);

          this.targetIndicatorMesh.position.set(pos3D.x, pos3D.y, pos3D.z + 1);
          this.targetIndicatorMesh.rotation.z += 0.05;
          this.targetIndicatorMesh.visible = true;
        }
      } else if (isWinner) {
        mesh.material = this.materials.ballWinner;
        mesh.scale.set(this.isClientView ? 0.7 : 1.8, this.isClientView ? 0.7 : 1.8, this.isClientView ? 0.7 : 1.8);
      } else if (isEliminated) {
        // Red Wireframe Spheres for Dead/Eliminated Balls plunging into deep pit hole
        mesh.material = this.materials.ballEliminated;
        mesh.scale.set(this.isClientView ? 0.7 : 0.6, this.isClientView ? 0.7 : 0.6, this.isClientView ? 0.7 : 0.6);
      } else {
        // Wireframe see-through material for clear unobstructed view!
        mesh.material = this.ballMaterials[meshIdx];
        mesh.scale.set(this.isClientView ? 0.7 : 1.0, this.isClientView ? 0.7 : 1.0, this.isClientView ? 0.7 : 1.0);
      }
    });

    if (isTargetWinner) {
      if (!this.winAnimActive) {
        this.winAnimActive = true;
        this.winAnimStartTime = performance.now();
      }
    } else {
      this.winAnimActive = false;
    }

    if (!targetBallFound) {
      targetPos3D = this.map2DTo3D(this.machineWidth / 2, 40, 0);
      this.targetIndicatorMesh.visible = false;
    }

    // ----------------------------------------------------
    // Fast & Responsive Camera Low-Pass Filter
    // ----------------------------------------------------
    const filterLerpX = this.isClientView ? 0.35 : 0.15;
    const filterLerpY = this.isClientView ? 0.45 : 0.20;
    const filterLerpZ = this.isClientView ? 0.45 : 0.20;

    if (!this.smoothedPos.initialized) {
      this.smoothedPos.x = targetPos3D.x;
      this.smoothedPos.y = targetPos3D.y;
      this.smoothedPos.z = targetPos3D.z;
      this.smoothedPos.initialized = true;
    } else {
      this.smoothedPos.x += (targetPos3D.x - this.smoothedPos.x) * filterLerpX;
      this.smoothedPos.y += (targetPos3D.y - this.smoothedPos.y) * filterLerpY;
      this.smoothedPos.z += (targetPos3D.z - this.smoothedPos.z) * filterLerpZ;
    }

    this.smoothedVel.x += (targetVel.x - this.smoothedVel.x) * 0.1;
    this.smoothedVel.y += (targetVel.y - this.smoothedVel.y) * 0.1;

    // Smooth Euler Gyro/Touch Angles (Pitch & Yaw)
    this.smoothedGyro.pitch += ((this.gyroOffset.pitch || 0) - this.smoothedGyro.pitch) * 0.2;
    this.smoothedGyro.yaw += ((this.gyroOffset.yaw || 0) - this.smoothedGyro.yaw) * 0.2;

    // 3. Camera Controls (100% Linear Euler Up/Down/Left/Right)
    const camLerp = this.isClientView ? 0.45 : 0.20;

    if (this.cameraMode === 'cockpit') {
      // Cockpit FPV View:
      // Smartphone Client (isClientView: true): +30Y offset positions camera FORWARD closer to marble nose & track!
      // Host PIP view (isClientView: false): -30Y offset centers pins right in middle of PIP window height.
      let camTargetX = this.smoothedPos.x;
      let camTargetY = this.smoothedPos.y + (this.isClientView ? 30 : -30);
      let camTargetZ = 5;
      let basePitchDeg = this.isClientView ? -25 : -5;

      // Dynamic 3D Hole Plunge & Jackpot Tray Landing Cinematic Animation
      if (this.winAnimActive) {
        const winElapsed = (performance.now() - this.winAnimStartTime) / 1000.0;

        if (winElapsed < 0.6) {
          // Phase 1: Plunge into 3D Winner Hole (Z-axis drop & look down into hole)
          const progress = winElapsed / 0.6;
          camTargetZ = 5 - progress * 48; // Drop Z from +5 down to -43
          basePitchDeg = (this.isClientView ? -25 : -5) - progress * 30; // Tilt down into hole
        } else if (winElapsed < 1.4) {
          // Phase 2: Underground Chute Slide (Glide toward Jackpot Tray below floor level)
          const progress = (winElapsed - 0.6) / 0.8;
          camTargetZ = -43 + progress * 20; // Z slides from -43 up to -23
          basePitchDeg = -30 + progress * 15;
        } else {
          // Phase 3: Emerge into Jackpot Tray & Victory View (Land in gold tray, tilt pitch UP at 3D machine!)
          const progress = Math.min(1.0, (winElapsed - 1.4) / 0.8);
          camTargetZ = -23 + progress * 35 + Math.sin(progress * Math.PI) * 4; // Rise to Z=12 with soft landing bounce
          basePitchDeg = -15 + progress * 45; // Pitch UP to +30 deg looking up at the illuminated 3D machine!
        }
      }

      this.camera.position.x += (camTargetX - this.camera.position.x) * camLerp;
      this.camera.position.y += (camTargetY - this.camera.position.y) * camLerp;
      this.camera.position.z += (camTargetZ - this.camera.position.z) * camLerp;

      const totalPitchRad = THREE.MathUtils.degToRad(basePitchDeg + this.smoothedGyro.pitch);
      const totalYawRad = THREE.MathUtils.degToRad(this.smoothedGyro.yaw);

      // Clean 3D Spherical Direction Vector (Zero Arc Swing!)
      const dirX = Math.sin(totalYawRad);
      const dirY = -Math.cos(totalYawRad) * Math.cos(totalPitchRad);
      const dirZ = Math.sin(totalPitchRad);

      const lookX = this.camera.position.x + dirX * 300;
      const lookY = this.camera.position.y + dirY * 300;
      const lookZ = this.camera.position.z + dirZ * 300;

      this.camera.up.set(0, 0, 1); // Standard Z-up for clean linear Euler rotation
      this.camera.lookAt(lookX, lookY, lookZ);

    } else if (this.cameraMode === 'shoulder') {
      // Smooth Shoulder Follow View
      const camTargetX = this.smoothedPos.x;
      const camTargetY = this.smoothedPos.y + (this.isClientView ? 100 : 180);
      const camTargetZ = 130;

      this.camera.position.x += (camTargetX - this.camera.position.x) * camLerp;
      this.camera.position.y += (camTargetY - this.camera.position.y) * camLerp;
      this.camera.position.z += (camTargetZ - this.camera.position.z) * camLerp;

      const basePitchDeg = this.isClientView ? -28 : -25;
      const totalPitchRad = THREE.MathUtils.degToRad(basePitchDeg + this.smoothedGyro.pitch);
      const totalYawRad = THREE.MathUtils.degToRad(this.smoothedGyro.yaw);

      const dirX = Math.sin(totalYawRad);
      const dirY = -Math.cos(totalYawRad) * Math.cos(totalPitchRad);
      const dirZ = Math.sin(totalPitchRad);

      const lookX = this.camera.position.x + dirX * 300;
      const lookY = this.camera.position.y + dirY * 300;
      const lookZ = this.camera.position.z + dirZ * 300;

      this.camera.up.set(0, 0, 1);
      this.camera.lookAt(lookX, lookY, lookZ);

    } else if (this.cameraMode === 'overview') {
      // 3D Overview (Full Spectator Bird's-Eye View)
      const camTargetX = this.smoothedPos.x * 0.15 + (this.smoothedGyro.yaw || 0) * 3.0;
      const camTargetY = (this.smoothedPos.y * 0.15 - 50) + (this.smoothedGyro.pitch || 0) * 3.0;
      const camTargetZ = 1250;

      this.camera.position.x += (camTargetX - this.camera.position.x) * 0.08;
      this.camera.position.y += (camTargetY - this.camera.position.y) * 0.08;
      this.camera.position.z += (camTargetZ - this.camera.position.z) * 0.08;

      const lookTargetX = this.smoothedPos.x * 0.1;
      const lookTargetY = this.smoothedPos.y * 0.1;
      const lookTargetZ = 0;

      this.camera.up.set(0, 0, 1);
      this.camera.lookAt(lookTargetX, lookTargetY, lookTargetZ);
    }

    // Update dynamic motion speed streaks
    const currentSpeed = Math.hypot(targetVel.x, targetVel.y);
    this.updateSpeedLines(currentSpeed);

    // Render 3D Scene
    this.renderer.render(this.scene, this.camera);

    // Return target status info for UI updates
    return {
      targetId: this.targetBallId,
      found: targetBallFound,
      isEliminated: targetIsEliminated,
      stage: targetIsEliminated ? '탈락' : targetStage,
      velSpeed: Math.hypot(targetVel.x, targetVel.y).toFixed(1)
    };
  }

  destroy() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    if (this.renderer && this.renderer.domElement) {
      this.renderer.domElement.remove();
    }
  }
}
