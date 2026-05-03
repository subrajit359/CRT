import express from "express";
import { query } from "../db.js";
import { requireAuth } from "../auth-middleware.js";

const router = express.Router();

// ── Achievement catalogue ─────────────────────────────────────────────────────
export const ACHIEVEMENTS = [
  // Milestone
  { key: "first_steps",      title: "First Steps",        icon: "Hospital",      xp: 100,  category: "Milestone",    desc: "Complete your first case" },
  { key: "case_explorer",    title: "Case Explorer",      icon: "Search",        xp: 200,  category: "Milestone",    desc: "Complete 10 cases" },
  { key: "case_veteran",     title: "Case Veteran",       icon: "ClipboardList", xp: 500,  category: "Milestone",    desc: "Complete 50 cases" },
  { key: "centurion",        title: "Centurion",          icon: "Award",         xp: 1000, category: "Milestone",    desc: "Complete 100 cases" },
  // Score
  { key: "perfect_score",    title: "Perfect Score",      icon: "Star",         xp: 300,  category: "Score",        desc: "Score 10/10 on any case" },
  { key: "high_achiever",    title: "High Achiever",      icon: "Target",       xp: 300,  category: "Score",        desc: "Score 9+ on 5 different cases" },
  { key: "consistent",       title: "Consistent",         icon: "TrendingUp",   xp: 400,  category: "Score",        desc: "Average score ≥8 over 10 cases" },
  // Streak
  { key: "three_day_streak", title: "On Fire",            icon: "Flame",        xp: 150,  category: "Streak",       desc: "Maintain a 3-day practice streak" },
  { key: "week_warrior",     title: "Week Warrior",       icon: "Dumbbell",     xp: 300,  category: "Streak",       desc: "Maintain a 7-day practice streak" },
  { key: "monthly_legend",   title: "Monthly Legend",     icon: "Trophy",       xp: 1000, category: "Streak",       desc: "Maintain a 30-day practice streak" },
  // Specialty
  { key: "all_rounder",      title: "All-Rounder",        icon: "Globe",        xp: 250,  category: "Specialty",    desc: "Attempt cases in 5+ specialties" },
  { key: "jack_of_all",      title: "Jack of All Trades", icon: "Layers",       xp: 400,  category: "Specialty",    desc: "Attempt cases in 10+ specialties" },
  { key: "specialist",       title: "Specialist",         icon: "GraduationCap", xp: 500,  category: "Specialty",    desc: "Score avg ≥8 in any specialty (5+ cases)" },
  // Mastery
  { key: "first_review",     title: "Recall Ready",       icon: "RefreshCw",    xp: 100,  category: "Mastery",      desc: "Complete your first spaced repetition review" },
  { key: "memory_master",    title: "Memory Master",      icon: "Brain",        xp: 500,  category: "Mastery",      desc: "Master 5 cases (60-day review interval)" },
  // Improvement
  { key: "comeback",         title: "Comeback Kid",       icon: "Sparkles",     xp: 300,  category: "Improvement",  desc: "Score 8+ after a history of scoring below 5" },
  // Time
  { key: "night_owl",        title: "Night Owl",          icon: "Moon",         xp: 50,   category: "Time",         desc: "Submit a case answer after midnight" },
  { key: "early_bird",       title: "Early Bird",         icon: "Sunrise",      xp: 50,   category: "Time",         desc: "Submit a case answer before 6 AM" },
];

const ACHIEVEMENT_MAP = new Map(ACHIEVEMENTS.map((a) => [a.key, a]));

// ── Award XP (fire-and-forget safe) ─────────────────────────────────────────
export async function awardXp(userId, amount) {
  if (!amount || amount <= 0) return;
  try {
    await query(
      `UPDATE student_profiles SET xp = COALESCE(xp, 0) + $1 WHERE user_id = $2`,
      [amount, userId]
    );
  } catch (e) {
    console.warn("[achievements] awardXp failed (non-fatal):", e.message);
  }
}

// ── Core check — call after every first-attempt eval save ────────────────────
// Returns array of newly unlocked achievement definitions.
export async function checkAndUnlockAchievements(userId, { score = null, isPractice = false } = {}) {
  if (!userId) return [];
  try {
    const { rows: unlocked } = await query(
      `SELECT key FROM achievements WHERE user_id = $1`,
      [userId]
    );
    const unlockedSet = new Set(unlocked.map((r) => r.key));

    const toUnlock = [];
    function queue(key) {
      if (!unlockedSet.has(key)) toUnlock.push(key);
    }

    const [
      { rows: totalRows },
      { rows: scoreRows },
      { rows: specRows },
      { rows: streakRows },
    ] = await Promise.all([
      query(`SELECT COUNT(DISTINCT case_id)::int AS n FROM responses WHERE user_id=$1`, [userId]),
      query(`SELECT score FROM responses WHERE user_id=$1 ORDER BY created_at ASC`, [userId]),
      query(
        `SELECT c.specialty, COUNT(*)::int AS n, AVG(r.score)::float AS avg_score
           FROM responses r JOIN cases c ON c.id=r.case_id
           WHERE r.user_id=$1 GROUP BY c.specialty`,
        [userId]
      ),
      query(
        `SELECT DISTINCT date_trunc('day', created_at)::date AS d
           FROM responses WHERE user_id=$1 ORDER BY d DESC LIMIT 60`,
        [userId]
      ),
    ]);

    const total = totalRows[0]?.n ?? 0;

    // Milestone
    if (total >= 1)   queue("first_steps");
    if (total >= 10)  queue("case_explorer");
    if (total >= 50)  queue("case_veteran");
    if (total >= 100) queue("centurion");

    // Score
    if (scoreRows.some((r) => r.score >= 10)) queue("perfect_score");
    if (scoreRows.filter((r) => r.score >= 9).length >= 5) queue("high_achiever");
    if (scoreRows.length >= 10) {
      const avg = scoreRows.slice(-10).reduce((s, r) => s + (r.score ?? 0), 0) / 10;
      if (avg >= 8) queue("consistent");
    }

    // Streak
    let streak = 0;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    for (let i = 0; i < streakRows.length; i++) {
      const d = new Date(streakRows[i].d); d.setHours(0, 0, 0, 0);
      const expected = new Date(today); expected.setDate(today.getDate() - i);
      if (i === 0 && (d.getTime() === today.getTime() || d.getTime() === today.getTime() - 86400000)) {
        streak = 1; continue;
      }
      if (d.getTime() === expected.getTime()) streak++;
      else break;
    }
    if (streak >= 3)  queue("three_day_streak");
    if (streak >= 7)  queue("week_warrior");
    if (streak >= 30) queue("monthly_legend");

    // Specialty
    if (specRows.length >= 5)  queue("all_rounder");
    if (specRows.length >= 10) queue("jack_of_all");
    if (specRows.some((s) => s.n >= 5 && s.avg_score >= 8)) queue("specialist");

    // Comeback: scored 8+ now, had at least one <5 before this submission
    if (!isPractice && score >= 8 && scoreRows.length >= 2) {
      const prev = scoreRows.slice(0, -1);
      if (prev.some((r) => (r.score ?? 0) < 5)) queue("comeback");
    }

    // Time
    if (!isPractice) {
      const hour = new Date().getHours();
      if (hour >= 0 && hour < 4)  queue("night_owl");
      if (hour >= 4 && hour < 6)  queue("early_bird");
    }

    if (toUnlock.length === 0) return [];

    const newlyUnlocked = [];
    for (const key of toUnlock) {
      try {
        const { rowCount } = await query(
          `INSERT INTO achievements (user_id, key) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
          [userId, key]
        );
        if (rowCount > 0) {
          const def = ACHIEVEMENT_MAP.get(key);
          if (def) {
            newlyUnlocked.push(def);
            awardXp(userId, def.xp).catch(() => {});
          }
        }
      } catch (e) {
        console.warn("[achievements] insert failed (non-fatal):", key, e.message);
      }
    }

    if (newlyUnlocked.length > 0) {
      console.log(`[achievements] user ${userId} unlocked: ${newlyUnlocked.map((a) => a.key).join(", ")}`);
    }
    return newlyUnlocked;
  } catch (e) {
    console.warn("[achievements] checkAndUnlock failed (non-fatal):", e.message);
    return [];
  }
}

// ── GET /api/achievements ─────────────────────────────────────────────────────
router.get("/", requireAuth(), async (req, res) => {
  try {
    const [{ rows: unlocked }, { rows: xpRow }] = await Promise.all([
      query(
        `SELECT key, unlocked_at FROM achievements WHERE user_id=$1 ORDER BY unlocked_at DESC`,
        [req.user.id]
      ),
      query(
        `SELECT COALESCE(xp,0)::int AS xp FROM student_profiles WHERE user_id=$1`,
        [req.user.id]
      ),
    ]);

    const unlockedMap = new Map(unlocked.map((r) => [r.key, r.unlocked_at]));
    const xp = xpRow[0]?.xp ?? 0;

    const all = ACHIEVEMENTS.map((a) => ({
      ...a,
      unlocked: unlockedMap.has(a.key),
      unlocked_at: unlockedMap.get(a.key) || null,
    }));

    res.json({
      achievements: all,
      xp,
      unlockedCount: unlocked.length,
      totalCount: ACHIEVEMENTS.length,
    });
  } catch (e) {
    console.error("[achievements] GET /", e);
    res.status(500).json({ error: e.message });
  }
});

export default router;
