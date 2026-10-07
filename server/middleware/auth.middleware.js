// ═══════════════════════════════════════════════════════════
// MIDDLEWARE: JWT Auth + Role Guard
// ═══════════════════════════════════════════════════════════

const jwt  = require("jsonwebtoken");
const User = require("../models/User");

// ── Verify JWT token ──────────────────────────────────────────
const protect = async (req, res, next) => {
    try {
        const header = req.headers.authorization;
        if (!header || !header.startsWith("Bearer ")) {
            return res.status(401).json({ success: false, message: "No token provided" });
        }

        const token = header.split(" ")[1];
        // clockTolerance: 5 min — handles PC time drift/changes
        const decoded = jwt.verify(token, process.env.JWT_SECRET, { clockTolerance: 300 });

        const user = await User.findById(decoded.id).select("-password");
        if (!user) {
            return res.status(401).json({ success: false, message: "User not found" });
        }
        if (user.banned) {
            return res.status(403).json({ success: false, message: "Account is banned" });
        }

        req.user = user;
        next();
    } catch (err) {
        return res.status(401).json({ success: false, message: "Invalid or expired token" });
    }
};

// ── Admin only ────────────────────────────────────────────────
const adminOnly = (req, res, next) => {
    if (!req.user || req.user.role !== "admin") {
        return res.status(403).json({ success: false, message: "Admin access required" });
    }
    next();
};

// ── Generate JWT ──────────────────────────────────────────────
const signToken = (userId) => {
    return jwt.sign(
        { id: userId },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
    );
};

module.exports = { protect, adminOnly, signToken };
