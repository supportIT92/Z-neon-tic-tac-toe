// ═══════════════════════════════════════════════════════════
// NEON GAMING — ONLINE MULTIPLAYER (Firebase Realtime DB)
// Integrated into index.html — same screen switching pattern
// ═══════════════════════════════════════════════════════════

"use strict";

// ── Firebase Config ──────────────────────────────────────────
const firebaseConfig = {
    apiKey:            "AIzaSyBJ5y__7cpDYJUaIkiKxqAbZ5aPvLm_Bvw",
    authDomain:        "ztictactoe.firebaseapp.com",
    databaseURL:       "https://ztictactoe-default-rtdb.firebaseio.com",
    projectId:         "ztictactoe",
    storageBucket:     "ztictactoe.firebasestorage.app",
    messagingSenderId: "974811111998",
    appId:             "1:974811111998:web:0a5de8e4f98547bb8c676f",
    measurementId:     "G-YSE68YDWLG"
};

// Initialize Firebase (only once)
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();

// ── Global State ─────────────────────────────────────────────
let oMyName     = "";
let oRoomCode   = "";
let oMyRole     = "";      // "X" or "O"
let oMyTurn     = false;
let oGameActive = false;
let oBoard      = ["","","","","","","","",""];
let oScoreX     = 0;
let oScoreO     = 0;
let oRoomRef    = null;
let oListener   = null;

const oWinPatterns = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6]
];

// ── DOM — Screens ─────────────────────────────────────────────
const oHomeScreen    = document.getElementById("homeScreen");
const oModeScreen    = document.getElementById("modeScreen");
const oLobbyScreen   = document.getElementById("onlineLobbyScreen");
const oWaitingScreen = document.getElementById("onlineWaitingScreen");
const oGameScreen    = document.getElementById("onlineGameScreen");
const oResultOverlay = document.getElementById("onlineResultOverlay");

// ── DOM — Lobby ───────────────────────────────────────────────
const oLobbyName    = document.getElementById("onlineLobbyName");
const oCreateBtn    = document.getElementById("createRoomBtn");
const oJoinInput    = document.getElementById("joinCodeInput");
const oJoinBtn      = document.getElementById("joinRoomBtn");
const oLobbyAlert   = document.getElementById("onlineLobbyAlert");
const oBackLobbyBtn = document.getElementById("backOnlineLobbyBtn");

// ── DOM — Waiting ─────────────────────────────────────────────
const oCodeDisplay  = document.getElementById("roomCodeDisplay");
const oCopyBtn      = document.getElementById("copyCodeBtn");
const oCancelBtn    = document.getElementById("cancelWaitBtn");

// ── DOM — Game ────────────────────────────────────────────────
const oRoomLabel    = document.getElementById("onlineRoomCodeLabel");
const oConnStatus   = document.getElementById("onlineConnStatus");
const oConnText     = document.getElementById("onlineConnText");
const oQuitBtn      = document.getElementById("onlineQuitBtn");

const oNameXEl      = document.getElementById("onlineNameX");
const oNameOEl      = document.getElementById("onlineNameO");
const oScoreXEl     = document.getElementById("onlineScoreX");
const oScoreOEl     = document.getElementById("onlineScoreO");
const oCardX        = document.getElementById("onlinePlayerX");
const oCardO        = document.getElementById("onlinePlayerO");
const oRoleXEl      = document.getElementById("onlineRoleX");
const oRoleOEl      = document.getElementById("onlineRoleO");

const oTurnSymbol   = document.getElementById("onlineTurnSymbol");
const oTurnText     = document.getElementById("onlineTurnText");
const oMessageEl    = document.getElementById("onlineMessage");
const oBoardEl      = document.getElementById("onlineBoard");
const oCells        = document.querySelectorAll("#onlineBoard .cell");

const oRematchBtn   = document.getElementById("onlineRematchBtn");
const oLeaveBtn     = document.getElementById("onlineLeaveBtn");

// ── DOM — Result ──────────────────────────────────────────────
const oResultIcon    = document.getElementById("onlineResultIcon");
const oResultLabel   = document.getElementById("onlineResultLabel");
const oResultTitle   = document.getElementById("onlineResultTitle");
const oResultMsg     = document.getElementById("onlineResultMsg");
const oResultRematch = document.getElementById("onlineResultRematch");
const oResultLeave   = document.getElementById("onlineResultLeave");

// ══════════════════════════════════════════════════════════════
//  SCREEN SWITCHING  (matches script.js pattern)
// ══════════════════════════════════════════════════════════════

function oHideAllScreens() {
    // Online screens
    oLobbyScreen.classList.remove("active");
    oWaitingScreen.classList.remove("active");
    oGameScreen.classList.remove("active");
    // Main game screens (for transitions back)
    oModeScreen.classList.remove("active");
}

function oShowLobby() {
    oHideAllScreens();
    oHomeScreen.style.display = "none";
    oLobbyScreen.classList.add("active");
    oLobbyName.focus();
}

function oShowWaiting() {
    oHideAllScreens();
    oWaitingScreen.classList.add("active");
}

function oShowGame() {
    oHideAllScreens();
    oGameScreen.classList.add("active");
}

function oGoHome() {
    oHideAllScreens();
    oResultOverlay.setAttribute("aria-hidden", "true");
    oResultOverlay.classList.remove("active");
    oHomeScreen.style.display = "flex";
    // Clean up Firebase
    oCleanup();
}

function oGoMode() {
    oHideAllScreens();
    oResultOverlay.setAttribute("aria-hidden", "true");
    oResultOverlay.classList.remove("active");
    oHomeScreen.style.display = "none";
    oModeScreen.classList.add("active");
    oCleanup();
}

// ══════════════════════════════════════════════════════════════
//  ALERT
// ══════════════════════════════════════════════════════════════

function oShowAlert(msg, type) {
    oLobbyAlert.textContent = msg;
    oLobbyAlert.className   = "online-alert show oa-" + (type || "error");
    clearTimeout(oShowAlert._t);
    oShowAlert._t = setTimeout(() => {
        oLobbyAlert.className = "online-alert";
    }, 4000);
}

// ══════════════════════════════════════════════════════════════
//  UTILITY
// ══════════════════════════════════════════════════════════════

function oSanitise(str) {
    return String(str || "")
        .replace(/<[^>]*>/g, "")
        .trim()
        .slice(0, 15);
}

function oGenCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// ══════════════════════════════════════════════════════════════
//  ENTRY POINT — "ONLINE MULTIPLAYER" button in mode screen
// ══════════════════════════════════════════════════════════════

const onlineButton = document.getElementById("onlineButton");
if (onlineButton) {
    onlineButton.addEventListener("click", () => {
        // Pre-fill name from session
        try {
            const s = JSON.parse(localStorage.getItem("neonGaming_session"));
            if (s && s.username) oLobbyName.value = s.username;
        } catch(e) {}
        oShowLobby();
    });
}

// ══════════════════════════════════════════════════════════════
//  BACK — Lobby → Mode Screen
// ══════════════════════════════════════════════════════════════

oBackLobbyBtn.addEventListener("click", oGoMode);

// ══════════════════════════════════════════════════════════════
//  CREATE ROOM
// ══════════════════════════════════════════════════════════════

oCreateBtn.addEventListener("click", () => {
    oMyName = oSanitise(oLobbyName.value);
    if (!oMyName) {
        oShowAlert("⚠️ Please enter your name.");
        oLobbyName.focus();
        return;
    }

    oRoomCode   = oGenCode();
    oMyRole     = "X";
    oMyTurn     = true;
    oScoreX     = 0;
    oScoreO     = 0;
    oBoard      = ["","","","","","","","",""];

    oRoomRef = db.ref("rooms/" + oRoomCode);
    oRoomRef.set({
        playerX:   oMyName,
        playerO:   null,
        turn:      "X",
        board:     oBoard,
        scoreX:    0,
        scoreO:    0,
        status:    "waiting",
        createdAt: Date.now()
    }).then(() => {
        oCodeDisplay.textContent = oRoomCode;
        oShowWaiting();
        oListenForOpponent();
    }).catch(() => {
        oShowAlert("❌ Failed to create room. Check your connection.");
    });
});

// ══════════════════════════════════════════════════════════════
//  LISTEN FOR OPPONENT (while waiting)
// ══════════════════════════════════════════════════════════════

function oListenForOpponent() {
    oRoomRef.on("value", (snap) => {
        const data = snap.val();
        if (!data) {
            oShowLobby();
            oShowAlert("⚠️ Room closed.", "info");
            return;
        }
        if (data.status === "playing" && data.playerO) {
            oRoomRef.off("value");
            oStartGame(data);
        }
    });
}

// ══════════════════════════════════════════════════════════════
//  JOIN ROOM
// ══════════════════════════════════════════════════════════════

oJoinBtn.addEventListener("click", () => {
    oMyName   = oSanitise(oLobbyName.value);
    const code = oJoinInput.value.trim().toUpperCase();

    if (!oMyName) {
        oShowAlert("⚠️ Please enter your name.");
        oLobbyName.focus();
        return;
    }
    if (!code || code.length !== 6) {
        oShowAlert("⚠️ Enter a valid 6-character room code.");
        oJoinInput.focus();
        return;
    }

    oRoomCode = code;
    oRoomRef  = db.ref("rooms/" + oRoomCode);

    oRoomRef.once("value").then((snap) => {
        const data = snap.val();
        if (!data) {
            oShowAlert("❌ Room not found. Check the code.");
            return;
        }
        if (data.status !== "waiting") {
            oShowAlert("⚠️ Room is full or game already started.");
            return;
        }

        oMyRole = "O";
        oMyTurn = false;

        oRoomRef.update({
            playerO: oMyName,
            status:  "playing"
        }).then(() => {
            oStartGame({
                playerX: data.playerX,
                playerO: oMyName,
                turn:    "X",
                board:   data.board || ["","","","","","","","",""],
                scoreX:  data.scoreX || 0,
                scoreO:  data.scoreO || 0
            });
        });
    }).catch(() => {
        oShowAlert("❌ Failed to join. Check your connection.");
    });
});

// ══════════════════════════════════════════════════════════════
//  START GAME
// ══════════════════════════════════════════════════════════════

function oStartGame(data) {
    oShowGame();
    oGameActive = true;

    // Player names & scores
    oNameXEl.textContent  = data.playerX;
    oNameOEl.textContent  = data.playerO;
    oScoreX = data.scoreX || 0;
    oScoreO = data.scoreO || 0;
    oScoreXEl.textContent = oScoreX;
    oScoreOEl.textContent = oScoreO;

    // Show which side this player is on
    oRoleXEl.textContent  = oMyRole === "X" ? "(YOU)" : "";
    oRoleOEl.textContent  = oMyRole === "O" ? "(YOU)" : "";

    // Room code label
    oRoomLabel.textContent = oRoomCode;

    // Board & turn
    oBoard  = data.board || ["","","","","","","","",""];
    oMyTurn = (data.turn === oMyRole);

    // Hide rematch initially
    oRematchBtn.style.display = "none";

    oRenderBoard();
    oUpdateTurnUI();
    oListenToGame();
}

// ══════════════════════════════════════════════════════════════
//  REAL-TIME GAME LISTENER
// ══════════════════════════════════════════════════════════════

function oListenToGame() {
    oListener = oRoomRef.on("value", (snap) => {
        const data = snap.val();
        if (!data) {
            oGoMode();
            return;
        }

        oBoard  = data.board  || ["","","","","","","","",""];
        oMyTurn = (data.turn  === oMyRole);
        oScoreX = data.scoreX || 0;
        oScoreO = data.scoreO || 0;
        oScoreXEl.textContent = oScoreX;
        oScoreOEl.textContent = oScoreO;

        oRenderBoard();
        oUpdateTurnUI();

        if (data.result) {
            oGameActive = false;
            oRematchBtn.style.display = "";
            oShowResult(data.result);
        }

        // Opponent disconnected
        if (data.status === "left") {
            oMessageEl.textContent = "Opponent left the game.";
            oGameActive = false;
            oRematchBtn.style.display = "none";
        }
    });
}

// ══════════════════════════════════════════════════════════════
//  RENDER BOARD
// ══════════════════════════════════════════════════════════════

function oRenderBoard() {
    oCells.forEach((cell, i) => {
        const val = oBoard[i] || "";
        cell.textContent = val;
        cell.className   = "cell";
        if (val === "X") cell.classList.add("x");
        if (val === "O") cell.classList.add("o");
        cell.disabled = (val !== "" || !oMyTurn || !oGameActive);
    });
}

// ══════════════════════════════════════════════════════════════
//  UPDATE TURN UI
// ══════════════════════════════════════════════════════════════

function oUpdateTurnUI() {
    const isXTurn = (oMyTurn && oMyRole === "X") || (!oMyTurn && oMyRole === "O");

    oTurnSymbol.textContent = isXTurn ? "X" : "O";
    oTurnSymbol.style.color = isXTurn ? "var(--cyan)" : "var(--pink)";
    oTurnSymbol.style.textShadow = isXTurn
        ? "0 0 15px var(--cyan)"
        : "0 0 15px var(--pink)";

    if (oMyTurn) {
        oTurnText.textContent = "YOUR TURN";
        oTurnText.style.color = "var(--cyan)";
        oCardX.classList.toggle("active-player", oMyRole === "X");
        oCardO.classList.toggle("active-player", oMyRole === "O");
    } else {
        oTurnText.textContent = "OPPONENT'S TURN…";
        oTurnText.style.color = "var(--muted)";
        oCardX.classList.toggle("active-player", oMyRole === "O");
        oCardO.classList.toggle("active-player", oMyRole === "X");
    }
}

// ══════════════════════════════════════════════════════════════
//  CELL CLICK
// ══════════════════════════════════════════════════════════════

oCells.forEach((cell, i) => {
    cell.addEventListener("click", () => {
        if (!oMyTurn || oBoard[i] !== "" || !oGameActive) return;

        oBoard[i] = oMyRole;
        cell.disabled = true; // immediate feedback

        const winner = oCheckWinner();
        const draw   = !winner && oBoard.every(v => v !== "");

        if (winner || draw) {
            oGameActive = false;
            let result = draw ? "draw" : winner;
            if (winner === "X") oScoreX++;
            if (winner === "O") oScoreO++;

            oRoomRef.update({
                board:   oBoard,
                scoreX:  oScoreX,
                scoreO:  oScoreO,
                result:  result,
                turn:    "none"
            });
        } else {
            const next = oMyRole === "X" ? "O" : "X";
            oRoomRef.update({ board: oBoard, turn: next });
        }
    });
});

// ══════════════════════════════════════════════════════════════
//  CHECK WINNER
// ══════════════════════════════════════════════════════════════

function oCheckWinner() {
    for (const [a, b, c] of oWinPatterns) {
        if (oBoard[a] && oBoard[a] === oBoard[b] && oBoard[a] === oBoard[c]) {
            oCells[a].classList.add("winner");
            oCells[b].classList.add("winner");
            oCells[c].classList.add("winner");
            return oBoard[a];
        }
    }
    return null;
}

// ══════════════════════════════════════════════════════════════
//  SHOW RESULT OVERLAY
// ══════════════════════════════════════════════════════════════

function oShowResult(result) {
    if (result === oMyRole) {
        oResultIcon.textContent  = "🏆";
        oResultLabel.textContent = "VICTORY";
        oResultTitle.textContent = "YOU WIN!";
        oResultMsg.textContent   = "Excellent move!";
    } else if (result === "draw") {
        oResultIcon.textContent  = "🤝";
        oResultLabel.textContent = "DRAW";
        oResultTitle.textContent = "IT'S A DRAW!";
        oResultMsg.textContent   = "Well played, both!";
    } else {
        oResultIcon.textContent  = "💀";
        oResultLabel.textContent = "DEFEAT";
        oResultTitle.textContent = "YOU LOST";
        oResultMsg.textContent   = "Better luck next time!";
    }

    oResultOverlay.setAttribute("aria-hidden", "false");
    oResultOverlay.classList.add("active");
}

// ══════════════════════════════════════════════════════════════
//  REMATCH
// ══════════════════════════════════════════════════════════════

function oRequestRematch() {
    oResultOverlay.setAttribute("aria-hidden", "true");
    oResultOverlay.classList.remove("active");
    oBoard      = ["","","","","","","","",""];
    oGameActive = true;
    oRematchBtn.style.display = "none";

    oRoomRef.update({
        board:  oBoard,
        turn:   "X",
        result: null
    });
    oRenderBoard();
}

oRematchBtn.addEventListener("click", oRequestRematch);
oResultRematch.addEventListener("click", oRequestRematch);

// ══════════════════════════════════════════════════════════════
//  LEAVE / QUIT
// ══════════════════════════════════════════════════════════════

function oLeaveGame() {
    if (oRoomRef) {
        if (oMyRole === "X") {
            oRoomRef.remove(); // Creator deletes the room
        } else {
            oRoomRef.update({ status: "left" }); // Joiner signals departure
        }
    }
    oGoMode();
}

oLeaveBtn.addEventListener("click", oLeaveGame);
oResultLeave.addEventListener("click", oLeaveGame);
oQuitBtn.addEventListener("click", () => {
    if (confirm("Leave the game?")) oLeaveGame();
});

// ══════════════════════════════════════════════════════════════
//  COPY CODE
// ══════════════════════════════════════════════════════════════

oCopyBtn.addEventListener("click", () => {
    navigator.clipboard.writeText(oRoomCode).then(() => {
        oCopyBtn.textContent = "✅ COPIED!";
        setTimeout(() => { oCopyBtn.textContent = "📋 COPY CODE"; }, 2000);
    }).catch(() => {
        try {
            const tmp = document.createElement("input");
            tmp.value = oRoomCode;
            document.body.appendChild(tmp);
            tmp.select();
            document.execCommand("copy");
            document.body.removeChild(tmp);
            oCopyBtn.textContent = "✅ COPIED!";
            setTimeout(() => { oCopyBtn.textContent = "📋 COPY CODE"; }, 2000);
        } catch(e) {}
    });
});

// ══════════════════════════════════════════════════════════════
//  CANCEL WAITING
// ══════════════════════════════════════════════════════════════

oCancelBtn.addEventListener("click", () => {
    if (oRoomRef) oRoomRef.remove();
    oRoomRef = null;
    oShowLobby();
});

// ══════════════════════════════════════════════════════════════
//  CLEANUP
// ══════════════════════════════════════════════════════════════

function oCleanup() {
    oGameActive = false;
    if (oListener && oRoomRef) {
        oRoomRef.off("value", oListener);
    }
    oListener = null;
    oRoomRef  = null;
    oBoard    = ["","","","","","","","",""];
    oMyRole   = "";
    oMyTurn   = false;
}
