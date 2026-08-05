import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });
wss.on('error', () => {}); // Handle wss port retry silently

const PORT = process.env.PORT || 3000;

let CLIENT_DOMAIN = process.env.CLIENT_DOMAIN || '';

// Load local .env.local configuration automatically if exists
try {
  const envPath = path.join(__dirname, '.env.local');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const match = envContent.match(/CLIENT_DOMAIN\s*=\s*(.+)/);
    if (match) {
      CLIENT_DOMAIN = match[1].trim();
    }
  }
} catch (err) {}

// Domain-based routing: If accessed via custom client domain or query client=true, serve client.html automatically!
app.use((req, res, next) => {
  const host = (req.headers.host || '').toLowerCase();
  if (req.path === '/' && ((CLIENT_DOMAIN && host.includes(CLIENT_DOMAIN)) || req.query.client === 'true')) {
    const distClient = path.join(__dirname, 'dist', 'client.html');
    if (fs.existsSync(distClient)) {
      return res.sendFile(distClient);
    }
    return res.sendFile(path.join(__dirname, 'client.html'));
  }
  next();
});

// Serve static files (production bundle dist FIRST, fallback to root)
app.use(express.static(path.join(__dirname, 'dist')));
app.use(express.static(__dirname));

// Helper to get local Wi-Fi / Ethernet IPv4 address
function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// Global server state
let hostSocket = null;
const clientSockets = new Map(); // ws -> { ballIdx, name }
const assignedBallIndices = new Set();
let currentParticipants = [];

// Helper to generate 250 default participants
for (let i = 1; i <= 250; i++) {
  currentParticipants.push({
    id: i,
    number: i,
    ballNumber: i,
    name: `구슬 #${i}`
  });
}

function getNextAvailableBallIndex() {
  for (let i = 0; i < 250; i++) {
    if (!assignedBallIndices.has(i)) {
      return i;
    }
  }
  return Math.floor(Math.random() * 250);
}

function getConnectedBallIndices() {
  const indices = [];
  clientSockets.forEach(data => {
    if (data && data.ballIdx !== undefined) {
      indices.push(data.ballIdx);
    }
  });
  return indices;
}

function notifyHostClientState() {
  if (hostSocket && hostSocket.readyState === WebSocket.OPEN) {
    hostSocket.send(JSON.stringify({
      type: 'CLIENT_COUNT_UPDATE',
      count: clientSockets.size,
      connectedIndices: getConnectedBallIndices()
    }));
  }
}

function checkAndDisconnectDuplicateClient(ballIdx, currentWs) {
  for (const [ws, data] of clientSockets.entries()) {
    if (ws !== currentWs && data && data.ballIdx === ballIdx) {
      console.log(`⚠️ Disconnecting duplicate client for Ball #${ballIdx + 1}`);
      try {
        ws.send(JSON.stringify({
          type: 'FORCE_DISCONNECT',
          reason: `다른 기기 또는 새로운 창에서 구슬 #${ballIdx + 1}(으)로 새로 접속하여 기존 접속이 종료되었습니다.`
        }));
      } catch (err) {}
      clientSockets.delete(ws);
      assignedBallIndices.delete(ballIdx);
      ws.close(4001, 'FORCE_DISCONNECT');
    }
  }
}

wss.on('connection', (ws, req) => {
  ws.isAlive = true;

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (message, isBinary) => {
    if (isBinary) {
      // Binary tick data from Host (Float32Array of 250 balls position & speed)
      // Broadcast binary buffer directly to all connected client sockets!
      wss.clients.forEach(client => {
        if (client !== hostSocket && client.readyState === WebSocket.OPEN) {
          client.send(message, { binary: true });
        }
      });
    } else {
      try {
        const data = JSON.parse(message.toString());

        if (data.type === 'REGISTER_HOST') {
          if (hostSocket && hostSocket !== ws && hostSocket.readyState === WebSocket.OPEN) {
            console.log('⚠️ Disconnecting previous Main Pachinko Host...');
            try {
              hostSocket.send(JSON.stringify({
                type: 'FORCE_DISCONNECT',
                reason: '다른 기기 또는 새로운 창에서 메인 호스트로 새로 접속하여 기존 호스트 접속이 종료되었습니다.'
              }));
            } catch (err) {}
            hostSocket.close(4001, 'FORCE_DISCONNECT');
          }
          hostSocket = ws;
          console.log('🟢 Main Pachinko Host Registered!');
          notifyHostClientState();
        }

        else if (data.type === 'REGISTER_CLIENT') {
          const requestedIdx = (data.ballIdx !== undefined && data.ballIdx >= 0 && data.ballIdx < 250)
            ? data.ballIdx
            : getNextAvailableBallIndex();

          checkAndDisconnectDuplicateClient(requestedIdx, ws);

          assignedBallIndices.add(requestedIdx);
          clientSockets.set(ws, { ballIdx: requestedIdx });

          console.log(`📱 Client connected! Assigned Ball #${requestedIdx + 1} (Total clients: ${clientSockets.size})`);

          ws.send(JSON.stringify({
            type: 'ASSIGNED_BALL',
            ballIdx: requestedIdx,
            participants: currentParticipants
          }));

          notifyHostClientState();
        }

        else if (data.type === 'SET_CLIENT_NAME') {
          const clientData = clientSockets.get(ws);
          if (clientData && data.name) {
            const idx = clientData.ballIdx;
            clientData.name = data.name;
            if (!currentParticipants[idx]) {
              currentParticipants[idx] = { id: idx + 1, number: idx + 1, ballNumber: idx + 1, name: data.name };
            } else {
              currentParticipants[idx].name = data.name;
            }

            console.log(`👤 Client #${idx + 1} set name to: "${data.name}"`);

            // Broadcast updated participants to all connected sockets
            wss.clients.forEach(client => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ type: 'PARTICIPANTS_UPDATED', participants: currentParticipants }));
              }
            });
            notifyHostClientState();
          }
        }

        else if (data.type === 'UPDATE_PARTICIPANTS') {
          currentParticipants = data.participants || [];
          // Forward participant list to all connected clients
          wss.clients.forEach(client => {
            if (client !== hostSocket && client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({ type: 'PARTICIPANTS_UPDATED', participants: currentParticipants }));
            }
          });
        }

        else if (data.type === 'SELECT_BALL') {
          const clientData = clientSockets.get(ws);
          if (clientData && data.ballIdx !== undefined) {
            checkAndDisconnectDuplicateClient(data.ballIdx, ws);

            assignedBallIndices.delete(clientData.ballIdx);
            clientData.ballIdx = data.ballIdx;
            assignedBallIndices.add(data.ballIdx);

            ws.send(JSON.stringify({
              type: 'ASSIGNED_BALL',
              ballIdx: data.ballIdx,
              participants: currentParticipants
            }));

            notifyHostClientState();
          }
        }
      } catch (err) {
        console.error('Server message error:', err);
      }
    }
  });

  ws.on('close', () => {
    if (ws === hostSocket) {
      console.log('🔴 Main Host disconnected!');
      hostSocket = null;
    } else if (clientSockets.has(ws)) {
      const { ballIdx } = clientSockets.get(ws);
      assignedBallIndices.delete(ballIdx);
      clientSockets.delete(ws);
      console.log(`📱 Client disconnected (Freed Ball #${ballIdx + 1}, Remaining: ${clientSockets.size})`);

      notifyHostClientState();
    }
  });
});

// Heartbeat ping interval (10 seconds)
const interval = setInterval(() => {
  wss.clients.forEach(ws => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 10000);

wss.on('close', () => clearInterval(interval));

function startServer(port) {
  server.listen(port, () => {
    const ip = getLocalIpAddress();
    console.log(`
======================================================
🚀 AX Survival 서버 가동 완료!
------------------------------------------------------
💻 Main Host Board:   http://localhost:${port}
📱 Mobile Client FPV: http://${ip}:${port}/client.html
======================================================
    `);
  });
}

// Start server on port 3000 (with automatic fallback if port is in use)
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`⚠️ Port ${PORT} is in use, retrying on port ${PORT + 1}...`);
    startServer(PORT + 1);
  } else {
    console.error('Server error:', err);
  }
});

// API endpoint for clients to get host IP address
app.get('/api/ip', (req, res) => {
  const ip = getLocalIpAddress();
  const address = server.address();
  const actualPort = address ? address.port : PORT;
  res.json({ ip, port: actualPort });
});

startServer(PORT);
