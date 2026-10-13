/* ========================================================
   NEON CYBER PONG — Game Engine
   Features: Player vs AI, Local 2-Player, Canvas Physics, Sound FX
======================================================== */

(function () {
    "use strict";

    var canvas = document.getElementById("pongCanvas");
    var ctx = canvas ? canvas.getContext("2d") : null;

    var WIDTH = 800;
    var HEIGHT = 450;

    var paddleWidth = 14;
    var paddleHeight = 85;

    var p1 = { x: 25, y: HEIGHT / 2 - paddleHeight / 2, vy: 0, score: 0 };
    var p2 = { x: WIDTH - 25 - paddleWidth, y: HEIGHT / 2 - paddleHeight / 2, vy: 0, score: 0 };

    var ball = {
        x: WIDTH / 2,
        y: HEIGHT / 2,
        radius: 9,
        vx: 5,
        vy: 3,
        speed: 6.5
    };

    var particles = [];
    var trail = [];

    var gameMode = "ai"; // "ai" or "2p"
    var isRunning = false;
    var animFrameId = null;
    var winningScore = 7;

    // Audio synthesizer
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
    var scoreP1El = document.getElementById("scoreP1");
    var scoreP2El = document.getElementById("scoreP2");
    var p2LabelEl = document.getElementById("p2Label");
    var modeAiBtn = document.getElementById("modeAiBtn");
    var mode2pBtn = document.getElementById("mode2pBtn");
    var overlayEl = document.getElementById("canvasOverlay");
    var overlayTitle = document.getElementById("overlayTitle");
    var overlayDesc = document.getElementById("overlayDesc");
    var overlayBtn = document.getElementById("overlayBtn");

    // Touch controls
    var p1UpBtn = document.getElementById("p1Up");
    var p1DownBtn = document.getElementById("p1Down");
    var p2UpBtn = document.getElementById("p2Up");
    var p2DownBtn = document.getElementById("p2Down");

    var keys = {};

    window.addEventListener("keydown", function(e) {
        keys[e.key.toLowerCase()] = true;
        if (e.key === " " && !isRunning) {
            startGame();
            e.preventDefault();
        }
    });
    window.addEventListener("keyup", function(e) {
        keys[e.key.toLowerCase()] = false;
    });

    function resetBall(direction) {
        ball.x = WIDTH / 2;
        ball.y = HEIGHT / 2;
        ball.speed = 6.5;
        var angle = (Math.random() * Math.PI / 3) - Math.PI / 6; // -30 to +30 deg
        ball.vx = (direction || (Math.random() > 0.5 ? 1 : -1)) * ball.speed * Math.cos(angle);
        ball.vy = ball.speed * Math.sin(angle);
        trail = [];
    }

    function createExplosion(x, y, color) {
        for (var i = 0; i < 16; i++) {
            var angle = Math.random() * Math.PI * 2;
            var spd = Math.random() * 4 + 1.5;
            particles.push({
                x: x,
                y: y,
                vx: Math.cos(angle) * spd,
                vy: Math.sin(angle) * spd,
                life: 1,
                color: color
            });
        }
    }

    function update() {
        // Player 1 movement (W/S or Arrow keys if AI mode)
        var p1Speed = 6.5;
        if (keys["w"] || (gameMode === "ai" && keys["arrowup"])) {
            p1.y -= p1Speed;
        }
        if (keys["s"] || (gameMode === "ai" && keys["arrowdown"])) {
            p1.y += p1Speed;
        }

        // Player 2 movement
        if (gameMode === "2p") {
            var p2Speed = 6.5;
            if (keys["arrowup"]) p2.y -= p2Speed;
            if (keys["arrowdown"]) p2.y += p2Speed;
        } else {
            // AI behavior with reaction speed & slight error
            var aiCenter = p2.y + paddleHeight / 2;
            var targetY = ball.y;
            if (ball.vx > 0) {
                // Ball coming towards AI
                var diff = targetY - aiCenter;
                var aiSpeed = 4.8;
                if (Math.abs(diff) > 10) {
                    p2.y += (diff > 0 ? 1 : -1) * aiSpeed;
                }
            } else {
                // Return to center slowly
                var centerDiff = (HEIGHT / 2) - aiCenter;
                if (Math.abs(centerDiff) > 10) {
                    p2.y += (centerDiff > 0 ? 1 : -1) * 2;
                }
            }
        }

        // Clamp paddles
        p1.y = Math.max(10, Math.min(HEIGHT - paddleHeight - 10, p1.y));
        p2.y = Math.max(10, Math.min(HEIGHT - paddleHeight - 10, p2.y));

        // Ball movement
        ball.x += ball.vx;
        ball.y += ball.vy;

        // Trail
        trail.push({ x: ball.x, y: ball.y, alpha: 0.6 });
        if (trail.length > 8) trail.shift();

        // Bounce top/bottom walls
        if (ball.y - ball.radius <= 0) {
            ball.y = ball.radius;
            ball.vy = -ball.vy;
            playBeep(420, 0.08, "triangle");
        } else if (ball.y + ball.radius >= HEIGHT) {
            ball.y = HEIGHT - ball.radius;
            ball.vy = -ball.vy;
            playBeep(420, 0.08, "triangle");
        }

        // Paddle 1 Collision (Cyan)
        if (ball.vx < 0 &&
            ball.x - ball.radius <= p1.x + paddleWidth &&
            ball.x + ball.radius >= p1.x &&
            ball.y >= p1.y && ball.y <= p1.y + paddleHeight) {
            
            ball.x = p1.x + paddleWidth + ball.radius;
            ball.speed = Math.min(13, ball.speed + 0.35);

            var relIntersect = (ball.y - (p1.y + paddleHeight / 2)) / (paddleHeight / 2);
            var bounceAngle = relIntersect * (Math.PI / 3); // Max 60 deg
            ball.vx = ball.speed * Math.cos(bounceAngle);
            ball.vy = ball.speed * Math.sin(bounceAngle);

            createExplosion(ball.x, ball.y, "#00f7ff");
            playBeep(520, 0.1, "sine");
        }

        // Paddle 2 Collision (Pink)
        if (ball.vx > 0 &&
            ball.x + ball.radius >= p2.x &&
            ball.x - ball.radius <= p2.x + paddleWidth &&
            ball.y >= p2.y && ball.y <= p2.y + paddleHeight) {
            
            ball.x = p2.x - ball.radius;
            ball.speed = Math.min(13, ball.speed + 0.35);

            var relIntersect2 = (ball.y - (p2.y + paddleHeight / 2)) / (paddleHeight / 2);
            var bounceAngle2 = relIntersect2 * (Math.PI / 3);
            ball.vx = -ball.speed * Math.cos(bounceAngle2);
            ball.vy = ball.speed * Math.sin(bounceAngle2);

            createExplosion(ball.x, ball.y, "#ff2bd6");
            playBeep(640, 0.1, "sine");
        }

        // Score check Left / Right
        if (ball.x + ball.radius < 0) {
            // P2 Scores
            p2.score++;
            createExplosion(0, ball.y, "#ff2bd6");
            playBeep(220, 0.25, "sawtooth");
            updateScoreUI();
            checkMatchEnd();
            resetBall(1);
        } else if (ball.x - ball.radius > WIDTH) {
            // P1 Scores
            p1.score++;
            createExplosion(WIDTH, ball.y, "#00f7ff");
            playBeep(780, 0.25, "sine");
            updateScoreUI();
            checkMatchEnd();
            resetBall(-1);
        }

        // Update particles
        for (var i = particles.length - 1; i >= 0; i--) {
            var pt = particles[i];
            pt.x += pt.vx;
            pt.y += pt.vy;
            pt.life -= 0.035;
            if (pt.life <= 0) particles.splice(i, 1);
        }
    }

    function draw() {
        if (!ctx) return;

        // Clear Background
        ctx.fillStyle = "#030614";
        ctx.fillRect(0, 0, WIDTH, HEIGHT);

        // Center line dashed
        ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
        ctx.lineWidth = 3;
        ctx.setLineDash([10, 10]);
        ctx.beginPath();
        ctx.moveTo(WIDTH / 2, 0);
        ctx.lineTo(WIDTH / 2, HEIGHT);
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw Ball Trail
        for (var t = 0; t < trail.length; t++) {
            var tr = trail[t];
            var factor = (t + 1) / trail.length;
            ctx.fillStyle = "rgba(0, 247, 255, " + (factor * 0.25) + ")";
            ctx.beginPath();
            ctx.arc(tr.x, tr.y, ball.radius * factor, 0, Math.PI * 2);
            ctx.fill();
        }

        // Draw Ball
        ctx.save();
        ctx.shadowColor = "#ffffff";
        ctx.shadowBlur = 14;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Draw Paddle 1 (Cyan)
        ctx.save();
        ctx.shadowColor = "#00f7ff";
        ctx.shadowBlur = 16;
        ctx.fillStyle = "#00f7ff";
        ctx.fillRect(p1.x, p1.y, paddleWidth, paddleHeight);
        ctx.restore();

        // Draw Paddle 2 (Pink)
        ctx.save();
        ctx.shadowColor = "#ff2bd6";
        ctx.shadowBlur = 16;
        ctx.fillStyle = "#ff2bd6";
        ctx.fillRect(p2.x, p2.y, paddleWidth, paddleHeight);
        ctx.restore();

        // Draw Particles
        for (var i = 0; i < particles.length; i++) {
            var pt = particles[i];
            ctx.fillStyle = pt.color;
            ctx.globalAlpha = pt.life;
            ctx.fillRect(pt.x, pt.y, 4, 4);
        }
        ctx.globalAlpha = 1.0;
    }

    function loop() {
        if (!isRunning) return;
        update();
        draw();
        animFrameId = requestAnimationFrame(loop);
    }

    function checkMatchEnd() {
        if (p1.score >= winningScore || p2.score >= winningScore) {
            isRunning = false;
            cancelAnimationFrame(animFrameId);
            var isP1Winner = p1.score >= winningScore;

            if (overlayEl) {
                if (isP1Winner) {
                    overlayTitle.innerHTML = '<span style="color:var(--cyan)">CYAN CHAMPION!</span>';
                    overlayDesc.textContent = gameMode === "ai" ? "Incredible! You crushed the Cyber AI!" : "Player 1 wins the Neon Pong championship!";
                } else {
                    overlayTitle.innerHTML = '<span style="color:var(--pink)">PINK VICTORY!</span>';
                    overlayDesc.textContent = gameMode === "ai" ? "Cyber AI dominated the arena! Try again!" : "Player 2 wins the championship!";
                }
                overlayBtn.textContent = "PLAY AGAIN";
                overlayEl.classList.add("active");
            }
        }
    }

    function startGame() {
        p1.score = 0;
        p2.score = 0;
        p1.y = HEIGHT / 2 - paddleHeight / 2;
        p2.y = HEIGHT / 2 - paddleHeight / 2;
        updateScoreUI();
        resetBall();
        isRunning = true;
        if (overlayEl) overlayEl.classList.remove("active");
        cancelAnimationFrame(animFrameId);
        animFrameId = requestAnimationFrame(loop);
    }

    function updateScoreUI() {
        if (scoreP1El) scoreP1El.textContent = p1.score;
        if (scoreP2El) scoreP2El.textContent = p2.score;
    }

    // Canvas touch handling (drag to move paddle)
    if (canvas) {
        var handleTouch = function(e) {
            var rect = canvas.getBoundingClientRect();
            var touch = e.touches[0];
            var scaleY = HEIGHT / rect.height;
            var touchY = (touch.clientY - rect.top) * scaleY;
            p1.y = touchY - paddleHeight / 2;
            e.preventDefault();
        };
        canvas.addEventListener("touchmove", handleTouch, { passive: false });
        canvas.addEventListener("touchstart", handleTouch, { passive: false });
    }

    // Touch Buttons
    function bindTouchHold(btn, keyName) {
        if (!btn) return;
        var start = function(e) { keys[keyName] = true; e.preventDefault(); };
        var end = function(e) { keys[keyName] = false; e.preventDefault(); };
        btn.addEventListener("touchstart", start, { passive: false });
        btn.addEventListener("touchend", end, { passive: false });
        btn.addEventListener("mousedown", start);
        btn.addEventListener("mouseup", end);
    }
    bindTouchHold(p1UpBtn, "w");
    bindTouchHold(p1DownBtn, "s");
    bindTouchHold(p2UpBtn, "arrowup");
    bindTouchHold(p2DownBtn, "arrowdown");

    if (overlayBtn) overlayBtn.addEventListener("click", startGame);

    if (modeAiBtn && mode2pBtn) {
        modeAiBtn.addEventListener("click", function() {
            gameMode = "ai";
            modeAiBtn.classList.add("active");
            mode2pBtn.classList.remove("active");
            if (p2LabelEl) p2LabelEl.textContent = "CYBER AI";
            startGame();
        });
        mode2pBtn.addEventListener("click", function() {
            gameMode = "2p";
            mode2pBtn.classList.add("active");
            modeAiBtn.classList.remove("active");
            if (p2LabelEl) p2LabelEl.textContent = "PLAYER 2";
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

    // Initial draw
    draw();
})();
