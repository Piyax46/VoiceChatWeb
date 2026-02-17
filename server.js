const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const ytSearch = require('yt-search');
const session = require('express-session');
const bodyParser = require('body-parser');
const database = require('./database');

const app = express();
const server = http.createServer(app);

// Session middleware
const sessionMiddleware = session({
  secret: 'voicechat-secret-key-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 } // 7 days
});

app.use(bodyParser.json({ limit: '5mb' }));
app.use(sessionMiddleware);

const io = new Server(server, {
  cors: { origin: '*' },
  maxHttpBufferSize: 5e6
});

// Share session with Socket.IO
io.engine.use(sessionMiddleware);

// Music State
const musicStates = new Map();

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// ─── Runtime State ───────────────────────────────────────────
const rooms = new Map();          // roomId -> { id, name, type, maxUsers, users: Map, createdBy }
const users = new Map();          // socketId -> { id, visitorId, username, avatarColor, avatarData, roomId, muted, deafened }
const onlineUsersByDbId = new Map(); // dbUserId -> socketId

// Load rooms from database
function loadRooms() {
  const dbRooms = database.getAllRooms();
  dbRooms.forEach(r => {
    if (!rooms.has(r.id)) {
      rooms.set(r.id, {
        id: r.id,
        name: r.name,
        type: r.type || 'voice',
        maxUsers: r.max_users,
        createdBy: r.created_by,
        isDefault: r.is_default,
        users: new Map()
      });
    }
  });
}
loadRooms();

// ─── REST API ────────────────────────────────────────────────

app.post('/api/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' });
  }
  if (username.length < 2 || username.length > 20) {
    return res.status(400).json({ error: 'ชื่อผู้ใช้ต้องมี 2-20 ตัวอักษร' });
  }
  if (password.length < 4) {
    return res.status(400).json({ error: 'รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร' });
  }

  const user = database.createUser(username, password);
  if (!user) {
    return res.status(409).json({ error: 'ชื่อผู้ใช้นี้ถูกใช้แล้ว' });
  }

  req.session.userId = user.id;
  res.json({ success: true, user: { id: user.id, username: user.username, avatarColor: '#5865F2', avatarData: null } });
});

app.post('/api/login', (req, res) => {
  const { username, password, rememberMe } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' });
  }

  const user = database.findUserByUsername(username);
  if (!user || !database.verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
  }

  req.session.userId = user.id;
  // Extend session to 30 days if Remember Me is checked
  if (rememberMe) {
    req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
  }
  res.json({
    success: true,
    user: {
      id: user.id,
      username: user.username,
      avatarColor: user.avatar_color,
      avatarData: user.avatar_data
    }
  });
});

app.get('/api/me', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  const user = database.findUserById(req.session.userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json({
    user: {
      id: user.id,
      username: user.username,
      avatarColor: user.avatar_color,
      avatarData: user.avatar_data
    }
  });
});

app.post('/api/profile', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  const { username, avatarData, avatarColor } = req.body;
  const updated = database.updateUserProfile(req.session.userId, { username, avatarData, avatarColor });
  if (!updated) {
    return res.status(409).json({ error: 'ชื่อผู้ใช้นี้ถูกใช้แล้ว' });
  }
  res.json({
    success: true,
    user: {
      id: updated.id,
      username: updated.username,
      avatarColor: updated.avatar_color,
      avatarData: updated.avatar_data
    }
  });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// ─── Room API ────────────────────────────────────────────────

app.post('/api/rooms', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  const { name, type, maxUsers } = req.body;
  if (!name) return res.status(400).json({ error: 'กรุณาใส่ชื่อห้อง' });

  const roomType = type || 'voice';
  const max = Math.min(Math.max(parseInt(maxUsers) || 10, 2), 50);
  const roomId = uuidv4().slice(0, 8);
  const icon = roomType === 'voice' ? '🔊' : '💬';
  const fullName = `${icon} ${name}`;

  const room = database.createRoom(roomId, fullName, roomType, max, req.session.userId);
  if (!room) return res.status(500).json({ error: 'Failed to create room' });

  // Add to runtime
  rooms.set(roomId, {
    id: roomId,
    name: fullName,
    type: roomType,
    maxUsers: max,
    createdBy: req.session.userId,
    isDefault: 0,
    users: new Map()
  });

  io.emit('rooms:update', getRoomState());
  res.json({ success: true, room: { id: roomId, name: fullName, type: roomType, maxUsers: max } });
});

app.delete('/api/rooms/:id', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  const result = database.deleteRoom(req.params.id, req.session.userId);
  if (result.error) return res.status(400).json(result);

  // Remove from runtime
  const room = rooms.get(req.params.id);
  if (room) {
    // Kick all users from this room
    room.users.forEach((user, socketId) => {
      user.roomId = null;
      io.to(socketId).emit('room:kicked', { reason: 'ห้องถูกลบแล้ว' });
    });
    rooms.delete(req.params.id);
  }
  musicStates.delete(req.params.id);

  io.emit('rooms:update', getRoomState());
  res.json({ success: true });
});

// ─── Message API ─────────────────────────────────────────────

app.get('/api/messages/dm/:userId', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  const msgs = database.getDirectMessages(req.session.userId, parseInt(req.params.userId));
  res.json({ messages: msgs });
});

app.get('/api/messages/room/:roomId', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  const msgs = database.getRoomMessages(req.params.roomId);
  res.json({ messages: msgs });
});

// ─── Helpers ─────────────────────────────────────────────────

function getRoomState() {
  const state = {};
  rooms.forEach((room, id) => {
    state[id] = {
      id: room.id,
      name: room.name,
      type: room.type || 'voice',
      maxUsers: room.maxUsers,
      createdBy: room.createdBy,
      isDefault: room.isDefault,
      users: []
    };
    room.users.forEach((user) => {
      state[id].users.push({
        id: user.id,
        visitorId: user.visitorId,
        username: user.username,
        avatarColor: user.avatarColor,
        avatarData: user.avatarData,
        muted: user.muted,
        deafened: user.deafened,
        speaking: false
      });
    });

    // Inject Music Bot if active
    const musicState = musicStates.get(id);
    if (musicState && (musicState.isPlaying || musicState.queue.length > 0)) {
      state[id].users.push({
        id: `bot-${id}`,
        username: 'Music Bot',
        avatarColor: '#5865F2',
        muted: false,
        deafened: false,
        speaking: musicState.isPlaying,
        isBot: true
      });
    }
  });
  return state;
}

function getOnlineUsers() {
  const list = [];
  users.forEach((user) => {
    list.push({
      id: user.id,
      visitorId: user.visitorId,
      username: user.username,
      avatarColor: user.avatarColor,
      avatarData: user.avatarData,
      roomId: user.roomId
    });
  });
  return list;
}

// ─── Socket.IO Events ───────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[Connect] ${socket.id}`);

  // User joins the app (authenticated)
  socket.on('user:join', ({ userId, username, avatarColor, avatarData }) => {
    const user = {
      id: socket.id,
      visitorId: userId || null,
      username: username || `User_${socket.id.slice(0, 5)}`,
      avatarColor: avatarColor || '#5865F2',
      avatarData: avatarData || null,
      roomId: null,
      muted: false,
      deafened: false
    };
    users.set(socket.id, user);

    if (userId) {
      onlineUsersByDbId.set(userId, socket.id);
    }

    socket.emit('user:info', user);
    io.emit('rooms:update', getRoomState());
    io.emit('users:online', getOnlineUsers());
    console.log(`[User Join] ${user.username} (DB: ${userId})`);
  });

  // User profile update broadcast
  socket.on('user:profile-update', ({ username, avatarColor, avatarData }) => {
    const user = users.get(socket.id);
    if (!user) return;

    user.username = username || user.username;
    user.avatarColor = avatarColor || user.avatarColor;
    if (avatarData !== undefined) user.avatarData = avatarData;

    // Update in room if in one
    if (user.roomId) {
      const room = rooms.get(user.roomId);
      if (room) room.users.set(socket.id, user);
    }

    io.emit('rooms:update', getRoomState());
    io.emit('users:online', getOnlineUsers());
    io.emit('user:profile-changed', {
      socketId: socket.id,
      visitorId: user.visitorId,
      username: user.username,
      avatarColor: user.avatarColor,
      avatarData: user.avatarData
    });
  });

  // User joins a voice room
  socket.on('room:join', ({ roomId }) => {
    const user = users.get(socket.id);
    if (!user) return;

    const room = rooms.get(roomId);
    if (!room) return;

    // Check room capacity
    if (room.users.size >= room.maxUsers) {
      socket.emit('room:full', { roomId });
      return;
    }

    // Leave current room if in one
    if (user.roomId) {
      const oldRoom = rooms.get(user.roomId);
      if (oldRoom) {
        oldRoom.users.delete(socket.id);
        socket.leave(user.roomId);
        socket.to(user.roomId).emit('peer:left', { peerId: socket.id });
      }
    }

    // Join new room
    user.roomId = roomId;
    room.users.set(socket.id, user);
    socket.join(roomId);

    // Get existing peers in room
    const existingPeers = [];
    room.users.forEach((u, id) => {
      if (id !== socket.id) {
        existingPeers.push({ id, username: u.username, avatarColor: u.avatarColor });
      }
    });

    socket.emit('room:joined', { roomId, peers: existingPeers });

    socket.to(roomId).emit('peer:joined', {
      peerId: socket.id,
      username: user.username,
      avatarColor: user.avatarColor
    });

    // Send current music state if playing
    const musicState = musicStates.get(roomId);
    if (musicState) {
      socket.emit('music:state', musicState);
    }

    io.emit('rooms:update', getRoomState());
    io.emit('users:online', getOnlineUsers());
    console.log(`[Room Join] ${user.username} -> ${room.name}`);
  });

  // User leaves a voice room
  socket.on('room:leave', () => {
    const user = users.get(socket.id);
    if (!user || !user.roomId) return;

    const room = rooms.get(user.roomId);
    if (room) {
      room.users.delete(socket.id);
      socket.to(user.roomId).emit('peer:left', { peerId: socket.id });
      socket.leave(user.roomId);
    }

    user.roomId = null;
    io.emit('rooms:update', getRoomState());
    io.emit('users:online', getOnlineUsers());
    console.log(`[Room Leave] ${user.username}`);
  });

  // ─── Direct Messaging ──────────────────────────────────────
  socket.on('message:send', ({ receiverId, roomId, content }) => {
    const user = users.get(socket.id);
    if (!user || !user.visitorId || !content) return;

    const msg = database.saveMessage(user.visitorId, content.trim(), {
      receiverId: receiverId || null,
      roomId: roomId || null
    });

    const enrichedMsg = {
      ...msg,
      sender_username: user.username,
      sender_avatar: user.avatarData,
      sender_color: user.avatarColor
    };

    if (receiverId) {
      // DM - send to receiver if online
      const receiverSocketId = onlineUsersByDbId.get(receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit('message:receive', enrichedMsg);
      }
      socket.emit('message:receive', enrichedMsg);
    } else if (roomId) {
      // Room message
      io.to(roomId).emit('message:receive', enrichedMsg);
    }
  });

  // ─── WebRTC Signaling ──────────────────────────────────────
  socket.on('webrtc:offer', ({ to, offer }) => {
    socket.to(to).emit('webrtc:offer', { from: socket.id, offer });
  });

  socket.on('webrtc:answer', ({ to, answer }) => {
    socket.to(to).emit('webrtc:answer', { from: socket.id, answer });
  });

  socket.on('webrtc:ice-candidate', ({ to, candidate }) => {
    socket.to(to).emit('webrtc:ice-candidate', { from: socket.id, candidate });
  });

  // User toggles mute
  socket.on('user:mute', ({ muted }) => {
    const user = users.get(socket.id);
    if (!user) return;
    user.muted = muted;
    if (user.roomId) {
      socket.to(user.roomId).emit('peer:mute', { peerId: socket.id, muted });
    }
    io.emit('rooms:update', getRoomState());
  });

  // User toggles deafen
  socket.on('user:deafen', ({ deafened }) => {
    const user = users.get(socket.id);
    if (!user) return;
    user.deafened = deafened;
    if (deafened) user.muted = true;
    if (user.roomId) {
      socket.to(user.roomId).emit('peer:deafen', { peerId: socket.id, deafened, muted: user.muted });
    }
    io.emit('rooms:update', getRoomState());
  });

  // User speaking status
  socket.on('user:speaking', ({ speaking }) => {
    const user = users.get(socket.id);
    if (!user || !user.roomId) return;
    socket.to(user.roomId).emit('peer:speaking', { peerId: socket.id, speaking });
  });

  // Disconnect
  socket.on('disconnect', () => {
    const user = users.get(socket.id);
    if (user) {
      if (user.roomId) {
        const room = rooms.get(user.roomId);
        if (room) {
          room.users.delete(socket.id);
          socket.to(user.roomId).emit('peer:left', { peerId: socket.id });

          if (room.users.size === 0) {
            const musicState = musicStates.get(user.roomId);
            if (musicState) {
              musicState.queue = [];
              musicState.current = null;
              musicState.isPlaying = false;
              io.to(user.roomId).emit('music:state', musicState);
              io.emit('rooms:update', getRoomState());
            }
          }
        }
      }
      if (user.visitorId) {
        onlineUsersByDbId.delete(user.visitorId);
      }
      users.delete(socket.id);
      io.emit('rooms:update', getRoomState());
      io.emit('users:online', getOnlineUsers());
      console.log(`[Disconnect] ${user.username}`);
    }
  });

  // ─── Music Bot Logic ───────────────────────────────────────

  socket.on('music:search', async (query) => {
    try {
      if (!query) return;
      const r = await ytSearch(query);
      const videos = r.videos.slice(0, 5);
      const formattedResults = videos.map(v => ({
        videoId: v.videoId,
        title: v.title,
        thumbnail: v.thumbnail,
        channelTitle: v.author.name,
        duration: v.timestamp
      }));
      socket.emit('music:search-results', formattedResults);
    } catch (err) {
      console.error('YouTube Search Error:', err);
      socket.emit('music:error', 'Failed to search YouTube');
    }
  });

  socket.on('music:play', async (songData) => {
    const user = users.get(socket.id);
    if (!user || !user.roomId) return;
    console.log(`[Music] Play request from ${user.username} in room ${user.roomId}:`, songData.title);
    if (!musicStates.has(user.roomId)) {
      musicStates.set(user.roomId, { queue: [], current: null, isPlaying: false, startTime: 0 });
    }
    const state = musicStates.get(user.roomId);
    const song = { ...songData, addedBy: user.username };
    if (!state.current) {
      playSong(user.roomId, song);
    } else {
      state.queue.push(song);
      io.to(user.roomId).emit('music:state', state);
    }
  });

  socket.on('music:add', async ({ videoId, title, thumbnail, duration }) => {
    const user = users.get(socket.id);
    if (!user || !user.roomId) return;
    console.log(`[Music] Add request from ${user.username} in room ${user.roomId}:`, title);
    if (!musicStates.has(user.roomId)) {
      musicStates.set(user.roomId, { queue: [], current: null, isPlaying: false, startTime: 0 });
    }
    const state = musicStates.get(user.roomId);
    const song = { videoId, title, thumbnail, duration, addedBy: user.username };
    if (!state.current) {
      playSong(user.roomId, song);
    } else {
      state.queue.push(song);
      io.to(user.roomId).emit('music:state', state);
      io.emit('rooms:update', getRoomState());
    }
  });

  socket.on('music:skip', () => {
    const user = users.get(socket.id);
    if (!user || !user.roomId) return;
    console.log(`[Music] Skip request from ${user.username}`);
    const state = musicStates.get(user.roomId);
    if (state) {
      if (state.queue.length > 0) {
        const nextSong = state.queue.shift();
        playSong(user.roomId, nextSong);
      } else {
        stopMusic(user.roomId);
      }
    }
  });

  socket.on('music:stop', () => {
    const user = users.get(socket.id);
    if (!user || !user.roomId) return;
    console.log(`[Music] Stop request from ${user.username}`);
    stopMusic(user.roomId);
  });

  socket.on('music:sync', () => {
    const user = users.get(socket.id);
    if (!user || !user.roomId) return;
    const state = musicStates.get(user.roomId);
    if (state) socket.emit('music:state', state);
  });

  socket.on('music:pause', () => {
    const user = users.get(socket.id);
    if (!user || !user.roomId) return;
    console.log(`[Music] Pause request from ${user.username}`);
    const state = musicStates.get(user.roomId);
    if (state && state.isPlaying) {
      state.isPlaying = false;
      state.pausedAt = Date.now() - state.startTime; // Save elapsed time
      io.to(user.roomId).emit('music:state', state);
      io.emit('rooms:update', getRoomState());
    }
  });

  socket.on('music:resume', () => {
    const user = users.get(socket.id);
    if (!user || !user.roomId) return;
    const state = musicStates.get(user.roomId);
    if (state && !state.isPlaying && state.current) {
      state.isPlaying = true;
      state.startTime = Date.now() - (state.pausedAt || 0); // Restore correct position
      state.pausedAt = null;
      io.to(user.roomId).emit('music:state', state);
      io.emit('rooms:update', getRoomState());
    }
  });

  socket.on('music:ended', () => {
    const user = users.get(socket.id);
    if (!user || !user.roomId) return;
    const state = musicStates.get(user.roomId);
    if (state) {
      if (state.queue.length > 0) {
        const nextSong = state.queue.shift();
        playSong(user.roomId, nextSong);
      } else {
        stopMusic(user.roomId);
      }
    }
  });
});

function playSong(roomId, song) {
  console.log(`[Music] Playing in room ${roomId}: ${song.title}`);
  const state = musicStates.get(roomId);
  if (!state) return;
  state.current = song;
  state.isPlaying = true;
  state.startTime = Date.now();
  state.pausedAt = null;
  io.to(roomId).emit('music:play', song);
  io.to(roomId).emit('music:state', state);
  io.emit('rooms:update', getRoomState());
}

function stopMusic(roomId) {
  const state = musicStates.get(roomId);
  if (!state) return;
  state.queue = [];
  state.current = null;
  state.isPlaying = false;
  state.pausedAt = null;
  io.to(roomId).emit('music:stop');
  io.to(roomId).emit('music:state', state);
  io.emit('rooms:update', getRoomState());
}

// ─── Start Server ────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🎙️  So Mua VoiceChat Server running at http://localhost:${PORT}`);
});
