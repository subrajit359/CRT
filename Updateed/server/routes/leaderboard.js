import express from "express";
import { query } from "../db.js";
import { requireAuth } from "../auth-middleware.js";

const router = express.Router();

function computeStreaks(dayStrings, today) {
  if (!dayStrings || dayStrings.length === 0) return { best: 0, current: 0 };
  const unique = [...new Set(dayStrings)].sort();
  let best = 0, run = 0, prev = null;
  for (const ds of unique) {
    const d = new Date(ds + "T00:00:00Z").getTime();
    if (prev !== null && d === prev + 86400000) run++;
    else run = 1;
    if (run > best) best = run;
    prev = d;
  }
  const todayTs = today.getTime();
  const lastTs = new Date(unique[unique.length - 1] + "T00:00:00Z").getTime();
  let current = 0;
  let cursor;
  if (lastTs === todayTs) { current = 1; cursor = todayTs - 86400000; }
  else if (lastTs === todayTs - 86400000) { current = 1; cursor = todayTs - 2 * 86400000; }
  else return { best, current: 0 };
  for (let i = unique.length - 2; i >= 0; i--) {
    const d = new Date(unique[i] + "T00:00:00Z").getTime();
    if (d === cursor) { current++; cursor -= 86400000; }
    else break;
  }
  return { best, current };
}

function liveFormula(best, cur) {
  if (best <= 0) return 0;
  return ((best + cur) / (2 * best + 5)) * 100;
}

function tierFor(score) {
  if (score >= 90) return "Mythic";
  if (score >= 80) return "Elite";
  if (score >= 70) return "Disciplined";
  if (score >= 60) return "Steady";
  if (score >= 40) return "Climber";
  if (score >= 20) return "Apprentice";
  return "Newcomer";
}

async function buildEntries(userIds, intervalClause, today) {
  if (userIds.length === 0) return new Map();
  const params = [userIds];
  const { rows: practiceRows } = await query(
    `SELECT r.user_id, to_char(date_trunc('day', r.created_at), 'YYYY-MM-DD') AS d
       FROM responses r
       WHERE r.user_id = ANY($1) ${intervalClause}
       GROUP BY r.user_id, date_trunc('day', r.created_at)`,
    params
  );
  const days = new Map();
  for (const r of practiceRows) {
    if (!days.has(r.user_id)) days.set(r.user_id, []);
    days.get(r.user_id).push(r.d);
  }
  const result = new Map();
  for (const [uid, ds] of days) {
    const { best, current } = computeStreaks(ds, today);
    result.set(uid, { best, current, score: liveFormula(best, current) });
  }
  return result;
}

router.get("/", requireAuth(), async (req, res) => {
  const period = (req.query.period || "all").toString();
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.max(1, Math.min(100, parseInt(req.query.pageSize, 10) || 25));

  let intervalClause = "";
  if (period === "week") intervalClause = "AND r.created_at > NOW() - INTERVAL '7 days'";
  else if (period === "month") intervalClause = "AND r.created_at > NOW() - INTERVAL '30 days'";

  const { rows: users } = await query(
    `SELECT id, username, full_name, avatar_url, created_at
       FROM users WHERE role='student' ORDER BY created_at ASC`
  );

  if (users.length === 0) {
    return res.json({
      period, totalUsers: 0, page, pageSize, totalPages: 0,
      currentUser: null, topThree: [], rows: [],
    });
  }

  const userIds = users.map((u) => u.id);
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const stats = await buildEntries(userIds, intervalClause, today);

  // Cases done per user (within period)
  const { rows: casesRows } = await query(
    `SELECT r.user_id, COUNT(DISTINCT r.case_id)::int AS n
       FROM responses r WHERE r.user_id = ANY($1) ${intervalClause}
       GROUP BY r.user_id`,
    [userIds]
  );
  const casesByUser = new Map();
  for (const r of casesRows) casesByUser.set(r.user_id, r.n);

  // Top specialty per user (within period)
  const { rows: specRows } = await query(
    `SELECT r.user_id, c.specialty, COUNT(*)::int AS n
       FROM responses r JOIN cases c ON c.id = r.case_id
       WHERE r.user_id = ANY($1) ${intervalClause}
       GROUP BY r.user_id, c.specialty`,
    [userIds]
  );
  const topSpecByUser = new Map();
  for (const r of specRows) {
    const cur = topSpecByUser.get(r.user_id);
    if (!cur || r.n > cur.n) topSpecByUser.set(r.user_id, r.specialty);
  }

  let entries = [];
  for (const u of users) {
    const s = stats.get(u.id);
    if (!s) continue; // no practice in period → not on board
    entries.push({
      userId: u.id,
      name: u.full_name,
      username: u.username,
      avatarUrl: u.avatar_url,
      currentStreak: s.current,
      bestStreak: s.best,
      casesCompleted: casesByUser.get(u.id) || 0,
      topSpecialty: topSpecByUser.get(u.id) || null,
      score: Math.round(s.score * 10) / 10,
      tier: tierFor(s.score),
      joinedAt: u.created_at,
    });
  }

  entries.sort((a, b) =>
    b.score - a.score ||
    b.bestStreak - a.bestStreak ||
    b.casesCompleted - a.casesCompleted
  );
  entries = entries.map((e, i) => ({ ...e, rank: i + 1 }));

  // Delta: only meaningful for period=all → compare to rank a week ago
  let currentUser = null;
  const myEntry = entries.find((e) => e.userId === req.user.id);
  if (myEntry) {
    let delta = null;
    if (period === "all") {
      const weekAgo = new Date(today); weekAgo.setDate(today.getDate() - 7);
      const wkStats = await buildEntries(
        userIds,
        "AND r.created_at <= NOW() - INTERVAL '7 days'",
        weekAgo
      );
      const wkArr = [];
      for (const u of users) {
        const s = wkStats.get(u.id);
        if (!s) continue;
        wkArr.push({ userId: u.id, score: s.score, best: s.best });
      }
      wkArr.sort((a, b) => b.score - a.score || b.best - a.best);
      const idx = wkArr.findIndex((e) => e.userId === req.user.id);
      const wkRank = idx >= 0 ? idx + 1 : null;
      if (wkRank != null) delta = wkRank - myEntry.rank; // + = improved
    }
    currentUser = { rank: myEntry.rank, delta, row: myEntry };
  }

  const topThree = entries.slice(0, 3);
  const restEntries = entries.slice(3);
  const totalUsers = entries.length;
  const totalPages = Math.max(1, Math.ceil(restEntries.length / pageSize));
  const start = (page - 1) * pageSize;
  const pageRows = restEntries.slice(start, start + pageSize);

  res.json({
    period, totalUsers, page, pageSize, totalPages,
    currentUser, topThree, rows: pageRows,
  });
});

export default router;
