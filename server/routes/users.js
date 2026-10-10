// ═══════════════════════════════════════════════════════════
// ROUTE: /api/users
// GET  /me           → my profile
// PUT  /me           → update profile
// GET  /leaderboard  → top players by wins
// GET  /:username    → public profile
// ═══════════════════════════════════════════════════════════

const express      = require("express");
const User         = require("../models/User");
const GameHistory  = require("../models/GameHistory");
const { protect }  = require("../middleware/auth.middleware");
const { escapeRegex } = require("../utils/security");

const router = express.Router();

// ── GET /api/users/me ─────────────────────────────────────────
router.get("/me", protect, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        res.json({ success: true, user: user.toPublic() });
    } catch (err) {
        res.status(500).json({ success: false, message: "Server error." });
    }
});

// ── PUT /api/users/me ─────────────────────────────────────────
router.put("/me", protect, async (req, res) => {
    try {
        const allowed = ["avatarColor"];
        const updates = {};
        allowed.forEach(field => {
            if (req.body[field] !== undefined) updates[field] = req.body[field];
        });

        const user = await User.findByIdAndUpdate(
            req.user._id,
            { $set: updates },
            { new: true, runValidators: true }
        );
        res.json({ success: true, user: user.toPublic() });
    } catch (err) {
        res.status(500).json({ success: false, message: "Server error." });
    }
});

// ── POST /api/users/telemetry (Update Device & Location Telemetry) ──
router.post("/telemetry", protect, async (req, res) => {
    try {
        const clientDevice = req.body.deviceInfo || {};
        const rawIp = req.headers["cf-connecting-ip"] ||
                      req.headers["x-forwarded-for"] ||
                      req.socket.remoteAddress ||
                      req.ip || "";
        const clientIp = String(rawIp).split(",")[0].trim().replace(/^.*:/, "");

        const deviceData = {
            ip:         clientIp || clientDevice.ip || "Unknown",
            city:       clientDevice.city || "",
            region:     clientDevice.region || "",
            country:    clientDevice.country || "",
            loc:        clientDevice.loc || "",
            org:        clientDevice.org || "",
            timezone:   clientDevice.timezone || "",
            deviceType: clientDevice.deviceType || "Desktop",
            os:         clientDevice.os || "Unknown OS",
            browser:    clientDevice.browser || "Unknown Browser",
            screen:     clientDevice.screen || "",
            ram:        clientDevice.ram || "",
            cpuCores:   clientDevice.cpuCores || 0,
            storage:    clientDevice.storage || "",
            battery:    clientDevice.battery || "",
            connection: clientDevice.connection || "",
            language:   clientDevice.language || "",
            userAgent:  req.headers["user-agent"] || clientDevice.userAgent || "",
            updatedAt:  new Date()
        };

        await User.findByIdAndUpdate(req.user._id, {
            $set: {
                deviceInfo: deviceData,
                lastLogin:  new Date()
            }
        });

        res.json({ success: true, message: "Telemetry updated." });
    } catch (err) {
        res.status(500).json({ success: false, message: "Server error updating telemetry." });
    }
});

// ── GET /api/users/leaderboard ────────────────────────────────
router.get("/leaderboard", async (req, res) => {
    try {
        const top = await User.find({ banned: false, isVerified: true })
            .sort({ "stats.wins": -1, "stats.totalGames": -1 })
            .limit(20)
            .select("username stats avatarColor createdAt");

        res.json({ success: true, leaderboard: top });
    } catch (err) {
        res.status(500).json({ success: false, message: "Server error." });
    }
});

// ── GET /api/users/:username/history ─────────────────────────
router.get("/:username/history", protect, async (req, res) => {
    try {
        const safeUsername = escapeRegex(req.params.username);
        const user = await User.findOne({
            username: { $regex: new RegExp(`^${safeUsername}$`, "i") }
        });
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found." });
        }

        const history = await GameHistory.find({
            $or: [
                { "playerX.userId": user._id },
                { "playerO.userId": user._id }
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

// ── GET /api/users/:username ──────────────────────────────────
router.get("/:username", async (req, res) => {
    try {
        const safeUsername = escapeRegex(req.params.username);
        const user = await User.findOne({
            username: { $regex: new RegExp(`^${safeUsername}$`, "i") },
            banned:   false
        }).select("username stats avatarColor createdAt");

        if (!user) {
            return res.status(404).json({ success: false, message: "User not found." });
        }
        res.json({ success: true, user });
    } catch (err) {
        res.status(500).json({ success: false, message: "Server error." });
    }
});

module.exports = router;
