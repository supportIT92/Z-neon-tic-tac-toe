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

// ── Send OTP email (Simple, Clean Dark Gaming Format) ─────────
const sendOTPEmail = async (toEmail, toName, otpCode) => {
    const now = new Date();
    const istTime = now.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true });

    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Verification Code</title>
      <style>
        body { margin: 0; padding: 0; background: #080c16; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f8fafc; }
        .wrapper { width: 100%; padding: 40px 12px; background: #080c16; }
        .card { max-width: 440px; margin: 0 auto; background: #0f172a; border: 1px solid #1e293b; border-radius: 12px; padding: 32px 28px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
        .brand { font-size: 20px; font-weight: 800; letter-spacing: 3px; color: #00f7ff; text-align: center; margin: 0 0 24px; text-transform: uppercase; }
        .greeting { font-size: 15px; color: #f1f5f9; margin: 0 0 10px; }
        .desc { font-size: 14px; color: #94a3b8; line-height: 1.5; margin: 0 0 22px; }
        .code-box { background: #050814; border: 1px solid #00f7ff; border-radius: 8px; padding: 18px; text-align: center; margin: 20px 0; }
        .code { font-family: 'Courier New', Courier, monospace; font-size: 38px; font-weight: bold; letter-spacing: 10px; color: #00f7ff; margin-left: 10px; }
        .meta { font-size: 12px; color: #64748b; line-height: 1.6; text-align: center; margin: 18px 0 0; }
        .footer { font-size: 11px; color: #475569; text-align: center; margin-top: 24px; border-top: 1px solid #1e293b; padding-top: 16px; }
      </style>
    </head>
    <body>
      <div class="wrapper">
        <div class="card">
          <div class="brand">NEON GAMING</div>
          <div class="greeting">Hi <strong>${toName}</strong>,</div>
          <div class="desc">Here is your verification code to access your account:</div>
          <div class="code-box">
            <div class="code">${otpCode}</div>
          </div>
          <div class="meta">
            Valid for <strong>5 minutes</strong> (Sent at <strong>${istTime} IST</strong>)<br>
            Never share this code with anyone.
          </div>
          <div class="footer">
            © Neon Gaming · Automated verification
          </div>
        </div>
      </div>
    </body>
    </html>`;

    return dispatchEmail({
        toEmail,
        toName,
        subject: `${otpCode} is your Neon Gaming verification code`,
        html
    });
};

// ── Send Password Reset Email (Direct Link Button) ────────────
const sendPasswordResetEmail = async (toEmail, toName, resetLink) => {
    const now = new Date();
    const istTime = now.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true });

    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Reset Your Password</title>
      <style>
        body { margin: 0; padding: 0; background: #080c16; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f8fafc; }
        .wrapper { width: 100%; padding: 40px 12px; background: #080c16; }
        .card { max-width: 460px; margin: 0 auto; background: #0f172a; border: 1px solid #1e293b; border-radius: 14px; padding: 36px 30px; box-shadow: 0 12px 35px rgba(0,0,0,0.6); }
        .brand { font-size: 22px; font-weight: 800; letter-spacing: 3px; color: #ff007f; text-align: center; margin: 0 0 24px; text-transform: uppercase; }
        .greeting { font-size: 16px; color: #f1f5f9; margin: 0 0 12px; }
        .desc { font-size: 14px; color: #94a3b8; line-height: 1.6; margin: 0 0 26px; }
        .btn-wrap { text-align: center; margin: 28px 0; }
        .btn { display: inline-block; background: linear-gradient(135deg, #ff007f 0%, #7928ca 100%); color: #ffffff !important; text-decoration: none; font-size: 15px; font-weight: 700; letter-spacing: 1.5px; padding: 14px 34px; border-radius: 8px; box-shadow: 0 4px 20px rgba(255, 0, 127, 0.4); text-transform: uppercase; }
        .meta { font-size: 12px; color: #64748b; line-height: 1.6; text-align: center; margin: 22px 0 0; }
        .link-alt { word-break: break-all; font-size: 11px; color: #00f7ff; text-align: center; margin-top: 14px; line-height: 1.4; }
        .footer { font-size: 11px; color: #475569; text-align: center; margin-top: 26px; border-top: 1px solid #1e293b; padding-top: 18px; }
      </style>
    </head>
    <body>
      <div class="wrapper">
        <div class="card">
          <div class="brand">NEON GAMING</div>
          <div class="greeting">Hi <strong>${toName}</strong>,</div>
          <div class="desc">
            We received a request to reset your Neon Gaming account password. Click the button below to set a new password:
          </div>
          <div class="btn-wrap">
            <a href="${resetLink}" class="btn" target="_blank" rel="noopener noreferrer">RESET PASSWORD</a>
          </div>
          <div class="meta">
            This link is valid for <strong>15 minutes</strong> (Dispatched at <strong>${istTime} IST</strong>).<br>
            If you did not request a password reset, you can safely ignore this email.
          </div>
          <div class="link-alt">
            If the button doesn't work, copy and paste this link in your browser:<br>
            <a href="${resetLink}" style="color: #00f7ff; text-decoration: underline;">${resetLink}</a>
          </div>
          <div class="footer">
            © Neon Gaming · Account Security Service
          </div>
        </div>
      </div>
    </body>
    </html>`;

    return dispatchEmail({
        toEmail,
        toName,
        subject: "Reset your Neon Gaming password",
        html
    });
};

// ── Send Password Changed Confirmation Email (Security Alert) ──
const sendPasswordChangedEmail = async (toEmail, toName) => {
    const now = new Date();
    const istTime = now.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true });
    const istDate = now.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" });

    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Password Changed Successfully</title>
      <style>
        body { margin: 0; padding: 0; background: #080c16; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f8fafc; }
        .wrapper { width: 100%; padding: 40px 12px; background: #080c16; }
        .card { max-width: 460px; margin: 0 auto; background: #0f172a; border: 1px solid #1e293b; border-radius: 14px; padding: 36px 30px; box-shadow: 0 12px 35px rgba(0,0,0,0.6); }
        .brand { font-size: 22px; font-weight: 800; letter-spacing: 3px; color: #00ff88; text-align: center; margin: 0 0 24px; text-transform: uppercase; }
        .greeting { font-size: 16px; color: #f1f5f9; margin: 0 0 12px; }
        .desc { font-size: 14px; color: #94a3b8; line-height: 1.6; margin: 0 0 20px; }
        .status-box { background: rgba(34, 197, 94, 0.1); border: 1px solid #22c55e; border-radius: 8px; padding: 16px; text-align: center; margin: 20px 0; color: #22c55e; font-weight: 600; font-size: 15px; }
        .info-row { font-size: 13px; color: #cbd5e1; margin: 8px 0; }
        .warning-text { font-size: 12px; color: #f87171; line-height: 1.6; margin-top: 20px; padding-top: 14px; border-top: 1px solid #1e293b; text-align: center; }
        .footer { font-size: 11px; color: #475569; text-align: center; margin-top: 24px; border-top: 1px solid #1e293b; padding-top: 16px; }
      </style>
    </head>
    <body>
      <div class="wrapper">
        <div class="card">
          <div class="brand">NEON GAMING</div>
          <div class="greeting">Hi <strong>${toName}</strong>,</div>
          <div class="status-box">
            Password Changed Successfully
          </div>
          <div class="desc">
            Your Neon Gaming account password has just been updated.
          </div>
          <div class="info-row">
            <strong>Time:</strong> ${istTime} IST (${istDate})
          </div>
          <div class="info-row">
            <strong>Account:</strong> ${toEmail}
          </div>
          <div class="warning-text">
            If you did not perform this change, please immediately reach out to our support at supportit92@gmail.com or reset your password immediately.
          </div>
          <div class="footer">
            © Neon Gaming · Security Alert Notification
          </div>
        </div>
      </div>
    </body>
    </html>`;

    return dispatchEmail({
        toEmail,
        toName,
        subject: "Security Alert: Your Neon Gaming password was changed",
        html
    });
};

module.exports = { sendOTPEmail, sendPasswordResetEmail, sendPasswordChangedEmail, sendViaBrevoApi };
