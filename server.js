const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.json());
app.use(express.static(__dirname));

// ── STREAM PIN — change this to your secret PIN ──────────────────
const STREAM_PIN = process.env.STREAM_PIN || '1234';

const clients = {
  streamer: null,
  viewers: new Map() // viewerId → { ws, name, ip, joinedAt }
};

// ── PIN Verification API ──────────────────────────────────────────
app.post('/verify-pin', (req, res) => {
  const { pin } = req.body;
  if (pin === STREAM_PIN) {
    res.json({ ok: true });
  } else {
    res.status(401).json({ ok: false, error: 'Wrong PIN' });
  }
});

// ── Status API ────────────────────────────────────────────────────
app.get('/status', (req, res) => {
  const viewerList = Array.from(clients.viewers.values()).map(v => ({
    id: v.id,
    name: v.name,
    joinedAt: v.joinedAt,
    ip: v.ip
  }));
  res.json({
    streamer: clients.streamer ? 'online' : 'offline',
    viewerCount: clients.viewers.size,
    viewers: viewerList
  });
});

// ── WebSocket ─────────────────────────────────────────────────────
wss.on('connection', (ws, req) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  ws.clientIp = ip;

  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }

    switch (msg.type) {

      case 'register-streamer':
        // Streamer must also send PIN
        if (msg.pin !== STREAM_PIN) {
          ws.send(JSON.stringify({ type: 'auth-failed' }));
          ws.close();
          return;
        }
        clients.streamer = ws;
        ws.role = 'streamer';
        console.log('✅ Streamer connected from', ip);
        // Notify waiting viewers
        clients.viewers.forEach(v => {
          v.ws.send(JSON.stringify({ type: 'streamer-ready' }));
        });
        // Send current viewer list to streamer
        broadcastViewerList();
        break;

      case 'register-viewer':
        // Viewer must send PIN + name
        if (msg.pin !== STREAM_PIN) {
          ws.send(JSON.stringify({ type: 'auth-failed', error: 'Wrong PIN' }));
          return;
        }
        const viewerId = Math.random().toString(36).slice(2, 8).toUpperCase();
        const viewerName = (msg.name || 'Anonymous').slice(0, 20);
        ws.role = 'viewer';
        ws.viewerId = viewerId;
        ws.viewerName = viewerName;

        clients.viewers.set(viewerId, {
          ws, id: viewerId,
          name: viewerName,
          ip: ip,
          joinedAt: new Date().toISOString()
        });

        console.log(`👁 Viewer "${viewerName}" [${viewerId}] connected. Total: ${clients.viewers.size}`);

        ws.send(JSON.stringify({ type: 'auth-ok', viewerId }));

        if (clients.streamer && clients.streamer.readyState === 1) {
          ws.send(JSON.stringify({ type: 'streamer-ready' }));
        } else {
          ws.send(JSON.stringify({ type: 'streamer-offline' }));
        }

        // Notify streamer of new viewer list
        broadcastViewerList();
        break;

      case 'viewer-ready':
        if (clients.streamer && clients.streamer.readyState === 1) {
          clients.streamer.send(JSON.stringify({
            type: 'new-viewer',
            viewerId: ws.viewerId,
            viewerName: ws.viewerName
          }));
        }
        break;

      case 'offer':
        // Streamer → specific viewer
        const target = clients.viewers.get(msg.viewerId);
        if (target) target.ws.send(JSON.stringify({ type: 'offer', sdp: msg.sdp }));
        break;

      case 'answer':
        if (clients.streamer && clients.streamer.readyState === 1) {
          clients.streamer.send(JSON.stringify({ type: 'answer', sdp: msg.sdp, viewerId: ws.viewerId }));
        }
        break;

      case 'ice-candidate':
        if (ws.role === 'streamer') {
          clients.viewers.forEach(v => {
            v.ws.send(JSON.stringify({ type: 'ice-candidate', candidate: msg.candidate }));
          });
        } else {
          if (clients.streamer && clients.streamer.readyState === 1) {
            clients.streamer.send(JSON.stringify({ type: 'ice-candidate', candidate: msg.candidate }));
          }
        }
        break;

      // Streamer kicks a viewer
      case 'kick-viewer':
        if (ws.role !== 'streamer') break;
        const toKick = clients.viewers.get(msg.viewerId);
        if (toKick) {
          toKick.ws.send(JSON.stringify({ type: 'kicked' }));
          toKick.ws.close();
          clients.viewers.delete(msg.viewerId);
          console.log(`🚫 Viewer ${msg.viewerId} kicked`);
          broadcastViewerList();
        }
        break;
    }
  });

  ws.on('close', () => {
    if (ws.role === 'streamer') {
      clients.streamer = null;
      console.log('Streamer disconnected');
      clients.viewers.forEach(v => {
        v.ws.send(JSON.stringify({ type: 'streamer-offline' }));
      });
    } else if (ws.role === 'viewer') {
      clients.viewers.delete(ws.viewerId);
      console.log(`Viewer ${ws.viewerName} disconnected. Remaining: ${clients.viewers.size}`);
      broadcastViewerList();
    }
  });
});

function broadcastViewerList() {
  if (!clients.streamer || clients.streamer.readyState !== 1) return;
  const list = Array.from(clients.viewers.values()).map(v => ({
    id: v.id, name: v.name, joinedAt: v.joinedAt
  }));
  clients.streamer.send(JSON.stringify({ type: 'viewer-list', viewers: list }));
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 CamStream SECURE server on port ${PORT}`);
  console.log(`🔑 Stream PIN: ${STREAM_PIN}`);
});
