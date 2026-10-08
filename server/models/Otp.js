// ═══════════════════════════════════════════════════════════
// MODEL: Otp (Server-side OTP Verification with TTL)
// ═══════════════════════════════════════════════════════════

const mongoose = require("mongoose");

const otpSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        lowercase: true,
        trim: true,
        index: true
    },
    codeHash: {
        type: String,
        required: true
    },
    purpose: {
        type: String,
        enum: ["register", "reset_password"],
        default: "register"
    },
    attempts: {
        type: Number,
        default: 0
    },
    expiresAt: {
        type: Date,
        required: true,
        index: { expires: 0 } // Auto-deleted by MongoDB TTL after expiry
    }
}, {
    timestamps: true
});

module.exports = mongoose.model("Otp", otpSchema);
