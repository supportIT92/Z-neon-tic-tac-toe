// ═══════════════════════════════════════════════════════════
// UTIL: Email sender via Brevo (Sendinblue) REST API + Nodemailer Fallback
// ═══════════════════════════════════════════════════════════

const https      = require("https");
const nodemailer = require("nodemailer");

/**
 * Returns RFC 2822 compliant date string in Indian Standard Time (+0530).
 * e.g., "Thu, 08 Oct 2026 17:20:00 +0530"
 */
function getRfc2822DateIST() {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const now = new Date();
    // IST = UTC + 5 hours 30 minutes
    const istMs = now.getTime() + (5.5 * 60 * 60 * 1000);
    const ist = new Date(istMs);

    const dayName = days[ist.getUTCDay()];
    const day = String(ist.getUTCDate()).padStart(2, "0");
    const month = months[ist.getUTCMonth()];
    const year = ist.getUTCFullYear();
    const hours = String(ist.getUTCHours()).padStart(2, "0");
    const minutes = String(ist.getUTCMinutes()).padStart(2, "0");
    const seconds = String(ist.getUTCSeconds()).padStart(2, "0");

    return `${dayName}, ${day} ${month} ${year} ${hours}:${minutes}:${seconds} +0530`;
}

/**
 * Sends transactional email directly through Brevo's HTTPS REST API.
 * Passes explicit RFC 2822 Date header (+0530 IST) and custom metadata.
 */
function sendViaBrevoApi({ toEmail, toName, subject, html }) {
    return new Promise((resolve, reject) => {
        const apiKey = (process.env.BREVO_API_KEY || process.env.BREVO_SMTP_KEY || "").trim();
        const senderEmail = (process.env.BREVO_FROM_EMAIL || "supportit92@gmail.com").trim();
        const senderName  = (process.env.BREVO_FROM_NAME || "Neon Gaming").trim();
        const dateHeader  = getRfc2822DateIST();

        if (!apiKey) {
            return reject(new Error("BREVO_API_KEY / BREVO_SMTP_KEY is not configured in .env"));
        }

        const payload = JSON.stringify({
            sender: {
                name: senderName,
                email: senderEmail
            },
            to: [
                {
                    email: toEmail,
                    name: toName || "Player"
                }
            ],
            subject: subject,
            htmlContent: html,
            headers: {
                "Date": dateHeader,
                "X-Mailer": "NeonGaming-Security/2.0",
                "X-TimeZone": "Asia/Kolkata (IST)"
            }
        });

        const req = https.request({
            hostname: "api.brevo.com",
            port: 443,
            path: "/v3/smtp/email",
            method: "POST",
            headers: {
                "api-key": apiKey,
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Content-Length": Buffer.byteLength(payload)
            },
            timeout: 15000
        }, (res) => {
            let data = "";
            res.on("data", chunk => data += chunk);
            res.on("end", () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        const parsed = JSON.parse(data);
                        console.log(`[Email] ✅ Dispatched via Brevo API: MessageId ${parsed.messageId || "OK"} to ${toEmail}`);
                        resolve(parsed);
                    } catch {
                        resolve({ success: true });
                    }
                } else {
                    reject(new Error(`Brevo API returned HTTP ${res.statusCode}: ${data}`));
                }
            });
        });

        req.on("error", (err) => reject(err));
        req.on("timeout", () => {
            req.destroy();
            reject(new Error("Brevo API request timed out"));
        });

        req.write(payload);
        req.end();
    });
}

// Nodemailer SMTP fallback transporter
const transporter = nodemailer.createTransport({
    host:   "smtp-relay.brevo.com",
    port:   587,
    secure: false,
    auth: {
        user: process.env.BREVO_SMTP_USER || "ba95b4001@smtp-brevo.com",
        pass: process.env.BREVO_SMTP_KEY  || process.env.BREVO_API_KEY
    }
});

/**
 * Generic dispatcher: tries Brevo REST API first, then falls back to Nodemailer SMTP.
 */
async function dispatchEmail({ toEmail, toName, subject, html }) {
    const dateHeader = getRfc2822DateIST();
    try {
        return await sendViaBrevoApi({ toEmail, toName, subject, html });
    } catch (apiErr) {
        console.warn(`[Email Warning] Brevo REST API failed (${apiErr.message}). Trying SMTP fallback...`);
        return transporter.sendMail({
            from:    `"${process.env.BREVO_FROM_NAME || "Neon Gaming"}" <${process.env.BREVO_FROM_EMAIL || "supportit92@gmail.com"}>`,
            to:      toEmail,
            subject: subject,
            html:    html,
            headers: {
                "Date": dateHeader,
                "X-Mailer": "NeonGaming-Security/2.0",
                "X-TimeZone": "Asia/Kolkata (IST)"
            }
        });
    }
}

// ── Send OTP email (Redesigned Cyberpunk Gaming Format) ────────
const sendOTPEmail = async (toEmail, toName, otpCode) => {
    const now = new Date();
    const istTime = now.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true });
    const istExpire = new Date(now.getTime() + 5 * 60 * 1000).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true });
    const istDate = now.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" });

    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Neon Gaming Verification</title>
      <style>
        body { margin: 0; padding: 0; background-color: #050814; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #f1f5f9; }
        .wrapper { width: 100%; table-layout: fixed; background-color: #050814; padding: 40px 10px; }
        .main { max-width: 520px; margin: 0 auto; background: #0c1122; border-radius: 16px; border: 1px solid #1e293b; overflow: hidden; box-shadow: 0 15px 45px rgba(0, 247, 255, 0.12); }
        .accent-bar { height: 4px; background: linear-gradient(90deg, #00f7ff 0%, #ff007f 100%); }
        .content { padding: 36px 32px; }
        .logo-wrap { text-align: center; margin-bottom: 24px; }
        .logo-title { font-size: 26px; font-weight: 900; letter-spacing: 5px; color: #00f7ff; text-transform: uppercase; margin: 0; text-shadow: 0 0 15px rgba(0, 247, 255, 0.4); }
        .logo-sub { font-size: 11px; letter-spacing: 3px; color: #64748b; margin-top: 6px; text-transform: uppercase; }
        .time-box { background: rgba(0, 247, 255, 0.05); border: 1px solid rgba(0, 247, 255, 0.22); border-radius: 10px; padding: 12px 16px; margin: 20px 0 24px; }
        .time-header { font-size: 11px; font-weight: 700; color: #00f7ff; text-transform: uppercase; letter-spacing: 1px; }
        .time-detail { font-size: 13px; color: #e2e8f0; margin-top: 4px; }
        .greeting { font-size: 16px; color: #f8fafc; margin: 0 0 12px; }
        .desc { font-size: 14px; color: #94a3b8; line-height: 1.6; margin: 0 0 24px; }
        .otp-container { background: #050814; border: 2px dashed #00f7ff; border-radius: 12px; padding: 24px 16px; text-align: center; margin: 24px 0; }
        .otp-badge { font-size: 10px; letter-spacing: 3px; color: #64748b; text-transform: uppercase; font-weight: 700; margin-bottom: 10px; }
        .otp-digits { font-family: 'Courier New', Courier, monospace; font-size: 44px; font-weight: 900; letter-spacing: 14px; color: #00f7ff; text-shadow: 0 0 25px rgba(0, 247, 255, 0.6); margin-left: 14px; }
        .otp-expiry { font-size: 12px; color: #cbd5e1; margin-top: 10px; }
        .security-box { background: rgba(255, 255, 255, 0.02); border-left: 3px solid #00f7ff; border-radius: 0 8px 8px 0; padding: 12px 14px; margin-top: 24px; }
        .security-title { font-size: 12px; font-weight: 700; color: #e2e8f0; margin-bottom: 4px; }
        .security-text { font-size: 12px; color: #64748b; line-height: 1.5; margin: 0; }
        .footer { padding: 24px 32px; background: #070a16; border-top: 1px solid #1e293b; text-align: center; font-size: 11px; color: #475569; }
        .footer a { color: #00f7ff; text-decoration: none; }
      </style>
    </head>
    <body>
      <div class="wrapper">
        <div class="main">
          <div class="accent-bar"></div>
          <div class="content">
            <div class="logo-wrap">
              <h1 class="logo-title">⚡ NEON GAMING ⚡</h1>
              <div class="logo-sub">Play · Challenge · Win</div>
            </div>

            <div class="time-box">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td class="time-header">🇮🇳 Indian Standard Time (IST)</td>
                  <td align="right" style="font-size:11px;color:#94a3b8;">📅 ${istDate}</td>
                </tr>
                <tr>
                  <td class="time-detail" style="padding-top:4px;">
                    Sent at: <strong style="color:#00f7ff;">${istTime} IST</strong>
                  </td>
                  <td align="right" class="time-detail" style="padding-top:4px;">
                    Valid until: <strong style="color:#ff007f;">${istExpire} IST</strong>
                  </td>
                </tr>
              </table>
            </div>

            <p class="greeting">Hello <strong>${toName}</strong>,</p>
            <p class="desc">
              Your one-time security verification code is ready. Enter this code on the website to activate your account and jump into the game.
            </p>

            <div class="otp-container">
              <div class="otp-badge">One-Time Verification Code</div>
              <div class="otp-digits">${otpCode}</div>
              <div class="otp-expiry">⏱️ Valid for <strong>5 minutes</strong> (Expires at <strong>${istExpire} IST</strong>)</div>
            </div>

            <div class="security-box">
              <div class="security-title">🛡️ Security Tip</div>
              <p class="security-text">
                Never share this code with anyone. Neon Gaming staff will never ask for your verification code. If you did not request this, you can safely ignore this email.
              </p>
            </div>
          </div>

          <div class="footer">
            <p style="margin:0 0 6px 0;">© 2026 Neon Gaming Arena · All rights reserved.</p>
            <p style="margin:0;">Dispatched in Indian Standard Time (Asia/Kolkata) · Do not reply to this email.</p>
          </div>
        </div>
      </div>
    </body>
    </html>`;

    return dispatchEmail({
        toEmail,
        toName,
        subject: `${otpCode} — Neon Gaming Verification Code [${istTime} IST]`,
        html
    });
};

// ── Send Password Reset OTP email (Redesigned Neon Pink Theme) ─
const sendPasswordResetEmail = async (toEmail, toName, otpCode) => {
    const now = new Date();
    const istTime = now.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true });
    const istExpire = new Date(now.getTime() + 5 * 60 * 1000).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true });
    const istDate = now.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" });

    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Neon Gaming Password Reset</title>
      <style>
        body { margin: 0; padding: 0; background-color: #050814; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #f1f5f9; }
        .wrapper { width: 100%; table-layout: fixed; background-color: #050814; padding: 40px 10px; }
        .main { max-width: 520px; margin: 0 auto; background: #0c1122; border-radius: 16px; border: 1px solid #1e293b; overflow: hidden; box-shadow: 0 15px 45px rgba(255, 0, 127, 0.12); }
        .accent-bar { height: 4px; background: linear-gradient(90deg, #ff007f 0%, #00f7ff 100%); }
        .content { padding: 36px 32px; }
        .logo-wrap { text-align: center; margin-bottom: 24px; }
        .logo-title { font-size: 26px; font-weight: 900; letter-spacing: 5px; color: #ff007f; text-transform: uppercase; margin: 0; text-shadow: 0 0 15px rgba(255, 0, 127, 0.4); }
        .logo-sub { font-size: 11px; letter-spacing: 3px; color: #64748b; margin-top: 6px; text-transform: uppercase; }
        .time-box { background: rgba(255, 0, 127, 0.05); border: 1px solid rgba(255, 0, 127, 0.22); border-radius: 10px; padding: 12px 16px; margin: 20px 0 24px; }
        .time-header { font-size: 11px; font-weight: 700; color: #ff007f; text-transform: uppercase; letter-spacing: 1px; }
        .time-detail { font-size: 13px; color: #e2e8f0; margin-top: 4px; }
        .greeting { font-size: 16px; color: #f8fafc; margin: 0 0 12px; }
        .desc { font-size: 14px; color: #94a3b8; line-height: 1.6; margin: 0 0 24px; }
        .otp-container { background: #050814; border: 2px dashed #ff007f; border-radius: 12px; padding: 24px 16px; text-align: center; margin: 24px 0; }
        .otp-badge { font-size: 10px; letter-spacing: 3px; color: #64748b; text-transform: uppercase; font-weight: 700; margin-bottom: 10px; }
        .otp-digits { font-family: 'Courier New', Courier, monospace; font-size: 44px; font-weight: 900; letter-spacing: 14px; color: #ff007f; text-shadow: 0 0 25px rgba(255, 0, 127, 0.6); margin-left: 14px; }
        .otp-expiry { font-size: 12px; color: #cbd5e1; margin-top: 10px; }
        .security-box { background: rgba(255, 255, 255, 0.02); border-left: 3px solid #ff007f; border-radius: 0 8px 8px 0; padding: 12px 14px; margin-top: 24px; }
        .security-title { font-size: 12px; font-weight: 700; color: #e2e8f0; margin-bottom: 4px; }
        .security-text { font-size: 12px; color: #64748b; line-height: 1.5; margin: 0; }
        .footer { padding: 24px 32px; background: #070a16; border-top: 1px solid #1e293b; text-align: center; font-size: 11px; color: #475569; }
      </style>
    </head>
    <body>
      <div class="wrapper">
        <div class="main">
          <div class="accent-bar"></div>
          <div class="content">
            <div class="logo-wrap">
              <h1 class="logo-title">🔒 PASSWORD RESET 🔒</h1>
              <div class="logo-sub">Neon Gaming Account Security</div>
            </div>

            <div class="time-box">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td class="time-header">🇮🇳 Indian Standard Time (IST)</td>
                  <td align="right" style="font-size:11px;color:#94a3b8;">📅 ${istDate}</td>
                </tr>
                <tr>
                  <td class="time-detail" style="padding-top:4px;">
                    Sent at: <strong style="color:#ff007f;">${istTime} IST</strong>
                  </td>
                  <td align="right" class="time-detail" style="padding-top:4px;">
                    Valid until: <strong style="color:#00f7ff;">${istExpire} IST</strong>
                  </td>
                </tr>
              </table>
            </div>

            <p class="greeting">Hello <strong>${toName}</strong>,</p>
            <p class="desc">
              We received a request to reset your Neon Gaming account password. Use the verification code below to authorize the password reset.
            </p>

            <div class="otp-container">
              <div class="otp-badge">Password Reset Code</div>
              <div class="otp-digits">${otpCode}</div>
              <div class="otp-expiry">⏱️ Valid for <strong>5 minutes</strong> (Expires at <strong>${istExpire} IST</strong>)</div>
            </div>

            <div class="security-box">
              <div class="security-title">🛡️ Security Alert</div>
              <p class="security-text">
                If you did not request a password reset, please change your password immediately or contact support. Never share this code with anyone.
              </p>
            </div>
          </div>

          <div class="footer">
            <p style="margin:0 0 6px 0;">© 2026 Neon Gaming Arena · All rights reserved.</p>
            <p style="margin:0;">Dispatched in Indian Standard Time (Asia/Kolkata) · Do not reply to this email.</p>
          </div>
        </div>
      </div>
    </body>
    </html>`;

    return dispatchEmail({
        toEmail,
        toName,
        subject: `${otpCode} — Reset Your Neon Gaming Password [${istTime} IST]`,
        html
    });
};

module.exports = { sendOTPEmail, sendPasswordResetEmail, sendViaBrevoApi };
