// ═══════════════════════════════════════════════════════════
// NEON GAMING — Backend Server
// Express + Socket.io + MongoDB (Mongoose)
// ═══════════════════════════════════════════════════════════

require("dotenv").config();

const express   = require("express");
const http      = require("http");
const path      = require("path");
const cors      = require("cors");
const helmet    = require("helmet");
const morgan    = require("morgan");
const mongoose  = require("mongoose");
const { Server } = require("socket.io");

const authRoutes  = require("./routes/auth");
const userRoutes  = require("./routes/users");
const adminRoutes = require("./routes/admin");
const gameRoutes  = require("./routes/game");
const initSocket   = require("./socket/gameSocket");
const initSelfPing = require("./utils/selfPing");

const app    = express();
const server = http.createServer(app);

// ── Allowed origins ──────────────────────────────────────────
const isProd = process.env.NODE_ENV === "production";
const ALLOWED_ORIGINS = [
    process.env.CLIENT_URL,
    "https://tictactoe.playzope.com",
    "https://supportit92.github.io",
    "http://localhost:5500",
    "http://127.0.0.1:5500",
    "http://localhost:3000",
    ...(!isProd ? ["null"] : [])
].filter(Boolean);

const corsOptions = {
    origin: function (origin, callback) {
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
app.use(helmet({
    crossOriginResourcePolicy: false,
    contentSecurityPolicy: false // Allows assets/scripts without strict inline blocking
}));
app.use(cors(corsOptions));

// Logging
morgan.token("time", () => new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: false }));
app.use(morgan((tokens, req, res) => {
    const url = tokens.url(req, res) || "";
    const skip = /\.(css|js|png|jpg|jpeg|gif|ico|mp3|mp4|woff|woff2|ttf|svg|webp)(\?|$)/i;
    const skipPaths = /^\/(\.env|\.git|server\/|node_modules)/i;
    if (skip.test(url) || skipPaths.test(url)) return null;

    const s    = res.statusCode;
    const ms   = parseFloat(tokens["response-time"](req, res)).toFixed(1);
    const time = tokens.time(req, res);
    const method = (tokens.method(req, res) || "").padEnd(6);
    const icon = s >= 500 ? "❌" : s >= 400 ? "⚠️ " : s >= 300 ? "↪ " : "✅";
    return `${time} │ ${icon} ${method} ${s} │ ${url.padEnd(35)} │ ${ms}ms`;
}));

app.use(express.json({ limit: "15kb" }));
app.use(express.urlencoded({ extended: true, limit: "15kb" }));

// ── URL & Path Traversal Normalizer ───────────────────────────
app.use((req, res, next) => {
    // Normalize redundant slashes
    if (req.url.includes("//")) {
        req.url = req.url.replace(/\/+/g, "/");
    }
    next();
});

// ── Block Sensitive Files & Source Directories ───────────────
app.use((req, res, next) => {
    const rawPath = decodeURIComponent(req.path || "");
    const normalized = path.normalize(rawPath).replace(/\\/g, "/").toLowerCase();

    // Strictly forbid server code, environment files, git, node_modules, and scripts
    const forbidden = /(^|\/)(\.env|\.git|\.gitignore|server|node_modules|package\.json|package-lock\.json|cleanDb|replace-emojis)(\/|$)/i;
    if (forbidden.test(normalized) || forbidden.test(rawPath)) {
        return res.status(404).json({ success: false, message: "Not found" });
    }
    next();
});

// ── Frontend static files ─────────────────────────────────────
const FRONTEND_DIR = path.join(__dirname, "..");

app.use(express.static(FRONTEND_DIR, {
    dotfiles: "deny",
    index:    false
}));

// ── Health & Keep-Alive Ping Endpoints ───────────────────────
app.get("/ping",   (req, res) => res.status(200).send("pong"));
app.get("/health", (req, res) => res.status(200).json({ status: "ok", uptime: Math.floor(process.uptime()) }));

// Clean URLs
app.get("/auth",   (req, res) => res.sendFile(path.join(FRONTEND_DIR, "auth/index.html")));
app.get("/online", (req, res) => res.sendFile(path.join(FRONTEND_DIR, "online/index.html")));
app.get("/admin",  (req, res) => res.sendFile(path.join(FRONTEND_DIR, "admin/index.html")));
app.get("/",       (req, res) => res.sendFile(path.join(FRONTEND_DIR, "index.html")));

// ── API Routes ───────────────────────────────────────────────
app.use("/api/auth",  authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/game",  gameRoutes);

// ── Catch-all ────────────────────────────────────────────────
app.get("*", (req, res) => {
    if (!req.path.startsWith("/api")) {
        res.sendFile(path.join(FRONTEND_DIR, "index.html"));
    } else {
        res.status(404).json({ success: false, message: "Route not found" });
    }
});

// ── Global Error Handler ─────────────────────────────────────
app.use((err, req, res, next) => {
    console.error("[Error]", err.message);
    res.status(err.status || 500).json({
        success: false,
        message: isProd ? "Internal server error" : (err.message || "Internal server error")
    });
});

// ── MongoDB connection ───────────────────────────────────────
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log("✅ MongoDB connected successfully");

        // Init Socket.io game logic
        initSocket(io);

        const PORT = process.env.PORT || 5000;
        server.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT}`);
            console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`);

            // Start self-ping keep-alive service
            initSelfPing();
        });
    })
    .catch((err) => {
        console.error("❌ MongoDB connection failed:", err.message);
        process.exit(1);
    });

module.exports = { app, io };
