// ═══════════════════════════════════════════════════════════
// MODEL: GameRoom
// ═══════════════════════════════════════════════════════════

const mongoose = require("mongoose");

const gameRoomSchema = new mongoose.Schema({

    roomCode: {
        type:     String,
        required: true,
        unique:   true,
        uppercase: true,
        trim:     true,
        maxlength: 6
    },

    // Players
    playerX: {
        userId:   { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        username: { type: String, default: "" },
        socketId: { type: String, default: "" }
    },

    playerO: {
        userId:   { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        username: { type: String, default: "" },
        socketId: { type: String, default: "" }
    },

    // Game state
    board: {
        type:    [String],
        default: ["","","","","","","","",""]
    },

    currentTurn: {
        type:    String,
        enum:    ["X", "O", "none"],
        default: "X"
    },

    status: {
        type:    String,
        enum:    ["waiting", "playing", "finished", "abandoned"],
        default: "waiting"
    },

    winner: {
        type:    String,
        enum:    ["X", "O", "draw", null],
        default: null
    },

    // Scores within this session
    scoreX: { type: Number, default: 0 },
    scoreO: { type: Number, default: 0 },

    // Match format (best of 3 or 5)
    matchFormat: {
        type:    Number,
        enum:    [1, 3, 5],
        default: 3
    },

    roundsPlayed: {
        type:    Number,
        default: 0
    },

    // Room type
    type: {
        type:    String,
        enum:    ["private", "public", "quickmatch"],
        default: "public"
    },

    // For quick match — which queue entry created this
    queueIds: {
        type:    [String],
        default: []
    },

    // Auto-expire waiting rooms after 10 min
    expiresAt: {
        type:    Date,
        default: () => new Date(Date.now() + 10 * 60 * 1000)
    }

}, {
    timestamps: true
});

// ── Auto-delete finished/abandoned rooms after 1 hour ─────────
gameRoomSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// ── Index for quick lookup ────────────────────────────────────
gameRoomSchema.index({ status: 1, type: 1 });
gameRoomSchema.index({ roomCode: 1 });

module.exports = mongoose.model("GameRoom", gameRoomSchema);
