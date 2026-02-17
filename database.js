const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, 'voicechat.db');
const db = new Database(DB_PATH);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─── Create Tables ───────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    avatar_data TEXT DEFAULT NULL,
    avatar_color TEXT DEFAULT '#5865F2',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT DEFAULT 'voice',
    max_users INTEGER DEFAULT 10,
    created_by INTEGER DEFAULT NULL,
    is_default INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER NOT NULL,
    receiver_id INTEGER DEFAULT NULL,
    room_id TEXT DEFAULT NULL,
    content TEXT DEFAULT '',
    file_url TEXT DEFAULT NULL,
    file_type TEXT DEFAULT NULL,
    file_name TEXT DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sender_id) REFERENCES users(id),
    FOREIGN KEY (receiver_id) REFERENCES users(id),
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_messages_dm ON messages(sender_id, receiver_id);
  CREATE INDEX IF NOT EXISTS idx_messages_room ON messages(room_id);
`);

// Migration: add file columns if they don't exist
try {
    db.exec(`ALTER TABLE messages ADD COLUMN file_url TEXT DEFAULT NULL`);
} catch (e) { /* column already exists */ }
try {
    db.exec(`ALTER TABLE messages ADD COLUMN file_type TEXT DEFAULT NULL`);
} catch (e) { /* column already exists */ }
try {
    db.exec(`ALTER TABLE messages ADD COLUMN file_name TEXT DEFAULT NULL`);
} catch (e) { /* column already exists */ }

// ─── Insert Default Rooms ────────────────────────────────────
const defaultRooms = [
    { id: 'general', name: '🔊 General', type: 'voice', maxUsers: 10 },
    { id: 'gaming', name: '🎮 Gaming', type: 'voice', maxUsers: 8 },
    { id: 'music', name: '🎵 Music Lounge', type: 'voice', maxUsers: 6 },
    { id: 'chill', name: '☕ Chill Zone', type: 'voice', maxUsers: 5 },
    { id: 'meeting', name: '📋 Meeting Room', type: 'voice', maxUsers: 12 },
    { id: 'party', name: '🎉 Party', type: 'voice', maxUsers: 15 },
];

const insertRoom = db.prepare(`
  INSERT OR IGNORE INTO rooms (id, name, type, max_users, is_default) VALUES (?, ?, ?, ?, 1)
`);

defaultRooms.forEach(r => {
    insertRoom.run(r.id, r.name, r.type, r.maxUsers);
});

// ─── User Functions ──────────────────────────────────────────

function createUser(username, password) {
    const hash = bcrypt.hashSync(password, 10);
    try {
        const stmt = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)');
        const result = stmt.run(username, hash);
        return { id: result.lastInsertRowid, username };
    } catch (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
            return null; // Username already exists
        }
        throw err;
    }
}

function findUserByUsername(username) {
    return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
}

function findUserById(id) {
    return db.prepare('SELECT id, username, avatar_data, avatar_color, created_at FROM users WHERE id = ?').get(id);
}

function verifyPassword(password, hash) {
    return bcrypt.compareSync(password, hash);
}

function updateUserProfile(userId, { username, avatarData, avatarColor }) {
    const user = findUserById(userId);
    if (!user) return null;

    const newUsername = username || user.username;
    const newAvatarData = avatarData !== undefined ? avatarData : user.avatar_data;
    const newAvatarColor = avatarColor || user.avatar_color;

    try {
        db.prepare(`
      UPDATE users SET username = ?, avatar_data = ?, avatar_color = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(newUsername, newAvatarData, newAvatarColor, userId);

        return findUserById(userId);
    } catch (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
            return null; // Username taken
        }
        throw err;
    }
}

// ─── Room Functions ──────────────────────────────────────────

function getAllRooms() {
    return db.prepare('SELECT * FROM rooms ORDER BY is_default DESC, created_at ASC').all();
}

function createRoom(id, name, type, maxUsers, createdBy) {
    try {
        db.prepare(`
      INSERT INTO rooms (id, name, type, max_users, created_by, is_default) VALUES (?, ?, ?, ?, ?, 0)
    `).run(id, name, type, maxUsers, createdBy);
        return db.prepare('SELECT * FROM rooms WHERE id = ?').get(id);
    } catch (err) {
        return null;
    }
}

function deleteRoom(roomId, userId) {
    const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(roomId);
    if (!room) return { error: 'Room not found' };
    if (room.is_default) return { error: 'Cannot delete default rooms' };
    if (room.created_by !== userId) return { error: 'Not the owner' };

    db.prepare('DELETE FROM rooms WHERE id = ?').run(roomId);
    return { success: true };
}

function getRoomById(roomId) {
    return db.prepare('SELECT * FROM rooms WHERE id = ?').get(roomId);
}

// ─── Message Functions ───────────────────────────────────────

function saveMessage(senderId, content, { receiverId = null, roomId = null, fileUrl = null, fileType = null, fileName = null }) {
    const stmt = db.prepare(`
    INSERT INTO messages (sender_id, receiver_id, room_id, content, file_url, file_type, file_name) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
    const result = stmt.run(senderId, receiverId, roomId, content || '', fileUrl, fileType, fileName);
    return {
        id: result.lastInsertRowid,
        sender_id: senderId,
        receiver_id: receiverId,
        room_id: roomId,
        content: content || '',
        file_url: fileUrl,
        file_type: fileType,
        file_name: fileName,
        created_at: new Date().toISOString()
    };
}

function getDirectMessages(userId1, userId2, limit = 50, offset = 0) {
    return db.prepare(`
    SELECT m.*, u.username as sender_username, u.avatar_data as sender_avatar, u.avatar_color as sender_color
    FROM messages m
    JOIN users u ON m.sender_id = u.id
    WHERE (m.sender_id = ? AND m.receiver_id = ?) OR (m.sender_id = ? AND m.receiver_id = ?)
    ORDER BY m.created_at DESC LIMIT ? OFFSET ?
  `).all(userId1, userId2, userId2, userId1, limit, offset).reverse();
}

function getRoomMessages(roomId, limit = 50, offset = 0) {
    return db.prepare(`
    SELECT m.*, u.username as sender_username, u.avatar_data as sender_avatar, u.avatar_color as sender_color
    FROM messages m
    JOIN users u ON m.sender_id = u.id
    WHERE m.room_id = ?
    ORDER BY m.created_at DESC LIMIT ? OFFSET ?
  `).all(roomId, limit, offset).reverse();
}

module.exports = {
    db,
    createUser,
    findUserByUsername,
    findUserById,
    verifyPassword,
    updateUserProfile,
    getAllRooms,
    createRoom,
    deleteRoom,
    getRoomById,
    saveMessage,
    getDirectMessages,
    getRoomMessages
};
