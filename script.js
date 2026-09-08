// ============================================================
// NEON TIC TAC TOE — Enhanced & Secured Script
// Features: Minimax AI, Match formats, Undo (2P), Keyboard nav,
//           Persistent stats, Sound prefs, Full accessibility
// ============================================================

// =============================
// SECURITY HELPER
// =============================

/**
 * Sanitise a raw string before inserting into the DOM as text.
 * Strips tags and trims whitespace. Returns a safe fallback if empty.
 */
function sanitiseName(raw, fallback) {
    if (typeof raw !== "string") return fallback;
    // Remove any HTML tags, trim, collapse whitespace
    const cleaned = raw
        .replace(/<[^>]*>/g, "")
        .replace(/[&<>"'/]/g, (ch) => {
            const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "/": "&#x2F;" };
            return map[ch] || ch;
        })
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, 15); // Hard cap at 15 chars (matches maxlength)
    return cleaned === "" ? fallback : cleaned;
}

/**
 * Safe localStorage getter — returns null on any error.
 */
function lsGet(key) {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

/**
 * Safe localStorage setter — silently fails if storage is full or blocked.
 */
function lsSet(key, value) {
    try {
        localStorage.setItem(key, String(value));
    } catch {
        // Storage full or access denied — continue without persisting
    }
}

// =============================
// ELEMENTS
// =============================

const homeScreen        = document.getElementById("homeScreen");
const modeScreen        = document.getElementById("modeScreen");
const setupScreen       = document.getElementById("setupScreen");
const gameScreen        = document.getElementById("gameScreen");
const roundLabel        = document.getElementById("roundLabel");
const roundDots         = document.getElementById("roundDots");
const confettiContainer = document.getElementById("confettiContainer");
const victoryOverlay    = document.getElementById("victoryOverlay");
const victoryTitle      = document.getElementById("victoryTitle");
const victoryMessage    = document.getElementById("victoryMessage");
const playAgainButton   = document.getElementById("playAgainButton");
const homeButton        = document.getElementById("homeButton");
const playButton        = document.getElementById("playButton");
const twoPlayerButton   = document.getElementById("twoPlayerButton");
const computerButton    = document.getElementById("computerButton");
const backHomeButton    = document.getElementById("backHomeButton");
const backModeButton    = document.getElementById("backModeButton");
const startMatchButton  = document.getElementById("startMatchButton");
const playerXInput      = document.getElementById("playerXInput");
const playerOInput      = document.getElementById("playerOInput");
const playerXLabel      = document.getElementById("playerXLabel");
const playerOLabel      = document.getElementById("playerOLabel");
const difficultyBox     = document.getElementById("difficultyBox");
const difficultyButtons = document.querySelectorAll(".difficulty-button");
const formatButtons     = document.querySelectorAll(".format-button");
const soundButton       = document.getElementById("soundButton");
const themeButton       = document.getElementById("themeButton");
const rulesButton       = document.getElementById("rulesButton");
const rulesButtonGame   = document.getElementById("rulesButtonGame");
const rulesModal        = document.getElementById("rulesModal");
const closeRulesButton  = document.getElementById("closeRulesButton");
const bestScoreLabel    = document.getElementById("bestScoreLabel");
const activeModeLabel   = document.getElementById("activeModeLabel");
const cells             = document.querySelectorAll(".cell");
const turnSymbol        = document.getElementById("turnSymbol");
const turnText          = document.getElementById("turnText");
const message           = document.getElementById("message");
const scoreXElement     = document.getElementById("scoreX");
const scoreOElement     = document.getElementById("scoreO");
const winsXElement      = document.getElementById("winsX");
const winsOElement      = document.getElementById("winsO");
const playerXName       = document.getElementById("playerXName");
const playerOName       = document.getElementById("playerOName");
const newGameButton     = document.getElementById("newGameButton");
const resetButton       = document.getElementById("resetButton");
const undoButton        = document.getElementById("undoButton");
const backGameButton    = document.getElementById("backGameButton");
const playerCardX       = document.getElementById("playerCardX");
const playerCardO       = document.getElementById("playerCardO");

// =============================
// AUDIO
// =============================

const backgroundMusic = document.getElementById("backgroundMusic");
const clickSound      = document.getElementById("clickSound");
const winSound        = document.getElementById("winSound");

// Restore persisted sound preference (default: on)
let soundOn = lsGet("neonTicSound") !== "false";

// In-memory best score fallback (works even if localStorage is blocked)
let _memBestScore = 0;

// =============================
// THEME
// =============================

let currentTheme = lsGet("neonTicTheme") || "dark";

// =============================
// GAME STATE
// =============================

let board         = ["", "", "", "", "", "", "", "", ""];
let moveHistory   = []; // Stack of { index, player } for undo
let currentPlayer = "X";
let gameActive    = true;

let scoreX = 0;
let scoreO = 0;
let winsX  = 0;
let winsO  = 0;

let statsNameX = "";
let statsNameO = "";

let gameMode    = "two-player";
let difficulty  = "easy";
let nameX       = "PLAYER X";
let nameO       = "PLAYER O";
let matchFormat = 3;
let roundsToWin = 2;
let matchOver   = false;
let roundsPlayed = 0;

// Track element that had focus before a modal opened, for restoration
let preModalFocus = null;

// =============================
// WINNING PATTERNS
// =============================

const winningPatterns = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // cols
    [0, 4, 8], [2, 4, 6]             // diagonals
];

// =============================
// SAVED STATS
// =============================

function getPlayerWins(name) {
    if (!name) return 0;
    const key = `neonTicTacToeWins_${name.trim().toLowerCase()}`;
    const saved = lsGet(key);
    const num = Number(saved);
    return Number.isFinite(num) && num >= 0 ? num : 0;
}

function savePlayerWins(name, wins) {
    if (!name) return;
    const safeWins = Math.max(0, Number(wins) || 0);
    const key = `neonTicTacToeWins_${name.trim().toLowerCase()}`;
    lsSet(key, safeWins);
}

function getBestScore() {
    const saved = Number(lsGet("neonTicBestScore") || 0);
    const fromStorage = Number.isFinite(saved) && saved >= 0 ? saved : 0;
    // Return whichever is higher — in-memory value survives even if storage is blocked
    return Math.max(_memBestScore, fromStorage);
}

function saveBestScore(value) {
    const best = Math.max(0, Number(value) || 0);
    _memBestScore = best;           // always update in-memory
    lsSet("neonTicBestScore", best); // also try to persist
    if (bestScoreLabel) bestScoreLabel.textContent = String(best);
}

function updateQuickStats() {
    if (bestScoreLabel) bestScoreLabel.textContent = String(getBestScore());
    if (activeModeLabel) activeModeLabel.textContent = gameMode === "computer" ? "AI" : "2P";
}

// =============================
// THEME
// =============================

function applyTheme() {
    const isLight = currentTheme === "light";
    document.body.classList.toggle("light-theme", isLight);
    if (themeButton) {
        themeButton.textContent = isLight ? "☀️" : "🌙";
        themeButton.setAttribute("aria-label", isLight ? "Switch to dark mode" : "Switch to light mode");
    }
}

function toggleTheme() {
    currentTheme = currentTheme === "light" ? "dark" : "light";
    lsSet("neonTicTheme", currentTheme);
    applyTheme();
}

// =============================
// MODALS — open / close with
//          focus management
// =============================

function openModal(modal) {
    if (!modal) return;
    preModalFocus = document.activeElement;
    modal.classList.add("active");
    modal.setAttribute("aria-hidden", "false");
    // Move focus into the modal
    const firstFocusable = modal.querySelector(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (firstFocusable) firstFocusable.focus();
    // Trap focus inside modal
    modal.addEventListener("keydown", trapFocus);
}

function closeModal(modal) {
    if (!modal) return;
    modal.classList.remove("active");
    modal.setAttribute("aria-hidden", "true");
    modal.removeEventListener("keydown", trapFocus);
    // Restore focus to the element that opened the modal
    if (preModalFocus) preModalFocus.focus();
    preModalFocus = null;
}

function trapFocus(event) {
    if (event.key !== "Tab") return;
    const focusable = Array.from(
        event.currentTarget.querySelectorAll(
            'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
    );
    if (focusable.length === 0) { event.preventDefault(); return; }
    const first = focusable[0];
    const last  = focusable[focusable.length - 1];
    if (event.shiftKey) {
        if (document.activeElement === first) { event.preventDefault(); last.focus(); }
    } else {
        if (document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
}

function openRules() { openModal(rulesModal); }
function closeRules() { closeModal(rulesModal); }

// =============================
// RULES BUTTON WIRING
// =============================

if (themeButton)       themeButton.addEventListener("click", toggleTheme);
if (rulesButton)       rulesButton.addEventListener("click", openRules);
if (rulesButtonGame)   rulesButtonGame.addEventListener("click", openRules);
if (closeRulesButton)  closeRulesButton.addEventListener("click", closeRules);

// Close modal on backdrop click
if (rulesModal) {
    rulesModal.addEventListener("click", (event) => {
        if (event.target === rulesModal) closeRules();
    });
}

// Close modals on Escape
document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
        if (rulesModal && rulesModal.classList.contains("active")) closeRules();
    }
});

// =============================
// HOME → MODE
// =============================

playButton.addEventListener("click", () => {
    homeScreen.style.display = "none";
    modeScreen.classList.add("active");
    updateQuickStats();
});

// =============================
// MODE SELECTION
// =============================

twoPlayerButton.addEventListener("click", () => {
    gameMode = "two-player";
    updateQuickStats();
    openSetup();
});

computerButton.addEventListener("click", () => {
    gameMode = "computer";
    updateQuickStats();
    openSetup();
});

// =============================
// OPEN SETUP
// =============================

function openSetup() {
    modeScreen.classList.remove("active");
    setupScreen.classList.add("active");

    if (gameMode === "computer") {
        playerXLabel.textContent    = "YOUR NAME";
        playerOLabel.textContent    = "COMPUTER";
        playerOInput.value          = "COMPUTER";
        playerOInput.disabled       = true;
        difficultyBox.style.display = "block";
    } else {
        playerXLabel.textContent    = "PLAYER X NAME";
        playerOLabel.textContent    = "PLAYER O NAME";
        playerOInput.value          = "";
        playerOInput.disabled       = false;
        difficultyBox.style.display = "none";
    }

    playerXInput.focus();
}

// =============================
// BACK NAVIGATION
// =============================

backHomeButton.addEventListener("click", () => {
    modeScreen.classList.remove("active");
    updateQuickStats();
    homeScreen.style.display = "flex";
});

backModeButton.addEventListener("click", () => {
    setupScreen.classList.remove("active");
    modeScreen.classList.add("active");
});

backGameButton.addEventListener("click", () => {
    gameScreen.classList.remove("active");
    modeScreen.classList.add("active");
    backgroundMusic.pause();
});

// =============================
// DIFFICULTY BUTTONS
// =============================

difficultyButtons.forEach((button) => {
    button.addEventListener("click", () => {
        difficultyButtons.forEach((item) => {
            item.classList.remove("active");
            item.setAttribute("aria-pressed", "false");
        });
        button.classList.add("active");
        button.setAttribute("aria-pressed", "true");
        difficulty = button.dataset.level;
    });
});

// =============================
// MATCH FORMAT BUTTONS
// =============================

formatButtons.forEach((button) => {
    button.addEventListener("click", () => {
        formatButtons.forEach((item) => {
            item.classList.remove("active");
            item.setAttribute("aria-pressed", "false");
        });
        button.classList.add("active");
        button.setAttribute("aria-pressed", "true");
        matchFormat  = Number(button.dataset.format);
        roundsToWin  = Math.ceil(matchFormat / 2); // Works for any format
    });
});

// =============================
// START MATCH
// =============================

startMatchButton.addEventListener("click", startMatch);

// Also allow Enter on setup inputs to start match
[playerXInput, playerOInput].forEach((input) => {
    input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") startMatch();
    });
});

function startMatch() {
    // Sanitise names before using anywhere in the DOM
    nameX = sanitiseName(playerXInput.value, gameMode === "computer" ? "YOU" : "PLAYER X");
    nameO = gameMode === "two-player"
        ? sanitiseName(playerOInput.value, "PLAYER O")
        : "COMPUTER";

    // Safe text insertion — never innerHTML
    playerXName.textContent = nameX;
    playerOName.textContent = nameO;

    const currentNameX = nameX.trim().toLowerCase();
    const currentNameO = nameO.trim().toLowerCase();

    // Only reload stats when player identity changes
    if (statsNameX !== currentNameX) {
        winsX      = getPlayerWins(nameX);
        statsNameX = currentNameX;
    }
    if (statsNameO !== currentNameO) {
        winsO      = getPlayerWins(nameO);
        statsNameO = currentNameO;
    }

    winsXElement.textContent = String(winsX);
    winsOElement.textContent = String(winsO);

    setupScreen.classList.remove("active");
    gameScreen.classList.add("active");

    scoreX       = 0;
    scoreO       = 0;
    matchOver    = false;
    roundsPlayed = 0;

    scoreXElement.textContent = "0";
    scoreOElement.textContent = "0";

    resetBoard();
    updateRoundProgress();

    // Start background music only if not already playing
    if (soundOn && backgroundMusic.paused) {
        backgroundMusic.volume = 0.2;
        backgroundMusic.play().catch(() => {});
    }
}

// =============================
// CELL CLICK
// =============================

cells.forEach((cell) => {
    cell.addEventListener("click", handleCellClick);
});

function handleCellClick(event) {
    const index = Number(event.currentTarget.dataset.index);
    if (board[index] !== "" || !gameActive) return;
    if (gameMode === "computer" && currentPlayer === "O") return;

    const finished = makeMove(index, currentPlayer);
    if (finished || !gameActive) return;

    if (gameMode === "computer") {
        currentPlayer = "O";
        updateTurn();
        setTimeout(computerMove, 600);
    }
}

// =============================
// KEYBOARD BOARD NAVIGATION
// =============================

// Arrow keys move focus between cells; Enter/Space plays the cell
document.addEventListener("keydown", (event) => {
    const focused = document.activeElement;
    if (!focused || !focused.classList.contains("cell")) return;

    const index = Number(focused.dataset.index);
    const keyMap = {
        ArrowRight: index + 1,
        ArrowLeft:  index - 1,
        ArrowDown:  index + 3,
        ArrowUp:    index - 3,
    };

    if (event.key in keyMap) {
        event.preventDefault();
        const next = keyMap[event.key];
        if (next >= 0 && next <= 8) cells[next].focus();
    }
});

// =============================
// MAKE MOVE
// =============================

/**
 * Shared draw detection helper — avoids duplicated logic.
 */
function isBoardFull() {
    return board.every((v) => v !== "");
}

function makeMove(index, player) {
    board[index] = player;
    cells[index].textContent = player;
    cells[index].classList.add(player.toLowerCase());
    // Update aria-label to reflect played state
    cells[index].setAttribute("aria-label",
        cells[index].getAttribute("aria-label").split(" —")[0] + ` — ${player}`);

    playClick();

    // Record in history for undo (only meaningful in 2-player)
    moveHistory.push({ index, player });
    updateUndoButton();

    const winningPattern = checkWinner();
    if (winningPattern) {
        finishGame(winningPattern, player);
        return true;
    }

    if (isBoardFull()) {
        handleDraw();
        return true;
    }

    if (gameMode === "two-player") {
        currentPlayer = currentPlayer === "X" ? "O" : "X";
        updateTurn();
        updateActivePlayerCard();
    }

    return false;
}

// =============================
// DRAW HANDLER (shared)
// =============================

function handleDraw() {
    gameActive               = false;
    message.textContent      = "🤝 GAME DRAW!";
    turnText.textContent     = "DRAW";

    // Fix: increment round counter on draw too
    roundsPlayed++;
    updateRoundProgress();
    updateActivePlayerCard(); // clear active highlight

    matchOver = true;
    showDrawScreen();
}

// =============================
// COMPUTER MOVE
// =============================

function computerMove() {
    if (!gameActive || gameMode !== "computer") return;

    let move;
    if (difficulty === "easy")        move = easyMove();
    else if (difficulty === "medium") move = mediumMove();
    else                              move = hardMove();

    if (move === -1) return;

    const finished = makeComputerMove(move);

    if (!finished && gameActive) {
        currentPlayer = "X";
        updateTurn();
    }
}

function makeComputerMove(index) {
    board[index] = "O";
    cells[index].textContent = "O";
    cells[index].classList.add("o");
    cells[index].setAttribute("aria-label",
        cells[index].getAttribute("aria-label").split(" —")[0] + " — O");

    playClick();

    const winningPattern = checkWinner();
    if (winningPattern) {
        finishGame(winningPattern, "O");
        return true;
    }

    if (isBoardFull()) {
        handleDraw();
        return true;
    }

    return false;
}

// =============================
// AI: EASY
// =============================

function easyMove() {
    const empty = getEmptyCells();
    if (empty.length === 0) return -1;
    return empty[Math.floor(Math.random() * empty.length)];
}

// =============================
// AI: MEDIUM
// =============================

function mediumMove() {
    let move = findWinningMove("O");
    if (move !== -1) return move;

    move = findWinningMove("X");
    if (move !== -1) return move;

    if (board[4] === "") return 4;

    return easyMove();
}

// =============================
// AI: HARD (Minimax)
// =============================

function hardMove() {
    return minimax(board.slice(), "O").index;
}

// =============================
// FIND WINNING MOVE
// =============================

function findWinningMove(player) {
    for (let i = 0; i < board.length; i++) {
        if (board[i] !== "") continue;
        board[i] = player;
        const winning = checkWinner();
        board[i] = "";
        if (winning) return i;
    }
    return -1;
}

// =============================
// GET EMPTY CELLS
// =============================

function getEmptyCells() {
    return board.reduce((acc, val, idx) => {
        if (val === "") acc.push(idx);
        return acc;
    }, []);
}

// =============================
// MINIMAX (uses copy — safe)
// =============================

function minimax(position, player) {
    const available = position.reduce((acc, v, i) => {
        if (v === "") acc.push(i);
        return acc;
    }, []);

    if (checkWinnerForBoard(position, "X")) return { score: -10 };
    if (checkWinnerForBoard(position, "O")) return { score: 10 };
    if (available.length === 0)             return { score: 0 };

    const moves = [];

    for (const index of available) {
        const next = position.slice();
        next[index] = player;
        const result = minimax(next, player === "O" ? "X" : "O");
        moves.push({ index, score: result.score });
    }

    if (player === "O") {
        return moves.reduce((best, m) => m.score > best.score ? m : best, { score: -Infinity });
    } else {
        return moves.reduce((best, m) => m.score < best.score ? m : best, { score: Infinity });
    }
}

// =============================
// WINNER CHECK (board array)
// =============================

function checkWinnerForBoard(currentBoard, player) {
    return winningPatterns.some((pattern) =>
        pattern.every((idx) => currentBoard[idx] === player)
    );
}

// =============================
// CHECK WINNER (live board)
// =============================

function checkWinner() {
    for (const pattern of winningPatterns) {
        const [a, b, c] = pattern;
        if (board[a] !== "" && board[a] === board[b] && board[a] === board[c]) {
            return pattern;
        }
    }
    return null;
}

// =============================
// FINISH GAME (round win)
// =============================

function finishGame(winningPattern, winner) {
    gameActive = false;

    // Highlight winning cells
    winningPattern.forEach((index) => cells[index].classList.add("winner"));

    // Clear undo history — round is decided
    moveHistory = [];
    updateUndoButton();

    // Count round
    roundsPlayed++;
    updateRoundProgress();
    updateActivePlayerCard(); // clear highlight

    // Update round score
    if (winner === "X") {
        scoreX++;
        scoreXElement.textContent = String(scoreX);
    } else {
        scoreO++;
        scoreOElement.textContent = String(scoreO);
    }

    // Persist best score
    const currentBest = Math.max(scoreX, scoreO, getBestScore());
    saveBestScore(currentBest);

    playWin();

    // ---- Match win? ----
    if (scoreX >= roundsToWin || scoreO >= roundsToWin) {
        matchOver = true;

        // Persist lifetime wins
        if (winner === "X") {
            winsX++;
            savePlayerWins(nameX, winsX);
            winsXElement.textContent = String(winsX);
        } else {
            winsO++;
            savePlayerWins(nameO, winsO);
            winsOElement.textContent = String(winsO);
        }

        showMatchWinner(winner);
        return;
    }

    // ---- All rounds exhausted (tie in rounds) ----
    if (roundsPlayed >= matchFormat) {
        matchOver = true;
        showDrawScreen();
        return;
    }

    // ---- Round win message → auto-advance ----
    const winnerName = winner === "X" ? nameX : (gameMode === "computer" ? "Computer" : nameO);
    message.textContent = `${winnerName} won this round!`;

    setTimeout(() => {
        if (!matchOver) resetBoard();
    }, 1200);
}

// =============================
// UNDO LAST MOVE (2P only)
// =============================

undoButton.addEventListener("click", undoMove);

function undoMove() {
    // Only allow in 2-player mode, during an active game, when there's history
    if (gameMode !== "two-player" || !gameActive || moveHistory.length === 0) return;

    const last = moveHistory.pop();
    board[last.index] = "";
    cells[last.index].textContent = "";
    cells[last.index].classList.remove("x", "o", "winner");
    // Restore aria-label to position-only
    const baseLabel = cells[last.index].getAttribute("aria-label").split(" —")[0];
    cells[last.index].setAttribute("aria-label", baseLabel);

    currentPlayer = last.player;
    updateTurn();
    updateActivePlayerCard();
    updateUndoButton();

    message.textContent = "Move undone!";
}

function updateUndoButton() {
    if (!undoButton) return;
    const canUndo = gameMode === "two-player" && gameActive && moveHistory.length > 0;
    undoButton.disabled = !canUndo;
}

// =============================
// ACTIVE PLAYER CARD HIGHLIGHT
// =============================

function updateActivePlayerCard() {
    if (!playerCardX || !playerCardO) return;
    if (!gameActive || matchOver) {
        playerCardX.classList.remove("active-player");
        playerCardO.classList.remove("active-player");
        return;
    }
    if (currentPlayer === "X") {
        playerCardX.classList.add("active-player");
        playerCardO.classList.remove("active-player");
    } else {
        playerCardO.classList.add("active-player");
        playerCardX.classList.remove("active-player");
    }
}

// =============================
// PLAY AGAIN
// =============================

playAgainButton.addEventListener("click", () => {
    closeVictoryOverlay();
    scoreX = 0;
    scoreO = 0;
    scoreXElement.textContent = "0";
    scoreOElement.textContent = "0";
    roundsPlayed = 0;
    matchOver    = false;
    resetBoard();
    updateRoundProgress();
});

// =============================
// HOME FROM VICTORY
// =============================

homeButton.addEventListener("click", () => {
    closeVictoryOverlay();
    gameScreen.classList.remove("active");
    setupScreen.classList.remove("active");
    modeScreen.classList.remove("active");
    updateQuickStats();
    homeScreen.style.display = "flex";
    backgroundMusic.pause();
});

// =============================
// CLOSE VICTORY OVERLAY
// =============================

function closeVictoryOverlay() {
    victoryOverlay.classList.remove("active", "draw");
    victoryOverlay.setAttribute("aria-hidden", "true");
    confettiContainer.innerHTML = "";
}

// =============================
// NEW ROUND BUTTON
// =============================

newGameButton.addEventListener("click", () => {
    if (matchOver) return; // silently ignore when match is over
    resetBoard();
});

// =============================
// RESET SCORE
// =============================

resetButton.addEventListener("click", () => {
    // Fix: only reset current session round scores, NOT persistent lifetime wins
    scoreX = 0;
    scoreO = 0;
    scoreXElement.textContent = "0";
    scoreOElement.textContent = "0";
    roundsPlayed = 0;
    matchOver    = false;
    updateRoundProgress();
    resetBoard();
    message.textContent = "Score reset!";
});

// =============================
// RESET BOARD
// =============================

function resetBoard() {
    if (matchOver) return;

    board         = ["", "", "", "", "", "", "", "", ""];
    moveHistory   = [];
    currentPlayer = "X";
    gameActive    = true;

    cells.forEach((cell) => {
        const baseLabel = cell.getAttribute("aria-label").split(" —")[0];
        cell.textContent = "";
        cell.setAttribute("aria-label", baseLabel);
        cell.classList.remove("x", "o", "winner");
    });

    message.textContent = `Your turn, ${nameX}!`;

    updateTurn();
    updateActivePlayerCard();
    updateUndoButton();
}

// =============================
// UPDATE TURN DISPLAY
// =============================

function updateTurn() {
    turnSymbol.textContent = currentPlayer;

    if (gameMode === "computer") {
        turnText.textContent = currentPlayer === "X"
            ? `${nameX}'S TURN`
            : "COMPUTER'S TURN";
    } else {
        turnText.textContent = currentPlayer === "X"
            ? `${nameX}'S TURN`
            : `${nameO}'S TURN`;
    }

    // Colour the symbol
    turnSymbol.style.color      = currentPlayer === "X" ? "#00f7ff" : "#ff2bd6";
    turnSymbol.style.textShadow = currentPlayer === "X"
        ? "0 0 15px #00f7ff"
        : "0 0 15px #ff2bd6";
}

// =============================
// SOUND HELPERS
// =============================

function playClick() {
    if (!soundOn) return;
    clickSound.currentTime = 0;
    clickSound.volume      = 0.5;
    clickSound.play().catch(() => {});
}

function playWin() {
    if (!soundOn) return;
    winSound.currentTime = 0;
    winSound.volume      = 0.7;
    winSound.play().catch(() => {});
}

// =============================
// SOUND BUTTON
// =============================

soundButton.addEventListener("click", () => {
    soundOn = !soundOn;
    lsSet("neonTicSound", String(soundOn));
    _updateSoundUI(soundButton, soundOn);
    if (soundOn) backgroundMusic.play().catch(() => {});
    else         backgroundMusic.pause();
});

// Online game sound button — same behaviour
(function() {
    const onlineSoundBtn = document.getElementById("onlineSoundBtn");
    if (!onlineSoundBtn) return;
    // Set initial icon to match current soundOn state
    _updateSoundUI(onlineSoundBtn, soundOn);
    onlineSoundBtn.addEventListener("click", () => {
        soundOn = !soundOn;
        lsSet("neonTicSound", String(soundOn));
        _updateSoundUI(soundButton, soundOn);
        _updateSoundUI(onlineSoundBtn, soundOn);
        if (soundOn) backgroundMusic.play().catch(() => {});
        else         backgroundMusic.pause();
    });
}());

function _updateSoundUI(btn, on) {
    if (!btn) return;
    btn.innerHTML = on
        ? SVG_ICONS.soundOn
        : SVG_ICONS.soundOff;
    btn.setAttribute("aria-label", on ? "Mute sound" : "Unmute sound");
}

// =============================
// MATCH WINNER OVERLAY
// =============================

function showMatchWinner(winner) {
    if (gameMode === "computer") {
        if (winner === "X") {
            victoryTitle.textContent   = "MATCH WON! 🏆";
            victoryMessage.textContent = `${nameX} beat the AI in ${matchFormat === 3 ? "Best of 3" : "Best of 5"}!`;
        } else {
            victoryTitle.textContent   = "COMPUTER WINS 🤖";
            victoryMessage.textContent = `The AI won the ${matchFormat === 3 ? "Best of 3" : "Best of 5"} match.`;
        }
    } else {
        const winnerName = winner === "X" ? nameX : nameO;
        victoryTitle.textContent   = "MATCH WON! 🏆";
        victoryMessage.textContent = `${winnerName} won the ${matchFormat === 3 ? "Best of 3" : "Best of 5"} match!`;
    }

    victoryOverlay.classList.remove("draw");
    victoryOverlay.classList.add("active");
    victoryOverlay.setAttribute("aria-hidden", "false");

    document.querySelector(".victory-icon").textContent = "🏆";
    createConfetti(100);

    // Move focus into the overlay for accessibility
    setTimeout(() => playAgainButton.focus(), 50);
}

// =============================
// DRAW SCREEN
// =============================

function showDrawScreen() {
    victoryTitle.textContent   = "IT'S A DRAW! 🤝";
    victoryMessage.textContent = "Nobody won this match.";

    document.querySelector(".victory-icon").textContent = "🤝";

    victoryOverlay.classList.add("active", "draw");
    victoryOverlay.setAttribute("aria-hidden", "false");

    createConfetti(35);
    setTimeout(() => playAgainButton.focus(), 50);
}

// =============================
// MATCH PROGRESS DOTS
// =============================

function updateRoundProgress() {
    const currentRound = Math.min(roundsPlayed + 1, matchFormat);
    roundLabel.textContent = `ROUND ${currentRound} OF ${matchFormat}`;
    roundDots.innerHTML    = "";

    for (let i = 1; i <= matchFormat; i++) {
        const dot = document.createElement("div");
        dot.classList.add("round-dot");

        if (i <= roundsPlayed) {
            dot.classList.add("played");
        } else if (i === currentRound && !matchOver) {
            dot.classList.add("current");
        }

        roundDots.appendChild(dot);
    }
}

// =============================
// CONFETTI
// =============================

function createConfetti(amount = 60) {
    confettiContainer.innerHTML = "";

    for (let i = 0; i < amount; i++) {
        const piece = document.createElement("div");
        piece.className = "confetti";
        piece.style.left             = Math.random() * 100 + "%";
        piece.style.animationDelay   = Math.random() * 0.8 + "s";
        piece.style.transform        = `rotate(${Math.random() * 360}deg)`;

        const size = [6, 8, 10][Math.floor(Math.random() * 3)];
        piece.style.width  = size + "px";
        piece.style.height = size * 2 + "px";
        piece.style.background = getConfettiColor();

        confettiContainer.appendChild(piece);
    }
}

function getConfettiColor() {
    const colors = ["#00f7ff", "#ff2bd6", "#8b5cf6", "#ffffff", "#22c55e", "#facc15"];
    return colors[Math.floor(Math.random() * colors.length)];
}

// =============================
// INITIALISE
// =============================

applyTheme();
// Seed in-memory best score from storage on load
_memBestScore = getBestScore();
updateQuickStats();

// Apply persisted sound icon on load
_updateSoundUI(soundButton, soundOn);

// =============================
// AUTH — SESSION & LOGOUT
// =============================

(function initAuth() {
    // Read current session
    let session = null;
    try {
        session = JSON.parse(localStorage.getItem("neonGaming_session"));
    } catch { /* ignore */ }

    // Update user greeting on home screen
    const greetingEl = document.getElementById("userGreeting");
    if (greetingEl && session && session.username) {
        const safeName = String(session.username)
            .replace(/<[^>]*>/g, "")
            .trim()
            .slice(0, 20);
        const roleTag = session.role === "admin" ? " 👑" : "";
        greetingEl.textContent = `👋 Hey, ${safeName}${roleTag}!`;
    }

    // Show admin panel link only for admin users
    const adminLink = document.getElementById("adminLink");
    if (adminLink && session && session.role === "admin") {
        adminLink.style.display = "block";
    }

    // Pre-fill Player X name with logged-in username on setup screen
    if (session && session.username && playerXInput) {
        const safeName = String(session.username)
            .replace(/<[^>]*>/g, "")
            .trim()
            .slice(0, 15);
        if (!playerXInput.value) {
            playerXInput.value = safeName;
        }
    }

    // Wire logout button
    const logoutButton = document.getElementById("logoutButton");
    if (logoutButton) {
        logoutButton.addEventListener("click", () => {
            try { localStorage.removeItem("neonGaming_session"); } catch { /* ignore */ }
            window.location.href = "auth.html";
        });
    }
})();
