const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static(path.join(__dirname, 'public')));

// Store connected clients by role
const clients = {
  streamer: null,
  viewers: new Set()
};

wss.on('connection', (ws) => {
  console.log('New connection');

  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }

    switch (msg.type) {
      case 'register-streamer':
        clients.streamer = ws;
        ws.role = 'streamer';
        console.log('Streamer connected');
        // Notify all waiting viewers
        clients.viewers.forEach(viewer => {
          viewer.send(JSON.stringify({ type: 'streamer-ready' }));
        });
        break;

      case 'register-viewer':
        clients.viewers.add(ws);
        ws.role = 'viewer';
        console.log('Viewer connected, total:', clients.viewers.size);
        // Tell viewer if streamer is online
        if (clients.streamer && clients.streamer.readyState === 1) {
          ws.send(JSON.stringify({ type: 'streamer-ready' }));
        } else {
          ws.send(JSON.stringify({ type: 'streamer-offline' }));
        }
        break;

      // WebRTC signaling relay
      case 'offer':
        // Streamer → specific viewer or broadcast
        if (msg.viewerId) {
          // send to specific viewer
          clients.viewers.forEach(v => {
            if (v.viewerId === msg.viewerId) {
              v.send(JSON.stringify({ type: 'offer', sdp: msg.sdp }));
            }
          });
        } else {
          // broadcast offer to all viewers
          clients.viewers.forEach(v => {
            v.send(JSON.stringify({ type: 'offer', sdp: msg.sdp }));
          });
        }
        break;

      case 'answer':
        // Viewer → Streamer
        if (clients.streamer && clients.streamer.readyState === 1) {
          clients.streamer.send(JSON.stringify({ type: 'answer', sdp: msg.sdp, viewerId: ws.viewerId }));
        }
        break;

      case 'ice-candidate':
        if (ws.role === 'streamer') {
          // Forward to all viewers
          clients.viewers.forEach(v => {
            v.send(JSON.stringify({ type: 'ice-candidate', candidate: msg.candidate }));
          });
        } else {
          // Forward to streamer
          if (clients.streamer && clients.streamer.readyState === 1) {
            clients.streamer.send(JSON.stringify({ type: 'ice-candidate', candidate: msg.candidate }));
          }
        }
        break;

      case 'viewer-ready':
        // Viewer ready to receive — assign ID and notify streamer
        ws.viewerId = Math.random().toString(36).slice(2, 8);
        if (clients.streamer && clients.streamer.readyState === 1) {
          clients.streamer.send(JSON.stringify({ type: 'new-viewer', viewerId: ws.viewerId }));
        }
        break;
    }
  });

  ws.on('close', () => {
    if (ws.role === 'streamer') {
      clients.streamer = null;
      console.log('Streamer disconnected');
      clients.viewers.forEach(v => {
        v.send(JSON.stringify({ type: 'streamer-offline' }));
      });
    } else if (ws.role === 'viewer') {
      clients.viewers.delete(ws);
      console.log('Viewer disconnected, remaining:', clients.viewers.size);
    }
  });
});

// Status API
app.get('/status', (req, res) => {
  res.json({
    streamer: clients.streamer ? 'online' : 'offline',
    viewers: clients.viewers.size
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 CamStream server running on port ${PORT}`);
});
