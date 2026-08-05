import { audioSynth } from '../utils/audioSynth.js';

export class ScoreboardManager {
  constructor(appState) {
    this.appState = appState;

    this.topTotalCount = null;
    this.topTimerDisplay = null;
    this.topServerStatus = null;

    this.cntS1 = null;
    this.cntS2 = null;
    this.cntS3 = null;
    this.cntS4 = null;
    this.cntS5 = null;

    this.cntAll = null;
    this.cntActiveSummary = null;
    this.cntDrainSummary = null;
    this.cntWinSummary = null;

    this.finisherList = null;
    this.finishCount = null;
  }

  init() {
    this.bindDomElements();
  }

  bindDomElements() {
    this.topTotalCount = document.getElementById('topTotalCount');
    this.topTimerDisplay = document.getElementById('topTimerDisplay');
    this.topServerStatus = document.getElementById('topServerStatus');

    this.cntS1 = document.getElementById('cntS1');
    this.cntS2 = document.getElementById('cntS2');
    this.cntS3 = document.getElementById('cntS3');
    this.cntS4 = document.getElementById('cntS4');
    this.cntS5 = document.getElementById('cntS5');

    this.cntAll = document.getElementById('cntAll');
    this.cntActiveSummary = document.getElementById('cntActiveSummary');
    this.cntDrainSummary = document.getElementById('cntDrainSummary');
    this.cntWinSummary = document.getElementById('cntWinSummary');

    this.finisherList = document.getElementById('finisherList');
    this.finishCount = document.getElementById('finishCount');
  }

  formatMMSS(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  handleTimerUpdate(elapsedSeconds, totalSeconds) {
    if (this.topTimerDisplay) {
      this.topTimerDisplay.innerText = `${this.formatMMSS(elapsedSeconds)} / ${this.formatMMSS(totalSeconds)}`;
    }
  }

  handleStageUpdate(counts) {
    if (!counts) return;

    const s1 = counts.s1 ?? counts.stage1 ?? 0;
    const s2 = counts.s2 ?? counts.stage2 ?? 0;
    const s3 = counts.s3 ?? counts.stage3 ?? 0;
    const s4 = counts.s4 ?? counts.stage4 ?? 0;
    const s5 = counts.s5 ?? counts.stage5 ?? 0;

    if (this.cntS1) this.cntS1.innerText = s1;
    if (this.cntS2) this.cntS2.innerText = s2;
    if (this.cntS3) this.cntS3.innerText = s3;
    if (this.cntS4) this.cntS4.innerText = s4;
    if (this.cntS5) this.cntS5.innerText = s5;

    const activeCount = counts.active ?? (s1 + s2 + s3 + s4 + s5);
    const drainCount = counts.drain ?? counts.eliminated?.length ?? 0;
    const winCount = counts.win ?? (counts.finishers ? counts.finishers.filter(f => f.isWinner).length : 0);
    const totalCount = activeCount + drainCount + winCount;

    if (this.cntAll) this.cntAll.innerText = totalCount;
    if (this.cntActiveSummary) this.cntActiveSummary.innerText = activeCount;
    if (this.cntDrainSummary) this.cntDrainSummary.innerText = drainCount;
    if (this.cntWinSummary) this.cntWinSummary.innerText = winCount;

    if (this.topTotalCount) this.topTotalCount.innerText = `${totalCount}개`;
  }

  handleFinisher(ball, rank, isWinner) {
    if (audioSynth.enabled) {
      if (isWinner) audioSynth.playWinSound();
      else audioSynth.playBounceSound();
    }

    this.updateFinisherList();
  }

  updateFinisherList() {
    if (!this.finisherList || !this.appState.engine) return;

    const finishers = this.appState.engine.finishers || [];
    if (this.finishCount) this.finishCount.innerText = `${finishers.length}명 완료`;

    let html = '';
    finishers.slice(0, 50).forEach((item, idx) => {
      const isWin = item.isWinner;
      const num = item.ball.number;
      const name = item.participant ? item.participant.name : `구슬 #${num}`;

      html += `
        <div class="finisher-item ${isWin ? 'is-winner' : ''}">
          <span class="finisher-rank">${idx + 1}위</span>
          <span class="finisher-name">${name}</span>
          <span class="finisher-ball">#${num}</span>
        </div>
      `;
    });

    this.finisherList.innerHTML = html;
  }

  updateServerStatus(text, color) {
    if (this.topServerStatus) {
      this.topServerStatus.innerText = text;
      if (color) this.topServerStatus.style.color = color;
    }
  }
}
