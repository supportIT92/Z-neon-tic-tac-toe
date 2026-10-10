// ═══════════════════════════════════════════════════════════
// MODEL: ActivityLog (Persistent Admin Activity Logs)
// ═══════════════════════════════════════════════════════════

const mongoose = require("mongoose");

const activityLogSchema = new mongoose.Schema({
    action: {
        type: String,
        required: true,
        trim: true
    },
    msg: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        default: "",
        lowercase: true,
        trim: true
    },
    username: {
        type: String,
        default: "",
        trim: true
    },
    ip: {
        type: String,
        default: "",
        trim: true
    },
    deviceInfo: {
        type: Object,
        default: null
    },
    timestamp: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

activityLogSchema.index({ timestamp: -1 });

module.exports = mongoose.model("ActivityLog", activityLogSchema);
