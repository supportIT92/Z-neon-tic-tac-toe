// ═══════════════════════════════════════════════════════════
// UTIL: Security Helpers (Regex Sanitization, Cryptographic OTP)
// ═══════════════════════════════════════════════════════════

const crypto = require("crypto");

/**
 * Escapes characters with special meaning in regular expressions
 * to prevent ReDoS (Regular Expression Denial of Service) and regex syntax injection.
 */
function escapeRegex(string) {
    if (typeof string !== "string") return "";
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Generates a cryptographically secure 6-digit numeric OTP.
 */
function generateOtp() {
    return String(crypto.randomInt(100000, 1000000));
}

/**
 * Hashes OTP using SHA-256 for secure database storage.
 */
function hashOtp(code) {
    return crypto.createHash("sha256").update(String(code).trim()).digest("hex");
}

module.exports = {
    escapeRegex,
    generateOtp,
    hashOtp
};
