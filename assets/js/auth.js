// ============================================================
// NEON GAMING — Auth Script
// Login · Signup (with OTP email verification) · Forgot Password
// OTP sent via EmailJS (service_if0qmog) · Admin role support
// ============================================================

"use strict";

// ════════════════════════════════════════════════════════════
//  EMAILJS CONFIG
//  Service:  service_if0qmog   (your EmailJS Gmail service)
//  Template variables used in your EmailJS template:
//    {{to_name}}  — recipient username
//    {{to_email}} — recipient email
//    {{otp_code}} — the 6-digit OTP
//    {{app_name}} — "Neon Gaming"
// ════════════════════════════════════════════════════════════
var EMAILJS_CONFIG = {
    publicKey:  "qbkefep6jKrjcyW_L",
    serviceId:  "service_if0qmog",
    templateId: "template_qrv9x71"
};

// ── OTP Settings ─────────────────────────────────────────────
var OTP_EXPIRY_MS  = 5 * 60 * 1000;   // 5 minutes
var OTP_RESEND_CD  = 60;               // resend cooldown (seconds)

// ── Storage Keys ─────────────────────────────────────────────
var SK = {
    USERS:    "neonGaming_users",
    SESSION:  "neonGaming_session",
    REMEMBER: "neonGaming_remember"
};

// Minimum password strength (3 = Good, 4 = Strong)
var MIN_STRENGTH = 3;

// ── OTP State (in-memory only, never persisted) ──────────────
var _otpState = null;
/*  _otpState = {
        code:      "123456",
        expiresAt: <timestamp>,
        attempts:  0,
        userData:  { username, email, passwordHash, role, banned, createdAt }
    }
*/

// ── OTP Timer handles ────────────────────────────────────────
var _otpCountdownInterval = null;
var _otpResendInterval    = null;

// ── DOM ──────────────────────────────────────────────────────
var loginForm       = document.getElementById("loginForm");
var signupForm      = document.getElementById("signupForm");
var forgotForm      = document.getElementById("forgotForm");
var otpPanel        = document.getElementById("otpPanel");
var formTitle       = document.getElementById("formTitle");
var alertBox        = document.getElementById("alertBox");
var switchText      = document.getElementById("switchText");

// Login
var loginIdentifier = document.getElementById("loginIdentifier");
var loginPassword   = document.getElementById("loginPassword");
var toggleLoginPw   = document.getElementById("toggleLoginPw");
var rememberMe      = document.getElementById("rememberMe");
var forgotBtn       = document.getElementById("forgotBtn");

// Signup
var signupUsername  = document.getElementById("signupUsername");
var signupEmail     = document.getElementById("signupEmail");
var signupPassword  = document.getElementById("signupPassword");
var signupConfirm   = document.getElementById("signupConfirm");
var toggleSignupPw  = document.getElementById("toggleSignupPw");
var toggleConfirmPw = document.getElementById("toggleConfirmPw");
var agreeTerms      = document.getElementById("agreeTerms");
var strengthFill    = document.getElementById("strengthFill");
var strengthLabel   = document.getElementById("strengthLabel");

// Forgot password
var forgotEmail     = document.getElementById("forgotEmail");
var backToLoginBtn  = document.getElementById("backToLoginBtn");

// Reset password panel
var resetPasswordForm       = document.getElementById("resetPasswordForm");
var resetEmailInput         = document.getElementById("resetEmailInput");
var newPasswordInput        = document.getElementById("newPasswordInput");
var confirmNewPasswordInput = document.getElementById("confirmNewPasswordInput");
var toggleNewPw             = document.getElementById("toggleNewPw");
var toggleConfirmNewPw      = document.getElementById("toggleConfirmNewPw");
var resetStrengthFill       = document.getElementById("resetStrengthFill");
var resetStrengthLabel      = document.getElementById("resetStrengthLabel");
var resetPasswordSubmitBtn  = document.getElementById("resetPasswordSubmitBtn");
var resetBackToLoginBtn     = document.getElementById("resetBackToLoginBtn");
var _currentResetToken      = null;

// OTP panel
var otpEmailDisplay = document.getElementById("otpEmailDisplay");
var otpBoxes        = document.querySelectorAll(".otp-digit");
var otpTimerCount   = document.getElementById("otpTimerCount");
var otpTimerText    = document.getElementById("otpTimerText");
var otpVerifyBtn    = document.getElementById("otpVerifyBtn");
var otpResendBtn    = document.getElementById("otpResendBtn");
var otpResendTimer  = document.getElementById("otpResendTimer");
var otpBackBtn      = document.getElementById("otpBackBtn");

var currentPanel = "login";

// ════════════════════════════════════════════════════════════
//  SAFE STORAGE
// ════════════════════════════════════════════════════════════

function lsSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* quota/blocked */ }
}
function lsGet(key) {
    try {
        var raw = localStorage.getItem(key);
        return raw !== null ? JSON.parse(raw) : null;
    } catch (e) { return null; }
}

// ════════════════════════════════════════════════════════════
//  SANITISE
// ════════════════════════════════════════════════════════════

function sanitise(raw) {
    if (typeof raw !== "string") return "";
    return raw.replace(/<[^>]*>/g, "").trim().slice(0, 100);
}

// ════════════════════════════════════════════════════════════
//  SIMPLE HASH  (demo only — not production-safe)
// ════════════════════════════════════════════════════════════

function simpleHash(str) {
    var hash = 5381;
    for (var i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
        hash = hash >>> 0;
    }
    return hash.toString(16);
}

// ════════════════════════════════════════════════════════════
//  EMAIL VALIDATION
// ════════════════════════════════════════════════════════════

function isValidEmail(email) {
    var e = String(email).trim().toLowerCase();
    if (e.length < 6 || e.length > 254) return false;

    var atCount = 0;
    for (var i = 0; i < e.length; i++) {
        if (e[i] === "@") atCount++;
    }
    if (atCount !== 1) return false;

    var atIdx  = e.indexOf("@");
    var local  = e.slice(0, atIdx);
    var domain = e.slice(atIdx + 1);

    // Local part
    if (!local  || local.length  > 64)  return false;
    if (local.charAt(0) === "."  || local.charAt(local.length  - 1) === ".")  return false;
    if (local.indexOf("..") !== -1)     return false;
    if (!/^[a-z0-9._+%\-]+$/.test(local)) return false;

    // Domain part
    if (!domain || domain.length > 253) return false;
    if (domain.charAt(0) === "." || domain.charAt(domain.length - 1) === ".") return false;
    if (domain.indexOf("..") !== -1)    return false;
    if (domain.indexOf(".")  === -1)    return false;

    var labels = domain.split(".");
    var tld    = labels[labels.length - 1];
    if (!/^[a-z]{2,8}$/.test(tld))     return false;

    for (var j = 0; j < labels.length; j++) {
        var lbl = labels[j];
        if (!lbl || lbl.length > 63)   return false;
        if (lbl.charAt(0) === "-" || lbl.charAt(lbl.length - 1) === "-") return false;
        if (!/^[a-z0-9\-]+$/.test(lbl)) return false;
    }
    return true;
}

// ════════════════════════════════════════════════════════════
//  USERNAME VALIDATION
// ════════════════════════════════════════════════════════════

function isValidUsername(name) {
    return /^[A-Za-z][A-Za-z0-9_]{2,19}$/.test(name.trim());
}

// ════════════════════════════════════════════════════════════
//  PASSWORD STRENGTH
// ════════════════════════════════════════════════════════════

var STRENGTH_META = [
    { label: "Too Short", color: "#666",    width: "8%"   },
    { label: "Weak",      color: "#ff4444", width: "25%"  },
    { label: "Fair",      color: "#ffaa00", width: "50%"  },
    { label: "Good",      color: "#00ccff", width: "75%"  },
    { label: "Strong",    color: "#00ff88", width: "100%" }
];

function getStrength(pw) {
    if (pw.length < 8) return 0;
    var c = 0;
    if (/[a-z]/.test(pw))        c++;
    if (/[A-Z]/.test(pw))        c++;
    if (/[0-9]/.test(pw))        c++;
    if (/[^A-Za-z0-9]/.test(pw)) c++;
    if (c >= 4 && pw.length >= 12) return 4;
    if (c >= 3 && pw.length >= 10) return 3;
    if (c >= 2)                    return 2;
    return 1;
}

function updateStrengthBar(pw) {
    var lvl = getStrength(pw);
    var m   = STRENGTH_META[lvl];
    strengthFill.style.width           = pw.length === 0 ? "0%" : m.width;
    strengthFill.style.backgroundColor = pw.length === 0 ? "#333" : m.color;
    strengthLabel.textContent          = pw.length === 0 ? "" : m.label;
    strengthLabel.style.color          = pw.length === 0 ? "" : m.color;
}

// ════════════════════════════════════════════════════════════
//  ALERT BANNER
// ════════════════════════════════════════════════════════════

var _alertTimer = null;

function showAlert(msg, type) {
    type = type || "error";
    clearTimeout(_alertTimer);
    var cleanMsg = String(msg || "")
        .replace(/^\[(ERROR|WARNING|INFO|SUCCESS|EXPIRED|LOCK|OK|GAME)\]\s*/gi, "")
        .replace(/\[(GAME|OK)\]/gi, "")
        .replace(/^[\u2600-\u27BF\uD83C-\uDBFF\uDC00-\uDFFF\u2700-\u27BF⚠️❌🚫⏱️📧🔗✓]+\s*/g, "")
        .trim();
    alertBox.textContent = cleanMsg;
    alertBox.className   = "alert " + type;
    if (type === "success" || type === "info") {
        _alertTimer = setTimeout(clearAlert, 5000);
    }
}

function clearAlert() {
    alertBox.className   = "alert";
    alertBox.textContent = "";
}

// ════════════════════════════════════════════════════════════
//  PANEL SWITCHER
// ════════════════════════════════════════════════════════════

function hideAllPanels() {
    if (loginForm) loginForm.classList.add("hidden");
    if (signupForm) signupForm.classList.add("hidden");
    if (forgotForm) forgotForm.classList.add("hidden");
    if (resetPasswordForm) resetPasswordForm.classList.add("hidden");
    if (otpPanel) otpPanel.classList.add("hidden");
    var old = document.getElementById("successScreen");
    if (old) old.remove();
}

function showPanel(panel) {
    clearAlert();
    currentPanel = panel;
    hideAllPanels();

    if (panel === "login") {
        loginForm.classList.remove("hidden");
        formTitle.textContent = "LOGIN";
        switchText.innerHTML  =
            'Don\'t have an account? <button type="button" class="link-btn accent" id="switchBtn">Register</button>';
        switchText.classList.remove("hidden");
        document.getElementById("switchBtn").addEventListener("click", function () { showPanel("signup"); });
        var rem = lsGet(SK.REMEMBER);
        if (rem) { loginIdentifier.value = rem; rememberMe.checked = true; }
        loginIdentifier.focus();

    } else if (panel === "signup") {
        signupForm.classList.remove("hidden");
        formTitle.textContent = "CREATE ACCOUNT";
        switchText.innerHTML  =
            'Already have an account? <button type="button" class="link-btn accent" id="switchBtn">Login</button>';
        switchText.classList.remove("hidden");
        document.getElementById("switchBtn").addEventListener("click", function () { showPanel("login"); });
        signupUsername.focus();

    } else if (panel === "forgot") {
        forgotForm.classList.remove("hidden");
        formTitle.textContent = "RESET PASSWORD";
        switchText.classList.add("hidden");
        forgotEmail.focus();

    } else if (panel === "reset") {
        if (resetPasswordForm) resetPasswordForm.classList.remove("hidden");
        formTitle.textContent = "NEW PASSWORD";
        switchText.classList.add("hidden");
        if (newPasswordInput) newPasswordInput.focus();

    } else if (panel === "otp") {
        otpPanel.classList.remove("hidden");
        formTitle.textContent = "VERIFY EMAIL";
        switchText.classList.add("hidden");
        // Focus first OTP box
        if (otpBoxes[0]) otpBoxes[0].focus();
    }
}

// ════════════════════════════════════════════════════════════
//  SUCCESS SCREEN
// ════════════════════════════════════════════════════════════

function showSuccessScreen(username) {
    clearAlert();
    currentPanel = "success";
    hideAllPanels();
    switchText.classList.add("hidden");
    formTitle.textContent = "ACCOUNT CREATED";

    var safeName = sanitise(username).slice(0, 20);
    var screen   = document.createElement("div");
    screen.id        = "successScreen";
    screen.className = "success-screen";
    screen.innerHTML =
        '<div class="success-icon">\uD83C\uDF89</div>' +
        '<h3 class="success-heading">Welcome, <span class="success-name">' + safeName + '</span>!</h3>' +
        '<p class="success-subtext">Your Neon Gaming account is ready.</p>' +
        '<ul class="success-details">' +
            '<li>\u2705\u00A0 Username registered</li>' +
            '<li>\u2705\u00A0 Email verified via OTP</li>' +
            '<li>\u2705\u00A0 Strong password set</li>' +
        '</ul>' +
        '<p class="success-redirect-msg">Taking you to the game in <strong id="countdownNum">3</strong>s\u2026</p>' +
        '<button type="button" class="submit-btn" id="playNowBtn">' +
            '<span class="btn-text">\u25B6 PLAY NOW</span>' +
            '<span class="btn-glow"></span>' +
        '</button>';

    alertBox.insertAdjacentElement("afterend", screen);
    document.getElementById("playNowBtn").addEventListener("click", goToGame);

    var count = 3;
    var numEl = document.getElementById("countdownNum");
    var t = setInterval(function () {
        count--;
        if (numEl) numEl.textContent = count;
        if (count <= 0) { clearInterval(t); goToGame(); }
    }, 1000);
}

function goToGame()  {
    // After login, check if user was trying to visit a specific page
    try {
        var redirect = sessionStorage.getItem("neonGaming_redirect");
        if (redirect && redirect.indexOf("/auth") === -1) {
            sessionStorage.removeItem("neonGaming_redirect");
            window.location.href = redirect;
            return;
        }
    } catch(e) {}
    var inSubdir = window.location.pathname.includes("/auth/") || window.location.pathname.endsWith("/auth");
    window.location.href = inSubdir ? "../index.html" : "index.html";
}
function goToAdmin() {
    var inSubdir = window.location.pathname.includes("/auth/") || window.location.pathname.endsWith("/auth");
    window.location.href = inSubdir ? "../admin/index.html" : "admin/index.html";
}

// ════════════════════════════════════════════════════════════
//  PASSWORD TOGGLE
// ════════════════════════════════════════════════════════════

function setupToggle(btn, input) {
    btn.addEventListener("click", function () {
        var show   = input.type === "password";
        input.type = show ? "text" : "password";
        btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
        btn.querySelector(".eye-icon").textContent = show ? "\uD83D\uDE48" : "\uD83D\uDC41";
    });
}

// ════════════════════════════════════════════════════════════
//  REAL-TIME EMAIL FEEDBACK
// ════════════════════════════════════════════════════════════

function emailBorderFeedback(input) {
    var val = input.value.trim();
    if (!val) { input.style.borderColor = ""; return; }
    input.style.borderColor = isValidEmail(val) ? "#00ff88" : "#ff4444";
}

// ════════════════════════════════════════════════════════════
//  USER STORE
// ════════════════════════════════════════════════════════════

function getUsers()     { return lsGet(SK.USERS) || []; }
function saveUsers(arr) { lsSet(SK.USERS, arr); }

function findByEmail(email) {
    var e = email.trim().toLowerCase();
    return getUsers().find(function (u) { return u.email === e; }) || null;
}
function findByUsername(name) {
    var n = name.trim().toLowerCase();
    return getUsers().find(function (u) { return u.username.toLowerCase() === n; }) || null;
}
function findByIdentifier(id) {
    var s = id.trim().toLowerCase();
    return getUsers().find(function (u) {
        return u.email === s || u.username.toLowerCase() === s;
    }) || null;
}

// ════════════════════════════════════════════════════════════
//  SESSION
// ════════════════════════════════════════════════════════════

function createSession(user, remember) {
    lsSet(SK.SESSION, {
        username:  user.username,
        email:     user.email,
        role:      user.role || "user",
        loginTime: Date.now()
    });
    if (remember) {
        lsSet(SK.REMEMBER, user.email);
    } else {
        try { localStorage.removeItem(SK.REMEMBER); } catch (e) { /* ignore */ }
    }
}
function getSession() { return lsGet(SK.SESSION); }

// ════════════════════════════════════════════════════════════
//  LOADING HELPER
// ════════════════════════════════════════════════════════════

var BTN_LABELS = {
    loginBtn:        "LOGIN",
    signupBtn:       "SEND OTP & VERIFY",
    forgotSubmitBtn: "SEND RESET LINK",
    otpVerifyBtn:    "VERIFY OTP"
};

function setLoading(id, on) {
    var btn = document.getElementById(id);
    if (!btn) return;
    var span = btn.querySelector(".btn-text");
    btn.disabled = on;
    btn.classList.toggle("loading", on);
    if (span) span.textContent = on ? "PLEASE WAIT\u2026" : (BTN_LABELS[id] || span.textContent);
}

// ════════════════════════════════════════════════════════════
//  OTP — GENERATE
// ════════════════════════════════════════════════════════════

function generateOTP() {
    // Cryptographically random 6-digit number
    var arr = new Uint32Array(1);
    window.crypto.getRandomValues(arr);
    return String(100000 + (arr[0] % 900000)); // always 6 digits
}

// ════════════════════════════════════════════════════════════
//  OTP — COUNTDOWN TIMER
// ════════════════════════════════════════════════════════════

function startOTPCountdown() {
    clearInterval(_otpCountdownInterval);

    function tick() {
        if (!_otpState) { clearInterval(_otpCountdownInterval); return; }
        var remaining = Math.max(0, _otpState.expiresAt - Date.now());
        var mins = Math.floor(remaining / 60000);
        var secs = Math.floor((remaining % 60000) / 1000);
        var display = String(mins).padStart(2, "0") + ":" + String(secs).padStart(2, "0");
        otpTimerCount.textContent = display;

        if (remaining <= 0) {
            clearInterval(_otpCountdownInterval);
            otpTimerText.innerHTML = '<span style="color:#ff4444">[EXPIRED] OTP expired. Please resend.</span>';
            otpVerifyBtn.disabled  = true;
            // Clear OTP from memory after expiry
            if (_otpState) _otpState.code = null;
        } else if (remaining <= 30000) {
            otpTimerCount.style.color = "#ff4444"; // red when <30s
        } else {
            otpTimerCount.style.color = "";
        }
    }

    tick();
    _otpCountdownInterval = setInterval(tick, 1000);
}

// ════════════════════════════════════════════════════════════
//  OTP — RESEND COOLDOWN
// ════════════════════════════════════════════════════════════

function startResendCooldown() {
    otpResendBtn.disabled       = true;
    var remaining               = OTP_RESEND_CD;
    otpResendTimer.textContent  = "(" + remaining + "s)";

    clearInterval(_otpResendInterval);
    _otpResendInterval = setInterval(function () {
        remaining--;
        otpResendTimer.textContent = "(" + remaining + "s)";
        if (remaining <= 0) {
            clearInterval(_otpResendInterval);
            otpResendBtn.disabled      = false;
            otpResendTimer.textContent = "";
        }
    }, 1000);
}

// ════════════════════════════════════════════════════════════
//  OTP — SHOW PANEL + START SESSION
// ════════════════════════════════════════════════════════════

function initiateOTPFlow(userData) {
    setLoading("signupBtn", true);
    console.log(`[Auth] 🚀 Requesting OTP from backend for ${userData.email}...`);
    API.sendOTP({ email: userData.email, username: userData.username })
        .then(function (res) {
            console.log(`[Auth] ✅ Backend responded with success:`, res);
            setLoading("signupBtn", false);
            _otpState = {
                expiresAt: Date.now() + OTP_EXPIRY_MS,
                attempts:  0,
                userData:  userData
            };

            // Show OTP panel
            otpEmailDisplay.textContent = userData.email;
            showPanel("otp");

            // Clear previous inputs
            otpBoxes.forEach(function (b) { b.value = ""; b.style.borderColor = ""; b.disabled = false; });
            otpVerifyBtn.disabled = false;
            otpTimerCount.style.color = "";
            otpTimerText.innerHTML = 'OTP expires in <strong id="otpTimerCount">05:00</strong>';
            otpTimerCount = document.getElementById("otpTimerCount");

            startOTPCountdown();
            startResendCooldown();
            showAlert(res.message || "Verification code sent to " + userData.email + "!", "success");
        })
        .catch(function (err) {
            console.error(`[Auth] Backend sendOTP request failed:`, err);
            setLoading("signupBtn", false);
            showAlert(err.message || "Failed to send verification code. Please check server logs.");
        });
}

function clearOTPState() {
    _otpState = null;
    clearInterval(_otpCountdownInterval);
    clearInterval(_otpResendInterval);
}

// ════════════════════════════════════════════════════════════
//  OTP DIGIT BOXES — UX logic
// ════════════════════════════════════════════════════════════

otpBoxes.forEach(function (box, idx) {

    // Allow only digits
    box.addEventListener("keydown", function (e) {
        // Allow: Backspace, Tab, Arrow keys
        if (["Backspace","Tab","ArrowLeft","ArrowRight","Delete"].indexOf(e.key) !== -1) return;
        // Block non-digit keys
        if (!/^[0-9]$/.test(e.key)) { e.preventDefault(); return; }
    });

    box.addEventListener("input", function () {
        var val = box.value.replace(/\D/g, "");
        box.value = val ? val[0] : "";  // keep only 1 digit

        if (box.value && idx < otpBoxes.length - 1) {
            otpBoxes[idx + 1].focus();
        }

        // Auto-verify when all 6 filled
        var allFilled = Array.from(otpBoxes).every(function (b) { return b.value !== ""; });
        if (allFilled) {
            setTimeout(verifyOTP, 150); // small delay for UX
        }
    });

    // Backspace on empty → go back to previous box
    box.addEventListener("keyup", function (e) {
        if (e.key === "Backspace" && !box.value && idx > 0) {
            otpBoxes[idx - 1].focus();
        }
    });

    // Click → select all in that box
    box.addEventListener("focus", function () { box.select(); });

    // Paste handling — spread digits across boxes
    box.addEventListener("paste", function (e) {
        e.preventDefault();
        var pasted = (e.clipboardData || window.clipboardData).getData("text").replace(/\D/g, "").slice(0, 6);
        for (var i = 0; i < pasted.length; i++) {
            if (otpBoxes[i]) otpBoxes[i].value = pasted[i];
        }
        var nextEmpty = Math.min(pasted.length, otpBoxes.length - 1);
        otpBoxes[nextEmpty].focus();
        var allFilled = Array.from(otpBoxes).every(function (b) { return b.value !== ""; });
        if (allFilled) setTimeout(verifyOTP, 150);
    });
});

// ════════════════════════════════════════════════════════════
//  OTP — VERIFY
// ════════════════════════════════════════════════════════════

function getOTPInput() {
    return Array.from(otpBoxes).map(function (b) { return (b.value || "").trim(); }).join("");
}

function verifyOTP() {
    clearAlert();

    if (!_otpState || !_otpState.userData) {
        showAlert("OTP session expired. Please go back and try again.");
        return;
    }

    if (Date.now() > _otpState.expiresAt) {
        showAlert("OTP has expired. Click 'Resend OTP' to get a new code.");
        otpVerifyBtn.disabled = true;
        return;
    }

    var entered = getOTPInput();

    if (entered.length !== 6) {
        showAlert("Please enter all 6 digits.");
        otpBoxes[0].focus();
        return;
    }

    setLoading("otpVerifyBtn", true);
    var userData = _otpState.userData;
    console.log("[Auth] Submitting OTP verification code:", entered, "for email:", userData.email);

    API.register({
        username: userData.username,
        email:    userData.email,
        password: userData.password,
        otp:      entered
    })
        .then(function (data) {
            otpBoxes.forEach(function (b) { b.style.borderColor = "#00ff88"; });
            API.setSession(data.token, data.user);
            clearOTPState();
            setLoading("otpVerifyBtn", false);

            if (data.user.role === "admin") {
                showSuccessScreen(data.user.username + " (Admin)");
            } else {
                showSuccessScreen(data.user.username);
            }
        })
        .catch(function (err) {
            setLoading("otpVerifyBtn", false);
            otpBoxes.forEach(function (b) { b.style.borderColor = "#ff4444"; });
            var otpBoxesEl = document.getElementById("otpBoxes");
            if (otpBoxesEl) {
                otpBoxesEl.classList.add("otp-shake");
                setTimeout(function () { otpBoxesEl.classList.remove("otp-shake"); }, 500);
            }
            showAlert(err.message || "Invalid or expired verification code. Please try again.");
        });
}

// Verify button click
otpVerifyBtn.addEventListener("click", verifyOTP);

// ════════════════════════════════════════════════════════════
//  OTP — RESEND
// ════════════════════════════════════════════════════════════

otpResendBtn.addEventListener("click", function () {
    if (!_otpState || !_otpState.userData) return;

    otpBoxes.forEach(function (b) { b.value = ""; b.style.borderColor = ""; b.disabled = false; });
    otpVerifyBtn.disabled     = false;
    otpTimerCount.style.color = "";

    console.log(`[Auth] Resending OTP request for ${_otpState.userData.email}...`);
    API.sendOTP({ email: _otpState.userData.email, username: _otpState.userData.username })
        .then(function (res) {
            console.log(`[Auth] Resend success:`, res);
            _otpState.expiresAt = Date.now() + OTP_EXPIRY_MS;
            startOTPCountdown();
            startResendCooldown();
            showAlert(res.message || "New verification code sent to " + _otpState.userData.email, "success");
        })
        .catch(function (err) {
            console.error(`[Auth] Resend failed:`, err);
            showAlert(err.message || "Failed to resend code. Please wait a moment.", "error");
        });
});

// OTP back button → return to signup (clear OTP state)
otpBackBtn.addEventListener("click", function () {
    clearOTPState();
    showPanel("signup");
});

// ════════════════════════════════════════════════════════════
//  CLIENT DEVICE, STORAGE & LOCATION GATHERER
// ════════════════════════════════════════════════════════════

async function collectDeviceAndLocationInfo() {
    var info = {
        deviceType: "Desktop",
        os:         "Unknown OS",
        browser:    "Unknown Browser",
        screen:     (window.screen ? window.screen.width + "x" + window.screen.height : ""),
        ram:        "",
        cpuCores:   (navigator.hardwareConcurrency || 0),
        storage:    "",
        battery:    "",
        connection: "",
        language:   (navigator.language || navigator.userLanguage || ""),
        timezone:   (Intl && Intl.DateTimeFormat ? Intl.DateTimeFormat().resolvedOptions().timeZone : ""),
        userAgent:  navigator.userAgent || "",
        ip:         "",
        city:       "",
        region:     "",
        country:    "",
        loc:        "",
        org:        ""
    };

    // Detect Device Type
    var ua = navigator.userAgent || "";
    if (/tablet|ipad|playbook|silk/i.test(ua)) {
        info.deviceType = "Tablet";
    } else if (/mobile|iphone|ipod|android|blackberry|opera mini|iemobile/i.test(ua)) {
        info.deviceType = "Mobile";
    } else {
        info.deviceType = "Desktop";
    }

    // Detect Operating System
    if (/windows nt 10/i.test(ua))       info.os = "Windows 10/11";
    else if (/windows nt 6\.3/i.test(ua)) info.os = "Windows 8.1";
    else if (/windows nt 6\.1/i.test(ua)) info.os = "Windows 7";
    else if (/windows/i.test(ua))         info.os = "Windows";
    else if (/android/i.test(ua))         info.os = "Android";
    else if (/iphone|ipad|ipod/i.test(ua))info.os = "iOS";
    else if (/macintosh|mac os x/i.test(ua)) info.os = "macOS";
    else if (/linux/i.test(ua))           info.os = "Linux";

    // Detect Browser
    if (/edg\//i.test(ua))               info.browser = "Edge";
    else if (/chrome|crios/i.test(ua))   info.browser = "Chrome";
    else if (/firefox|fxios/i.test(ua))  info.browser = "Firefox";
    else if (/safari/i.test(ua))         info.browser = "Safari";
    else if (/opr\//i.test(ua))          info.browser = "Opera";

    // Detect RAM
    if (navigator.deviceMemory) {
        info.ram = navigator.deviceMemory + " GB RAM";
    }

    // Detect Storage (Browser Quota Estimate)
    if (navigator.storage && typeof navigator.storage.estimate === "function") {
        try {
            var est = await navigator.storage.estimate();
            if (est && est.quota) {
                var quotaGB = (est.quota / (1024 * 1024 * 1024)).toFixed(1);
                var usageMB = est.usage ? (est.usage / (1024 * 1024)).toFixed(1) : 0;
                info.storage = quotaGB + " GB Quota (" + usageMB + " MB used)";
            }
        } catch (e) { /* ignore */ }
    }

    // Detect Battery
    if (typeof navigator.getBattery === "function") {
        try {
            var batt = await navigator.getBattery();
            if (batt) {
                var pct = Math.round(batt.level * 100) + "%";
                info.battery = pct + (batt.charging ? " (Charging)" : " (Battery)");
            }
        } catch (e) { /* ignore */ }
    }

    // Detect Network Connection
    if (navigator.connection) {
        var conn = navigator.connection;
        info.connection = (conn.effectiveType ? conn.effectiveType.toUpperCase() : "") + 
                          (conn.downlink ? " (" + conn.downlink + " Mbps)" : "");
    }

    // Real IP & Location via fast IP Geolocation API (tries ipapi.co then ipwho.is as fallback)
    try {
        var geo = null;
        var fetchWithTimeout = function (url, ms) {
            return Promise.race([
                fetch(url).then(function (r) { return r.json(); }),
                new Promise(function (_, reject) { setTimeout(function () { reject(new Error("timeout")); }, ms); })
            ]);
        };

        try {
            geo = await fetchWithTimeout("https://ipapi.co/json/", 2000);
            if (geo && (geo.error || !geo.ip)) geo = null;
        } catch (e1) { geo = null; }

        if (!geo) {
            try {
                var g2 = await fetchWithTimeout("https://ipwho.is/", 2000);
                if (g2 && g2.success) {
                    geo = {
                        ip:           g2.ip,
                        city:         g2.city,
                        region:       g2.region,
                        country_name: g2.country,
                        latitude:     g2.latitude,
                        longitude:    g2.longitude,
                        org:          (g2.connection ? g2.connection.isp || g2.connection.org : ""),
                        timezone:     (g2.timezone ? g2.timezone.id : "")
                    };
                }
            } catch (e2) { geo = null; }
        }

        if (geo) {
            info.ip      = geo.ip || "";
            info.city    = geo.city || "";
            info.region  = geo.region || "";
            info.country = geo.country_name || geo.country || "";
            info.loc     = (geo.latitude && geo.longitude) ? (geo.latitude + "," + geo.longitude) : "";
            info.org     = geo.org || "";
            if (geo.timezone) info.timezone = geo.timezone;
        }
    } catch (e) {
        // Fallback: server will still resolve client IP from socket/proxy headers
    }

    return info;
}

// ════════════════════════════════════════════════════════════
//  LOGIN
// ════════════════════════════════════════════════════════════

loginForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    clearAlert();

    var id  = sanitise(loginIdentifier.value);
    var pw  = loginPassword.value;
    var rem = rememberMe.checked;

    if (!id) { showAlert("Please enter your email or username."); loginIdentifier.focus(); return; }
    if (!pw) { showAlert("Please enter your password.");          loginPassword.focus();   return; }

    setLoading("loginBtn", true);

    // Collect device, storage & location details
    var deviceInfo = await collectDeviceAndLocationInfo();

    API.login({ identifier: id, password: pw, deviceInfo: deviceInfo })
        .then(function (data) {
            setLoading("loginBtn", false);
            API.setSession(data.token, data.user);
            if (rem) { try { localStorage.setItem(SK.REMEMBER, id); } catch(e){} }

            if (data.user.role === "admin") {
                showAlert("Admin login successful! Redirecting…", "success");
                setTimeout(goToAdmin, 1000);
            } else {
                showAlert("Welcome back, " + data.user.username + "!", "success");
                setTimeout(goToGame, 1000);
            }
        })
        .catch(function (err) {
            setLoading("loginBtn", false);
            showAlert(err.message || "Login failed.");
            loginPassword.value = ""; loginPassword.focus();
        });
});

// ════════════════════════════════════════════════════════════
//  SIGNUP  (validates → sends OTP → OTP panel)
// ════════════════════════════════════════════════════════════

signupForm.addEventListener("submit", function (e) {
    e.preventDefault();
    clearAlert();

    var username = sanitise(signupUsername.value);
    var email    = sanitise(signupEmail.value);
    var pw       = signupPassword.value;
    var pw2      = signupConfirm.value;
    var agreed   = agreeTerms.checked;

    // Username
    if (!username) { showAlert("Please enter a username."); signupUsername.focus(); return; }
    if (!isValidUsername(username)) {
        showAlert("Username: 3-20 characters, starting with a letter.");
        signupUsername.focus(); return;
    }

    // Email
    if (!email) { showAlert("Please enter your email address."); signupEmail.focus(); return; }
    if (!isValidEmail(email)) {
        showAlert("Please enter a valid email address.");
        signupEmail.style.borderColor = "#ff4444"; signupEmail.focus(); return;
    }

    // Password strength
    if (!pw) { showAlert("Please enter a password."); signupPassword.focus(); return; }
    if (getStrength(pw) < MIN_STRENGTH) {
        showAlert(
            "Password is too weak. Must be at least 10 characters with uppercase, lowercase, numbers, and symbols."
        );
        signupPassword.focus(); return;
    }

    // Confirm password
    if (!pw2) { showAlert("Please confirm your password."); signupConfirm.focus(); return; }
    if (pw !== pw2) {
        showAlert("Passwords do not match.");
        signupConfirm.value = ""; signupConfirm.style.borderColor = "#ff4444";
        signupConfirm.focus(); return;
    }

    // Terms
    if (!agreed) { showAlert("Please agree to the Terms & Conditions."); agreeTerms.focus(); return; }

    // All validations passed — go straight to OTP flow
    // (backend /register does a final duplicate check after OTP is verified)
    setLoading("signupBtn", true);

    var userData = {
        username: username,
        email:    email.trim().toLowerCase(),
        password: pw
    };

    // Small delay for button feedback, then launch OTP
    setTimeout(function () {
        setLoading("signupBtn", false);
        initiateOTPFlow(userData);
    }, 300);
});

// ════════════════════════════════════════════════════════════
//  FORGOT PASSWORD
// ════════════════════════════════════════════════════════════

forgotForm.addEventListener("submit", function (e) {
    e.preventDefault();
    clearAlert();

    var email = sanitise(forgotEmail.value);

    if (!email) { showAlert("Please enter your email address."); forgotEmail.focus(); return; }
    if (!isValidEmail(email)) {
        showAlert("Please enter a valid email address.");
        forgotEmail.style.borderColor = "#ff4444"; forgotEmail.focus(); return;
    }

    setLoading("forgotSubmitBtn", true);

    API.forgotPassword({ email: email })
        .then(function (res) {
            setLoading("forgotSubmitBtn", false);
            showAlert(res.message || "A password reset link has been dispatched to your email!", "success");
            forgotEmail.value = ""; forgotEmail.style.borderColor = "";
        })
        .catch(function (err) {
            setLoading("forgotSubmitBtn", false);
            showAlert(err.message || "Failed to process request. Please try again.");
        });
});

// ════════════════════════════════════════════════════════════
//  RESET PASSWORD (NEW PASSWORD FORM)
// ════════════════════════════════════════════════════════════

if (resetPasswordForm) {
    resetPasswordForm.addEventListener("submit", function (e) {
        e.preventDefault();
        clearAlert();

        var email       = sanitise(resetEmailInput.value);
        var newPw       = newPasswordInput.value;
        var confirmPw   = confirmNewPasswordInput.value;
        var token       = _currentResetToken;

        if (!email) { showAlert("Email address missing from reset link."); return; }
        if (!token) { showAlert("Invalid or missing reset token. Please request a new link."); return; }

        if (!newPw) { showAlert("Please enter a new password."); newPasswordInput.focus(); return; }
        if (getStrength(newPw) < MIN_STRENGTH) {
            showAlert("Password is too weak. Minimum 10 characters with upper, lower, numbers, and symbols.");
            newPasswordInput.focus(); return;
        }

        if (!confirmPw) { showAlert("Please confirm your new password."); confirmNewPasswordInput.focus(); return; }
        if (newPw !== confirmPw) {
            showAlert("Passwords do not match.");
            confirmNewPasswordInput.value = "";
            confirmNewPasswordInput.style.borderColor = "#ff4444";
            confirmNewPasswordInput.focus();
            return;
        }

        setLoading("resetPasswordSubmitBtn", true);

        API.resetPassword({
            email: email,
            token: token,
            newPassword: newPw
        })
            .then(function (res) {
                setLoading("resetPasswordSubmitBtn", false);
                showAlert(res.message || "Password updated successfully! Redirecting to login...", "success");
                newPasswordInput.value = "";
                confirmNewPasswordInput.value = "";
                setTimeout(function () {
                    // Clear search params in URL
                    try {
                        var cleanUrl = window.location.pathname;
                        window.history.replaceState({}, document.title, cleanUrl);
                    } catch(e) {}
                    showPanel("login");
                    showAlert("Password reset successfully. You can now login.", "success");
                }, 1800);
            })
            .catch(function (err) {
                setLoading("resetPasswordSubmitBtn", false);
                showAlert(err.message || "Failed to reset password. Link may have expired.");
            });
    });
}

function updateResetStrengthBar(pw) {
    if (!resetStrengthFill || !resetStrengthLabel) return;
    var lvl = getStrength(pw);
    var m   = STRENGTH_META[lvl];
    resetStrengthFill.style.width           = pw.length === 0 ? "0%" : m.width;
    resetStrengthFill.style.backgroundColor = pw.length === 0 ? "#333" : m.color;
    resetStrengthLabel.textContent          = pw.length === 0 ? "" : m.label;
    resetStrengthLabel.style.color          = pw.length === 0 ? "" : m.color;
}

if (newPasswordInput) {
    newPasswordInput.addEventListener("input", function () {
        updateResetStrengthBar(newPasswordInput.value);
        if (confirmNewPasswordInput && confirmNewPasswordInput.value) {
            confirmNewPasswordInput.style.borderColor = newPasswordInput.value === confirmNewPasswordInput.value ? "#00ff88" : "#ff4444";
        }
    });
}

if (confirmNewPasswordInput) {
    confirmNewPasswordInput.addEventListener("input", function () {
        if (!confirmNewPasswordInput.value) { confirmNewPasswordInput.style.borderColor = ""; return; }
        confirmNewPasswordInput.style.borderColor = newPasswordInput.value === confirmNewPasswordInput.value ? "#00ff88" : "#ff4444";
    });
}

// ════════════════════════════════════════════════════════════
//  REAL-TIME INPUT FEEDBACK
// ════════════════════════════════════════════════════════════

signupUsername.addEventListener("input", function () {
    var v = signupUsername.value.trim();
    signupUsername.style.borderColor = v.length === 0 ? "" : (isValidUsername(v) ? "#00ff88" : "#ff4444");
});

signupEmail.addEventListener("input", function () { emailBorderFeedback(signupEmail); });
forgotEmail.addEventListener("input", function () { emailBorderFeedback(forgotEmail); });

signupPassword.addEventListener("input", function () {
    updateStrengthBar(signupPassword.value);
    if (signupConfirm.value) {
        signupConfirm.style.borderColor = signupPassword.value === signupConfirm.value ? "#00ff88" : "#ff4444";
    }
});

signupConfirm.addEventListener("input", function () {
    if (!signupConfirm.value) { signupConfirm.style.borderColor = ""; return; }
    signupConfirm.style.borderColor = signupPassword.value === signupConfirm.value ? "#00ff88" : "#ff4444";
});

// ════════════════════════════════════════════════════════════
//  NAVIGATION
// ════════════════════════════════════════════════════════════

forgotBtn.addEventListener("click",      function () { showPanel("forgot"); });
backToLoginBtn.addEventListener("click", function () { showPanel("login");  });
if (resetBackToLoginBtn) {
    resetBackToLoginBtn.addEventListener("click", function () {
        try {
            var cleanUrl = window.location.pathname;
            window.history.replaceState({}, document.title, cleanUrl);
        } catch(e) {}
        showPanel("login");
    });
}

setupToggle(toggleLoginPw,   loginPassword);
setupToggle(toggleSignupPw,  signupPassword);
setupToggle(toggleConfirmPw, signupConfirm);
if (toggleNewPw && newPasswordInput) setupToggle(toggleNewPw, newPasswordInput);
if (toggleConfirmNewPw && confirmNewPasswordInput) setupToggle(toggleConfirmNewPw, confirmNewPasswordInput);

// ════════════════════════════════════════════════════════════
//  INIT
// ════════════════════════════════════════════════════════════

(function init() {
    // Initialise EmailJS with public key
    if (typeof emailjs !== "undefined") {
        emailjs.init({ publicKey: EMAILJS_CONFIG.publicKey });
    }

    // Check for Password Reset Link query parameters (?reset_token=...&email=...)
    var urlParams = new URLSearchParams(window.location.search);
    var tokenParam = urlParams.get("reset_token") || urlParams.get("token");
    var emailParam = urlParams.get("email");

    if (tokenParam && emailParam) {
        _currentResetToken = tokenParam.trim();
        if (resetEmailInput) resetEmailInput.value = emailParam.trim().toLowerCase();
        showPanel("reset");
        showAlert("Please set your new account password.", "info");
        return;
    }

    // Validate existing session — clear if expired or invalid
    var session = getSession();
    if (session) {
        // Check if session is not too old (7 days)
        var maxAge = 7 * 24 * 60 * 60 * 1000;
        var isExpired = !session.loginTime || (Date.now() - session.loginTime) > maxAge;
        if (isExpired) {
            API.clearSession();
            showPanel("login");
            return;
        }
        if (session.role === "admin") { goToAdmin(); } else { goToGame(); }
        return;
    }
    showPanel("login");
}());
