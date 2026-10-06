// ═══════════════════════════════════════════════════════════
// SOCKET.IO — Game Logic
// Events handled:
//   join_lobby       → player enters matchmaking queue
//   leave_queue      → player cancels matchmaking
//   create_room      → private room create
//   join_room        → join by room code
//   make_move        → play a cell
//   rematch          → request new round
//   leave_game       → player quits
//   disconnect       → cleanup on disconnect
// ═══════════════════════════════════════════════════════════

const GameRoom    = require("../models/GameRoom");
const GameHistory = require("../models/GameHistory");
const User        = require("../models/User");

// ── In-memory matchmaking queue ───────────────────────────────
// [{ socketId, username, userId, joinedAt }]
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

    io.on("connection", (socket) => {
        console.log(`[Socket] Connected: ${socket.id}`);

        // ══════════════════════════════════════════════════════
        //  QUICK MATCH — join queue
        // ══════════════════════════════════════════════════════
        socket.on("join_queue", async ({ username, userId }) => {
            // Remove any stale entry for this socket
            removeFromQueue(socket.id);

            const player = {
                socketId: socket.id,
                username: username || "Player",
                userId:   userId   || null,
                joinedAt: Date.now()
            };

            queue.push(player);
            socket.emit("queue_joined", { position: queue.length });
            console.log(`[Queue] ${username} joined. Queue size: ${queue.length}`);

            // Broadcast updated queue count
            io.emit("queue_count", { count: queue.length });

            // Try to match
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
        socket.on("create_room", async ({ username, userId }) => {
            try {
                const code = genCode();
                const room = await GameRoom.create({
                    roomCode: code,
                    playerX:  { userId: userId || null, username, socketId: socket.id },
                    status:   "waiting",
                    type:     "private"
                });

                socket.join(code);
                socket.data.roomCode = code;
                socket.data.role     = "X";
                socket.data.username = username;

                socket.emit("room_created", {
                    roomCode: code,
                    role:     "X"
                });

                console.log(`[Room] Created: ${code} by ${username}`);
            } catch (err) {
                console.error("[create_room]", err);
                socket.emit("error", { message: "Failed to create room." });
            }
        });

        // ══════════════════════════════════════════════════════
        //  JOIN ROOM BY CODE
        // ══════════════════════════════════════════════════════
        socket.on("join_room", async ({ roomCode, username, userId }) => {
            try {
                const code = roomCode.toUpperCase().trim();
                const room = await GameRoom.findOne({ roomCode: code });

                if (!room) {
                    return socket.emit("error", { message: "Room not found." });
                }
                if (room.status !== "waiting") {
                    return socket.emit("error", { message: "Room is full or game already started." });
                }

                // Update room
                room.playerO = { userId: userId || null, username, socketId: socket.id };
                room.status  = "playing";
                room.expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1h
                await room.save();

                socket.join(code);
                socket.data.roomCode = code;
                socket.data.role     = "O";
                socket.data.username = username;

                // Notify both players
                const gameState = buildGameState(room);
                io.to(code).emit("game_start", gameState);

                console.log(`[Room] ${username} joined ${code}`);
            } catch (err) {
                console.error("[join_room]", err);
                socket.emit("error", { message: "Failed to join room." });
            }
        });

        // ══════════════════════════════════════════════════════
        //  MAKE MOVE
        // ══════════════════════════════════════════════════════
        socket.on("make_move", async ({ roomCode, cellIndex }) => {
            try {
                const room = await GameRoom.findOne({ roomCode });
                if (!room || room.status !== "playing") return;

                const role = socket.data.role;
                if (!role) return;

                // Validate turn
                if (room.currentTurn !== role) {
                    return socket.emit("error", { message: "Not your turn." });
                }

                // Validate cell
                if (room.board[cellIndex] !== "") {
                    return socket.emit("error", { message: "Cell already taken." });
                }

                // Apply move
                room.board[cellIndex] = role;

                const winner = checkWinner(room.board);
                const isDraw = !winner && room.board.every(c => c !== "");

                if (winner || isDraw) {
                    // Round over
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

                        // Save to history
                        await saveHistory(room);

                        // Update player stats
                        await updateStats(room);

                        io.to(roomCode).emit("game_over", {
                            board:       room.board,
                            roundWinner: winner || "draw",
                            matchWinner: room.winner,
                            scoreX:      room.scoreX,
                            scoreO:      room.scoreO
                        });
                    } else {
                        // Round over, continue match
                        await room.save();
                        io.to(roomCode).emit("round_over", {
                            board:       room.board,
                            roundWinner: winner || "draw",
                            scoreX:      room.scoreX,
                            scoreO:      room.scoreO
                        });
                    }
                } else {
                    // Switch turn
                    room.currentTurn = role === "X" ? "O" : "X";
                    await room.save();

                    io.to(roomCode).emit("move_made", {
                        board:       room.board,
                        currentTurn: room.currentTurn,
                        cellIndex,
                        player:      role
                    });
                }
            } catch (err) {
                console.error("[make_move]", err);
                socket.emit("error", { message: "Move failed." });
            }
        });

        // ══════════════════════════════════════════════════════
        //  REMATCH — reset board for next round
        // ══════════════════════════════════════════════════════
        socket.on("request_rematch", async ({ roomCode }) => {
            try {
                const room = await GameRoom.findOne({ roomCode });
                if (!room) return;

                room.board       = ["","","","","","","","",""];
                room.currentTurn = "X";
                room.status      = "playing";
                room.winner      = null;
                await room.save();

                io.to(roomCode).emit("rematch_start", {
                    board:       room.board,
                    currentTurn: "X",
                    scoreX:      room.scoreX,
                    scoreO:      room.scoreO
                });
            } catch (err) {
                console.error("[rematch]", err);
            }
        });

        // ══════════════════════════════════════════════════════
        //  LEAVE GAME
        // ══════════════════════════════════════════════════════
        socket.on("leave_game", async ({ roomCode }) => {
            await handleLeave(socket, roomCode, io);
        });

        // ══════════════════════════════════════════════════════
        //  DISCONNECT
        // ══════════════════════════════════════════════════════
        socket.on("disconnect", async () => {
            console.log(`[Socket] Disconnected: ${socket.id}`);
            removeFromQueue(socket.id);
            io.emit("queue_count", { count: queue.length });

            if (socket.data.roomCode) {
                await handleLeave(socket, socket.data.roomCode, io);
            }
        });

        // ══════════════════════════════════════════════════════
        //  CHAT MESSAGE (voice chat fallback)
        // ══════════════════════════════════════════════════════
        socket.on("chat_message", ({ roomCode, message }) => {
            const safe = String(message || "").slice(0, 200);
            socket.to(roomCode).emit("chat_message", {
                from:    socket.data.username || "Player",
                message: safe
            });
        });

    }); // end io.on("connection")

    // ══════════════════════════════════════════════════════════
    //  HELPERS
    // ══════════════════════════════════════════════════════════

    // Remove player from matchmaking queue
    function removeFromQueue(socketId) {
        const idx = queue.findIndex(p => p.socketId === socketId);
        if (idx !== -1) queue.splice(idx, 1);
    }

    // Create room + start match for 2 queued players
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

            // Both sockets join the room
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

            console.log(`[Match] ${p1.username} (X) vs ${p2.username} (O) → Room ${code}`);
        } catch (err) {
            console.error("[createAndStartMatch]", err);
        }
    }

    // Build game state object for client
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

    // Handle player leaving a game room
    async function handleLeave(socket, roomCode, io) {
        try {
            const room = await GameRoom.findOne({ roomCode });
            if (!room || room.status === "finished") return;

            room.status = "abandoned";
            await room.save();

            socket.to(roomCode).emit("opponent_left", {
                message: `${socket.data.username || "Opponent"} left the game.`
            });

            socket.leave(roomCode);
            socket.data.roomCode = null;

        } catch (err) {
            console.error("[handleLeave]", err);
        }
    }

    // Save completed game to history
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
            console.error("[saveHistory]", err);
        }
    }

    // Update user win/loss stats
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
            console.error("[updateStats]", err);
        }
    }
};
