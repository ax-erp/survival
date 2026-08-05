import { generateDefaultParticipants } from '../utils/excelParser.js';

export class AppState {
  constructor() {
    this.engine = null;
    this.wireframeRenderer = null;
    this.hostWs = null;

    this.currentParticipants = generateDefaultParticipants(250);
    this.lastTime = performance.now();
    this.lastBinaryTickTime = 0;
    this.currentFilter = 'all';
    this.connectedClientBallIndices = new Set();
    this.isForceDisconnected = false;
  }

  setEngine(engine) {
    this.engine = engine;
  }

  setWireframeRenderer(renderer) {
    this.wireframeRenderer = renderer;
  }

  setHostWs(ws) {
    this.hostWs = ws;
  }

  setParticipants(participants) {
    this.currentParticipants = participants;
    if (this.engine) {
      this.engine.participants = participants;
    }
  }

  setFilter(filter) {
    this.currentFilter = filter;
  }

  setConnectedIndices(indices) {
    this.connectedClientBallIndices = new Set(indices);
  }

  setForceDisconnected(status) {
    this.isForceDisconnected = status;
  }
}
