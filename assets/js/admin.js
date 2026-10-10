"use strict";
// ════════════════════════════════════════════════════════════
// NEON GAMING — Admin Console Script (Live API + Cloud Synced)
// Features: Real-time DB Sync, User CRUD, Ban/Unban, Promote/Demote,
//           Live Activity Log, Search + Filter, CSV/JSON Export, Settings
// ════════════════════════════════════════════════════════════

// ── Storage Keys (local fallback) ────────────────────────────
var SK = {
    USERS:   "neonGaming_users",
    SESSION: "neonGaming_session",
    LOG:     "neonGaming_adminLog"
};

// ── In-Memory State ──────────────────────────────────────────
var _serverUsers    = [];
var _serverLogs     = [];
var _serverGames    = [];
var _serverStats    = null;
var currentFilter   = "all";
var currentSearch   = "";
var pendingAction   = null;   // { fn } - runs when confirm modal says Yes
var editingUserId   = null;   // ID of user currently being edited
var _searchDebounce = null;

// ── DOM Elements ─────────────────────────────────────────────
var accessDenied    = document.getElementById("accessDenied");
var adminWrapper    = document.getElementById("adminWrapper");
var sidebarEl       = document.getElementById("sidebar");
var hamburger       = document.getElementById("hamburger");
var topbarTitle     = document.getElementById("topbarTitle");
var topbarTime      = document.getElementById("topbarTime");

var sidebarUsername = document.getElementById("sidebarUsername");
var sidebarEmail    = document.getElementById("sidebarEmail");
var logoutBtn       = document.getElementById("logoutBtn");
var adBackBtn       = document.getElementById("adBackBtn");

// Stats
var statValTotal    = document.getElementById("statValTotal");
var statValAdmins   = document.getElementById("statValAdmins");
var statValBanned   = document.getElementById("statValBanned");
var statValToday    = document.getElementById("statValToday");

// Tables
var recentBody      = document.getElementById("recentBody");
var usersBody       = document.getElementById("usersBody");
var userCountBadge  = document.getElementById("userCountBadge");
var matchesBody     = document.getElementById("matchesBody");
var matchesCountBadge = document.getElementById("matchesCountBadge");

// User History Modal
var userHistoryModal= document.getElementById("userHistoryModal");
var uhTitle         = document.getElementById("uhTitle");
var uhCloseBtn      = document.getElementById("uhCloseBtn");
var uhUserInfo      = document.getElementById("uhUserInfo");
var uhMatchesBody   = document.getElementById("uhMatchesBody");
var uhLogsBody      = document.getElementById("uhLogsBody");

// Toolbar
var userSearch      = document.getElementById("userSearch");
var filterBtns      = document.querySelectorAll(".filter-btn");
var exportBtn       = document.getElementById("exportBtn");
var exportBtn2      = document.getElementById("exportBtn2");
var exportLogBtn    = document.getElementById("exportLogBtn");

// Log Elements & Directory
var activityLog       = document.getElementById("activityLog");
var clearLogBtn       = document.getElementById("clearLogBtn");
var clearLogBtn2      = document.getElementById("clearLogBtn2");
var cardAdminLog      = document.getElementById("cardAdminLog");
var cardUserLog       = document.getElementById("cardUserLog");
var statValAdminLogs  = document.getElementById("statValAdminLogs");
var statValUserLogs   = document.getElementById("statValUserLogs");
var statLogUserCount  = document.getElementById("statLogUserCount");
var logUserSearch     = document.getElementById("logUserSearch");
var logUsersBody      = document.getElementById("logUsersBody");
var logFeedTitle      = document.getElementById("logFeedTitle");
var exportLogFeedBtn  = document.getElementById("exportLogFeedBtn");
var logTabAll         = document.getElementById("logTabAll");
var logTabAdmin       = document.getElementById("logTabAdmin");
var logTabUser        = document.getElementById("logTabUser");

// Settings
var resetStatsBtn   = document.getElementById("resetStatsBtn");
var nukeUsersBtn    = document.getElementById("nukeUsersBtn");
var storageInfo     = document.getElementById("storageInfo");
var dashGoUsers     = document.getElementById("dashGoUsers");

// Confirm modal
var confirmModal    = document.getElementById("confirmModal");
var confirmTitle    = document.getElementById("confirmTitle");
var confirmMessage  = document.getElementById("confirmMessage");
var confirmYes      = document.getElementById("confirmYes");
var confirmNo       = document.getElementById("confirmNo");

// Edit modal
var editModal       = document.getElementById("editModal");
var editUsername    = document.getElementById("editUsername");
var editEmail       = document.getElementById("editEmail");
var editRole        = document.getElementById("editRole");
var editNewPassword = document.getElementById("editNewPassword");
var editSaveBtn     = document.getElementById("editSaveBtn");
var editCancelBtn   = document.getElementById("editCancelBtn");
var editError       = document.getElementById("editError");

// Toast
var toastEl         = document.getElementById("toast");
var _toastTimer     = null;

// ════════════════════════════════════════════════════════════
//  STORAGE & SESSION HELPERS
// ════════════════════════════════════════════════════════════

function lsGet(key) {
    try {
        var raw = localStorage.getItem(key);
        return raw !== null ? JSON.parse(raw) : null;
    } catch (e) { return null; }
}

function lsSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* ignore */ }
}

function getSession() { return lsGet(SK.SESSION); }

// ════════════════════════════════════════════════════════════
//  ACCESS CONTROL
// ════════════════════════════════════════════════════════════

function checkAccess() {
    var session = getSession();

    if (!session) {
        window.location.replace("../auth.html");
        return false;
    }

    if (session.role !== "admin") {
        if (accessDenied) accessDenied.classList.add("show");
        if (adminWrapper) adminWrapper.style.display = "none";
        return false;
    }

    if (sidebarUsername) sidebarUsername.textContent = session.username || "Admin";
    if (sidebarEmail)    sidebarEmail.textContent    = session.email    || "";
    return true;
}

if (adBackBtn) {
    adBackBtn.addEventListener("click", function () {
        window.location.href = "../index.html";
    });
}

// ════════════════════════════════════════════════════════════
//  TOAST NOTIFICATIONS
// ════════════════════════════════════════════════════════════

function showToast(msg, type) {
    if (!toastEl) return;
    clearTimeout(_toastTimer);
    toastEl.textContent = msg;
    toastEl.className   = "toast show " + (type || "info");
    _toastTimer = setTimeout(function () {
        toastEl.className = "toast";
    }, 3500);
}

// ════════════════════════════════════════════════════════════
//  ACTIVITY LOG ICONS (Clean SVGs)
// ════════════════════════════════════════════════════════════

var LOG_ICONS = {
    register: '<svg viewBox="0 0 24 24" fill="none" stroke="#00f7ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;vertical-align:middle"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>',
    login:    '<svg viewBox="0 0 24 24" fill="none" stroke="#00ff88" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;vertical-align:middle"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>',
    ban:      '<svg viewBox="0 0 24 24" fill="none" stroke="#ff4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;vertical-align:middle"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>',
    unban:    '<svg viewBox="0 0 24 24" fill="none" stroke="#00ff88" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;vertical-align:middle"><polyline points="20 6 9 17 4 12"/></svg>',
    delete:   '<svg viewBox="0 0 24 24" fill="none" stroke="#ff4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;vertical-align:middle"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>',
    promote:  '<svg viewBox="0 0 24 24" fill="none" stroke="#ffd700" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;vertical-align:middle"><path d="M2 20h20"/><path d="m4 20 2-10 6 4 4-8 4 8 2-4 2 10"/></svg>',
    demote:   '<svg viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;vertical-align:middle"><polyline points="7 13 12 18 17 13"/><line x1="12" y1="6" x2="12" y2="18"/></svg>',
    edit:     '<svg viewBox="0 0 24 24" fill="none" stroke="#00f7ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;vertical-align:middle"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
    nuke:           '<svg viewBox="0 0 24 24" fill="none" stroke="#ff007f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;vertical-align:middle"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
    reset:          '<svg viewBox="0 0 24 24" fill="none" stroke="#00f7ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;vertical-align:middle"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>',
    export:         '<svg viewBox="0 0 24 24" fill="none" stroke="#00f7ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;vertical-align:middle"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
    password_reset: '<svg viewBox="0 0 24 24" fill="none" stroke="#ff007f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;vertical-align:middle"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
    game:           '<svg viewBox="0 0 24 24" fill="none" stroke="#ffd700" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;vertical-align:middle"><rect x="2" y="6" width="20" height="12" rx="3"/><path d="M7 12h4"/><path d="M9 10v4"/><circle cx="16" cy="11" r="1" fill="currentColor"/><circle cx="18" cy="13" r="1" fill="currentColor"/></svg>'
};

var LOG_FALLBACK_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';

var _currentLogFilter = "all"; // "all" | "admin" | "user"
var _logUserSearchTerm = "";

function isLogAdminEvent(entry) {
    if (!entry) return false;
    var msg = (entry.msg || "").toLowerCase();
    var act = (entry.action || "").toLowerCase();
    if (act === "nuke" || act === "reset" || act === "demote" || act === "promote" || act === "ban" || act === "unban") return true;
    if (msg.includes("ztictactoe@outlook.com") || msg.includes("zadmin") || msg.includes("admin")) return true;
    return false;
}

function renderLogUsersDirectory() {
    if (!logUsersBody) return;
    var users = _serverUsers || [];
    var logs  = _serverLogs  || [];

    if (statLogUserCount) {
        statLogUserCount.textContent = users.length;
    }

    // Filter users by search term
    var term = _logUserSearchTerm.toLowerCase().trim();
    var filteredUsers = users.filter(function (u) {
        if (!term) return true;
        return (u.username && u.username.toLowerCase().includes(term)) ||
               (u.email && u.email.toLowerCase().includes(term));
    });

    if (filteredUsers.length === 0) {
        logUsersBody.innerHTML = '<tr><td colspan="7" class="empty-row">' + 
            (term ? 'No users match "' + escHtml(term) + '"' : 'No registered users found.') + '</td></tr>';
        return;
    }

    var html = "";
    filteredUsers.forEach(function (u, i) {
        var isPrimaryAdmin = (u.email && u.email.toLowerCase() === "ztictactoe@outlook.com");
        var roleBadge = isPrimaryAdmin
            ? '<span class="badge badge-admin" style="border:1px solid #ffd700;color:#ffd700;">Super Admin</span>'
            : (u.role === "admin"
                ? '<span class="badge badge-admin">Admin</span>'
                : '<span class="badge badge-user">User</span>');

        // Count logs associated with this user
        var uName = (u.username || "").toLowerCase();
        var uMail = (u.email || "").toLowerCase();
        var uId   = String(u.id || u._id || "");
        var userLogCount = logs.filter(function (l) {
            var msg = (l.msg || "").toLowerCase();
            return msg.includes(uName) || msg.includes(uMail) || (l.userId && String(l.userId) === uId);
        }).length;

        var viewLogBtn = '<button class="act-btn" onclick="openUserHistoryModal(\'' + escHtml(u.id || u._id) + '\')" style="background:rgba(0,247,255,0.12);border:1px solid rgba(0,247,255,0.35);color:var(--cyan);font-weight:700;padding:5px 12px;border-radius:6px;cursor:pointer;">' +
            '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-1px;margin-right:5px;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>View Log' +
            '</button>';

        html +=
            "<tr>" +
                "<td class='row-num'>" + (i + 1) + "</td>" +
                "<td>" +
                    "<div class='user-cell' style='cursor:pointer;' onclick=\"openUserHistoryModal('" + escHtml(u.id || u._id) + "')\">" +
                        "<div class='user-avatar'>" + escHtml((u.username || "?").charAt(0).toUpperCase()) + "</div>" +
                        "<span class='user-name-text' style='color:#fff;font-weight:600;'>" + escHtml(u.username) + "</span>" +
                    "</div>" +
                "</td>" +
                "<td>" + escHtml(u.email) + "</td>" +
                "<td>" + roleBadge + "</td>" +
                "<td>" + formatDateTime(u.lastLogin || u.createdAt) + "</td>" +
                "<td><span class='badge' style='background:rgba(255,255,255,0.08);color:#cbd5e1;font-weight:700;'>" + userLogCount + " entries</span></td>" +
                "<td>" + viewLogBtn + "</td>" +
            "</tr>";
    });

    logUsersBody.innerHTML = html;
}

function renderLog() {
    var logs = _serverLogs || [];

    // Calculate Admin vs User log counts
    var adminCount = 0;
    var userCount  = 0;
    logs.forEach(function (entry) {
        if (isLogAdminEvent(entry)) {
            adminCount++;
        } else {
            userCount++;
        }
    });

    if (statValAdminLogs) statValAdminLogs.textContent = adminCount;
    if (statValUserLogs)  statValUserLogs.textContent  = userCount;

    // Render Per-User Directory
    renderLogUsersDirectory();

    if (!activityLog) return;

    // Filter log entries by currently selected tab
    var filteredLogs = logs.filter(function (entry) {
        var isAdmin = isLogAdminEvent(entry);
        if (_currentLogFilter === "admin") return isAdmin;
        if (_currentLogFilter === "user")  return !isAdmin;
        return true;
    });

    if (logFeedTitle) {
        if (_currentLogFilter === "admin") {
            logFeedTitle.textContent = "Admin Account & Security Log (" + filteredLogs.length + ")";
        } else if (_currentLogFilter === "user") {
            logFeedTitle.textContent = "User & Player Activity Feed (" + filteredLogs.length + ")";
        } else {
            logFeedTitle.textContent = "System Activity Feed (" + filteredLogs.length + ")";
        }
    }

    if (filteredLogs.length === 0) {
        activityLog.innerHTML = '<p class="empty-row">No ' + (_currentLogFilter !== "all" ? _currentLogFilter + " " : "") + 'activity recorded yet.</p>';
        return;
    }

    var html = "";
    filteredLogs.forEach(function (entry) {
        var icon = LOG_ICONS[entry.action] || LOG_FALLBACK_ICON;
        var time = formatDateTime(entry.timestamp);
        html +=
            '<div class="log-entry log-' + escHtml(entry.action || "info") + '">' +
                '<span class="log-icon" aria-hidden="true">' + icon + '</span>' +
                '<div class="log-body">' +
                    '<div class="log-msg">' + escHtml(entry.msg) + '</div>' +
                    '<div class="log-time">' + time + '</div>' +
                '</div>' +
            '</div>';
    });
    activityLog.innerHTML = html;
}

// ════════════════════════════════════════════════════════════
//  DATE / TIME HELPERS
// ════════════════════════════════════════════════════════════

function formatDate(ts) {
    if (!ts) return "—";
    var d = new Date(ts);
    if (isNaN(d.getTime())) return "—";
    return d.getDate().toString().padStart(2, "0") + "/" +
           (d.getMonth() + 1).toString().padStart(2, "0") + "/" +
           d.getFullYear();
}

function formatDateTime(ts) {
    if (!ts) return "—";
    var d = new Date(ts);
    if (isNaN(d.getTime())) return "—";
    var date = formatDate(ts);
    var time = d.getHours().toString().padStart(2, "0") + ":" +
               d.getMinutes().toString().padStart(2, "0");
    return date + " " + time;
}

function escHtml(str) {
    return String(str || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

// ════════════════════════════════════════════════════════════
//  DASHBOARD & RECENT REGISTRATIONS
// ════════════════════════════════════════════════════════════

function renderDashboardStats(stats, recentUsers) {
    if (stats) {
        if (statValTotal)  statValTotal.textContent  = stats.totalUsers  || 0;
        if (statValAdmins) statValAdmins.textContent = stats.admins      || 0;
        if (statValBanned) statValBanned.textContent = stats.bannedUsers  || 0;
        if (statValToday)  statValToday.textContent  = stats.activeToday || 0;
    }

    if (!recentBody) return;

    var recent = recentUsers || [];
    if (recent.length === 0) {
        recentBody.innerHTML = '<tr><td colspan="5" class="empty-row">No users yet.</td></tr>';
        return;
    }

    var html = "";
    recent.forEach(function (u, i) {
        var roleBadge   = u.role === "admin" ? '<span class="badge badge-admin">Admin</span>' : '<span class="badge badge-user">User</span>';
        var bannedExtra = u.banned ? ' <span class="badge badge-banned">Banned</span>' : "";
        html +=
            "<tr>" +
                "<td class='row-num'>" + (i + 1) + "</td>" +
                "<td>" +
                    "<div class='user-cell'>" +
                        "<div class='user-avatar'>" + escHtml((u.username || "?").charAt(0).toUpperCase()) + "</div>" +
                        "<span class='user-name-text'>" + escHtml(u.username) + "</span>" +
                    "</div>" +
                "</td>" +
                "<td>" + escHtml(u.email) + "</td>" +
                "<td>" + roleBadge + bannedExtra + "</td>" +
                "<td>" + formatDate(u.createdAt) + "</td>" +
            "</tr>";
    });
    recentBody.innerHTML = html;
}

// ════════════════════════════════════════════════════════════
//  USERS TABLE
// ════════════════════════════════════════════════════════════

function getFilteredUsers() {
    var users  = _serverUsers || [];
    var search = currentSearch.trim().toLowerCase();

    if (currentFilter !== "all") {
        users = users.filter(function (u) {
            if (currentFilter === "admin")  return u.role === "admin";
            if (currentFilter === "user")   return u.role === "user" && !u.banned;
            if (currentFilter === "banned") return u.banned;
            return true;
        });
    }

    if (search) {
        users = users.filter(function (u) {
            return (u.username && u.username.toLowerCase().indexOf(search) !== -1) ||
                   (u.email && u.email.toLowerCase().indexOf(search) !== -1);
        });
    }

    return users;
}

function renderUsersTable() {
    if (!usersBody) return;

    var session  = getSession();
    var filtered = getFilteredUsers();

    if (userCountBadge) {
        userCountBadge.textContent = filtered.length + " user" + (filtered.length !== 1 ? "s" : "");
    }

    if (filtered.length === 0) {
        usersBody.innerHTML = '<tr><td colspan="8" class="empty-row">No users match your search.</td></tr>';
        return;
    }

    var html = "";
    filtered.forEach(function (u, i) {
        var isSelf         = session && (u.email === session.email || u.id === session.id);
        var isPrimaryAdmin = (u.email && u.email.toLowerCase() === "ztictactoe@outlook.com");
        var roleBadge      = isPrimaryAdmin
            ? '<span class="badge badge-admin" style="border:1px solid #ffd700;box-shadow:0 0 8px rgba(255,215,0,0.35);color:#ffd700">Super Admin</span>'
            : (u.role === "admin"
                ? '<span class="badge badge-admin">Admin</span>'
                : '<span class="badge badge-user">User</span>');
        var statusBadge  = u.banned
            ? '<span class="badge badge-banned">Banned</span>'
            : '<span class="badge badge-active">Active</span>';

        // Action buttons with clean SVG icons
        var historyBtn = '<button class="act-btn" data-action="history" data-id="' + escHtml(u.id || u._id) + '" style="background:rgba(0,247,255,0.1);border-color:rgba(0,247,255,0.3);color:var(--cyan);"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-1px;margin-right:4px;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>History</button>';
        var editBtn = '<button class="act-btn act-edit" data-action="edit" data-id="' + escHtml(u.id || u._id) + '"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-1px;margin-right:4px;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>Edit</button>';

        var banBtn = u.banned
            ? '<button class="act-btn act-unban" data-action="unban" data-id="' + escHtml(u.id || u._id) + '"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-1px;margin-right:4px;"><polyline points="20 6 9 17 4 12"/></svg>Unban</button>'
            : '<button class="act-btn act-ban" data-action="ban" data-id="' + escHtml(u.id || u._id) + '"' + ((isSelf || isPrimaryAdmin) ? " disabled title='" + (isPrimaryAdmin ? "Primary Admin cannot be banned" : "Cannot ban yourself") + "'" : "") + '><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-1px;margin-right:4px;"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>Ban</button>';

        var roleBtn = u.role === "admin"
            ? '<button class="act-btn act-demote" data-action="demote" data-id="' + escHtml(u.id || u._id) + '"' + ((isSelf || isPrimaryAdmin) ? " disabled title='" + (isPrimaryAdmin ? "Primary Admin role cannot be changed" : "Cannot demote yourself") + "'" : "") + '><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-1px;margin-right:4px;"><polyline points="6 9 12 15 18 9"/></svg>Demote</button>'
            : '<button class="act-btn act-promote" data-action="promote" data-id="' + escHtml(u.id || u._id) + '"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-1px;margin-right:4px;"><path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14v2H5z"/></svg>Promote</button>';

        var delBtn = '<button class="act-btn act-delete" data-action="delete" data-id="' + escHtml(u.id || u._id) + '"' + ((isSelf || isPrimaryAdmin) ? " disabled title='" + (isPrimaryAdmin ? "Primary Admin cannot be deleted" : "Cannot delete yourself") + "'" : "") + '><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-1px;margin-right:4px;"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>Delete</button>';

        html +=
            "<tr>" +
                "<td class='row-num'>" + (i + 1) + "</td>" +
                "<td>" +
                    "<div class='user-cell' style='cursor:pointer;' title='Click to view activity & matches' onclick='openUserHistoryModal(\"" + escHtml(u.id || u._id) + "\")'>" +
                        "<div class='user-avatar'>" + escHtml((u.username || "?").charAt(0).toUpperCase()) + "</div>" +
                        "<span class='user-name-text' style='text-decoration:underline;text-underline-offset:2px;'>" + escHtml(u.username) + "</span>" + (isSelf ? " <small style='color:var(--muted)'>(you)</small>" : "") +
                    "</div>" +
                "</td>" +
                "<td>" + escHtml(u.email) + "</td>" +
                "<td>" + roleBadge + "</td>" +
                "<td>" + statusBadge + "</td>" +
                "<td>" + formatDate(u.createdAt)  + "</td>" +
                "<td>" + formatDateTime(u.lastLogin)  + "</td>" +
                "<td><div class='action-btns'>" + historyBtn + editBtn + banBtn + roleBtn + delBtn + "</div></td>" +
            "</tr>";
    });

    usersBody.innerHTML = html;

    // Wire action buttons
    var btns = usersBody.querySelectorAll(".act-btn[data-action]");
    btns.forEach(function (btn) {
        btn.addEventListener("click", function () {
            var action = btn.getAttribute("data-action");
            var id     = btn.getAttribute("data-id");
            handleUserAction(action, id);
        });
    });
}

// ════════════════════════════════════════════════════════════
//  LIVE DATA FETCHING (MongoDB via API)
// ════════════════════════════════════════════════════════════

function fetchDashboard() {
    if (!window.API || typeof window.API.adminStats !== "function") return Promise.resolve();
    return window.API.adminStats()
        .then(function (res) {
            if (res && res.success) {
                _serverStats = res.stats;
                renderDashboardStats(res.stats, res.recentUsers);
            }
        })
        .catch(function (err) {
            console.warn("[Admin Dashboard API Warning]", err.message || err);
        });
}

function fetchUsers(query) {
    if (!window.API || typeof window.API.adminUsers !== "function") return Promise.resolve();
    return window.API.adminUsers(query || "")
        .then(function (res) {
            if (res && res.success) {
                _serverUsers = res.users || [];
                renderUsersTable();
                renderStorageInfo();
            }
        })
        .catch(function (err) {
            console.warn("[Admin Users API Warning]", err.message || err);
        });
}

function fetchLogs() {
    if (!window.API || typeof window.API.adminLogs !== "function") return Promise.resolve();
    return window.API.adminLogs()
        .then(function (res) {
            if (res && res.success) {
                _serverLogs = res.logs || [];
                renderLog();
                renderStorageInfo();
            }
        })
        .catch(function (err) {
            console.warn("[Admin Logs API Warning]", err.message || err);
        });
}

function fetchGames() {
    if (!window.API || typeof window.API.adminGames !== "function") return Promise.resolve();
    return window.API.adminGames()
        .then(function (res) {
            if (res && res.success) {
                _serverGames = res.games || [];
                renderMatchesTable();
            }
        })
        .catch(function (err) {
            console.warn("[Admin Games API Warning]", err.message || err);
        });
}

function renderMatchesTable() {
    if (!matchesBody) return;
    var games = _serverGames || [];
    if (matchesCountBadge) {
        matchesCountBadge.textContent = games.length + " match" + (games.length !== 1 ? "es" : "");
    }
    if (games.length === 0) {
        matchesBody.innerHTML = '<tr><td colspan="8" class="empty-row">No matches played yet.</td></tr>';
        return;
    }
    var html = "";
    games.forEach(function (g, i) {
        var pX = (g.playerX && g.playerX.username) ? g.playerX.username : "Player X";
        var pO = (g.playerO && g.playerO.username) ? g.playerO.username : "Player O";
        var winnerText = g.winner === "draw" 
            ? '<span class="badge" style="background:rgba(255,255,255,0.1);color:#94a3b8;">Draw</span>'
            : '<span class="badge" style="background:rgba(0,255,136,0.15);color:#00ff88;">' + escHtml(g.winnerUsername || (g.winner === "X" ? pX : pO)) + ' Won</span>';
        var scoreText = (g.scoreX != null && g.scoreO != null) ? (g.scoreX + " - " + g.scoreO) : "—";
        html +=
            "<tr>" +
                "<td class='row-num'>" + (i + 1) + "</td>" +
                "<td><span style='color:var(--cyan);font-family:monospace;'>" + escHtml(g.roomCode || "—") + "</span></td>" +
                "<td><strong>" + escHtml(pX) + "</strong> <small style='color:var(--cyan);'>(X)</small></td>" +
                "<td><strong>" + escHtml(pO) + "</strong> <small style='color:#ff007f;'>(O)</small></td>" +
                "<td><strong>" + scoreText + "</strong></td>" +
                "<td>" + winnerText + "</td>" +
                "<td><span style='text-transform:capitalize;font-size:12px;color:var(--muted);'>" + escHtml(g.roomType || "public") + "</span></td>" +
                "<td>" + formatDateTime(g.createdAt) + "</td>" +
            "</tr>";
    });
    matchesBody.innerHTML = html;
}

function openUserHistoryModal(userId) {
    if (!userHistoryModal) return;
    if (!window.API || typeof window.API.adminUserHistory !== "function") return;

    uhUserInfo.innerHTML = '<p style="color:var(--muted);">Loading user details and versus history...</p>';
    uhMatchesBody.innerHTML = '<tr><td colspan="5" class="empty-row">Loading matches...</td></tr>';
    uhLogsBody.innerHTML = '<p class="empty-row">Loading activity...</p>';
    userHistoryModal.classList.add("open");

    window.API.adminUserHistory(userId)
        .then(function (res) {
            if (!res || !res.success) throw new Error("Could not load user data");
            var u = res.user;
            var stats = u.stats || {};
            var wins = stats.wins || 0;
            var losses = stats.losses || 0;
            var draws = stats.draws || 0;
            var total = stats.totalGames || (wins + losses + draws);
            var winRate = total > 0 ? Math.round((wins / total) * 100) : 0;

            uhTitle.textContent = u.username + " — Activity & Game Records";

            uhUserInfo.innerHTML =
                '<div style="display:flex; justify-content:space-between; flex-wrap:wrap; gap:12px;">' +
                    '<div>' +
                        '<div style="font-size:16px; font-weight:800; color:var(--cyan);">' + escHtml(u.username) + ' <span style="font-size:12px; color:var(--muted); font-weight:normal;">(' + escHtml(u.email) + ')</span></div>' +
                        '<div style="font-size:12px; color:var(--muted); margin-top:4px;">Role: <strong style="color:#fff; text-transform:uppercase;">' + escHtml(u.role) + '</strong> | Registered: <strong>' + formatDate(u.createdAt) + '</strong> | Last Active: <strong>' + formatDateTime(u.lastLogin) + '</strong></div>' +
                    '</div>' +
                    '<div style="display:flex; gap:10px; text-align:center;">' +
                        '<div style="background:rgba(0,255,136,0.1); border:1px solid rgba(0,255,136,0.3); border-radius:6px; padding:6px 10px;"><strong style="color:#00ff88; font-size:15px; display:block;">' + wins + '</strong><span style="font-size:10px; color:var(--muted);">WINS</span></div>' +
                        '<div style="background:rgba(255,68,68,0.1); border:1px solid rgba(255,68,68,0.3); border-radius:6px; padding:6px 10px;"><strong style="color:#ff4444; font-size:15px; display:block;">' + losses + '</strong><span style="font-size:10px; color:var(--muted);">LOSSES</span></div>' +
                        '<div style="background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.2); border-radius:6px; padding:6px 10px;"><strong style="color:#cbd5e1; font-size:15px; display:block;">' + draws + '</strong><span style="font-size:10px; color:var(--muted);">DRAWS</span></div>' +
                        '<div style="background:rgba(0,247,255,0.1); border:1px solid rgba(0,247,255,0.3); border-radius:6px; padding:6px 10px;"><strong style="color:var(--cyan); font-size:15px; display:block;">' + winRate + '%</strong><span style="font-size:10px; color:var(--muted);">WIN RATE</span></div>' +
                    '</div>' +
                '</div>';

            // Matches
            var games = res.games || [];
            if (games.length === 0) {
                uhMatchesBody.innerHTML = '<tr><td colspan="5" class="empty-row">No versus matches recorded yet for this user.</td></tr>';
            } else {
                var mHtml = "";
                games.forEach(function (g) {
                    var isX = (g.playerX && (g.playerX.username === u.username || String(g.playerX.userId) === String(u.id)));
                    var opponentName = isX ? (g.playerO ? g.playerO.username : "Opponent") : (g.playerX ? g.playerX.username : "Opponent");
                    var role = isX ? "X" : "O";
                    var isWon = (g.winner === role) || (g.winnerUsername && g.winnerUsername.toLowerCase() === u.username.toLowerCase());
                    var isDraw = g.winner === "draw";
                    var outcome = isDraw 
                        ? '<span style="color:#94a3b8; font-weight:700;">DRAW</span>'
                        : (isWon ? '<span style="color:#00ff88; font-weight:700;">WON</span>' : '<span style="color:#ff4444; font-weight:700;">LOST</span>');
                    var score = (g.scoreX != null && g.scoreO != null) ? (isX ? g.scoreX + " - " + g.scoreO : g.scoreO + " - " + g.scoreX) : "—";
                    mHtml +=
                        '<tr>' +
                            '<td><strong>vs ' + escHtml(opponentName) + '</strong></td>' +
                            '<td><span style="color:' + (isX ? 'var(--cyan)' : '#ff007f') + '; font-weight:bold;">' + role + '</span></td>' +
                            '<td>' + outcome + '</td>' +
                            '<td>' + score + '</td>' +
                            '<td>' + formatDateTime(g.createdAt) + '</td>' +
                        '</tr>';
                });
                uhMatchesBody.innerHTML = mHtml;
            }

            // Logs
            var logs = res.logs || [];
            if (logs.length === 0) {
                uhLogsBody.innerHTML = '<p class="empty-row">No specific security or action logs for this user.</p>';
            } else {
                var lHtml = "";
                logs.forEach(function (entry) {
                    var icon = LOG_ICONS[entry.action] || LOG_FALLBACK_ICON;
                    lHtml +=
                        '<div class="log-entry log-' + escHtml(entry.action || "info") + '" style="padding:6px 8px; margin-bottom:6px;">' +
                            '<span class="log-icon" aria-hidden="true">' + icon + '</span>' +
                            '<div class="log-body">' +
                                '<div class="log-msg" style="font-size:12px;">' + escHtml(entry.msg) + '</div>' +
                                '<div class="log-time" style="font-size:10px;">' + formatDateTime(entry.timestamp) + '</div>' +
                            '</div>' +
                        '</div>';
                });
                uhLogsBody.innerHTML = lHtml;
            }
        })
        .catch(function (err) {
            uhUserInfo.innerHTML = '<p style="color:#ff4444;">Failed to load user records: ' + escHtml(err.message || err) + '</p>';
        });
}

window.openUserHistoryModal = openUserHistoryModal;

if (uhCloseBtn) {
    uhCloseBtn.addEventListener("click", function () {
        if (userHistoryModal) userHistoryModal.classList.remove("open");
    });
}

function refreshAll() {
    return Promise.all([
        fetchDashboard(),
        fetchUsers(currentSearch),
        fetchLogs(),
        fetchGames()
    ]);
}

// ════════════════════════════════════════════════════════════
//  USER ACTIONS (Live Backend Execution)
// ════════════════════════════════════════════════════════════

function findUserById(id) {
    return _serverUsers.find(function (u) {
        return String(u.id || u._id) === String(id);
    });
}

function handleUserAction(action, id) {
    var user = findUserById(id);
    if (!user) { showToast("User not found.", "error"); return; }

    var isPrimaryAdmin = (user.email && user.email.toLowerCase() === "ztictactoe@outlook.com");
    if (isPrimaryAdmin && (action === "demote" || action === "ban" || action === "delete")) {
        showToast("Primary Admin role cannot be changed, banned, or deleted.", "error");
        return;
    }

    if (action === "history") {
        openUserHistoryModal(id);
        return;
    }

    if (action === "edit") {
        openEditModal(user);
        return;
    }

    if (action === "ban") {
        askConfirm(
            "Ban User",
            "Ban <strong>" + escHtml(user.username) + "</strong>? They will not be able to log in.",
            function () { doSetBan(id, user.username); },
            true
        );
    } else if (action === "unban") {
        askConfirm(
            "Unban User",
            "Unban <strong>" + escHtml(user.username) + "</strong>? They will regain access.",
            function () { doSetUnban(id, user.username); },
            false
        );
    } else if (action === "promote") {
        askConfirm(
            "Promote to Admin",
            "Promote <strong>" + escHtml(user.username) + "</strong> to Admin? They will have full admin access.",
            function () { doSetRole(id, "admin", user.username); },
            true
        );
    } else if (action === "demote") {
        askConfirm(
            "Demote to User",
            "Demote <strong>" + escHtml(user.username) + "</strong> back to regular User?",
            function () { doSetRole(id, "user", user.username); },
            true
        );
    } else if (action === "delete") {
        askConfirm(
            "Delete User",
            "Permanently delete <strong>" + escHtml(user.username) + "</strong>? This cannot be undone.",
            function () { doDeleteUser(id, user.username); },
            true
        );
    }
}

function doSetBan(id, name) {
    window.API.adminBan(id)
        .then(function (res) {
            showToast("Banned user: " + name, "error");
            refreshAll();
        })
        .catch(function (err) {
            showToast(err.message || "Failed to ban user.", "error");
        });
}

function doSetUnban(id, name) {
    window.API.adminUnban(id)
        .then(function (res) {
            showToast("Unbanned user: " + name, "success");
            refreshAll();
        })
        .catch(function (err) {
            showToast(err.message || "Failed to unban user.", "error");
        });
}

function doSetRole(id, role, name) {
    window.API.adminRole(id, role)
        .then(function (res) {
            showToast((role === "admin" ? "Promoted " : "Demoted ") + name, "info");
            refreshAll();
        })
        .catch(function (err) {
            showToast(err.message || "Failed to update role.", "error");
        });
}

function doDeleteUser(id, name) {
    window.API.adminDelete(id)
        .then(function (res) {
            showToast("Deleted user: " + name, "error");
            refreshAll();
        })
        .catch(function (err) {
            showToast(err.message || "Failed to delete user.", "error");
        });
}

// ════════════════════════════════════════════════════════════
//  EDIT USER MODAL
// ════════════════════════════════════════════════════════════

function openEditModal(user) {
    editingUserId         = user.id || user._id;
    editUsername.value    = user.username;
    editEmail.value       = user.email;
    editNewPassword.value = "";
    editError.textContent = "";

    var isPrimaryAdmin = (user.email && user.email.toLowerCase() === "ztictactoe@outlook.com");

    if (isPrimaryAdmin) {
        // Primary admin role cannot be changed to user
        editRole.innerHTML = '<option value="admin" selected>Admin (Permanent / Locked)</option>';
        editRole.disabled  = true;
        editRole.title     = "Primary Admin role cannot be changed";
        editEmail.disabled = true;
        editEmail.title    = "Primary Admin email cannot be modified";
    } else {
        editRole.innerHTML = '<option value="user">User</option><option value="admin">Admin</option>';
        editRole.value     = user.role || "user";
        editRole.disabled  = false;
        editRole.title     = "";
        editEmail.disabled = false;
        editEmail.title    = "";
    }

    editModal.classList.add("open");
    editUsername.focus();
}

editSaveBtn.addEventListener("click", function () {
    var user = findUserById(editingUserId);
    var isPrimaryAdmin = (user && user.email && user.email.toLowerCase() === "ztictactoe@outlook.com");

    var newUser = editUsername.value.trim();
    var newEmail= isPrimaryAdmin ? "ztictactoe@outlook.com" : editEmail.value.trim().toLowerCase();
    var newRole = isPrimaryAdmin ? "admin" : editRole.value;
    var newPw   = editNewPassword.value;

    editError.textContent = "";

    if (!newUser || !newEmail) {
        editError.textContent = "Username and email cannot be empty.";
        return;
    }
    if (!/^[A-Za-z][A-Za-z0-9_]{2,19}$/.test(newUser)) {
        editError.textContent = "Username: 3-20 chars, starting with a letter.";
        return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
        editError.textContent = "Invalid email address.";
        return;
    }

    var payload = {
        username: newUser,
        email:    newEmail,
        role:     newRole
    };
    if (newPw && newPw.trim()) {
        if (newPw.length < 8) {
            editError.textContent = "Password must be at least 8 characters.";
            return;
        }
        payload.password = newPw.trim();
    }

    window.API.adminEditUser(editingUserId, payload)
        .then(function (res) {
            showToast("User profile updated successfully.", "success");
            editModal.classList.remove("open");
            editingUserId = null;
            if (editRole) editRole.disabled = false;
            if (editEmail) editEmail.disabled = false;
            refreshAll();
        })
        .catch(function (err) {
            editError.textContent = err.message || "Failed to update user.";
        });
});

editCancelBtn.addEventListener("click", function () {
    editModal.classList.remove("open");
    editingUserId = null;
    if (editRole) editRole.disabled = false;
    if (editEmail) editEmail.disabled = false;
});

// ════════════════════════════════════════════════════════════
//  CONFIRM MODAL
// ════════════════════════════════════════════════════════════

function askConfirm(title, msg, onYes, danger) {
    confirmTitle.textContent = title;
    confirmMessage.innerHTML = msg;
    confirmYes.className     = "modal-confirm-btn" + (danger ? " danger" : "");
    pendingAction            = onYes;
    confirmModal.classList.add("open");
}

confirmYes.addEventListener("click", function () {
    confirmModal.classList.remove("open");
    if (typeof pendingAction === "function") { pendingAction(); pendingAction = null; }
});

confirmNo.addEventListener("click", function () {
    confirmModal.classList.remove("open");
    pendingAction = null;
});

confirmModal.addEventListener("click", function (e) {
    if (e.target === confirmModal) { confirmModal.classList.remove("open"); pendingAction = null; }
});
editModal.addEventListener("click", function (e) {
    if (e.target === editModal) { editModal.classList.remove("open"); editingUserId = null; }
});

// ════════════════════════════════════════════════════════════
//  DATA EXPORT (JSON, CSV, EXCEL)
// ════════════════════════════════════════════════════════════

var _activeExportTarget = null; // "users" or "logs"
var exportModal      = document.getElementById("exportModal");
var exportTitle      = document.getElementById("exportTitle");
var exportDesc       = document.getElementById("exportDesc");
var exportCloseBtn   = document.getElementById("exportCloseBtn");
var exportCancelBtn  = document.getElementById("exportCancelBtn");
var exportOptBtns    = document.querySelectorAll(".export-opt-btn");

function openExportModal(target) {
    _activeExportTarget = target;
    if (exportTitle) {
        exportTitle.textContent = target === "users" ? "Export User Data" : "Export Activity Log";
    }
    if (exportDesc) {
        exportDesc.textContent = target === "users"
            ? "Choose file format to export all registered players and stats:"
            : "Choose file format to export all system audit logs:";
    }
    if (exportModal) exportModal.classList.add("open");
}

function closeExportModal() {
    if (exportModal) exportModal.classList.remove("open");
    _activeExportTarget = null;
}

if (exportCloseBtn)  exportCloseBtn.addEventListener("click", closeExportModal);
if (exportCancelBtn) exportCancelBtn.addEventListener("click", closeExportModal);
if (exportModal) {
    exportModal.addEventListener("click", function (e) {
        if (e.target === exportModal) closeExportModal();
    });
}

function downloadFile(content, fileName, mimeType) {
    var blob = new Blob([content], { type: mimeType });
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement("a");
    a.href     = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ── Export Users Implementation (JSON, CSV, Excel) ───────────
function exportUsersAs(format) {
    var users = _serverUsers || [];
    if (users.length === 0) { showToast("No users found to export.", "error"); return; }
    var dateStamp = new Date().toISOString().slice(0, 10);

    if (format === "json") {
        var jsonContent = JSON.stringify(users, null, 2);
        downloadFile(jsonContent, "neon-gaming-users-" + dateStamp + ".json", "application/json;charset=utf-8;");
        showToast("Exported " + users.length + " users as JSON.", "success");
    } else if (format === "csv") {
        var csvRows = ["#,Username,Email,Role,Status,Total Games,Wins,Losses,Draws,Win Rate,Joined,Last Login"];
        users.forEach(function (u, i) {
            var stats = u.stats || {};
            var wins = stats.wins || 0;
            var losses = stats.losses || 0;
            var draws = stats.draws || 0;
            var total = stats.totalGames || (wins + losses + draws);
            var winRate = total > 0 ? Math.round((wins / total) * 100) + "%" : "0%";
            csvRows.push([
                i + 1,
                '"' + (u.username || "").replace(/"/g, '""') + '"',
                '"' + (u.email || "").replace(/"/g, '""') + '"',
                u.role || "user",
                u.banned ? "Banned" : "Active",
                total,
                wins,
                losses,
                draws,
                winRate,
                formatDateTime(u.createdAt),
                formatDateTime(u.lastLogin)
            ].join(","));
        });
        downloadFile(csvRows.join("\n"), "neon-gaming-users-" + dateStamp + ".csv", "text/csv;charset=utf-8;");
        showToast("Exported " + users.length + " users as CSV.", "success");
    } else if (format === "excel") {
        // XML-based Excel Spreadsheet format (.xls) natively supported by Microsoft Excel, LibreOffice, and Google Sheets
        var excelRows = "";
        users.forEach(function (u, i) {
            var stats = u.stats || {};
            var wins = stats.wins || 0;
            var losses = stats.losses || 0;
            var draws = stats.draws || 0;
            var total = stats.totalGames || (wins + losses + draws);
            var winRate = total > 0 ? Math.round((wins / total) * 100) + "%" : "0%";
            excelRows +=
                "<Row>" +
                    "<Cell><Data ss:Type='Number'>" + (i + 1) + "</Data></Cell>" +
                    "<Cell><Data ss:Type='String'>" + escHtml(u.username) + "</Data></Cell>" +
                    "<Cell><Data ss:Type='String'>" + escHtml(u.email) + "</Data></Cell>" +
                    "<Cell><Data ss:Type='String'>" + escHtml(u.role || "user") + "</Data></Cell>" +
                    "<Cell><Data ss:Type='String'>" + (u.banned ? "Banned" : "Active") + "</Data></Cell>" +
                    "<Cell><Data ss:Type='Number'>" + total + "</Data></Cell>" +
                    "<Cell><Data ss:Type='Number'>" + wins + "</Data></Cell>" +
                    "<Cell><Data ss:Type='Number'>" + losses + "</Data></Cell>" +
                    "<Cell><Data ss:Type='Number'>" + draws + "</Data></Cell>" +
                    "<Cell><Data ss:Type='String'>" + winRate + "</Data></Cell>" +
                    "<Cell><Data ss:Type='String'>" + formatDateTime(u.createdAt) + "</Data></Cell>" +
                    "<Cell><Data ss:Type='String'>" + formatDateTime(u.lastLogin) + "</Data></Cell>" +
                "</Row>";
        });

        var excelTemplate =
            '<?xml version="1.0"?>\n' +
            '<?mso-application progid="Excel.Sheet"?>\n' +
            '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"\n' +
            ' xmlns:o="urn:schemas-microsoft-com:office:office"\n' +
            ' xmlns:x="urn:schemas-microsoft-com:office:excel"\n' +
            ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">\n' +
            '<Styles>\n' +
            ' <Style ss:ID="Header"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#0f172a" ss:Pattern="Solid"/></Style>\n' +
            '</Styles>\n' +
            '<Worksheet ss:Name="Users">\n' +
            '<Table>\n' +
            ' <Row ss:StyleID="Header">\n' +
            '  <Cell><Data ss:Type="String">#</Data></Cell>\n' +
            '  <Cell><Data ss:Type="String">Username</Data></Cell>\n' +
            '  <Cell><Data ss:Type="String">Email</Data></Cell>\n' +
            '  <Cell><Data ss:Type="String">Role</Data></Cell>\n' +
            '  <Cell><Data ss:Type="String">Status</Data></Cell>\n' +
            '  <Cell><Data ss:Type="String">Total Games</Data></Cell>\n' +
            '  <Cell><Data ss:Type="String">Wins</Data></Cell>\n' +
            '  <Cell><Data ss:Type="String">Losses</Data></Cell>\n' +
            '  <Cell><Data ss:Type="String">Draws</Data></Cell>\n' +
            '  <Cell><Data ss:Type="String">Win Rate</Data></Cell>\n' +
            '  <Cell><Data ss:Type="String">Joined</Data></Cell>\n' +
            '  <Cell><Data ss:Type="String">Last Login</Data></Cell>\n' +
            ' </Row>\n' +
            excelRows +
            '</Table>\n' +
            '</Worksheet>\n' +
            '</Workbook>';

        downloadFile(excelTemplate, "neon-gaming-users-" + dateStamp + ".xls", "application/vnd.ms-excel;charset=utf-8;");
        showToast("Exported " + users.length + " users as Excel (.xls).", "success");
    }
}

// ── Export Activity Log Implementation (JSON, CSV, Excel) ────
function exportLogsAs(format) {
    var logs = _serverLogs || [];
    if (logs.length === 0) { showToast("No activity log entries to export.", "error"); return; }
    var dateStamp = new Date().toISOString().slice(0, 10);

    if (format === "json") {
        var jsonContent = JSON.stringify(logs, null, 2);
        downloadFile(jsonContent, "neon-gaming-log-" + dateStamp + ".json", "application/json;charset=utf-8;");
        showToast("Exported " + logs.length + " log entries as JSON.", "success");
    } else if (format === "csv") {
        var csvRows = ["#,Action,Message,Username,Email,Timestamp"];
        logs.forEach(function (l, i) {
            csvRows.push([
                i + 1,
                '"' + (l.action || "").replace(/"/g, '""') + '"',
                '"' + (l.msg || "").replace(/"/g, '""') + '"',
                '"' + (l.username || "").replace(/"/g, '""') + '"',
                '"' + (l.email || "").replace(/"/g, '""') + '"',
                formatDateTime(l.timestamp)
            ].join(","));
        });
        downloadFile(csvRows.join("\n"), "neon-gaming-log-" + dateStamp + ".csv", "text/csv;charset=utf-8;");
        showToast("Exported " + logs.length + " log entries as CSV.", "success");
    } else if (format === "excel") {
        var excelRows = "";
        logs.forEach(function (l, i) {
            excelRows +=
                "<Row>" +
                    "<Cell><Data ss:Type='Number'>" + (i + 1) + "</Data></Cell>" +
                    "<Cell><Data ss:Type='String'>" + escHtml(l.action || "") + "</Data></Cell>" +
                    "<Cell><Data ss:Type='String'>" + escHtml(l.msg || "") + "</Data></Cell>" +
                    "<Cell><Data ss:Type='String'>" + escHtml(l.username || "—") + "</Data></Cell>" +
                    "<Cell><Data ss:Type='String'>" + escHtml(l.email || "—") + "</Data></Cell>" +
                    "<Cell><Data ss:Type='String'>" + formatDateTime(l.timestamp) + "</Data></Cell>" +
                "</Row>";
        });

        var excelTemplate =
            '<?xml version="1.0"?>\n' +
            '<?mso-application progid="Excel.Sheet"?>\n' +
            '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"\n' +
            ' xmlns:o="urn:schemas-microsoft-com:office:office"\n' +
            ' xmlns:x="urn:schemas-microsoft-com:office:excel"\n' +
            ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">\n' +
            '<Styles>\n' +
            ' <Style ss:ID="Header"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#0f172a" ss:Pattern="Solid"/></Style>\n' +
            '</Styles>\n' +
            '<Worksheet ss:Name="ActivityLog">\n' +
            '<Table>\n' +
            ' <Row ss:StyleID="Header">\n' +
            '  <Cell><Data ss:Type="String">#</Data></Cell>\n' +
            '  <Cell><Data ss:Type="String">Action</Data></Cell>\n' +
            '  <Cell><Data ss:Type="String">Message</Data></Cell>\n' +
            '  <Cell><Data ss:Type="String">Username</Data></Cell>\n' +
            '  <Cell><Data ss:Type="String">Email</Data></Cell>\n' +
            '  <Cell><Data ss:Type="String">Timestamp</Data></Cell>\n' +
            ' </Row>\n' +
            excelRows +
            '</Table>\n' +
            '</Worksheet>\n' +
            '</Workbook>';

        downloadFile(excelTemplate, "neon-gaming-log-" + dateStamp + ".xls", "application/vnd.ms-excel;charset=utf-8;");
        showToast("Exported " + logs.length + " log entries as Excel (.xls).", "success");
    }
}

// Wire Format Option Buttons inside Modal
exportOptBtns.forEach(function (btn) {
    btn.addEventListener("click", function () {
        var format = btn.getAttribute("data-format");
        if (_activeExportTarget === "users") {
            exportUsersAs(format);
        } else if (_activeExportTarget === "logs") {
            exportLogsAs(format);
        }
        closeExportModal();
    });
});

// Wire Export Click Handlers on Main Buttons
if (exportBtn)  exportBtn.addEventListener("click",  function () { openExportModal("users"); });
if (exportBtn2) exportBtn2.addEventListener("click", function () { openExportModal("users"); });
if (exportLogBtn) exportLogBtn.addEventListener("click", function () { openExportModal("logs"); });

// Dashboard "View All" button
if (dashGoUsers) {
    dashGoUsers.addEventListener("click", function () { goSection("users"); });
}

// ── Storage Info ─────────────────────────────────────────────
function renderStorageInfo() {
    if (!storageInfo) return;
    storageInfo.innerHTML =
        "<strong>Database:</strong> MongoDB Atlas (Cloud Cluster)<br>" +
        "<strong>Server:</strong> Render (Connected)<br>" +
        "<strong>Total Loaded Accounts:</strong> " + (_serverUsers ? _serverUsers.length : 0) + " users<br>" +
        "<strong>Activity Entries:</strong> " + (_serverLogs ? _serverLogs.length : 0) + " events logged";
}

// ════════════════════════════════════════════════════════════
//  NAVIGATION & TABS
// ════════════════════════════════════════════════════════════

var sectionTitles = {
    dashboard: "Dashboard",
    users:     "User Management",
    activity:  "Activity Log",
    matches:   "Game Matches & Versus Records",
    settings:  "Settings"
};

function goSection(name) {
    document.querySelectorAll(".section").forEach(function (s) { s.classList.remove("active"); });
    document.querySelectorAll(".nav-item").forEach(function (n) {
        n.classList.toggle("active", n.getAttribute("data-section") === name);
    });

    var target = document.getElementById("section-" + name) || document.getElementById("sec-" + name);
    if (target) target.classList.add("active");

    if (topbarTitle) topbarTitle.textContent = sectionTitles[name] || "Admin Console";

    if (sidebarEl) sidebarEl.classList.remove("open");

    // Fetch updated data for that section
    if (name === "dashboard") fetchDashboard();
    if (name === "users")     fetchUsers(currentSearch);
    if (name === "activity")  fetchLogs();
    if (name === "matches")   fetchGames();
    if (name === "settings")  renderStorageInfo();
}

document.querySelectorAll(".nav-item[data-section]").forEach(function (item) {
    item.addEventListener("click", function () {
        goSection(item.getAttribute("data-section"));
    });
});

if (hamburger && sidebarEl) {
    hamburger.addEventListener("click", function () {
        sidebarEl.classList.toggle("open");
    });
}

// ── Search & Filter ──────────────────────────────────────────
if (userSearch) {
    userSearch.addEventListener("input", function () {
        currentSearch = userSearch.value;
        clearTimeout(_searchDebounce);
        _searchDebounce = setTimeout(function () {
            fetchUsers(currentSearch);
        }, 300);
    });
}

filterBtns.forEach(function (btn) {
    btn.addEventListener("click", function () {
        filterBtns.forEach(function (b) { b.classList.remove("active"); });
        btn.classList.add("active");
        currentFilter = btn.getAttribute("data-filter") || "all";
        renderUsersTable();
    });
});

// ── Activity Log Controls & Directory Listeners ─────────────
function setActivityLogFilter(filterName) {
    _currentLogFilter = filterName;
    var tabs = [logTabAll, logTabAdmin, logTabUser];
    tabs.forEach(function (t) {
        if (!t) return;
        t.classList.toggle("active", t.getAttribute("data-logfilter") === filterName);
    });
    renderLog();
}

if (logTabAll)   logTabAll.addEventListener("click",   function () { setActivityLogFilter("all"); });
if (logTabAdmin) logTabAdmin.addEventListener("click", function () { setActivityLogFilter("admin"); });
if (logTabUser)  logTabUser.addEventListener("click",  function () { setActivityLogFilter("user"); });

if (cardAdminLog) cardAdminLog.addEventListener("click", function () { setActivityLogFilter("admin"); });
if (cardUserLog)  cardUserLog.addEventListener("click",  function () { setActivityLogFilter("user"); });

if (logUserSearch) {
    var _logSearchDebounce;
    logUserSearch.addEventListener("input", function () {
        _logUserSearchTerm = logUserSearch.value || "";
        clearTimeout(_logSearchDebounce);
        _logSearchDebounce = setTimeout(function () {
            renderLogUsersDirectory();
        }, 200);
    });
}

if (exportLogFeedBtn) {
    exportLogFeedBtn.addEventListener("click", function () {
        openExportModal("logs");
    });
}

// ── Clock ────────────────────────────────────────────────────
function updateTime() {
    if (!topbarTime) return;
    var d = new Date();
    topbarTime.textContent =
        d.getHours().toString().padStart(2, "0") + ":" +
        d.getMinutes().toString().padStart(2, "0") + ":" +
        d.getSeconds().toString().padStart(2, "0");
}

// ── Settings & Danger Zone Actions ───────────────────────────
function doResetStats() {
    window.API.adminResetStats()
        .then(function () { showToast("All player stats reset.", "success"); refreshAll(); })
        .catch(function (err) { showToast(err.message || "Failed to reset stats.", "error"); });
}

function doNukeUsers() {
    window.API.adminNukeUsers()
        .then(function (res) { showToast(res.message || "Non-admin users deleted.", "error"); refreshAll(); })
        .catch(function (err) { showToast(err.message || "Failed to delete users.", "error"); });
}

function doClearLog() {
    window.API.adminClearLogs()
        .then(function () { _serverLogs = []; renderLog(); showToast("Activity log cleared.", "info"); })
        .catch(function (err) { showToast(err.message || "Failed to clear log.", "error"); });
}

if (resetStatsBtn) {
    resetStatsBtn.addEventListener("click", function () {
        askConfirm("Reset All Stats", "This will wipe every player's win counts and best score across the database. User accounts are preserved.", doResetStats, true);
    });
}
if (nukeUsersBtn) {
    nukeUsersBtn.addEventListener("click", function () {
        askConfirm("DELETE ALL NORMAL USERS", "This permanently removes all regular player accounts from MongoDB. Admin accounts (including your account) are preserved and will NOT be deleted.", doNukeUsers, true);
    });
}
if (clearLogBtn)  clearLogBtn.addEventListener("click",  function () { askConfirm("Clear Activity Log", "Permanently delete all server log entries.", doClearLog, false); });
if (clearLogBtn2) clearLogBtn2.addEventListener("click", function () { askConfirm("Clear Activity Log", "Permanently delete all server log entries.", doClearLog, false); });

// ── Logout ───────────────────────────────────────────────────
if (logoutBtn) {
    logoutBtn.addEventListener("click", function () {
        if (window.API && typeof window.API.logout === "function") {
            window.API.logout().catch(function () {});
        }
        try { localStorage.removeItem(SK.SESSION); } catch (e) {}
        try { localStorage.removeItem("neonGaming_token"); } catch (e) {}
        window.location.replace("../auth.html");
    });
}

// ════════════════════════════════════════════════════════════
//  INIT
// ════════════════════════════════════════════════════════════

var _hasInit = false;
function init() {
    if (_hasInit) return;
    if (!checkAccess()) return;
    _hasInit = true;

    updateTime();
    setInterval(updateTime, 1000);

    // Initial load
    refreshAll();

    // Auto-refresh every 15s so incoming logins/registrations/matches show live
    setInterval(function () {
        var activeSec = document.querySelector(".section.active");
        var secId = activeSec ? activeSec.id : "";
        if (secId === "section-dashboard" || secId === "sec-dashboard") fetchDashboard();
        if (secId === "section-activity"  || secId === "sec-activity")  fetchLogs();
        if (secId === "section-matches"   || secId === "sec-matches")   fetchGames();
        if (secId === "section-users"     || secId === "sec-users")     fetchUsers(currentSearch);
    }, 15000);
}

document.addEventListener("DOMContentLoaded", init);
if (document.readyState === "interactive" || document.readyState === "complete") {
    init();
}
