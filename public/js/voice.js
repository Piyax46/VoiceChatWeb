// ─── Voice Engine (WebRTC) ─────────────────────────────────────
// Handles peer connections, audio streams, screen sharing, and speaking detection

class VoiceEngine {
    constructor() {
        this.localStream = null;
        this.localScreenStream = null;
        this.peers = new Map(); // peerId -> { pc, stream, audioEl, screenSender }
        this.audioContext = null;
        this.analyser = null;
        this.isMuted = false;
        this.isDeafened = false;
        this.isSpeaking = false;
        this.speakingCallback = null;
        this.videoCallback = null;
        this.speakingCheckInterval = null;

        // Optimal audio constraints for voice chat
        this.audioConstraints = {
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                sampleRate: 48000,
                channelCount: 1,
                latency: 0,
                sampleSize: 16
            },
            video: false
        };

        // ICE servers
        this.iceServers = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' },
                { urls: 'stun:stun3.l.google.com:19302' },
                { urls: 'stun:stun4.l.google.com:19302' }
            ]
        };
    }

    // Initialize local audio stream
    async init() {
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia(this.audioConstraints);
            this.setupSpeakingDetection();
            console.log('[Voice] Local stream initialized');
            return true;
        } catch (err) {
            console.error('[Voice] Failed to get microphone:', err);
            return false;
        }
    }

    // Set up speaking detection
    setupSpeakingDetection() {
        if (!this.localStream) return;

        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const source = this.audioContext.createMediaStreamSource(this.localStream);
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 512;
            this.analyser.smoothingTimeConstant = 0.4;
            source.connect(this.analyser);

            const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
            let speakingFrames = 0;
            let silentFrames = 0;
            const SPEAKING_THRESHOLD = 15;
            const SPEAKING_FRAMES_REQUIRED = 3;
            const SILENT_FRAMES_REQUIRED = 10;

            this.speakingCheckInterval = setInterval(() => {
                if (this.isMuted || !this.analyser) {
                    if (this.isSpeaking) {
                        this.isSpeaking = false;
                        if (this.speakingCallback) this.speakingCallback(false);
                    }
                    return;
                }

                this.analyser.getByteFrequencyData(dataArray);
                let sum = 0;
                for (let i = 0; i < dataArray.length; i++) {
                    sum += dataArray[i];
                }
                const avg = sum / dataArray.length;

                if (avg > SPEAKING_THRESHOLD) {
                    speakingFrames++;
                    silentFrames = 0;
                    if (!this.isSpeaking && speakingFrames >= SPEAKING_FRAMES_REQUIRED) {
                        this.isSpeaking = true;
                        if (this.speakingCallback) this.speakingCallback(true);
                    }
                } else {
                    silentFrames++;
                    speakingFrames = 0;
                    if (this.isSpeaking && silentFrames >= SILENT_FRAMES_REQUIRED) {
                        this.isSpeaking = false;
                        if (this.speakingCallback) this.speakingCallback(false);
                    }
                }
            }, 50);
        } catch (e) {
            console.error("[Voice] Error setting up audio context:", e);
        }
    }

    // Callbacks
    onSpeaking(callback) {
        this.speakingCallback = callback;
    }

    onVideo(callback) {
        this.videoCallback = callback;
    }

    // ─── Screen Sharing ───────────────────────────────────────────

    async startScreenShare(socket) {
        try {
            this.localScreenStream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: false
            });

            const videoTrack = this.localScreenStream.getVideoTracks()[0];

            // Handle user stopping share via browser UI
            videoTrack.onended = () => {
                this.stopScreenShare(socket);
                // Dispatch custom event or callback if needed to update UI button state
                window.dispatchEvent(new CustomEvent('screenshare:ended'));
            };

            // Add track to all existing peers
            this.peers.forEach((peerData, peerId) => {
                if (peerData.pc) {
                    try {
                        const sender = peerData.pc.addTrack(videoTrack, this.localScreenStream);
                        peerData.screenSender = sender;
                        this.createOffer(peerId, socket);
                    } catch (e) {
                        console.error(`[Voice] Failed to add screen track to ${peerId}`, e);
                    }
                }
            });

            return this.localScreenStream;
        } catch (err) {
            console.error('[Voice] Screen share error:', err);
            return null;
        }
    }

    stopScreenShare(socket) {
        if (!this.localScreenStream) return;

        // Stop tracks
        this.localScreenStream.getTracks().forEach(track => track.stop());
        this.localScreenStream = null;

        // Remove tracks from peers
        this.peers.forEach((peerData, peerId) => {
            if (peerData.pc && peerData.screenSender) {
                try {
                    peerData.pc.removeTrack(peerData.screenSender);
                } catch (e) {
                    console.warn("[Voice] Error removing track", e);
                }
                peerData.screenSender = null;
                this.createOffer(peerId, socket);
            }
        });

        return true;
    }

    // ─── Peer Connection ──────────────────────────────────────────

    createPeerConnection(peerId, socket, isInitiator = false) {
        if (this.peers.has(peerId)) {
            return this.peers.get(peerId).pc;
        }

        const pc = new RTCPeerConnection(this.iceServers);

        // Add local audio
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                pc.addTrack(track, this.localStream);
            });
        }

        // Add local screen if sharing
        if (this.localScreenStream) {
            this.localScreenStream.getTracks().forEach(track => {
                // We'll capture sender later if needed, but for initial sync it's fine
                pc.addTrack(track, this.localScreenStream);
            });
        }

        // Negotiation
        pc.addEventListener('negotiationneeded', async () => {
            if (!isInitiator) return;
            try {
                const offer = await pc.createOffer();
                offer.sdp = this.enhanceAudioSDP(offer.sdp);
                await pc.setLocalDescription(offer);
                socket.emit('webrtc:offer', { to: peerId, offer: pc.localDescription });
            } catch (err) {
                console.error('[Voice] Offer error:', err);
            }
        });

        // ICE
        pc.addEventListener('icecandidate', (event) => {
            if (event.candidate) {
                socket.emit('webrtc:ice-candidate', { to: peerId, candidate: event.candidate });
            }
        });

        // Tracks
        pc.addEventListener('track', (event) => {
            const remoteStream = event.streams[0];
            const track = event.track;

            const peerData = this.peers.get(peerId);
            if (peerData) {
                if (track.kind === 'audio') {
                    peerData.stream = remoteStream;
                    this.playRemoteAudio(peerId, remoteStream);
                } else if (track.kind === 'video') {
                    // Screen share received
                    if (this.videoCallback) {
                        this.videoCallback(peerId, remoteStream, true);
                    }

                    // Clean up when video ends
                    track.onended = () => {
                        if (this.videoCallback) this.videoCallback(peerId, null, false);
                    };

                    remoteStream.onremovetrack = () => {
                        setTimeout(() => {
                            if (remoteStream.getVideoTracks().length === 0) {
                                if (this.videoCallback) this.videoCallback(peerId, null, false);
                            }
                        }, 100);
                    };
                }
            }
        });

        pc.addEventListener('connectionstatechange', () => {
            if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
                this.removePeer(peerId);
            }
        });

        // Store peer data
        const peerData = { pc, stream: null, audioEl: null, screenSender: null };

        // Capture screen sender if we added tracks initially
        if (this.localScreenStream) {
            pc.getSenders().forEach(sender => {
                if (sender.track && sender.track.kind === 'video') {
                    peerData.screenSender = sender;
                }
            });
        }

        this.peers.set(peerId, peerData);

        if (isInitiator) {
            this.createOffer(peerId, socket);
        }

        return pc;
    }

    // Enhance SDP
    enhanceAudioSDP(sdp) {
        return sdp.replace(
            /a=fmtp:111 /g,
            'a=fmtp:111 maxaveragebitrate=128000;stereo=0;sprop-stereo=0;useinbandfec=1;usedtx=0;'
        );
    }

    // Offer/Answer handling
    async createOffer(peerId, socket) {
        const peerData = this.peers.get(peerId);
        if (!peerData) return;
        try {
            const offer = await peerData.pc.createOffer();
            offer.sdp = this.enhanceAudioSDP(offer.sdp);
            await peerData.pc.setLocalDescription(offer);
            socket.emit('webrtc:offer', { to: peerId, offer: peerData.pc.localDescription });
        } catch (err) {
            console.error('[Voice] Create offer error:', err);
        }
    }

    async handleOffer(peerId, offer, socket) {
        let peerData = this.peers.get(peerId);
        if (!peerData) {
            this.createPeerConnection(peerId, socket, false);
            peerData = this.peers.get(peerId);
        }
        try {
            if (peerData.pc.signalingState !== "stable") {
                await Promise.all([
                    peerData.pc.setLocalDescription({ type: "rollback" }),
                    peerData.pc.setRemoteDescription(new RTCSessionDescription(offer))
                ]);
            } else {
                await peerData.pc.setRemoteDescription(new RTCSessionDescription(offer));
            }
            const answer = await peerData.pc.createAnswer();
            answer.sdp = this.enhanceAudioSDP(answer.sdp);
            await peerData.pc.setLocalDescription(answer);
            socket.emit('webrtc:answer', { to: peerId, answer: peerData.pc.localDescription });
        } catch (err) {
            console.error('[Voice] Handle offer error:', err);
        }
    }

    async handleAnswer(peerId, answer) {
        const peerData = this.peers.get(peerId);
        if (!peerData) return;
        try {
            await peerData.pc.setRemoteDescription(new RTCSessionDescription(answer));
        } catch (err) {
            console.error('[Voice] Handle answer error:', err);
        }
    }

    async handleIceCandidate(peerId, candidate) {
        const peerData = this.peers.get(peerId);
        if (!peerData) return;
        try {
            await peerData.pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
            console.error('[Voice] ICE candidate error:', err);
        }
    }

    // Audio Playback
    playRemoteAudio(peerId, stream) {
        const peerData = this.peers.get(peerId);
        if (!peerData) return;
        if (peerData.audioEl) peerData.audioEl.remove();

        const audio = document.createElement('audio');
        audio.srcObject = stream;
        audio.autoplay = true;
        audio.setAttribute('playsinline', '');
        audio.muted = this.isDeafened;
        document.body.appendChild(audio);
        peerData.audioEl = audio;
        audio.play().catch(e => console.warn("[Voice] Autoplay blocked:", e));
    }

    setPeerVolume(peerId, volume) {
        const peerData = this.peers.get(peerId);
        if (peerData && peerData.audioEl) {
            peerData.audioEl.volume = volume;
        }
    }

    // Toggles
    toggleMute() {
        this.isMuted = !this.isMuted;
        if (this.localStream) {
            this.localStream.getAudioTracks().forEach(track => {
                track.enabled = !this.isMuted;
            });
        }
        return this.isMuted;
    }

    toggleDeafen() {
        this.isDeafened = !this.isDeafened;
        this.peers.forEach(peerData => {
            if (peerData.audioEl) peerData.audioEl.muted = this.isDeafened;
        });
        if (this.localStream) {
            this.localStream.getAudioTracks().forEach(track => {
                track.enabled = !this.isDeafened && !this.isMuted;
            });
        }
        return this.isDeafened;
    }

    // Cleanup
    removePeer(peerId) {
        const peerData = this.peers.get(peerId);
        if (peerData) {
            if (peerData.pc) peerData.pc.close();
            if (peerData.audioEl) peerData.audioEl.remove();
            this.peers.delete(peerId);
            // Also notify video end if exists
            if (this.videoCallback) this.videoCallback(peerId, null, false);
        }
    }

    disconnectAll() {
        this.peers.forEach((_, peerId) => this.removePeer(peerId));
        this.peers.clear();
    }

    destroy() {
        this.disconnectAll();
        if (this.localScreenStream) {
            this.localScreenStream.getTracks().forEach(t => t.stop());
            this.localScreenStream = null;
        }
        if (this.speakingCheckInterval) clearInterval(this.speakingCheckInterval);
        if (this.audioContext) this.audioContext.close();
        if (this.localStream) {
            this.localStream.getTracks().forEach(t => t.stop());
            this.localStream = null;
        }
        this.isMuted = false;
        this.isDeafened = false;
        this.isSpeaking = false;
    }
}

window.VoiceEngine = VoiceEngine;
