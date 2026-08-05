import { Wireframe3DRenderer } from '../physics/wireframe3d.js';

export class PipManager {
  constructor(appState, handlers = {}) {
    this.appState = appState;
    this.handlers = handlers; // onSelectTarget

    this.pipBallSelect = null;
    this.pipTargetTitle = null;
    this.pipTargetName = null;
    this.pipTargetStage = null;
    this.pipTargetSpeed = null;
    this.wireframePip = null;
    this.btnPipMin = null;
    this.btnPipExpand = null;
  }

  init() {
    const container = document.getElementById('wireframe3dContainer');
    if (!container) return;

    const renderer = new Wireframe3DRenderer(container);
    this.appState.setWireframeRenderer(renderer);

    this.bindDomElements();
    this.populatePipBallSelect();
    this.bindEventListeners();
    this.initDraggable();
  }

  bindDomElements() {
    this.pipBallSelect = document.getElementById('pipBallSelect');
    this.pipTargetTitle = document.getElementById('pipTargetTitle');
    this.pipTargetName = document.getElementById('pipTargetName');
    this.pipTargetStage = document.getElementById('pipTargetStage');
    this.pipTargetSpeed = document.getElementById('pipTargetSpeed');
    this.wireframePip = document.getElementById('wireframePip');
    this.btnPipMin = document.getElementById('btnPipMin');
    this.btnPipExpand = document.getElementById('btnPipExpand');
  }

  bindEventListeners() {
    if (this.pipBallSelect) {
      this.pipBallSelect.addEventListener('change', (e) => {
        const ballIdx = parseInt(e.target.value, 10);
        this.set3DPipTarget(ballIdx);
      });
    }

    document.querySelectorAll('.cam-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.cam-btn').forEach(b => b.classList.remove('active'));
        const targetBtn = e.target.closest('.cam-btn');
        targetBtn.classList.add('active');
        const mode = targetBtn.dataset.mode;
        if (this.appState.wireframeRenderer) {
          this.appState.wireframeRenderer.setCameraMode(mode);
        }
      });
    });

    if (this.btnPipMin && this.wireframePip) {
      this.btnPipMin.addEventListener('click', () => {
        this.wireframePip.classList.toggle('minimized');
        this.btnPipMin.innerText = this.wireframePip.classList.contains('minimized') ? '➕' : '➖';
      });
    }

    if (this.btnPipExpand && this.wireframePip) {
      this.btnPipExpand.addEventListener('click', () => {
        this.wireframePip.classList.toggle('expanded');
        this.btnPipExpand.innerText = this.wireframePip.classList.contains('expanded') ? '↙️' : '🔲';
        setTimeout(() => this.appState.wireframeRenderer && this.appState.wireframeRenderer.onResize(), 320);
      });
    }
  }

  populatePipBallSelect() {
    if (!this.pipBallSelect) return;

    const currentVal = this.pipBallSelect.value;
    let options = '';
    const participants = this.appState.currentParticipants;
    const connectedIndices = this.appState.connectedClientBallIndices;

    participants.forEach((p, i) => {
      const num = p.ballNumber || p.number || p.id || (i + 1);
      const name = p.name || `구슬 #${num}`;
      const isConn = connectedIndices.has(i) ? ' [🌐접속]' : '';
      options += `<option value="${i}">#${num} ${name}${isConn}</option>`;
    });

    this.pipBallSelect.innerHTML = options;
    if (currentVal !== '') this.pipBallSelect.value = currentVal;
    this.updatePipTitle(this.pipBallSelect.value ? parseInt(this.pipBallSelect.value, 10) : 0);
  }

  updatePipTitle(ballIdx) {
    const p = this.appState.currentParticipants[ballIdx];
    const num = p ? (p.ballNumber || p.number || p.id || (ballIdx + 1)) : (ballIdx + 1);
    const name = p ? p.name : `구슬 #${num}`;

    if (this.pipTargetTitle) this.pipTargetTitle.innerText = `🥽 구슬 #${num} (${name}) 1인칭`;
    if (this.pipTargetName) this.pipTargetName.innerText = `#${num} (${name})`;
  }

  set3DPipTarget(ballIdx) {
    if (this.appState.wireframeRenderer) {
      this.appState.wireframeRenderer.setTargetBall(ballIdx);
      if (this.pipBallSelect) this.pipBallSelect.value = ballIdx;
      this.updatePipTitle(ballIdx);
      if (this.handlers.onSelectTarget) {
        this.handlers.onSelectTarget(ballIdx);
      }
    }
  }

  updateHud(hudInfo) {
    if (!hudInfo) return;

    if (hudInfo.isEliminated && !this.appState.engine?.isFinished) {
      const activeBalls = this.appState.engine.balls.filter(b => b && b.stage !== 'DRAIN' && b.stage !== 'WIN');
      if (activeBalls.length > 0) {
        const nextBall = activeBalls[Math.floor(Math.random() * activeBalls.length)];
        const nextIdx = (nextBall.number || nextBall.id || 1) - 1;
        if (nextIdx >= 0 && nextIdx < 250) {
          this.set3DPipTarget(nextIdx);
        }
      }
    }

    if (this.pipTargetStage) {
      this.pipTargetStage.innerText = typeof hudInfo.stage === 'number' ? `${hudInfo.stage}단계` : hudInfo.stage;
    }
    if (this.pipTargetSpeed) {
      this.pipTargetSpeed.innerText = `${hudInfo.velSpeed} px/s`;
    }
  }

  initDraggable() {
    const pipHeader = this.wireframePip ? this.wireframePip.querySelector('.pip-header') : null;
    if (!pipHeader || !this.wireframePip) return;

    const wireframePip = this.wireframePip;
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let initialLeft = 0;
    let initialTop = 0;

    const onDragStart = (e) => {
      if (e.target.closest('.pip-btn')) return;

      isDragging = true;
      wireframePip.classList.add('is-dragging');

      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;

      const rect = wireframePip.getBoundingClientRect();
      startX = clientX;
      startY = clientY;
      initialLeft = rect.left;
      initialTop = rect.top;

      wireframePip.style.right = 'auto';
      wireframePip.style.bottom = 'auto';
      wireframePip.style.left = `${initialLeft}px`;
      wireframePip.style.top = `${initialTop}px`;
      wireframePip.style.transition = 'none';

      if (e.cancelable) e.preventDefault();
    };

    const onDragMove = (e) => {
      if (!isDragging) return;

      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;

      const deltaX = clientX - startX;
      const deltaY = clientY - startY;

      let newLeft = initialLeft + deltaX;
      let newTop = initialTop + deltaY;

      const maxLeft = window.innerWidth - wireframePip.offsetWidth;
      const maxTop = window.innerHeight - wireframePip.offsetHeight;

      newLeft = Math.max(0, Math.min(newLeft, maxLeft));
      newTop = Math.max(0, Math.min(newTop, maxTop));

      wireframePip.style.left = `${newLeft}px`;
      wireframePip.style.top = `${newTop}px`;
    };

    const onDragEnd = () => {
      if (!isDragging) return;
      isDragging = false;
      wireframePip.classList.remove('is-dragging');
      wireframePip.style.transition = '';
    };

    pipHeader.addEventListener('mousedown', onDragStart);
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', onDragEnd);

    pipHeader.addEventListener('touchstart', onDragStart, { passive: false });
    document.addEventListener('touchmove', onDragMove, { passive: false });
    document.addEventListener('touchend', onDragEnd);
  }
}
