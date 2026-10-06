// ═══════════════════════════════════════════════════════════
// API CONFIG — Backend server URL
// Change BACKEND_URL when you deploy to Render
// ═══════════════════════════════════════════════════════════

"use strict";

// ── Detect if running as a local file (no server) ────────────
const IS_LOCAL_FILE = window.location.protocol === "file:";

// ── Set this to your Render URL after deployment ─────────────
const BACKEND_URL = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "http://localhost:5000"
    : "https://neon-tictactoe-api.onrender.com";

// ── Auth token helpers ────────────────────────────────────────
const API = {

    // Get stored JWT token
    getToken() {
        try { return localStorage.getItem("neonGaming_token") || null; } catch { return null; }
    },

    // Store JWT token + session
    setSession(token, user) {
        try {
            localStorage.setItem("neonGaming_token", token);
            localStorage.setItem("neonGaming_session", JSON.stringify({
                username:  user.username,
                email:     user.email,
                role:      user.role,
                id:        user.id || user._id || "local_" + Date.now(),
                loginTime: Date.now()
            }));
        } catch { /* ignore */ }
    },

    // Clear session
    clearSession() {
        try {
            localStorage.removeItem("neonGaming_token");
            localStorage.removeItem("neonGaming_session");
        } catch { /* ignore */ }
    },

    // Get current session
    getSession() {
        try { return JSON.parse(localStorage.getItem("neonGaming_session")); } catch { return null; }
    },

    // ── Fetch wrapper ─────────────────────────────────────────
    async request(path, options = {}) {
        const url     = BACKEND_URL + path;
        const token   = this.getToken();
        const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
        if (token) headers["Authorization"] = "Bearer " + token;

        const res = await fetch(url, {
            ...options,
            headers,
            body: options.body ? JSON.stringify(options.body) : undefined
        });

        const data = await res.json();
        if (!res.ok) throw { status: res.status, message: data.message || "Request failed" };
        return data;
    },

    // ── Local (file://) user store ────────────────────────────
    _getLocalUsers() {
        try { return JSON.parse(localStorage.getItem("neonGaming_users") || "[]"); } catch { return []; }
    },
    _saveLocalUsers(users) {
        try { localStorage.setItem("neonGaming_users", JSON.stringify(users)); } catch { /* ignore */ }
    },

    // ── Local register (file:// mode — no backend needed) ────
    localRegister(body) {
        return new Promise((resolve, reject) => {
            const users    = this._getLocalUsers();
            const email    = body.email.trim().toLowerCase();
            const username = body.username.trim();

            if (users.find(u => u.email === email)) {
                return reject({ message: "Email already registered." });
            }
            if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
                return reject({ message: "Username already taken." });
            }

            const ADMIN_EMAILS = ["ztictactoe@outlook.com"];
            const user = {
                id:         "local_" + Date.now(),
                username,
                email,
                password:   body.password,   // stored plain — local dev only
                role:       ADMIN_EMAILS.includes(email) ? "admin" : "user",
                isVerified: true,
                createdAt:  new Date().toISOString()
            };
            users.push(user);
            this._saveLocalUsers(users);

            const token = "local_token_" + Date.now();
            resolve({ success: true, token, user });
        });
    },

    // ── Local login (file:// mode) ────────────────────────────
    localLogin(body) {
        return new Promise((resolve, reject) => {
            const users = this._getLocalUsers();
            const id    = body.identifier.trim().toLowerCase();
            const user  = users.find(u => u.email === id || u.username.toLowerCase() === id);

            if (!user)               return reject({ message: "No account found with that email or username." });
            if (user.banned)         return reject({ message: "This account has been banned." });
            if (user.password !== body.password) return reject({ message: "Incorrect password." });

            const token = "local_token_" + Date.now();
            resolve({ success: true, token, user });
        });
    },

    // ── Auth endpoints (auto-switch local vs backend) ─────────
    register(body) {
        return IS_LOCAL_FILE ? this.localRegister(body) : this.request("/api/auth/register", { method: "POST", body });
    },
    login(body) {
        return IS_LOCAL_FILE ? this.localLogin(body) : this.request("/api/auth/login", { method: "POST", body });
    },
    logout() {
        if (IS_LOCAL_FILE) { this.clearSession(); return Promise.resolve({ success: true }); }
        return this.request("/api/auth/logout", { method: "POST" });
    },

    // ── User endpoints ────────────────────────────────────────
    getMe:        ()     => IS_LOCAL_FILE ? Promise.resolve(API.getSession()) : API.request("/api/users/me"),
    leaderboard:  ()     => IS_LOCAL_FILE ? Promise.resolve([]) : API.request("/api/users/leaderboard"),
    gameHistory:  ()     => IS_LOCAL_FILE ? Promise.resolve([]) : API.request("/api/game/history"),
    publicRooms:  ()     => IS_LOCAL_FILE ? Promise.resolve([]) : API.request("/api/game/rooms"),

    // ── Admin endpoints ───────────────────────────────────────
    adminStats:   ()     => API.request("/api/admin/stats"),
    adminUsers:   (q)    => API.request("/api/admin/users" + (q ? "?search=" + q : "")),
    adminBan:     (id)   => API.request("/api/admin/users/" + id + "/ban",   { method: "PUT" }),
    adminUnban:   (id)   => API.request("/api/admin/users/" + id + "/unban", { method: "PUT" }),
    adminDelete:  (id)   => API.request("/api/admin/users/" + id,            { method: "DELETE" }),
    adminGames:   ()     => API.request("/api/admin/games"),
};

window.API         = API;
window.BACKEND_URL = BACKEND_URL;
window.IS_LOCAL_FILE = IS_LOCAL_FILE;
