/* ========================================================
   NEON CYBER SNAKE — Game Engine
   HTML5 Canvas Neon Snake with Food Orbs, Speed Ramps, Sound FX
======================================================== */

(function () {
    "use strict";

    var canvas = document.getElementById("snakeCanvas");
    var ctx = canvas ? canvas.getContext("2d") : null;

    var GRID_SIZE = 20; // 20x20 grid
    var CELL_PIXELS = 20; // internal canvas resolution = 400x400

    var snake = [];
    var direction = { x: 1, y: 0 };
    var nextDirection = { x: 1, y: 0 };
    var food = { x: 10, y: 10 };
    var score = 0;
    var highScore = 0;
    var speedLevel = 1;
    var baseInterval = 130; // ms per step
    var gameLoopId = null;
    var isRunning = false;
    var isGameOver = false;

    // Read stored high score
    try {
        var savedHigh = localStorage.getItem("neonSnake_highScore");
        if (savedHigh) highScore = parseInt(savedHigh, 10) || 0;
    } catch(e) {}

    // Audio synthesizer for neon snake sounds
    var audioCtx = null;
    function getAudioCtx() {
        if (!audioCtx) {
            try {
                var AudioContext = window.AudioContext || window.webkitAudioContext;
                audioCtx = new AudioContext();
            } catch(e) {}
        }
        return audioCtx;
    }
    function playBeep(freq, dur, type) {
        try {
            var c = getAudioCtx();
            if (!c) return;
            if (c.state === "suspended") c.resume();
            var osc = c.createOscillator();
            var gain = c.createGain();
            osc.type = type || "sine";
            osc.frequency.setValueAtTime(freq, c.currentTime);
            gain.gain.setValueAtTime(0.15, c.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
            osc.connect(gain);
            gain.connect(c.destination);
            osc.start();
            osc.stop(c.currentTime + dur);
        } catch(e) {}
    }

    // DOM Elements
    var scoreCurrentEl = document.getElementById("scoreCurrent");
    var scoreHighEl = document.getElementById("scoreHigh");
    var scoreSpeedEl = document.getElementById("scoreSpeed");
    var overlayEl = document.getElementById("canvasOverlay");
    var overlayTitle = document.getElementById("overlayTitle");
    var overlayDesc = document.getElementById("overlayDesc");
    var overlayBtn = document.getElementById("overlayBtn");

    // D-Pad Elements
    var btnUp = document.getElementById("dpadUp");
    var btnDown = document.getElementById("dpadDown");
    var btnLeft = document.getElementById("dpadLeft");
    var btnRight = document.getElementById("dpadRight");

    function initGame() {
        snake = [
            { x: 6, y: 10 },
            { x: 5, y: 10 },
            { x: 4, y: 10 }
        ];
        direction = { x: 1, y: 0 };
        nextDirection = { x: 1, y: 0 };
        score = 0;
        speedLevel = 1;
        isGameOver = false;
        placeFood();
        updateUI();
        draw();
    }

    function placeFood() {
        var valid = false;
        while (!valid) {
            var rx = Math.floor(Math.random() * GRID_SIZE);
            var ry = Math.floor(Math.random() * GRID_SIZE);
            var collision = false;
            for (var i = 0; i < snake.length; i++) {
                if (snake[i].x === rx && snake[i].y === ry) {
                    collision = true;
                    break;
                }
            }
            if (!collision) {
                food = { x: rx, y: ry };
                valid = true;
            }
        }
    }

    function startGame() {
        if (isRunning) return;
        initGame();
        isRunning = true;
        if (overlayEl) overlayEl.classList.remove("active");
        runLoop();
    }

    function runLoop() {
        if (!isRunning) return;
        update();
        if (isGameOver) return;
        draw();
        
        var interval = Math.max(55, baseInterval - (speedLevel - 1) * 8);
        gameLoopId = setTimeout(runLoop, interval);
    }

    function update() {
        direction = nextDirection;
        var head = {
            x: snake[0].x + direction.x,
            y: snake[0].y + direction.y
        };

        // Wall collision check
        if (head.x < 0 || head.x >= GRID_SIZE || head.y < 0 || head.y >= GRID_SIZE) {
            handleGameOver();
            return;
        }

        // Self collision check
        for (var i = 0; i < snake.length; i++) {
            if (head.x === snake[i].x && head.y === snake[i].y) {
                handleGameOver();
                return;
            }
        }

        snake.unshift(head);

        // Food collision
        if (head.x === food.x && head.y === food.y) {
            score += 10;
            if (score > highScore) {
                highScore = score;
                try { localStorage.setItem("neonSnake_highScore", highScore); } catch(e) {}
            }
            speedLevel = Math.min(10, 1 + Math.floor(score / 50));
            playBeep(650, 0.1, "triangle");
            placeFood();
            updateUI();
        } else {
            snake.pop();
        }
    }

    function draw() {
        if (!ctx) return;

        // Clear Canvas with cyber dark background
        ctx.fillStyle = "#020906";
        ctx.fillRect(0, 0, 400, 400);

        // Draw faint cyber grid lines
        ctx.strokeStyle = "rgba(16, 185, 129, 0.08)";
        ctx.lineWidth = 1;
        for (var x = 0; x <= 400; x += CELL_PIXELS) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, 400);
            ctx.stroke();
        }
        for (var y = 0; y <= 400; y += CELL_PIXELS) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(400, y);
            ctx.stroke();
        }

        // Draw Glowing Food Orb
        ctx.save();
        ctx.shadowColor = "#ff2bd6";
        ctx.shadowBlur = 16;
        ctx.fillStyle = "#ff2bd6";
        ctx.beginPath();
        var fx = food.x * CELL_PIXELS + CELL_PIXELS / 2;
        var fy = food.y * CELL_PIXELS + CELL_PIXELS / 2;
        ctx.arc(fx, fy, CELL_PIXELS / 2 - 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Draw Snake Body
        for (var i = 0; i < snake.length; i++) {
            var seg = snake[i];
            var isHead = i === 0;

            ctx.save();
            ctx.fillStyle = isHead ? "#00f7ff" : "#10b981";
            ctx.shadowColor = isHead ? "#00f7ff" : "#10b981";
            ctx.shadowBlur = isHead ? 14 : 8;

            var px = seg.x * CELL_PIXELS;
            var py = seg.y * CELL_PIXELS;
            var pad = 1.5;
            ctx.fillRect(px + pad, py + pad, CELL_PIXELS - pad * 2, CELL_PIXELS - pad * 2);
            ctx.restore();
        }
    }

    function handleGameOver() {
        isRunning = false;
        isGameOver = true;
        clearTimeout(gameLoopId);
        playBeep(180, 0.35, "sawtooth");

        if (overlayEl) {
            overlayTitle.innerHTML = '<span style="color:#ef4444">SYSTEM BREACH</span>';
            overlayDesc.textContent = "You collided! Final Score: " + score;
            overlayBtn.textContent = "RETRY MISSION";
            overlayEl.classList.add("active");
        }
    }

    function updateUI() {
        if (scoreCurrentEl) scoreCurrentEl.textContent = score;
        if (scoreHighEl) scoreHighEl.textContent = highScore;
        if (scoreSpeedEl) scoreSpeedEl.textContent = speedLevel + "x";
    }

    function setDir(dx, dy) {
        if (!isRunning) return;
        // Prevent 180 reverse
        if (dx === -direction.x && dy === -direction.y) return;
        nextDirection = { x: dx, y: dy };
    }

    // Keyboard controls
    window.addEventListener("keydown", function (e) {
        var key = e.key;
        if (key === "ArrowUp" || key === "w" || key === "W") {
            setDir(0, -1);
            e.preventDefault();
        } else if (key === "ArrowDown" || key === "s" || key === "S") {
            setDir(0, 1);
            e.preventDefault();
        } else if (key === "ArrowLeft" || key === "a" || key === "A") {
            setDir(-1, 0);
            e.preventDefault();
        } else if (key === "ArrowRight" || key === "d" || key === "D") {
            setDir(1, 0);
            e.preventDefault();
        } else if (key === " " && !isRunning) {
            startGame();
            e.preventDefault();
        }
    });

    // Touch D-Pad bindings with zero-latency touchstart
    function bindDpad(btn, dx, dy) {
        if (!btn) return;
        var trigger = function (e) {
            if (!isRunning && !isGameOver) {
                startGame();
            }
            setDir(dx, dy);
            if (e && e.cancelable) e.preventDefault();
        };
        btn.addEventListener("touchstart", trigger, { passive: false });
        btn.addEventListener("click", trigger);
    }

    bindDpad(btnUp, 0, -1);
    bindDpad(btnDown, 0, 1);
    bindDpad(btnLeft, -1, 0);
    bindDpad(btnRight, 1, 0);

    // Touch Swipe on Canvas
    if (canvas) {
        var touchStartX = 0;
        var touchStartY = 0;

        canvas.addEventListener("touchstart", function (e) {
            var t = e.touches[0];
            touchStartX = t.clientX;
            touchStartY = t.clientY;
            if (!isRunning && !isGameOver) {
                startGame();
            }
        }, { passive: true });

        canvas.addEventListener("touchmove", function (e) {
            if (!isRunning) return;
            var t = e.touches[0];
            var diffX = t.clientX - touchStartX;
            var diffY = t.clientY - touchStartY;
            var minSwipe = 25; // minimum px for gesture

            if (Math.abs(diffX) > Math.abs(diffY)) {
                // Horizontal swipe
                if (Math.abs(diffX) > minSwipe) {
                    if (diffX > 0) setDir(1, 0);
                    else setDir(-1, 0);
                    touchStartX = t.clientX;
                    touchStartY = t.clientY;
                    if (e.cancelable) e.preventDefault();
                }
            } else {
                // Vertical swipe
                if (Math.abs(diffY) > minSwipe) {
                    if (diffY > 0) setDir(0, 1);
                    else setDir(0, -1);
                    touchStartX = t.clientX;
                    touchStartY = t.clientY;
                    if (e.cancelable) e.preventDefault();
                }
            }
        }, { passive: false });
    }

    // Overlay Start Button
    if (overlayBtn) {
        overlayBtn.addEventListener("click", function() {
            startGame();
        });
    }

    // Theme toggle
    var themeBtn = document.getElementById("themeToggleBtn");
    var savedTheme = localStorage.getItem("neonTheme") || "dark";
    if (savedTheme === "light") document.body.classList.add("light-theme");
    if (themeBtn) {
        themeBtn.addEventListener("click", function() {
            document.body.classList.toggle("light-theme");
            var isLight = document.body.classList.contains("light-theme");
            localStorage.setItem("neonTheme", isLight ? "light" : "dark");
        });
    }

    // Init display
    initGame();
    updateUI();
})();
