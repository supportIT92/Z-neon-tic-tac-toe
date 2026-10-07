// ═══════════════════════════════════════════════════════════
// NEON GAMING — Backend Server
// Express + Socket.io + MongoDB (Mongoose)
// Deploy: Render.com
// ═══════════════════════════════════════════════════════════

require("dotenv").config();

const express   = require("express");
const http      = require("http");
const cors      = require("cors");
const helmet    = require("helmet");
const morgan    = require("morgan");
const mongoose  = require("mongoose");
const { Server } = require("socket.io");

const authRoutes  = require("./routes/auth");
const userRoutes  = require("./routes/users");
const adminRoutes = require("./routes/admin");
const gameRoutes  = require("./routes/game");
const initSocket  = require("./socket/gameSocket");

const app    = express();
const server = http.createServer(app);

// ── Allowed origins ──────────────────────────────────────────
// Accepts: configured CLIENT_URL, localhost, and file:// (null origin for local dev)
const ALLOWED_ORIGINS = [
    process.env.CLIENT_URL,
    "http://localhost:5500",
    "http://127.0.0.1:5500",
    "http://localhost:3000",
    "null"   // file:// pages send Origin: null
].filter(Boolean);

const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (mobile apps, curl) or matched origins
        if (!origin || ALLOWED_ORIGINS.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error("CORS: origin not allowed — " + origin));
        }
    },
    credentials: true
};

// ── Socket.io setup ──────────────────────────────────────────
const io = new Server(server, {
    cors: {
        origin:  ALLOWED_ORIGINS,
        methods: ["GET", "POST"]
    }
});

// ── Middleware ───────────────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors(corsOptions));
app.use(morgan("dev"));
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true }));

// ── Routes ───────────────────────────────────────────────────
app.use("/api/auth",  authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/game",  gameRoutes);

// ── Health check ─────────────────────────────────────────────
app.get("/", (req, res) => {
    res.json({
        status:  "ok",
        message: "Neon Gaming API is running 🎮",
        version: "1.0.0"
    });
});

// ── 404 handler ──────────────────────────────────────────────
app.use((req, res) => {
    res.status(404).json({ success: false, message: "Route not found" });
});

// ── Global error handler ─────────────────────────────────────
app.use((err, req, res, next) => {
    console.error("[Error]", err.message);
    res.status(err.status || 500).json({
        success: false,
        message: err.message || "Internal server error"
    });
});

// ── MongoDB connection ───────────────────────────────────────
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log("✅ MongoDB connected");

        // Init Socket.io game logic
        initSocket(io);

        // Start server
        const PORT = process.env.PORT || 5000;
        server.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT}`);
            console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`);
        });
    })
    .catch((err) => {
        console.error("❌ MongoDB connection failed:", err.message);
        process.exit(1);
    });

module.exports = { app, io };
