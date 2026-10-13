/* ========================================================
   NEON THEME SHIFTER
   Realtime Accent Switcher: Cyber Cyan, Matrix Green,
   Crimson Blade, Neon Gold, Synthwave Violet
======================================================== */

(function () {
    "use strict";

    var THEMES = {
        cyan: {
            "--cyan": "#00f7ff",
            "--pink": "#ff2bd6",
            "--glow-orb": "#00f7ff"
        },
        matrix: {
            "--cyan": "#10b981",
            "--pink": "#00f7ff",
            "--glow-orb": "#10b981"
        },
        crimson: {
            "--cyan": "#ff3366",
            "--pink": "#ffaa00",
            "--glow-orb": "#ff3366"
        },
        gold: {
            "--cyan": "#ffd700",
            "--pink": "#ff5722",
            "--glow-orb": "#ffd700"
        },
        synthwave: {
            "--cyan": "#c084fc",
            "--pink": "#f43f5e",
            "--glow-orb": "#8b5cf6"
        }
    };

    function applyTheme(name) {
        var theme = THEMES[name] || THEMES.cyan;
        var root = document.documentElement;
        for (var prop in theme) {
            root.style.setProperty(prop, theme[prop]);
        }
        try {
            localStorage.setItem("neon_color_theme", name);
        } catch(e) {}

        // Update active badge in UI
        var buttons = document.querySelectorAll(".theme-color-chip");
        for (var i = 0; i < buttons.length; i++) {
            buttons[i].classList.toggle("active", buttons[i].dataset.theme === name);
        }
    }

    // Auto-load on script load
    var saved = "cyan";
    try {
        saved = localStorage.getItem("neon_color_theme") || "cyan";
    } catch(e) {}
    applyTheme(saved);

    window.NeonThemeShifter = {
        apply: applyTheme,
        current: function() { return saved; }
    };
})();
