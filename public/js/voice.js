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

        // VoiceMod
        this.voiceContext = null;
        this.voiceSource = null;
        this.voiceDestination = null;
        this.currentEffect = 'normal';
        this.effectNodes = [];

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
            this.localStream = await navigator.mediaDevices.getUserMedia(this.audioConstraints);

            // Initialize Audio Processing
            await this.initAudioProcessing();

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
            // If voice context exists, reusing it mainly for analysis might be better, 
            // but here we just create a separate context or attach to existing one if suitable.
            // For simplicity, we keep analysis separate or reuse if we want visualizer to show *processed* audio.
            // Let's use the raw stream for speaking detection to avoid issues when effects are heavy.
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
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

    // ─── Voice Modulation ─────────────────────────────────────────

    async initAudioProcessing() {
        if (this.voiceContext) return;

        try {
            this.voiceContext = new (window.AudioContext || window.webkitAudioContext)();
            this.voiceSource = this.voiceContext.createMediaStreamSource(this.localStream);
            this.voiceDestination = this.voiceContext.createMediaStreamDestination();

            // Connect default (normal)
            this.setEffect('normal');
        } catch (e) {
            console.error('[Voice] Error initializing voice processing:', e);
        }
    }

    async setEffect(effectName) {
        if (!this.voiceContext) return;
        this.currentEffect = effectName;

        // Disconnect old nodes completely
        this.voiceSource.disconnect();
        this.effectNodes.forEach(node => {
            try { node.disconnect(); } catch (e) { }
            try { if (node.stop) node.stop(); } catch (e) { }
        });
        this.effectNodes = [];

        console.log(`[Voice] Switching effect to: ${effectName}`);

        switch (effectName) {
            case 'robot':
                this.applyRobotEffect();
                break;
            case 'alien':
                this.applyAlienEffect();
                break;
            case 'female':
                // Pitch Shift Up + Formant Tweaks
                this.applyFemaleEffect();
                break;
            case 'chipmunk':
                // Pitch Shift Up (approx 1.5x)
                this.applyPitchShift(1.5);
                break;
            case 'monster':
                // Pitch Shift Down (approx 0.7x)
                this.applyPitchShift(0.7);
                break;
            case 'echo':
                this.applyEchoEffect();
                break;
            case 'radio':
                this.applyRadioEffect();
                break;
            case 'telephone':
                this.applyTelephoneEffect();
                break;
            case 'normal':
            default:
                this.voiceSource.connect(this.voiceDestination);
                break;
        }

        // Notify peers of track change
        this.updatePeerTracks();
    }

    // ─── EFFECTS IMPLEMENTATION ───────────────────────────────

    // 1. Robot Effect (Comb Filter + Mod) - Kept mostly same but refined
    // 1. Robot Effect (Comb Filter + Ring Mod) - REFINED
    applyRobotEffect() {
        // Comb Filter for metallic sound
        const delay = this.voiceContext.createDelay();
        delay.delayTime.value = 0.01;

        const feedback = this.voiceContext.createGain();
        feedback.gain.value = 0.6; // Reduced to prevent feedback loop

        const filter = this.voiceContext.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 1500;

        // Source -> Delay -> Feedback -> Filter -> Delay
        this.voiceSource.connect(delay);
        delay.connect(feedback);
        feedback.connect(filter);
        filter.connect(delay);

        // Output path with Compressor
        const compressor = this.voiceContext.createDynamicsCompressor();
        compressor.threshold.value = -20;

        // Modulator (Ring Mod style)
        // Use Sine instead of Sawtooth for smoother sound
        const osc = this.voiceContext.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 50;

        const oscGain = this.voiceContext.createGain();
        oscGain.gain.value = 0.5;

        const modGain = this.voiceContext.createGain();
        modGain.gain.value = 0.0;

        // Signal Flow: Delay -> ModGain -> Compressor -> Dest
        delay.connect(modGain);

        osc.connect(oscGain);
        oscGain.connect(modGain.gain);

        // Makeup Gain
        const outGain = this.voiceContext.createGain();
        outGain.gain.value = 2.0;

        modGain.connect(compressor);
        compressor.connect(outGain);
        outGain.connect(this.voiceDestination);

        osc.start();
        this.effectNodes.push(delay, feedback, filter, osc, oscGain, modGain, compressor, outGain);
    }

    // 2. Alien Effect
    applyAlienEffect() {
        const delay = this.voiceContext.createDelay();
        delay.delayTime.value = 0.05;

        const feedback = this.voiceContext.createGain();
        feedback.gain.value = 0.6;

        const lfo = this.voiceContext.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = 2;

        const lfoGain = this.voiceContext.createGain();
        lfoGain.gain.value = 0.005;

        lfo.connect(lfoGain);
        lfoGain.connect(delay.delayTime);

        this.voiceSource.connect(delay);
        delay.connect(feedback);
        feedback.connect(delay);

        delay.connect(this.voiceDestination);
        this.voiceSource.connect(this.voiceDestination);

        lfo.start();
        this.effectNodes.push(delay, feedback, lfo, lfoGain);
    }

    // 3. Female Effect: Combination of Pitch Shift and EQ
    applyFemaleEffect() {
        // 1. High-Pass Filter (Remove low mud)
        const hpf = this.voiceContext.createBiquadFilter();
        hpf.type = 'highpass';
        hpf.frequency.value = 180;

        // 2. Peaking Filter (Add presence)
        const peak = this.voiceContext.createBiquadFilter();
        peak.type = 'peaking';
        peak.frequency.value = 3500;
        peak.Q.value = 0.5;
        peak.gain.value = 4;

        // 3. Pitch Shift Logic (Up ~1.45x)
        // We chain: Source -> HPF -> Peak -> PitchShifter -> Destination

        this.voiceSource.connect(hpf);
        hpf.connect(peak);

        // Use the pitch shifter helper on the output of the EQ
        this.connectPitchShifter(peak, this.voiceDestination, 1.45);

        this.effectNodes.push(hpf, peak);
    }

    // 4. General Pitch Shifter Wrapper
    applyPitchShift(pitchRatio) {
        this.connectPitchShifter(this.voiceSource, this.voiceDestination, pitchRatio);
    }

    // ─── CRITICAL: HIGH QUALITY PITCH SHIFTER ─────────────────────
    // Implements "Dan Barry" style Delay-Line Modulation Pitch Shifter
    // Uses 2 delay lines with sawtooth modulation to read faster/slower
    connectPitchShifter(sourceNode, destNode, pitchRatio) {
        const bufferTime = 0.100; // 100ms window
        const fadeTime = bufferTime / 2;
        const delayTime = bufferTime;

        // Create nodes
        const delay1 = this.voiceContext.createDelay(1);
        const delay2 = this.voiceContext.createDelay(1);
        const gain1 = this.voiceContext.createGain();
        const gain2 = this.voiceContext.createGain();

        // Initial delay times
        delay1.delayTime.value = 0;
        delay2.delayTime.value = 0;

        // Connect Audio Graph
        // Source -> Delay1 -> Gain1 -> Dest
        // Source -> Delay2 -> Gain2 -> Dest
        sourceNode.connect(delay1);
        sourceNode.connect(delay2);
        delay1.connect(gain1);
        delay2.connect(gain2);
        gain1.connect(destNode);
        gain2.connect(destNode);

        // -- Modulation Logic --
        // We need a Sawtooth wave to modulate the delay time.
        // If pitch > 1 (higher), we read faster, so delay must DECREASE (Sawtooth Down).
        // If pitch < 1 (lower), we read slower, so delay must INCREASE (Sawtooth Up).
        // Frequency = (1 - pitchRatio) / delayTime
        // But since we want "Sawtooth" behavior, we can use a ScriptProcessor or Oscillator.
        // Oscillator 'sawtooth' is ramping UP (-1 to 1).

        // Let's use a ScriptProcessor for the CONTROL SIGNAL only (LFO). 
        // This is safe because it only generates control values, not audio manipulation directly, 
        // avoiding audio glitches from JS timing jitter on the audio stream itself (mostly).
        // OR better: use standard Oscillator with Gain.

        // Calculate frequency for the LFO
        // Speed = (1 - pitchRatio) relative to natural speed.
        // To complete 1 cycle of 'delayTime' size in 'period':
        // F = abs(1 - pitchRatio) / delayTime

        let freq = Math.abs(1 - pitchRatio) / delayTime;

        // LFO 1
        const lfo1 = this.voiceContext.createOscillator();
        lfo1.type = 'sawtooth';
        lfo1.frequency.value = freq;

        // LFO 2 (90 or 180 deg out of phase? For 2-tap, usually 180 aka 0.5 offset)
        // With standard OSC, we can't set phase. 
        // Trick: Use a DelayNode on the LFO signal?
        // Or create a custom buffer for LFO.
        // Let's use custom buffer for LFO to ensure perfect phasing.

        // Create LFO Buffers
        const infoBufferSize = this.voiceContext.sampleRate * 2; // 2s is plenty for low freq
        const lfoBuffer1 = this.voiceContext.createBuffer(1, infoBufferSize, this.voiceContext.sampleRate);
        const lfoBuffer2 = this.voiceContext.createBuffer(1, infoBufferSize, this.voiceContext.sampleRate);
        const d1Data = lfoBuffer1.getChannelData(0);
        const d2Data = lfoBuffer2.getChannelData(0);

        // Generate sawtooths
        // We want them to scan from 0 to delayTime.
        // Normal sawtooth is -1 to 1.
        // We want 0 to 1 scaling later.

        // Direction:
        // pitchRatio > 1 (Higher): Delay must decrease. 1 -> 0.
        // pitchRatio < 1 (Lower): Delay must increase. 0 -> 1.

        const slope = (pitchRatio > 1) ? -1 : 1;

        // We need the LFOs to overlap perfectly.
        // LFO1: /   /   /
        // LFO2:   /   /
        // We need perfect crossfade.

        // Actually, let's use a simpler method for "Good Quality" that is standard in JS demos:
        // Use a ScriptProcessor to update `delayTime.value` and `gain.value` manually every frame? 
        // No, that's "zipper noise".

        // Let's use the `Jungle` approach which is:
        // Mod1 = Sawtooth(freq)
        // Mod2 = Mod1 + 0.5 (wrapped)
        // Delay1 = Mod1 * delayTime
        // Delay2 = Mod2 * delayTime
        // Gain1 = Triangle(Mod1) // 1 at 0.5, 0 at 0/1
        // Gain2 = Triangle(Mod2)

        const bufferSize = 4096;
        const shaperParams = this.voiceContext.createScriptProcessor(bufferSize, 1, 1);

        let phase = 0;

        shaperParams.onaudioprocess = (e) => {
            // output is unused, we just drive the AudioParams?
            // Actually ScriptProcessor cannot drive AudioParams easily without loops.
            // We'll write to the output buffer and connect it to the AudioParams!

            // We need 4 outputs: Delay1, Delay2, Gain1, Gain2. 
            // ScriptProcessor max outputs?
            // We can repurpose the audio channels. 
            // We need a Merger.
        };

        // OK, pure Graph approach is best for performance.
        // But generating the specific LFO shapes (0-1 sawtooth + triangle window) is hard with standard Osc.
        // So I will create a LOOPING BUFFER of the shapes.

        const sampleRate = this.voiceContext.sampleRate;
        const period = 1 / freq;
        const cycleSamples = Math.floor(sampleRate * period);

        const ctrlBuffer = this.voiceContext.createBuffer(4, cycleSamples, sampleRate);
        const cDelay1 = ctrlBuffer.getChannelData(0);
        const cGain1 = ctrlBuffer.getChannelData(1);
        const cDelay2 = ctrlBuffer.getChannelData(2);
        const cGain2 = ctrlBuffer.getChannelData(3);

        for (let i = 0; i < cycleSamples; i++) {
            let ph = i / cycleSamples; // 0 to 1

            // Delay Modulators (Sawtooth)
            // if pitch > 1, 1 -> 0
            // if pitch < 1, 0 -> 1
            let dVal = (pitchRatio > 1) ? (1 - ph) : ph;

            // Phase for second tap (shifted by 0.5)
            let ph2 = (ph + 0.5) % 1.0;
            let dVal2 = (pitchRatio > 1) ? (1 - ph2) : ph2;

            cDelay1[i] = dVal * delayTime;
            cDelay2[i] = dVal2 * delayTime;

            // Gain Windows (Triangle/Hanning)
            // We want Gain to be 1 in the middle of the sweep, 0 at 0/1
            // ph 0->1. Center is 0.5.
            // Simple Triangle:
            // 0 -> 0.5 -> 1  =>  0 -> 1 -> 0

            let gVal = 1 - Math.abs(2 * ph - 1);
            let gVal2 = 1 - Math.abs(2 * ph2 - 1);

            // Cross-fading improvements (equal power?) -> stick to linear for now.
            cGain1[i] = gVal;
            cGain2[i] = gVal2;
        }

        const ctrlSrc = this.voiceContext.createBufferSource();
        ctrlSrc.buffer = ctrlBuffer;
        ctrlSrc.loop = true;

        // We need to split this into 4 control signals.
        const splitter = this.voiceContext.createChannelSplitter(4);
        ctrlSrc.connect(splitter);

        // Connect Control Signals to Params
        // Splitter 0 -> Delay1.delayTime
        // Splitter 1 -> Gain1.gain
        // Splitter 2 -> Delay2.delayTime
        // Splitter 3 -> Gain2.gain

        splitter.connect(delay1.delayTime, 0);
        splitter.connect(gain1.gain, 1);
        splitter.connect(delay2.delayTime, 2);
        splitter.connect(gain2.gain, 3);

        ctrlSrc.start();

        this.effectNodes.push(delay1, delay2, gain1, gain2, ctrlSrc, splitter);
    }

    applyEchoEffect() {
        // Improved Echo
        const delay = this.voiceContext.createDelay();
        delay.delayTime.value = 0.4;

        const feedback = this.voiceContext.createGain();
        feedback.gain.value = 0.3;

        // Filter the echo to make it sound more natural (tape delay style)
        const filter = this.voiceContext.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 1000;

        this.voiceSource.connect(delay);
        delay.connect(filter);
        filter.connect(feedback);
        feedback.connect(delay); // Loop

        delay.connect(this.voiceDestination);
        this.voiceSource.connect(this.voiceDestination); // Dry signal

        this.effectNodes.push(delay, feedback, filter);
    }

    applyRadioEffect() {
        // 1. Bandpass Filter (Limited frequency range)
        const filter = this.voiceContext.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 1000;
        filter.Q.value = 1.5;

        // 2. Distortion (Wave Shaper)
        const distortion = this.voiceContext.createWaveShaper();
        distortion.curve = this.makeDistortionCurve(100);
        distortion.oversample = '4x';

        // 3. White Noise (Static)
        const bufferSize = this.voiceContext.sampleRate * 2; // 2 sec buffer
        const noiseBuffer = this.voiceContext.createBuffer(1, bufferSize, this.voiceContext.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noiseParams = {
            noiseSource: this.voiceContext.createBufferSource(),
            noiseGain: this.voiceContext.createGain()
        };
        noiseParams.noiseSource.buffer = noiseBuffer;
        noiseParams.noiseSource.loop = true;
        noiseParams.noiseGain.gain.value = 0.03; // Low volume static

        noiseParams.noiseSource.connect(noiseParams.noiseGain);

        // Mix: Source -> Filter -> Distortion -> Dest
        //      Noise -> Dest

        this.voiceSource.connect(filter);
        filter.connect(distortion);
        distortion.connect(this.voiceDestination);

        noiseParams.noiseGain.connect(this.voiceDestination);

        noiseParams.noiseSource.start();

        this.effectNodes.push(filter, distortion, noiseParams.noiseSource, noiseParams.noiseGain);
    }

    applyTelephoneEffect() {
        // Highpass + Lowpass for "Telephony" standard (300Hz - 3400Hz)
        const lowpass = this.voiceContext.createBiquadFilter();
        lowpass.type = 'lowpass';
        lowpass.frequency.value = 3000;

        const highpass = this.voiceContext.createBiquadFilter();
        highpass.type = 'highpass';
        highpass.frequency.value = 500;

        // Compression to even out levels
        const compressor = this.voiceContext.createDynamicsCompressor();
        compressor.threshold.value = -20;
        compressor.knee.value = 40;
        compressor.ratio.value = 12;

        this.voiceSource.connect(lowpass);
        lowpass.connect(highpass);
        highpass.connect(compressor);
        compressor.connect(this.voiceDestination);

        this.effectNodes.push(lowpass, highpass, compressor);
    }

    makeDistortionCurve(amount) {
        const k = typeof amount === 'number' ? amount : 50;
        const n_samples = 44100;
        const curve = new Float32Array(n_samples);
        const deg = Math.PI / 180;
        let x;
        for (let i = 0; i < n_samples; ++i) {
            x = i * 2 / n_samples - 1;
            curve[i] = (3 + k) * x * 20 * deg / (Math.PI + k * Math.abs(x));
        }
        return curve;
    }

    updatePeerTracks() {
        if (!this.voiceDestination) return;

        const processedStream = this.voiceDestination.stream;
        const audioTrack = processedStream.getAudioTracks()[0];

        if (!audioTrack) return;

        this.peers.forEach((peerData) => {
            if (peerData.pc) {
                const senders = peerData.pc.getSenders();
                const audioSender = senders.find(s => s.track && s.track.kind === 'audio');

                if (audioSender) {
                    audioSender.replaceTrack(audioTrack).catch(e => console.error("Track replace error", e));
                }
            }
        });
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

        // Add local audio (processed or raw)
        const streamToUse = (this.voiceDestination && this.voiceDestination.stream)
            ? this.voiceDestination.stream
            : this.localStream;

        if (streamToUse) {
            streamToUse.getTracks().forEach(track => {
                pc.addTrack(track, streamToUse);
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

        // Mute both raw and processed tracks to be safe
        const streams = [this.localStream, (this.voiceDestination ? this.voiceDestination.stream : null)];

        streams.forEach(stream => {
            if (stream) {
                stream.getAudioTracks().forEach(track => {
                    track.enabled = !this.isMuted;
                });
            }
        });
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
        if (this.voiceDestination && this.voiceDestination.stream) {
            this.voiceDestination.stream.getAudioTracks().forEach(track => {
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
