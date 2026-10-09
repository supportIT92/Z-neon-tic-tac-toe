// ═══════════════════════════════════════════════════════════
// ROUTE: /api/admin  (Admin Only Endpoints)
// ═══════════════════════════════════════════════════════════

const express      = require("express");
const User         = require("../models/User");
const GameHistory  = require("../models/GameHistory");
const GameRoom     = require("../models/GameRoom");
const ActivityLog  = require("../models/ActivityLog");
const { protect, adminOnly } = require("../middleware/auth.middleware");
const { escapeRegex }        = require("../utils/security");

const router = express.Router();

// All admin routes require authentication + admin role
router.use(protect, adminOnly);

// ── GET /api/admin/stats ──────────────────────────────────────
router.get("/stats", async (req, res) => {
    try {
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        const [totalUsers, adminCount, bannedUsers, activeToday, totalGames, activeRooms] = await Promise.all([
            User.countDocuments(),
            User.countDocuments({ role: "admin" }),
            User.countDocuments({ banned: true }),
            User.countDocuments({ lastLogin: { $gte: startOfToday } }),
            GameHistory.countDocuments(),
            GameRoom.countDocuments({ status: { $in: ["waiting", "playing"] } })
        ]);

        const recentUsers = await User.find()
            .sort({ createdAt: -1 })
            .limit(5)
            .select("username email createdAt role banned lastLogin");

        res.json({
            success: true,
            stats: {
                totalUsers,
                admins: adminCount,
                bannedUsers,
                activeToday,
                totalGames,
                activeRooms
            },
            recentUsers: recentUsers.map(u => ({
                id:        u._id,
                username:  u.username,
                email:     u.email,
                role:      u.role,
                banned:    u.banned,
                createdAt: u.createdAt,
                lastLogin: u.lastLogin
            }))
        });
    } catch (err) {
        console.error("[admin/stats error]", err);
        res.status(500).json({ success: false, message: "Server error fetching stats." });
    }
});

// ── GET /api/admin/users ──────────────────────────────────────
router.get("/users", async (req, res) => {
    try {
        const page   = Math.max(1, parseInt(req.query.page) || 1);
        const limit  = Math.min(200, Math.max(1, parseInt(req.query.limit) || 100));
        const search = String(req.query.search || "").trim();

        const safeSearch = escapeRegex(search);
        const query = safeSearch
            ? { $or: [
                { username: { $regex: safeSearch, $options: "i" } },
                { email:    { $regex: safeSearch, $options: "i" } }
              ]}
            : {};

        const users = await User.find(query)
            .sort({ createdAt: -1 })
            .limit(limit)
            .skip((page - 1) * limit);

        const total = await User.countDocuments(query);

        res.json({
            success: true,
            users: users.map(u => ({
                id:          u._id,
                username:    u.username,
                email:       u.email,
                role:        u.role,
                banned:      u.banned,
                createdAt:   u.createdAt,
                lastLogin:   u.lastLogin,
                stats:       u.stats
            })),
            total
        });
    } catch (err) {
        console.error("[admin/users error]", err);
        res.status(500).json({ success: false, message: "Server error fetching users." });
    }
});

const PRIMARY_ADMIN_EMAIL = "ztictactoe@outlook.com";

function isPrimaryAdmin(user) {
    if (!user) return false;
    const email = (typeof user === "string" ? user : user.email || "").toLowerCase().trim();
    return email === PRIMARY_ADMIN_EMAIL;
}

// ── PUT /api/admin/users/:id (Edit User Profile) ──────────────
router.put("/users/:id", async (req, res) => {
    try {
        const { username, email, role, password } = req.body;
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ success: false, message: "User not found." });

        if (isPrimaryAdmin(user)) {
            if (role && role !== "admin") {
                return res.status(403).json({ success: false, message: "Primary Admin role cannot be changed." });
            }
            if (email && email.toLowerCase() !== PRIMARY_ADMIN_EMAIL) {
                return res.status(403).json({ success: false, message: "Primary Admin email cannot be modified." });
            }
        }

        if (username && username.trim()) user.username = username.trim();
        if (email && email.trim() && !isPrimaryAdmin(user)) user.email = email.trim().toLowerCase();
        if (role && ["user", "admin"].includes(role)) {
            user.role = isPrimaryAdmin(user) ? "admin" : role;
        }
        if (password && password.trim()) user.password = password.trim();

        await user.save();

        await ActivityLog.create({
            action:    "edit",
            msg:       `Updated profile for: ${user.username} (${user.email})`,
            email:     user.email,
            username:  user.username,
            timestamp: new Date()
        });

        res.json({ success: true, message: "User updated successfully.", user: user.toPublic() });
    } catch (err) {
        console.error("[admin/edit error]", err);
        res.status(500).json({ success: false, message: err.message || "Failed to update user." });
    }
});

// ── PUT /api/admin/users/:id/ban ──────────────────────────────
router.put("/users/:id/ban", async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ success: false, message: "User not found." });

        if (isPrimaryAdmin(user)) {
            return res.status(403).json({ success: false, message: "Primary Admin cannot be banned." });
        }

        user.banned = true;
        await user.save();

        await ActivityLog.create({
            action:    "ban",
            msg:       `Banned user: ${user.username} (${user.email})`,
            email:     user.email,
            username:  user.username,
            timestamp: new Date()
        });

        res.json({ success: true, message: `${user.username} has been banned.` });
    } catch (err) {
        res.status(500).json({ success: false, message: "Server error." });
    }
});

// ── PUT /api/admin/users/:id/unban ────────────────────────────
router.put("/users/:id/unban", async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ success: false, message: "User not found." });

        user.banned = false;
        await user.save();

        await ActivityLog.create({
            action:    "unban",
            msg:       `Unbanned user: ${user.username} (${user.email})`,
            email:     user.email,
            username:  user.username,
            timestamp: new Date()
        });

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
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ success: false, message: "User not found." });

        if (isPrimaryAdmin(user)) {
            return res.status(403).json({ success: false, message: "Primary Admin role cannot be changed." });
        }

        user.role = role;
        await user.save();

        await ActivityLog.create({
            action:    role === "admin" ? "promote" : "demote",
            msg:       `Changed role for ${user.username} to ${role}`,
            email:     user.email,
            username:  user.username,
            timestamp: new Date()
        });

        res.json({ success: true, message: `${user.username} role updated to ${role}.` });
    } catch (err) {
        res.status(500).json({ success: false, message: "Server error." });
    }
});

// ── DELETE /api/admin/users/:id ───────────────────────────────
router.delete("/users/:id", async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ success: false, message: "User not found." });

        if (isPrimaryAdmin(user)) {
            return res.status(403).json({ success: false, message: "Primary Admin cannot be deleted." });
        }

        await User.findByIdAndDelete(req.params.id);

        await ActivityLog.create({
            action:    "delete",
            msg:       `Deleted user account: ${user.username} (${user.email})`,
            email:     user.email,
            username:  user.username,
            timestamp: new Date()
        });

        res.json({ success: true, message: `${user.username} deleted.` });
    } catch (err) {
        res.status(500).json({ success: false, message: "Server error." });
    }
});

// ── GET /api/admin/logs (Activity Logs with auto-backfill) ───
router.get("/logs", async (req, res) => {
    try {
        let logs = await ActivityLog.find().sort({ timestamp: -1 }).limit(100);

        // If no logs exist yet, auto-populate from existing DB users (backfill)
        if (logs.length === 0) {
            const users = await User.find().sort({ createdAt: -1 });
            const backfill = [];

            for (const u of users) {
                backfill.push({
                    action:    "register",
                    msg:       `User registered: ${u.username} (${u.email})`,
                    email:     u.email,
                    username:  u.username,
                    timestamp: u.createdAt || new Date()
                });
                if (u.lastLogin) {
                    backfill.push({
                        action:    "login",
                        msg:       `User logged in: ${u.username} (${u.email})`,
                        email:     u.email,
                        username:  u.username,
                        timestamp: u.lastLogin
                    });
                }
            }

            if (backfill.length > 0) {
                backfill.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                await ActivityLog.insertMany(backfill);
                logs = await ActivityLog.find().sort({ timestamp: -1 }).limit(100);
            }
        }

        res.json({
            success: true,
            logs: logs.map(l => ({
                action:    l.action,
                msg:       l.msg,
                email:     l.email,
                username:  l.username,
                timestamp: l.timestamp
            }))
        });
    } catch (err) {
        console.error("[admin/logs error]", err);
        res.status(500).json({ success: false, message: "Server error fetching activity logs." });
    }
});

// ── DELETE /api/admin/logs (Clear Activity Logs) ──────────────
router.delete("/logs", async (req, res) => {
    try {
        await ActivityLog.deleteMany({});
        res.json({ success: true, message: "Activity log cleared successfully." });
    } catch (err) {
        res.status(500).json({ success: false, message: "Server error clearing logs." });
    }
});

// ── POST /api/admin/reset-stats ───────────────────────────────
router.post("/reset-stats", async (req, res) => {
    try {
        await User.updateMany({}, {
            $set: {
                "stats.wins": 0,
                "stats.losses": 0,
                "stats.draws": 0,
                "stats.totalGames": 0,
                "stats.bestScore": 0
            }
        });

        await ActivityLog.create({
            action:    "reset",
            msg:       "All player stats were reset by admin",
            timestamp: new Date()
        });

        res.json({ success: true, message: "All player stats have been reset." });
    } catch (err) {
        res.status(500).json({ success: false, message: "Server error resetting stats." });
    }
});

// ── POST /api/admin/nuke-users ────────────────────────────────
router.post("/nuke-users", async (req, res) => {
    try {
        const result = await User.deleteMany({ role: { $ne: "admin" } });

        await ActivityLog.create({
            action:    "nuke",
            msg:       `Deleted all non-admin users (${result.deletedCount} removed)`,
            timestamp: new Date()
        });

        res.json({ success: true, message: `Deleted ${result.deletedCount} users.` });
    } catch (err) {
        res.status(500).json({ success: false, message: "Server error deleting users." });
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
        res.status(500).json({ success: false, message: "Server error fetching games." });
    }
});

module.exports = router;
