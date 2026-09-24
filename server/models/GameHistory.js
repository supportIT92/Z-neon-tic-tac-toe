// ═══════════════════════════════════════════════════════════
// MODEL: GameHistory
// Permanent record of completed games
// ═══════════════════════════════════════════════════════════

const mongoose = require("mongoose");

const gameHistorySchema = new mongoose.Schema({

    roomCode: {
        type:  String,
        required: true
    },

    playerX: {
        userId:   { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        username: { type: String, required: true }
    },

    playerO: {
        userId:   { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        username: { type: String, required: true }
    },

    winner: {
        type: String,
        enum: ["X", "O", "draw"],
        required: true
    },

    winnerUsername: {
        type:    String,
        default: null
    },

    // Final board state
    finalBoard: {
        type:    [String],
        default: []
    },

    // Score at end
    scoreX: { type: Number, default: 0 },
    scoreO: { type: Number, default: 0 },

    // Total rounds played
    rounds: { type: Number, default: 1 },

    // Match format
    matchFormat: {
        type:    Number,
        default: 3
    },

    // Room type
    roomType: {
        type:    String,
        enum:    ["private", "public", "quickmatch"],
        default: "public"
    },

    // Duration in seconds
    duration: {
        type:    Number,
        default: 0
    },

    // Move history [{player, cellIndex, timestamp}]
    moves: [{
        player:    { type: String, enum: ["X", "O"] },
        cellIndex: { type: Number, min: 0, max: 8 },
        timestamp: { type: Date, default: Date.now }
    }]

}, {
    timestamps: true
});

// ── Indexes ───────────────────────────────────────────────────
gameHistorySchema.index({ "playerX.userId": 1 });
gameHistorySchema.index({ "playerO.userId": 1 });
gameHistorySchema.index({ createdAt: -1 });
gameHistorySchema.index({ winner: 1 });

module.exports = mongoose.model("GameHistory", gameHistorySchema);
