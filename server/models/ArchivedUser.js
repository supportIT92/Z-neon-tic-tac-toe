const mongoose = require("mongoose");

const archivedUserSchema = new mongoose.Schema({
    originalUserId: { type: mongoose.Schema.Types.ObjectId, required: true },
    username:       { type: String, required: true },
    email:          { type: String, required: true },
    password:       { type: String, default: "" }, // Preserved hashed password for archival
    role:           { type: String, default: "user" },
    banned:         { type: Boolean, default: false },
    isVerified:     { type: Boolean, default: false },
    stats:          { type: Object, default: {} },
    deviceInfo:     { type: Object, default: {} },
    loginHistory:   { type: Array,  default: [] },
    accountCreated: { type: Date,   default: null },
    lastLogin:      { type: Date,   default: null },
    deletedAt:      { type: Date,   default: null }, // Date soft-deleted to master
    archivedAt:     { type: Date,   default: Date.now }, // Date permanently moved to archive folder/collection
    archivedBy:     { type: String, default: "admin" },
    reason:         { type: String, default: "Permanent deletion authorized via secret code" }
}, {
    collection: "archived_users", // Explicit MongoDB collection name
    timestamps: true
});

module.exports = mongoose.model("ArchivedUser", archivedUserSchema);
