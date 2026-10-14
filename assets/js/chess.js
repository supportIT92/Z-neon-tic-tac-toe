/* ========================================================
   NEON CYBER CHESS — Complete Game Engine
   Rules: Standard Chess (Pawn, Knight, Bishop, Rook, Queen, King)
   Modes: 2-Player Local & Smart Cyber AI
   Features: Move validation, check detection, audio synth FX
======================================================== */

(function () {
    "use strict";

    var BOARD_SIZE = 8;
    var board = [];
    var turn = "w"; // 'w' = Cyan (White), 'b' = Pink (Black)
    var selectedSquare = null;
    var legalMoves = [];
    var gameMode = "ai"; // 'ai' or '2p'
    var isGameOver = false;
    var isAiThinking = false;
    var captured = { w: [], b: [] };

    // Standard Chess Unicode Symbols
    var PIECE_SYMBOLS = {
        'wP': '♙', 'wR': '♖', 'wN': '♘', 'wB': '♗', 'wQ': '♕', 'wK': '♔',
        'bP': '♟', 'bR': '♜', 'bN': '♞', 'bB': '♝', 'bQ': '♛', 'bK': '♚'
    };

    var PIECE_VALUES = {
        'P': 100, 'N': 320, 'B': 330, 'R': 500, 'Q': 900, 'K': 20000
    };

    // Audio synthesizer for chess moves & captures
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
            gain.gain.setValueAtTime(0.15, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + dur);
        } catch (e) {}
    }

    function soundMove() {
        playBeep(440, 0.09, "sine");
    }
    function soundCapture() {
        playBeep(260, 0.12, "triangle");
        setTimeout(function() { playBeep(520, 0.15, "sawtooth"); }, 60);
    }
    function soundCheck() {
        playBeep(650, 0.18, "sawtooth");
        setTimeout(function() { playBeep(880, 0.25, "sawtooth"); }, 120);
    }

    // DOM Elements
    var gridEl = document.getElementById("chessGrid");
    var turnIndicatorEl = document.getElementById("turnIndicator");
    var capturedWhiteEl = document.getElementById("capturedWhite");
    var capturedBlackEl = document.getElementById("capturedBlack");
    var modeAiBtn = document.getElementById("modeAiBtn");
    var mode2pBtn = document.getElementById("mode2pBtn");
    var resetBtn = document.getElementById("resetBtn");
    var victoryModal = document.getElementById("victoryModalOverlay");
    var victoryTitle = document.getElementById("victoryTitle");
    var victoryDesc = document.getElementById("victoryDesc");
    var victoryPlayAgain = document.getElementById("victoryPlayAgain");

    // Initial Board Setup
    function initBoard() {
        board = [
            ['bR', 'bN', 'bB', 'bQ', 'bK', 'bB', 'bN', 'bR'],
            ['bP', 'bP', 'bP', 'bP', 'bP', 'bP', 'bP', 'bP'],
            [null, null, null, null, null, null, null, null],
            [null, null, null, null, null, null, null, null],
            [null, null, null, null, null, null, null, null],
            [null, null, null, null, null, null, null, null],
            ['wP', 'wP', 'wP', 'wP', 'wP', 'wP', 'wP', 'wP'],
            ['wR', 'wN', 'wB', 'wQ', 'wK', 'wB', 'wN', 'wR']
        ];
        turn = "w";
        selectedSquare = null;
        legalMoves = [];
        isGameOver = false;
        isAiThinking = false;
        captured = { w: [], b: [] };
    }

    // Render Grid
    function renderBoard() {
        if (!gridEl) return;
        gridEl.innerHTML = "";

        var inCheckSquare = null;
        if (isKingInCheck(board, turn)) {
            var kingPos = findKing(board, turn);
            if (kingPos) inCheckSquare = kingPos.r + "," + kingPos.c;
        }

        for (var r = 0; r < BOARD_SIZE; r++) {
            for (var c = 0; c < BOARD_SIZE; c++) {
                var sq = document.createElement("div");
                var isLight = (r + c) % 2 === 0;
                sq.className = "square " + (isLight ? "light" : "dark");
                sq.dataset.row = r;
                sq.dataset.col = c;

                if (selectedSquare && selectedSquare.r === r && selectedSquare.c === c) {
                    sq.classList.add("selected");
                }

                // Highlight legal moves
                for (var m = 0; m < legalMoves.length; m++) {
                    if (legalMoves[m].r === r && legalMoves[m].c === c) {
                        if (board[r][c]) {
                            sq.classList.add("possible-capture");
                        } else {
                            sq.classList.add("possible-move");
                        }
                    }
                }

                if (inCheckSquare === r + "," + c) {
                    sq.classList.add("in-check");
                }

                var piece = board[r][c];
                if (piece) {
                    var pSpan = document.createElement("span");
                    pSpan.className = "piece " + (piece[0] === 'w' ? 'white' : 'black');
                    pSpan.textContent = PIECE_SYMBOLS[piece] || piece;
                    sq.appendChild(pSpan);
                }

                sq.addEventListener("click", handleSquareClick);
                gridEl.appendChild(sq);
            }
        }

        updateStatusUI();
    }

    function handleSquareClick(e) {
        if (isGameOver || isAiThinking) return;
        if (gameMode === "ai" && turn === "b") return; // AI's turn

        var r = parseInt(e.currentTarget.dataset.row, 10);
        var c = parseInt(e.currentTarget.dataset.col, 10);
        var piece = board[r][c];

        // 1. If clicking on one of current player's pieces -> Select it
        if (piece && piece[0] === turn) {
            selectedSquare = { r: r, c: c };
            legalMoves = getSafeLegalMoves(board, r, c, turn);
            renderBoard();
            return;
        }

        // 2. If a piece is already selected, check if clicked square is legal move
        if (selectedSquare) {
            var isLegal = false;
            for (var i = 0; i < legalMoves.length; i++) {
                if (legalMoves[i].r === r && legalMoves[i].c === c) {
                    isLegal = true;
                    break;
                }
            }

            if (isLegal) {
                executeMove(selectedSquare.r, selectedSquare.c, r, c);
                selectedSquare = null;
                legalMoves = [];
                renderBoard();

                // Trigger AI move if game mode is AI
                if (gameMode === "ai" && turn === "b" && !isGameOver) {
                    isAiThinking = true;
                    setTimeout(triggerAiMove, 450);
                }
                return;
            }
        }

        // Deselect if clicking on empty square or invalid move
        selectedSquare = null;
        legalMoves = [];
        renderBoard();
    }

    function executeMove(fromR, fromC, toR, toC) {
        var movingPiece = board[fromR][fromC];
        var destPiece = board[toR][toC];

        // Capture tracking
        if (destPiece) {
            captured[turn === "w" ? "w" : "b"].push(destPiece);
            soundCapture();
        } else {
            soundMove();
        }

        // Move piece
        board[toR][toC] = movingPiece;
        board[fromR][fromC] = null;

        // Pawn Promotion to Queen
        if (movingPiece === "wP" && toR === 0) board[toR][toC] = "wQ";
        if (movingPiece === "bP" && toR === 7) board[toR][toC] = "bQ";

        // Switch turn
        turn = (turn === "w") ? "b" : "w";

        // Check if opponent is in check or checkmate
        if (isKingInCheck(board, turn)) {
            soundCheck();
            if (isCheckmate(board, turn)) {
                handleGameOver(turn === "w" ? "Black" : "White", "Checkmate");
                return;
            }
        } else if (isStalemate(board, turn)) {
            handleGameOver("Draw", "Stalemate");
            return;
        }
    }

    // AI Minimax evaluation
    function triggerAiMove() {
        if (isGameOver) {
            isAiThinking = false;
            return;
        }

        var allMoves = getAllMoves(board, "b");
        if (allMoves.length === 0) {
            isAiThinking = false;
            return;
        }

        // Evaluate moves with priority: capture high value piece > escape check > central position
        var bestMove = null;
        var bestScore = -99999;

        // Shuffle for unpredictability
        allMoves.sort(function() { return 0.5 - Math.random(); });

        for (var i = 0; i < allMoves.length; i++) {
            var m = allMoves[i];
            var clone = cloneBoard(board);
            var capturedP = clone[m.toR][m.toC];

            clone[m.toR][m.toC] = clone[m.fromR][m.fromC];
            clone[m.fromR][m.fromC] = null;
            if (clone[m.toR][m.toC] === "bP" && m.toR === 7) clone[m.toR][m.toC] = "bQ";

            var score = 0;
            if (capturedP) {
                var val = PIECE_VALUES[capturedP[1]] || 50;
                score += val * 10;
            }

            // Central control bonus (rows 3,4 and cols 3,4)
            if (m.toR >= 2 && m.toR <= 5 && m.toC >= 2 && m.toC <= 5) score += 30;

            // Avoid putting self in opponent's crosshair
            if (isKingInCheck(clone, "w")) score += 60;

            if (score > bestScore) {
                bestScore = score;
                bestMove = m;
            }
        }

        isAiThinking = false;

        if (bestMove) {
            executeMove(bestMove.fromR, bestMove.fromC, bestMove.toR, bestMove.toC);
            renderBoard();
        }
    }

    // Get Raw Pseudo-legal moves for a piece
    function getPieceMoves(b, r, c) {
        var piece = b[r][c];
        if (!piece) return [];
        var color = piece[0];
        var type = piece[1];
        var moves = [];

        function addMove(nr, nc) {
            if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE) return false;
            var dest = b[nr][nc];
            if (!dest) {
                moves.push({ r: nr, c: nc });
                return true; // continue sliding
            }
            if (dest[0] !== color) {
                moves.push({ r: nr, c: nc });
            }
            return false; // blocked
        }

        if (type === "P") {
            var dir = (color === "w") ? -1 : 1;
            var startRow = (color === "w") ? 6 : 1;
            // 1 square forward
            if (r + dir >= 0 && r + dir < BOARD_SIZE && !b[r + dir][c]) {
                moves.push({ r: r + dir, c: c });
                // 2 squares forward from starting rank
                if (r === startRow && !b[r + dir * 2][c]) {
                    moves.push({ r: r + dir * 2, c: c });
                }
            }
            // Diagonal captures
            var capCols = [c - 1, c + 1];
            for (var i = 0; i < capCols.length; i++) {
                var cc = capCols[i];
                if (r + dir >= 0 && r + dir < BOARD_SIZE && cc >= 0 && cc < BOARD_SIZE) {
                    var target = b[r + dir][cc];
                    if (target && target[0] !== color) {
                        moves.push({ r: r + dir, c: cc });
                    }
                }
            }
        } else if (type === "N") {
            var knightOffsets = [
                [-2, -1], [-2, 1], [-1, -2], [-1, 2],
                [1, -2], [1, 2], [2, -1], [2, 1]
            ];
            for (var k = 0; k < knightOffsets.length; k++) {
                addMove(r + knightOffsets[k][0], c + knightOffsets[k][1]);
            }
        } else if (type === "B" || type === "R" || type === "Q") {
            var dirs = [];
            if (type === "B" || type === "Q") dirs.push([-1, -1], [-1, 1], [1, -1], [1, 1]);
            if (type === "R" || type === "Q") dirs.push([-1, 0], [1, 0], [0, -1], [0, 1]);

            for (var d = 0; d < dirs.length; d++) {
                var dr = dirs[d][0];
                var dc = dirs[d][1];
                var step = 1;
                while (addMove(r + dr * step, c + dc * step)) {
                    step++;
                }
            }
        } else if (type === "K") {
            var kingOffsets = [
                [-1, -1], [-1, 0], [-1, 1],
                [0, -1],           [0, 1],
                [1, -1],  [1, 0],  [1, 1]
            ];
            for (var ko = 0; ko < kingOffsets.length; ko++) {
                addMove(r + kingOffsets[ko][0], c + kingOffsets[ko][1]);
            }
        }

        return moves;
    }

    // Filter moves that would leave own King in Check
    function getSafeLegalMoves(b, r, c, color) {
        var rawMoves = getPieceMoves(b, r, c);
        var safeMoves = [];

        for (var i = 0; i < rawMoves.length; i++) {
            var m = rawMoves[i];
            var clone = cloneBoard(b);
            clone[m.r][m.c] = clone[r][c];
            clone[r][c] = null;

            if (!isKingInCheck(clone, color)) {
                safeMoves.push(m);
            }
        }

        return safeMoves;
    }

    function getAllMoves(b, color) {
        var all = [];
        for (var r = 0; r < BOARD_SIZE; r++) {
            for (var c = 0; c < BOARD_SIZE; c++) {
                if (b[r][c] && b[r][c][0] === color) {
                    var safe = getSafeLegalMoves(b, r, c, color);
                    for (var s = 0; s < safe.length; s++) {
                        all.push({ fromR: r, fromC: c, toR: safe[s].r, toC: safe[s].c });
                    }
                }
            }
        }
        return all;
    }

    function findKing(b, color) {
        var target = color + "K";
        for (var r = 0; r < BOARD_SIZE; r++) {
            for (var c = 0; c < BOARD_SIZE; c++) {
                if (b[r][c] === target) return { r: r, c: c };
            }
        }
        return null;
    }

    function isKingInCheck(b, color) {
        var king = findKing(b, color);
        if (!king) return false;
        var opponentColor = (color === "w") ? "b" : "w";

        for (var r = 0; r < BOARD_SIZE; r++) {
            for (var c = 0; c < BOARD_SIZE; c++) {
                if (b[r][c] && b[r][c][0] === opponentColor) {
                    var moves = getPieceMoves(b, r, c);
                    for (var m = 0; m < moves.length; m++) {
                        if (moves[m].r === king.r && moves[m].c === king.c) {
                            return true;
                        }
                    }
                }
            }
        }
        return false;
    }

    function isCheckmate(b, color) {
        return isKingInCheck(b, color) && getAllMoves(b, color).length === 0;
    }

    function isStalemate(b, color) {
        return !isKingInCheck(b, color) && getAllMoves(b, color).length === 0;
    }

    function cloneBoard(b) {
        var res = [];
        for (var i = 0; i < b.length; i++) {
            res.push(b[i].slice());
        }
        return res;
    }

    function handleGameOver(winner, reason) {
        isGameOver = true;
        if (winner === "Draw") {
            victoryTitle.innerHTML = '<span style="color:#ffffff">NEON DRAW!</span>';
            victoryDesc.textContent = "The cyber battle ends in a stalemate.";
        } else {
            var isCyan = winner === "White";
            var colorHex = isCyan ? "var(--cyan)" : "var(--pink)";
            var winnerName = isCyan ? "CYAN" : (gameMode === "ai" ? "CYBER AI" : "PINK");
            victoryTitle.innerHTML = '<span style="color:' + colorHex + '">' + winnerName + ' WINS!</span>';
            victoryDesc.textContent = reason + "! Superior tactical dominance.";
        }

        setTimeout(function() {
            if (victoryModal) victoryModal.classList.add("active");
        }, 500);
    }

    function updateStatusUI() {
        if (turnIndicatorEl) {
            var dot = turn === "w" ? '<span class="turn-dot turn-white"></span>' : '<span class="turn-dot turn-black"></span>';
            var name = turn === "w" ? "Cyan (White)" : (gameMode === "ai" ? "Cyber AI (Pink)" : "Pink (Black)");
            turnIndicatorEl.innerHTML = dot + "<span>" + name + "</span>";
        }

        if (capturedWhiteEl) {
            capturedWhiteEl.textContent = captured.w.map(function(p) { return PIECE_SYMBOLS[p] || ''; }).join(" ");
        }
        if (capturedBlackEl) {
            capturedBlackEl.textContent = captured.b.map(function(p) { return PIECE_SYMBOLS[p] || ''; }).join(" ");
        }
    }

    function resetGame() {
        initBoard();
        renderBoard();
        if (victoryModal) victoryModal.classList.remove("active");
    }

    // Event Bindings
    if (resetBtn) resetBtn.addEventListener("click", resetGame);
    if (victoryPlayAgain) victoryPlayAgain.addEventListener("click", resetGame);

    if (modeAiBtn && mode2pBtn) {
        modeAiBtn.addEventListener("click", function() {
            gameMode = "ai";
            modeAiBtn.classList.add("active");
            mode2pBtn.classList.remove("active");
            resetGame();
        });
        mode2pBtn.addEventListener("click", function() {
            gameMode = "2p";
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

    // Initialize
    initBoard();
    renderBoard();
})();
