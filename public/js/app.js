// ─── App Controller ───────────────────────────────────────────
// Manages UI state, Socket.IO connection, and user interactions

(function () {
    'use strict';

    // ─── DOM Elements ───────────────────────────────────────────
    const authScreen = document.getElementById('auth-screen');
    const appEl = document.getElementById('app');
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const loginError = document.getElementById('login-error');
    const registerError = document.getElementById('register-error');
    const authTabs = document.querySelectorAll('.auth-tab');

    const voiceRoomListEl = document.getElementById('voice-room-list');
    const textRoomListEl = document.getElementById('text-room-list');
    const roomMembersEl = document.getElementById('room-members');
    const welcomeView = document.getElementById('welcome-view');
    const roomView = document.getElementById('room-view');
    const chatView = document.getElementById('chat-view');
    const currentRoomName = document.getElementById('current-room-name');
    const onlineCountEl = document.getElementById('online-count');
    const myAvatar = document.getElementById('my-avatar');
    const myAvatarLetter = document.getElementById('my-avatar-letter');
    const myUsername = document.getElementById('my-username');
    const myStatus = document.getElementById('my-status');

    const btnMute = document.getElementById('btn-mute');
    const btnDeafen = document.getElementById('btn-deafen');
    const btnVoicemod = document.getElementById('btn-voicemod');
    const btnDisconnect = document.getElementById('btn-disconnect');
    const btnMuteMain = document.getElementById('btn-mute-main');
    const btnDeafenMain = document.getElementById('btn-deafen-main');
    const btnShare = document.getElementById('btn-share');
    const btnLeave = document.getElementById('btn-leave');

    const voicemodModal = document.getElementById('voicemod-modal');
    const btnCloseVoicemod = document.getElementById('btn-close-voicemod');
    const effectBtns = document.querySelectorAll('.effect-btn');
    const currentEffectNameEl = document.getElementById('current-effect-name');

    const musicPanel = document.getElementById('music-panel');
    const btnToggleMusic = document.getElementById('btn-toggle-music');
    const btnCloseMusic = document.getElementById('btn-close-music');
    const musicSearchInput = document.getElementById('music-search-input');
    const btnSearchMusic = document.getElementById('btn-search-music');
    const searchResults = document.getElementById('search-results');
    const queueList = document.getElementById('queue-list');
    const currentSongContainer = document.getElementById('current-song-container');
    const currentSongImg = document.getElementById('current-song-img');
    const currentSongTitle = document.getElementById('current-song-title');
    const currentSongAddedBy = document.getElementById('current-song-added-by');
    const songProgressBar = document.getElementById('song-progress-bar');
    const btnTogglePlay = document.getElementById('btn-toggle-play');
    const btnSkipMusic = document.getElementById('btn-skip-music');
    const btnStopMusic = document.getElementById('btn-stop-music');
    const volumeSlider = document.getElementById('music-volume');
    const toastContainer = document.getElementById('toast-container');

    const alertModal = document.getElementById('alert-modal');
    const alertTitle = document.getElementById('alert-title');
    const alertMessage = document.getElementById('alert-message');
    const alertIcon = document.getElementById('alert-icon');
    const btnAlertOk = document.getElementById('btn-alert-ok');
    const btnAlertCancel = document.getElementById('btn-alert-cancel');

    const chatMessages = document.getElementById('chat-messages');
    const chatInput = document.getElementById('chat-input');
    const btnSendMessage = document.getElementById('btn-send-message');
    const chatHeaderName = document.getElementById('chat-header-name');
    const chatHeaderIcon = document.getElementById('chat-header-icon');
    const onlineUsersList = document.getElementById('online-users-list');

    const createRoomModal = document.getElementById('create-room-modal');
    const btnAddVoiceRoom = document.getElementById('btn-add-voice-room');
    const btnAddTextRoom = document.getElementById('btn-add-text-room');
    const btnCancelRoom = document.getElementById('btn-cancel-room');
    const btnCreateRoom = document.getElementById('btn-create-room');
    const roomTypeBtns = document.querySelectorAll('.room-type-btn');

    // ─── Custom Alert System ────────────────────────────────────
    function showAlert(title, message, type = 'info', onOk = null, onCancel = null) {
        alertTitle.textContent = title;
        alertMessage.textContent = message;
        let iconPath = '';
        switch (type) {
            case 'success': iconPath = '<circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4"/>'; break;
            case 'error': iconPath = '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>'; break;
            case 'warning': iconPath = '<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>'; break;
            default: iconPath = '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>'; break;
        }
        alertIcon.innerHTML = iconPath;
        if (onCancel) { btnAlertCancel.classList.remove('hidden'); } else { btnAlertCancel.classList.add('hidden'); }
        alertModal.classList.remove('hidden');
        btnAlertOk.onclick = () => { closeAlert(); if (onOk) onOk(); };
        if (onCancel) btnAlertCancel.onclick = () => { closeAlert(); onCancel(); };
    }

    function closeAlert() { alertModal.classList.add('hidden'); }

    // ─── State ──────────────────────────────────────────────────
    let socket = null;
    let voice = null;
    let currentUser = null;
    let currentRoomId = null;
    let currentChatTarget = null; // { type: 'dm', userId, username } or { type: 'room', roomId, roomName }
    let roomsState = {};
    let onlineUsers = [];
    let isSharingScreen = false;

    let player = null;
    let isMusicPanelOpen = false;
    let musicState = { queue: [], current: null, isPlaying: false, startTime: 0 };

    const AVATAR_COLORS = [
        '#5865F2', '#57F287', '#FEE75C', '#EB459E', '#ED4245',
        '#3BA55C', '#FAA61A', '#F47B67', '#9B59B6', '#E91E63',
        '#00BCD4', '#FF9800', '#8BC34A', '#673AB7', '#2196F3'
    ];

    // ─── Auth Tabs ──────────────────────────────────────────────
    authTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            authTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            if (tab.dataset.tab === 'login') {
                loginForm.classList.remove('hidden');
                registerForm.classList.add('hidden');
            } else {
                loginForm.classList.add('hidden');
                registerForm.classList.remove('hidden');
            }
        });
    });

    // ─── Auto Login Check ───────────────────────────────────────
    (async function checkAuth() {
        try {
            const res = await fetch('/api/me');
            if (res.ok) {
                const data = await res.json();
                currentUser = data.user;
                startApp();
            }
        } catch (e) { /* Not logged in */ }
    })();

    // ─── Login ──────────────────────────────────────────────────
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        loginError.classList.add('hidden');
        const username = document.getElementById('login-username').value.trim();
        const password = document.getElementById('login-password').value;
        const rememberMe = document.getElementById('login-remember').checked;
        if (!username || !password) return;
        try {
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password, rememberMe })
            });
            const data = await res.json();
            if (!res.ok) {
                loginError.textContent = data.error;
                loginError.classList.remove('hidden');
                return;
            }
            currentUser = data.user;
            startApp();
        } catch (err) {
            loginError.textContent = 'เกิดข้อผิดพลาด กรุณาลองใหม่';
            loginError.classList.remove('hidden');
        }
    });

    // ─── Register ───────────────────────────────────────────────
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        registerError.classList.add('hidden');
        const username = document.getElementById('register-username').value.trim();
        const password = document.getElementById('register-password').value;
        const confirm = document.getElementById('register-confirm').value;
        if (!username || !password) return;
        if (password !== confirm) {
            registerError.textContent = 'รหัสผ่านไม่ตรงกัน';
            registerError.classList.remove('hidden');
            return;
        }
        try {
            const res = await fetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();
            if (!res.ok) {
                registerError.textContent = data.error;
                registerError.classList.remove('hidden');
                return;
            }
            currentUser = data.user;
            startApp();
        } catch (err) {
            registerError.textContent = 'เกิดข้อผิดพลาด กรุณาลองใหม่';
            registerError.classList.remove('hidden');
        }
    });

    // ─── Start App (after auth) ─────────────────────────────────
    function startApp() {
        authScreen.classList.add('hidden');
        appEl.classList.remove('hidden');
        updateUserPanel();
        connectSocket();
    }

    function connectSocket() {
        socket = io({ transports: ['websocket', 'polling'] });

        socket.on('connect', () => {
            socket.emit('user:join', {
                userId: currentUser.id,
                username: currentUser.username,
                avatarColor: currentUser.avatarColor,
                avatarData: currentUser.avatarData
            });
            if (window.setupMusicListeners) window.setupMusicListeners(socket);
        });

        socket.on('user:info', (user) => {
            currentUser.socketId = user.id;
        });

        socket.on('rooms:update', (state) => {
            roomsState = state;
            renderRoomList();
            if (currentRoomId) renderRoomMembers();
        });

        socket.on('users:online', (list) => {
            onlineUsers = list;
            if (onlineCountEl) onlineCountEl.textContent = `${list.length} Online`;
            renderOnlineUsers();
        });

        socket.on('room:joined', async ({ roomId, peers }) => {
            currentRoomId = roomId;
            showRoomView(roomId);
            btnMute.disabled = false;
            btnDeafen.disabled = false;
            btnVoicemod.disabled = false;
            btnShare.disabled = false;
            btnDisconnect.classList.remove('hidden');

            voice = new VoiceEngine();
            const ok = await voice.init();
            if (!ok) {
                showAlert('ข้อผิดพลาด', 'ไม่สามารถเข้าถึงไมโครโฟนได้', 'error');
                return;
            }
            voice.onSpeaking((speaking) => {
                socket.emit('user:speaking', { speaking });
                updateMemberSpeaking(currentUser.socketId, speaking);
            });
            voice.onVideo((peerId, stream, isAdding) => {
                updateMemberVideo(peerId, stream, isAdding);
            });

            peers.forEach(peer => {
                voice.createPeerConnection(peer.id, socket, true);
            });

            // Request music sync
            socket.emit('music:sync');

            showToast('🔊', 'เข้าร่วมห้องเสียงแล้ว', 'success');
        });

        socket.on('room:full', () => showToast('⚠️', 'ห้องเต็มแล้ว', 'error'));
        socket.on('room:kicked', ({ reason }) => {
            leaveRoom();
            showToast('⚠️', reason, 'warning');
        });

        socket.on('peer:joined', ({ peerId, username }) => {
            if (voice) voice.createPeerConnection(peerId, socket, false);
            showToast('👋', `${username} เข้าร่วมห้อง`, 'info');
        });

        socket.on('peer:left', ({ peerId }) => {
            if (voice) voice.removePeer(peerId);
            updateMemberVideo(peerId, null, false);
        });

        socket.on('webrtc:offer', ({ from, offer }) => { if (voice) voice.handleOffer(from, offer, socket); });
        socket.on('webrtc:answer', ({ from, answer }) => { if (voice) voice.handleAnswer(from, answer); });
        socket.on('webrtc:ice-candidate', ({ from, candidate }) => { if (voice) voice.handleIceCandidate(from, candidate); });
        socket.on('peer:speaking', ({ peerId, speaking }) => updateMemberSpeaking(peerId, speaking));
        socket.on('peer:mute', ({ peerId, muted }) => updateMemberMute(peerId, muted));
        socket.on('peer:deafen', () => { renderRoomMembers(); renderRoomList(); });

        socket.on('user:profile-changed', ({ socketId, username, avatarColor, avatarData }) => {
            renderRoomList();
            if (currentRoomId) renderRoomMembers();
            renderOnlineUsers();
        });

        // Messaging
        socket.on('message:receive', (msg) => {
            if (currentChatTarget) {
                if (currentChatTarget.type === 'dm' &&
                    (msg.sender_id === currentChatTarget.userId || msg.receiver_id === currentChatTarget.userId)) {
                    appendMessage(msg);
                } else if (currentChatTarget.type === 'room' && msg.room_id === currentChatTarget.roomId) {
                    appendMessage(msg);
                }
            }
            // Show notification if not viewing this chat
            if (!currentChatTarget ||
                (currentChatTarget.type === 'dm' && msg.sender_id !== currentChatTarget.userId && msg.sender_id !== currentUser.id)) {
                showToast('💬', `${msg.sender_username}: ${msg.content.slice(0, 30)}`, 'info');
            }
        });

        socket.on('disconnect', () => {
            showAlert('ขาดการเชื่อมต่อ', 'กำลังเชื่อมต่อใหม่...', 'warning');
        });
        socket.on('reconnect', () => {
            showToast('✅', 'เชื่อมต่อแล้ว', 'success');
            socket.emit('user:join', { userId: currentUser.id, username: currentUser.username, avatarColor: currentUser.avatarColor, avatarData: currentUser.avatarData });
            closeAlert();
        });
    }

    // ─── User Panel ─────────────────────────────────────────────
    function updateUserPanel() {
        if (!currentUser) return;
        myUsername.textContent = currentUser.username;
        myAvatarLetter.textContent = currentUser.username.charAt(0).toUpperCase();
        myAvatar.style.background = currentUser.avatarColor || '#5865F2';
        myStatus.textContent = currentRoomId ? 'Voice Connected' : 'Online';
        if (currentUser.avatarData) {
            let img = myAvatar.querySelector('img');
            if (!img) { img = document.createElement('img'); myAvatar.appendChild(img); }
            img.src = currentUser.avatarData;
            myAvatarLetter.style.display = 'none';
        } else {
            const img = myAvatar.querySelector('img');
            if (img) img.remove();
            myAvatarLetter.style.display = '';
        }
    }

    document.querySelector('.user-info').addEventListener('click', openProfileModal);

    // ─── Profile Modal ─────────────────────────────────────────
    function openProfileModal() {
        const existing = document.getElementById('profile-modal-overlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.id = 'profile-modal-overlay';
        overlay.innerHTML = `
      <div class="modal-card">
        <h3 class="modal-title">👤 แก้ไขโปรไฟล์</h3>
        <div class="modal-avatar-section">
          <div class="modal-avatar-preview" id="modal-avatar-preview" style="background: ${currentUser.avatarColor || '#5865F2'}">
            ${currentUser.avatarData ? `<img src="${currentUser.avatarData}" />` : `<span>${currentUser.username.charAt(0).toUpperCase()}</span>`}
            <div class="avatar-edit-overlay">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
            </div>
          </div>
          <input type="file" accept="image/*" class="avatar-file-input" id="avatar-file-input">
          <span class="color-picker-label">เลือกสีอวาตาร์ (ถ้าไม่ใช้รูป)</span>
          <div class="color-picker-grid" id="color-picker-grid">
            ${AVATAR_COLORS.map(c => `<div class="color-swatch ${c === currentUser.avatarColor ? 'selected' : ''}" data-color="${c}" style="background: ${c}"></div>`).join('')}
          </div>
        </div>
        <div class="modal-field">
          <label>ชื่อผู้ใช้</label>
          <input type="text" id="modal-username" value="${currentUser.username}" maxlength="20" autocomplete="off">
        </div>
        <div class="modal-actions">
          <button class="btn-modal btn-modal-cancel" id="btn-modal-cancel">ยกเลิก</button>
          <button class="btn-modal btn-modal-save" id="btn-modal-save">บันทึก</button>
        </div>
      </div>`;
        document.body.appendChild(overlay);

        const avatarPreview = overlay.querySelector('#modal-avatar-preview');
        const fileInput = overlay.querySelector('#avatar-file-input');
        avatarPreview.addEventListener('click', () => fileInput.click());

        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            if (file.size > 2 * 1024 * 1024) { showToast('⚠️', 'รูปต้องไม่เกิน 2MB', 'error'); return; }
            resizeImage(file, 128, (dataUrl) => {
                avatarPreview.innerHTML = `<img src="${dataUrl}" /><div class="avatar-edit-overlay"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg></div>`;
                avatarPreview._pendingImage = dataUrl;
            });
        });

        const swatches = overlay.querySelectorAll('.color-swatch');
        swatches.forEach(sw => {
            sw.addEventListener('click', () => {
                swatches.forEach(s => s.classList.remove('selected'));
                sw.classList.add('selected');
                avatarPreview.style.background = sw.dataset.color;
            });
        });

        overlay.querySelector('#btn-modal-cancel').addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

        overlay.querySelector('#btn-modal-save').addEventListener('click', async () => {
            const newUsername = overlay.querySelector('#modal-username').value.trim();
            const selectedColor = overlay.querySelector('.color-swatch.selected')?.dataset.color || currentUser.avatarColor;
            const avatarData = avatarPreview._pendingImage !== undefined ? avatarPreview._pendingImage : currentUser.avatarData;

            try {
                const res = await fetch('/api/profile', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: newUsername, avatarColor: selectedColor, avatarData })
                });
                const data = await res.json();
                if (!res.ok) { showToast('⚠️', data.error, 'error'); return; }
                currentUser = data.user;
                updateUserPanel();
                socket.emit('user:profile-update', { username: currentUser.username, avatarColor: currentUser.avatarColor, avatarData: currentUser.avatarData });
                renderRoomList();
                if (currentRoomId) renderRoomMembers();
                overlay.remove();
                showToast('✅', 'อัปเดตโปรไฟล์แล้ว', 'success');
            } catch (err) { showToast('⚠️', 'เกิดข้อผิดพลาด', 'error'); }
        });
    }

    // Resize image to fixed size before storing
    function resizeImage(file, maxSize, callback) {
        const reader = new FileReader();
        reader.onload = (ev) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = maxSize;
                canvas.height = maxSize;
                const ctx = canvas.getContext('2d');
                const size = Math.min(img.width, img.height);
                const sx = (img.width - size) / 2;
                const sy = (img.height - size) / 2;
                ctx.drawImage(img, sx, sy, size, size, 0, 0, maxSize, maxSize);
                callback(canvas.toDataURL('image/webp', 0.8));
            };
            img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
    }

    // Helper: render avatar HTML
    function avatarHTML(user, size) {
        const bg = user.avatarColor || '#5865F2';
        if (user.avatarData) {
            return `<div class="avatar-circle" style="background:${bg};width:${size}px;height:${size}px"><img src="${user.avatarData}"/></div>`;
        }
        return `<div class="avatar-circle" style="background:${bg};width:${size}px;height:${size}px"><span>${(user.username || 'U').charAt(0).toUpperCase()}</span></div>`;
    }

    // ─── Room List Rendering ────────────────────────────────────
    function renderRoomList() {
        if (!voiceRoomListEl || !textRoomListEl) return;
        voiceRoomListEl.innerHTML = '';
        textRoomListEl.innerHTML = '';

        Object.values(roomsState).forEach(room => {
            const isVoice = (room.type || 'voice') === 'voice';
            const targetEl = isVoice ? voiceRoomListEl : textRoomListEl;
            const item = document.createElement('div');
            item.className = `room-item ${currentRoomId === room.id ? 'active' : ''}`;
            if (currentChatTarget && currentChatTarget.type === 'room' && currentChatTarget.roomId === room.id) {
                item.classList.add('active');
            }

            const usersHtml = (room.users || []).map(u => {
                const isSelf = u.id === currentUser?.socketId;
                const avatarSrc = (isSelf && currentUser.avatarData) ? currentUser.avatarData : u.avatarData;
                const avatarContent = avatarSrc ? `<img src="${avatarSrc}" />` : (u.username || 'U').charAt(0).toUpperCase();
                const color = isSelf ? (currentUser.avatarColor || '#5865F2') : (u.avatarColor || '#5865F2');
                let iconsHtml = '';
                if (u.deafened) iconsHtml = `<span class="deafened"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M3 18v-6a9 9 0 0114.88-6.82"/><path d="M21 12v6"/></svg></span>`;
                else if (u.muted) iconsHtml = `<span class="muted"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6"/></svg></span>`;
                return `<div class="room-user-item" data-user-id="${u.id}"><div class="room-user-avatar" style="background:${color}" data-speaking-id="${u.id}">${avatarContent}</div><span class="room-user-name">${u.username}${isSelf ? ' (คุณ)' : ''}</span><div class="room-user-icons">${iconsHtml}</div></div>`;
            }).join('');

            const deleteBtn = (!room.isDefault && room.createdBy === currentUser?.id) ? `<button class="btn-delete-room" data-room-id="${room.id}" title="ลบห้อง">×</button>` : '';

            item.innerHTML = `
                <div class="room-header-row">
                    <span class="room-name">${room.name}</span>
                    <span class="room-user-count">${(room.users || []).length}/${room.maxUsers}</span>
                    ${deleteBtn}
                </div>
                ${(room.users || []).length > 0 && isVoice ? `<div class="room-users-list">${usersHtml}</div>` : ''}
            `;

            item.querySelector('.room-header-row').addEventListener('click', () => {
                if (isVoice) {
                    if (currentRoomId === room.id) return;
                    joinRoom(room.id);
                } else {
                    openRoomChat(room.id, room.name);
                }
            });

            const delBtn = item.querySelector('.btn-delete-room');
            if (delBtn) {
                delBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    deleteCustomRoom(delBtn.dataset.roomId);
                });
            }

            targetEl.appendChild(item);
        });
    }

    // ─── Join / Leave Room ──────────────────────────────────────
    function joinRoom(roomId) {
        resumeAudioContext();
        if (currentRoomId) leaveRoom();
        socket.emit('room:join', { roomId });
    }

    function leaveRoom() {
        if (!currentRoomId) return;
        socket.emit('room:leave');
        if (voice) { voice.destroy(); voice = null; }
        currentRoomId = null;
        btnMute.disabled = true; btnDeafen.disabled = true; btnVoicemod.disabled = true;
        if (isSharingScreen) stopSharingUI();
        btnShare.disabled = true;
        btnDisconnect.classList.add('hidden');
        resetMuteDeafenUI();
        if (btnToggleMusic) btnToggleMusic.classList.add('hidden');
        if (musicPanel) { musicPanel.classList.add('hidden'); isMusicPanelOpen = false; }
        showWelcomeView();
        updateUserPanel();
        showToast('👋', 'ออกจากห้องแล้ว', 'info');
    }

    // ─── Show Views ─────────────────────────────────────────────
    function showRoomView(roomId) {
        welcomeView.classList.add('hidden');
        chatView.classList.add('hidden');
        roomView.classList.remove('hidden');
        const room = roomsState[roomId];
        if (room) currentRoomName.textContent = room.name;
        renderRoomMembers();
        updateUserPanel();
        if (btnToggleMusic) btnToggleMusic.classList.remove('hidden');
    }

    function showWelcomeView() {
        roomView.classList.add('hidden');
        chatView.classList.add('hidden');
        welcomeView.classList.remove('hidden');
    }

    function showChatView() {
        roomView.classList.add('hidden');
        welcomeView.classList.add('hidden');
        chatView.classList.remove('hidden');
    }

    // ─── Room Members ───────────────────────────────────────────
    function renderRoomMembers() {
        if (!currentRoomId || !roomsState[currentRoomId]) return;
        const room = roomsState[currentRoomId];
        roomMembersEl.innerHTML = '';

        room.users.forEach(u => {
            const isSelf = u.id === currentUser?.socketId;
            const card = document.createElement('div');
            card.className = 'member-card';
            card.id = `member-${u.id}`;
            if (u.muted) card.classList.add('muted');

            const avatarSrc = (isSelf && currentUser.avatarData) ? currentUser.avatarData : u.avatarData;
            const avatarContent = avatarSrc ? `<img src="${avatarSrc}" />` : (u.username || 'U').charAt(0).toUpperCase();
            const color = isSelf ? (currentUser.avatarColor || '#5865F2') : (u.avatarColor || '#5865F2');

            let statusIcons = '';
            if (u.deafened) statusIcons = `<svg class="status-deafened" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M3 18v-6a9 9 0 0114.88-6.82"/><path d="M21 12v6"/></svg>`;
            else if (u.muted) statusIcons = `<svg class="status-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6"/></svg>`;

            const volumeHtml = !isSelf ? `
                <div class="volume-control-wrapper">
                    <button class="btn-peer-mute" data-peer="${u.id}" title="Mute user">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                            <path d="M15.54 8.46a5 5 0 010 7.07"></path>
                        </svg>
                    </button>
                    <input type="range" class="user-volume-slider" min="0" max="100" value="100" data-peer="${u.id}">
                    <span class="volume-label">100%</span>
                </div>` : '';

            card.innerHTML = `
                <div class="member-avatar" style="background:${color}">${avatarContent}</div>
                <div class="member-info">
                    <span class="member-name">${u.username}</span>
                    ${volumeHtml}
                </div>
                ${isSelf ? '<span class="member-tag you">คุณ</span>' : ''}
                <div class="member-status">${statusIcons}</div>
            `;

            if (!isSelf) {
                const slider = card.querySelector('.user-volume-slider');
                const label = card.querySelector('.volume-label');
                const muteBtn = card.querySelector('.btn-peer-mute');
                if (slider) {
                    slider.addEventListener('input', (e) => {
                        const vol = parseInt(e.target.value);
                        if (voice) voice.setPeerVolume(u.id, vol / 100);
                        if (label) label.textContent = vol + '%';
                    });
                    slider.addEventListener('click', (e) => e.stopPropagation());
                }
                if (muteBtn) {
                    muteBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const isNowMuted = muteBtn.classList.toggle('peer-muted');
                        if (voice) voice.setPeerVolume(u.id, isNowMuted ? 0 : (slider ? slider.value / 100 : 1));
                        if (slider) slider.disabled = isNowMuted;
                    });
                }
            }
            roomMembersEl.appendChild(card);
        });
    }

    function updateMemberSpeaking(peerId, speaking) {
        const card = document.getElementById(`member-${peerId}`);
        if (card) card.classList.toggle('speaking', speaking);
        document.querySelectorAll(`[data-speaking-id="${peerId}"]`).forEach(el => el.classList.toggle('speaking', speaking));
    }
    function updateMemberMute(peerId, muted) {
        const card = document.getElementById(`member-${peerId}`);
        if (card) card.classList.toggle('muted', muted);
    }

    // ─── Mute / Deafen ──────────────────────────────────────────
    function resetMuteDeafenUI() {
        [btnMute, btnMuteMain].forEach(b => { if (b) { b.classList.remove('muted'); b.querySelector('.icon-mic')?.classList.remove('hidden'); b.querySelector('.icon-mic-off')?.classList.add('hidden'); } });
        [btnDeafen, btnDeafenMain].forEach(b => { if (b) { b.classList.remove('deafened'); b.querySelector('.icon-headphone')?.classList.remove('hidden'); b.querySelector('.icon-headphone-off')?.classList.add('hidden'); } });
    }

    function toggleMute() {
        if (!voice) return;
        const muted = voice.toggleMute();
        socket.emit('user:mute', { muted });
        [btnMute, btnMuteMain].forEach(b => { if (b) { b.classList.toggle('muted', muted); b.querySelector('.icon-mic')?.classList.toggle('hidden', muted); b.querySelector('.icon-mic-off')?.classList.toggle('hidden', !muted); } });
    }

    function toggleDeafen() {
        if (!voice) return;
        const deafened = voice.toggleDeafen();
        socket.emit('user:deafen', { deafened });
        [btnDeafen, btnDeafenMain].forEach(b => { if (b) { b.classList.toggle('deafened', deafened); b.querySelector('.icon-headphone')?.classList.toggle('hidden', deafened); b.querySelector('.icon-headphone-off')?.classList.toggle('hidden', !deafened); } });
        if (deafened) {
            [btnMute, btnMuteMain].forEach(b => { if (b) { b.classList.add('muted'); b.querySelector('.icon-mic')?.classList.add('hidden'); b.querySelector('.icon-mic-off')?.classList.remove('hidden'); } });
        }
    }

    btnMute.addEventListener('click', toggleMute);
    btnDeafen.addEventListener('click', toggleDeafen);
    btnDisconnect.addEventListener('click', leaveRoom);
    btnMuteMain.addEventListener('click', toggleMute);
    btnDeafenMain.addEventListener('click', toggleDeafen);
    btnLeave.addEventListener('click', leaveRoom);

    // ─── Toast ──────────────────────────────────────────────────
    function showToast(icon, message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `<span class="toast-icon">${icon}</span><span>${message}</span>`;
        toastContainer.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    // ─── Screen Share ───────────────────────────────────────────
    btnShare.addEventListener('click', async () => {
        if (!voice) return;
        if (!isSharingScreen) {
            const stream = await voice.startScreenShare(socket);
            if (stream) {
                isSharingScreen = true;
                btnShare.classList.add('sharing');
                showToast('📺', 'เริ่มแชร์หน้าจอ', 'success');
                updateMemberVideo(currentUser.socketId, stream, true);
                stream.getVideoTracks()[0].onended = () => stopSharingUI();
            }
        } else {
            voice.stopScreenShare(socket);
            stopSharingUI();
        }
    });

    function stopSharingUI() {
        isSharingScreen = false;
        btnShare.classList.remove('sharing');
        updateMemberVideo(currentUser.socketId, null, false);
        showToast('⏹️', 'หยุดแชร์หน้าจอ', 'info');
    }

    // ─── VoiceMod ───────────────────────────────────────────────
    btnVoicemod.addEventListener('click', () => voicemodModal.classList.remove('hidden'));
    btnCloseVoicemod.addEventListener('click', () => voicemodModal.classList.add('hidden'));
    voicemodModal.addEventListener('click', (e) => { if (e.target === voicemodModal) voicemodModal.classList.add('hidden'); });

    effectBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            if (!voice) return;
            voice.setEffect(btn.dataset.effect);
            effectBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentEffectNameEl.textContent = btn.querySelector('.effect-name').textContent;
            btnVoicemod.classList.toggle('active', btn.dataset.effect !== 'normal');
            showToast('🎤', `เปลี่ยนเสียงเป็น ${btn.querySelector('.effect-name').textContent}`, 'success');
        });
    });

    // ─── Video UI ───────────────────────────────────────────────
    function updateMemberVideo(peerId, stream, isAdding) {
        const card = document.getElementById(`member-${peerId}`);
        if (!card) return;
        if (isAdding && stream) {
            card.classList.add('has-video');
            let video = card.querySelector('video');
            if (!video) {
                video = document.createElement('video');
                video.autoplay = true; video.playsInline = true;
                video.controls = true; // Enable native controls for reliability
                if (peerId === currentUser.socketId) video.muted = true;
                video.title = 'Double-click for Fullscreen';

                // Toggle fullscreen on double click to avoid conflict with controls
                video.addEventListener('dblclick', async () => {
                    try {
                        if (document.fullscreenElement) {
                            await document.exitFullscreen();
                        } else {
                            await video.requestFullscreen();
                        }
                    } catch (err) {
                        console.error('[Video] Fullscreen error:', err);
                        showToast('⚠️', 'Fullscreen error', 'error');
                    }
                });
                card.prepend(video);
            }
            video.srcObject = stream;
        } else {
            card.classList.remove('has-video');
            const video = card.querySelector('video');
            if (video) { video.srcObject = null; video.remove(); }
        }
    }

    // ─── Online Users Panel ─────────────────────────────────────
    function renderOnlineUsers() {
        if (!onlineUsersList) return;
        onlineUsersList.innerHTML = '';
        onlineUsers.forEach(u => {
            const isSelf = u.visitorId === currentUser?.id;
            const item = document.createElement('div');
            item.className = 'online-user-item';
            const avatarSrc = isSelf ? (currentUser.avatarData || u.avatarData) : u.avatarData;
            const letter = (u.username || 'U').charAt(0).toUpperCase();
            const displayName = isSelf ? `${u.username} (คุณ)` : u.username;
            item.innerHTML = `
                <div class="online-user-avatar" style="background:${u.avatarColor || '#5865F2'}">
                    ${avatarSrc ? `<img src="${avatarSrc}" />` : letter}
                    <div class="online-indicator"></div>
                </div>
                <div class="online-user-info">
                    <span class="online-user-name">${displayName}</span>
                    <span class="online-user-status">${u.roomId ? '🔊 ในห้องเสียง' : 'ออนไลน์'}</span>
                </div>
            `;
            if (!isSelf) {
                item.addEventListener('click', () => {
                    if (u.visitorId) openDM(u.visitorId, u.username);
                });
                item.style.cursor = 'pointer';
            }
            onlineUsersList.appendChild(item);
        });
    }

    // ─── Direct Messaging ───────────────────────────────────────
    async function openDM(userId, username) {
        currentChatTarget = { type: 'dm', userId, username };
        chatHeaderIcon.textContent = '💬';
        chatHeaderName.textContent = username;
        showChatView();
        chatMessages.innerHTML = '<div class="chat-loading">กำลังโหลด...</div>';
        try {
            const res = await fetch(`/api/messages/dm/${userId}`);
            const data = await res.json();
            chatMessages.innerHTML = '';
            (data.messages || []).forEach(msg => appendMessage(msg));
            chatMessages.scrollTop = chatMessages.scrollHeight;
        } catch (e) { chatMessages.innerHTML = '<div class="chat-loading">ไม่สามารถโหลดข้อความได้</div>'; }
    }

    async function openRoomChat(roomId, roomName) {
        currentChatTarget = { type: 'room', roomId, roomName };
        chatHeaderIcon.textContent = '💬';
        chatHeaderName.textContent = roomName;
        showChatView();
        renderRoomList();
        chatMessages.innerHTML = '<div class="chat-loading">กำลังโหลด...</div>';
        try {
            const res = await fetch(`/api/messages/room/${roomId}`);
            const data = await res.json();
            chatMessages.innerHTML = '';
            (data.messages || []).forEach(msg => appendMessage(msg));
            chatMessages.scrollTop = chatMessages.scrollHeight;
        } catch (e) { chatMessages.innerHTML = '<div class="chat-loading">ไม่สามารถโหลดข้อความได้</div>'; }
    }

    function appendMessage(msg) {
        const div = document.createElement('div');
        const isSelf = msg.sender_id === currentUser?.id;
        div.className = `chat-message ${isSelf ? 'self' : ''}`;
        const time = new Date(msg.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
        div.innerHTML = `
            <div class="msg-avatar" style="background:${msg.sender_color || '#5865F2'}">
                ${msg.sender_avatar ? `<img src="${msg.sender_avatar}" />` : (msg.sender_username || 'U').charAt(0).toUpperCase()}
            </div>
            <div class="msg-content">
                <div class="msg-header">
                    <span class="msg-author">${msg.sender_username}</span>
                    <span class="msg-time">${time}</span>
                </div>
                <div class="msg-text">${escapeHTML(msg.content)}</div>
            </div>
        `;
        chatMessages.appendChild(div);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function escapeHTML(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function sendMessage() {
        if (!chatInput || !currentChatTarget || !socket) return;
        const content = chatInput.value.trim();
        if (!content) return;
        if (currentChatTarget.type === 'dm') {
            socket.emit('message:send', { receiverId: currentChatTarget.userId, content });
        } else if (currentChatTarget.type === 'room') {
            socket.emit('message:send', { roomId: currentChatTarget.roomId, content });
        }
        chatInput.value = '';
    }

    if (btnSendMessage) btnSendMessage.addEventListener('click', sendMessage);
    if (chatInput) chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });

    // ─── Create / Delete Room ───────────────────────────────────
    let pendingRoomType = 'voice';

    function openCreateRoomModal(type) {
        pendingRoomType = type;
        createRoomModal.classList.remove('hidden');
        roomTypeBtns.forEach(b => b.classList.toggle('active', b.dataset.type === type));
    }

    btnAddVoiceRoom.addEventListener('click', () => openCreateRoomModal('voice'));
    btnAddTextRoom.addEventListener('click', () => openCreateRoomModal('text'));
    btnCancelRoom.addEventListener('click', () => createRoomModal.classList.add('hidden'));
    createRoomModal.addEventListener('click', (e) => { if (e.target === createRoomModal) createRoomModal.classList.add('hidden'); });

    roomTypeBtns.forEach(b => {
        b.addEventListener('click', () => {
            pendingRoomType = b.dataset.type;
            roomTypeBtns.forEach(x => x.classList.toggle('active', x === b));
        });
    });

    btnCreateRoom.addEventListener('click', async () => {
        const name = document.getElementById('new-room-name').value.trim();
        const maxUsers = document.getElementById('new-room-max').value;
        if (!name) { showToast('⚠️', 'กรุณาใส่ชื่อห้อง', 'error'); return; }
        try {
            const res = await fetch('/api/rooms', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, type: pendingRoomType, maxUsers })
            });
            const data = await res.json();
            if (!res.ok) { showToast('⚠️', data.error, 'error'); return; }
            createRoomModal.classList.add('hidden');
            document.getElementById('new-room-name').value = '';
            showToast('✅', 'สร้างห้องสำเร็จ', 'success');
        } catch (e) { showToast('⚠️', 'เกิดข้อผิดพลาด', 'error'); }
    });

    async function deleteCustomRoom(roomId) {
        showAlert('ลบห้อง', 'คุณแน่ใจหรือไม่ว่าต้องการลบห้องนี้?', 'warning', async () => {
            try {
                const res = await fetch(`/api/rooms/${roomId}`, { method: 'DELETE' });
                if (res.ok) showToast('✅', 'ลบห้องแล้ว', 'success');
                else { const d = await res.json(); showToast('⚠️', d.error, 'error'); }
            } catch (e) { showToast('⚠️', 'เกิดข้อผิดพลาด', 'error'); }
        }, () => { });
    }

    // ─── Keyboard Shortcuts ─────────────────────────────────────
    document.addEventListener('keydown', (e) => {
        if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;
        if (e.key === 'm' && !e.ctrlKey) toggleMute();
        if (e.key === 'd' && !e.ctrlKey) toggleDeafen();
        if (e.key === 's' && !e.ctrlKey && btnShare && !btnShare.disabled) btnShare.click();
        if (e.key === 'Escape') {
            const modal = document.querySelector('.modal-overlay:not(.hidden)');
            if (modal && !modal.id?.includes('alert')) modal.classList.add('hidden');
        }
    });

    // ─── Audio Unlock (Autoplay Policy) ─────────────────────────
    function resumeAudioContext() {
        if (!player || typeof player.getPlayerState !== 'function') return;

        // Always try to unmute
        if (player.unMute) player.unMute();

        const state = player.getPlayerState();
        // Only force play if we are supposedly playing but player is paused/cued/unstarted
        // Do NOT restart if buffering (3) or already playing (1)
        if (musicState.isPlaying && (state === YT.PlayerState.PAUSED || state === YT.PlayerState.CUED || state === -1)) {
            player.playVideo();
        }

        // Hide unmute button if audio context is likely resumed
        const btn = document.getElementById('btn-force-unmute');
        if (btn) btn.classList.add('hidden');
    }

    document.addEventListener('click', resumeAudioContext, { once: false });
    document.addEventListener('keydown', resumeAudioContext, { once: false });
    document.addEventListener('touchstart', resumeAudioContext, { once: false }); // Add touch support

    function showUnmuteButton() {
        let btn = document.getElementById('btn-force-unmute');
        if (!btn) {
            btn = document.createElement('button');
            btn.id = 'btn-force-unmute';
            btn.className = 'btn-floating-music rule-z-index-9999';
            btn.style.bottom = '90px'; // Position above music toggle
            btn.style.background = '#ED4245'; // Red to catch attention
            btn.innerHTML = '🔇';
            btn.title = 'Click to Unmute Music';
            btn.addEventListener('click', () => {
                resumeAudioContext();
                btn.classList.add('hidden');
                showToast('🔊', 'Music Unmuted', 'success');
            });
            document.body.appendChild(btn);
        }
        btn.classList.remove('hidden');
    }


    // ─── Music Player Logic ─────────────────────────────────────
    window.onYouTubeIframeAPIReady = () => {
        console.log('[YouTube] API Ready');
        player = new YT.Player('youtube-player', {
            height: '100%', width: '100%', videoId: '',
            playerVars: {
                playsinline: 1,
                controls: 0,
                disablekb: 1,
                autoplay: 1,
                enablejsapi: 1,
                origin: window.location.origin
            },
            events: { onReady: onPlayerReady, onStateChange: onPlayerStateChange, onError: onPlayerError }
        });
    };

    function onPlayerReady() { player.setVolume(100); syncMusicPlayer(); }
    function onPlayerError(event) {
        const msgs = { 2: 'Invalid Parameter', 5: 'HTML5 Error', 100: 'Video Not Found', 101: 'Copyright Restricted', 150: 'Copyright Restricted' };
        const msg = msgs[event.data] || 'Unknown Error';
        console.error('[YouTube] Player Error:', event.data, msg);
        showToast('⚠️', `Music Error: ${msg} (${event.data})`, 'error');
    }
    function onPlayerStateChange(event) {
        if (event.data === YT.PlayerState.ENDED && socket) socket.emit('music:ended');
    }

    if (btnToggleMusic) btnToggleMusic.addEventListener('click', () => { isMusicPanelOpen = !isMusicPanelOpen; musicPanel.classList.toggle('hidden', !isMusicPanelOpen); });
    if (btnCloseMusic) btnCloseMusic.addEventListener('click', () => { isMusicPanelOpen = false; musicPanel.classList.add('hidden'); });

    function searchMusic() { const q = musicSearchInput.value.trim(); if (q && socket) socket.emit('music:search', q); }
    if (btnSearchMusic) btnSearchMusic.addEventListener('click', searchMusic);
    if (musicSearchInput) musicSearchInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') searchMusic(); });

    if (btnTogglePlay) btnTogglePlay.addEventListener('click', () => {
        if (!player || !socket) return;
        socket.emit(player.getPlayerState() === YT.PlayerState.PLAYING ? 'music:pause' : 'music:resume');
    });
    if (btnSkipMusic) btnSkipMusic.addEventListener('click', () => { if (socket) { socket.emit('music:skip'); showToast('⏭️', 'Skipping...', 'info'); } });
    if (btnStopMusic) btnStopMusic.addEventListener('click', () => { if (socket) socket.emit('music:stop'); });
    if (volumeSlider) volumeSlider.addEventListener('input', (e) => { if (player?.setVolume) player.setVolume(e.target.value); });

    window.setupMusicListeners = (s) => {
        socket = s;
        socket.on('music:search-results', renderSearchResults);
        socket.on('music:error', (msg) => showToast('⚠️', msg, 'error'));
        socket.on('music:state', (state) => { musicState = state; updateMusicUI(); syncMusicPlayer(); });
        socket.on('music:play', (song) => { showToast('🎵', `Playing: ${song.title}`, 'info'); btnToggleMusic?.classList.remove('hidden'); });
        socket.on('music:stop', () => {
            if (player?.stopVideo) player.stopVideo();
            musicState = { queue: [], current: null, isPlaying: false, startTime: 0 };
            updateMusicUI(); showToast('🛑', 'Music Stopped', 'info');
        });
    };

    function syncMusicPlayer() {
        if (!player || typeof player.loadVideoById !== 'function') return;

        if (musicState.isPlaying && musicState.current) {
            const currentTime = Math.max(0, (Date.now() - musicState.startTime) / 1000);
            const currentVideoData = player.getVideoData();
            const playerState = player.getPlayerState();

            // Load new video if needed
            if (!currentVideoData || currentVideoData.video_id !== musicState.current.videoId) {
                console.log('[Music] Loading new video:', musicState.current.title);
                player.loadVideoById({
                    videoId: musicState.current.videoId,
                    startSeconds: currentTime
                });
                return;
            }

            // Sync time if drift > 2s
            if (Math.abs(currentTime - player.getCurrentTime()) > 2) {
                console.log('[Music] Syncing time. Drift:', Math.abs(currentTime - player.getCurrentTime()));
                player.seekTo(currentTime, true);
            }

            // Force play if state is not playing/buffering
            if (playerState !== YT.PlayerState.PLAYING && playerState !== YT.PlayerState.BUFFERING) {
                console.log('[Music] Force playing. Current state:', playerState);
                player.playVideo();

                // If still unstarted (-1) after trying to play, browser might be blocking
                // We show the Unmute button to request user interaction
                if (playerState === -1 || playerState === YT.PlayerState.CUED) {
                    showUnmuteButton();
                }
            }

            // Check if muted by browser policy
            if (player.isMuted() || player.getVolume() === 0) {
                // Try to unmute automatically first
                player.unMute();
                player.setVolume(100);
                if (player.isMuted()) showUnmuteButton();
            }
        } else {
            const playerState = player.getPlayerState();
            if (playerState === YT.PlayerState.PLAYING || playerState === YT.PlayerState.BUFFERING) {
                player.pauseVideo();
            }
        }
    }

    function renderSearchResults(results) {
        searchResults.classList.remove('hidden');
        searchResults.innerHTML = results.map(r => `
            <div class="search-result-item" data-video-id="${r.videoId}">
                <img src="${r.thumbnail}" class="result-thumb" alt="">
                <div class="result-info"><div class="result-title">${r.title}</div><div class="result-channel">${r.channelTitle} • ${r.duration}</div></div>
                <button class="btn-add-song">+</button>
            </div>
        `).join('');
        searchResults.querySelectorAll('.btn-add-song').forEach((btn, i) => {
            btn.addEventListener('click', () => {
                if (socket) socket.emit('music:add', results[i]);
                showToast('🎵', `Added: ${results[i].title.slice(0, 30)}`, 'success');
            });
        });
    }

    function updateMusicUI() {
        if (musicState.current) {
            currentSongContainer.classList.remove('hidden');
            currentSongImg.src = musicState.current.thumbnail || '';
            currentSongTitle.textContent = musicState.current.title;
            currentSongAddedBy.textContent = `Added by ${musicState.current.addedBy}`;
        } else {
            currentSongContainer.classList.add('hidden');
        }
        queueList.innerHTML = (musicState.queue || []).map((s, i) => `
            <div class="queue-item"><span class="queue-pos">${i + 1}</span><span class="queue-title">${s.title}</span><span class="queue-by">${s.addedBy}</span></div>
        `).join('') || '<div class="queue-empty">คิวว่าง</div>';
    }

    // ─── Screen Picker Logic (Electron) ─────────────────────────
    const screenPickerModal = document.getElementById('screen-picker-modal');
    const screenSourceList = document.getElementById('screen-source-list');
    const btnCloseScreenPicker = document.getElementById('btn-close-screen-picker');

    if (screenPickerModal && btnCloseScreenPicker) {
        btnCloseScreenPicker.addEventListener('click', () => {
            screenPickerModal.classList.add('hidden');
        });
    }

    if (window.electronAPI) {
        window.electronAPI.onGetScreenSources((sources) => {
            if (!screenPickerModal || !screenSourceList) return;

            screenSourceList.innerHTML = '';
            sources.forEach(source => {
                const item = document.createElement('div');
                item.className = 'screen-source-item';
                item.innerHTML = `
                    <div class="source-preview">
                        <img src="${source.thumbnail}" />
                    </div>
                    <div class="source-name">${source.name}</div>
                `;
                item.addEventListener('click', () => {
                    window.electronAPI.selectScreenSource(source.id);
                    screenPickerModal.classList.add('hidden');
                });
                screenSourceList.appendChild(item);
            });
            screenPickerModal.classList.remove('hidden');
        });
    }

})();
