import { Router } from "express";
import multer from "multer";
import { query } from "../db.js";
import { requireAuth } from "../auth-middleware.js";
import { uploadBuffer, destroyAsset, isConfigured as cloudinaryReady } from "../cloudinary.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

function classifyKind(mime = "") {
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf") return "pdf";
  if (mime.includes("powerpoint") || mime.includes("presentation")) return "pptx";
  if (mime.includes("word") || mime.includes("document")) return "doc";
  if (mime === "video/mp4" || mime.startsWith("video/")) return "video";
  return "other";
}

function resourceTypeFor(mime = "") {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  return "raw";
}

// ── Categories ─────────────────────────────────────────────────────────────

// List children of a category (or roots when no parent given).
router.get("/categories", requireAuth(), async (req, res) => {
  const parent = (req.query.parent || "").toString();
  const params = [];
  let where = "parent_id IS NULL";
  if (parent) { params.push(parent); where = `parent_id = $1`; }
  const { rows } = await query(
    `SELECT c.id, c.name, c.parent_id, c.position, c.created_at,
            c.description, c.thumbnail_url,
            (SELECT COUNT(*)::int FROM study_categories x WHERE x.parent_id = c.id) AS child_count,
            (SELECT COUNT(*)::int FROM study_resources r WHERE r.category_id = c.id) AS resource_count,
            u.username AS author
       FROM study_categories c LEFT JOIN users u ON u.id = c.created_by
      WHERE ${where}
      ORDER BY c.position ASC, c.created_at DESC`,
    params
  );
  res.json({ categories: rows });
});

// Breadcrumb (root → ... → this category)
router.get("/categories/:id/path", requireAuth(), async (req, res) => {
  const { rows } = await query(
    `WITH RECURSIVE chain AS (
       SELECT id, name, parent_id, description, thumbnail_url, 0 AS depth FROM study_categories WHERE id = $1
       UNION ALL
       SELECT c.id, c.name, c.parent_id, c.description, c.thumbnail_url, chain.depth + 1
         FROM study_categories c JOIN chain ON chain.parent_id = c.id
     )
     SELECT id, name, description, thumbnail_url FROM chain ORDER BY depth DESC`,
    [req.params.id]
  );
  res.json({ path: rows });
});

router.post("/categories", requireAuth(["admin", "doctor"]), async (req, res) => {
  try {
    const name = (req.body?.name || "").toString().trim();
    const parentId = req.body?.parent_id || null;
    const description = (req.body?.description || "").toString().trim() || null;
    if (!name) return res.status(400).json({ error: "name required" });
    const { rows } = await query(
      `INSERT INTO study_categories (name, parent_id, description, created_by) VALUES ($1,$2,$3,$4) RETURNING id`,
      [name, parentId, description, req.user.id]
    );
    res.json({ ok: true, id: rows[0].id });
  } catch (e) {
    console.error("[study] create category failed", e);
    res.status(500).json({ error: e.message });
  }
});

router.patch("/categories/:id", requireAuth(["admin", "doctor"]), async (req, res) => {
  const fields = [];
  const params = [];
  function add(col, val) { params.push(val); fields.push(`${col}=$${params.length}`); }
  if (req.body?.name) add("name", String(req.body.name));
  if (req.body?.position != null) add("position", Number(req.body.position) || 0);
  if (req.body?.description !== undefined) add("description", req.body.description || null);
  if (!fields.length) return res.status(400).json({ error: "Nothing to update" });
  params.push(req.params.id);
  await query(`UPDATE study_categories SET ${fields.join(", ")} WHERE id=$${params.length}`, params);
  res.json({ ok: true });
});

// Upload / replace thumbnail for a category
router.post("/categories/:id/thumbnail", requireAuth(["admin", "doctor"]), upload.single("thumbnail"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file" });
    if (!cloudinaryReady()) return res.status(503).json({ error: "File uploads not configured" });
    // Delete old thumbnail if any
    const { rows: existing } = await query(`SELECT thumbnail_key FROM study_categories WHERE id=$1`, [req.params.id]);
    const old = existing[0]?.thumbnail_key;
    if (old) await destroyAsset(old, "image").catch(() => {});
    // Upload new
    const result = await uploadBuffer(req.file.buffer, {
      folder: "reasonal/study-thumbs",
      resourceType: "image",
      filename: `cat-${req.params.id}`,
    });
    await query(
      `UPDATE study_categories SET thumbnail_url=$1, thumbnail_key=$2 WHERE id=$3`,
      [result.secure_url, result.public_id, req.params.id]
    );
    res.json({ ok: true, thumbnail_url: result.secure_url });
  } catch (e) {
    console.error("[study] thumbnail upload failed", e);
    res.status(500).json({ error: e.message });
  }
});

router.delete("/categories/:id", requireAuth(["admin"]), async (req, res) => {
  // Delete cloudinary assets for any nested resources + thumbnail first.
  const { rows } = await query(
    `WITH RECURSIVE tree AS (
       SELECT id FROM study_categories WHERE id = $1
       UNION ALL
       SELECT c.id FROM study_categories c JOIN tree ON c.parent_id = tree.id
     )
     SELECT r.storage_key FROM study_resources r WHERE r.category_id IN (SELECT id FROM tree) AND r.storage_key IS NOT NULL`,
    [req.params.id]
  );
  for (const r of rows) {
    if (!r.storage_key) continue;
    const [resType, ...rest] = r.storage_key.split(":");
    await destroyAsset(rest.join(":"), resType).catch(() => {});
  }
  // Delete category thumbnail
  const { rows: cats } = await query(
    `WITH RECURSIVE tree AS (SELECT id, thumbnail_key FROM study_categories WHERE id=$1 UNION ALL SELECT c.id, c.thumbnail_key FROM study_categories c JOIN tree ON c.parent_id = tree.id) SELECT thumbnail_key FROM tree WHERE thumbnail_key IS NOT NULL`,
    [req.params.id]
  );
  for (const c of cats) {
    if (c.thumbnail_key) await destroyAsset(c.thumbnail_key, "image").catch(() => {});
  }
  await query(`DELETE FROM study_categories WHERE id=$1`, [req.params.id]);
  res.json({ ok: true });
});

// ── Search ─────────────────────────────────────────────────────────────────

router.get("/search", requireAuth(), async (req, res) => {
  const q = (req.query.q || "").toString().trim();
  if (!q) return res.json({ results: [] });
  const like = `%${q}%`;
  const { rows } = await query(
    `SELECT r.id, r.title, r.description, r.kind, r.storage_url, r.created_at,
            u.username AS uploader,
            c.id AS category_id, c.name AS category_name,
            p.id AS parent_id, p.name AS parent_name
       FROM study_resources r
       LEFT JOIN users u ON u.id = r.uploader_id
       LEFT JOIN study_categories c ON c.id = r.category_id
       LEFT JOIN study_categories p ON p.id = c.parent_id
      WHERE r.title ILIKE $1 OR r.description ILIKE $1
      ORDER BY r.title ASC
      LIMIT 40`,
    [like]
  );
  res.json({ results: rows });
});

// ── Resources ──────────────────────────────────────────────────────────────

router.get("/categories/:id/resources", requireAuth(), async (req, res) => {
  const { rows } = await query(
    `SELECT r.id, r.title, r.description, r.filename, r.mime_type, r.size_bytes,
            r.storage_url, r.kind, r.created_at,
            u.username AS uploader, u.role AS uploader_role
       FROM study_resources r LEFT JOIN users u ON u.id = r.uploader_id
      WHERE r.category_id = $1
      ORDER BY r.created_at DESC`,
    [req.params.id]
  );
  res.json({ resources: rows });
});

router.post("/categories/:id/resources", requireAuth(["admin", "doctor"]), upload.single("file"), async (req, res) => {
  try {
    const title = (req.body?.title || "").toString().trim();
    const description = (req.body?.description || "").toString();
    if (!title) return res.status(400).json({ error: "title required" });
    const file = req.file;
    let storage_url = null, storage_key = null, mime_type = null, size_bytes = null, kind = null, filename = null;
    if (file) {
      if (!cloudinaryReady()) return res.status(503).json({ error: "File uploads not configured on this server" });
      const resType = resourceTypeFor(file.mimetype);
      const result = await uploadBuffer(file.buffer, {
        folder: `reasonal/study/${req.params.id}`,
        resourceType: resType,
        filename: file.originalname.replace(/\.[^.]+$/, "").replace(/[^a-z0-9_-]+/gi, "_").slice(0, 60),
      });
      storage_url = result.secure_url;
      storage_key = `${resType}:${result.public_id}`;
      mime_type = file.mimetype;
      size_bytes = file.size;
      filename = file.originalname;
      kind = classifyKind(file.mimetype);
    }
    const { rows } = await query(
      `INSERT INTO study_resources (category_id, title, description, filename, mime_type, size_bytes, storage_url, storage_key, kind, uploader_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id`,
      [req.params.id, title, description, filename, mime_type, size_bytes, storage_url, storage_key, kind, req.user.id]
    );
    res.json({ ok: true, id: rows[0].id });
  } catch (e) {
    console.error("[study] create resource failed", e);
    res.status(500).json({ error: e.message });
  }
});

router.patch("/resources/:id", requireAuth(["admin"]), async (req, res) => {
  const fields = [];
  const params = [];
  function add(col, val) { params.push(val); fields.push(`${col}=$${params.length}`); }
  if (req.body?.title) add("title", String(req.body.title));
  if (req.body?.description !== undefined) add("description", req.body.description);
  if (!fields.length) return res.status(400).json({ error: "Nothing to update" });
  params.push(req.params.id);
  await query(`UPDATE study_resources SET ${fields.join(", ")} WHERE id=$${params.length}`, params);
  res.json({ ok: true });
});

router.delete("/resources/:id", requireAuth(["admin"]), async (req, res) => {
  const { rows } = await query(`SELECT storage_key FROM study_resources WHERE id=$1`, [req.params.id]);
  const r = rows[0];
  if (r?.storage_key) {
    const [resType, ...rest] = r.storage_key.split(":");
    await destroyAsset(rest.join(":"), resType).catch(() => {});
  }
  await query(`DELETE FROM study_resources WHERE id=$1`, [req.params.id]);
  res.json({ ok: true });
});

export default router;
