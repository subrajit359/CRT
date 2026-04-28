import express from "express";
import bcrypt from "bcryptjs";
import { query } from "../db.js";
import { issueOtp, consumeOtp } from "../otp.js";
import { createSession, setSessionCookie, clearSessionCookie, getUserFromRequest, destroySession } from "../auth-middleware.js";
import { notify } from "../notify.js";

const router = express.Router();

function emailValid(s) {
  return typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}
function usernameValid(s) {
  return typeof s === "string" && /^[a-z0-9_]{3,24}$/.test(s);
}
function passwordValid(s) {
  return typeof s === "string" && s.length >= 8 && s.length <= 128 && /[A-Za-z]/.test(s) && /\d/.test(s);
}

async function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}

router.post("/request-otp", async (req, res) => {
  try {
    const email = String(req.body.email || "").toLowerCase().trim();
    const requested = req.body.purpose === "reset" ? "reset" : null;
    if (!emailValid(email)) return res.status(400).json({ error: "Invalid email" });
    const { rows } = await query(`SELECT id FROM users WHERE email=$1`, [email]);
    let purpose;
    if (requested === "reset") {
      if (!rows[0]) return res.status(404).json({ error: "No account with that email" });
      purpose = "reset";
    } else {
      // signup verification path only — login uses password
      if (rows[0]) return res.status(409).json({ error: "Email already registered. Use Sign in or Forgot password." });
      purpose = "register";
    }
    const r = await issueOtp(email, purpose);
    res.json({ ok: true, purpose, ttlMinutes: r.ttlMinutes });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.post("/verify-otp", async (req, res) => {
  try {
    const email = String(req.body.email || "").toLowerCase().trim();
    const code = String(req.body.code || "").trim();
    const requested = req.body.purpose;
    const purpose = requested === "reset" ? "reset" : "register";
    if (!emailValid(email) || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ error: "Invalid email or code" });
    }
    const ok = await consumeOtp(email, code, purpose);
    if (!ok) return res.status(401).json({ error: "Code is incorrect or expired" });
    res.json({ ok: true, verified: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/login", async (req, res) => {
  try {
    const email = String(req.body.email || "").toLowerCase().trim();
    const password = String(req.body.password || "");
    if (!emailValid(email) || !password) {
      return res.status(400).json({ error: "Email and password required" });
    }
    const { rows } = await query(
      `SELECT id, role, password_hash FROM users WHERE email=$1`,
      [email]
    );
    const user = rows[0];
    if (!user || !user.password_hash) {
      return res.status(401).json({ error: "Invalid email or password" });
    }
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: "Invalid email or password" });

    // Pending and rejected doctors are now allowed to log in. They will be
    // routed to a restricted Inbox view on the frontend (status + admin chat).
    // Approved doctors get the full doctor experience.
    await query(`UPDATE users SET last_login=NOW() WHERE id=$1`, [user.id]);
    const sess = await createSession(user.id);
    setSessionCookie(res, sess.token, sess.expires);
    res.json({ ok: true, token: sess.token, expires: sess.expires });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/reset-password", async (req, res) => {
  try {
    const email = String(req.body.email || "").toLowerCase().trim();
    const code = String(req.body.code || "").trim();
    const password = String(req.body.password || "");
    if (!emailValid(email) || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ error: "Invalid email or code" });
    }
    if (!passwordValid(password)) {
      return res.status(400).json({ error: "Password must be at least 8 characters and include a letter and a number" });
    }
    const ok = await consumeOtp(email, code, "reset");
    if (!ok) return res.status(401).json({ error: "Code is incorrect or expired" });

    const { rows } = await query(`SELECT id FROM users WHERE email=$1`, [email]);
    if (!rows[0]) return res.status(404).json({ error: "Account not found" });
    const hash = await hashPassword(password);
    await query(`UPDATE users SET password_hash=$1 WHERE id=$2`, [hash, rows[0].id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/register-student", async (req, res) => {
  try {
    const email = String(req.body.email || "").toLowerCase().trim();
    const username = String(req.body.username || "").toLowerCase().trim();
    const fullName = String(req.body.fullName || "").trim();
    const yearOfStudy = String(req.body.yearOfStudy || "").trim();
    const country = String(req.body.country || "").trim();
    const password = String(req.body.password || "");
    if (!emailValid(email)) return res.status(400).json({ error: "Invalid email" });
    if (!usernameValid(username)) return res.status(400).json({ error: "Username must be 3-24 chars (a-z, 0-9, _)" });
    if (fullName.length < 2) return res.status(400).json({ error: "Name required" });
    if (!passwordValid(password)) return res.status(400).json({ error: "Password must be at least 8 characters and include a letter and a number" });

    const { rows: dup } = await query(`SELECT 1 FROM users WHERE email=$1 OR username=$2`, [email, username]);
    if (dup[0]) return res.status(409).json({ error: "Email or username already in use" });

    const passwordHash = await hashPassword(password);
    const { rows } = await query(
      `INSERT INTO users (email, username, full_name, role, country, password_hash)
       VALUES ($1,$2,$3,'student',$4,$5) RETURNING id`,
      [email, username, fullName, country, passwordHash]
    );
    await query(
      `INSERT INTO student_profiles (user_id, year_of_study) VALUES ($1,$2)`,
      [rows[0].id, yearOfStudy]
    );
    await notify(rows[0].id, "welcome", "Welcome to Reasonal", "Start with the practice loop. One case, one question, one sharp evaluation.", "/practice");
    const sess = await createSession(rows[0].id);
    setSessionCookie(res, sess.token, sess.expires);
    res.json({ ok: true, token: sess.token, expires: sess.expires });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/register-doctor", async (req, res) => {
  try {
    const email = String(req.body.email || "").toLowerCase().trim();
    const username = String(req.body.username || "").toLowerCase().trim();
    const fullName = String(req.body.fullName || "").trim();
    const country = String(req.body.country || "").trim();
    const degree = String(req.body.degree || "").trim();
    const specialty = String(req.body.specialty || "").trim();
    const yearsExp = parseInt(req.body.yearsExp, 10) || 0;
    const licenseNumber = String(req.body.licenseNumber || "").trim();
    const hospital = String(req.body.hospital || "").trim();
    const proofText = String(req.body.proofText || "").trim();
    const password = String(req.body.password || "");

    if (!emailValid(email)) return res.status(400).json({ error: "Invalid email" });
    if (!usernameValid(username)) return res.status(400).json({ error: "Invalid username" });
    if (!fullName || !specialty || !licenseNumber) {
      return res.status(400).json({ error: "Name, specialty, and license required" });
    }
    if (!passwordValid(password)) return res.status(400).json({ error: "Password must be at least 8 characters and include a letter and a number" });

    const { rows: dup } = await query(`SELECT 1 FROM users WHERE email=$1 OR username=$2`, [email, username]);
    if (dup[0]) return res.status(409).json({ error: "Email or username already in use" });

    const passwordHash = await hashPassword(password);
    const { rows } = await query(
      `INSERT INTO users (email, username, full_name, role, country, password_hash) VALUES ($1,$2,$3,'doctor',$4,$5) RETURNING id`,
      [email, username, fullName, country, passwordHash]
    );
    await query(
      `INSERT INTO doctor_profiles (user_id, degree, specialty, years_exp, license_number, hospital, proof_text, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'pending')`,
      [rows[0].id, degree, specialty, yearsExp, licenseNumber, hospital, proofText]
    );
    const { rows: admins } = await query(`SELECT id FROM users WHERE role='admin'`);
    for (const a of admins) {
      await notify(a.id, "doctor_pending", "New doctor application", `${fullName} (${specialty}) is pending review.`, "/admin");
    }
    res.json({ ok: true, status: "pending" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Re-application: a previously rejected doctor edits their professional
// details and resubmits. The admin chat (and email) gets a system message so
// reviewers know to re-look. Name, username, email, and password are NOT
// editable here — those go through the normal account/profile flows.
router.patch("/reapply-doctor", async (req, res) => {
  try {
    const me = await getUserFromRequest(req);
    if (!me) return res.status(401).json({ error: "Auth required" });
    if (me.role !== "doctor") return res.status(403).json({ error: "Only doctors can reapply" });

    const { rows: dp } = await query(
      `SELECT status FROM doctor_profiles WHERE user_id=$1`,
      [me.id]
    );
    if (!dp[0]) return res.status(404).json({ error: "Doctor profile not found" });
    if (dp[0].status !== "rejected") {
      return res.status(409).json({ error: "Reapply is only available after a rejection." });
    }

    const degree = String(req.body.degree || "").trim();
    const specialty = String(req.body.specialty || "").trim();
    const yearsExp = parseInt(req.body.yearsExp, 10) || 0;
    const licenseNumber = String(req.body.licenseNumber || "").trim();
    const hospital = String(req.body.hospital || "").trim();
    const proofText = String(req.body.proofText || "").trim();

    if (!specialty || !licenseNumber) {
      return res.status(400).json({ error: "Specialty and license number are required." });
    }

    await query(
      `UPDATE doctor_profiles
          SET degree=$2, specialty=$3, years_exp=$4, license_number=$5,
              hospital=$6, proof_text=$7,
              status='pending', reviewer_note=NULL, reviewed_at=NULL
        WHERE user_id=$1`,
      [me.id, degree, specialty, yearsExp, licenseNumber, hospital, proofText]
    );

    // Drop a system note into the support thread so admins see the resubmission
    // inline and can review again from the same conversation.
    const { rows: th } = await query(
      `SELECT id FROM support_threads WHERE doctor_user_id=$1`,
      [me.id]
    );
    let threadId = th[0]?.id;
    if (!threadId) {
      const { rows: ins } = await query(
        `INSERT INTO support_threads (doctor_user_id) VALUES ($1) RETURNING id`,
        [me.id]
      );
      threadId = ins[0].id;
    }
    await query(
      `INSERT INTO support_messages (thread_id, sender_id, body, kind, meta)
         VALUES ($1, $2, $3, 'reapply_submitted', $4::jsonb)`,
      [
        threadId,
        me.id,
        "Application resubmitted with updated details. Pending review.",
        JSON.stringify({ specialty, licenseNumber, hospital }),
      ]
    );
    await query(`UPDATE support_threads SET last_at=NOW() WHERE id=$1`, [threadId]);

    const { rows: admins } = await query(`SELECT id FROM users WHERE role='admin'`);
    for (const a of admins) {
      await notify(
        a.id,
        "doctor_pending",
        "Doctor reapplied",
        `${me.full_name || me.username} resubmitted their application.`,
        `/admin/support/${threadId}`
      );
    }
    res.json({ ok: true, status: "pending" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/me", async (req, res) => {
  const user = await getUserFromRequest(req);
  if (!user) return res.json({ user: null });
  let extra = {};
  if (user.role === "doctor") {
    const { rows } = await query(`SELECT status, specialty, years_exp, hospital FROM doctor_profiles WHERE user_id=$1`, [user.id]);
    extra = rows[0] || {};
  } else if (user.role === "student") {
    const { rows } = await query(`SELECT year_of_study, global_level, specialty_levels, show_scores FROM student_profiles WHERE user_id=$1`, [user.id]);
    extra = rows[0] || {};
  }
  res.json({ user: { ...user, ...extra } });
});

// Submit account deletion request
router.post("/account-delete-request", async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: "Not signed in" });
    const reason = String(req.body.reason || "").trim() || null;
    // Check if there is already a pending request
    const { rows: existing } = await query(
      `SELECT id FROM account_delete_requests WHERE user_id=$1 AND status='pending'`,
      [user.id]
    );
    if (existing[0]) return res.status(409).json({ error: "You already have a pending deletion request" });
    await query(
      `INSERT INTO account_delete_requests (user_id, reason) VALUES ($1,$2)`,
      [user.id, reason]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// Check if user has a pending delete request
router.get("/account-delete-request", async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: "Not signed in" });
    const { rows } = await query(
      `SELECT id, status, created_at FROM account_delete_requests WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1`,
      [user.id]
    );
    res.json({ request: rows[0] || null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/logout", async (req, res) => {
  await destroySession(req);
  clearSessionCookie(res);
  res.json({ ok: true });
});

export default router;
