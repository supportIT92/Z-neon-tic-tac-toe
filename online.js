// ═══════════════════════════════════════════════════════════
// NEON GAMING — ONLINE MULTIPLAYER (Firebase Realtime DB)
// Integrated into index.html — same screen switching pattern
// WebRTC Voice Chat — Firebase signaling
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

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();

// ── Game State ───────────────────────────────────────────────
let oMyName     = "";
let oRoomCode   = "";
let oMyRole     = "";
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

// ── WebRTC Voice State ───────────────────────────────────────
let vcPeer        = null;
let vcLocalStream = null;
let vcMuted       = false;
let vcEnabled     = false;
let vcSignalRef   = null;

const VC_CONFIG = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" }
    ]
};

// ── DOM — Screens ────────────────────────────────────────────
const oHomeScreen    = document.getElementById("homeScreen");
const oModeScreen    = document.getElementById("modeScreen");
const oLobbyScreen   = document.getElementById("onlineLobbyScreen");
const oWaitingScreen = document.getElementById("onlineWaitingScreen");
const oGameScreen    = document.getElementById("onlineGameScreen");
const oResultOverlay = document.getElementById("onlineResultOverlay");

// ── DOM — Lobby ──────────────────────────────────────────────
const oLobbyName    = document.getElementById("onlineLobbyName");
const oCreateBtn    = document.getElementById("createRoomBtn");
const oJoinInput    = document.getElementById("joinCodeInput");
const oJoinBtn      = document.getElementById("joinRoomBtn");
const oLobbyAlert   = document.getElementById("onlineLobbyAlert");
const oBackLobbyBtn = document.getElementById("backOnlineLobbyBtn");

// ── DOM — Waiting ────────────────────────────────────────────
const oCodeDisplay  = document.getElementById("roomCodeDisplay");
const oCopyBtn      = document.getElementById("copyCodeBtn");
const oCancelBtn    = document.getElementById("cancelWaitBtn");

// ── DOM — Game ───────────────────────────────────────────────
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

// ── DOM — Voice ──────────────────────────────────────────────
const vcMicBtn      = document.getElementById("vcMicBtn");
const vcMuteBtn     = document.getElementById("vcMuteBtn");
const vcStatusEl    = document.getElementById("vcStatus");
const vcPanel       = document.getElementById("vcPanel");
const vcRemoteAudio = document.getElementById("vcRemoteAudio");
const vcMuteBadgeX  = document.getElementById("vcMuteBadgeX");
const vcMuteBadgeO  = document.getElementById("vcMuteBadgeO");

// ── DOM — Result ─────────────────────────────────────────────
const oResultIcon    = document.getElementById("onlineResultIcon");
const oResultLabel   = document.getElementById("onlineResultLabel");
const oResultTitle   = document.getElementById("onlineResultTitle");
const oResultMsg     = document.getElementById("onlineResultMsg");
const oResultRematch = document.getElementById("onlineResultRematch");
const oResultLeave   = document.getElementById("onlineResultLeave");

// ══════════════════════════════════════════════════════════════
//  SCREEN SWITCHING
// ══════════════════════════════════════════════════════════════

function oHideAllScreens() {
    oLobbyScreen.classList.remove("active");
    oWaitingScreen.classList.remove("active");
    oGameScreen.classList.remove("active");
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
    vcStop();
    oHideAllScreens();
    oResultOverlay.setAttribute("aria-hidden", "true");
    oResultOverlay.classList.remove("active");
    oHomeScreen.style.display = "flex";
    oCleanup();
}

function oGoMode() {
    vcStop();
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
    oShowAlert._t = setTimeout(() => { oLobbyAlert.className = "online-alert"; }, 4000);
}

// ══════════════════════════════════════════════════════════════
//  UTILITY
// ══════════════════════════════════════════════════════════════

function oSanitise(str) {
    return String(str || "").replace(/<[^>]*>/g, "").trim().slice(0, 15);
}

function oGenCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// ══════════════════════════════════════════════════════════════
//  ENTRY POINT
// ══════════════════════════════════════════════════════════════

const onlineButton = document.getElementById("onlineButton");
if (onlineButton) {
    onlineButton.addEventListener("click", () => {
        try {
            const s = JSON.parse(localStorage.getItem("neonGaming_session"));
            if (s && s.username) oLobbyName.value = s.username;
        } catch(e) {}
        oShowLobby();
    });
}

oBackLobbyBtn.addEventListener("click", oGoMode);

// ══════════════════════════════════════════════════════════════
//  CREATE ROOM
// ══════════════════════════════════════════════════════════════

oCreateBtn.addEventListener("click", () => {
    oMyName = oSanitise(oLobbyName.value);
    if (!oMyName) { oShowAlert("⚠️ Please enter your name."); oLobbyName.focus(); return; }

    oRoomCode = oGenCode();
    oMyRole   = "X";
    oMyTurn   = true;
    oScoreX   = oScoreO = 0;
    oBoard    = ["","","","","","","","",""];

    oRoomRef = db.ref("rooms/" + oRoomCode);
    oRoomRef.set({
        playerX: oMyName, playerO: null,
        turn: "X", board: oBoard,
        scoreX: 0, scoreO: 0,
        status: "waiting", createdAt: Date.now()
    }).then(() => {
        oCodeDisplay.textContent = oRoomCode;
        oShowWaiting();
        oListenForOpponent();
    }).catch(() => oShowAlert("❌ Failed to create room."));
});

// ══════════════════════════════════════════════════════════════
//  LISTEN FOR OPPONENT
// ══════════════════════════════════════════════════════════════

function oListenForOpponent() {
    oRoomRef.on("value", (snap) => {
        const data = snap.val();
        if (!data) { oShowLobby(); oShowAlert("⚠️ Room closed.", "info"); return; }
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
    oMyName        = oSanitise(oLobbyName.value);
    const code     = oJoinInput.value.trim().toUpperCase();

    if (!oMyName) { oShowAlert("⚠️ Please enter your name."); oLobbyName.focus(); return; }
    if (!code || code.length !== 6) { oShowAlert("⚠️ Enter a valid 6-character room code."); oJoinInput.focus(); return; }

    oRoomCode = code;
    oRoomRef  = db.ref("rooms/" + oRoomCode);

    oRoomRef.once("value").then((snap) => {
        const data = snap.val();
        if (!data)                    { oShowAlert("❌ Room not found."); return; }
        if (data.status !== "waiting"){ oShowAlert("⚠️ Room is full."); return; }

        oMyRole = "O";
        oMyTurn = false;

        oRoomRef.update({ playerO: oMyName, status: "playing" }).then(() => {
            oStartGame({
                playerX: data.playerX, playerO: oMyName,
                turn: "X", board: data.board || ["","","","","","","","",""],
                scoreX: data.scoreX || 0, scoreO: data.scoreO || 0
            });
        });
    }).catch(() => oShowAlert("❌ Failed to join."));
});

// ══════════════════════════════════════════════════════════════
//  START GAME
// ══════════════════════════════════════════════════════════════

function oStartGame(data) {
    oShowGame();
    oGameActive = true;

    oNameXEl.textContent  = data.playerX;
    oNameOEl.textContent  = data.playerO;
    oScoreX = data.scoreX || 0;
    oScoreO = data.scoreO || 0;
    oScoreXEl.textContent = oScoreX;
    oScoreOEl.textContent = oScoreO;
    oRoleXEl.textContent  = oMyRole === "X" ? "(YOU)" : "";
    oRoleOEl.textContent  = oMyRole === "O" ? "(YOU)" : "";
    oRoomLabel.textContent = oRoomCode;

    oBoard  = data.board || ["","","","","","","","",""];
    oMyTurn = (data.turn === oMyRole);
    oRematchBtn.style.display = "none";
    oMessageEl.textContent = ""; // clear "Connecting…"

    // Reset voice UI
    vcSetStatus("idle");

    oRenderBoard();
    oUpdateTurnUI();
    oListenToGame();

    // Setup signaling ref
    vcSignalRef = db.ref("rooms/" + oRoomCode + "/signal");

    // X creates the offer after a short delay (both sides need to be ready)
    if (oMyRole === "X") {
        setTimeout(vcCreateOffer, 1500);
    } else {
        vcListenForOffer();
    }
}

// ══════════════════════════════════════════════════════════════
//  GAME LISTENER
// ══════════════════════════════════════════════════════════════

function oListenToGame() {
    oListener = oRoomRef.on("value", (snap) => {
        const data = snap.val();
        if (!data) { oGoMode(); return; }

        oBoard  = data.board  || ["","","","","","","","",""];
        oMyTurn = (data.turn  === oMyRole);
        oScoreX = data.scoreX || 0;
        oScoreO = data.scoreO || 0;
        oScoreXEl.textContent = oScoreX;
        oScoreOEl.textContent = oScoreO;

        // Sync mute badges for both players
        vcUpdateBadges(data);

        oRenderBoard();
        oUpdateTurnUI();

        if (data.result) {
            oGameActive = false;
            oRematchBtn.style.display = "";
            oShowResult(data.result);
        }
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
//  TURN UI
// ══════════════════════════════════════════════════════════════

function oUpdateTurnUI() {
    const isXTurn = (oMyTurn && oMyRole === "X") || (!oMyTurn && oMyRole === "O");
    oTurnSymbol.textContent = isXTurn ? "X" : "O";
    oTurnSymbol.style.color = isXTurn ? "var(--cyan)" : "var(--pink)";
    oTurnSymbol.style.textShadow = isXTurn ? "0 0 15px var(--cyan)" : "0 0 15px var(--pink)";

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
        cell.disabled = true;

        const winner = oCheckWinner();
        const draw   = !winner && oBoard.every(v => v !== "");

        if (winner || draw) {
            oGameActive = false;
            const result = draw ? "draw" : winner;
            if (winner === "X") oScoreX++;
            if (winner === "O") oScoreO++;
            oRoomRef.update({ board: oBoard, scoreX: oScoreX, scoreO: oScoreO, result, turn: "none" });
        } else {
            oRoomRef.update({ board: oBoard, turn: oMyRole === "X" ? "O" : "X" });
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
//  RESULT
// ══════════════════════════════════════════════════════════════

// SVG icons for result overlay
const _SVG_WIN   = `<svg viewBox="0 0 24 24" fill="none" stroke="#ffd700" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.45 1-1 1H8c-.55 0-1 .45-1 1v1c0 .55.45 1 1 1h8c.55 0 1-.45 1-1v-1c0-.55-.45-1-1-1h-1c-.55 0-1-.45-1-1v-2.34"/><path d="M6 4h12v4a6 6 0 0 1-12 0V4z" fill="rgba(255,215,0,0.2)"/></svg>`;
const _SVG_DRAW  = `<svg viewBox="0 0 24 24" fill="none" stroke="var(--cyan)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 17l-5-5a2.83 2.83 0 0 1 4-4l1 1"/><path d="M13 7l5 5a2.83 2.83 0 0 1-4 4l-1-1"/><path d="M8 14l-2 2a2 2 0 0 0 3 3l2-2"/><path d="M16 10l2-2a2 2 0 0 0-3-3l-2 2"/></svg>`;
const _SVG_LOSS  = `<svg viewBox="0 0 24 24" fill="none" stroke="#ff6b6b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;

function oShowResult(result) {
    if (result === oMyRole) {
        oResultIcon.innerHTML  = _SVG_WIN;
        oResultLabel.textContent = "VICTORY";
        oResultTitle.textContent = "YOU WIN!";
        oResultMsg.textContent   = "Excellent move!";
    } else if (result === "draw") {
        oResultIcon.innerHTML  = _SVG_DRAW;
        oResultLabel.textContent = "DRAW";
        oResultTitle.textContent = "IT'S A DRAW!";
        oResultMsg.textContent   = "Well played!";
    } else {
        oResultIcon.innerHTML  = _SVG_LOSS;
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
    oBoard = ["","","","","","","","",""];
    oGameActive = true;
    oRematchBtn.style.display = "none";
    oRoomRef.update({ board: oBoard, turn: "X", result: null });
    oRenderBoard();
}

oRematchBtn.addEventListener("click", oRequestRematch);
oResultRematch.addEventListener("click", oRequestRematch);

// ══════════════════════════════════════════════════════════════
//  LEAVE / QUIT
// ══════════════════════════════════════════════════════════════

function oLeaveGame() {
    if (oRoomRef) {
        oMyRole === "X" ? oRoomRef.remove() : oRoomRef.update({ status: "left" });
    }
    oGoMode();
}

oLeaveBtn.addEventListener("click", oLeaveGame);
oResultLeave.addEventListener("click", oLeaveGame);
oQuitBtn.addEventListener("click", () => { if (confirm("Leave the game?")) oLeaveGame(); });

// ══════════════════════════════════════════════════════════════
//  COPY CODE
// ══════════════════════════════════════════════════════════════

oCopyBtn.addEventListener("click", () => {
    const original = oCopyBtn.innerHTML;
    const copied   = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:16px;height:16px;display:block"><polyline points="20 6 9 17 4 12"/></svg> COPIED!`;

    const doCopy = () => {
        oCopyBtn.innerHTML = copied;
        setTimeout(() => { oCopyBtn.innerHTML = original; }, 2000);
    };

    navigator.clipboard.writeText(oRoomCode).then(doCopy).catch(() => {
        try {
            const t = document.createElement("input");
            t.value = oRoomCode;
            document.body.appendChild(t); t.select();
            document.execCommand("copy");
            document.body.removeChild(t);
            doCopy();
        } catch(e) {}
    });
});

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
    if (oListener && oRoomRef) oRoomRef.off("value", oListener);
    oListener = null;
    oRoomRef  = null;
    oBoard    = ["","","","","","","","",""];
    oMyRole   = "";
    oMyTurn   = false;
}

// ══════════════════════════════════════════════════════════════
//  ██╗   ██╗ ██████╗ ██╗ ██████╗███████╗
//  ██║   ██║██╔═══██╗██║██╔════╝██╔════╝
//  ██║   ██║██║   ██║██║██║     █████╗
//  ╚██╗ ██╔╝██║   ██║██║██║     ██╔══╝
//   ╚████╔╝ ╚██████╔╝██║╚██████╗███████╗
//  WebRTC Peer-to-Peer Voice Chat
//  Firebase used only for signaling (offer/answer/ICE)
// ══════════════════════════════════════════════════════════════

// ── Status helper ────────────────────────────────────────────
function vcSetStatus(state) {
    if (!vcStatusEl) return;
    const labels = {
        idle:       "",
        requesting: "Connecting…",
        connecting: "Connecting…",
        connected:  "Live",
        muted:      "Muted",
        error:      "No mic"
    };
    vcStatusEl.textContent = labels[state] ?? "";
    vcStatusEl.className   = "vc-status vc-" + (state || "idle");

    const active = (state === "connected" || state === "muted");
    if (vcMuteBtn) vcMuteBtn.style.display = active ? "" : "none";
    if (vcMicBtn)  vcMicBtn.style.display  = active ? "none" : "";
    vcEnabled = active;
}

// ── Update mute button icons ──────────────────────────────────
function vcUpdateMuteIcon() {
    if (!vcMuteBtn) return;
    const unmutedSvg = vcMuteBtn.querySelector(".vc-icon-unmuted");
    const mutedSvg   = vcMuteBtn.querySelector(".vc-icon-muted");
    if (unmutedSvg) unmutedSvg.style.display = vcMuted ? "none" : "";
    if (mutedSvg)   mutedSvg.style.display   = vcMuted ? "" : "none";
    vcMuteBtn.setAttribute("aria-label", vcMuted ? "Unmute microphone" : "Mute microphone");
    vcMuteBtn.setAttribute("title",      vcMuted ? "Unmute mic" : "Mute mic");
    vcMuteBtn.classList.toggle("vc-muted-btn", vcMuted);
}

// ── Sync my mute state to Firebase (opponent sees it) ─────────
function vcSyncMuteState() {
    if (!oRoomRef || !oMyRole) return;
    const key = oMyRole === "X" ? "mutedX" : "mutedO";
    oRoomRef.update({ [key]: vcMuted });
}

// ── Update mute badges from Firebase data ─────────────────────
function vcUpdateBadges(data) {
    if (vcMuteBadgeX) vcMuteBadgeX.style.display = data.mutedX ? "" : "none";
    if (vcMuteBadgeO) vcMuteBadgeO.style.display = data.mutedO ? "" : "none";
}

// ── Get mic ──────────────────────────────────────────────────
async function vcGetMic() {
    vcSetStatus("requesting");
    try {
        vcLocalStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        return true;
    } catch(e) {
        vcSetStatus("error");
        return false;
    }
}

// ── Create RTCPeerConnection ─────────────────────────────────
function vcCreatePeer() {
    if (vcPeer) { vcPeer.close(); vcPeer = null; }
    vcPeer = new RTCPeerConnection(VC_CONFIG);

    // Add local tracks
    if (vcLocalStream) {
        vcLocalStream.getTracks().forEach(t => vcPeer.addTrack(t, vcLocalStream));
    }

    // Remote audio → play
    vcPeer.ontrack = (e) => {
        if (vcRemoteAudio) {
            vcRemoteAudio.srcObject = e.streams[0];
            vcRemoteAudio.play().catch(() => {});
        }
        vcSetStatus(vcMuted ? "muted" : "connected");
    };

    // ICE candidates → Firebase
    vcPeer.onicecandidate = (e) => {
        if (e.candidate && vcSignalRef) {
            vcSignalRef.child(oMyRole === "X" ? "iceCaller" : "iceCallee")
                .push(e.candidate.toJSON());
        }
    };

    vcPeer.onconnectionstatechange = () => {
        if (!vcPeer) return;
        if (vcPeer.connectionState === "disconnected" || vcPeer.connectionState === "failed") {
            vcSetStatus("idle");
        }
    };

    return vcPeer;
}

// ── X creates offer ──────────────────────────────────────────
async function vcCreateOffer() {
    if (!(await vcGetMic())) return;
    vcSetStatus("connecting");
    const peer = vcCreatePeer();

    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);

    // Push offer to Firebase
    await vcSignalRef.update({ offer: { type: offer.type, sdp: offer.sdp } });

    // Listen for answer from O
    vcSignalRef.child("answer").on("value", async (snap) => {
        const answer = snap.val();
        if (answer && peer.signalingState === "have-local-offer") {
            await peer.setRemoteDescription(new RTCSessionDescription(answer));
            vcSignalRef.child("answer").off("value");
            vcListenForIce("iceCallee", peer);
        }
    });

    // Listen for O's ICE
    vcListenForIce("iceCallee", peer);
}

// ── O listens for offer ──────────────────────────────────────
function vcListenForOffer() {
    if (!vcSignalRef) return;
    vcSignalRef.child("offer").on("value", async (snap) => {
        const offer = snap.val();
        if (!offer) return;
        vcSignalRef.child("offer").off("value");

        if (!(await vcGetMic())) return;
        vcSetStatus("connecting");
        const peer = vcCreatePeer();

        await peer.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);

        await vcSignalRef.update({ answer: { type: answer.type, sdp: answer.sdp } });

        // Listen for X's ICE
        vcListenForIce("iceCaller", peer);
    });
}

// ── Listen for ICE candidates ────────────────────────────────
function vcListenForIce(path, peer) {
    if (!vcSignalRef) return;
    vcSignalRef.child(path).on("child_added", async (snap) => {
        const candidate = snap.val();
        if (candidate && peer && peer.remoteDescription) {
            try {
                await peer.addIceCandidate(new RTCIceCandidate(candidate));
            } catch(e) { /* ignore stale candidates */ }
        }
    });
}

// ── Mic Button (Start voice chat) ───────────────────────────
if (vcMicBtn) {
    vcMicBtn.addEventListener("click", async () => {
        if (vcEnabled) return; // already connected
        // Re-initiate signaling
        if (oMyRole === "X") {
            await vcCreateOffer();
        } else {
            if (!(await vcGetMic())) return;
            vcSetStatus("connecting");
            vcListenForOffer();
        }
    });
}

// ── Mute/Unmute ──────────────────────────────────────────────
if (vcMuteBtn) {
    vcMuteBtn.addEventListener("click", () => {
        if (!vcLocalStream) return;
        vcMuted = !vcMuted;
        vcLocalStream.getAudioTracks().forEach(t => { t.enabled = !vcMuted; });
        vcUpdateMuteIcon();
        vcSetStatus(vcMuted ? "muted" : "connected");
        vcSyncMuteState(); // tell opponent via Firebase
    });
    vcMuteBtn.style.display = "none"; // hidden until connected
}

// ── Stop voice (on leave/cleanup) ───────────────────────────
function vcStop() {
    if (vcLocalStream) {
        vcLocalStream.getTracks().forEach(t => t.stop());
        vcLocalStream = null;
    }
    if (vcPeer) {
        vcPeer.close();
        vcPeer = null;
    }
    if (vcSignalRef) {
        vcSignalRef.off();
        vcSignalRef = null;
    }
    if (vcRemoteAudio) {
        vcRemoteAudio.srcObject = null;
    }
    vcMuted   = false;
    vcEnabled = false;
    if (vcMuteBtn) vcMuteBtn.style.display = "none";
}
