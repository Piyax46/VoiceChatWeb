// ─── App Controller ───────────────────────────────────────────
// Manages UI state, Socket.IO connection, and user interactions

(function () {
    'use strict';

    // ─── DOM Elements ───────────────────────────────────────────
    const loginScreen = document.getElementById('login-screen');
    const loginForm = document.getElementById('login-form');
    const usernameInput = document.getElementById('username-input');
    const appEl = document.getElementById('app');
    const roomListEl = document.getElementById('room-list');
    const onlineCountEl = document.getElementById('online-count');
    const myAvatar = document.getElementById('my-avatar');
    const myAvatarLetter = document.getElementById('my-avatar-letter');
    const myUsername = document.getElementById('my-username');
    const myStatus = document.getElementById('my-status');
    const welcomeView = document.getElementById('welcome-view');
    const roomView = document.getElementById('room-view');
    const currentRoomName = document.getElementById('current-room-name');

    // Music Elements (Moved to top for scope visibility)
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
    const btnSkipMusic = document.getElementById('btn-skip-music');
    const btnStopMusic = document.getElementById('btn-stop-music');
    const btnTogglePlay = document.getElementById('btn-toggle-play');
    const iconPlay = document.getElementById('icon-play');
    const iconPause = document.getElementById('icon-pause');
    const volumeSlider = document.getElementById('music-volume');

    // Alert Modal Elements
    const alertModal = document.getElementById('alert-modal');
    const alertTitle = document.getElementById('alert-title');
    const alertMessage = document.getElementById('alert-message');
    const alertIcon = document.getElementById('alert-icon');
    const btnAlertOk = document.getElementById('btn-alert-ok');
    const btnAlertCancel = document.getElementById('btn-alert-cancel');
    const alertCard = document.querySelector('.alert-card');

    // ... (rest of variable declarations)

    // ─── Custom Alert System ────────────────────────────────────
    window.showAlert = function (title, message, type = 'info', onOk = null, onCancel = null) {
        alertTitle.textContent = title;
        alertMessage.textContent = message;

        // Reset classes
        alertCard.classList.remove('error', 'success');
        if (type === 'error') alertCard.classList.add('error');
        if (type === 'success') alertCard.classList.add('success');

        // Set Icon
        let iconHtml = '';
        if (type === 'error') {
            iconHtml = '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>';
        } else if (type === 'success') {
            iconHtml = '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>';
        } else {
            iconHtml = '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line>';
        }
        alertIcon.innerHTML = iconHtml;

        // Buttons
        if (onCancel) {
            btnAlertCancel.classList.remove('hidden');
            btnAlertCancel.onclick = () => {
                closeAlert();
                onCancel();
            };
        } else {
            btnAlertCancel.classList.add('hidden');
        }

        btnAlertOk.onclick = () => {
            closeAlert();
            if (onOk) onOk();
        };

        alertModal.classList.remove('hidden');
    };

    function closeAlert() {
        alertModal.classList.add('hidden');
    }

    // Custom Alert System is defined above.
    // Socket listeners will be attached in joinApp() where socket is initialized.

    const roomMembersEl = document.getElementById('room-members');
    const toastContainer = document.getElementById('toast-container');

    // Buttons
    const btnMute = document.getElementById('btn-mute');
    const btnDeafen = document.getElementById('btn-deafen');
    const btnDisconnect = document.getElementById('btn-disconnect');
    const btnMuteMain = document.getElementById('btn-mute-main');
    const btnDeafenMain = document.getElementById('btn-deafen-main');
    const btnLeave = document.getElementById('btn-leave');
    const btnShare = document.getElementById('btn-share');
    const btnVoicemod = document.getElementById('btn-voicemod');
    const voicemodModal = document.getElementById('voicemod-modal');
    const btnCloseVoicemod = document.getElementById('btn-close-voicemod');
    const effectBtns = document.querySelectorAll('.effect-btn');
    const currentEffectNameEl = document.getElementById('current-effect-name');

    // ─── State ──────────────────────────────────────────────────
    let socket = null;
    let voice = null;
    let currentUser = null;
    let currentRoomId = null;
    let roomsState = {};
    let userAvatarImage = null; // Base64 avatar image
    let isSharingScreen = false;

    // Music Player State (Restored)
    let player = null;
    let isMusicPanelOpen = false;
    let musicState = { queue: [], current: null, isPlaying: false, startTime: 0 };
    let progressInterval = null;

    const AVATAR_COLORS = [
        '#5865F2', '#57F287', '#FEE75C', '#EB459E', '#ED4245',
        '#3BA55C', '#FAA61A', '#F47B67', '#9B59B6', '#E91E63',
        '#00BCD4', '#FF9800', '#8BC34A', '#673AB7', '#2196F3'
    ];

    // ─── Login ──────────────────────────────────────────────────
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const username = usernameInput.value.trim();
        if (!username) return;
        joinApp(username);
    });

    async function joinApp(username) {
        // Connect to socket
        socket = io();

        socket.on('connect', () => {
            socket.emit('user:join', { username });
            if (window.setupMusicListeners) window.setupMusicListeners(socket);
        });

        socket.on('user:info', (user) => {
            currentUser = user;
            updateUserPanel();
            loginScreen.classList.add('hidden');
            appEl.classList.remove('hidden');
            showToast('🎙️', `ยินดีต้อนรับ ${user.username}!`, 'success');
        });

        // Room updates
        socket.on('rooms:update', (state) => {
            roomsState = state;
            renderRoomList();
            if (currentRoomId) {
                renderRoomMembers();
            }
        });

        // Online users
        socket.on('users:online', (users) => {
            onlineCountEl.textContent = `${users.length} Online`;
        });

        // Room joined
        socket.on('room:joined', async ({ roomId, peers }) => {
            currentRoomId = roomId;

            // Initialize voice engine
            voice = new VoiceEngine();
            const success = await voice.init();
            if (!success) {
                showToast('❌', 'ไม่สามารถเข้าถึงไมโครโฟนได้', 'error');
                socket.emit('room:leave');
                currentRoomId = null;
                return;
            }

            // Set speaking detection
            voice.onSpeaking((speaking) => {
                socket.emit('user:speaking', { speaking });
                updateMemberSpeaking(currentUser.id, speaking);
            });

            // Set video/screen share handling
            voice.onVideo((peerId, stream, isAdding) => {
                updateMemberVideo(peerId, stream, isAdding);
            });

            // Enable controls
            btnMute.disabled = false;
            btnDeafen.disabled = false;
            btnVoicemod.disabled = false;
            btnShare.disabled = false;
            btnDisconnect.classList.remove('hidden');

            // Connect to existing peers
            peers.forEach(peer => {
                voice.createPeerConnection(peer.id, socket, true);
            });

            // Show room view
            showRoomView(roomId);
            showToast('🔊', `เข้าร่วมห้อง ${roomsState[roomId]?.name || roomId}`, 'success');
        });

        // Room full
        socket.on('room:full', () => {
            showToast('⚠️', 'ห้องเต็มแล้ว', 'error');
        });

        // New peer joined
        socket.on('peer:joined', ({ peerId, username }) => {
            if (voice) {
                voice.createPeerConnection(peerId, socket, false);
            }
            showToast('👋', `${username} เข้าร่วมห้อง`, 'info');
        });

        // Peer left
        socket.on('peer:left', ({ peerId }) => {
            if (voice) {
                voice.removePeer(peerId);
            }
        });

        // WebRTC signaling
        socket.on('webrtc:offer', async ({ from, offer }) => {
            if (voice) {
                await voice.handleOffer(from, offer, socket);
            }
        });

        socket.on('webrtc:answer', async ({ from, answer }) => {
            if (voice) {
                await voice.handleAnswer(from, answer);
            }
        });

        socket.on('webrtc:ice-candidate', async ({ from, candidate }) => {
            if (voice) {
                await voice.handleIceCandidate(from, candidate);
            }
        });

        // Peer status updates
        socket.on('peer:mute', ({ peerId, muted }) => {
            updateMemberMute(peerId, muted);
        });

        socket.on('peer:deafen', ({ peerId, deafened }) => {
            updateMemberDeafen(peerId, deafened);
        });

        socket.on('peer:speaking', ({ peerId, speaking }) => {
            updateMemberSpeaking(peerId, speaking);
        });

        // Disconnect handling
        socket.on('disconnect', () => {
            showAlert('Connection Lost', 'You have been disconnected from the server. Trying to reconnect...', 'error');
        });

        socket.on('connect_error', () => {
            console.log("Connection Error");
        });

        socket.on('reconnect', () => {
            showToast('✅', 'Connected', 'success');
            socket.emit('user:join', { username: currentUser.username });
            // Close alert if open
            const alertModal = document.getElementById('alert-modal');
            if (alertModal) alertModal.classList.add('hidden');
        });
    }

    // ─── User Panel ─────────────────────────────────────────────
    function updateUserPanel() {
        if (!currentUser) return;
        myUsername.textContent = currentUser.username;
        myAvatarLetter.textContent = currentUser.username.charAt(0).toUpperCase();
        myAvatar.style.background = currentUser.avatarColor;
        myStatus.textContent = currentRoomId ? 'Voice Connected' : 'Online';

        if (userAvatarImage) {
            if (!myAvatar.querySelector('img')) {
                const img = document.createElement('img');
                img.src = userAvatarImage;
                myAvatar.appendChild(img);
            } else {
                myAvatar.querySelector('img').src = userAvatarImage;
            }
            myAvatarLetter.style.display = 'none';
        } else {
            const existingImg = myAvatar.querySelector('img');
            if (existingImg) existingImg.remove();
            myAvatarLetter.style.display = '';
        }
    }

    // Click user info to open profile editor
    document.querySelector('.user-info').addEventListener('click', () => {
        openProfileModal();
    });

    // ─── Profile Modal ─────────────────────────────────────────
    function openProfileModal() {
        // Remove existing modal
        const existing = document.querySelector('.modal-overlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
      <div class="modal-card">
        <h3 class="modal-title">👤 แก้ไขโปรไฟล์</h3>
        
        <div class="modal-avatar-section">
          <div class="modal-avatar-preview" id="modal-avatar-preview" style="background: ${currentUser.avatarColor}">
            ${userAvatarImage ? `<img src="${userAvatarImage}" />` : `<span>${currentUser.username.charAt(0).toUpperCase()}</span>`}
            <div class="avatar-edit-overlay">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
                <circle cx="12" cy="13" r="4"/>
              </svg>
            </div>
          </div>
          <input type="file" accept="image/*" class="avatar-file-input" id="avatar-file-input">
          <span class="color-picker-label">เลือกสีอวาตาร์ (ถ้าไม่ใช้รูป)</span>
          <div class="color-picker-grid" id="color-picker-grid">
            ${AVATAR_COLORS.map(c => `
              <div class="color-swatch ${c === currentUser.avatarColor ? 'selected' : ''}" 
                   data-color="${c}" 
                   style="background: ${c}"></div>
            `).join('')}
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
      </div>
    `;

        document.body.appendChild(overlay);

        // Avatar image upload
        const avatarPreview = overlay.querySelector('#modal-avatar-preview');
        const fileInput = overlay.querySelector('#avatar-file-input');

        avatarPreview.addEventListener('click', () => fileInput.click());

        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            if (file.size > 2 * 1024 * 1024) {
                showToast('⚠️', 'รูปภาพต้องมีขนาดไม่เกิน 2MB', 'error');
                return;
            }
            const reader = new FileReader();
            reader.onload = (ev) => {
                const imgData = ev.target.result;
                avatarPreview.innerHTML = `
          <img src="${imgData}" />
          <div class="avatar-edit-overlay">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
          </div>
        `;
                avatarPreview._pendingImage = imgData;
            };
            reader.readAsDataURL(file);
        });

        // Color swatches
        const swatches = overlay.querySelectorAll('.color-swatch');
        swatches.forEach(sw => {
            sw.addEventListener('click', () => {
                swatches.forEach(s => s.classList.remove('selected'));
                sw.classList.add('selected');
                avatarPreview.style.background = sw.dataset.color;
            });
        });

        // Cancel
        overlay.querySelector('#btn-modal-cancel').addEventListener('click', () => overlay.remove());

        // Click outside to close
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.remove();
        });

        // Save
        overlay.querySelector('#btn-modal-save').addEventListener('click', () => {
            const newUsername = overlay.querySelector('#modal-username').value.trim();
            const selectedColor = overlay.querySelector('.color-swatch.selected')?.dataset.color || currentUser.avatarColor;

            if (newUsername && newUsername !== currentUser.username) {
                currentUser.username = newUsername;
                // Re-emit user join with new name
                socket.emit('user:join', { username: newUsername });
            }

            currentUser.avatarColor = selectedColor;

            if (avatarPreview._pendingImage) {
                userAvatarImage = avatarPreview._pendingImage;
            }

            updateUserPanel();
            renderRoomList();
            if (currentRoomId) renderRoomMembers();
            overlay.remove();
            showToast('✅', 'อัปเดตโปรไฟล์แล้ว', 'success');
        });
    }

    // ─── Room List Rendering ────────────────────────────────────
    function renderRoomList() {
        roomListEl.innerHTML = '';

        Object.values(roomsState).forEach(room => {
            const item = document.createElement('div');
            item.className = `room-item ${currentRoomId === room.id ? 'active' : ''}`;

            const usersHtml = room.users.map(u => {
                const isSelf = u.id === currentUser?.id;
                const avatarContent = isSelf && userAvatarImage
                    ? `<img src="${userAvatarImage}" />`
                    : u.username.charAt(0).toUpperCase();

                let iconsHtml = '';
                if (u.deafened) {
                    iconsHtml = `<span class="deafened"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M3 18v-6a9 9 0 0114.88-6.82"/><path d="M21 12v6"/></svg></span>`;
                } else if (u.muted) {
                    iconsHtml = `<span class="muted"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6"/></svg></span>`;
                }

                return `
          <div class="room-user-item" data-user-id="${u.id}">
            <div class="room-user-avatar" style="background: ${isSelf ? currentUser.avatarColor : (u.avatarColor || '#5865F2')}" data-speaking-id="${u.id}">
              ${avatarContent}
            </div>
            <span class="room-user-name">${u.username}${isSelf ? ' (คุณ)' : ''}</span>
            <div class="room-user-icons">${iconsHtml}</div>
          </div>
        `;
            }).join('');

            item.innerHTML = `
        <div class="room-header-row">
          <span class="room-name">${room.name}</span>
          <span class="room-user-count">${room.users.length}/${room.maxUsers}</span>
        </div>
        ${room.users.length > 0 ? `<div class="room-users-list">${usersHtml}</div>` : ''}
      `;

            item.querySelector('.room-header-row').addEventListener('click', () => {
                if (currentRoomId === room.id) return;
                joinRoom(room.id);
            });

            roomListEl.appendChild(item);
        });
    }

    // ─── Join Room ──────────────────────────────────────────────
    function joinRoom(roomId) {
        if (currentRoomId) {
            leaveRoom();
        }
        socket.emit('room:join', { roomId });
    }

    // ─── Leave Room ─────────────────────────────────────────────
    function leaveRoom() {
        if (!currentRoomId) return;

        socket.emit('room:leave');
        if (voice) {
            voice.destroy();
            voice = null;
        }

        currentRoomId = null;
        btnMute.disabled = true;
        btnDeafen.disabled = true;
        btnVoicemod.disabled = true;

        // Reset share button
        if (isSharingScreen) {
            stopSharingUI();
        }
        btnShare.disabled = true;

        btnDisconnect.classList.add('hidden');
        resetMuteDeafenUI();

        // Hide music button and panel
        if (btnToggleMusic) btnToggleMusic.classList.add('hidden');
        if (musicPanel) {
            musicPanel.classList.add('hidden');
            isMusicPanelOpen = false;
        }

        showWelcomeView();
        updateUserPanel();
        showToast('👋', 'ออกจากห้องแล้ว', 'info');
    }

    // ─── Show Views ─────────────────────────────────────────────
    function showRoomView(roomId) {
        welcomeView.classList.add('hidden');
        roomView.classList.remove('hidden');

        const room = roomsState[roomId];
        if (room) {
            currentRoomName.textContent = room.name;
        }
        renderRoomMembers();
        renderRoomMembers();
        updateUserPanel();

        // Show Music Button
        if (btnToggleMusic) btnToggleMusic.classList.remove('hidden');
    }

    function showWelcomeView() {
        roomView.classList.add('hidden');
        welcomeView.classList.remove('hidden');
    }

    // ─── Room Members Rendering ─────────────────────────────────
    function renderRoomMembers() {
        if (!currentRoomId || !roomsState[currentRoomId]) return;

        const room = roomsState[currentRoomId];
        roomMembersEl.innerHTML = '';

        room.users.forEach(u => {
            const isSelf = u.id === currentUser?.id;
            const card = document.createElement('div');
            card.className = 'member-card';
            card.id = `member-${u.id}`;
            card.dataset.userId = u.id;

            if (u.muted) card.classList.add('muted');

            const avatarContent = isSelf && userAvatarImage
                ? `<img src="${userAvatarImage}" />`
                : u.username.charAt(0).toUpperCase();

            let statusIcons = '';
            if (u.deafened) {
                statusIcons += `<svg class="status-deafened" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="1" y1="1" x2="23" y2="23"/>
          <path d="M3 18v-6a9 9 0 0114.88-6.82"/>
          <path d="M21 12v6"/>
        </svg>`;
            } else if (u.muted) {
                statusIcons += `<svg class="status-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="1" y1="1" x2="23" y2="23"/>
          <path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6"/>
        </svg>`;
            }

            card.innerHTML = `
        <div class="member-avatar" style="background: ${isSelf ? currentUser.avatarColor : (u.avatarColor || '#5865F2')}">
          ${avatarContent}
        </div>
        <div class="member-info">
            <span class="member-name">${u.username}</span>
            ${!isSelf ? `<input type="range" class="user-volume-slider" min="0" max="1" step="0.1" value="1" title="Volume">` : ''}
        </div>
        ${isSelf ? '<span class="member-tag you">คุณ</span>' : ''}
        <div class="member-status">${statusIcons}</div>
      `;

            if (!isSelf) {
                const slider = card.querySelector('.user-volume-slider');
                slider.addEventListener('input', (e) => {
                    if (voice) voice.setPeerVolume(u.id, e.target.value);
                });
                // Prevent card click when sliding
                slider.addEventListener('click', (e) => e.stopPropagation());
            }

            roomMembersEl.appendChild(card);
        });
    }

    // ─── Update Specific Member States ──────────────────────────
    function updateMemberSpeaking(peerId, speaking) {
        // Update main room member card
        const card = document.getElementById(`member-${peerId}`);
        if (card) {
            if (speaking) {
                card.classList.add('speaking');
            } else {
                card.classList.remove('speaking');
            }
        }

        // Update sidebar avatar
        const sidebarAvatars = document.querySelectorAll(`[data-speaking-id="${peerId}"]`);
        sidebarAvatars.forEach(el => {
            if (speaking) {
                el.classList.add('speaking');
            } else {
                el.classList.remove('speaking');
            }
        });
    }

    function updateMemberMute(peerId, muted) {
        const card = document.getElementById(`member-${peerId}`);
        if (card) {
            if (muted) card.classList.add('muted');
            else card.classList.remove('muted');
        }
    }

    function updateMemberDeafen(peerId, deafened) {
        // Re-render to update icons
        renderRoomMembers();
        renderRoomList();
    }

    // ─── Mute / Deafen Controls ─────────────────────────────────
    function resetMuteDeafenUI() {
        // Sidebar buttons
        btnMute.classList.remove('muted');
        btnMute.querySelector('.icon-mic').classList.remove('hidden');
        btnMute.querySelector('.icon-mic-off').classList.add('hidden');

        btnDeafen.classList.remove('deafened');
        btnDeafen.querySelector('.icon-headphone').classList.remove('hidden');
        btnDeafen.querySelector('.icon-headphone-off').classList.add('hidden');

        // Main buttons
        btnMuteMain.classList.remove('muted');
        btnMuteMain.querySelector('.icon-mic').classList.remove('hidden');
        btnMuteMain.querySelector('.icon-mic-off').classList.add('hidden');

        btnDeafenMain.classList.remove('deafened');
        btnDeafenMain.querySelector('.icon-headphone').classList.remove('hidden');
        btnDeafenMain.querySelector('.icon-headphone-off').classList.add('hidden');
    }

    function toggleMute() {
        if (!voice) return;
        const muted = voice.toggleMute();
        socket.emit('user:mute', { muted });

        // Update sidebar mute btn
        btnMute.classList.toggle('muted', muted);
        btnMute.querySelector('.icon-mic').classList.toggle('hidden', muted);
        btnMute.querySelector('.icon-mic-off').classList.toggle('hidden', !muted);

        // Update main mute btn
        btnMuteMain.classList.toggle('muted', muted);
        btnMuteMain.querySelector('.icon-mic').classList.toggle('hidden', muted);
        btnMuteMain.querySelector('.icon-mic-off').classList.toggle('hidden', !muted);
    }

    function toggleDeafen() {
        if (!voice) return;
        const deafened = voice.toggleDeafen();
        socket.emit('user:deafen', { deafened });

        // Update sidebar deafen btn
        btnDeafen.classList.toggle('deafened', deafened);
        btnDeafen.querySelector('.icon-headphone').classList.toggle('hidden', deafened);
        btnDeafen.querySelector('.icon-headphone-off').classList.toggle('hidden', !deafened);

        // Update main deafen btn
        btnDeafenMain.classList.toggle('deafened', deafened);
        btnDeafenMain.querySelector('.icon-headphone').classList.toggle('hidden', deafened);
        btnDeafenMain.querySelector('.icon-headphone-off').classList.toggle('hidden', !deafened);

        // When deafened, also show mute state
        if (deafened) {
            btnMute.classList.add('muted');
            btnMute.querySelector('.icon-mic').classList.add('hidden');
            btnMute.querySelector('.icon-mic-off').classList.remove('hidden');
            btnMuteMain.classList.add('muted');
            btnMuteMain.querySelector('.icon-mic').classList.add('hidden');
            btnMuteMain.querySelector('.icon-mic-off').classList.remove('hidden');
        }
    }

    // Button event listeners
    btnMute.addEventListener('click', toggleMute);
    btnDeafen.addEventListener('click', toggleDeafen);
    btnDisconnect.addEventListener('click', leaveRoom);
    btnMuteMain.addEventListener('click', toggleMute);
    btnDeafenMain.addEventListener('click', toggleDeafen);
    btnLeave.addEventListener('click', leaveRoom);

    // ─── Toast Notifications ────────────────────────────────────
    function showToast(icon, message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `<span class="toast-icon">${icon}</span><span>${message}</span>`;
        toastContainer.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    // ─── Screen Sharing Logic ───────────────────────────────────

    btnShare.addEventListener('click', async () => {
        if (!voice) return;

        if (!isSharingScreen) {
            const stream = await voice.startScreenShare(socket);
            if (stream) {
                isSharingScreen = true;
                btnShare.classList.add('sharing');
                showToast('📺', 'เริ่มแชร์หน้าจอ', 'success');

                // Show local screen share
                updateMemberVideo(currentUser.id, stream, true);

                // Handle system stop (e.g. user clicks "Stop sharing" in browser UI)
                stream.getVideoTracks()[0].onended = () => {
                    stopSharingUI();
                };
            }
        } else {
            voice.stopScreenShare(socket);
            stopSharingUI();
        }
    });

    function stopSharingUI() {
        isSharingScreen = false;
        btnShare.classList.remove('sharing');
        updateMemberVideo(currentUser.id, null, false);
        showToast('⏹️', 'หยุดแชร์หน้าจอ', 'info');
    }

    // ─── VoiceMod Logic ─────────────────────────────────────────

    btnVoicemod.addEventListener('click', () => {
        voicemodModal.classList.remove('hidden');
    });

    btnCloseVoicemod.addEventListener('click', () => {
        voicemodModal.classList.add('hidden');
    });

    // Close on outside click
    voicemodModal.addEventListener('click', (e) => {
        if (e.target === voicemodModal) {
            voicemodModal.classList.add('hidden');
        }
    });

    effectBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const effect = btn.dataset.effect;
            const effectName = btn.querySelector('.effect-name').textContent;

            if (voice) {
                voice.setEffect(effect);

                // Update UI
                effectBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentEffectNameEl.textContent = effectName;

                // Toggle active state on main button
                if (effect === 'normal') {
                    btnVoicemod.classList.remove('active');
                } else {
                    btnVoicemod.classList.add('active');
                }

                showToast('🎤', `Changed voice to ${effectName}`, 'success');
            }
        });
    });

    // ─── Video UI Handling ──────────────────────────────────────
    function updateMemberVideo(peerId, stream, isAdding) {
        const card = document.getElementById(`member-${peerId}`);
        if (!card) return;

        if (isAdding && stream) {
            card.classList.add('has-video');

            // Check if video already exists
            let video = card.querySelector('video');
            if (!video) {
                video = document.createElement('video');
                video.autoplay = true;
                video.playsInline = true;
                if (peerId === currentUser.id) video.muted = true; // Mute self video

                // Click to toggle fullscreen
                video.style.cursor = 'pointer';
                video.title = 'Click to Fullscreen';
                video.addEventListener('click', () => {
                    if (document.fullscreenElement) {
                        document.exitFullscreen();
                    } else {
                        video.requestFullscreen().catch(err => {
                            console.warn('Error attempting to enable full-screen mode:', err);
                        });
                    }
                });

                card.prepend(video);
            }
            video.srcObject = stream;
        } else {
            card.classList.remove('has-video');
            const video = card.querySelector('video');
            if (video) {
                video.srcObject = null;
                video.remove();
            }
        }
    }

    // ─── Keyboard Shortcuts ─────────────────────────────────────
    document.addEventListener('keydown', (e) => {
        // M to toggle mute
        if (e.key === 'm' && !e.ctrlKey && !e.metaKey && document.activeElement.tagName !== 'INPUT') {
            toggleMute();
        }
        // D to toggle deafen
        if (e.key === 'd' && !e.ctrlKey && !e.metaKey && document.activeElement.tagName !== 'INPUT') {
            toggleDeafen();
        }
        // S to toggle screen share (New)
        if (e.key === 's' && !e.ctrlKey && !e.metaKey && document.activeElement.tagName !== 'INPUT') {
            if (btnShare && !btnShare.disabled) btnShare.click();
        }
        // Escape to close modal
        if (e.key === 'Escape') {
            const modal = document.querySelector('.modal-overlay');
            if (modal) modal.remove();
        }
    });


    // ─── Music Player Logic ─────────────────────────────────────

    // Variables moved to top scope for accessibility:
    // musicPanel, btnToggleMusic, btnCloseMusic, etc. are now defined at the top.

    // State is also defined at the top:
    // player, isMusicPanelOpen, musicState, progressInterval

    // ─── YouTube Player Setup ───────────────────────────────────
    window.onYouTubeIframeAPIReady = () => {
        player = new YT.Player('youtube-player', {
            height: '1',
            width: '1',
            videoId: '',
            playerVars: {
                'playsinline': 1,
                'controls': 0,
                'disablekb': 1,
                'autoplay': 1
            },
            events: {
                'onReady': onPlayerReady,
                'onStateChange': onPlayerStateChange,
                'onError': onPlayerError
            }
        });
    };

    function onPlayerReady(event) {
        console.log("YouTube Player Ready");
        player.setVolume(100);
        syncMusicPlayer();
    }

    function onPlayerError(event) {
        console.error("YouTube Player Error code:", event.data);
        let errorMsg = "Music Error";
        switch (event.data) {
            case 2: errorMsg = "Invalid Parameter"; break;
            case 5: errorMsg = "HTML5 Error"; break;
            case 100: errorMsg = "Video Not Found"; break;
            case 101:
            case 150: errorMsg = "Video Restricted (Copyright)"; break;
        }
        showToast('⚠️', errorMsg, 'error');
    }

    function onPlayerStateChange(event) {
        if (event.data === YT.PlayerState.ENDED) {
            // Song ended, tell server to play next
            // We only need one client to do this, but server handles dedup usually
            // Or typically the server handles timing, but for simple sync we can have clients report
            if (socket) socket.emit('music:ended');
        }
    }

    // ─── Music Layout & Events ──────────────────────────────────
    if (btnToggleMusic) {
        btnToggleMusic.addEventListener('click', () => {
            isMusicPanelOpen = !isMusicPanelOpen;
            if (isMusicPanelOpen) {
                musicPanel.classList.remove('hidden');
            } else {
                musicPanel.classList.add('hidden');
            }
        });
    }

    if (btnCloseMusic) {
        btnCloseMusic.addEventListener('click', () => {
            isMusicPanelOpen = false;
            musicPanel.classList.add('hidden');
        });
    }

    function searchMusic() {
        const query = musicSearchInput.value.trim();
        if (!query) return;
        if (socket) socket.emit('music:search', query);
    }

    if (btnSearchMusic) {
        btnSearchMusic.addEventListener('click', searchMusic);
    }

    if (musicSearchInput) {
        musicSearchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') searchMusic();
        });
    }

    // Play/Pause/Skip/Stop
    if (btnTogglePlay) {
        btnTogglePlay.addEventListener('click', () => {
            if (!player) return;
            const state = player.getPlayerState();
            if (state === YT.PlayerState.PLAYING) {
                if (socket) socket.emit('music:pause');
            } else {
                if (socket) socket.emit('music:resume');
            }
        });
    }

    if (btnSkipMusic) {
        btnSkipMusic.addEventListener('click', () => {
            if (socket) {
                socket.emit('music:skip');
                showToast('⏭️', 'Skipping...', 'info');
            }
        });
    }

    if (btnStopMusic) {
        btnStopMusic.addEventListener('click', () => {
            if (socket) socket.emit('music:stop');
        });
    }

    if (volumeSlider) {
        volumeSlider.addEventListener('input', (e) => {
            if (player && player.setVolume) {
                player.setVolume(e.target.value);
            }
        });
    }


    window.setupMusicListeners = (socketRef) => {
        socket = socketRef;

        socket.on('music:search-results', (results) => {
            renderSearchResults(results);
        });

        socket.on('music:error', (msg) => {
            showToast('⚠️', msg, 'error');
        });

        socket.on('music:state', (state) => {
            console.log('[Music] State received:', state);
            musicState = state;
            updateMusicUI();
            syncMusicPlayer();
        });

        socket.on('music:play', (song) => {
            showToast('🎵', `Playing: ${song.title}`, 'info');
            btnToggleMusic.classList.remove('hidden');
        });

        socket.on('music:stop', () => {
            if (player && player.stopVideo) player.stopVideo();
            musicState = { queue: [], current: null, isPlaying: false, startTime: 0 };
            updateMusicUI();
            showToast('🛑', 'Music Stopped', 'info');
        });
    };

    function syncMusicPlayer() {
        if (!player || !player.loadVideoById) {
            console.warn('[Music] Player not ready yet');
            return;
        }

        if (musicState.isPlaying && musicState.current) {
            const currentVideoData = player.getVideoData();
            // Calculate start time (handle negative drift)
            let startSeconds = (Date.now() - musicState.startTime) / 1000;
            if (startSeconds < 0) startSeconds = 0;

            // If different video, load it
            if (!currentVideoData || currentVideoData.video_id !== musicState.current.videoId) {
                console.log('[Music] Loading new video:', musicState.current.videoId, 'at', startSeconds);
                player.loadVideoById(musicState.current.videoId, startSeconds);
                return;
            } else {
                // Even if video ID matches, if we are in unstarted/cued state, we must ensure play
                const ps = player.getPlayerState();
                if (ps === -1 || ps === 5) { // -1 unstarted, 5 cued
                    player.loadVideoById(musicState.current.videoId, startSeconds);
                    return;
                }
            }

            // If same video but state mismatch
            const playerState = player.getPlayerState();
            if (playerState !== YT.PlayerState.PLAYING && playerState !== YT.PlayerState.BUFFERING) {
                console.log('[Music] Resuming video');
                player.playVideo();
            }

            // Sync time if drift > 2s
            const currentPlayerTime = player.getCurrentTime();
            if (Math.abs(startSeconds - currentPlayerTime) > 2) {
                console.log('[Music] Syncing time. Server:', startSeconds, 'Player:', currentPlayerTime);
                player.seekTo(startSeconds, true);
            }
        } else {
            // Not playing
            const playerState = player.getPlayerState();
            if (playerState === YT.PlayerState.PLAYING || playerState === YT.PlayerState.BUFFERING) {
                player.pauseVideo();
            }
        }
    }



    function renderSearchResults(results) {
        searchResults.innerHTML = '';
        if (!results || results.length === 0) {
            searchResults.classList.add('hidden');
            return;
        }

        searchResults.classList.remove('hidden');
        results.forEach(video => {
            const div = document.createElement('div');
            div.className = 'search-result-item';
            div.innerHTML = `
                <img src="${video.thumbnail}" alt="${video.title}">
                <div class="result-info">
                    <div class="result-title">${video.title}</div>
                    <div class="result-channel">${video.channelTitle}</div>
                </div>
            `;
            div.onclick = () => {
                // Optimistic play for requester (bypass Autoplay Policy)
                if (player && player.loadVideoById) {
                    // Add protection against re-loading the optimistically played video
                    if (!musicState.current || musicState.current.videoId !== video.videoId) {
                        player.loadVideoById(video.videoId);
                    }
                    player.playVideo();
                }
                socket.emit('music:play', { videoId: video.videoId, title: video.title, thumbnail: video.thumbnail });
                searchResults.classList.add('hidden');
                musicSearchInput.value = '';
            };
            searchResults.appendChild(div);
        });
    }

    function updateMusicUI() {
        // Queue
        queueList.innerHTML = '';
        if (musicState.queue) {
            musicState.queue.forEach((song, index) => {
                const div = document.createElement('div');
                div.className = 'queue-item';
                div.innerHTML = `
                    <span class="queue-index">${index + 1}</span>
                    <span class="queue-title">${song.title}</span>
                    <span class="queue-user">${song.addedBy}</span>
                `;
                queueList.appendChild(div);
            });
        }

        // Current Song
        if (musicState.current) {
            currentSongContainer.classList.remove('hidden');
            currentSongTitle.textContent = musicState.current.title;
            currentSongAddedBy.textContent = `Added by ${musicState.current.addedBy}`;
            currentSongImg.src = musicState.current.thumbnail || '';

            // Update Play/Pause Icon
            if (musicState.isPlaying) {
                iconPlay.classList.add('hidden');
                iconPause.classList.remove('hidden');
            } else {
                iconPlay.classList.remove('hidden');
                iconPause.classList.add('hidden');
            }

            // Start progress bar
            if (progressInterval) clearInterval(progressInterval);
            progressInterval = setInterval(() => {
                let elapsed = 0;
                if (musicState.isPlaying) {
                    elapsed = Date.now() - musicState.startTime;
                } else if (musicState.pausedAt) {
                    elapsed = musicState.pausedAt - musicState.startTime;
                } else {
                    return;
                }

                // Simple progress estimation
                const duration = musicState.current.duration || 0; // ms
                if (duration > 0) {
                    const percent = Math.min((elapsed / duration) * 100, 100);
                    songProgressBar.style.width = `${percent}%`;
                }
            }, 500);

        } else {
            currentSongContainer.classList.add('hidden');
            songProgressBar.style.width = '0%';
            if (progressInterval) clearInterval(progressInterval);
            // Default to pause icon hidden (or play visible)
            iconPlay.classList.remove('hidden');
            iconPause.classList.add('hidden');
        }
    }

})();
