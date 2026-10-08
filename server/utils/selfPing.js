// ═══════════════════════════════════════════════════════════
// UTIL: Self-Ping Service for Render Free Tier Keep-Alive
// Pings public URL every 12 minutes to prevent spin-down (15m limit)
// ═══════════════════════════════════════════════════════════

const https = require("https");
const http  = require("http");

function initSelfPing() {
    // Render sets RENDER_EXTERNAL_URL automatically (e.g. https://z-neon-tic-tac-toe.onrender.com)
    const targetUrl = process.env.RENDER_EXTERNAL_URL
        || process.env.SERVER_URL
        || "https://z-neon-tic-tac-toe.onrender.com";

    // Interval in minutes (default: 12 minutes)
    const intervalMinutes = parseInt(process.env.SELF_PING_INTERVAL_MINUTES) || 12;
    const intervalMs = intervalMinutes * 60 * 1000;

    console.log(`⏱️  Render Keep-Alive: Self-ping scheduled every ${intervalMinutes}m to ${targetUrl}/ping`);

    const doPing = () => {
        try {
            const pingEndpoint = targetUrl.replace(/\/+$/, "") + "/ping";
            const urlObj = new URL(pingEndpoint);
            const client = urlObj.protocol === "https:" ? https : http;

            const req = client.get(urlObj, { timeout: 20000 }, (res) => {
                let data = "";
                res.on("data", chunk => data += chunk);
                res.on("end", () => {
                    const time = new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: false });
                    if (res.statusCode >= 200 && res.statusCode < 400) {
                        console.log(`[Keep-Alive ${time}] 🏓 Self-ping success (${res.statusCode}) — Render kept awake`);
                    } else {
                        console.warn(`[Keep-Alive ${time}] ⚠️ Self-ping returned HTTP ${res.statusCode}`);
                    }
                });
            });

            req.on("error", (err) => {
                console.error(`[Keep-Alive Error] Self-ping failed: ${err.message}`);
            });

            req.on("timeout", () => {
                req.destroy();
                console.warn(`[Keep-Alive Warning] Self-ping request timed out`);
            });
        } catch (err) {
            console.error(`[Keep-Alive Error] ${err.message}`);
        }
    };

    // First ping 1 minute after startup, then recurring every 12 minutes
    setTimeout(doPing, 60 * 1000);
    const timer = setInterval(doPing, intervalMs);

    // Don't hold node process open during shutdown
    if (timer.unref) timer.unref();
}

module.exports = initSelfPing;
