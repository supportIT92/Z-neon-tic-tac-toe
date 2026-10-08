// ═══════════════════════════════════════════════════════════
// UTIL: Email sender via Brevo (Sendinblue) REST API + Nodemailer Fallback
// ═══════════════════════════════════════════════════════════

const https      = require("https");
const nodemailer = require("nodemailer");

/**
 * Sends transactional email directly through Brevo's HTTPS REST API.
 * This runs over HTTPS (port 443), avoiding any SMTP port 587 firewalls on Render.
 */
function sendViaBrevoApi({ toEmail, toName, subject, html }) {
    return new Promise((resolve, reject) => {
        const apiKey = (process.env.BREVO_API_KEY || process.env.BREVO_SMTP_KEY || "").trim();
        const senderEmail = (process.env.BREVO_FROM_EMAIL || "supportit92@gmail.com").trim();
        const senderName  = (process.env.BREVO_FROM_NAME || "Neon Gaming").trim();

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
            htmlContent: html
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
    try {
        return await sendViaBrevoApi({ toEmail, toName, subject, html });
    } catch (apiErr) {
        console.warn(`[Email Warning] Brevo REST API failed (${apiErr.message}). Trying SMTP fallback...`);
        return transporter.sendMail({
            from:    `"${process.env.BREVO_FROM_NAME || "Neon Gaming"}" <${process.env.BREVO_FROM_EMAIL || "supportit92@gmail.com"}>`,
            to:      toEmail,
            subject: subject,
            html:    html
        });
    }
}

// ── Send OTP email ────────────────────────────────────────────
const sendOTPEmail = async (toEmail, toName, otpCode) => {
    const now = new Date();
    const istTime = now.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true });
    const istExpire = new Date(now.getTime() + 5 * 60 * 1000).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true });

    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; background: #050816; color: #fff; margin: 0; padding: 0; }
        .container { max-width: 480px; margin: 40px auto; padding: 32px; background: rgba(255,255,255,0.06); border-radius: 16px; border: 1px solid rgba(255,255,255,0.12); }
        .logo { text-align: center; font-size: 28px; font-weight: 900; letter-spacing: 4px; color: #00f7ff; margin-bottom: 8px; }
        .subtitle { text-align: center; color: #94a3b8; font-size: 12px; letter-spacing: 2px; margin-bottom: 20px; }
        .time-pill { text-align: center; margin-bottom: 20px; }
        .time-pill span { background: rgba(0,247,255,0.12); color: #00f7ff; border: 1px solid rgba(0,247,255,0.3); padding: 5px 14px; border-radius: 20px; font-size: 12px; font-weight: bold; }
        .otp-box { background: rgba(0,247,255,0.08); border: 2px solid rgba(0,247,255,0.3); border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0; }
        .otp-code { font-size: 42px; font-weight: 900; letter-spacing: 12px; color: #00f7ff; text-shadow: 0 0 20px rgba(0,247,255,0.5); }
        .otp-label { font-size: 11px; color: #94a3b8; letter-spacing: 2px; margin-top: 8px; }
        .note { color: #64748b; font-size: 12px; text-align: center; margin-top: 16px; }
        .footer { text-align: center; color: #334155; font-size: 11px; margin-top: 28px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="logo">NEON GAMING</div>
        <div class="subtitle">PLAY · CHALLENGE · WIN</div>
        <div class="time-pill">
          <span>🕒 Sent: ${istTime} IST · Valid until ${istExpire} IST</span>
        </div>
        <p style="color:#cbd5e1;">Hi <strong>${toName}</strong>,</p>
        <p style="color:#94a3b8;font-size:14px;">Use the OTP below to verify your email address. It is valid for <strong style="color:#00f7ff;">5 minutes</strong> (until <strong>${istExpire} IST</strong>).</p>
        <div class="otp-box">
          <div class="otp-code">${otpCode}</div>
          <div class="otp-label">YOUR ONE-TIME PASSWORD</div>
        </div>
        <p class="note">If you did not request this, please ignore this email.</p>
        <div class="footer">© Neon Gaming · Sent at ${istTime} IST</div>
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

// ── Send Password Reset OTP email ──────────────────────────────
const sendPasswordResetEmail = async (toEmail, toName, otpCode) => {
    const now = new Date();
    const istTime = now.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true });
    const istExpire = new Date(now.getTime() + 5 * 60 * 1000).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true });

    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; background: #050816; color: #fff; margin: 0; padding: 0; }
        .container { max-width: 480px; margin: 40px auto; padding: 32px; background: rgba(255,255,255,0.06); border-radius: 16px; border: 1px solid rgba(255,255,255,0.12); }
        .logo { text-align: center; font-size: 28px; font-weight: 900; letter-spacing: 4px; color: #ff007f; margin-bottom: 8px; }
        .subtitle { text-align: center; color: #94a3b8; font-size: 12px; letter-spacing: 2px; margin-bottom: 20px; }
        .time-pill { text-align: center; margin-bottom: 20px; }
        .time-pill span { background: rgba(255,0,127,0.12); color: #ff007f; border: 1px solid rgba(255,0,127,0.3); padding: 5px 14px; border-radius: 20px; font-size: 12px; font-weight: bold; }
        .otp-box { background: rgba(255,0,127,0.08); border: 2px solid rgba(255,0,127,0.3); border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0; }
        .otp-code { font-size: 42px; font-weight: 900; letter-spacing: 12px; color: #ff007f; text-shadow: 0 0 20px rgba(255,0,127,0.5); }
        .otp-label { font-size: 11px; color: #94a3b8; letter-spacing: 2px; margin-top: 8px; }
        .note { color: #64748b; font-size: 12px; text-align: center; margin-top: 16px; }
        .footer { text-align: center; color: #334155; font-size: 11px; margin-top: 28px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="logo">NEON GAMING</div>
        <div class="subtitle">PASSWORD RESET</div>
        <div class="time-pill">
          <span>🕒 Sent: ${istTime} IST · Valid until ${istExpire} IST</span>
        </div>
        <p style="color:#cbd5e1;">Hi <strong>${toName}</strong>,</p>
        <p style="color:#94a3b8;font-size:14px;">We received a request to reset your password. Use the OTP code below. It is valid for <strong style="color:#ff007f;">5 minutes</strong> (until <strong>${istExpire} IST</strong>).</p>
        <div class="otp-box">
          <div class="otp-code">${otpCode}</div>
          <div class="otp-label">PASSWORD RESET CODE</div>
        </div>
        <p class="note">If you did not request a password reset, please ignore this email or contact support.</p>
        <div class="footer">© Neon Gaming · Sent at ${istTime} IST</div>
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
