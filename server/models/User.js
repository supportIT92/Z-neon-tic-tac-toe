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
        avatarColor: this.avatarColor,
        lastLogin:   this.lastLogin,
        createdAt:   this.createdAt
    };
};

module.exports = mongoose.model("User", userSchema);
