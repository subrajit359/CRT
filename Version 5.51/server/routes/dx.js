import { Router } from "express";
import multer from "multer";
import { query } from "../db.js";
import { requireAuth } from "../auth-middleware.js";
import { uploadBuffer, destroyAsset, isConfigured as cloudinaryReady } from "../cloudinary.js";
import { cacheGet, cacheSet, cacheInvalidate } from "../cache.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

function classifyKind(mime = "") {
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf") return "pdf";
  if (mime.includes("powerpoint") || mime.includes("presentation")) return "pptx";
  if (mime.includes("word") || mime.includes("document")) return "doc";
  return "other";
}

function resourceTypeFor(mime = "") {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  return "raw";
}

// ── Import ─────────────────────────────────────────────────────────────────

router.post("/import", requireAuth(["admin", "doctor"]), async (req, res) => {
  try {
    const body = req.body;

    // Accept either a single specialty object or an array of specialties
    const items = Array.isArray(body) ? body : [body];
    if (items.length === 0) return res.status(400).json({ error: "No specialties provided" });

    const results = [];

    for (const item of items) {
      const name = (item?.name || "").toString().trim();
      if (!name) return res.status(400).json({ error: "Each specialty must have a name" });

      const topics = Array.isArray(item?.topics) ? item.topics : [];
      if (topics.length === 0) return res.status(400).json({ error: `Specialty "${name}" has no topics` });

      for (const t of topics) {
        if (!t?.title || !String(t.title).trim()) {
          return res.status(400).json({ error: `A topic in "${name}" is missing a title` });
        }
      }

      // Upsert specialty
      const { rows: spRows } = await query(
        `INSERT INTO dx_specialties (name, icon, description, created_by)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (name) DO UPDATE SET icon=EXCLUDED.icon, description=EXCLUDED.description
         RETURNING id`,
        [name, item?.icon || null, item?.description || null, req.user.id]
      );
      const specialtyId = spRows[0].id;

      // Insert topics
      let inserted = 0;
      let skipped = 0;
      for (const t of topics) {
        const title = String(t.title).trim();
        const explanation = t.explanation ? String(t.explanation) : null;
        const { rows: exists } = await query(
          `SELECT id FROM dx_topics WHERE specialty_id=$1 AND title=$2`, [specialtyId, title]
        );
        if (exists.length > 0) { skipped++; continue; }
        await query(
          `INSERT INTO dx_topics (specialty_id, title, explanation, created_by) VALUES ($1,$2,$3,$4)`,
          [specialtyId, title, explanation, req.user.id]
        );
        inserted++;
      }

      results.push({ name, specialtyId, inserted, skipped });
    }

    res.json({ ok: true, results });
  } catch (e) {
    console.error("[dx] import failed", e);
    res.status(500).json({ error: e.message });
  }
});

// ── Specialties ────────────────────────────────────────────────────────────

router.get("/specialties", requireAuth(), async (_req, res) => {
  const cached = cacheGet("dx:specs");
  if (cached !== undefined) return res.json(cached);
  const { rows } = await query(
    `SELECT s.id, s.name, s.icon, s.description, s.position, s.created_at,
            (SELECT COUNT(*)::int FROM dx_topics t WHERE t.specialty_id = s.id) AS topic_count
       FROM dx_specialties s
      ORDER BY s.position ASC, s.name ASC`
  );
  const result = { specialties: rows };
  cacheSet("dx:specs", result, 300_000);
  res.json(result);
});

router.post("/specialties", requireAuth(["admin", "doctor"]), async (req, res) => {
  try {
    const name = (req.body?.name || "").toString().trim();
    if (!name) return res.status(400).json({ error: "name required" });
    const icon = req.body?.icon || null;
    const description = req.body?.description || null;
    const { rows } = await query(
      `INSERT INTO dx_specialties (name, icon, description, created_by)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (name) DO UPDATE SET icon=EXCLUDED.icon, description=EXCLUDED.description
       RETURNING id`,
      [name, icon, description, req.user.id]
    );
    cacheInvalidate("dx:specs");
    res.json({ ok: true, id: rows[0].id });
  } catch (e) {
    console.error("[dx] create specialty failed", e);
    res.status(500).json({ error: e.message });
  }
});

router.patch("/specialties/:id", requireAuth(["admin"]), async (req, res) => {
  const fields = [];
  const params = [];
  function add(col, val) { params.push(val); fields.push(`${col}=$${params.length}`); }
  if (req.body?.name) add("name", String(req.body.name));
  if (req.body?.icon !== undefined) add("icon", req.body.icon || null);
  if (req.body?.description !== undefined) add("description", req.body.description || null);
  if (req.body?.position != null) add("position", Number(req.body.position) || 0);
  if (!fields.length) return res.status(400).json({ error: "Nothing to update" });
  params.push(req.params.id);
  await query(`UPDATE dx_specialties SET ${fields.join(", ")} WHERE id=$${params.length}`, params);
  cacheInvalidate("dx:specs");
  cacheInvalidate(`dx:topics:${req.params.id}`);
  res.json({ ok: true });
});

router.delete("/specialties/:id", requireAuth(["admin"]), async (req, res) => {
  // Clean cloudinary assets for nested topics' attachments.
  const { rows } = await query(
    `SELECT a.storage_key FROM dx_attachments a
       JOIN dx_topics t ON t.id = a.topic_id
      WHERE t.specialty_id = $1 AND a.storage_key IS NOT NULL`,
    [req.params.id]
  );
  for (const r of rows) {
    const [resType, ...rest] = r.storage_key.split(":");
    await destroyAsset(rest.join(":"), resType).catch(() => {});
  }
  await query(`DELETE FROM dx_specialties WHERE id=$1`, [req.params.id]);
  cacheInvalidate("dx:specs");
  cacheInvalidate(`dx:topics:${req.params.id}`);
  cacheInvalidate("dx:topic:");
  res.json({ ok: true });
});

// ── Topics ─────────────────────────────────────────────────────────────────

router.get("/specialties/:id/topics", requireAuth(), async (req, res) => {
  const cacheKey = `dx:topics:${req.params.id}`;
  const cached = cacheGet(cacheKey);
  if (cached !== undefined) return res.json(cached);
  const { rows: sp } = await query(
    `SELECT id, name, icon, description FROM dx_specialties WHERE id=$1`, [req.params.id]
  );
  if (!sp[0]) return res.status(404).json({ error: "Specialty not found" });
  const { rows } = await query(
    `SELECT t.id, t.title, t.position, t.created_at, t.updated_at,
            (SELECT COUNT(*)::int FROM dx_attachments a WHERE a.topic_id = t.id) AS attachment_count
       FROM dx_topics t
      WHERE t.specialty_id = $1
      ORDER BY t.position ASC, t.title ASC`,
    [req.params.id]
  );
  const result = { specialty: sp[0], topics: rows };
  cacheSet(cacheKey, result, 120_000);
  res.json(result);
});

router.get("/topics/:id", requireAuth(), async (req, res) => {
  const cacheKey = `dx:topic:${req.params.id}`;
  const cached = cacheGet(cacheKey);
  if (cached !== undefined) return res.json(cached);
  const { rows } = await query(
    `SELECT t.id, t.specialty_id, t.title, t.explanation, t.position, t.created_at, t.updated_at,
            s.name AS specialty_name, s.icon AS specialty_icon,
            u.username AS author
       FROM dx_topics t
       JOIN dx_specialties s ON s.id = t.specialty_id
       LEFT JOIN users u ON u.id = t.created_by
      WHERE t.id = $1`,
    [req.params.id]
  );
  const t = rows[0];
  if (!t) return res.status(404).json({ error: "Topic not found" });
  const { rows: atts } = await query(
    `SELECT id, filename, mime_type, size_bytes, storage_url, kind, description, created_at
       FROM dx_attachments WHERE topic_id=$1 ORDER BY created_at ASC`,
    [req.params.id]
  );
  const result = { topic: t, attachments: atts };
  cacheSet(cacheKey, result, 120_000);
  res.json(result);
});

router.post("/specialties/:id/topics", requireAuth(["admin", "doctor"]), async (req, res) => {
  try {
    const title = (req.body?.title || "").toString().trim();
    if (!title) return res.status(400).json({ error: "title required" });
    const explanation = req.body?.explanation || null;
    const { rows } = await query(
      `INSERT INTO dx_topics (specialty_id, title, explanation, created_by)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      [req.params.id, title, explanation, req.user.id]
    );
    cacheInvalidate(`dx:topics:${req.params.id}`);
    cacheInvalidate("dx:specs");
    res.json({ ok: true, id: rows[0].id });
  } catch (e) {
    console.error("[dx] create topic failed", e);
    res.status(500).json({ error: e.message });
  }
});

router.patch("/topics/:id", requireAuth(["admin"]), async (req, res) => {
  const fields = [];
  const params = [];
  function add(col, val) { params.push(val); fields.push(`${col}=$${params.length}`); }
  if (req.body?.title) add("title", String(req.body.title));
  if (req.body?.explanation !== undefined) add("explanation", req.body.explanation || null);
  if (req.body?.position != null) add("position", Number(req.body.position) || 0);
  if (!fields.length) return res.status(400).json({ error: "Nothing to update" });
  fields.push(`updated_at=NOW()`);
  params.push(req.params.id);
  await query(`UPDATE dx_topics SET ${fields.join(", ")} WHERE id=$${params.length}`, params);
  cacheInvalidate(`dx:topic:${req.params.id}`);
  cacheInvalidate("dx:topics:");
  res.json({ ok: true });
});

router.delete("/topics/:id", requireAuth(["admin"]), async (req, res) => {
  const { rows } = await query(
    `SELECT a.storage_key, t.specialty_id FROM dx_attachments a JOIN dx_topics t ON t.id=a.topic_id WHERE a.topic_id=$1 AND a.storage_key IS NOT NULL`,
    [req.params.id]
  );
  const specialtyId = rows[0]?.specialty_id;
  for (const r of rows) {
    const [resType, ...rest] = r.storage_key.split(":");
    await destroyAsset(rest.join(":"), resType).catch(() => {});
  }
  if (!specialtyId) {
    const { rows: t } = await query(`SELECT specialty_id FROM dx_topics WHERE id=$1`, [req.params.id]);
    if (t[0]) cacheInvalidate(`dx:topics:${t[0].specialty_id}`);
  } else {
    cacheInvalidate(`dx:topics:${specialtyId}`);
  }
  await query(`DELETE FROM dx_topics WHERE id=$1`, [req.params.id]);
  cacheInvalidate(`dx:topic:${req.params.id}`);
  cacheInvalidate("dx:specs");
  res.json({ ok: true });
});

// ── Attachments ────────────────────────────────────────────────────────────

router.post("/topics/:id/attachments", requireAuth(["admin", "doctor"]), upload.array("files", 8), async (req, res) => {
  try {
    if (!cloudinaryReady()) return res.status(503).json({ error: "File uploads not configured on this server" });
    const inserted = [];
    for (const file of (req.files || [])) {
      const resType = resourceTypeFor(file.mimetype);
      const result = await uploadBuffer(file.buffer, {
        folder: `reasonal/dx/${req.params.id}`,
        resourceType: resType,
        filename: file.originalname.replace(/\.[^.]+$/, "").replace(/[^a-z0-9_-]+/gi, "_").slice(0, 60),
      });
      const kind = classifyKind(file.mimetype);
      const { rows } = await query(
        `INSERT INTO dx_attachments (topic_id, filename, mime_type, size_bytes, storage_url, storage_key, kind, uploader_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING id, filename, mime_type, size_bytes, storage_url, kind, created_at`,
        [req.params.id, file.originalname, file.mimetype, file.size, result.secure_url, `${resType}:${result.public_id}`, kind, req.user.id]
      );
      inserted.push(rows[0]);
    }
    cacheInvalidate(`dx:topic:${req.params.id}`);
    res.json({ ok: true, attachments: inserted });
  } catch (e) {
    console.error("[dx] upload attachments failed", e);
    res.status(500).json({ error: e.message });
  }
});

router.patch("/attachments/:id", requireAuth(["admin", "doctor"]), async (req, res) => {
  const description = req.body?.description ?? null;
  await query(`UPDATE dx_attachments SET description=$1 WHERE id=$2`, [description || null, req.params.id]);
  res.json({ ok: true });
});

router.delete("/attachments/:id", requireAuth(["admin"]), async (req, res) => {
  const { rows } = await query(`SELECT storage_key, topic_id FROM dx_attachments WHERE id=$1`, [req.params.id]);
  const a = rows[0];
  if (a?.storage_key) {
    const [resType, ...rest] = a.storage_key.split(":");
    await destroyAsset(rest.join(":"), resType).catch(() => {});
  }
  await query(`DELETE FROM dx_attachments WHERE id=$1`, [req.params.id]);
  if (a?.topic_id) cacheInvalidate(`dx:topic:${a.topic_id}`);
  res.json({ ok: true });
});

export default router;
