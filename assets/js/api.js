// ═══════════════════════════════════════════════════════════
// API CONFIG — Backend server URL
// Change BACKEND_URL when you deploy to Render
// ═══════════════════════════════════════════════════════════

"use strict";

// ── Set this to your Render URL after deployment ─────────────
// e.g. "https://neon-tictactoe-api.onrender.com"
const BACKEND_URL = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "http://localhost:5000"
    : "https://neon-tictactoe-api.onrender.com"; // ← update after Render deploy

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
                id:        user.id,
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

    // ── Auth endpoints ────────────────────────────────────────
    register:   (body) => API.request("/api/auth/register",   { method: "POST", body }),
    verifyOTP:  (body) => API.request("/api/auth/verify-otp", { method: "POST", body }),
    resendOTP:  (body) => API.request("/api/auth/resend-otp", { method: "POST", body }),
    login:      (body) => API.request("/api/auth/login",      { method: "POST", body }),
    logout:     ()     => API.request("/api/auth/logout",     { method: "POST" }),

    // ── User endpoints ────────────────────────────────────────
    getMe:        ()     => API.request("/api/users/me"),
    leaderboard:  ()     => API.request("/api/users/leaderboard"),
    gameHistory:  ()     => API.request("/api/game/history"),
    publicRooms:  ()     => API.request("/api/game/rooms"),

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
