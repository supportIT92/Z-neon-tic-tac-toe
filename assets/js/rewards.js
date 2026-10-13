/* ========================================================
   NEON CYBER REWARDS & ACHIEVEMENTS ENGINE
   - Daily Lucky Wheel (24hr spin, rewards XP & titles)
   - Realtime Cyber Activity Feed Ticker
   - Unlockable Cyber Trophies / Achievements
======================================================== */

(function () {
    "use strict";

    // ── 1. ACHIEVEMENTS SYSTEM ─────────────────────────────
    var ACHIEVEMENTS = [
        { id: "first_blood", title: "First Blood", desc: "Won your first game in the Arcade", icon: "⚔️", xp: 50 },
        { id: "tactician", title: "Cyber Tactician", desc: "Defeated the AI in Connect 4 or Tic Tac Toe", icon: "🧠", xp: 75 },
        { id: "snake_pro", title: "Orb Glutton", desc: "Reached 100+ points in Cyber Snake", icon: "🐍", xp: 100 },
        { id: "pong_ace", title: "Speed Demon", desc: "Scored 7 points in Cyber Pong", icon: "⚡", xp: 100 },
        { id: "daily_spin", title: "High Roller", desc: "Spun the Daily Cyber Wheel", icon: "🎰", xp: 40 }
    ];

    function getUnlockedAchievements() {
        try {
            var raw = localStorage.getItem("neon_achievements");
            return raw ? JSON.parse(raw) : [];
        } catch (e) { return []; }
    }

    function unlockAchievement(id) {
        var unlocked = getUnlockedAchievements();
        if (unlocked.indexOf(id) !== -1) return; // already unlocked

        var ach = null;
        for (var i = 0; i < ACHIEVEMENTS.length; i++) {
            if (ACHIEVEMENTS[i].id === id) { ach = ACHIEVEMENTS[i]; break; }
        }
        if (!ach) return;

        unlocked.push(id);
        try { localStorage.setItem("neon_achievements", JSON.stringify(unlocked)); } catch(e) {}

        // Add XP
        addPlayerXp(ach.xp);

        // Show Toast Notification
        showAchievementToast(ach);
    }

    function addPlayerXp(amount) {
        var session = null;
        try {
            var raw = localStorage.getItem("neonGaming_session");
            if (raw) session = JSON.parse(raw);
        } catch(e) {}
        var username = (session && session.username) || "guest";
        var xpKey = "neonArcade_xp_" + username;
        var current = 50;
        try {
            var saved = localStorage.getItem(xpKey);
            if (saved) current = parseInt(saved, 10);
            current += amount;
            localStorage.setItem(xpKey, current);
        } catch(e) {}

        // Refresh badges in DOM if present
        var lvlEl = document.getElementById("hubLevelBadge");
        var xpEl = document.getElementById("hubXpCount");
        if (lvlEl) lvlEl.textContent = "LVL " + Math.max(1, Math.floor(current / 100) + 1);
        if (xpEl) xpEl.textContent = current;
    }

    function showAchievementToast(ach) {
        var toast = document.createElement("div");
        toast.className = "cyber-achievement-toast";
        toast.innerHTML =
            '<div class="toast-icon">' + ach.icon + '</div>' +
            '<div class="toast-content">' +
                '<strong>TROPHY UNLOCKED!</strong>' +
                '<p>' + ach.title + ' (+' + ach.xp + ' XP)</p>' +
            '</div>';
        document.body.appendChild(toast);

        setTimeout(function () { toast.classList.add("show"); }, 50);
        setTimeout(function () {
            toast.classList.remove("show");
            setTimeout(function () { toast.remove(); }, 400);
        }, 4000);
    }

    // ── 2. DAILY LUCKY WHEEL ────────────────────────────────
    var PRIZES = [
        { label: "+50 XP", xp: 50, color: "#00f7ff" },
        { label: "Rare Badge", xp: 120, color: "#ff2bd6" },
        { label: "+25 XP", xp: 25, color: "#10b981" },
        { label: "Cyber Title", xp: 80, color: "#ffd700" },
        { label: "+100 XP", xp: 100, color: "#8b5cf6" },
        { label: "+75 XP", xp: 75, color: "#f43f5e" }
    ];

    function canSpinToday() {
        try {
            var lastSpin = localStorage.getItem("neon_last_spin");
            if (!lastSpin) return true;
            var diff = Date.now() - parseInt(lastSpin, 10);
            return diff >= 24 * 60 * 60 * 1000;
        } catch(e) { return true; }
    }

    function spinWheel(onComplete) {
        if (!canSpinToday()) {
            alert("⏰ You've already claimed today's lucky spin! Check back tomorrow.");
            return;
        }

        var prizeIndex = Math.floor(Math.random() * PRIZES.length);
        var prize = PRIZES[prizeIndex];

        try {
            localStorage.setItem("neon_last_spin", Date.now());
        } catch(e) {}

        addPlayerXp(prize.xp);
        unlockAchievement("daily_spin");

        if (typeof onComplete === "function") {
            onComplete(prize, prizeIndex);
        }
    }

    // ── 3. LIVE ACTIVITY TICKER ────────────────────────────
    var MOCK_ACTIVITIES = [
        "⚡ Player @Alex won a battle in Tic Tac Toe!",
        "🔴 @CyberNinja connected 4 tokens vs Cyber AI!",
        "🐍 @Kavya reached 260 points in Cyber Snake!",
        "🏓 @Viper struck an ace in Cyber Pong!",
        "🌟 @Rohit reached LVL 3 in Neon Arcade!",
        "🎰 @Shadow unlocked the High Roller trophy!"
    ];

    function initTicker() {
        var tickerEl = document.getElementById("cyberTickerContent");
        if (!tickerEl) return;

        var fullText = MOCK_ACTIVITIES.concat(MOCK_ACTIVITIES).join(" &nbsp;&nbsp;&nbsp;•&nbsp;&nbsp;&nbsp; ");
        tickerEl.innerHTML = fullText;
    }

    window.NeonRewards = {
        unlockAchievement: unlockAchievement,
        getUnlockedAchievements: getUnlockedAchievements,
        achievementsList: ACHIEVEMENTS,
        canSpinToday: canSpinToday,
        spinWheel: spinWheel,
        prizes: PRIZES,
        initTicker: initTicker
    };

    // Auto-init ticker if on page
    document.addEventListener("DOMContentLoaded", initTicker);
})();
