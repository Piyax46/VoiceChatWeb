const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const YouTube = require('youtube-sr').default;

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// Music State
const musicStates = new Map(); // roomId -> { queue: [], current: null, isPlaying: false, startTime: 0 }

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));


// ─── State ───────────────────────────────────────────────────────────
const rooms = new Map();
const users = new Map(); // socketId -> { id, username, avatarColor, roomId, muted, deafened }

// Default voice channels
const defaultRooms = [
  { id: 'general', name: '🔊 General', maxUsers: 10 },
  { id: 'gaming', name: '🎮 Gaming', maxUsers: 8 },
  { id: 'music', name: '🎵 Music Lounge', maxUsers: 6 },
  { id: 'chill', name: '☕ Chill Zone', maxUsers: 5 },
  { id: 'meeting', name: '📋 Meeting Room', maxUsers: 12 },
  { id: 'party', name: '🎉 Party', maxUsers: 15 },
];

// Initialize default rooms
defaultRooms.forEach(r => {
  rooms.set(r.id, {
    id: r.id,
    name: r.name,
    maxUsers: r.maxUsers,
    users: new Map()
  });
});

// Generate random avatar color
function randomColor() {
  const colors = [
    '#5865F2', '#57F287', '#FEE75C', '#EB459E', '#ED4245',
    '#3BA55C', '#FAA61A', '#F47B67', '#9B59B6', '#E91E63',
    '#00BCD4', '#FF9800', '#8BC34A', '#673AB7', '#2196F3'
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

// Get room state for broadcasting
function getRoomState() {
  const state = {};
  rooms.forEach((room, id) => {
    state[id] = {
      id: room.id,
      name: room.name,
      maxUsers: room.maxUsers,
      users: []
    };
    room.users.forEach((user) => {
      state[id].users.push({
        id: user.id,
        username: user.username,
        avatarColor: user.avatarColor,
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
        avatarColor: '#5865F2', // Discord Blurple
        muted: false,
        deafened: false,
        speaking: musicState.isPlaying, // Animate if playing
        isBot: true
      });
    }
  });
  return state;
}

// Get online users list
function getOnlineUsers() {
  const list = [];
  users.forEach((user) => {
    list.push({
      id: user.id,
      username: user.username,
      avatarColor: user.avatarColor,
      roomId: user.roomId
    });
  });
  return list;
}

// ─── Socket.IO Events ───────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[Connect] ${socket.id}`);

  // User joins the app
  socket.on('user:join', ({ username }) => {
    const user = {
      id: socket.id,
      username: username || `User_${socket.id.slice(0, 5)}`,
      avatarColor: randomColor(),
      roomId: null,
      muted: false,
      deafened: false
    };
    users.set(socket.id, user);

    socket.emit('user:info', user);
    io.emit('rooms:update', getRoomState());
    io.emit('users:online', getOnlineUsers());
    console.log(`[User Join] ${user.username}`);
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
        // Notify old room peers
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

    // Tell the joining user about existing peers
    socket.emit('room:joined', {
      roomId,
      peers: existingPeers
    });

    // Tell existing peers about the new user
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

  // WebRTC Signaling: Offer
  socket.on('webrtc:offer', ({ to, offer }) => {
    socket.to(to).emit('webrtc:offer', {
      from: socket.id,
      offer
    });
  });

  // WebRTC Signaling: Answer
  socket.on('webrtc:answer', ({ to, answer }) => {
    socket.to(to).emit('webrtc:answer', {
      from: socket.id,
      answer
    });
  });

  // WebRTC Signaling: ICE Candidate
  socket.on('webrtc:ice-candidate', ({ to, candidate }) => {
    socket.to(to).emit('webrtc:ice-candidate', {
      from: socket.id,
      candidate
    });
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

          // Check if room is empty (except bot) and stop music
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
      users.delete(socket.id);
      io.emit('rooms:update', getRoomState());
      io.emit('users:online', getOnlineUsers());
      console.log(`[Disconnect] ${user.username}`);
    }
  });

  // ─── Music Bot Logic ───────────────────────────────────────────────

  socket.on('music:search', async (query) => {
    try {
      if (!query) return;
      console.log('Searching for:', query);
      const videos = await YouTube.search(query, { limit: 5 });

      const formattedResults = videos.map(v => ({
        videoId: v.id,
        title: v.title,
        thumbnail: v.thumbnail ? v.thumbnail.url : '',
        channelTitle: v.channel ? v.channel.name : 'Unknown',
        duration: v.durationFormatted
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

    // Initialize state if needed
    if (!musicStates.has(user.roomId)) {
      musicStates.set(user.roomId, {
        queue: [],
        current: null,
        isPlaying: false,
        startTime: 0
      });
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

    if (!musicStates.has(user.roomId)) {
      musicStates.set(user.roomId, {
        queue: [],
        current: null,
        isPlaying: false,
        startTime: 0
      });
    }

    const state = musicStates.get(user.roomId);
    const song = { videoId, title, thumbnail, duration, addedBy: user.username };

    if (!state.current) {
      playSong(user.roomId, song);
    } else {
      state.queue.push(song);
      io.to(user.roomId).emit('music:state', state);
      io.emit('rooms:update', getRoomState()); // Update bot presence
    }
  });

  socket.on('music:skip', () => {
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

  socket.on('music:stop', () => {
    const user = users.get(socket.id);
    if (!user || !user.roomId) return;
    stopMusic(user.roomId);
  });

  socket.on('music:sync', () => {
    const user = users.get(socket.id);
    if (!user || !user.roomId) return;
    const state = musicStates.get(user.roomId);
    if (state) {
      socket.emit('music:state', state);
    }
  });
});

function playSong(roomId, song) {
  const state = musicStates.get(roomId);
  if (!state) return;

  state.current = song;
  state.isPlaying = true;
  state.startTime = Date.now();
  state.pausedAt = null;

  io.to(roomId).emit('music:play', song);
  io.to(roomId).emit('music:state', state);
  io.emit('rooms:update', getRoomState()); // Ensure bot is shown
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
  io.emit('rooms:update', getRoomState()); // Remove bot
}

// ─── Start Server ────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🎙️  Voice Chat Server running at http://localhost:${PORT}`);
});
