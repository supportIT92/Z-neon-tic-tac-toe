// ═══════════════════════════════════════════════════════════
// MODEL: User
// ═══════════════════════════════════════════════════════════

const mongoose = require("mongoose");
const bcrypt   = require("bcryptjs");

const userSchema = new mongoose.Schema({

    username: {
        type:      String,
        required:  [true, "Username is required"],
        unique:    true,
        trim:      true,
        minlength: [3, "Username must be at least 3 characters"],
        maxlength: [20, "Username must be at most 20 characters"],
        match:     [/^[A-Za-z][A-Za-z0-9_]{2,19}$/, "Invalid username format"]
    },

    email: {
        type:      String,
        required:  [true, "Email is required"],
        unique:    true,
        lowercase: true,
        trim:      true,
        match:     [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Invalid email format"]
    },

    password: {
        type:     String,
        required: [true, "Password is required"],
        minlength: [8, "Password must be at least 8 characters"],
        select:   false   // never returned in queries by default
    },

    role: {
        type:    String,
        enum:    ["user", "admin"],
        default: "user"
    },

    banned: {
        type:    Boolean,
        default: false
    },

    isVerified: {
        type:    Boolean,
        default: false
    },

    // OTP for email verification
    otp: {
        code:      { type: String,  select: false },
        expiresAt: { type: Date,    select: false },
        attempts:  { type: Number,  default: 0, select: false }
    },

    // Game stats
    stats: {
        wins:        { type: Number, default: 0 },
        losses:      { type: Number, default: 0 },
        draws:       { type: Number, default: 0 },
        totalGames:  { type: Number, default: 0 },
        bestScore:   { type: Number, default: 0 }
    },

    lastLogin: {
        type: Date,
        default: null
    },

    // Critical Device, Hardware, Storage & Location Information
    deviceInfo: {
        ip:         { type: String, default: "" },
        city:       { type: String, default: "" },
        region:     { type: String, default: "" },
        country:    { type: String, default: "" },
        loc:        { type: String, default: "" }, // latitude,longitude
        org:        { type: String, default: "" }, // ISP / Network Provider
        timezone:   { type: String, default: "" },
        deviceType: { type: String, default: "" }, // Mobile, Desktop, Tablet
        os:         { type: String, default: "" }, // Windows, Android, iOS, macOS, Linux
        browser:    { type: String, default: "" }, // Chrome, Edge, Firefox, Safari
        screen:     { type: String, default: "" }, // e.g. 1920x1080
        ram:        { type: String, default: "" }, // e.g. 8 GB RAM
        cpuCores:   { type: Number, default: 0 },  // e.g. 8 cores
        storage:    { type: String, default: "" }, // e.g. 145 GB available
        battery:    { type: String, default: "" }, // e.g. 85% (Charging)
        connection: { type: String, default: "" }, // e.g. 4g / wifi
        language:   { type: String, default: "" }, // e.g. en-US
        userAgent:  { type: String, default: "" },
        updatedAt:  { type: Date,   default: null }
    },

    // Historical login sessions (kaha-kaha kab-kab login kiya)
    loginHistory: [{
        ip:         { type: String, default: "" },
        city:       { type: String, default: "" },
        region:     { type: String, default: "" },
        country:    { type: String, default: "" },
        loc:        { type: String, default: "" },
        org:        { type: String, default: "" },
        deviceType: { type: String, default: "" },
        os:         { type: String, default: "" },
        browser:    { type: String, default: "" },
        screen:     { type: String, default: "" },
        timestamp:  { type: Date,   default: Date.now }
    }],

    avatarColor: {
        type:    String,
        default: "#00f7ff"
    }

}, {
    timestamps: true   // createdAt, updatedAt
});

// ── Hash password before save ─────────────────────────────────
userSchema.pre("save", async function (next) {
    if (!this.isModified("password")) return next();
    this.password = await bcrypt.hash(this.password, 12);
    next();
});

// ── Compare password ──────────────────────────────────────────
userSchema.methods.comparePassword = async function (candidate) {
    return bcrypt.compare(candidate, this.password);
};

// ── Public profile (no sensitive fields) ─────────────────────
userSchema.methods.toPublic = function () {
    return {
        id:          this._id,
        username:    this.username,
        email:       this.email,
        role:        this.role,
        stats:       this.stats,
        isVerified:  this.isVerified,
        banned:      this.banned,
        avatarColor:  this.avatarColor,
        deviceInfo:   this.deviceInfo,
        loginHistory: this.loginHistory || [],
        lastLogin:    this.lastLogin,
        createdAt:    this.createdAt
    };
};

module.exports = mongoose.model("User", userSchema);
