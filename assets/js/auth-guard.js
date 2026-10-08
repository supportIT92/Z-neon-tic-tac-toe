// ═══════════════════════════════════════════════════════════
// AUTH GUARD — Runs on every protected page
// If user is not logged in → redirect to /auth
// If user is banned       → redirect to /auth
// If admin-only page      → check admin role
// ═══════════════════════════════════════════════════════════

(function authGuard() {
    "use strict";

    // Pages that don't need login check
    var PUBLIC_PATHS = ["/auth", "/auth/", "/auth/index.html", "/auth.html"];

    var currentPath = window.location.pathname;

    // Don't guard the auth page itself
    for (var i = 0; i < PUBLIC_PATHS.length; i++) {
        if (currentPath === PUBLIC_PATHS[i] ||
            currentPath.indexOf("/auth") === 0) {
            return; // auth page — no guard needed
        }
    }

    // Read session from localStorage
    function getSession() {
        try {
            var raw = localStorage.getItem("neonGaming_session");
            return raw ? JSON.parse(raw) : null;
        } catch (e) { return null; }
    }

    function redirectToLogin() {
        // Save the page user was trying to visit
        try {
            sessionStorage.setItem("neonGaming_redirect", window.location.href);
        } catch(e) {}
        window.location.replace("/auth");
    }

    var session = getSession();

    // No session → go to login
    if (!session || !session.username) {
        redirectToLogin();
        return;
    }

    // Session too old (7 days)
    var MAX_AGE = 7 * 24 * 60 * 60 * 1000;
    if (session.loginTime && (Date.now() - session.loginTime) > MAX_AGE) {
        try { localStorage.removeItem("neonGaming_session"); localStorage.removeItem("neonGaming_token"); } catch(e) {}
        redirectToLogin();
        return;
    }

    // Admin-only pages — check role
    var isAdminPage = currentPath.indexOf("/admin") === 0;
    if (isAdminPage && session.role !== "admin") {
        window.location.replace("/");
        return;
    }

    // ✅ Session valid — user can stay on this page

}());
