// ═══════════════════════════════════════════════════════════
// SCRIPT: Clean Database — delete all test data
// Run:  node server/scripts/cleanDb.js
// ═══════════════════════════════════════════════════════════

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const mongoose    = require("mongoose");
const User        = require("../models/User");
const GameHistory = require("../models/GameHistory");
const GameRoom    = require("../models/GameRoom");

const crypto        = require("crypto");

const ADMIN_EMAIL    = (process.env.ADMIN_EMAILS || "ztictactoe@outlook.com").split(",")[0].trim();
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "ztictactoe";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Zsupport@@@@@0";

async function cleanDatabase() {
    try {
        console.log("🔌 Connecting to MongoDB...");
        await mongoose.connect(process.env.MONGO_URI);
        console.log("✅ Connected!\n");

        // ── Delete all collections ────────────────────────────
        console.log("🗑️  Deleting all Users...");
        const userResult = await User.deleteMany({});
        console.log(`   Deleted ${userResult.deletedCount} users`);

        console.log("🗑️  Deleting all Game History...");
        const histResult = await GameHistory.deleteMany({});
        console.log(`   Deleted ${histResult.deletedCount} game history records`);

        console.log("🗑️  Deleting all Game Rooms...");
        const roomResult = await GameRoom.deleteMany({});
        console.log(`   Deleted ${roomResult.deletedCount} game rooms`);

        // ── Create fresh Admin account ────────────────────────
        console.log("\n👑 Creating Admin account...");
        const admin = await User.create({
            username:   ADMIN_USERNAME,
            email:      ADMIN_EMAIL,
            password:   ADMIN_PASSWORD,
            role:       "admin",
            isVerified: true,
            avatarColor: "#ff00ff"
        });
        console.log(`✅ Admin created:`);
        console.log(`   Username : ${admin.username}`);
        console.log(`   Email    : ${admin.email}`);
        console.log(`   Password : ${ADMIN_PASSWORD}`);
        console.log(`   Role     : ${admin.role}`);

        console.log("\n🎮 Database is fresh and ready for live users!");
        console.log("⚠️  Remember to change admin password after first login!\n");

    } catch (err) {
        console.error("❌ Error:", err.message);
    } finally {
        await mongoose.disconnect();
        console.log("🔌 Disconnected from MongoDB");
        process.exit(0);
    }
}

cleanDatabase();
