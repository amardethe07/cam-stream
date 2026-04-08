# 📡 CamStream — Live Phone Camera over Internet

Access your smartphone camera from anywhere in the world via browser. No app install needed.

## How It Works

```
📱 Phone Browser          🌐 Render Server           💻 Any Browser
getUserMedia()    ←WS→   Signaling (Node.js)   ←WS→  Viewer
WebRTC P2P ─────────────────────────────────────────→ Live Stream
```

- **WebRTC** = ultra-low latency P2P video (< 500ms)
- **Signaling server** = coordinates the connection, doesn't relay video
- **STUN servers** = Google's free servers for NAT traversal

---

## Deploy to Render (Free)

1. Push this folder to GitHub:
   ```bash
   git init
   git add .
   git commit -m "CamStream v1"
   git remote add origin https://github.com/YOUR_USERNAME/cam-stream
   git push -u origin main
   ```

2. Go to [render.com](https://render.com) → New Web Service
3. Connect your GitHub repo
4. Settings:
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free

5. Deploy! Your URL will be: `https://cam-stream-xxxx.onrender.com`

---

## Usage

| URL | Device | Purpose |
|-----|--------|---------|
| `your-app.onrender.com` | Any | Home/landing page |
| `your-app.onrender.com/streamer.html` | 📱 Phone | Start camera stream |
| `your-app.onrender.com/viewer.html` | 💻 Anywhere | Watch live stream |

### Steps:
1. Open `/streamer.html` on your phone
2. Tap **▶ START STREAM**
3. Grant camera/mic permission
4. Share `/viewer.html` URL with anyone
5. They open it → instant live feed!

---

## Features

- ✅ Rear/front camera toggle mid-stream
- ✅ Audio + video
- ✅ Multiple viewers simultaneously
- ✅ Live stats: FPS, bitrate, resolution, latency
- ✅ Fullscreen viewer mode
- ✅ Volume control
- ✅ Auto-reconnect if connection drops
- ✅ HTTPS required (Render provides it automatically)

---

## Limitations of Free Tier

- WebRTC works peer-to-peer, so works great in most networks
- If behind strict corporate NAT, may need a TURN server
- Add free TURN server from [Metered.ca](https://www.metered.ca/tools/openrelay/) in `ICE_SERVERS` arrays

## Add TURN Server (if needed)

In both `streamer.html` and `viewer.html`, update `ICE_SERVERS`:
```javascript
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  }
];
```

---

Built with: Node.js · Express · WebSocket · WebRTC
