import confetti from 'canvas-confetti';

export class ModalManager {
  constructor(appState, handlers = {}) {
    this.appState = appState;
    this.handlers = handlers; // performResetAndReDraw

    this.winnerModal = null;
    this.modalWinnerName = null;
    this.modalWinnerBall = null;
    this.btnCloseModal = null;
    this.btnModalReplay = null;
    this.btnPanelReplay = null;
    this.btnModalReDraw = null;
    this.btnPanelReDraw = null;
    this.winnerNameDisplay = null;
    this.winnerBallNumDisplay = null;
    this.topWinnerName = null;
    this.winnerActionGroup = null;

    this.hostDisconnectModal = null;
    this.hostDisconnectReason = null;
    this.btnReconnectHost = null;
  }

  init() {
    this.bindDomElements();
    this.bindEventListeners();
  }

  bindDomElements() {
    this.winnerModal = document.getElementById('winnerModal');
    this.modalWinnerName = document.getElementById('modalWinnerName');
    this.modalWinnerBall = document.getElementById('modalWinnerBall');
    this.btnCloseModal = document.getElementById('btnCloseModal');

    this.btnModalReplay = document.getElementById('btnModalReplay');
    this.btnPanelReplay = document.getElementById('btnPanelReplay');
    this.btnModalReDraw = document.getElementById('btnModalReDraw');
    this.btnPanelReDraw = document.getElementById('btnPanelReDraw');

    this.winnerNameDisplay = document.getElementById('winnerNameDisplay');
    this.winnerBallNumDisplay = document.getElementById('winnerBallNumDisplay');
    this.topWinnerName = document.getElementById('topWinnerName');
    this.winnerActionGroup = document.getElementById('winnerActionGroup');

    this.hostDisconnectModal = document.getElementById('hostDisconnectModal');
    this.hostDisconnectReason = document.getElementById('hostDisconnectReason');
    this.btnReconnectHost = document.getElementById('btnReconnectHost');
  }

  bindEventListeners() {
    if (this.btnCloseModal && this.winnerModal) {
      this.btnCloseModal.addEventListener('click', () => {
        this.winnerModal.classList.remove('active');
      });
    }

    if (this.btnModalReplay) {
      this.btnModalReplay.addEventListener('click', () => {
        if (this.winnerModal) this.winnerModal.classList.remove('active');
        if (this.appState.engine) this.appState.engine.startReplay();
      });
    }

    if (this.btnPanelReplay) {
      this.btnPanelReplay.addEventListener('click', () => {
        if (this.appState.engine) {
          const isReplaying = this.appState.engine.toggleReplay();
          this.btnPanelReplay.innerText = isReplaying
            ? '⏹ 리플레이 종료 (Exit Replay)'
            : '🎬 1등 당첨 순간 리플레이 (Replay)';
        }
      });
    }

    if (this.btnModalReDraw) {
      this.btnModalReDraw.addEventListener('click', () => {
        if (this.handlers.performResetAndReDraw) this.handlers.performResetAndReDraw();
      });
    }

    if (this.btnPanelReDraw) {
      this.btnPanelReDraw.addEventListener('click', () => {
        if (this.handlers.performResetAndReDraw) this.handlers.performResetAndReDraw();
      });
    }

    if (this.btnReconnectHost) {
      this.btnReconnectHost.addEventListener('click', () => {
        location.reload();
      });
    }
  }

  handleWinner(ball, participant) {
    const winnerName = participant ? participant.name : `구슬 #${ball.number}`;

    if (this.topWinnerName) this.topWinnerName.innerText = winnerName;
    if (this.winnerNameDisplay) this.winnerNameDisplay.innerText = winnerName;
    if (this.winnerBallNumDisplay) this.winnerBallNumDisplay.innerText = `구슬 번호: #${ball.number}`;

    if (this.modalWinnerName) this.modalWinnerName.innerText = winnerName;
    if (this.modalWinnerBall) this.modalWinnerBall.innerText = `★ #${ball.number}번 구슬 ★`;
    if (this.winnerModal) this.winnerModal.classList.add('active');

    if (this.winnerActionGroup) this.winnerActionGroup.style.display = 'block';

    confetti({
      particleCount: 150,
      spread: 100,
      origin: { y: 0.6 }
    });
  }

  resetWinnerDisplay() {
    if (this.winnerModal) this.winnerModal.classList.remove('active');
    if (this.winnerActionGroup) this.winnerActionGroup.style.display = 'none';

    if (this.btnPanelReplay) {
      this.btnPanelReplay.innerText = '🎬 1등 당첨 순간 리플레이 (Replay)';
    }

    if (this.topWinnerName) this.topWinnerName.innerText = '대기 중...';
    if (this.winnerNameDisplay) this.winnerNameDisplay.innerText = '대기 중...';
    if (this.winnerBallNumDisplay) this.winnerBallNumDisplay.innerText = '구슬 번호: -';
  }

  showHostDisconnect(reason) {
    if (this.hostDisconnectReason && reason) {
      this.hostDisconnectReason.innerText = reason;
    }
    if (this.hostDisconnectModal) {
      this.hostDisconnectModal.classList.add('active');
    }
  }
}
