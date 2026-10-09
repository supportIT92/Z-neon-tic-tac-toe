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

// Toolbar
var userSearch      = document.getElementById("userSearch");
var filterBtns      = document.querySelectorAll(".filter-btn");
var exportBtn       = document.getElementById("exportBtn");
var exportBtn2      = document.getElementById("exportBtn2");
var exportLogBtn    = document.getElementById("exportLogBtn");

// Log
var activityLog     = document.getElementById("activityLog");
var clearLogBtn     = document.getElementById("clearLogBtn");
var clearLogBtn2    = document.getElementById("clearLogBtn2");

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
    nuke:     '<svg viewBox="0 0 24 24" fill="none" stroke="#ff007f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;vertical-align:middle"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
    reset:    '<svg viewBox="0 0 24 24" fill="none" stroke="#00f7ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;vertical-align:middle"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>',
    export:   '<svg viewBox="0 0 24 24" fill="none" stroke="#00f7ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;vertical-align:middle"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>'
};

var LOG_FALLBACK_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';

function renderLog() {
    if (!activityLog) return;
    var logs = _serverLogs;
    if (!logs || logs.length === 0) {
        activityLog.innerHTML = '<p class="empty-row">No activity recorded yet.</p>';
        return;
    }
    var html = "";
    logs.forEach(function (entry) {
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
                    "<div class='user-cell'>" +
                        "<div class='user-avatar'>" + escHtml((u.username || "?").charAt(0).toUpperCase()) + "</div>" +
                        "<span class='user-name-text'>" + escHtml(u.username) + (isSelf ? " <small style='color:var(--muted)'>(you)</small>" : "") + "</span>" +
                    "</div>" +
                "</td>" +
                "<td>" + escHtml(u.email) + "</td>" +
                "<td>" + roleBadge + "</td>" +
                "<td>" + statusBadge + "</td>" +
                "<td>" + formatDate(u.createdAt)  + "</td>" +
                "<td>" + formatDateTime(u.lastLogin)  + "</td>" +
                "<td><div class='action-btns'>" + editBtn + banBtn + roleBtn + delBtn + "</div></td>" +
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

function refreshAll() {
    return Promise.all([
        fetchDashboard(),
        fetchUsers(currentSearch),
        fetchLogs()
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
//  DATA EXPORT (Live Server Data)
// ════════════════════════════════════════════════════════════

function exportCSV() {
    var users = _serverUsers;
    if (!users || users.length === 0) { showToast("No users to export.", "error"); return; }

    var rows = ["#,Username,Email,Role,Status,Joined,Last Login"];
    users.forEach(function (u, i) {
        rows.push([
            i + 1,
            '"' + escHtml(u.username) + '"',
            '"' + escHtml(u.email)    + '"',
            u.role || "user",
            u.banned ? "Banned" : "Active",
            formatDateTime(u.createdAt),
            formatDateTime(u.lastLogin)
        ].join(","));
    });

    var blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement("a");
    a.href     = url;
    a.download = "neon-gaming-users-" + new Date().toISOString().slice(0, 10) + ".csv";
    a.click();
    URL.revokeObjectURL(url);

    showToast("Exported " + users.length + " users.", "success");
}

function exportLogJSON() {
    var logs = _serverLogs;
    if (!logs || logs.length === 0) { showToast("No log entries to export.", "error"); return; }

    var blob = new Blob([JSON.stringify(logs, null, 2)], { type: "application/json" });
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement("a");
    a.href     = url;
    a.download = "neon-gaming-log-" + new Date().toISOString().slice(0, 10) + ".json";
    a.click();
    URL.revokeObjectURL(url);
    showToast("Activity log exported.", "success");
}

// ════════════════════════════════════════════════════════════
//  SETTINGS BUTTONS
// ════════════════════════════════════════════════════════════

function doResetStats() {
    window.API.adminResetStats()
        .then(function () {
            showToast("All player stats reset.", "success");
            refreshAll();
        })
        .catch(function (err) {
            showToast(err.message || "Failed to reset stats.", "error");
        });
}

function doNukeUsers() {
    window.API.adminNukeUsers()
        .then(function (res) {
            showToast(res.message || "Non-admin users deleted.", "error");
            refreshAll();
        })
        .catch(function (err) {
            showToast(err.message || "Failed to delete users.", "error");
        });
}

function doClearLog() {
    window.API.adminClearLogs()
        .then(function () {
            _serverLogs = [];
            renderLog();
            showToast("Activity log cleared.", "info");
        })
        .catch(function (err) {
            showToast(err.message || "Failed to clear log.", "error");
        });
}

resetStatsBtn.addEventListener("click", function () {
    askConfirm("Reset All Stats", "This will wipe every player's win counts and best score across the database.", doResetStats, true);
});

nukeUsersBtn.addEventListener("click", function () {
    askConfirm("DELETE ALL USERS", "This permanently removes all regular user accounts from MongoDB. Admin accounts are preserved.", doNukeUsers, true);
});

clearLogBtn.addEventListener("click",  function () {
    askConfirm("Clear Activity Log", "Permanently delete all server log entries.", doClearLog, false);
});
clearLogBtn2.addEventListener("click", function () {
    askConfirm("Clear Activity Log", "Permanently delete all server log entries.", doClearLog, false);
});

exportBtn.addEventListener("click",  exportCSV);
exportBtn2.addEventListener("click", exportCSV);
exportLogBtn.addEventListener("click", exportLogJSON);

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

// ── Clock ────────────────────────────────────────────────────
function updateTime() {
    if (!topbarTime) return;
    var d = new Date();
    topbarTime.textContent =
        d.getHours().toString().padStart(2, "0") + ":" +
        d.getMinutes().toString().padStart(2, "0") + ":" +
        d.getSeconds().toString().padStart(2, "0");
}

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

    // Auto-refresh every 15s so incoming logins/registrations show live
    setInterval(function () {
        var activeSec = document.querySelector(".section.active");
        var secId = activeSec ? activeSec.id : "";
        if (secId === "section-dashboard" || secId === "sec-dashboard") fetchDashboard();
        if (secId === "section-activity"  || secId === "sec-activity")  fetchLogs();
        if (secId === "section-users"     || secId === "sec-users")     fetchUsers(currentSearch);
    }, 15000);
}

document.addEventListener("DOMContentLoaded", init);
if (document.readyState === "interactive" || document.readyState === "complete") {
    init();
}
