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
 * Hashes OTP or tokens using SHA-256 for secure database storage.
 */
function hashOtp(code) {
    return crypto.createHash("sha256").update(String(code).trim()).digest("hex");
}

/**
 * Generates a cryptographically secure random hex token for password reset links.
 */
function generateResetToken() {
    return crypto.randomBytes(32).toString("hex");
}

module.exports = {
    escapeRegex,
    generateOtp,
    hashOtp,
    generateResetToken
};
