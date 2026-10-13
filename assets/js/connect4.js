/* ========================================================
   NEON CONNECT 4 — Game Engine
   Features: Local 2P, Cyber AI (Easy / Hard), Win Detection, Sound FX
======================================================== */

(function () {
    "use strict";

    var ROWS = 6;
    var COLS = 7;
    var board = []; // 6x7 matrix
    var currentPlayer = 1; // 1 = Cyan, 2 = Pink
    var gameActive = true;
    var gameMode = "ai"; // "ai" or "2p"
    var isAiTurn = false;

    var scores = { p1: 0, p2: 0, ties: 0 };

    // Audio synthesizer for neon sounds
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
    function playNeonSound(freq, duration, type) {
        try {
            var ctx = getAudioCtx();
            if (!ctx) return;
            if (ctx.state === "suspended") ctx.resume();
            var osc = ctx.createOscillator();
            var gain = ctx.createGain();
            osc.type = type || "sine";
            osc.frequency.setValueAtTime(freq, ctx.currentTime);
            gain.gain.setValueAtTime(0.2, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + duration);
        } catch(e) {}
    }

    function soundDrop() {
        playNeonSound(320, 0.12, "triangle");
    }
    function soundWin() {
        playNeonSound(587, 0.15, "sine");
        setTimeout(function() { playNeonSound(880, 0.35, "sine"); }, 120);
    }

    // DOM Elements
    var gridEl = document.getElementById("c4Grid");
    var dropZoneEl = document.getElementById("dropZone");
    var turnTextEl = document.getElementById("turnText");
    var turnDiscEl = document.getElementById("turnDisc");
    var scoreP1El = document.getElementById("scoreP1");
    var scoreP2El = document.getElementById("scoreP2");
    var scoreTiesEl = document.getElementById("scoreTies");
    var p2LabelEl = document.getElementById("p2Label");
    var resetBtn = document.getElementById("resetBtn");
    var modeAiBtn = document.getElementById("modeAiBtn");
    var mode2pBtn = document.getElementById("mode2pBtn");

    var victoryModal = document.getElementById("victoryModalOverlay");
    var victoryTitle = document.getElementById("victoryTitle");
    var victoryDesc = document.getElementById("victoryDesc");
    var victoryPlayAgain = document.getElementById("victoryPlayAgain");

    // Initialize Empty Board Matrix
    function initMatrix() {
        board = [];
        for (var r = 0; r < ROWS; r++) {
            var row = [];
            for (var c = 0; c < COLS; c++) {
                row.push(0);
            }
            board.push(row);
        }
    }

    // Render Grid DOM
    function renderBoardDOM() {
        if (!gridEl) return;
        gridEl.innerHTML = "";
        for (var r = 0; r < ROWS; r++) {
            for (var c = 0; c < COLS; c++) {
                var cell = document.createElement("div");
                cell.className = "c4-cell";
                cell.dataset.row = r;
                cell.dataset.col = c;
                cell.addEventListener("click", handleCellClick);
                gridEl.appendChild(cell);
            }
        }
    }

    // Render Column Drop Buttons
    function renderDropZone() {
        if (!dropZoneEl) return;
        dropZoneEl.innerHTML = "";
        for (var c = 0; c < COLS; c++) {
            var colBtn = document.createElement("button");
            colBtn.className = "col-selector-btn";
            colBtn.dataset.col = c;
            colBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5 5 5-5z"/></svg>';
            colBtn.setAttribute("aria-label", "Drop in column " + (c + 1));
            colBtn.addEventListener("click", function(e) {
                var col = parseInt(e.currentTarget.dataset.col, 10);
                dropDisc(col);
            });
            dropZoneEl.appendChild(colBtn);
        }
    }

    function handleCellClick(e) {
        var col = parseInt(e.currentTarget.dataset.col, 10);
        dropDisc(col);
    }

    // Drop Disc into specific Column
    function dropDisc(col) {
        if (!gameActive || isAiTurn) return;

        // Find lowest available row in column
        var targetRow = -1;
        for (var r = ROWS - 1; r >= 0; r--) {
            if (board[r][col] === 0) {
                targetRow = r;
                break;
            }
        }

        if (targetRow === -1) return; // Column full

        makeMove(targetRow, col, currentPlayer);
    }

    function makeMove(row, col, player) {
        board[row][col] = player;
        soundDrop();

        // Update DOM cell
        var cellIndex = row * COLS + col;
        var cellEl = gridEl.children[cellIndex];
        if (cellEl) {
            cellEl.classList.add(player === 1 ? "player1" : "player2");
        }

        // Check for Win
        var winCells = checkWin(row, col, player);
        if (winCells) {
            gameActive = false;
            soundWin();
            highlightWin(winCells);
            handleGameOver(player);
            return;
        }

        // Check for Tie
        if (checkTie()) {
            gameActive = false;
            scores.ties++;
            updateScoreUI();
            handleGameOver(0);
            return;
        }

        // Switch Player
        currentPlayer = currentPlayer === 1 ? 2 : 1;
        updateTurnUI();

        // If AI Mode and player 2 turn, trigger AI Move
        if (gameMode === "ai" && currentPlayer === 2 && gameActive) {
            isAiTurn = true;
            setTimeout(executeAiMove, 450);
        }
    }

    // AI logic: checks immediate winning move or blocking move, else center preference
    function executeAiMove() {
        if (!gameActive) {
            isAiTurn = false;
            return;
        }

        var chosenCol = -1;

        // 1. Check if AI can win immediately
        for (var c = 0; c < COLS; c++) {
            var r = getLowestRow(c);
            if (r !== -1) {
                board[r][c] = 2;
                if (checkWin(r, c, 2)) {
                    chosenCol = c;
                    board[r][c] = 0;
                    break;
                }
                board[r][c] = 0;
            }
        }

        // 2. Check if AI needs to block human player (1)
        if (chosenCol === -1) {
            for (var c = 0; c < COLS; c++) {
                var r = getLowestRow(c);
                if (r !== -1) {
                    board[r][c] = 1;
                    if (checkWin(r, c, 1)) {
                        chosenCol = c;
                        board[r][c] = 0;
                        break;
                    }
                    board[r][c] = 0;
                }
            }
        }

        // 3. Prefer central columns [3, 2, 4, 1, 5, 0, 6]
        if (chosenCol === -1) {
            var prefOrder = [3, 2, 4, 1, 5, 0, 6];
            for (var i = 0; i < prefOrder.length; i++) {
                var col = prefOrder[i];
                if (getLowestRow(col) !== -1) {
                    chosenCol = col;
                    break;
                }
            }
        }

        isAiTurn = false;
        if (chosenCol !== -1) {
            var targetRow = getLowestRow(chosenCol);
            makeMove(targetRow, chosenCol, 2);
        }
    }

    function getLowestRow(col) {
        for (var r = ROWS - 1; r >= 0; r--) {
            if (board[r][col] === 0) return r;
        }
        return -1;
    }

    // Win Checker: returns array of winning [r, c] or null
    function checkWin(row, col, player) {
        var directions = [
            [[0, 1], [0, -1]],  // Horizontal
            [[1, 0], [-1, 0]],  // Vertical
            [[1, 1], [-1, -1]],  // Diagonal \
            [[1, -1], [-1, 1]]   // Diagonal /
        ];

        for (var d = 0; d < directions.length; d++) {
            var line = [[row, col]];
            var dirPair = directions[d];

            for (var p = 0; p < 2; p++) {
                var dr = dirPair[p][0];
                var dc = dirPair[p][1];
                var r = row + dr;
                var c = col + dc;

                while (r >= 0 && r < ROWS && c >= 0 && c < COLS && board[r][c] === player) {
                    line.push([r, c]);
                    r += dr;
                    c += dc;
                }
            }

            if (line.length >= 4) {
                return line;
            }
        }
        return null;
    }

    function checkTie() {
        for (var c = 0; c < COLS; c++) {
            if (board[0][c] === 0) return false;
        }
        return true;
    }

    function highlightWin(cells) {
        for (var i = 0; i < cells.length; i++) {
            var r = cells[i][0];
            var c = cells[i][1];
            var idx = r * COLS + c;
            if (gridEl.children[idx]) {
                gridEl.children[idx].classList.add("win-highlight");
            }
        }
    }

    function handleGameOver(winner) {
        if (winner === 1) {
            scores.p1++;
            victoryTitle.innerHTML = '<span style="color:var(--cyan)">CYAN VICTORY!</span>';
            victoryDesc.textContent = gameMode === "ai" ? "Congratulations! You crushed the Cyber AI!" : "Player 1 takes the round!";
        } else if (winner === 2) {
            scores.p2++;
            victoryTitle.innerHTML = '<span style="color:var(--pink)">PINK VICTORY!</span>';
            victoryDesc.textContent = gameMode === "ai" ? "Cyber AI outsmarted you! Try again!" : "Player 2 takes the victory!";
        } else {
            victoryTitle.innerHTML = "<span>NEON STALEMATE</span>";
            victoryDesc.textContent = "The grid is locked! No line of four created.";
        }

        updateScoreUI();
        setTimeout(function() {
            if (victoryModal) victoryModal.classList.add("active");
        }, 600);
    }

    function updateTurnUI() {
        if (!turnTextEl || !turnDiscEl) return;
        if (currentPlayer === 1) {
            turnTextEl.textContent = "Player 1 (Cyan)";
            turnDiscEl.className = "disc-sample disc-p1";
        } else {
            turnTextEl.textContent = gameMode === "ai" ? "Cyber AI (Pink)" : "Player 2 (Pink)";
            turnDiscEl.className = "disc-sample disc-p2";
        }
    }

    function updateScoreUI() {
        if (scoreP1El) scoreP1El.textContent = scores.p1;
        if (scoreP2El) scoreP2El.textContent = scores.p2;
        if (scoreTiesEl) scoreTiesEl.textContent = scores.ties;
    }

    function resetGame() {
        initMatrix();
        renderBoardDOM();
        currentPlayer = 1;
        gameActive = true;
        isAiTurn = false;
        updateTurnUI();
        if (victoryModal) victoryModal.classList.remove("active");
    }

    // Setup event listeners
    if (resetBtn) resetBtn.addEventListener("click", resetGame);
    if (victoryPlayAgain) victoryPlayAgain.addEventListener("click", resetGame);

    if (modeAiBtn && mode2pBtn) {
        modeAiBtn.addEventListener("click", function() {
            gameMode = "ai";
            modeAiBtn.classList.add("active");
            mode2pBtn.classList.remove("active");
            if (p2LabelEl) p2LabelEl.textContent = "CYBER AI";
            resetGame();
        });
        mode2pBtn.addEventListener("click", function() {
            gameMode = "2p";
            mode2pBtn.classList.add("active");
            modeAiBtn.classList.remove("active");
            if (p2LabelEl) p2LabelEl.textContent = "PLAYER 2";
            resetGame();
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

    // Initialize on load
    initMatrix();
    renderDropZone();
    renderBoardDOM();
    updateTurnUI();
    updateScoreUI();
})();
