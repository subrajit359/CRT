import { Router } from "express";
import multer from "multer";
import { query } from "../db.js";
import { requireAuth } from "../auth-middleware.js";
import { uploadBuffer, destroyAsset, isConfigured as cloudinaryReady } from "../cloudinary.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ── Helpers ─────────────────────────────────────────────────────────────────

async function loadPostWithSections(postId) {
  const { rows: posts } = await query(
    `SELECT p.*, u.username AS author
       FROM blog_posts p LEFT JOIN users u ON u.id = p.created_by
      WHERE p.id = $1`,
    [postId]
  );
  if (!posts[0]) return null;
  const post = posts[0];
  const { rows: sections } = await query(
    `SELECT * FROM blog_post_sections WHERE post_id = $1 ORDER BY position ASC, created_at ASC`,
    [postId]
  );
  for (const sec of sections) {
    const { rows: items } = await query(
      `SELECT * FROM blog_section_items WHERE section_id = $1 ORDER BY position ASC, created_at ASC`,
      [sec.id]
    );
    sec.items = items;
  }
  post.sections = sections;
  return post;
}

// ── Public / authenticated reads ─────────────────────────────────────────────

// GET /api/blog/posts   — list (paginated, searchable)
router.get("/posts", requireAuth(), async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));
  const q = (req.query.q || "").trim();
  const tag = (req.query.tag || "").trim();
  const isManager = req.user && ["admin", "doctor"].includes(req.user.role);

  const conditions = [];
  const params = [];
  let pi = 1;

  if (!isManager) {
    conditions.push(`p.published = true`);
  }
  if (q) {
    params.push(`%${q}%`);
    conditions.push(`(p.title ILIKE $${pi} OR p.excerpt ILIKE $${pi})`);
    pi++;
  }
  if (tag) {
    params.push(tag);
    conditions.push(`$${pi} = ANY(p.tags)`);
    pi++;
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const offset = (page - 1) * limit;

  const { rows: posts } = await query(
    `SELECT p.id, p.title, p.excerpt, p.thumbnail_url, p.read_time, p.views,
            p.tags, p.published, p.created_at, p.updated_at, u.username AS author
       FROM blog_posts p LEFT JOIN users u ON u.id = p.created_by
      ${where}
      ORDER BY p.created_at DESC
      LIMIT ${limit} OFFSET ${offset}`,
    params
  );
  const { rows: countRows } = await query(
    `SELECT COUNT(*)::int AS total FROM blog_posts p ${where}`,
    params
  );
  const total = countRows[0]?.total || 0;

  res.json({ posts, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) });
});

// GET /api/blog/posts/:id
router.get("/posts/:id", requireAuth(), async (req, res) => {
  const post = await loadPostWithSections(req.params.id);
  if (!post) return res.status(404).json({ error: "Not found" });
  const isManager = req.user && ["admin", "doctor"].includes(req.user.role);
  if (!post.published && !isManager) return res.status(404).json({ error: "Not found" });
  res.json(post);
});

// POST /api/blog/posts/:id/view — increment view counter (fire-and-forget)
router.post("/posts/:id/view", requireAuth(), async (req, res) => {
  await query(`UPDATE blog_posts SET views = views + 1 WHERE id = $1`, [req.params.id]).catch(() => {});
  res.json({ ok: true });
});

// ── Admin / doctor mutations ──────────────────────────────────────────────────

// POST /api/blog/posts
router.post("/posts", requireAuth(["admin", "doctor"]), async (req, res) => {
  const { title, excerpt, read_time, tags, published } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: "Title required" });
  const tagsArr = Array.isArray(tags) ? tags : [];
  const { rows } = await query(
    `INSERT INTO blog_posts (title, excerpt, read_time, tags, published, created_by)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [title.trim(), excerpt || null, read_time || "1 min read", tagsArr, !!published, req.user.id]
  );
  res.json(rows[0]);
});

// PATCH /api/blog/posts/:id
router.patch("/posts/:id", requireAuth(["admin", "doctor"]), async (req, res) => {
  const { title, excerpt, read_time, tags, published } = req.body;
  const { rows } = await query(
    `UPDATE blog_posts
        SET title = COALESCE($1, title),
            excerpt = COALESCE($2, excerpt),
            read_time = COALESCE($3, read_time),
            tags = COALESCE($4, tags),
            published = COALESCE($5, published),
            updated_at = NOW()
      WHERE id = $6 RETURNING *`,
    [
      title?.trim() || null,
      excerpt !== undefined ? excerpt : null,
      read_time || null,
      Array.isArray(tags) ? tags : null,
      published !== undefined ? !!published : null,
      req.params.id,
    ]
  );
  if (!rows[0]) return res.status(404).json({ error: "Not found" });
  res.json(rows[0]);
});

// DELETE /api/blog/posts/:id
router.delete("/posts/:id", requireAuth(["admin"]), async (req, res) => {
  const { rows } = await query(`DELETE FROM blog_posts WHERE id = $1 RETURNING thumbnail_key`, [req.params.id]);
  if (rows[0]?.thumbnail_key) {
    destroyAsset(rows[0].thumbnail_key).catch(() => {});
  }
  res.json({ ok: true });
});

// POST /api/blog/posts/:id/thumbnail — Cloudinary upload
router.post(
  "/posts/:id/thumbnail",
  requireAuth(["admin", "doctor"]),
  upload.single("thumbnail"),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file" });
    if (!cloudinaryReady()) return res.status(503).json({ error: "Cloudinary not configured" });

    const { rows: existing } = await query(`SELECT thumbnail_key FROM blog_posts WHERE id = $1`, [req.params.id]);
    if (!existing[0]) return res.status(404).json({ error: "Post not found" });

    const result = await uploadBuffer(req.file.buffer, { folder: "blog-thumbnails", resourceType: "image" });
    if (existing[0].thumbnail_key) destroyAsset(existing[0].thumbnail_key).catch(() => {});

    const { rows } = await query(
      `UPDATE blog_posts SET thumbnail_url = $1, thumbnail_key = $2, updated_at = NOW() WHERE id = $3 RETURNING thumbnail_url`,
      [result.secure_url, result.public_id, req.params.id]
    );
    res.json({ thumbnail_url: rows[0].thumbnail_url });
  }
);

// ── Sections ──────────────────────────────────────────────────────────────────

// POST /api/blog/posts/:id/sections
router.post("/posts/:postId/sections", requireAuth(["admin", "doctor"]), async (req, res) => {
  const { title, image_url, position } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: "Title required" });
  const { rows: maxRows } = await query(
    `SELECT COALESCE(MAX(position), -1) + 1 AS next FROM blog_post_sections WHERE post_id = $1`,
    [req.params.postId]
  );
  const pos = position !== undefined ? position : maxRows[0].next;
  const { rows } = await query(
    `INSERT INTO blog_post_sections (post_id, title, image_url, position) VALUES ($1,$2,$3,$4) RETURNING *`,
    [req.params.postId, title.trim(), image_url || null, pos]
  );
  rows[0].items = [];
  res.json(rows[0]);
});

// PATCH /api/blog/sections/:id
router.patch("/sections/:id", requireAuth(["admin", "doctor"]), async (req, res) => {
  const { title, image_url, position } = req.body;
  const { rows } = await query(
    `UPDATE blog_post_sections
        SET title = COALESCE($1, title),
            image_url = COALESCE($2, image_url),
            position = COALESCE($3, position)
      WHERE id = $4 RETURNING *`,
    [title?.trim() || null, image_url !== undefined ? image_url : null, position !== undefined ? position : null, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: "Not found" });
  const { rows: items } = await query(
    `SELECT * FROM blog_section_items WHERE section_id = $1 ORDER BY position ASC`,
    [rows[0].id]
  );
  rows[0].items = items;
  res.json(rows[0]);
});

// DELETE /api/blog/sections/:id
router.delete("/sections/:id", requireAuth(["admin", "doctor"]), async (req, res) => {
  await query(`DELETE FROM blog_post_sections WHERE id = $1`, [req.params.id]);
  res.json({ ok: true });
});

// ── Items ─────────────────────────────────────────────────────────────────────

// POST /api/blog/sections/:sectionId/items
router.post("/sections/:sectionId/items", requireAuth(["admin", "doctor"]), async (req, res) => {
  const { label, drive_url, position } = req.body;
  if (!label?.trim()) return res.status(400).json({ error: "Label required" });
  const { rows: maxRows } = await query(
    `SELECT COALESCE(MAX(position), -1) + 1 AS next FROM blog_section_items WHERE section_id = $1`,
    [req.params.sectionId]
  );
  const pos = position !== undefined ? position : maxRows[0].next;
  const { rows } = await query(
    `INSERT INTO blog_section_items (section_id, label, drive_url, position) VALUES ($1,$2,$3,$4) RETURNING *`,
    [req.params.sectionId, label.trim(), drive_url || null, pos]
  );
  res.json(rows[0]);
});

// PATCH /api/blog/items/:id
router.patch("/items/:id", requireAuth(["admin", "doctor"]), async (req, res) => {
  const { label, drive_url, position } = req.body;
  const { rows } = await query(
    `UPDATE blog_section_items
        SET label = COALESCE($1, label),
            drive_url = COALESCE($2, drive_url),
            position = COALESCE($3, position)
      WHERE id = $4 RETURNING *`,
    [label?.trim() || null, drive_url !== undefined ? drive_url : null, position !== undefined ? position : null, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: "Not found" });
  res.json(rows[0]);
});

// DELETE /api/blog/items/:id
router.delete("/items/:id", requireAuth(["admin", "doctor"]), async (req, res) => {
  await query(`DELETE FROM blog_section_items WHERE id = $1`, [req.params.id]);
  res.json({ ok: true });
});

export default router;
