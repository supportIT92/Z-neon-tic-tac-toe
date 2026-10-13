/* ========================================================
   NEON AUDIO SYNTH & RADIO PLAYER
   Web Audio API Procedural Synthwave / Chiptune Engine
   Zero external MP3 dependencies, 100% lightweight & offline
======================================================== */

(function () {
    "use strict";

    var audioCtx = null;
    var isPlaying = false;
    var currentTrackIndex = 0;
    var timerId = null;
    var masterGain = null;

    var TRACKS = [
        { name: "Cyberpunk Drift", tempo: 110, scale: [220, 261.63, 293.66, 329.63, 392, 440] },
        { name: "Midnight Neon 84", tempo: 120, scale: [196, 233.08, 261.63, 293.66, 349.23, 392] },
        { name: "Retro Arcade Pulse", tempo: 128, scale: [164.81, 196, 220, 246.94, 293.66, 329.63] }
    ];

    function getAudioCtx() {
        if (!audioCtx) {
            try {
                var AudioContext = window.AudioContext || window.webkitAudioContext;
                audioCtx = new AudioContext();
                masterGain = audioCtx.createGain();
                masterGain.gain.setValueAtTime(0.08, audioCtx.currentTime); // gentle ambient volume
                masterGain.connect(audioCtx.destination);
            } catch (e) {}
        }
        return audioCtx;
    }

    // Play bass / lead note
    function playSynthNote(freq, dur, type, time, gainLevel) {
        if (!audioCtx || !isPlaying) return;
        var osc = audioCtx.createOscillator();
        var gain = audioCtx.createGain();

        osc.type = type || "sawtooth";
        osc.frequency.setValueAtTime(freq, time);

        gain.gain.setValueAtTime(gainLevel || 0.1, time);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);

        // Lowpass filter for smooth 80s warmth
        var filter = audioCtx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(1400, time);

        osc.connect(gain);
        gain.connect(filter);
        filter.connect(masterGain);

        osc.start(time);
        osc.stop(time + dur);
    }

    // Synth kick drum
    function playKick(time) {
        if (!audioCtx || !isPlaying) return;
        var osc = audioCtx.createOscillator();
        var gain = audioCtx.createGain();
        osc.frequency.setValueAtTime(130, time);
        osc.frequency.exponentialRampToValueAtTime(35, time + 0.12);
        gain.gain.setValueAtTime(0.3, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(time);
        osc.stop(time + 0.15);
    }

    // Hi-hat
    function playHat(time) {
        if (!audioCtx || !isPlaying) return;
        var bufferSize = audioCtx.sampleRate * 0.04;
        var buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        var data = buffer.getChannelData(0);
        for (var i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        var noise = audioCtx.createBufferSource();
        noise.buffer = buffer;
        var filter = audioCtx.createBiquadFilter();
        filter.type = "highpass";
        filter.frequency.setValueAtTime(7000, time);
        var gain = audioCtx.createGain();
        gain.gain.setValueAtTime(0.06, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(masterGain);
        noise.start(time);
        noise.stop(time + 0.04);
    }

    var step = 0;
    function scheduleBar() {
        if (!isPlaying || !audioCtx) return;
        var track = TRACKS[currentTrackIndex];
        var stepDuration = 60 / track.tempo / 4; // 16th note
        var now = audioCtx.currentTime;

        for (var i = 0; i < 16; i++) {
            var time = now + (i * stepDuration);
            var noteIndex = (step + i) % 16;

            // Kick on 0, 4, 8, 12 (4-on-the-floor synthwave)
            if (noteIndex % 4 === 0) {
                playKick(time);
            }
            // Hihat on offbeats
            if (noteIndex % 2 === 1) {
                playHat(time);
            }
            // Bassline
            if (noteIndex % 2 === 0) {
                var bassFreq = track.scale[(noteIndex / 2) % track.scale.length] / 2;
                playSynthNote(bassFreq, stepDuration * 1.5, "sawtooth", time, 0.12);
            }
            // Melodic arpeggio
            if (noteIndex % 3 === 0) {
                var leadFreq = track.scale[(noteIndex * 2) % track.scale.length];
                playSynthNote(leadFreq, stepDuration * 0.8, "sine", time, 0.08);
            }
        }

        step = (step + 16) % 64;
        timerId = setTimeout(scheduleBar, 16 * stepDuration * 1000 - 30);
    }

    function startRadio() {
        var ctx = getAudioCtx();
        if (!ctx) return;
        if (ctx.state === "suspended") ctx.resume();
        isPlaying = true;
        step = 0;
        scheduleBar();
        updateUI();
    }

    function stopRadio() {
        isPlaying = false;
        if (timerId) clearTimeout(timerId);
        updateUI();
    }

    function toggleRadio() {
        if (isPlaying) {
            stopRadio();
        } else {
            startRadio();
        }
    }

    function nextTrack() {
        currentTrackIndex = (currentTrackIndex + 1) % TRACKS.length;
        if (isPlaying) {
            if (timerId) clearTimeout(timerId);
            step = 0;
            scheduleBar();
        }
        updateUI();
    }

    function updateUI() {
        var radioBtn = document.getElementById("radioToggleBtn");
        var radioTitle = document.getElementById("radioTrackTitle");
        var visualizer = document.getElementById("radioVisualizer");

        if (radioBtn) {
            radioBtn.classList.toggle("playing", isPlaying);
            radioBtn.innerHTML = isPlaying
                ? '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>'
                : '<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
        }
        if (radioTitle) {
            radioTitle.textContent = TRACKS[currentTrackIndex].name;
        }
        if (visualizer) {
            visualizer.classList.toggle("active", isPlaying);
        }
    }

    // Attach to global window
    window.NeonRadio = {
        toggle: toggleRadio,
        next: nextTrack,
        isPlaying: function () { return isPlaying; }
    };
})();
