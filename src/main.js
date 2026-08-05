import { PachinkoEngine } from './physics/pachinkoEngine.js';
import { AppState } from './state/AppState.js';
import { HostWebSocketManager } from './net/hostWebSocket.js';
import { UIManager } from './ui/uiManager.js';
import { ModalManager } from './ui/modalManager.js';
import { ScoreboardManager } from './ui/scoreboardManager.js';
import { BallGridManager } from './ui/ballGridManager.js';
import { PipManager } from './ui/pipManager.js';

// Application State Container
const appState = new AppState();

// Managers
let hostWsManager;
let uiManager;
let modalManager;
let scoreboardManager;
let ballGridManager;
let pipManager;

function performResetAndReDraw() {
  if (!appState.engine) return;
  appState.engine.stopReplay();
  modalManager.resetWinnerDisplay();

  appState.engine.spawnBalls(appState.currentParticipants);
  appState.engine.isPaused = true;
  ballGridManager.renderBallGrid();
}

function init() {
  const canvas = document.getElementById('pachinkoCanvas');

  // 1. Initialize UI & Modal Managers
  scoreboardManager = new ScoreboardManager(appState);
  scoreboardManager.init();

  modalManager = new ModalManager(appState, {
    performResetAndReDraw
  });
  modalManager.init();

  ballGridManager = new BallGridManager(appState, {
    onSelectBallTarget: (idx) => pipManager.set3DPipTarget(idx)
  });
  ballGridManager.init();

  pipManager = new PipManager(appState, {
    onSelectTarget: (idx) => {
      ballGridManager.updateBallDetailCard(idx);
      ballGridManager.renderBallGrid();
    }
  });
  pipManager.init();

  uiManager = new UIManager(appState, {
    onReset: () => modalManager.resetWinnerDisplay(),
    onStartReplayReset: () => {
      if (modalManager.btnPanelReplay) {
        modalManager.btnPanelReplay.innerText = '🎬 1등 당첨 순간 리플레이 (Replay)';
      }
    },
    onFileUploadSuccess: () => {
      if (appState.engine) {
        appState.engine.spawnBalls(appState.currentParticipants);
        pipManager.populatePipBallSelect();
        hostWsManager.sendParticipantsToServer();
        modalManager.resetWinnerDisplay();
        ballGridManager.renderBallGrid();
      }
    },
    renderBallGrid: () => ballGridManager.renderBallGrid()
  });
  uiManager.init();

  // 2. Initialize Pachinko Engine
  if (canvas) {
    const initialDuration = uiManager.getInitialDuration();
    const engine = new PachinkoEngine(canvas, {
      width: 800,
      height: 1040,
      participants: appState.currentParticipants,
      targetDurationMinutes: initialDuration,
      onWinner: (ball, participant) => {
        modalManager.handleWinner(ball, participant);
        pipManager.set3DPipTarget(ball.number - 1);
      },
      onFinisher: (ball, rank, isWinner) => {
        scoreboardManager.handleFinisher(ball, rank, isWinner);
        ballGridManager.renderBallGrid();
      },
      onStageUpdate: (counts) => {
        scoreboardManager.handleStageUpdate(counts);
        ballGridManager.renderBallGrid();
      },
      onTimerUpdate: (elapsed, total) => {
        scoreboardManager.handleTimerUpdate(elapsed, total);
      }
    });

    appState.setEngine(engine);
    engine.spawnBalls(appState.currentParticipants);
  }

  // 3. Initialize Host WebSocket Connection
  hostWsManager = new HostWebSocketManager(appState, {
    onAck: (count) => {
      scoreboardManager.updateServerStatus(`🟢 서버 작동 중 (${count}명 접속)`);
      pipManager.populatePipBallSelect();
      ballGridManager.renderBallGrid();
    },
    onParticipantsUpdated: () => {
      pipManager.populatePipBallSelect();
      ballGridManager.renderBallGrid();
      const targetIdx = appState.wireframeRenderer ? appState.wireframeRenderer.targetBallId : 0;
      pipManager.updatePipTitle(targetIdx);
      ballGridManager.updateBallDetailCard(targetIdx);
    },
    onForceDisconnect: (reason) => {
      scoreboardManager.updateServerStatus('🔴 호스트 접속 종료됨 (다른 창에서 새로 접속)', '#ff2d6b');
      modalManager.showHostDisconnect(reason);
    },
    onClose: (isForce) => {
      if (isForce) {
        scoreboardManager.updateServerStatus('🔴 호스트 접속 종료됨', '#ff2d6b');
      } else {
        scoreboardManager.updateServerStatus('🔴 서버 재연결 중...');
      }
    }
  });

  hostWsManager.init();
  ballGridManager.renderBallGrid();

  appState.lastTime = performance.now();
  requestAnimationFrame(loop);
}

/**
 * Main render/update loop
 */
function loop(time) {
  try {
    const dt = time - appState.lastTime;
    appState.lastTime = time;

    if (appState.engine) {
      appState.engine.update(dt);
      if (hostWsManager) {
        hostWsManager.sendBinaryTick(time);
      }

      if (appState.wireframeRenderer) {
        const hudInfo = appState.wireframeRenderer.renderFrame(appState.engine);
        if (hudInfo && pipManager) {
          pipManager.updateHud(hudInfo);
        }
      }
    }
  } catch (err) {
    console.error('Error in animation loop:', err);
  } finally {
    requestAnimationFrame(loop);
  }
}

// Start application after DOM is ready
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
