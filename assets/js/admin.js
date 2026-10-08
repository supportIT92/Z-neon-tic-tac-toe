"use strict";
// ════════════════════════════════════════════════════════════
// NEON GAMING — Admin Console Script
// Features: Auth guard, User CRUD, Ban/Unban, Promote/Demote,
//           Search + Filter, CSV export, Activity log,
//           Settings (nuke, reset stats, export log)
// ════════════════════════════════════════════════════════════

// ── Storage Keys (must match auth.js) ───────────────────────
var SK = {
    USERS:   "neonGaming_users",
    SESSION: "neonGaming_session",
    LOG:     "neonGaming_adminLog"
};

// ── State ────────────────────────────────────────────────────
var currentFilter   = "all";
var currentSearch   = "";
var pendingAction   = null;   // { fn } — runs when confirm modal says Yes
var editingEmail    = null;   // email of user being edited

// ── DOM ──────────────────────────────────────────────────────
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
//  STORAGE HELPERS
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

function getUsers()     { return lsGet(SK.USERS)   || []; }
function saveUsers(arr) { lsSet(SK.USERS, arr); }
function getSession()   { return lsGet(SK.SESSION); }

// Simple hash (must match auth.js)
function simpleHash(str) {
    var hash = 5381;
    for (var i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
        hash = hash >>> 0;
    }
    return hash.toString(16);
}

// ════════════════════════════════════════════════════════════
//  ACCESS CONTROL  ← Task #5
// ════════════════════════════════════════════════════════════

function checkAccess() {
    var session = getSession();

    if (!session) {
        // Not logged in → go to login
        window.location.replace("auth.html");
        return false;
    }

    if (session.role !== "admin") {
        // Logged in but not admin → show access denied screen
        accessDenied.classList.add("show");
        adminWrapper.style.display = "none";
        return false;
    }

    // Admin - populate sidebar
    sidebarUsername.textContent = session.username || "Admin";
    sidebarEmail.textContent    = session.email    || "";
    return true;
}

adBackBtn.addEventListener("click", function () {
    window.location.href = "index.html";
});

// ════════════════════════════════════════════════════════════
//  TOAST NOTIFICATION
// ════════════════════════════════════════════════════════════

function showToast(msg, type) {
    clearTimeout(_toastTimer);
    toastEl.textContent  = msg;
    toastEl.className    = "toast show " + (type || "info");
    _toastTimer = setTimeout(function () {
        toastEl.className = "toast";
    }, 3500);
}

// ════════════════════════════════════════════════════════════
//  ACTIVITY LOG
// ════════════════════════════════════════════════════════════

var LOG_ICONS = {
    ban:     '<svg viewBox="0 0 24 24" fill="none" stroke="#ff4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;vertical-align:middle"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>',
    unban:   '<svg viewBox="0 0 24 24" fill="none" stroke="#00ff88" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;vertical-align:middle"><polyline points="20 6 9 17 4 12"/></svg>',
    delete:  '<svg viewBox="0 0 24 24" fill="none" stroke="#ff4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;vertical-align:middle"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>',
    promote: '<svg viewBox="0 0 24 24" fill="none" stroke="#ffd700" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;vertical-align:middle"><path d="M2 20h20"/><path d="m4 20 2-10 6 4 4-8 4 8 2-4 2 10"/></svg>',
    demote:  '<svg viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;vertical-align:middle"><polyline points="7 13 12 18 17 13"/><line x1="12" y1="6" x2="12" y2="18"/></svg>',
    edit:    '<svg viewBox="0 0 24 24" fill="none" stroke="#00f7ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;vertical-align:middle"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
    login:   '<svg viewBox="0 0 24 24" fill="none" stroke="#00f7ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;vertical-align:middle"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
    nuke:    '<svg viewBox="0 0 24 24" fill="none" stroke="#ff007f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;vertical-align:middle"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
    reset:   '<svg viewBox="0 0 24 24" fill="none" stroke="#00f7ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;vertical-align:middle"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>',
    export:  '<svg viewBox="0 0 24 24" fill="none" stroke="#00f7ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;vertical-align:middle"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>'
};

function addLog(action, msg) {
    var logs = lsGet(SK.LOG) || [];
    logs.unshift({
        action:    action,
        msg:       msg,
        timestamp: Date.now()
    });
    // Keep max 200 entries
    if (logs.length > 200) logs = logs.slice(0, 200);
    lsSet(SK.LOG, logs);
    renderLog();
}

function renderLog() {
    var logs = lsGet(SK.LOG) || [];
    if (logs.length === 0) {
        activityLog.innerHTML = '<p class="empty-row">No activity recorded yet.</p>';
        return;
    }
    var html = "";
    var fallbackIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
    logs.forEach(function (entry) {
        var icon = LOG_ICONS[entry.action] || fallbackIcon;
        var time = formatDateTime(entry.timestamp);
        html +=
            '<div class="log-entry log-' + entry.action + '">' +
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
    return d.getDate().toString().padStart(2, "0") + "/" +
           (d.getMonth() + 1).toString().padStart(2, "0") + "/" +
           d.getFullYear();
}

function formatDateTime(ts) {
    if (!ts) return "—";
    var d   = new Date(ts);
    var date = formatDate(ts);
    var time = d.getHours().toString().padStart(2, "0") + ":" +
               d.getMinutes().toString().padStart(2, "0");
    return date + " " + time;
}

function isToday(ts) {
    if (!ts) return false;
    var d   = new Date(ts);
    var now = new Date();
    return d.getDate()     === now.getDate() &&
           d.getMonth()    === now.getMonth() &&
           d.getFullYear() === now.getFullYear();
}

// ════════════════════════════════════════════════════════════
//  ESCAPE HTML
// ════════════════════════════════════════════════════════════

function escHtml(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

// ════════════════════════════════════════════════════════════
//  DASHBOARD
// ════════════════════════════════════════════════════════════

function renderDashboard() {
    var users  = getUsers();
    var admins = users.filter(function (u) { return u.role === "admin"; }).length;
    var banned = users.filter(function (u) { return u.banned; }).length;
    var today  = users.filter(function (u) { return isToday(u.lastLogin); }).length;

    statValTotal.textContent  = users.length;
    statValAdmins.textContent = admins;
    statValBanned.textContent = banned;
    statValToday.textContent  = today;

    // Recent registrations — last 5
    var sorted = users.slice().sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
    var recent = sorted.slice(0, 5);

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
                        "<div class='user-avatar'>" + escHtml(u.username.charAt(0)) + "</div>" +
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
    var users  = getUsers();
    var search = currentSearch.trim().toLowerCase();

    // Role/status filter
    if (currentFilter !== "all") {
        users = users.filter(function (u) {
            if (currentFilter === "admin")  return u.role === "admin";
            if (currentFilter === "user")   return u.role === "user" && !u.banned;
            if (currentFilter === "banned") return u.banned;
            return true;
        });
    }

    // Search filter
    if (search) {
        users = users.filter(function (u) {
            return u.username.toLowerCase().indexOf(search) !== -1 ||
                   u.email.toLowerCase().indexOf(search) !== -1;
        });
    }

    return users;
}

function renderUsersTable() {
    var session  = getSession();
    var filtered = getFilteredUsers();

    userCountBadge.textContent = filtered.length + " user" + (filtered.length !== 1 ? "s" : "");

    if (filtered.length === 0) {
        usersBody.innerHTML = '<tr><td colspan="8" class="empty-row">No users match your search.</td></tr>';
        return;
    }

    var html = "";
    filtered.forEach(function (u, i) {
        var isSelf       = session && u.email === session.email;
        var roleBadge    = u.role === "admin"
            ? '<span class="badge badge-admin">Admin</span>'
            : '<span class="badge badge-user">User</span>';
        var statusBadge  = u.banned
            ? '<span class="badge badge-banned">Banned</span>'
            : '<span class="badge badge-active">Active</span>';

        // Action buttons with clean SVG icons
        var editBtn = '<button class="act-btn act-edit" data-action="edit" data-email="' + escHtml(u.email) + '"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-1px;margin-right:4px;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>Edit</button>';

        var banBtn = u.banned
            ? '<button class="act-btn act-unban" data-action="unban" data-email="' + escHtml(u.email) + '"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-1px;margin-right:4px;"><polyline points="20 6 9 17 4 12"/></svg>Unban</button>'
            : '<button class="act-btn act-ban" data-action="ban" data-email="' + escHtml(u.email) + '"' + (isSelf ? " disabled title='Cannot ban yourself'" : "") + '><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-1px;margin-right:4px;"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>Ban</button>';

        var roleBtn = u.role === "admin"
            ? '<button class="act-btn act-demote" data-action="demote" data-email="' + escHtml(u.email) + '"' + (isSelf ? " disabled title='Cannot demote yourself'" : "") + '><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-1px;margin-right:4px;"><polyline points="6 9 12 15 18 9"/></svg>Demote</button>'
            : '<button class="act-btn act-promote" data-action="promote" data-email="' + escHtml(u.email) + '"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-1px;margin-right:4px;"><path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14v2H5z"/></svg>Promote</button>';

        var delBtn = '<button class="act-btn act-delete" data-action="delete" data-email="' + escHtml(u.email) + '"' + (isSelf ? " disabled title='Cannot delete yourself'" : "") + '><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-1px;margin-right:4px;"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>Delete</button>';

        html +=
            "<tr>" +
                "<td class='row-num'>" + (i + 1) + "</td>" +
                "<td>" +
                    "<div class='user-cell'>" +
                        "<div class='user-avatar'>" + escHtml(u.username.charAt(0)) + "</div>" +
                        "<span class='user-name-text'>" + escHtml(u.username) + (isSelf ? " <small style='color:var(--muted)'>(you)</small>" : "") + "</span>" +
                    "</div>" +
                "</td>" +
                "<td>" + escHtml(u.email) + "</td>" +
                "<td>" + roleBadge + "</td>" +
                "<td>" + statusBadge + "</td>" +
                "<td>" + formatDate(u.createdAt)  + "</td>" +
                "<td>" + formatDate(u.lastLogin)  + "</td>" +
                "<td><div class='action-btns'>" + editBtn + banBtn + roleBtn + delBtn + "</div></td>" +
            "</tr>";
    });

    usersBody.innerHTML = html;

    // Wire action buttons
    var btns = usersBody.querySelectorAll(".act-btn[data-action]");
    btns.forEach(function (btn) {
        btn.addEventListener("click", function () {
            var action = btn.getAttribute("data-action");
            var email  = btn.getAttribute("data-email");
            handleUserAction(action, email);
        });
    });
}

// ════════════════════════════════════════════════════════════
//  USER ACTIONS
// ════════════════════════════════════════════════════════════

function handleUserAction(action, email) {
    var users = getUsers();
    var user  = users.find(function (u) { return u.email === email; });
    if (!user) { showToast("User not found.", "error"); return; }

    if (action === "edit") {
        openEditModal(user);
        return;
    }

    if (action === "ban") {
        askConfirm(
            "Ban User",
            "Ban <strong>" + escHtml(user.username) + "</strong>? They will not be able to log in.",
            function () { doSetBan(email, true); },
            true
        );
    } else if (action === "unban") {
        askConfirm(
            "Unban User",
            "Unban <strong>" + escHtml(user.username) + "</strong>? They will regain access.",
            function () { doSetBan(email, false); },
            false
        );
    } else if (action === "promote") {
        askConfirm(
            "Promote to Admin",
            "Promote <strong>" + escHtml(user.username) + "</strong> to Admin? They will have full admin access.",
            function () { doSetRole(email, "admin"); },
            true
        );
    } else if (action === "demote") {
        askConfirm(
            "Demote to User",
            "Demote <strong>" + escHtml(user.username) + "</strong> back to regular User?",
            function () { doSetRole(email, "user"); },
            true
        );
    } else if (action === "delete") {
        askConfirm(
            "Delete User",
            "Permanently delete <strong>" + escHtml(user.username) + "</strong>? This cannot be undone.",
            function () { doDeleteUser(email); },
            true
        );
    }
}

function doSetBan(email, banned) {
    var users = getUsers();
    var name  = "";
    users.forEach(function (u) {
        if (u.email === email) { u.banned = banned; name = u.username; }
    });
    saveUsers(users);
    var msg = banned ? "Banned user: " + name : "Unbanned user: " + name;
    addLog(banned ? "ban" : "unban", msg);
    showToast(msg, banned ? "error" : "success");
    refreshAll();
}

function doSetRole(email, role) {
    var users = getUsers();
    var name  = "";
    users.forEach(function (u) {
        if (u.email === email) { u.role = role; name = u.username; }
    });
    saveUsers(users);

    // Update session if we promoted/demoted ourselves
    var session = getSession();
    if (session && session.email === email) {
        session.role = role;
        lsSet(SK.SESSION, session);
    }

    var action = role === "admin" ? "promote" : "demote";
    var msg    = role === "admin"
        ? "Promoted " + name + " to Admin"
        : "Demoted " + name + " to User";
    addLog(action, msg);
    showToast(msg, "info");
    refreshAll();
}

function doDeleteUser(email) {
    var users = getUsers();
    var name  = "";
    users = users.filter(function (u) {
        if (u.email === email) { name = u.username; return false; }
        return true;
    });
    saveUsers(users);
    addLog("delete", "Deleted user: " + name + " (" + email + ")");
    showToast("Deleted user: " + name, "error");
    refreshAll();
}

// ════════════════════════════════════════════════════════════
//  EDIT MODAL
// ════════════════════════════════════════════════════════════

function openEditModal(user) {
    editingEmail          = user.email;
    editUsername.value    = user.username;
    editEmail.value       = user.email;
    editRole.value        = user.role || "user";
    editNewPassword.value = "";
    editError.textContent = "";
    editModal.classList.add("open");
    editUsername.focus();
}

editSaveBtn.addEventListener("click", function () {
    var users   = getUsers();
    var newUser = editUsername.value.trim();
    var newEmail= editEmail.value.trim().toLowerCase();
    var newRole = editRole.value;
    var newPw   = editNewPassword.value;

    editError.textContent = "";

    // Basic validation
    if (!newUser || !newEmail) {
        editError.textContent = "Username and email cannot be empty.";
        return;
    }
    if (!/^[A-Za-z][A-Za-z0-9_]{2,19}$/.test(newUser)) {
        editError.textContent = "Invalid username format.";
        return;
    }
    if (!isValidEmail(newEmail)) {
        editError.textContent = "Invalid email address.";
        return;
    }

    // Check duplicate username (excluding this user)
    var dupName = users.find(function (u) {
        return u.email !== editingEmail && u.username.toLowerCase() === newUser.toLowerCase();
    });
    if (dupName) { editError.textContent = "Username already taken."; return; }

    // Check duplicate email
    var dupEmail = users.find(function (u) {
        return u.email !== editingEmail && u.email === newEmail;
    });
    if (dupEmail) { editError.textContent = "Email already in use."; return; }

    // Apply changes
    var changed = [];
    users.forEach(function (u) {
        if (u.email === editingEmail) {
            if (u.username !== newUser) changed.push("username → " + newUser);
            if (u.email    !== newEmail) changed.push("email → " + newEmail);
            if (u.role     !== newRole)  changed.push("role → " + newRole);
            u.username = newUser;
            u.email    = newEmail;
            u.role     = newRole;
            if (newPw) { u.passwordHash = simpleHash(newPw); changed.push("password changed"); }
        }
    });
    saveUsers(users);

    // If editing self, update session
    var session = getSession();
    if (session && session.email === editingEmail) {
        session.username = newUser;
        session.email    = newEmail;
        session.role     = newRole;
        lsSet(SK.SESSION, session);
        sidebarUsername.textContent = newUser;
        sidebarEmail.textContent    = newEmail;
    }

    addLog("edit", "Edited user " + editingEmail + ": " + changed.join(", "));
    showToast("User updated successfully.", "success");
    editModal.classList.remove("open");
    editingEmail = null;
    refreshAll();
});

editCancelBtn.addEventListener("click", function () {
    editModal.classList.remove("open");
    editingEmail = null;
});

// ── Simple email validation (same logic as auth.js) ─────────
function isValidEmail(email) {
    var e = String(email).trim().toLowerCase();
    if (e.length < 6 || e.length > 254) return false;
    var atCount = 0;
    for (var i = 0; i < e.length; i++) { if (e[i] === "@") atCount++; }
    if (atCount !== 1) return false;
    var atIdx  = e.indexOf("@");
    var local  = e.slice(0, atIdx);
    var domain = e.slice(atIdx + 1);
    if (!local  || local.length  > 64)  return false;
    if (!domain || domain.length > 253) return false;
    if (local.charAt(0) === "." || local.charAt(local.length - 1) === ".")   return false;
    if (domain.charAt(0) === "." || domain.charAt(domain.length - 1) === ".") return false;
    if (local.indexOf("..") !== -1 || domain.indexOf("..") !== -1)           return false;
    if (!/^[a-z0-9._+%\-]+$/.test(local))  return false;
    if (domain.indexOf(".") === -1)         return false;
    var labels = domain.split(".");
    var tld    = labels[labels.length - 1];
    if (!/^[a-z]{2,8}$/.test(tld)) return false;
    for (var j = 0; j < labels.length; j++) {
        var lbl = labels[j];
        if (!lbl || lbl.length > 63) return false;
        if (lbl.charAt(0) === "-" || lbl.charAt(lbl.length - 1) === "-") return false;
        if (!/^[a-z0-9\-]+$/.test(lbl)) return false;
    }
    return true;
}

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

// Close modals on backdrop click
confirmModal.addEventListener("click", function (e) {
    if (e.target === confirmModal) { confirmModal.classList.remove("open"); pendingAction = null; }
});
editModal.addEventListener("click", function (e) {
    if (e.target === editModal) { editModal.classList.remove("open"); editingEmail = null; }
});

// ════════════════════════════════════════════════════════════
//  EXPORT CSV
// ════════════════════════════════════════════════════════════

function exportCSV() {
    var users = getUsers();
    if (users.length === 0) { showToast("No users to export.", "error"); return; }

    var rows = ["#,Username,Email,Role,Status,Joined,Last Login"];
    users.forEach(function (u, i) {
        rows.push([
            i + 1,
            '"' + u.username + '"',
            '"' + u.email    + '"',
            u.role || "user",
            u.banned ? "Banned" : "Active",
            formatDateTime(u.createdAt),
            formatDateTime(u.lastLogin)
        ].join(","));
    });

    var blob = new Blob([rows.join("\n")], { type: "text/csv" });
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement("a");
    a.href     = url;
    a.download = "neon-gaming-users-" + new Date().toISOString().slice(0, 10) + ".csv";
    a.click();
    URL.revokeObjectURL(url);

    addLog("export", "Exported user list as CSV (" + users.length + " users)");
    showToast("Exported " + users.length + " users.", "success");
}

function exportLogJSON() {
    var logs = lsGet(SK.LOG) || [];
    if (logs.length === 0) { showToast("No log entries to export.", "error"); return; }

    var blob = new Blob([JSON.stringify(logs, null, 2)], { type: "application/json" });
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement("a");
    a.href     = url;
    a.download = "neon-gaming-log-" + new Date().toISOString().slice(0, 10) + ".json";
    a.click();
    URL.revokeObjectURL(url);
    showToast("Log exported.", "success");
}

// ════════════════════════════════════════════════════════════
//  SETTINGS ACTIONS
// ════════════════════════════════════════════════════════════

function doResetStats() {
    var users = getUsers();
    // Clear game stats from localStorage (per-player keys)
    users.forEach(function (u) {
        try { localStorage.removeItem("neonTicTacToeWins_" + u.username.trim().toLowerCase()); } catch (e) { /* ignore */ }
    });
    try { localStorage.removeItem("neonTicBestScore"); } catch (e) { /* ignore */ }
    addLog("reset", "Admin reset all game stats.");
    showToast("All game stats have been reset.", "success");
}

function doNukeUsers() {
    lsSet(SK.USERS, []);
    // Also clear session so admin is logged out
    try { localStorage.removeItem(SK.SESSION); } catch (e) { /* ignore */ }
    addLog("nuke", "Admin nuked all user accounts.");
    showToast("All users deleted. Redirecting…", "error");
    setTimeout(function () { window.location.replace("auth.html"); }, 1800);
}

function doClearLog() {
    lsSet(SK.LOG, []);
    renderLog();
    showToast("Activity log cleared.", "info");
}

// ════════════════════════════════════════════════════════════
//  STORAGE INFO
// ════════════════════════════════════════════════════════════

function renderStorageInfo() {
    var users = getUsers();
    var logs  = lsGet(SK.LOG) || [];

    var userBytes = JSON.stringify(users).length;
    var logBytes  = JSON.stringify(logs).length;

    storageInfo.innerHTML =
        "<strong>Registered Users:</strong> "  + users.length + " accounts<br>" +
        "<strong>User Data Size:</strong> "    + (userBytes / 1024).toFixed(2) + " KB<br>" +
        "<strong>Log Entries:</strong> "       + logs.length + "<br>" +
        "<strong>Log Size:</strong> "          + (logBytes / 1024).toFixed(2) + " KB<br>" +
        "<strong>Storage:</strong> localStorage (browser-local, not server-synced)";
}

// ════════════════════════════════════════════════════════════
//  SECTION NAVIGATION
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
        n.setAttribute("aria-current", n.getAttribute("data-section") === name ? "page" : "false");
    });
    var sec = document.getElementById("section-" + name);
    if (sec) sec.classList.add("active");
    topbarTitle.textContent = sectionTitles[name] || name;

    // Refresh content for section
    if (name === "dashboard") { renderDashboard(); }
    if (name === "users")     { renderUsersTable(); }
    if (name === "activity")  { renderLog(); }
    if (name === "settings")  { renderStorageInfo(); }

    // Close sidebar on mobile
    sidebarEl.classList.remove("open");
    hamburger.setAttribute("aria-expanded", "false");
}

document.querySelectorAll(".nav-item").forEach(function (btn) {
    btn.addEventListener("click", function () { goSection(btn.getAttribute("data-section")); });
});

// ════════════════════════════════════════════════════════════
//  TOOLBAR INTERACTIONS
// ════════════════════════════════════════════════════════════

userSearch.addEventListener("input", function () {
    currentSearch = userSearch.value;
    renderUsersTable();
});

filterBtns.forEach(function (btn) {
    btn.addEventListener("click", function () {
        filterBtns.forEach(function (b) { b.classList.remove("active"); });
        btn.classList.add("active");
        currentFilter = btn.getAttribute("data-filter");
        renderUsersTable();
    });
});

exportBtn.addEventListener("click",  exportCSV);
exportBtn2.addEventListener("click", exportCSV);
exportLogBtn.addEventListener("click", exportLogJSON);

// ════════════════════════════════════════════════════════════
//  SETTINGS BUTTON WIRING
// ════════════════════════════════════════════════════════════

resetStatsBtn.addEventListener("click", function () {
    askConfirm("Reset All Stats", "This will wipe every player's win counts and best score. Cannot be undone.", doResetStats, true);
});

nukeUsersBtn.addEventListener("click", function () {
    askConfirm("DELETE ALL USERS", "This permanently removes EVERY account including yours. You will be logged out.", doNukeUsers, true);
});

clearLogBtn.addEventListener("click",  function () {
    askConfirm("Clear Activity Log", "This will permanently delete all log entries.", doClearLog, false);
});
clearLogBtn2.addEventListener("click", function () {
    askConfirm("Clear Activity Log", "This will permanently delete all log entries.", doClearLog, false);
});

// Dashboard "View All" button
dashGoUsers.addEventListener("click", function () { goSection("users"); });

// ════════════════════════════════════════════════════════════
//  LOGOUT
// ════════════════════════════════════════════════════════════

logoutBtn.addEventListener("click", function () {
    try { localStorage.removeItem(SK.SESSION); } catch (e) { /* ignore */ }
    window.location.href = "auth.html";
});

// ════════════════════════════════════════════════════════════
//  HAMBURGER MENU (mobile)
// ════════════════════════════════════════════════════════════

hamburger.addEventListener("click", function () {
    var open = sidebarEl.classList.toggle("open");
    hamburger.setAttribute("aria-expanded", open ? "true" : "false");
});

// Close sidebar when clicking outside on mobile
document.addEventListener("click", function (e) {
    if (window.innerWidth <= 700 &&
        sidebarEl.classList.contains("open") &&
        !sidebarEl.contains(e.target) &&
        e.target !== hamburger) {
        sidebarEl.classList.remove("open");
        hamburger.setAttribute("aria-expanded", "false");
    }
});

// ════════════════════════════════════════════════════════════
//  CLOCK
// ════════════════════════════════════════════════════════════

function updateClock() {
    var now  = new Date();
    var h    = now.getHours().toString().padStart(2, "0");
    var m    = now.getMinutes().toString().padStart(2, "0");
    var s    = now.getSeconds().toString().padStart(2, "0");
    topbarTime.textContent = h + ":" + m + ":" + s;
}
updateClock();
setInterval(updateClock, 1000);

// ════════════════════════════════════════════════════════════
//  KEYBOARD SHORTCUTS
// ════════════════════════════════════════════════════════════

document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
        confirmModal.classList.remove("open");
        editModal.classList.remove("open");
        pendingAction = null;
        editingEmail  = null;
    }
});

// ════════════════════════════════════════════════════════════
//  REFRESH ALL
// ════════════════════════════════════════════════════════════

function refreshAll() {
    renderDashboard();
    renderUsersTable();
    renderStorageInfo();
}

// ════════════════════════════════════════════════════════════
//  INIT
// ════════════════════════════════════════════════════════════

(function init() {
    if (!checkAccess()) return;   // blocks non-admins

    addLog("login", "Admin session started by " + (getSession().username || "unknown"));
    goSection("dashboard");
}());
