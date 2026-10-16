/* ========================================================
   NEON LUDO CLASSIC — Game Engine
   Rules: Real Indian Ludo (Roll 6 to open, step paths, home run, captures)
   Modes: 2-Player Local & Smart Cyber AI
======================================================== */

(function () {
    "use strict";

    var DICE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
    var currentTurn = 'cyan'; // 'cyan' or 'pink'
    var gameMode = 'ai'; // 'ai' or '2p'
    var diceValue = 0;
    var hasRolled = false;
    var isRolling = false;
    var isGameOver = false;

    // Tokens state: -1 = in base, 0 to 51 = common track, 52 to 57 = home corridor (57 = reached home)
    var tokens = {
        cyan: [
            { id: 'c0', pos: -1, startStep: 0 },
            { id: 'c1', pos: -1, startStep: 0 },
            { id: 'c2', pos: -1, startStep: 0 },
            { id: 'c3', pos: -1, startStep: 0 }
        ],
        pink: [
            { id: 'p0', pos: -1, startStep: 26 },
            { id: 'p1', pos: -1, startStep: 26 },
            { id: 'p2', pos: -1, startStep: 26 },
            { id: 'p3', pos: -1, startStep: 26 }
        ]
    };

    // Common track cell coordinates [r, c] on 15x15 grid
    var TRACK_COORDS = [
        [6,1],[6,2],[6,3],[6,4],[6,5],
        [5,6],[4,6],[3,6],[2,6],[1,6],[0,6],
        [0,7],[0,8],
        [1,8],[2,8],[3,8],[4,8],[5,8],
        [6,9],[6,10],[6,11],[6,12],[6,13],[6,14],
        [7,14],[8,14],
        [8,13],[8,12],[8,11],[8,10],[8,9],
        [9,8],[10,8],[11,8],[12,8],[13,8],[14,8],
        [14,7],[14,6],
        [13,6],[12,6],[11,6],[10,6],[9,6],
        [8,5],[8,4],[8,3],[8,2],[8,1],[8,0],
        [7,0],[6,0]
    ];

    // Home Corridors [r, c]
    var HOME_CORRIDORS = {
        cyan: [[7,1],[7,2],[7,3],[7,4],[7,5],[7,6]],
        pink: [[7,13],[7,12],[7,11],[7,10],[7,9],[7,8]]
    };

    // Safe squares (cannot be captured)
    var SAFE_STEPS = [0, 8, 13, 21, 26, 34, 39, 47];

    // Audio synthesizer
    var audioCtx = null;
    function getAudioCtx() {
        if (!audioCtx) {
            try {
                var AudioContext = window.AudioContext || window.webkitAudioContext;
                audioCtx = new AudioContext();
            } catch (e) {}
        }
        return audioCtx;
    }
    function playBeep(freq, dur, type) {
        try {
            var ctx = getAudioCtx();
            if (!ctx) return;
            if (ctx.state === "suspended") ctx.resume();
            var osc = ctx.createOscillator();
            var gain = ctx.createGain();
            osc.type = type || "sine";
            osc.frequency.setValueAtTime(freq, ctx.currentTime);
            gain.gain.setValueAtTime(0.18, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + dur);
        } catch (e) {}
    }

    // DOM Elements
    var diceBox = document.getElementById("diceBox");
    var diceHint = document.getElementById("diceHint");
    var turnIndicator = document.getElementById("turnIndicator");
    var playerTag = document.getElementById("playerTag");
    var modeAiBtn = document.getElementById("modeAiBtn");
    var mode2pBtn = document.getElementById("mode2pBtn");
    var victoryModal = document.getElementById("victoryModalOverlay");
    var victoryTitle = document.getElementById("victoryTitle");
    var victoryDesc = document.getElementById("victoryDesc");
    var playAgainBtn = document.getElementById("victoryPlayAgain");

    // Roll Dice
    function rollDice() {
        if (hasRolled || isRolling || isGameOver) return;
        if (gameMode === 'ai' && currentTurn === 'pink') return;

        executeDiceRoll();
    }

    function executeDiceRoll() {
        isRolling = true;
        playBeep(320, 0.08, "triangle");
        if (diceBox) diceBox.classList.add("rolling");

        setTimeout(function () {
            diceValue = Math.floor(Math.random() * 6) + 1;
            if (diceBox) {
                diceBox.classList.remove("rolling");
                diceBox.textContent = DICE_FACES[diceValue - 1];
            }
            isRolling = false;
            hasRolled = true;
            playBeep(480, 0.12, "sine");

            processTurnAfterRoll();
        }, 400);
    }

    function processTurnAfterRoll() {
        var movable = getMovableTokens(currentTurn, diceValue);

        if (movable.length === 0) {
            if (diceHint) diceHint.textContent = "No valid move. Passing turn...";
            setTimeout(switchTurn, 1000);
            return;
        }

        if (movable.length === 1 && (gameMode === '2p' || currentTurn === 'cyan')) {
            // Auto move if only 1 choice
            if (diceHint) diceHint.textContent = "Moving token...";
            setTimeout(function() { moveToken(movable[0]); }, 400);
            return;
        }

        if (currentTurn === 'pink' && gameMode === 'ai') {
            // AI chooses best token
            if (diceHint) diceHint.textContent = "AI is thinking...";
            setTimeout(function () {
                var chosen = pickAiToken(movable);
                moveToken(chosen);
            }, 600);
            return;
        }

        if (diceHint) diceHint.textContent = "Tap glowing token to move!";
        highlightMovable(movable);
    }

    function getMovableTokens(color, roll) {
        var list = tokens[color];
        var valid = [];

        for (var i = 0; i < list.length; i++) {
            var t = list[i];
            if (t.pos === -1) {
                // Needs a 6 to open
                if (roll === 6) valid.push(t);
            } else if (t.pos >= 0 && t.pos < 57) {
                // Must not overshoot finish 57
                if (t.pos + roll <= 57) {
                    valid.push(t);
                }
            }
        }
        return valid;
    }

    function pickAiToken(movable) {
        // AI priority: 1. capture opponent, 2. reach home, 3. open from base on 6, 4. furthest token
        for (var i = 0; i < movable.length; i++) {
            var t = movable[i];
            var nextPos = (t.pos === -1) ? 0 : t.pos + diceValue;
            if (nextPos === 57) return t; // win/home score!

            // Check if can capture cyan
            if (nextPos >= 0 && nextPos < 51) {
                var actualStep = (t.startStep + nextPos) % 52;
                if (SAFE_STEPS.indexOf(actualStep) === -1) {
                    for (var c = 0; c < tokens.cyan.length; c++) {
                        var cTok = tokens.cyan[c];
                        if (cTok.pos >= 0 && cTok.pos < 51) {
                            var cActual = (cTok.startStep + cTok.pos) % 52;
                            if (cActual === actualStep) return t; // capture!
                        }
                    }
                }
            }
        }
        // Prefer opening a 6
        for (var i = 0; i < movable.length; i++) {
            if (movable[i].pos === -1) return movable[i];
        }
        return movable[0];
    }

    function highlightMovable(movable) {
        renderTokens();
        for (var i = 0; i < movable.length; i++) {
            var el = document.getElementById(movable[i].id);
            if (el) el.classList.add("can-move");
        }
    }

    function moveToken(token) {
        if (token.pos === -1) {
            token.pos = 0; // step onto start
            playBeep(520, 0.15, "triangle");
        } else {
            token.pos += diceValue;
            playBeep(440, 0.1, "sine");
        }

        // Check for capture if on common track
        if (token.pos >= 0 && token.pos < 51) {
            var currentStep = (token.startStep + token.pos) % 52;
            if (SAFE_STEPS.indexOf(currentStep) === -1) {
                var oppColor = (currentTurn === 'cyan') ? 'pink' : 'cyan';
                for (var o = 0; o < tokens[oppColor].length; o++) {
                    var oppToken = tokens[oppColor][o];
                    if (oppToken.pos >= 0 && oppToken.pos < 51) {
                        var oppStep = (oppToken.startStep + oppToken.pos) % 52;
                        if (oppStep === currentStep) {
                            oppToken.pos = -1; // Send back to base!
                            playBeep(240, 0.25, "sawtooth");
                        }
                    }
                }
            }
        }

        renderTokens();

        // Check Victory
        if (checkWin(currentTurn)) {
            handleVictory(currentTurn);
            return;
        }

        // Bonus roll if rolled a 6
        if (diceValue === 6) {
            hasRolled = false;
            if (diceHint) diceHint.textContent = "ROLLED A 6! Roll again!";
            if (currentTurn === 'pink' && gameMode === 'ai') {
                setTimeout(executeDiceRoll, 800);
            }
            return;
        }

        switchTurn();
    }

    function switchTurn() {
        currentTurn = (currentTurn === 'cyan') ? 'pink' : 'cyan';
        hasRolled = false;
        diceValue = 0;

        updateTurnUI();

        if (currentTurn === 'pink' && gameMode === 'ai' && !isGameOver) {
            setTimeout(executeDiceRoll, 700);
        }
    }

    function checkWin(color) {
        var list = tokens[color];
        for (var i = 0; i < list.length; i++) {
            if (list[i].pos !== 57) return false;
        }
        return true;
    }

    function handleVictory(winner) {
        isGameOver = true;
        var isCyan = winner === 'cyan';
        var name = isCyan ? "CYAN" : (gameMode === 'ai' ? "SMART AI" : "PINK");
        var colorHex = isCyan ? "var(--cyan)" : "var(--pink)";

        if (victoryTitle) {
            victoryTitle.innerHTML = '<span style="color:' + colorHex + '">' + name + ' WINS!</span>';
        }
        if (victoryDesc) {
            victoryDesc.textContent = "All 4 tokens reached home victory triangle!";
        }
        if (victoryModal) victoryModal.classList.add("active");
    }

    function renderTokens() {
        // Remove existing rendered tokens
        var old = document.querySelectorAll(".ludo-token");
        for (var i = 0; i < old.length; i++) old[i].remove();

        ['cyan', 'pink'].forEach(function(color) {
            tokens[color].forEach(function(t, idx) {
                var el = document.createElement("div");
                el.className = "ludo-token token-" + color;
                el.id = t.id;

                el.addEventListener("click", function() {
                    if (!hasRolled || isRolling || isGameOver) return;
                    if (currentTurn !== color) return;
                    if (currentTurn === 'pink' && gameMode === 'ai') return;

                    var movable = getMovableTokens(color, diceValue);
                    for (var m = 0; m < movable.length; m++) {
                        if (movable[m].id === t.id) {
                            moveToken(t);
                            break;
                        }
                    }
                });

                if (t.pos === -1) {
                    // Nest in Base
                    var nest = document.getElementById("nest-" + color + "-" + idx);
                    if (nest) nest.appendChild(el);
                } else if (t.pos >= 0 && t.pos < 51) {
                    // Common Track
                    var step = (t.startStep + t.pos) % 52;
                    var coord = TRACK_COORDS[step];
                    var cell = document.querySelector('[data-r="' + coord[0] + '"][data-c="' + coord[1] + '"]');
                    if (cell) cell.appendChild(el);
                } else if (t.pos >= 51 && t.pos < 57) {
                    // Home Corridor
                    var corridorIdx = t.pos - 51;
                    var cCoord = HOME_CORRIDORS[color][corridorIdx];
                    var cCell = document.querySelector('[data-r="' + cCoord[0] + '"][data-c="' + cCoord[1] + '"]');
                    if (cCell) cCell.appendChild(el);
                } else {
                    // Finished at Home
                    var centerZone = document.getElementById("ludoCenterZone");
                    if (centerZone) centerZone.appendChild(el);
                }
            });
        });
    }

    function updateTurnUI() {
        if (turnIndicator) {
            var dotClass = (currentTurn === 'cyan') ? 'dot-cyan' : 'dot-pink';
            var name = (currentTurn === 'cyan') ? 'Cyan Turn' : (gameMode === 'ai' ? 'Smart AI Turn' : 'Pink Turn');
            turnIndicator.innerHTML = '<span class="turn-dot ' + dotClass + '"></span><span>' + name + '</span>';
        }
        if (playerTag) {
            playerTag.textContent = (currentTurn === 'cyan') ? 'CYAN' : (gameMode === 'ai' ? 'SMART AI' : 'PINK');
            playerTag.style.color = (currentTurn === 'cyan') ? 'var(--cyan)' : 'var(--pink)';
        }
        if (diceHint) {
            diceHint.textContent = (currentTurn === 'cyan') ? 'Tap dice to roll!' : (gameMode === 'ai' ? 'AI is rolling...' : 'Tap dice to roll!');
        }
    }

    function resetGame() {
        ['cyan', 'pink'].forEach(function(col) {
            tokens[col].forEach(function(t) { t.pos = -1; });
        });
        currentTurn = 'cyan';
        diceValue = 0;
        hasRolled = false;
        isRolling = false;
        isGameOver = false;

        if (diceBox) diceBox.textContent = '🎲';
        if (victoryModal) victoryModal.classList.remove("active");

        updateTurnUI();
        renderTokens();
    }

    // Attach Listeners
    if (diceBox) diceBox.addEventListener("click", rollDice);
    if (playAgainBtn) playAgainBtn.addEventListener("click", resetGame);

    if (modeAiBtn && mode2pBtn) {
        modeAiBtn.addEventListener("click", function() {
            gameMode = 'ai';
            modeAiBtn.classList.add("active");
            mode2pBtn.classList.remove("active");
            resetGame();
        });
        mode2pBtn.addEventListener("click", function() {
            gameMode = '2p';
            mode2pBtn.classList.add("active");
            modeAiBtn.classList.remove("active");
            resetGame();
        });
    }

    // Theme Toggle
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

    // Build 15x15 Grid Cells
    (function initGrid() {
        var grid = document.getElementById("ludoGrid");
        if (!grid) return;
        grid.innerHTML = "";

        for (var r = 0; r < 15; r++) {
            for (var c = 0; c < 15; c++) {
                var cell = document.createElement("div");
                cell.className = "cell";
                cell.dataset.r = r;
                cell.dataset.c = c;

                // Mark safe squares with stars
                if ((r === 6 && c === 1) || (r === 2 && c === 6) || (r === 1 && c === 8) || (r === 6 && c === 12) ||
                    (r === 8 && c === 13) || (r === 12 && c === 8) || (r === 13 && c === 6) || (r === 8 && c === 2)) {
                    cell.classList.add("safe-star");
                    cell.textContent = "★";
                }

                // Colored tracks
                if (r === 7 && c >= 1 && c <= 6) cell.classList.add("track-cyan");
                if (r === 7 && c >= 8 && c <= 13) cell.classList.add("track-pink");

                grid.appendChild(cell);
            }
        }
    })();

    // Initialize Game
    resetGame();
})();
