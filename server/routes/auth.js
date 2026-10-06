// ═══════════════════════════════════════════════════════════
// ROUTE: /api/auth
// POST /register  → OTP verified on frontend via EmailJS, create user + JWT
// POST /login     → login + return JWT
// POST /logout    → client clears token (stateless)
// ═══════════════════════════════════════════════════════════

const express     = require("express");
const rateLimit   = require("express-rate-limit");
const User        = require("../models/User");
const { signToken } = require("../middleware/auth.middleware");

const router = express.Router();

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "")
    .split(",").map(e => e.trim().toLowerCase()).filter(Boolean);

// ── Rate limiters ─────────────────────────────────────────────
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max:      20,
    message:  { success: false, message: "Too many requests, try again later" }
});

// ── Validate email ────────────────────────────────────────────
function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email).toLowerCase());
}

// ── Validate username ─────────────────────────────────────────
function isValidUsername(name) {
    return /^[A-Za-z][A-Za-z0-9_]{2,19}$/.test(name.trim());
}

// ── Password strength ─────────────────────────────────────────
function isStrongPassword(pw) {
    if (pw.length < 8) return false;
    let score = 0;
    if (/[a-z]/.test(pw)) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    return score >= 3;
}

// ══════════════════════════════════════════════════════════════
// POST /api/auth/register
// OTP already verified on frontend — directly create user + return JWT
// ══════════════════════════════════════════════════════════════
router.post("/register", authLimiter, async (req, res) => {
    try {
        const { username, email, password } = req.body;

        // Validate
        if (!username || !isValidUsername(username)) {
            return res.status(400).json({ success: false, message: "Invalid username. Use 3-20 chars, start with letter." });
        }
        if (!email || !isValidEmail(email)) {
            return res.status(400).json({ success: false, message: "Invalid email address." });
        }
        if (!password || !isStrongPassword(password)) {
            return res.status(400).json({ success: false, message: "Password too weak. Use 8+ chars with uppercase, lowercase, number." });
        }

        // Final duplicate check
        const existing = await User.findOne({
            $or: [
                { email:    email.trim().toLowerCase() },
                { username: { $regex: new RegExp(`^${username.trim()}$`, "i") } }
            ]
        });

        if (existing) {
            if (existing.email === email.trim().toLowerCase()) {
                return res.status(409).json({ success: false, message: "Email already registered." });
            }
            return res.status(409).json({ success: false, message: "Username already taken." });
        }

        // Create user — OTP was verified on frontend via EmailJS
        const user = await User.create({
            username:   username.trim(),
            email:      email.trim().toLowerCase(),
            password,
            role:       ADMIN_EMAILS.includes(email.trim().toLowerCase()) ? "admin" : "user",
            isVerified: true
        });

        const token = signToken(user._id);

        res.status(201).json({
            success: true,
            message: "Account created successfully!",
            token,
            user:    user.toPublic()
        });

    } catch (err) {
        console.error("[register]", err);
        res.status(500).json({ success: false, message: "Server error. Try again." });
    }
});

// ══════════════════════════════════════════════════════════════
// POST /api/auth/login
// ══════════════════════════════════════════════════════════════
router.post("/login", authLimiter, async (req, res) => {
    try {
        const { identifier, password } = req.body;
        if (!identifier || !password) {
            return res.status(400).json({ success: false, message: "Email/username and password required." });
        }

        // Find by email or username
        const id = identifier.trim().toLowerCase();
        const user = await User.findOne({
            $or: [
                { email:    id },
                { username: { $regex: new RegExp(`^${id}$`, "i") } }
            ]
        }).select("+password");

        if (!user) {
            return res.status(401).json({ success: false, message: "No account found with that email or username." });
        }
        if (user.banned) {
            return res.status(403).json({ success: false, message: "This account has been banned." });
        }

        const match = await user.comparePassword(password);
        if (!match) {
            return res.status(401).json({ success: false, message: "Incorrect password." });
        }

        // Update last login
        user.lastLogin = new Date();
        await user.save({ validateBeforeSave: false });

        const token = signToken(user._id);

        res.json({
            success: true,
            message: `Welcome back, ${user.username}!`,
            token,
            user:    user.toPublic()
        });

    } catch (err) {
        console.error("[login]", err);
        res.status(500).json({ success: false, message: "Server error." });
    }
});

// ══════════════════════════════════════════════════════════════
// POST /api/auth/logout  (stateless — client drops token)
// ══════════════════════════════════════════════════════════════
router.post("/logout", (req, res) => {
    res.json({ success: true, message: "Logged out successfully." });
});

module.exports = router;
