const mongoose = require("mongoose");

const archivedTelemetrySchema = new mongoose.Schema({
    userId:       { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    username:     { type: String, default: "" },
    email:        { type: String, default: "" },
    deviceInfo:   { type: Object, default: {} },
    loginHistory: { type: Array,  default: [] },
    clearedAt:    { type: Date,   default: Date.now }
});

module.exports = mongoose.model("ArchivedTelemetry", archivedTelemetrySchema);
