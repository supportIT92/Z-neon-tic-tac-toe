// ═══════════════════════════════════════════════════════════
// UTIL: Email sender via Nodemailer
// ═══════════════════════════════════════════════════════════

const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS   // Gmail App Password (not account password)
    }
});

// ── Send OTP email ────────────────────────────────────────────
const sendOTPEmail = async (toEmail, toName, otpCode) => {
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; background: #050816; color: #fff; margin: 0; padding: 0; }
        .container { max-width: 480px; margin: 40px auto; padding: 32px; background: rgba(255,255,255,0.06); border-radius: 16px; border: 1px solid rgba(255,255,255,0.12); }
        .logo { text-align: center; font-size: 28px; font-weight: 900; letter-spacing: 4px; color: #00f7ff; margin-bottom: 8px; }
        .subtitle { text-align: center; color: #94a3b8; font-size: 12px; letter-spacing: 2px; margin-bottom: 28px; }
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
        <p style="color:#cbd5e1;">Hi <strong>${toName}</strong>,</p>
        <p style="color:#94a3b8;font-size:14px;">Use the OTP below to verify your email address. It expires in <strong style="color:#00f7ff;">5 minutes</strong>.</p>
        <div class="otp-box">
          <div class="otp-code">${otpCode}</div>
          <div class="otp-label">YOUR ONE-TIME PASSWORD</div>
        </div>
        <p class="note">If you did not request this, please ignore this email.</p>
        <div class="footer">© Neon Gaming · Do not reply to this email</div>
      </div>
    </body>
    </html>`;

    await transporter.sendMail({
        from:    `"Neon Gaming" <${process.env.EMAIL_USER}>`,
        to:      toEmail,
        subject: `${otpCode} — Your Neon Gaming OTP`,
        html
    });
};

module.exports = { sendOTPEmail };
