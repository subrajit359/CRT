import express from "express";
import { query } from "../db.js";
import { requireAuth } from "../auth-middleware.js";
import { notify } from "../notify.js";

const router = express.Router();

router.get("/queue", requireAuth(["doctor", "admin"]), async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 20));
  const offset = (page - 1) * pageSize;
  const { rows: countRow } = await query(
    `SELECT COUNT(*)::int AS n FROM cases c
       WHERE c.deleted_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM case_verifications v WHERE v.case_id=c.id AND v.doctor_id=$1)`,
    [req.user.id]
  );
  const total = countRow[0].n;
  const { rows } = await query(
    `SELECT c.id, c.title, c.specialty, c.level, c.source, c.source_kind, c.created_at,
            u.username AS uploader_username, u.full_name AS uploader_name,
            (SELECT COUNT(*)::int FROM case_verifications WHERE case_id=c.id AND action='verify') AS verify_count
       FROM cases c LEFT JOIN users u ON u.id=c.uploader_id
       WHERE c.deleted_at IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM case_verifications v WHERE v.case_id=c.id AND v.doctor_id=$1
         )
       ORDER BY (SELECT COUNT(*) FROM case_verifications WHERE case_id=c.id) ASC,
                c.created_at DESC
       LIMIT $2 OFFSET $3`,
    [req.user.id, pageSize, offset]
  );
  res.json({
    items: rows,
    cases: rows, // backwards-compatible alias
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
});

router.post("/:caseId/verify", requireAuth(["doctor", "admin"]), async (req, res) => {
  // Toggle semantics:
  // - If the user already has 'verify' active for this case, withdraw it (toggle off).
  // - If the user has 'unverify' active, remove it and switch to 'verify'.
  // - Otherwise insert a new 'verify' row.
  const { rows: existing } = await query(
    `SELECT id, action FROM case_verifications WHERE case_id=$1 AND doctor_id=$2`,
    [req.params.caseId, req.user.id]
  );
  const mine = existing[0];

  if (mine && mine.action === "verify") {
    await query(
      `DELETE FROM case_verifications WHERE case_id=$1 AND doctor_id=$2`,
      [req.params.caseId, req.user.id]
    );
    return res.json({ ok: true, status: null });
  }

  // Clear any prior status (e.g. 'unverify') and insert fresh 'verify'.
  await query(
    `DELETE FROM case_verifications WHERE case_id=$1 AND doctor_id=$2`,
    [req.params.caseId, req.user.id]
  );
  await query(
    `INSERT INTO case_verifications (case_id, doctor_id, action) VALUES ($1,$2,'verify')`,
    [req.params.caseId, req.user.id]
  );
  const { rows: c } = await query(`SELECT title, uploader_id FROM cases WHERE id=$1`, [req.params.caseId]);
  if (c[0] && c[0].uploader_id) {
    await notify(c[0].uploader_id, "case_verified", "Case verified", `${req.user.full_name} verified "${c[0].title}".`, `/case/${req.params.caseId}`);
  }
  res.json({ ok: true, status: "verify" });
});

// Queue health: total, oldest age, my throughput week, 30-day daily counts
router.get("/health", requireAuth(["doctor", "admin"]), async (req, res) => {
  const userId = req.user.id;

  const { rows: totalRow } = await query(
    `SELECT COUNT(*)::int AS n FROM cases c
       WHERE c.deleted_at IS NULL
         AND (SELECT COUNT(*) FROM case_verifications WHERE case_id=c.id AND action='verify') < 3`
  );
  const total = totalRow[0].n;

  const { rows: oldest } = await query(
    `SELECT EXTRACT(EPOCH FROM (NOW() - MIN(created_at)))::int AS oldest_seconds
       FROM cases c
       WHERE c.deleted_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM case_verifications WHERE case_id=c.id AND doctor_id=$1)
         AND (SELECT COUNT(*) FROM case_verifications WHERE case_id=c.id AND action='verify') < 3`,
    [userId]
  );
  const oldestHours = oldest[0]?.oldest_seconds != null ? Math.round(oldest[0].oldest_seconds / 3600) : 0;

  const { rows: myWeek } = await query(
    `SELECT COUNT(*)::int AS n FROM case_verifications
       WHERE doctor_id=$1 AND action='verify' AND created_at > NOW() - INTERVAL '7 days'`,
    [userId]
  );

  const { rows: allWeek } = await query(
    `SELECT COUNT(*)::int AS n FROM case_verifications
       WHERE action='verify' AND created_at > NOW() - INTERVAL '7 days'`
  );

  const myShare = allWeek[0].n > 0 ? Math.round((myWeek[0].n / allWeek[0].n) * 100) : 0;

  // 30-day daily throughput (mine)
  const { rows: daily } = await query(
    `SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day,
            COUNT(*)::int AS n
       FROM case_verifications
       WHERE doctor_id=$1 AND action='verify' AND created_at > NOW() - INTERVAL '30 days'
       GROUP BY 1 ORDER BY 1 ASC`,
    [userId]
  );
  const dailyMap = new Map(daily.map((d) => [d.day, d.n]));
  const throughput = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const k = d.toISOString().slice(0, 10);
    throughput.push({ day: k, n: dailyMap.get(k) || 0 });
  }

  res.json({
    total,
    oldestHours,
    myWeek: myWeek[0].n,
    myShare,
    throughput,
  });
});

// Smart triage list — sorted by priority for me (specialty match + reports + age)
router.get("/triage", requireAuth(["doctor", "admin"]), async (req, res) => {
  const userId = req.user.id;
  const { rows: profile } = await query(`SELECT specialty FROM doctor_profiles WHERE user_id=$1`, [userId]);
  const mySpecialty = profile[0]?.specialty || null;

  const { rows } = await query(
    `SELECT c.id, c.title, c.specialty, c.level, c.body, c.created_at,
            u.username AS uploader_username, u.full_name AS uploader_name,
            (SELECT COUNT(*)::int FROM case_verifications WHERE case_id=c.id AND action='verify') AS verify_count,
            (SELECT COUNT(*)::int FROM reports WHERE case_id=c.id) AS report_count,
            EXTRACT(EPOCH FROM (NOW() - c.created_at))::int AS age_seconds
       FROM cases c LEFT JOIN users u ON u.id=c.uploader_id
       WHERE c.deleted_at IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM case_verifications v WHERE v.case_id=c.id AND v.doctor_id=$1
         )
         AND (SELECT COUNT(*) FROM case_verifications WHERE case_id=c.id AND action='verify') < 3
       ORDER BY c.created_at ASC LIMIT 60`,
    [userId]
  );

  const QUORUM = 3;
  const enriched = rows.map((c) => {
    const ageHours = Math.round(c.age_seconds / 3600);
    const ageDays = ageHours / 24;
    const specialtyMatch = mySpecialty && c.specialty === mySpecialty ? 1 : 0;
    // Priority score: specialty match (40), reports (10/each, capped 30), age (1/day, capped 30)
    const priority = specialtyMatch * 40 + Math.min(c.report_count * 10, 30) + Math.min(ageDays, 30);
    const preview = (c.body || "").replace(/\s+/g, " ").trim().slice(0, 220);
    const remainingForQuorum = Math.max(0, QUORUM - c.verify_count);
    return {
      id: c.id,
      title: c.title,
      specialty: c.specialty,
      level: c.level,
      preview,
      uploader_username: c.uploader_username,
      uploader_name: c.uploader_name,
      verify_count: c.verify_count,
      report_count: c.report_count,
      age_hours: ageHours,
      specialty_match: !!specialtyMatch,
      priority,
      quorum_total: QUORUM,
      remaining_for_quorum: remainingForQuorum,
      tips_quorum: c.verify_count + 1 >= QUORUM,
    };
  });

  enriched.sort((a, b) => b.priority - a.priority);

  res.json({ cases: enriched.slice(0, 30), mySpecialty, quorum: QUORUM });
});

// Cases I've touched (verified or unverified) recently
router.get("/touched", requireAuth(["doctor", "admin"]), async (req, res) => {
  const userId = req.user.id;
  const { rows } = await query(
    `SELECT DISTINCT ON (c.id)
            c.id, c.title, c.specialty, c.level,
            v.action AS my_action, v.created_at AS my_action_at,
            (SELECT COUNT(*)::int FROM case_verifications WHERE case_id=c.id AND action='verify') AS verify_count
       FROM case_verifications v
       JOIN cases c ON c.id=v.case_id
       WHERE v.doctor_id=$1 AND c.deleted_at IS NULL
       ORDER BY c.id, v.created_at DESC`,
    [userId]
  );
  rows.sort((a, b) => new Date(b.my_action_at) - new Date(a.my_action_at));
  res.json({ cases: rows.slice(0, 8) });
});

router.post("/:caseId/unverify", requireAuth(["doctor", "admin"]), async (req, res) => {
  // Toggle semantics:
  // - If the user already has 'unverify' active for this case, withdraw it (toggle off).
  // - If the user has 'verify' active, remove it and switch to 'unverify'.
  // - Otherwise insert a new 'unverify' row.
  const reason = (req.body && typeof req.body.reason === "string") ? req.body.reason.trim() || null : null;

  const { rows: existing } = await query(
    `SELECT id, action FROM case_verifications WHERE case_id=$1 AND doctor_id=$2`,
    [req.params.caseId, req.user.id]
  );
  const mine = existing[0];

  if (mine && mine.action === "unverify") {
    await query(
      `DELETE FROM case_verifications WHERE case_id=$1 AND doctor_id=$2`,
      [req.params.caseId, req.user.id]
    );
    return res.json({ ok: true, status: null });
  }

  // Clear any prior status (e.g. 'verify') and insert fresh 'unverify'.
  await query(
    `DELETE FROM case_verifications WHERE case_id=$1 AND doctor_id=$2`,
    [req.params.caseId, req.user.id]
  );
  await query(
    `INSERT INTO case_verifications (case_id, doctor_id, action, reason) VALUES ($1,$2,'unverify',$3)`,
    [req.params.caseId, req.user.id, reason]
  );
  const { rows: c } = await query(`SELECT title, uploader_id FROM cases WHERE id=$1`, [req.params.caseId]);
  if (c[0] && c[0].uploader_id) {
    await notify(
      c[0].uploader_id,
      "case_unverified",
      "Case un-verified",
      `${req.user.full_name} marked "${c[0].title}" as un-verified. Open the case discussion to follow up.`,
      `/discussion/${req.params.caseId}`
    );
  }
  res.json({ ok: true, status: "unverify" });
});

export default router;
