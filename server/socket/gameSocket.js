// ═══════════════════════════════════════════════════════════
// SOCKET.IO — Secure Game Logic & Room Management
// ═══════════════════════════════════════════════════════════

const jwt         = require("jsonwebtoken");
const GameRoom    = require("../models/GameRoom");
const GameHistory = require("../models/GameHistory");
const User        = require("../models/User");

// ── In-memory matchmaking queue ───────────────────────────────
const queue = [];

// ── Win patterns ─────────────────────────────────────────────
const WIN_PATTERNS = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6]
];

function checkWinner(board) {
    for (const [a,b,c] of WIN_PATTERNS) {
        if (board[a] && board[a] === board[b] && board[a] === board[c]) {
            return board[a];
        }
    }
    return null;
}

function genCode() {
    return Math.random().toString(36).substring(2,8).toUpperCase();
}

// ── Main socket init ──────────────────────────────────────────
module.exports = function initSocket(io) {

    // ── Handshake Authentication Middleware ───────────────────
    io.use((socket, next) => {
        try {
            const token = socket.handshake.auth?.token || socket.handshake.query?.token;
            if (token && typeof token === "string") {
                const cleanToken = token.replace(/^Bearer\s+/i, "");
                const decoded = jwt.verify(cleanToken, process.env.JWT_SECRET, { clockTolerance: 300 });
                socket.data.authUserId = decoded.id;
            } else {
                socket.data.authUserId = null;
            }
        } catch (err) {
            // Unauthenticated guest user
            socket.data.authUserId = null;
        }
        next();
    });

    io.on("connection", (socket) => {

        // ══════════════════════════════════════════════════════
        //  QUICK MATCH — join queue
        // ══════════════════════════════════════════════════════
        socket.on("join_queue", async ({ username }) => {
            removeFromQueue(socket.id);

            const safeName = String(username || "Player").slice(0, 20);
            const player = {
                socketId: socket.id,
                username: safeName,
                userId:   socket.data.authUserId || null, // Never trust client-supplied userId!
                joinedAt: Date.now()
            };

            queue.push(player);
            socket.emit("queue_joined", { position: queue.length });

            io.emit("queue_count", { count: queue.length });

            if (queue.length >= 2) {
                const p1 = queue.shift();
                const p2 = queue.shift();

                io.emit("queue_count", { count: queue.length });
                await createAndStartMatch(io, p1, p2, "quickmatch");
            }
        });

        // ══════════════════════════════════════════════════════
        //  LEAVE QUEUE
        // ══════════════════════════════════════════════════════
        socket.on("leave_queue", () => {
            removeFromQueue(socket.id);
            io.emit("queue_count", { count: queue.length });
            socket.emit("queue_left");
        });

        // ══════════════════════════════════════════════════════
        //  CREATE PRIVATE ROOM
        // ══════════════════════════════════════════════════════
        socket.on("create_room", async ({ username }) => {
            try {
                const code = genCode();
                const safeName = String(username || "Player").slice(0, 20);

                await GameRoom.create({
                    roomCode: code,
                    playerX:  { userId: socket.data.authUserId || null, username: safeName, socketId: socket.id },
                    status:   "waiting",
                    type:     "private"
                });

                socket.join(code);
                socket.data.roomCode = code;
                socket.data.role     = "X";
                socket.data.username = safeName;

                socket.emit("room_created", {
                    roomCode: code,
                    role:     "X"
                });

            } catch (err) {
                console.error("[create_room error]", err);
                socket.emit("error", { message: "Failed to create room." });
            }
        });

        // ══════════════════════════════════════════════════════
        //  JOIN ROOM BY CODE
        // ══════════════════════════════════════════════════════
        socket.on("join_room", async ({ roomCode, username }) => {
            try {
                if (!roomCode || typeof roomCode !== "string") {
                    return socket.emit("error", { message: "Invalid room code." });
                }

                const code = roomCode.toUpperCase().trim().slice(0, 8);
                const room = await GameRoom.findOne({ roomCode: code });

                if (!room) {
                    return socket.emit("error", { message: "Room not found." });
                }
                if (room.status !== "waiting") {
                    return socket.emit("error", { message: "Room is full or game has already started." });
                }

                const safeName = String(username || "Player").slice(0, 20);

                room.playerO   = { userId: socket.data.authUserId || null, username: safeName, socketId: socket.id };
                room.status    = "playing";
                room.expiresAt = new Date(Date.now() + 60 * 60 * 1000);
                await room.save();

                socket.join(code);
                socket.data.roomCode = code;
                socket.data.role     = "O";
                socket.data.username = safeName;

                const gameState = buildGameState(room);
                io.to(code).emit("game_start", gameState);

            } catch (err) {
                console.error("[join_room error]", err);
                socket.emit("error", { message: "Failed to join room." });
            }
        });

        // ══════════════════════════════════════════════════════
        //  MAKE MOVE
        // ══════════════════════════════════════════════════════
        socket.on("make_move", async ({ roomCode, cellIndex }) => {
            try {
                if (!roomCode || typeof roomCode !== "string") return;

                // Validate cellIndex: must be an integer between 0 and 8
                const cellIdx = Number(cellIndex);
                if (!Number.isInteger(cellIdx) || cellIdx < 0 || cellIdx > 8) {
                    return socket.emit("error", { message: "Invalid board coordinate." });
                }

                const room = await GameRoom.findOne({ roomCode: roomCode.toUpperCase().trim() });
                if (!room || room.status !== "playing") return;

                const role = socket.data.role;
                if (!role || (role !== "X" && role !== "O")) return;

                // Validate turn
                if (room.currentTurn !== role) {
                    return socket.emit("error", { message: "Not your turn." });
                }

                // Validate cell emptiness
                if (room.board[cellIdx] !== "") {
                    return socket.emit("error", { message: "Cell already taken." });
                }

                // Apply move safely
                room.board[cellIdx] = role;

                const winner = checkWinner(room.board);
                const isDraw = !winner && room.board.every(c => c !== "");

                if (winner || isDraw) {
                    if (winner === "X") room.scoreX++;
                    if (winner === "O") room.scoreO++;
                    room.roundsPlayed++;
                    room.currentTurn = "none";

                    const roundsToWin = Math.ceil(room.matchFormat / 2);
                    const matchOver  = room.scoreX >= roundsToWin || room.scoreO >= roundsToWin
                                    || room.roundsPlayed >= room.matchFormat;

                    if (matchOver) {
                        room.status = "finished";
                        room.winner = winner || "draw";
                        await room.save();

                        await saveHistory(room);
                        await updateStats(room);

                        io.to(room.roomCode).emit("game_over", {
                            board:       room.board,
                            roundWinner: winner || "draw",
                            matchWinner: room.winner,
                            scoreX:      room.scoreX,
                            scoreO:      room.scoreO
                        });
                    } else {
                        await room.save();
                        io.to(room.roomCode).emit("round_over", {
                            board:       room.board,
                            roundWinner: winner || "draw",
                            scoreX:      room.scoreX,
                            scoreO:      room.scoreO
                        });
                    }
                } else {
                    room.currentTurn = role === "X" ? "O" : "X";
                    await room.save();

                    io.to(room.roomCode).emit("move_made", {
                        board:       room.board,
                        currentTurn: room.currentTurn,
                        cellIndex:   cellIdx,
                        player:      role
                    });
                }
            } catch (err) {
                console.error("[make_move error]", err);
                socket.emit("error", { message: "Move could not be processed." });
            }
        });

        // ══════════════════════════════════════════════════════
        //  REMATCH
        // ══════════════════════════════════════════════════════
        socket.on("request_rematch", async ({ roomCode }) => {
            try {
                if (!roomCode || typeof roomCode !== "string") return;
                const room = await GameRoom.findOne({ roomCode: roomCode.toUpperCase().trim() });
                if (!room) return;

                room.board       = ["","","","","","","","",""];
                room.currentTurn = "X";
                room.status      = "playing";
                room.winner      = null;
                await room.save();

                io.to(room.roomCode).emit("rematch_start", {
                    board:       room.board,
                    currentTurn: "X",
                    scoreX:      room.scoreX,
                    scoreO:      room.scoreO
                });
            } catch (err) {
                console.error("[rematch error]", err);
            }
        });

        // ══════════════════════════════════════════════════════
        //  LEAVE & DISCONNECT
        // ══════════════════════════════════════════════════════
        socket.on("leave_game", async ({ roomCode }) => {
            if (roomCode) await handleLeave(socket, roomCode, io);
        });

        socket.on("disconnect", async () => {
            removeFromQueue(socket.id);
            io.emit("queue_count", { count: queue.length });

            if (socket.data.roomCode) {
                await handleLeave(socket, socket.data.roomCode, io);
            }
        });

        // ══════════════════════════════════════════════════════
        //  CHAT MESSAGE
        // ══════════════════════════════════════════════════════
        socket.on("chat_message", ({ roomCode, message }) => {
            if (!roomCode || typeof roomCode !== "string") return;
            const safe = String(message || "").slice(0, 150);
            socket.to(roomCode.toUpperCase().trim()).emit("chat_message", {
                from:    socket.data.username || "Player",
                message: safe
            });
        });

    });

    // ══════════════════════════════════════════════════════════
    //  HELPERS
    // ══════════════════════════════════════════════════════════

    function removeFromQueue(socketId) {
        const idx = queue.findIndex(p => p.socketId === socketId);
        if (idx !== -1) queue.splice(idx, 1);
    }

    async function createAndStartMatch(io, p1, p2, type) {
        try {
            const code = genCode();
            const room = await GameRoom.create({
                roomCode: code,
                playerX:  { userId: p1.userId, username: p1.username, socketId: p1.socketId },
                playerO:  { userId: p2.userId, username: p2.username, socketId: p2.socketId },
                status:   "playing",
                type,
                queueIds:  [p1.socketId, p2.socketId],
                expiresAt: new Date(Date.now() + 60 * 60 * 1000)
            });

            const p1Socket = io.sockets.sockets.get(p1.socketId);
            const p2Socket = io.sockets.sockets.get(p2.socketId);

            if (p1Socket) {
                p1Socket.join(code);
                p1Socket.data.roomCode = code;
                p1Socket.data.role     = "X";
                p1Socket.data.username = p1.username;
            }
            if (p2Socket) {
                p2Socket.join(code);
                p2Socket.data.roomCode = code;
                p2Socket.data.role     = "O";
                p2Socket.data.username = p2.username;
            }

            const gameState = buildGameState(room);
            io.to(code).emit("game_start", gameState);

        } catch (err) {
            console.error("[createAndStartMatch error]", err);
        }
    }

    function buildGameState(room) {
        return {
            roomCode:    room.roomCode,
            playerX:     room.playerX.username,
            playerO:     room.playerO.username,
            board:       room.board,
            currentTurn: room.currentTurn,
            scoreX:      room.scoreX,
            scoreO:      room.scoreO,
            matchFormat: room.matchFormat,
            status:      room.status
        };
    }

    async function handleLeave(socket, roomCode, io) {
        try {
            const code = String(roomCode || "").toUpperCase().trim();
            const room = await GameRoom.findOne({ roomCode: code });
            if (!room || room.status === "finished") return;

            room.status = "abandoned";
            await room.save();

            socket.to(code).emit("opponent_left", {
                message: `${socket.data.username || "Opponent"} left the game.`
            });

            socket.leave(code);
            socket.data.roomCode = null;

        } catch (err) {
            console.error("[handleLeave error]", err);
        }
    }

    async function saveHistory(room) {
        try {
            const winnerUsername =
                room.winner === "X" ? room.playerX.username :
                room.winner === "O" ? room.playerO.username : null;

            await GameHistory.create({
                roomCode:       room.roomCode,
                playerX:        { userId: room.playerX.userId, username: room.playerX.username },
                playerO:        { userId: room.playerO.userId, username: room.playerO.username },
                winner:         room.winner,
                winnerUsername,
                finalBoard:     room.board,
                scoreX:         room.scoreX,
                scoreO:         room.scoreO,
                rounds:         room.roundsPlayed,
                matchFormat:    room.matchFormat,
                roomType:       room.type
            });
        } catch (err) {
            console.error("[saveHistory error]", err);
        }
    }

    async function updateStats(room) {
        try {
            const updates = [];

            const incX = {
                "stats.totalGames": 1,
                ...(room.winner === "X" && { "stats.wins": 1 }),
                ...(room.winner === "O" && { "stats.losses": 1 }),
                ...(room.winner === "draw" && { "stats.draws": 1 })
            };
            const incO = {
                "stats.totalGames": 1,
                ...(room.winner === "O" && { "stats.wins": 1 }),
                ...(room.winner === "X" && { "stats.losses": 1 }),
                ...(room.winner === "draw" && { "stats.draws": 1 })
            };

            if (room.playerX.userId) {
                updates.push(User.findByIdAndUpdate(room.playerX.userId, { $inc: incX }));
            }
            if (room.playerO.userId) {
                updates.push(User.findByIdAndUpdate(room.playerO.userId, { $inc: incO }));
            }

            await Promise.all(updates);
        } catch (err) {
            console.error("[updateStats error]", err);
        }
    }
};
