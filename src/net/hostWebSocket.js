/**
 * Host WebSocket Manager for broadcast & server communication
 */
export class HostWebSocketManager {
  constructor(appState, callbacks = {}) {
    this.appState = appState;
    this.callbacks = callbacks; // onAck, onParticipantsUpdated, onForceDisconnect, etc.
  }

  async getHostWebSocketUrl() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';

    if (location.port === '5173') {
      try {
        const res = await fetch('/api/ip');
        const data = await res.json();
        return `${protocol}//${location.hostname}:${data.port || 3000}`;
      } catch (err) {
        return `${protocol}//${location.hostname}:3000`;
      }
    }

    return `${protocol}//${location.host}`;
  }

  async init() {
    const wsUrl = await this.getHostWebSocketUrl();
    const ws = new WebSocket(wsUrl);
    this.appState.setHostWs(ws);

    ws.onopen = () => {
      console.log('🟢 Host Connected to WebSocket Server');
      ws.send(JSON.stringify({ type: 'REGISTER_HOST' }));
      this.sendParticipantsToServer();
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'HOST_ACK' || msg.type === 'CLIENT_COUNT_UPDATE') {
          if (msg.connectedIndices) {
            this.appState.setConnectedIndices(msg.connectedIndices);
          }
          if (this.callbacks.onAck) {
            this.callbacks.onAck(msg.count ?? msg.clientCount ?? 0);
          }
        }
        else if (msg.type === 'PARTICIPANTS_UPDATED') {
          const participants = msg.participants || [];
          this.appState.setParticipants(participants);
          if (this.callbacks.onParticipantsUpdated) {
            this.callbacks.onParticipantsUpdated(participants);
          }
        }
        else if (msg.type === 'FORCE_DISCONNECT') {
          this.appState.setForceDisconnected(true);
          if (this.callbacks.onForceDisconnect) {
            this.callbacks.onForceDisconnect(msg.reason);
          }
          try { ws.close(); } catch (err) {}
        }
      } catch (err) {
        console.error('Host WS message parse error:', err);
      }
    };

    ws.onclose = () => {
      if (this.appState.isForceDisconnected) {
        if (this.callbacks.onClose) {
          this.callbacks.onClose(true);
        }
        return;
      }
      if (this.callbacks.onClose) {
        this.callbacks.onClose(false);
      }
      setTimeout(() => this.init(), 3000);
    };
  }

  sendParticipantsToServer() {
    const ws = this.appState.hostWs;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'UPDATE_PARTICIPANTS',
        participants: this.appState.currentParticipants
      }));
    }
  }

  /**
   * 20Hz Binary Tick Stream Broadcast for Client WebSockets
   */
  sendBinaryTick(now) {
    const ws = this.appState.hostWs;
    const engine = this.appState.engine;
    if (!ws || ws.readyState !== WebSocket.OPEN || !engine) return;

    if (now - this.appState.lastBinaryTickTime < 25) return; // 40Hz high frequency (every 25ms)
    this.appState.lastBinaryTickTime = now;

    const isReplay = engine.isPlayingReplay && engine.replayFrames && engine.replayFrames.length > 0;
    const replayFrame = isReplay ? engine.replayFrames[Math.min(Math.floor(engine.replayIndex), engine.replayFrames.length - 1)] : null;

    const balls = (isReplay && replayFrame && Array.isArray(replayFrame.balls))
      ? replayFrame.balls
      : (engine.balls || []);

    const stage2Angle = replayFrame ? (replayFrame.stage2Angle || 0) : (engine.stage2Angle || 0);
    const stage4Angle = replayFrame ? (replayFrame.stage4Angle || 0) : (engine.stage4Angle || 0);
    const stage5Angle = replayFrame ? (replayFrame.stage5Angle || 0) : (engine.stage5Angle || 0);

    const headerSize = 16;
    const ballSize = 14;
    const bufferSize = headerSize + balls.length * ballSize;

    const buffer = new ArrayBuffer(bufferSize);
    const view = new DataView(buffer);
    let offset = 0;

    let gateMask = 0;
    if (engine.gates) {
      if (engine.gates[1]?.isOpen) gateMask |= (1 << 1);
      if (engine.gates[2]?.isOpen) gateMask |= (1 << 2);
      if (engine.gates[3]?.isOpen) gateMask |= (1 << 3);
      if (engine.gates[4]?.isOpen) gateMask |= (1 << 4);
    }

    view.setFloat32(offset, stage2Angle, true); offset += 4;
    view.setFloat32(offset, stage4Angle, true); offset += 4;
    view.setFloat32(offset, stage5Angle, true); offset += 4;
    view.setUint16(offset, gateMask, true); offset += 2;
    view.setUint16(offset, balls.length, true); offset += 2;

    balls.forEach(b => {
      if (!b) return;
      const num = b.number || b.id || 1;
      const posX = b.body ? b.body.position.x : (b.x || 0);
      const posY = b.body ? b.body.position.y : (b.y || 0);
      const velX = Math.round((b.body ? (b.body.velocity ? b.body.velocity.x : 0) : (b.vx || 0)) * 10);
      const velY = Math.round((b.body ? (b.body.velocity ? b.body.velocity.y : 0) : (b.vy || 0)) * 10);

      view.setUint16(offset, num, true); offset += 2;
      view.setFloat32(offset, posX, true); offset += 4;
      view.setFloat32(offset, posY, true); offset += 4;
      view.setInt16(offset, velX, true); offset += 2;
      view.setInt16(offset, velY, true); offset += 2;
    });

    ws.send(buffer);
  }
}
