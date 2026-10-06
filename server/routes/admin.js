// ═══════════════════════════════════════════════════════════
// ROUTE: /api/admin  (admin only)
// GET  /users        → all users
// PUT  /users/:id/ban   → ban user
// PUT  /users/:id/unban → unban user
// DELETE /users/:id  → delete user
// GET  /stats        → site stats
// GET  /games        → recent games
// ═══════════════════════════════════════════════════════════

const express  = require("express");
const User     = require("../models/User");
const GameHistory = require("../models/GameHistory");
const GameRoom    = require("../models/GameRoom");
const { protect, adminOnly } = require("../middleware/auth.middleware");

const router = express.Router();

// All admin routes require auth + admin role
router.use(protect, adminOnly);

// ── GET /api/admin/users ──────────────────────────────────────
router.get("/users", async (req, res) => {
    try {
        const { page = 1, limit = 50, search = "" } = req.query;
        const query = search
            ? { $or: [
                { username: { $regex: search, $options: "i" } },
                { email:    { $regex: search, $options: "i" } }
              ]}
            : {};

        const users = await User.find(query)
            .sort({ createdAt: -1 })
            .limit(Number(limit))
            .skip((Number(page) - 1) * Number(limit));

        const total = await User.countDocuments(query);

        res.json({ success: true, users: users.map(u => u.toPublic()), total });
    } catch (err) {
        res.status(500).json({ success: false, message: "Server error." });
    }
});

// ── PUT /api/admin/users/:id/ban ──────────────────────────────
router.put("/users/:id/ban", async (req, res) => {
    try {
        const user = await User.findByIdAndUpdate(
            req.params.id,
            { banned: true },
            { new: true }
        );
        if (!user) return res.status(404).json({ success: false, message: "User not found." });
        res.json({ success: true, message: `${user.username} has been banned.` });
    } catch (err) {
        res.status(500).json({ success: false, message: "Server error." });
    }
});

// ── PUT /api/admin/users/:id/unban ────────────────────────────
router.put("/users/:id/unban", async (req, res) => {
    try {
        const user = await User.findByIdAndUpdate(
            req.params.id,
            { banned: false },
            { new: true }
        );
        if (!user) return res.status(404).json({ success: false, message: "User not found." });
        res.json({ success: true, message: `${user.username} has been unbanned.` });
    } catch (err) {
        res.status(500).json({ success: false, message: "Server error." });
    }
});

// ── PUT /api/admin/users/:id/role ─────────────────────────────
router.put("/users/:id/role", async (req, res) => {
    try {
        const { role } = req.body;
        if (!["user", "admin"].includes(role)) {
            return res.status(400).json({ success: false, message: "Invalid role." });
        }
        const user = await User.findByIdAndUpdate(
            req.params.id, { role }, { new: true }
        );
        if (!user) return res.status(404).json({ success: false, message: "User not found." });
        res.json({ success: true, message: `${user.username} role updated to ${role}.` });
    } catch (err) {
        res.status(500).json({ success: false, message: "Server error." });
    }
});

// ── DELETE /api/admin/users/:id ───────────────────────────────
router.delete("/users/:id", async (req, res) => {
    try {
        const user = await User.findByIdAndDelete(req.params.id);
        if (!user) return res.status(404).json({ success: false, message: "User not found." });
        res.json({ success: true, message: `${user.username} deleted.` });
    } catch (err) {
        res.status(500).json({ success: false, message: "Server error." });
    }
});

// ── GET /api/admin/stats ──────────────────────────────────────
router.get("/stats", async (req, res) => {
    try {
        const [totalUsers, bannedUsers, totalGames, activeRooms] = await Promise.all([
            User.countDocuments(),
            User.countDocuments({ banned: true }),
            GameHistory.countDocuments(),
            GameRoom.countDocuments({ status: { $in: ["waiting", "playing"] } })
        ]);

        const recentUsers = await User.find()
            .sort({ createdAt: -1 })
            .limit(5)
            .select("username email createdAt role");

        res.json({
            success: true,
            stats: { totalUsers, bannedUsers, totalGames, activeRooms },
            recentUsers
        });
    } catch (err) {
        res.status(500).json({ success: false, message: "Server error." });
    }
});

// ── GET /api/admin/games ──────────────────────────────────────
router.get("/games", async (req, res) => {
    try {
        const games = await GameHistory.find()
            .sort({ createdAt: -1 })
            .limit(50)
            .select("-moves");
        res.json({ success: true, games });
    } catch (err) {
        res.status(500).json({ success: false, message: "Server error." });
    }
});

module.exports = router;
