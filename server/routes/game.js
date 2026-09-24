// ═══════════════════════════════════════════════════════════
// ROUTE: /api/game
// GET  /rooms        → active public rooms
// POST /rooms        → create room
// GET  /rooms/:code  → get room by code
// GET  /history      → my game history
// ═══════════════════════════════════════════════════════════

const express  = require("express");
const GameRoom = require("../models/GameRoom");
const GameHistory = require("../models/GameHistory");
const { protect } = require("../middleware/auth.middleware");

const router = express.Router();

// ── GET /api/game/rooms (public waiting rooms) ────────────────
router.get("/rooms", async (req, res) => {
    try {
        const rooms = await GameRoom.find({
            status: "waiting",
            type:   { $in: ["public", "quickmatch"] }
        })
        .sort({ createdAt: -1 })
        .limit(20)
        .select("roomCode playerX.username scoreX scoreO createdAt type");

        res.json({ success: true, rooms });
    } catch (err) {
        res.status(500).json({ success: false, message: "Server error." });
    }
});

// ── GET /api/game/rooms/:code ─────────────────────────────────
router.get("/rooms/:code", async (req, res) => {
    try {
        const room = await GameRoom.findOne({ roomCode: req.params.code.toUpperCase() });
        if (!room) return res.status(404).json({ success: false, message: "Room not found." });
        res.json({ success: true, room });
    } catch (err) {
        res.status(500).json({ success: false, message: "Server error." });
    }
});

// ── GET /api/game/history ─────────────────────────────────────
router.get("/history", protect, async (req, res) => {
    try {
        const history = await GameHistory.find({
            $or: [
                { "playerX.userId": req.user._id },
                { "playerO.userId": req.user._id }
            ]
        })
        .sort({ createdAt: -1 })
        .limit(20)
        .select("-moves");

        res.json({ success: true, history });
    } catch (err) {
        res.status(500).json({ success: false, message: "Server error." });
    }
});

module.exports = router;
