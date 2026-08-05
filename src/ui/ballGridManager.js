export class BallGridManager {
  constructor(appState, handlers = {}) {
    this.appState = appState;
    this.handlers = handlers; // onSelectBallTarget

    this.ballGrid = null;
    this.ballDetailCard = null;
    this.searchInput = null;
  }

  init() {
    this.bindDomElements();
    this.bindEventListeners();
  }

  bindDomElements() {
    this.ballGrid = document.getElementById('ballGrid');
    this.ballDetailCard = document.getElementById('ballDetailCard');
    this.searchInput = document.getElementById('searchInput');
  }

  bindEventListeners() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        const targetBtn = e.target.closest('.tab-btn');
        targetBtn.classList.add('active');
        this.appState.setFilter(targetBtn.dataset.filter);
        this.renderBallGrid();
      });
    });

    if (this.searchInput) {
      this.searchInput.addEventListener('input', () => {
        this.renderBallGrid();
      });
    }
  }

  renderBallGrid() {
    if (!this.ballGrid || !this.appState.engine) return;

    const query = this.searchInput ? this.searchInput.value.trim().toLowerCase() : '';
    let html = '';
    const engine = this.appState.engine;
    const participants = this.appState.currentParticipants;
    const connectedClientBallIndices = this.appState.connectedClientBallIndices;
    const currentFilter = this.appState.currentFilter;
    const wireframeRenderer = this.appState.wireframeRenderer;

    for (let i = 0; i < 250; i++) {
      const p = participants[i];
      const num = p ? (p.ballNumber || p.number || p.id || (i + 1)) : (i + 1);
      const name = p ? p.name : `구슬 #${num}`;

      const ball = engine.balls ? engine.balls.find(b => b.number === num) : null;
      const finisher = engine.finishers ? engine.finishers.find(f => f.ball.number === num) : null;
      const isEliminated = (ball && (ball.stage === 'DRAIN' || ball.eliminated)) || (finisher && !finisher.isWinner);
      const isWinner = (ball && ball.isWinner) || (finisher && finisher.isWinner);

      let statusClass = 'status-active';
      let statusText = '진행 중';

      if (isWinner) {
        statusClass = 'status-win';
        statusText = '👑 1등 당첨!';
      } else if (isEliminated) {
        statusClass = 'status-drain';
        statusText = '💀 탈락 (DRAIN)';
      } else if (ball) {
        statusText = `${ball.stage}단계 주행 중`;
      }

      // Filter matching
      let passesFilter = true;
      if (currentFilter === 'active' && (isEliminated || isWinner)) passesFilter = false;
      if (currentFilter === 'drain' && !isEliminated) passesFilter = false;
      if (currentFilter === 'win' && !isWinner) passesFilter = false;

      // Search query matching
      let passesSearch = true;
      if (query) {
        const matchName = name.toLowerCase().includes(query);
        const matchNum = String(num).includes(query);
        if (!matchName && !matchNum) passesSearch = false;
      }

      if (passesFilter && passesSearch) {
        const isConnected = connectedClientBallIndices.has(i);
        const isTarget = (wireframeRenderer && wireframeRenderer.targetBallId === i);
        html += `
          <div class="ball-pill ${statusClass} ${isConnected ? 'is-connected-client' : ''} ${isTarget ? 'is-highlighted' : ''}" 
               data-ball-idx="${i}" 
               title="#${num} ${name}${isConnected ? ' (🌐 실시간 접속 중)' : ''} (${statusText})">
            ${num}
          </div>
        `;
      }
    }

    this.ballGrid.innerHTML = html;

    // Add click handlers for ball pills in grid
    this.ballGrid.querySelectorAll('.ball-pill').forEach(pill => {
      pill.addEventListener('click', (e) => {
        const idx = parseInt(e.currentTarget.dataset.ballIdx, 10);
        if (this.handlers.onSelectBallTarget) {
          this.handlers.onSelectBallTarget(idx);
        }
        this.updateBallDetailCard(idx);
      });
    });
  }

  updateBallDetailCard(ballIdx) {
    if (!this.ballDetailCard) return;

    const p = this.appState.currentParticipants[ballIdx];
    const num = p ? (p.ballNumber || p.number || p.id || (ballIdx + 1)) : (ballIdx + 1);
    const name = p ? p.name : `구슬 #${num}`;

    const engine = this.appState.engine;
    const ball = engine?.balls?.find(b => b.number === num);
    const finisher = engine?.finishers?.find(f => f.ball.number === num);
    const isEliminated = (ball && (ball.stage === 'DRAIN' || ball.eliminated)) || (finisher && !finisher.isWinner);
    const isWinner = (ball && ball.isWinner) || (finisher && finisher.isWinner);
    const isConnected = this.appState.connectedClientBallIndices.has(ballIdx);

    let statusStr = '주행 준비';
    if (isWinner) {
      statusStr = '👑 1등 당첨!';
    } else if (isEliminated) {
      statusStr = '💀 탈락 (DRAIN)';
    } else if (ball) {
      statusStr = `📍 ${ball.stage}단계 주행 중`;
    }

    this.ballDetailCard.innerHTML = `
      <div style="font-size:12.5px; font-weight:800; color:#fff;">
        🎯 구슬 #${num} <span style="color:var(--gold); margin-left:4px;">(${name})</span>
        ${isConnected ? '<span style="background:rgba(0,229,255,0.2); color:var(--cyan); padding:2px 8px; border-radius:100px; font-size:10px; margin-left:6px; border:1px solid rgba(0,229,255,0.4);">🌐 실시간 접속 중</span>' : ''}
        <span style="margin-left:8px; color:${isEliminated ? 'var(--red)' : isWinner ? 'var(--gold)' : 'var(--cyan)'}; font-weight:700;">${statusStr}</span>
      </div>
    `;
  }
}
