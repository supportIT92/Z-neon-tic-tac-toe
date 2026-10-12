// ═══════════════════════════════════════════════════════════
// ROUTE: /api/admin  (Admin Only Endpoints)
// ═══════════════════════════════════════════════════════════

const express      = require("express");
const User         = require("../models/User");
const GameHistory  = require("../models/GameHistory");
const GameRoom     = require("../models/GameRoom");
const ActivityLog  = require("../models/ActivityLog");
const ArchivedTelemetry = require("../models/ArchivedTelemetry");
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
            User.countDocuments({ isDeleted: { $ne: true } }),
            User.countDocuments({ role: "admin", isDeleted: { $ne: true } }),
            User.countDocuments({ banned: true, isDeleted: { $ne: true } }),
            User.countDocuments({ lastLogin: { $gte: startOfToday }, isDeleted: { $ne: true } }),
            GameHistory.countDocuments(),
            GameRoom.countDocuments({ status: { $in: ["waiting", "playing"] } })
        ]);

        const recentUsers = await User.find({ isDeleted: { $ne: true } })
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
        const query = {
            isDeleted: { $ne: true },
            ...(safeSearch
                ? { $or: [
                    { username: { $regex: safeSearch, $options: "i" } },
                    { email:    { $regex: safeSearch, $options: "i" } }
                  ]}
                : {})
        };

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
                stats:       u.stats,
                deviceInfo:  u.deviceInfo || null,
                loginHistory:u.loginHistory || []
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

// ── DELETE /api/admin/users/:id (Soft-Delete: Move to Master Data) ─
router.delete("/users/:id", async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ success: false, message: "User not found." });

        if (isPrimaryAdmin(user)) {
            return res.status(403).json({ success: false, message: "Primary Admin cannot be deleted." });
        }

        user.isDeleted = true;
        user.deletedAt = new Date();
        await user.save();

        await ActivityLog.create({
            action:    "delete",
            msg:       `Moved user account to Master Data (Soft Delete): ${user.username} (${user.email})`,
            email:     user.email,
            username:  user.username,
            timestamp: new Date()
        });

        res.json({ success: true, message: `${user.username} moved to Master Data.` });
    } catch (err) {
        res.status(500).json({ success: false, message: "Server error." });
    }
});

// ── POST /api/admin/users/:id/clear-telemetry (Clear System Details & Move to Master Data) ─
router.post("/users/:id/clear-telemetry", async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ success: false, message: "User not found." });

        // Archive existing telemetry before clearing
        const oldDevice = user.deviceInfo ? user.deviceInfo.toObject ? user.deviceInfo.toObject() : user.deviceInfo : {};
        const oldHistory = Array.isArray(user.loginHistory) ? user.loginHistory : [];

        const archived = await ArchivedTelemetry.create({
            userId: user._id,
            username: user.username,
            email: user.email,
            deviceInfo: oldDevice,
            loginHistory: oldHistory,
            clearedAt: new Date()
        });

        // Reset user telemetry and history
        user.deviceInfo = {};
        user.loginHistory = [];
        await user.save();

        await ActivityLog.create({
            action:    "clear_log",
            msg:       `Cleared system & hardware telemetry logs for ${user.username} (${user.email}) -> Archived to Master Data`,
            email:     user.email,
            username:  user.username,
            timestamp: new Date()
        });

        res.json({
            success: true,
            message: `Cleared telemetry logs for ${user.username}. Data moved to Master Data.`,
            archivedId: archived._id
        });
    } catch (err) {
        console.error("[clear-telemetry error]", err);
        res.status(500).json({ success: false, message: "Failed to clear telemetry log." });
    }
});

// ═══════════════════════════════════════════════════════════════
// MASTER DATA (RECYCLE BIN & ARCHIVED TELEMETRY) ENDPOINTS
// ═══════════════════════════════════════════════════════════════

// ── GET /api/admin/master (Get All Master Data: Deleted Users & Cleared Logs) ──
router.get("/master", async (req, res) => {
    try {
        const [deletedUsers, archivedTelemetry] = await Promise.all([
            User.find({ isDeleted: true }).sort({ deletedAt: -1 }),
            ArchivedTelemetry.find().sort({ clearedAt: -1 })
        ]);

        res.json({
            success: true,
            users: deletedUsers.map(u => ({
                id:          u._id,
                username:    u.username,
                email:       u.email,
                role:        u.role,
                banned:      u.banned,
                createdAt:   u.createdAt,
                lastLogin:   u.lastLogin,
                deletedAt:   u.deletedAt,
                hasPassword: Boolean(u.password),
                passwordStatus: "•••••••• (Encrypted & Preserved)"
            })),
            telemetry: archivedTelemetry.map(t => ({
                id:          t._id,
                userId:      t.userId,
                username:    t.username,
                email:       t.email,
                deviceInfo:  t.deviceInfo || {},
                loginHistory:t.loginHistory || [],
                clearedAt:   t.clearedAt
            }))
        });
    } catch (err) {
        console.error("[admin/master error]", err);
        res.status(500).json({ success: false, message: "Failed to fetch master data." });
    }
});

// ── POST /api/admin/master/users/:id/recover (Recover User Account) ──
router.post("/master/users/:id/recover", async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ success: false, message: "User not found in master data." });

        user.isDeleted = false;
        user.deletedAt = null;
        await user.save();

        await ActivityLog.create({
            action:    "recover",
            msg:       `Recovered user account from Master Data: ${user.username} (${user.email})`,
            email:     user.email,
            username:  user.username,
            timestamp: new Date()
        });

        res.json({ success: true, message: `Account ${user.username} successfully recovered.` });
    } catch (err) {
        console.error("[master/recover user error]", err);
        res.status(500).json({ success: false, message: "Failed to recover user." });
    }
});

// ── DELETE /api/admin/master/users/:id/permanent (Permanent Delete User) ──
// ── DELETE /api/admin/master/users/:id/permanent (Permanent Delete User) ──
router.delete("/master/users/:id/permanent", async (req, res) => {
    try {
        const { secretCode } = req.body || {};
        if (secretCode !== "Ztictactoe0") {
            return res.status(403).json({ success: false, message: "Invalid secret code. Permanent deletion aborted." });
        }

        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ success: false, message: "User not found." });

        if (isPrimaryAdmin(user)) {
            return res.status(403).json({ success: false, message: "Primary Admin cannot be permanently deleted." });
        }

        const username = user.username;
        const email = user.email;

        await User.findByIdAndDelete(req.params.id);

        await ActivityLog.create({
            action:    "permanent_delete",
            msg:       `Permanently deleted user account with secret authorization: ${username} (${email})`,
            email:     email,
            username:  username,
            timestamp: new Date()
        });

        res.json({ success: true, message: `Account ${username} permanently deleted from database.` });
    } catch (err) {
        console.error("[master/permanent delete user error]", err);
        res.status(500).json({ success: false, message: "Failed to permanently delete user." });
    }
});

// ── POST /api/admin/master/telemetry/:id/recover (Recover Cleared Telemetry) ──
router.post("/master/telemetry/:id/recover", async (req, res) => {
    try {
        const record = await ArchivedTelemetry.findById(req.params.id);
        if (!record) return res.status(404).json({ success: false, message: "Archived telemetry not found." });

        // Find associated user
        const user = await User.findById(record.userId);
        if (!user) {
            return res.status(404).json({ success: false, message: "Associated active user not found to restore log to." });
        }

        // Restore telemetry and login history
        user.deviceInfo = record.deviceInfo || {};
        user.loginHistory = record.loginHistory || [];
        await user.save();

        // Remove from archive now that it's restored
        await ArchivedTelemetry.findByIdAndDelete(req.params.id);

        await ActivityLog.create({
            action:    "recover_telemetry",
            msg:       `Restored hardware & system telemetry back to user: ${user.username} (${user.email})`,
            email:     user.email,
            username:  user.username,
            timestamp: new Date()
        });

        res.json({ success: true, message: `Telemetry logs successfully restored for ${user.username}.` });
    } catch (err) {
        console.error("[master/recover telemetry error]", err);
        res.status(500).json({ success: false, message: "Failed to recover telemetry log." });
    }
});

// ── DELETE /api/admin/master/telemetry/:id/permanent (Permanent Delete Telemetry) ──
router.delete("/master/telemetry/:id/permanent", async (req, res) => {
    try {
        const { secretCode } = req.body || {};
        if (secretCode !== "Ztictactoe0") {
            return res.status(403).json({ success: false, message: "Invalid secret code. Permanent deletion aborted." });
        }

        const record = await ArchivedTelemetry.findById(req.params.id);
        if (!record) return res.status(404).json({ success: false, message: "Archived telemetry not found." });

        await ArchivedTelemetry.findByIdAndDelete(req.params.id);

        await ActivityLog.create({
            action:    "permanent_delete_telemetry",
            msg:       `Permanently deleted archived telemetry with secret authorization for ${record.username} (${record.email})`,
            email:     record.email,
            username:  record.username,
            timestamp: new Date()
        });

        res.json({ success: true, message: `Archived telemetry record permanently deleted.` });
    } catch (err) {
        console.error("[master/permanent delete telemetry error]", err);
        res.status(500).json({ success: false, message: "Failed to permanently delete telemetry." });
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
        const result = await User.deleteMany({
            role: { $ne: "admin" },
            email: { $ne: PRIMARY_ADMIN_EMAIL.toLowerCase() }
        });

        await ActivityLog.create({
            action:    "nuke",
            msg:       `Deleted all non-admin users (${result.deletedCount} removed). Admin accounts preserved.`,
            timestamp: new Date()
        });

        res.json({ success: true, message: `Deleted ${result.deletedCount} normal users. Admin accounts preserved.` });
    } catch (err) {
        res.status(500).json({ success: false, message: "Server error deleting users." });
    }
});

// ── GET /api/admin/games (All recent game matches) ───────────
router.get("/games", async (req, res) => {
    try {
        const page  = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));

        const [games, total] = await Promise.all([
            GameHistory.find()
                .sort({ createdAt: -1 })
                .limit(limit)
                .skip((page - 1) * limit)
                .select("-moves"),
            GameHistory.countDocuments()
        ]);

        res.json({ success: true, games, total });
    } catch (err) {
        res.status(500).json({ success: false, message: "Server error fetching games." });
    }
});

// ── GET /api/admin/users/:id/history (All matches of specific user) ──
router.get("/users/:id/history", async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ success: false, message: "User not found." });

        const [games, logs] = await Promise.all([
            GameHistory.find({
                $or: [
                    { "playerX.userId": user._id },
                    { "playerO.userId": user._id },
                    { "playerX.username": user.username },
                    { "playerO.username": user.username }
                ]
            })
            .sort({ createdAt: -1 })
            .limit(100)
            .select("-moves"),

            ActivityLog.find({
                $or: [
                    { email: user.email },
                    { username: user.username }
                ]
            })
            .sort({ timestamp: -1 })
            .limit(50)
        ]);

        res.json({
            success: true,
            user: {
                id:          user._id,
                username:    user.username,
                email:       user.email,
                role:        user.role,
                banned:      user.banned,
                stats:       user.stats,
                deviceInfo:  user.deviceInfo || null,
                loginHistory:user.loginHistory || [],
                createdAt:   user.createdAt,
                lastLogin:   user.lastLogin
            },
            games,
            logs
        });
    } catch (err) {
        console.error("[admin/users/:id/history error]", err);
        res.status(500).json({ success: false, message: "Server error fetching user history." });
    }
});

module.exports = router;
