import Matter from 'matter-js';
import { Wireframe3DRenderer } from './physics/wireframe3d.js';
import { STAGES, DRAIN_ZONES, WORLD_CONFIG } from './config/stageConfig.js';

let wireframeRenderer = null;
let ws = null;
let assignedBallIdx = 0;
let currentTargetIdx = 0;
let participantsList = [];
let isForceDisconnected = false;

let lastTime = performance.now();

// DOM Elements
const container = document.getElementById('client3dContainer');
const assignedBadge = document.getElementById('assignedBadge');
const hudTargetName = document.getElementById('hudTargetName');
const hudTargetStage = document.getElementById('hudTargetStage');
const hudTargetSpeed = document.getElementById('hudTargetSpeed');
const hudConnectionStatus = document.getElementById('hudConnectionStatus');
const clientBallSelect = document.getElementById('clientBallSelect');

// Pure JS Terrain Generator (Zero external dependencies = 100% reliable load!)
function createRectTerrain(x, y, w, h, angle = 0, isGate = false) {
  const hw = w / 2;
  const hh = h / 2;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  const localVerts = [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh }
  ];

  const worldVerts = localVerts.map(v => ({
    x: x + (v.x * cos - v.y * sin),
    y: y + (v.x * sin + v.y * cos)
  }));

  return {
    initialX: x,
    initialY: y,
    w, h, angle, isGate,
    body: {
      position: { x, y },
      angle,
      vertices: worldVerts
    }
  };
}

const gateObjects = [];

function buildClientTerrains() {
  const terrains = [];
  gateObjects.length = 0;

  // Build stage funnels & gates from STAGES data
  STAGES.forEach(stageData => {
    if (stageData.funnel && stageData.gate) {
      const fL = stageData.funnel.left;
      const fR = stageData.funnel.right;
      terrains.push(createRectTerrain(fL.x, fL.y, fL.width, fL.height, fL.angle));
      terrains.push(createRectTerrain(fR.x, fR.y, fR.width, fR.height, fR.angle));

      const gL = stageData.gate.left;
      const gR = stageData.gate.right;
      const gateL = createRectTerrain(gL.x, gL.y, gL.width, gL.height, 0, true);
      const gateR = createRectTerrain(gR.x, gR.y, gR.width, gR.height, 0, true);
      terrains.push(gateL, gateR);

      gateObjects.push(
        { stage: stageData.stage, isLeft: true, terrain: gateL },
        { stage: stageData.stage, isLeft: false, terrain: gateR }
      );
    }
  });

  return terrains;
}

function buildStage1Pins() {
  const pins = [];
  const config = STAGES[0].pinRows;
  for (let r = 0; r < config.rows; r++) {
    const pinsInRow = (r % 2 === 0) ? config.evenPins : config.oddPins;
    const spacingX = (WORLD_CONFIG.width - config.margin * 2) / pinsInRow;
    const offsetX = (r % 2 === 0) ? config.margin + spacingX / 2 : config.margin;
    const py = config.startY + r * config.rowSpacing;
    for (let c = 0; c < pinsInRow; c++) {
      pins.push({ x: offsetX + c * spacingX, y: py });
    }
  }
  return pins;
}

function buildStage3Pins() {
  const pins = [];
  const config = STAGES[2].pinRows;
  for (let r = 0; r < config.rows; r++) {
    const pCount = (r % 2 === 0) ? config.evenPins : config.oddPins;
    const spacingX = config.width / pCount;
    const offsetX = (config.centerX - config.width / 2) + (r % 2 === 0 ? spacingX / 2 : 0);
    const py = config.startY + r * config.rowSpacing;
    for (let c = 0; c < pCount; c++) {
      pins.push({ x: offsetX + c * spacingX, y: py });
    }
  }
  return pins;
}

function buildStagePins(count, dist) {
  const pins = [];
  for (let i = 0; i < count; i++) {
    pins.push({ angleOffset: (i * Math.PI * 2) / count, dist });
  }
  return pins;
}

function buildMockDrains() {
  return DRAIN_ZONES.map(d => ({
    body: { position: { x: d.x, y: d.y } },
    radius: d.radius
  }));
}

const mockTerrainEngine = {
  width: WORLD_CONFIG.width,
  height: WORLD_CONFIG.height,
  stage1Pins: buildStage1Pins(),
  stage2Center: STAGES[1].center,
  stage2Pins: buildStagePins(STAGES[1].pins.count, STAGES[1].pins.distance),
  stage3Pins: buildStage3Pins(),
  stage4Center: STAGES[3].center,
  stage4Pins: buildStagePins(STAGES[3].pins.count, STAGES[3].pins.distance),
  stage5Center: STAGES[4].center,
  stage2Angle: 0,
  stage4Angle: 0,
  stage5Angle: 0,
  terrains: buildClientTerrains(),
  drainZones: buildMockDrains(),
  balls: []
};

// Gyro & Touch Drag Camera Steering (Always Active Automatically!)
let isDragging = false;
let startTouchPos = { x: 0, y: 0 };
let currentDragOffset = { x: 0, y: 0 };

function initCameraControls() {
  const viewport = document.querySelector('.client-viewport');

  // 1. Touch Drag & Mouse Drag Steering (Always active automatically!)
  if (viewport) {
    const onStart = (clientX, clientY) => {
      isDragging = true;
      startTouchPos = { x: clientX - currentDragOffset.x, y: clientY - currentDragOffset.y };
    };

    const onMove = (clientX, clientY) => {
      if (!isDragging || !wireframeRenderer) return;
      currentDragOffset.x = clientX - startTouchPos.x;
      currentDragOffset.y = clientY - startTouchPos.y;

      const beta = (-currentDragOffset.y * 0.2);
      const gamma = (currentDragOffset.x * 0.2);
      wireframeRenderer.setGyroOffset(beta, gamma);
    };

    const onEnd = () => {
      isDragging = false;
    };

    viewport.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        onStart(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: true });

    viewport.addEventListener('touchmove', (e) => {
      if (e.touches.length === 1) {
        onMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: true });

    viewport.addEventListener('touchend', onEnd);

    viewport.addEventListener('mousedown', (e) => onStart(e.clientX, e.clientY));
    window.addEventListener('mousemove', (e) => onMove(e.clientX, e.clientY));
    window.addEventListener('mouseup', onEnd);
  }

  // 2. DeviceOrientation Sensor Integration (Always active automatically if supported)
  const handleOrientation = (e) => {
    if (!wireframeRenderer || isDragging) return;
    if (e.beta !== null && e.gamma !== null) {
      wireframeRenderer.setGyroOffset(e.beta, e.gamma);
    }
  };

  if ('DeviceOrientationEvent' in window) {
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      const requestIOSPermission = async () => {
        try {
          const perm = await DeviceOrientationEvent.requestPermission();
          if (perm === 'granted') {
            window.addEventListener('deviceorientation', handleOrientation);
          }
        } catch (err) {}
      };
      window.addEventListener('touchstart', requestIOSPermission, { once: true });
      window.addEventListener('click', requestIOSPermission, { once: true });
    } else {
      window.addEventListener('deviceorientation', handleOrientation);
    }
  }
}

function initNameModal() {
  const modal = document.getElementById('clientNameModal');
  const input = document.getElementById('clientNameInput');
  const btnSubmit = document.getElementById('btnSubmitName');
  const assignedBadge = document.getElementById('assignedBadge');

  const savedName = localStorage.getItem('pachinko_user_name');
  if (savedName && input) {
    input.value = savedName;
  }

  const submitName = () => {
    const val = input ? input.value.trim() : '';
    if (!val) {
      alert('이름을 입력해주세요!');
      return;
    }

    localStorage.setItem('pachinko_user_name', val);
    if (modal) modal.classList.remove('active');

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'SET_CLIENT_NAME', name: val }));
    }
  };

  if (btnSubmit) btnSubmit.addEventListener('click', submitName);
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submitName();
    });
  }

  if (assignedBadge) {
    assignedBadge.addEventListener('click', () => {
      if (modal) {
        if (input) input.value = localStorage.getItem('pachinko_user_name') || '';
        modal.classList.add('active');
        if (input) input.focus();
      }
    });
  }

  const btnReconnectClient = document.getElementById('btnReconnectClient');
  if (btnReconnectClient) {
    btnReconnectClient.addEventListener('click', () => {
      location.reload();
    });
  }
}

function initClient() {
  if (container) {
    wireframeRenderer = new Wireframe3DRenderer(container, { isClientView: true });
    wireframeRenderer.setCameraMode('cockpit'); // Strictly Cockpit 1st-Person FPV View
  }

  initCameraControls();
  initNameModal();

  // Select Ball Dropdown
  if (clientBallSelect) {
    clientBallSelect.addEventListener('change', (e) => {
      const idx = parseInt(e.target.value, 10);
      currentTargetIdx = idx;
      if (wireframeRenderer) wireframeRenderer.setTargetBall(idx);

      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'SELECT_BALL', ballIdx: idx }));
      }
      updateHudTargetText();
    });
  }

  connectWebSocket();

  lastTime = performance.now();
  requestAnimationFrame(loop);
}

async function getWebSocketUrl() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';

  // 1. If running under Vite Dev Server (port 5173), target Node.js server port 3000
  if (location.port === '5173') {
    try {
      const res = await fetch('/api/ip');
      const data = await res.json();
      return `${protocol}//${location.hostname}:${data.port || 3000}`;
    } catch (err) {
      return `${protocol}//${location.hostname}:3000`;
    }
  }

  // 2. For custom domain names, reverse proxies, and standard ports, use location.host directly!
  return `${protocol}//${location.host}`;
}

async function connectWebSocket() {
  const wsUrl = await getWebSocketUrl();

  ws = new WebSocket(wsUrl);
  ws.binaryType = 'arraybuffer';

  ws.onopen = () => {
    if (hudConnectionStatus) {
      hudConnectionStatus.innerText = '🟢 실시간 연결됨';
      hudConnectionStatus.style.color = '#22c55e';
    }

    ws.send(JSON.stringify({ type: 'REGISTER_CLIENT' }));

    const savedName = localStorage.getItem('pachinko_user_name');
    if (savedName) {
      ws.send(JSON.stringify({ type: 'SET_CLIENT_NAME', name: savedName }));
    }
  };

  ws.onmessage = (e) => {
    if (e.data instanceof ArrayBuffer) {
      unpackBinaryTick(e.data);
    } else {
      try {
        const msg = JSON.parse(e.data);

        if (msg.type === 'ASSIGNED_BALL') {
          assignedBallIdx = msg.ballIdx;
          currentTargetIdx = msg.ballIdx;

          if (msg.participants) {
            participantsList = msg.participants;
            populateBallSelect();
          }

          if (wireframeRenderer) wireframeRenderer.setTargetBall(assignedBallIdx);

          const savedName = localStorage.getItem('pachinko_user_name');
          if (savedName) {
            ws.send(JSON.stringify({ type: 'SET_CLIENT_NAME', name: savedName }));
          }

          updateHudTargetText();
        }

        else if (msg.type === 'PARTICIPANTS_UPDATED') {
          participantsList = msg.participants || [];
          populateBallSelect();
          updateHudTargetText();
        }

        else if (msg.type === 'FORCE_DISCONNECT') {
          isForceDisconnected = true;
          if (hudConnectionStatus) {
            hudConnectionStatus.innerText = '🔴 접속 종료됨 (다른 곳에서 새로 접속)';
            hudConnectionStatus.style.color = '#ff2d6b';
          }
          const disconnectModal = document.getElementById('clientDisconnectModal');
          const disconnectReason = document.getElementById('disconnectReason');
          if (disconnectReason && msg.reason) {
            disconnectReason.innerText = msg.reason;
          }
          if (disconnectModal) {
            disconnectModal.classList.add('active');
          }
          if (ws) {
            try { ws.close(); } catch (err) {}
          }
        }
      } catch (err) {
        console.error('Client JSON parse error:', err);
      }
    }
  };

  ws.onclose = () => {
    if (isForceDisconnected) {
      if (hudConnectionStatus) {
        hudConnectionStatus.innerText = '🔴 접속 종료됨 (다른 곳에서 새로 접속)';
        hudConnectionStatus.style.color = '#ff2d6b';
      }
      return;
    }
    if (hudConnectionStatus) {
      hudConnectionStatus.innerText = '🔴 연결 해제됨 (재연결 시도)';
      hudConnectionStatus.style.color = '#ef4444';
    }
    setTimeout(connectWebSocket, 2000);
  };
}

function unpackBinaryTick(buffer) {
  const view = new DataView(buffer);
  let offset = 0;

  if (buffer.byteLength < 16) return;

  mockTerrainEngine.stage2Angle = view.getFloat32(offset, true); offset += 4;
  mockTerrainEngine.stage4Angle = view.getFloat32(offset, true); offset += 4;
  mockTerrainEngine.stage5Angle = view.getFloat32(offset, true); offset += 4;
  const gateMask = view.getUint16(offset, true); offset += 2;
  const count = view.getUint16(offset, true); offset += 2;

  // Update yellow gates (Stage 1..4) open/close state
  gateObjects.forEach(g => {
    const isOpen = !!(gateMask & (1 << g.stage));
    const targetX = g.isLeft
      ? (isOpen ? g.terrain.initialX - 45 : g.terrain.initialX)
      : (isOpen ? g.terrain.initialX + 45 : g.terrain.initialX);

    g.terrain.body.position.x = targetX;
  });

  const balls = [];
  for (let i = 0; i < count; i++) {
    if (offset + 14 > buffer.byteLength) break;
    const num = view.getUint16(offset, true); offset += 2;
    const x = view.getFloat32(offset, true); offset += 4;
    const y = view.getFloat32(offset, true); offset += 4;
    const vx = view.getInt16(offset, true) / 10.0; offset += 2;
    const vy = view.getInt16(offset, true) / 10.0; offset += 2;

    balls.push({
      number: num,
      id: num,
      x, y, vx, vy,
      stage: y > 800 ? 5 : y > 600 ? 4 : y > 400 ? 3 : y > 200 ? 2 : 1
    });
  }

  mockTerrainEngine.balls = balls;
}

function populateBallSelect() {
  if (!clientBallSelect) return;
  let html = '';
  for (let i = 0; i < 250; i++) {
    const p = participantsList[i];
    const num = p ? (p.ballNumber || p.number || p.id || (i + 1)) : (i + 1);
    const name = p ? p.name : `구슬 #${num}`;
    const isMine = (i === assignedBallIdx) ? ' (★ 내 구슬)' : '';
    html += `<option value="${i}" ${i === currentTargetIdx ? 'selected' : ''}>#${num} ${name}${isMine}</option>`;
  }
  clientBallSelect.innerHTML = html;
}

function updateHudTargetText() {
  const p = participantsList[currentTargetIdx];
  const num = p ? (p.ballNumber || p.number || p.id || (currentTargetIdx + 1)) : (currentTargetIdx + 1);
  const name = p ? p.name : `구슬 #${num}`;
  const isMine = (currentTargetIdx === assignedBallIdx);

  if (assignedBadge) {
    const myP = participantsList[assignedBallIdx];
    const myNum = myP ? (myP.ballNumber || myP.number || myP.id || (assignedBallIdx + 1)) : (assignedBallIdx + 1);
    const myName = myP ? myP.name : `구슬 #${myNum}`;
    assignedBadge.innerText = `★ 내 구슬: #${myNum} (${myName})`;
  }

  if (hudTargetName) {
    hudTargetName.innerText = `#${num} ${name}${isMine ? ' (내 구슬)' : ''}`;
  }
}

function loop(time) {
  const dt = time - lastTime;
  lastTime = time;

  if (wireframeRenderer) {
    const hudInfo = wireframeRenderer.renderFrame(mockTerrainEngine);
    if (hudInfo) {
      if (hudTargetStage) {
        hudTargetStage.innerText = typeof hudInfo.stage === 'number' ? `${hudInfo.stage}단계` : hudInfo.stage;
      }
      if (hudTargetSpeed) {
        hudTargetSpeed.innerText = `${hudInfo.velSpeed} px/s`;
      }
    }
  }

  requestAnimationFrame(loop);
}

window.addEventListener('DOMContentLoaded', initClient);
