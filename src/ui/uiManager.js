import { audioSynth } from '../utils/audioSynth.js';
import { parseExcelFile, downloadSampleExcel } from '../utils/excelParser.js';

export class UIManager {
  constructor(appState, handlers = {}) {
    this.appState = appState;
    this.handlers = handlers; // onResetAndReDraw, onFileUploadSuccess, renderBallGrid, etc.

    this.btnStart = null;
    this.btnPause = null;
    this.btnReset = null;
    this.btnShake = null;
    this.btnSampleExcel = null;
    this.excelInput = null;
    this.dropZone = null;
    this.fileStatus = null;
    this.durationSelect = null;
    this.toggleAudio = null;
  }

  bindDomElements() {
    this.btnStart = document.getElementById('btnStart');
    this.btnPause = document.getElementById('btnPause');
    this.btnReset = document.getElementById('btnReset');
    this.btnShake = document.getElementById('btnShake');
    this.btnSampleExcel = document.getElementById('btnSampleExcel');
    this.excelInput = document.getElementById('excelInput');
    this.dropZone = document.getElementById('dropZone');
    this.fileStatus = document.getElementById('fileStatus');
    this.durationSelect = document.getElementById('durationSelect');
    this.toggleAudio = document.getElementById('toggleAudio');
  }

  getInitialDuration() {
    return this.durationSelect ? (parseFloat(this.durationSelect.value) || 1) : 1;
  }

  init() {
    this.bindDomElements();
    this.bindEventListeners();
  }

  bindEventListeners() {
    if (this.durationSelect) {
      this.durationSelect.addEventListener('change', (e) => {
        const mins = parseFloat(e.target.value) || 1;
        if (this.appState.engine) {
          this.appState.engine.setTargetDurationMinutes(mins);
          this.appState.engine.spawnBalls(this.appState.currentParticipants);
        }
      });
    }

    if (this.btnStart) {
      this.btnStart.addEventListener('click', () => {
        if (this.appState.engine) {
          this.appState.engine.stopReplay();
          this.appState.engine.isPaused = false;
          if (this.handlers.onStartReplayReset) {
            this.handlers.onStartReplayReset();
          }
        }
      });
    }

    if (this.btnPause) {
      this.btnPause.addEventListener('click', () => {
        if (this.appState.engine) this.appState.engine.isPaused = true;
      });
    }

    if (this.btnReset) {
      this.btnReset.addEventListener('click', () => {
        if (this.appState.engine) {
          if (this.handlers.onReset) {
            this.handlers.onReset();
          }
          this.appState.engine.spawnBalls(this.appState.currentParticipants);
          if (this.handlers.renderBallGrid) {
            this.handlers.renderBallGrid();
          }
        }
      });
    }

    if (this.btnShake) {
      this.btnShake.addEventListener('click', () => {
        if (this.appState.engine) this.appState.engine.shakeMachine();
      });
    }

    document.querySelectorAll('.speed-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        const speed = parseInt(e.target.dataset.speed, 10);
        if (this.appState.engine) this.appState.engine.setSpeed(speed);
      });
    });

    if (this.toggleAudio) {
      this.toggleAudio.addEventListener('change', (e) => {
        audioSynth.enabled = e.target.checked;
      });
    }

    if (this.dropZone && this.excelInput) {
      this.dropZone.addEventListener('click', () => this.excelInput.click());

      this.dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        this.dropZone.style.borderColor = '#00f0ff';
      });
      this.dropZone.addEventListener('dragleave', () => {
        this.dropZone.style.borderColor = 'rgba(0, 240, 255, 0.3)';
      });
      this.dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        this.dropZone.style.borderColor = 'rgba(0, 240, 255, 0.3)';
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
          this.handleFileUpload(e.dataTransfer.files[0]);
        }
      });

      this.excelInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          this.handleFileUpload(e.target.files[0]);
        }
      });
    }

    if (this.btnSampleExcel) {
      this.btnSampleExcel.addEventListener('click', () => {
        downloadSampleExcel(250);
      });
    }
  }

  async handleFileUpload(file) {
    try {
      if (this.fileStatus) this.fileStatus.innerText = '엑셀 파싱 중...';
      const participants = await parseExcelFile(file, 250);
      this.appState.setParticipants(participants);
      if (this.fileStatus) this.fileStatus.innerText = `✅ ${file.name} (${participants.length}명 매칭)`;

      if (this.handlers.onFileUploadSuccess) {
        this.handlers.onFileUploadSuccess(participants);
      }
    } catch (err) {
      alert(`엑셀 파일 읽기 오류: ${err.message}`);
      if (this.fileStatus) this.fileStatus.innerText = '250명 번호 랜덤 매칭';
    }
  }
}
