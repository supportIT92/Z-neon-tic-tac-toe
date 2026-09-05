// ============================================================
// NEON GAMING — Auth Script
// Login · Signup (with OTP email verification) · Forgot Password
// EmailJS v4 · localStorage user store · Admin role support
// ============================================================

"use strict";

// ════════════════════════════════════════════════════════════
//  ⚙️  EMAILJS CONFIG  — Replace with your own credentials
//  1. Sign up free at https://www.emailjs.com
//  2. Add a Gmail/Outlook service  → copy Service ID
//  3. Create an email template     → copy Template ID
//     Template variables used:
//       {{to_email}}   — recipient's email
//       {{to_name}}    — recipient's username
//       {{otp_code}}   — the 6-digit OTP
//       {{app_name}}   — "Neon Gaming"
//  4. Account page                 → copy Public Key
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
    alertBox.textContent = msg;
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
    loginForm.classList.add("hidden");
    signupForm.classList.add("hidden");
    forgotForm.classList.add("hidden");
    otpPanel.classList.add("hidden");
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

function goToGame()  { window.location.href = "index.html"; }
function goToAdmin() { window.location.href = "admin.html"; }

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
//  OTP — SEND VIA EMAILJS
// ════════════════════════════════════════════════════════════

function sendOTPEmail(toEmail, toName, otpCode, onSuccess, onError) {
    // Check if EmailJS is configured
    if (EMAILJS_CONFIG.publicKey === "YOUR_PUBLIC_KEY") {
        // ── DEMO MODE — show OTP in alert (for testing without EmailJS) ──
        console.log("[DEMO] OTP for " + toEmail + " → " + otpCode);
        showAlert(
            "📧 DEMO MODE: Your OTP is " + otpCode +
            "\n(Configure EmailJS credentials in auth.js to send real emails.)",
            "info"
        );
        if (onSuccess) onSuccess();
        return;
    }

    emailjs.send(
        EMAILJS_CONFIG.serviceId,
        EMAILJS_CONFIG.templateId,
        {
            to_email:  toEmail,
            to_name:   toName,
            name:      toName,
            otp_code:  otpCode,
            app_name:  "Neon Gaming"
        },
        { publicKey: EMAILJS_CONFIG.publicKey }
    ).then(function () {
        if (onSuccess) onSuccess();
    }, function (err) {
        console.error("EmailJS error:", err);
        if (onError) onError(err);
    });
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
            otpTimerText.innerHTML = '<span style="color:#ff4444">⏰ OTP expired. Please resend.</span>';
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
    var code = generateOTP();

    _otpState = {
        code:      code,
        expiresAt: Date.now() + OTP_EXPIRY_MS,
        attempts:  0,
        userData:  userData
    };

    // Show OTP panel
    otpEmailDisplay.textContent = userData.email;
    showPanel("otp");

    // Clear previous inputs
    otpBoxes.forEach(function (b) { b.value = ""; b.style.borderColor = ""; });
    otpVerifyBtn.disabled = false;
    otpTimerCount.style.color = "";
    otpTimerText.innerHTML = 'OTP expires in <strong id="otpTimerCount">05:00</strong>';
    // Re-grab reference after innerHTML reset
    otpTimerCount = document.getElementById("otpTimerCount");

    startOTPCountdown();
    startResendCooldown();

    // Send the email
    sendOTPEmail(
        userData.email,
        userData.username,
        code,
        function () {
            // Only show "sent" message if real EmailJS (demo mode shows differently)
            if (EMAILJS_CONFIG.publicKey !== "YOUR_PUBLIC_KEY") {
                showAlert("📧 OTP sent to " + userData.email + ". Check your inbox!", "success");
            }
        },
        function () {
            showAlert("❌ Failed to send OTP email. Check your internet connection and try again.");
            // Go back to signup on send failure
            showPanel("signup");
            clearOTPState();
        }
    );
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
    return Array.from(otpBoxes).map(function (b) { return b.value; }).join("");
}

function verifyOTP() {
    clearAlert();

    if (!_otpState) {
        showAlert("❌ OTP session expired. Please go back and try again.");
        return;
    }

    // Check expiry
    if (Date.now() > _otpState.expiresAt || !_otpState.code) {
        showAlert("⏰ OTP has expired. Click 'Resend OTP' to get a new one.");
        otpVerifyBtn.disabled = true;
        return;
    }

    var entered = getOTPInput();

    if (entered.length !== 6) {
        showAlert("⚠️ Please enter all 6 digits.");
        otpBoxes[0].focus();
        return;
    }

    // Max 5 attempts
    _otpState.attempts++;
    if (_otpState.attempts > 5) {
        showAlert("🚫 Too many incorrect attempts. Please go back and restart signup.");
        otpVerifyBtn.disabled = true;
        otpBoxes.forEach(function (b) { b.disabled = true; b.style.borderColor = "#ff4444"; });
        clearOTPState();
        return;
    }

    if (entered !== _otpState.code) {
        // Wrong OTP
        otpBoxes.forEach(function (b) { b.style.borderColor = "#ff4444"; });
        // Shake animation
        document.getElementById("otpBoxes").classList.add("otp-shake");
        setTimeout(function () {
            document.getElementById("otpBoxes").classList.remove("otp-shake");
        }, 500);

        var left = 5 - _otpState.attempts;
        showAlert("❌ Incorrect OTP. " + left + " attempt" + (left !== 1 ? "s" : "") + " remaining.");
        // Clear boxes & focus first
        otpBoxes.forEach(function (b) { b.value = ""; });
        otpBoxes[0].focus();
        return;
    }

    // ✅ OTP Correct!
    otpBoxes.forEach(function (b) { b.style.borderColor = "#00ff88"; });
    setLoading("otpVerifyBtn", true);

    // Save user to localStorage
    var users    = getUsers();
    var userData = _otpState.userData;
    users.push(userData);
    saveUsers(users);
    createSession(userData, false);

    clearOTPState();

    setTimeout(function () {
        setLoading("otpVerifyBtn", false);
        if (userData.role === "admin") {
            showSuccessScreen(userData.username + " (Admin)");
        } else {
            showSuccessScreen(userData.username);
        }
    }, 600);
}

// Verify button click
otpVerifyBtn.addEventListener("click", verifyOTP);

// ════════════════════════════════════════════════════════════
//  OTP — RESEND
// ════════════════════════════════════════════════════════════

otpResendBtn.addEventListener("click", function () {
    if (!_otpState || !_otpState.userData) return;

    // Generate new OTP, reset expiry & attempts
    var newCode         = generateOTP();
    _otpState.code      = newCode;
    _otpState.expiresAt = Date.now() + OTP_EXPIRY_MS;
    _otpState.attempts  = 0;

    // Reset UI
    otpBoxes.forEach(function (b) { b.value = ""; b.style.borderColor = ""; b.disabled = false; });
    otpVerifyBtn.disabled   = false;
    otpTimerCount.style.color = "";

    startOTPCountdown();
    startResendCooldown();

    sendOTPEmail(
        _otpState.userData.email,
        _otpState.userData.username,
        newCode,
        function () {
            if (EMAILJS_CONFIG.publicKey !== "YOUR_PUBLIC_KEY") {
                showAlert("📧 New OTP sent to " + _otpState.userData.email, "success");
            }
        },
        function () {
            showAlert("❌ Failed to resend OTP. Check your connection.");
        }
    );
});

// OTP back button → return to signup (clear OTP state)
otpBackBtn.addEventListener("click", function () {
    clearOTPState();
    showPanel("signup");
});

// ════════════════════════════════════════════════════════════
//  LOGIN
// ════════════════════════════════════════════════════════════

loginForm.addEventListener("submit", function (e) {
    e.preventDefault();
    clearAlert();

    var id  = sanitise(loginIdentifier.value);
    var pw  = loginPassword.value;
    var rem = rememberMe.checked;

    if (!id) { showAlert("⚠️ Please enter your email or username."); loginIdentifier.focus(); return; }
    if (!pw) { showAlert("⚠️ Please enter your password.");          loginPassword.focus();   return; }

    setLoading("loginBtn", true);

    setTimeout(function () {
        var user = findByIdentifier(id);

        if (!user) {
            showAlert("❌ No account found with that email or username.");
            setLoading("loginBtn", false); loginIdentifier.focus(); return;
        }
        if (user.banned) {
            showAlert("🚫 This account has been banned. Contact support.");
            setLoading("loginBtn", false); return;
        }
        if (user.passwordHash !== simpleHash(pw)) {
            showAlert("❌ Incorrect password. Please try again.");
            setLoading("loginBtn", false);
            loginPassword.value = ""; loginPassword.focus(); return;
        }

        // Update last login
        var users = getUsers();
        users.forEach(function (u) { if (u.email === user.email) u.lastLogin = Date.now(); });
        saveUsers(users);
        createSession(user, rem);

        if (user.role === "admin") {
            showAlert("✅ Admin login successful! Redirecting…", "success");
            setTimeout(function () { setLoading("loginBtn", false); goToAdmin(); }, 1000);
        } else {
            showAlert("✅ Welcome back, " + user.username + "! 🎮", "success");
            setTimeout(function () { setLoading("loginBtn", false); goToGame(); }, 1000);
        }
    }, 500);
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
    if (!username) { showAlert("⚠️ Please enter a username."); signupUsername.focus(); return; }
    if (!isValidUsername(username)) {
        showAlert("⚠️ Username: 3-20 chars, start with a letter, only letters/digits/underscores.");
        signupUsername.focus(); return;
    }

    // Email
    if (!email) { showAlert("⚠️ Please enter your email address."); signupEmail.focus(); return; }
    if (!isValidEmail(email)) {
        showAlert("❌ Invalid email. Use a real address like user@gmail.com");
        signupEmail.style.borderColor = "#ff4444"; signupEmail.focus(); return;
    }

    // Password strength
    if (!pw) { showAlert("⚠️ Please enter a password."); signupPassword.focus(); return; }
    if (getStrength(pw) < MIN_STRENGTH) {
        showAlert(
            "🔒 Password too weak! Need at least \"Good\" level.\n" +
            "Use 10+ chars with uppercase, lowercase, number & special char (!@#$%)."
        );
        signupPassword.focus(); return;
    }

    // Confirm password
    if (!pw2) { showAlert("⚠️ Please confirm your password."); signupConfirm.focus(); return; }
    if (pw !== pw2) {
        showAlert("❌ Passwords do not match.");
        signupConfirm.value = ""; signupConfirm.style.borderColor = "#ff4444";
        signupConfirm.focus(); return;
    }

    // Terms
    if (!agreed) { showAlert("⚠️ Please agree to the Terms & Conditions."); agreeTerms.focus(); return; }

    // Duplicate check
    if (findByUsername(username)) {
        showAlert("❌ Username already taken."); signupUsername.focus(); return;
    }
    if (findByEmail(email)) {
        showAlert("❌ An account with this email already exists. Try logging in.");
        signupEmail.focus(); return;
    }

    // All validations passed — prepare user data & send OTP
    setLoading("signupBtn", true);

    var users    = getUsers();
    var role     = users.length === 0 ? "admin" : "user";

    var userData = {
        username:     username,
        email:        email.trim().toLowerCase(),
        passwordHash: simpleHash(pw),
        role:         role,
        banned:       false,
        createdAt:    Date.now(),
        lastLogin:    Date.now()
    };

    setLoading("signupBtn", false);

    // Start OTP flow — account saved ONLY after OTP verified
    initiateOTPFlow(userData);
});

// ════════════════════════════════════════════════════════════
//  FORGOT PASSWORD
// ════════════════════════════════════════════════════════════

forgotForm.addEventListener("submit", function (e) {
    e.preventDefault();
    clearAlert();

    var email = sanitise(forgotEmail.value);

    if (!email) { showAlert("⚠️ Please enter your email address."); forgotEmail.focus(); return; }
    if (!isValidEmail(email)) {
        showAlert("❌ Invalid email. Example: user@gmail.com");
        forgotEmail.style.borderColor = "#ff4444"; forgotEmail.focus(); return;
    }

    setLoading("forgotSubmitBtn", true);

    setTimeout(function () {
        setLoading("forgotSubmitBtn", false);
        showAlert("📧 If that email is registered, a reset link has been sent!", "success");
        forgotEmail.value = ""; forgotEmail.style.borderColor = "";
    }, 700);
});

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

setupToggle(toggleLoginPw,   loginPassword);
setupToggle(toggleSignupPw,  signupPassword);
setupToggle(toggleConfirmPw, signupConfirm);

// ════════════════════════════════════════════════════════════
//  INIT
// ════════════════════════════════════════════════════════════

(function init() {
    // Init EmailJS if configured
    if (typeof emailjs !== "undefined" && EMAILJS_CONFIG.publicKey !== "YOUR_PUBLIC_KEY") {
        emailjs.init({ publicKey: EMAILJS_CONFIG.publicKey });
    }

    var session = getSession();
    if (session) {
        if (session.role === "admin") { goToAdmin(); } else { goToGame(); }
        return;
    }
    showPanel("login");
}());
