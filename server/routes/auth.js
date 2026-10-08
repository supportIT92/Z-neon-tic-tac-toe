// ═══════════════════════════════════════════════════════════
// ROUTE: /api/auth
// Endpoints:
//   POST /send-otp        → Generate & send verification OTP (Server-Side)
//   POST /register        → Verify OTP & create account + JWT
//   POST /login           → Login + return JWT
//   POST /forgot-password → Send reset OTP
//   POST /reset-password  → Verify reset OTP & update password
//   POST /logout          → Clear session
// ═══════════════════════════════════════════════════════════

const express       = require("express");
const rateLimit     = require("express-rate-limit");
const User          = require("../models/User");
const Otp           = require("../models/Otp");
const { signToken } = require("../middleware/auth.middleware");
const { sendOTPEmail, sendPasswordResetEmail } = require("../utils/email");
const { escapeRegex, generateOtp, hashOtp }    = require("../utils/security");

const router = express.Router();

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);

// ── Rate limiters ─────────────────────────────────────────────
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max:      25,
    message:  { success: false, message: "Too many authentication attempts. Please try again later." }
});

const otpLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max:      8,
    message:  { success: false, message: "Too many OTP requests. Please wait a few minutes." }
});

// ── Input Validators ──────────────────────────────────────────
function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email || "").toLowerCase());
}

function isValidUsername(name) {
    return /^[A-Za-z][A-Za-z0-9_]{2,19}$/.test(String(name || "").trim());
}

function isStrongPassword(pw) {
    if (!pw || pw.length < 8) return false;
    let score = 0;
    if (/[a-z]/.test(pw)) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    return score >= 3;
}

// ══════════════════════════════════════════════════════════════
// POST /api/auth/send-otp (Server-Side OTP Generation)
// ══════════════════════════════════════════════════════════════
router.post("/send-otp", otpLimiter, async (req, res) => {
    try {
        const { email, username } = req.body;
        console.log(`[OTP Request] 📩 Incoming OTP request for: ${email || "(no email)"} (user: ${username || "Player"})`);

        if (!email || !isValidEmail(email)) {
            console.warn(`[OTP Rejected] ⚠️ Invalid email format: ${email}`);
            return res.status(400).json({ success: false, message: "A valid email address is required." });
        }

        const cleanEmail = email.trim().toLowerCase();

        // Check if email already registered
        const existing = await User.findOne({ email: cleanEmail });
        if (existing) {
            console.warn(`[OTP Rejected] ⚠️ Email already exists in DB: ${cleanEmail}`);
            return res.status(409).json({ success: false, message: "Email is already registered. Please login instead." });
        }

        // Generate cryptographically secure OTP & hash it
        const otpCode   = generateOtp();
        const codeHash  = hashOtp(otpCode);
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

        // Upsert OTP record for this email
        await Otp.deleteMany({ email: cleanEmail, purpose: "register" });
        await Otp.create({
            email:     cleanEmail,
            codeHash,
            purpose:   "register",
            expiresAt,
            attempts:  0
        });

        const istTime = new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: false });
        const expireTime = expiresAt.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: false });
        console.log(`[OTP Stored ${istTime} IST] 🔐 Stored OTP in DB for ${cleanEmail} (code: ${otpCode}, expires at ${expireTime} IST)`);

        // Send email via Brevo
        try {
            console.log(`[OTP Dispatch ${istTime} IST] 🚀 Calling Brevo API to send OTP to ${cleanEmail}...`);
            const dispatchResult = await sendOTPEmail(cleanEmail, username || "Player", otpCode);
            console.log(`[OTP Success ${istTime} IST] ✅ OTP delivered via Brevo to ${cleanEmail}!`, dispatchResult);

            return res.json({
                success: true,
                message: "Verification code sent to your email! Valid for 5 minutes."
            });
        } catch (emailErr) {
            console.error(`[OTP Error ${istTime} IST] ❌ Brevo dispatch failed for ${cleanEmail}:`, emailErr.message);

            if (process.env.NODE_ENV !== "production") {
                return res.status(200).json({
                    success: true,
                    message: `OTP generated (Dev fallback code: ${otpCode})`,
                    devOtp: otpCode
                });
            }

            return res.status(500).json({
                success: false,
                message: `Email dispatch failed: ${emailErr.message}. Check Brevo API key & sender verification.`
            });
        }

    } catch (err) {
        console.error("[send-otp server error]", err);
        res.status(500).json({ success: false, message: `Server error generating OTP: ${err.message}` });
    }
});

// ══════════════════════════════════════════════════════════════
// POST /api/auth/register (Server-Side OTP Verification)
// ══════════════════════════════════════════════════════════════
router.post("/register", authLimiter, async (req, res) => {
    try {
        const { username, email, password, otp } = req.body;
        const cleanOtp = String(otp || "").replace(/\D/g, "").trim();

        // Validation
        if (!username || !isValidUsername(username)) {
            return res.status(400).json({ success: false, message: "Invalid username. Must be 3-20 characters, starting with a letter." });
        }
        if (!email || !isValidEmail(email)) {
            return res.status(400).json({ success: false, message: "Invalid email address format." });
        }
        if (!password || !isStrongPassword(password)) {
            return res.status(400).json({ success: false, message: "Password too weak. Minimum 8 characters with upper, lower, and numbers/symbols." });
        }
        if (!cleanOtp || cleanOtp.length !== 6) {
            return res.status(400).json({ success: false, message: "Valid 6-digit OTP code is required." });
        }

        const cleanEmail = email.trim().toLowerCase();
        const cleanName  = username.trim();
        const istTime    = new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: false });

        console.log(`[Register Verification ${istTime} IST] 🔍 Checking OTP for: ${cleanEmail}`);

        // 1. Verify OTP in database
        const otpRecord = await Otp.findOne({
            email:   cleanEmail,
            purpose: "register"
        });

        if (!otpRecord) {
            console.warn(`[Register Failed ${istTime} IST] ⚠️ No active OTP in DB for ${cleanEmail} (expired after 5m or not requested)`);
            return res.status(400).json({
                success: false,
                message: "Verification code has expired or was not requested. Please request a new code."
            });
        }

        if (otpRecord.attempts >= 5) {
            await Otp.deleteOne({ _id: otpRecord._id });
            console.warn(`[Register Failed ${istTime} IST] ⚠️ Max attempts reached for ${cleanEmail}`);
            return res.status(429).json({
                success: false,
                message: "Maximum OTP attempts exceeded. Please request a new code."
            });
        }

        const submittedHash = hashOtp(cleanOtp);
        if (submittedHash !== otpRecord.codeHash) {
            otpRecord.attempts += 1;
            await otpRecord.save();
            console.warn(`[Register Failed ${istTime} IST] ❌ Incorrect OTP code for ${cleanEmail}. Entered: "${cleanOtp}", Attempt: ${otpRecord.attempts}/5`);
            return res.status(400).json({
                success: false,
                message: `Invalid verification code. Attempts remaining: ${5 - otpRecord.attempts}`
            });
        }

        console.log(`[Register Success ${istTime} IST] ✅ OTP verified successfully for ${cleanEmail}!`);

        // 2. Check for duplicate account
        const existing = await User.findOne({
            $or: [
                { email: cleanEmail },
                { username: { $regex: new RegExp(`^${escapeRegex(cleanName)}$`, "i") } }
            ]
        });

        if (existing) {
            if (existing.email === cleanEmail) {
                return res.status(409).json({ success: false, message: "Email is already registered." });
            }
            return res.status(409).json({ success: false, message: "Username is already taken." });
        }

        // 3. Delete used OTP
        await Otp.deleteOne({ _id: otpRecord._id });

        // 4. Create User (Role assigned only after verified email)
        const role = ADMIN_EMAILS.includes(cleanEmail) ? "admin" : "user";

        const user = await User.create({
            username:   cleanName,
            email:      cleanEmail,
            password,
            role,
            isVerified: true
        });

        const token = signToken(user._id);

        res.status(201).json({
            success: true,
            message: "Account verified and registered successfully!",
            token,
            user:    user.toPublic()
        });

    } catch (err) {
        console.error("[register error]", err);
        res.status(500).json({ success: false, message: "Server error during registration." });
    }
});

// ══════════════════════════════════════════════════════════════
// POST /api/auth/login
// ══════════════════════════════════════════════════════════════
router.post("/login", authLimiter, async (req, res) => {
    try {
        const { identifier, password } = req.body;
        if (!identifier || !password) {
            return res.status(400).json({ success: false, message: "Username/email and password are required." });
        }

        const id = String(identifier).trim().toLowerCase();
        const escapedId = escapeRegex(id);

        // Find user by email or username safely
        const user = await User.findOne({
            $or: [
                { email:    id },
                { username: { $regex: new RegExp(`^${escapedId}$`, "i") } }
            ]
        }).select("+password");

        if (!user) {
            return res.status(401).json({ success: false, message: "Invalid email/username or password." });
        }

        if (user.banned) {
            return res.status(403).json({ success: false, message: "Your account has been suspended." });
        }

        const match = await user.comparePassword(password);
        if (!match) {
            return res.status(401).json({ success: false, message: "Invalid email/username or password." });
        }

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
        console.error("[login error]", err);
        res.status(500).json({ success: false, message: "Server error during login." });
    }
});

// ══════════════════════════════════════════════════════════════
// POST /api/auth/forgot-password (Send Password Reset OTP)
// ══════════════════════════════════════════════════════════════
router.post("/forgot-password", otpLimiter, async (req, res) => {
    try {
        const { email } = req.body;
        if (!email || !isValidEmail(email)) {
            return res.status(400).json({ success: false, message: "Please provide a valid email." });
        }

        const cleanEmail = email.trim().toLowerCase();
        const user = await User.findOne({ email: cleanEmail });

        // Always return generic success response to prevent email enumeration
        if (!user) {
            return res.json({
                success: true,
                message: "If an account exists with that email, a password reset code has been dispatched."
            });
        }

        const otpCode   = generateOtp();
        const codeHash  = hashOtp(otpCode);
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

        await Otp.deleteMany({ email: cleanEmail, purpose: "reset_password" });
        await Otp.create({
            email:     cleanEmail,
            codeHash,
            purpose:   "reset_password",
            expiresAt,
            attempts:  0
        });

        try {
            await sendPasswordResetEmail(cleanEmail, user.username, otpCode);
        } catch (emailErr) {
            console.error("[forgot-password SMTP error]", emailErr.message);
            if (process.env.NODE_ENV !== "production") {
                return res.json({
                    success: true,
                    message: `Reset code generated (Dev fallback: ${otpCode})`,
                    devOtp: otpCode
                });
            }
        }

        res.json({
            success: true,
            message: "If an account exists with that email, a password reset code has been dispatched."
        });

    } catch (err) {
        console.error("[forgot-password error]", err);
        res.status(500).json({ success: false, message: "Server error processing password reset request." });
    }
});

// ══════════════════════════════════════════════════════════════
// POST /api/auth/reset-password (Verify OTP & Change Password)
// ══════════════════════════════════════════════════════════════
router.post("/reset-password", authLimiter, async (req, res) => {
    try {
        const { email, otp, newPassword } = req.body;

        if (!email || !otp || !newPassword) {
            return res.status(400).json({ success: false, message: "Email, OTP code, and new password are required." });
        }

        if (!isStrongPassword(newPassword)) {
            return res.status(400).json({ success: false, message: "Password does not meet complexity requirements." });
        }

        const cleanEmail = email.trim().toLowerCase();

        const otpRecord = await Otp.findOne({
            email:   cleanEmail,
            purpose: "reset_password"
        });

        if (!otpRecord) {
            return res.status(400).json({ success: false, message: "Reset code has expired or is invalid." });
        }

        if (otpRecord.attempts >= 5) {
            await Otp.deleteOne({ _id: otpRecord._id });
            return res.status(429).json({ success: false, message: "Maximum attempts exceeded. Please request a new code." });
        }

        const submittedHash = hashOtp(otp);
        if (submittedHash !== otpRecord.codeHash) {
            otpRecord.attempts += 1;
            await otpRecord.save();
            return res.status(400).json({ success: false, message: "Invalid reset code." });
        }

        // Update user password
        const user = await User.findOne({ email: cleanEmail }).select("+password");
        if (!user) {
            return res.status(404).json({ success: false, message: "User account not found." });
        }

        user.password = newPassword;
        await user.save();

        // Remove OTP record
        await Otp.deleteOne({ _id: otpRecord._id });

        res.json({
            success: true,
            message: "Password reset successful! You can now log in with your new password."
        });

    } catch (err) {
        console.error("[reset-password error]", err);
        res.status(500).json({ success: false, message: "Server error resetting password." });
    }
});

// ══════════════════════════════════════════════════════════════
// POST /api/auth/logout
// ══════════════════════════════════════════════════════════════
router.post("/logout", (req, res) => {
    res.json({ success: true, message: "Logged out successfully." });
});

module.exports = router;
