import { Router } from 'express';
import multer from 'multer';
import { uploadBuffer, isConfigured as cloudinaryReady } from '../cloudinary.js';
import { query } from '../db.js';
import { cacheGet, cacheSet, cacheInvalidate } from '../cache.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

/* ── Posts ── */
router.get('/posts', async (req, res) => {
  try {
    const cached = cacheGet('neet:posts');
    if (cached !== undefined) return res.json(cached);
    const result = await query(
      'SELECT id, title, description, thumbnail_url, date, badge, keywords, views, created_at FROM neet_posts ORDER BY created_at DESC'
    );
    cacheSet('neet:posts', result.rows, 120_000);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/posts/:id', async (req, res) => {
  try {
    const cacheKey = `neet:post:${req.params.id}`;
    const cached = cacheGet(cacheKey);
    if (cached !== undefined) return res.json(cached);

    const postResult = await query(
      'SELECT id, title, description, thumbnail_url, date, badge, keywords, views, created_at FROM neet_posts WHERE id=$1',
      [req.params.id]
    );
    if (!postResult.rows.length) return res.status(404).json({ error: 'Not found' });
    const post = postResult.rows[0];
    const sectionsResult = await query(
      'SELECT id, post_id, title, image_url, order_index, created_at FROM neet_sections WHERE post_id=$1 ORDER BY order_index',
      [post.id]
    );
    const sections = await Promise.all(
      sectionsResult.rows.map(async (section) => {
        const resourcesResult = await query(
          'SELECT id, section_id, title, description, drive_link, order_index, created_at FROM neet_resources WHERE section_id=$1 ORDER BY order_index',
          [section.id]
        );
        return { ...section, resources: resourcesResult.rows };
      })
    );
    const full = { ...post, sections };
    cacheSet(cacheKey, full, 120_000);
    res.json(full);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/posts', async (req, res) => {
  try {
    const { title, description, thumbnail_url, date, badge, keywords } = req.body;
    const result = await query(
      'INSERT INTO neet_posts (title, description, thumbnail_url, date, badge, keywords) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, title, description, thumbnail_url, date, badge, keywords, views, created_at',
      [title, description || '', thumbnail_url || '', date || null, badge || 'General', keywords || '']
    );
    cacheInvalidate('neet:posts');
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/posts/:id', async (req, res) => {
  try {
    const { title, description, thumbnail_url, date, badge, keywords } = req.body;
    const result = await query(
      'UPDATE neet_posts SET title=$1, description=$2, thumbnail_url=$3, date=$4, badge=$5, keywords=$6 WHERE id=$7 RETURNING id, title, description, thumbnail_url, date, badge, keywords, views, created_at',
      [title, description || '', thumbnail_url || '', date || null, badge || 'General', keywords || '', req.params.id]
    );
    cacheInvalidate('neet:posts');
    cacheInvalidate(`neet:post:${req.params.id}`);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/posts/:id/view', async (req, res) => {
  try {
    const result = await query(
      'UPDATE neet_posts SET views = views + 1 WHERE id=$1 RETURNING views',
      [req.params.id]
    );
    res.json({ views: result.rows[0]?.views ?? 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/posts/:id', async (req, res) => {
  try {
    await query('DELETE FROM neet_posts WHERE id=$1', [req.params.id]);
    cacheInvalidate('neet:posts');
    cacheInvalidate(`neet:post:${req.params.id}`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── Sections ── */
router.post('/sections', async (req, res) => {
  try {
    const { post_id, title, image_url, order_index } = req.body;
    const result = await query(
      'INSERT INTO neet_sections (post_id, title, image_url, order_index) VALUES ($1, $2, $3, $4) RETURNING id, post_id, title, image_url, order_index, created_at',
      [post_id, title || 'New Section', image_url || '', order_index || 0]
    );
    if (post_id) cacheInvalidate(`neet:post:${post_id}`);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/sections/:id', async (req, res) => {
  try {
    const { title, image_url, order_index } = req.body;
    const result = await query(
      'UPDATE neet_sections SET title=$1, image_url=$2, order_index=$3 WHERE id=$4 RETURNING id, post_id, title, image_url, order_index, created_at',
      [title, image_url || '', order_index ?? 0, req.params.id]
    );
    cacheInvalidate('neet:post:');
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/sections/:id', async (req, res) => {
  try {
    await query('DELETE FROM neet_sections WHERE id=$1', [req.params.id]);
    cacheInvalidate('neet:post:');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── Resources ── */
router.post('/resources', async (req, res) => {
  try {
    const { section_id, title, description, drive_link, order_index } = req.body;
    const result = await query(
      'INSERT INTO neet_resources (section_id, title, description, drive_link, order_index) VALUES ($1, $2, $3, $4, $5) RETURNING id, section_id, title, description, drive_link, order_index, created_at',
      [section_id, title || '', description || '', drive_link || '', order_index || 0]
    );
    cacheInvalidate('neet:post:');
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/resources/:id', async (req, res) => {
  try {
    const { title, description, drive_link, order_index } = req.body;
    const result = await query(
      'UPDATE neet_resources SET title=$1, description=$2, drive_link=$3, order_index=$4 WHERE id=$5 RETURNING id, section_id, title, description, drive_link, order_index, created_at',
      [title || '', description || '', drive_link || '', order_index ?? 0, req.params.id]
    );
    cacheInvalidate('neet:post:');
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/resources/:id', async (req, res) => {
  try {
    await query('DELETE FROM neet_resources WHERE id=$1', [req.params.id]);
    cacheInvalidate('neet:post:');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── Stats ── */
router.get('/stats', async (req, res) => {
  try {
    const cached = cacheGet('neet:stats');
    if (cached !== undefined) return res.json(cached);
    const [postsRes, resourcesRes, viewsRes] = await Promise.all([
      query('SELECT COUNT(*)::int AS n FROM neet_posts'),
      query('SELECT COUNT(*)::int AS n FROM neet_resources'),
      query('SELECT COALESCE(SUM(views), 0)::int AS total FROM neet_posts'),
    ]);
    const result = {
      totalPosts: postsRes.rows[0].n,
      totalResources: resourcesRes.rows[0].n,
      totalViews: viewsRes.rows[0].total,
      totalDownloads: 0,
    };
    cacheSet('neet:stats', result, 120_000);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── Upload ── */
router.post('/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file provided' });
    if (!cloudinaryReady()) return res.status(503).json({ error: 'Cloudinary not configured' });
    const result = await uploadBuffer(req.file.buffer, { folder: 'neet-pages', resourceType: 'image' });
    res.json({ url: result.secure_url });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Upload failed' });
  }
});

/* ── Download proxy ── */
function getDriveDirectUrl(link) {
  const fileMatch = link.match(/\/file\/d\/([^/?&#]+)/);
  if (fileMatch) return `https://drive.google.com/uc?export=download&id=${fileMatch[1]}&confirm=t`;
  const idMatch = link.match(/[?&]id=([^&]+)/);
  if (idMatch) return `https://drive.google.com/uc?export=download&id=${idMatch[1]}&confirm=t`;
  return link;
}

router.get('/download', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing url parameter' });
  try {
    const directUrl = getDriveDirectUrl(decodeURIComponent(url));
    const response = await fetch(directUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      redirect: 'follow',
    });
    if (!response.ok) return res.status(502).json({ error: 'Failed to fetch file' });
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const contentDisposition = response.headers.get('content-disposition');
    res.setHeader('Content-Type', contentType);
    if (contentDisposition) {
      res.setHeader('Content-Disposition', contentDisposition);
    } else {
      res.setHeader('Content-Disposition', 'attachment; filename="download"');
    }
    const contentLength = response.headers.get('content-length');
    if (contentLength) res.setHeader('Content-Length', contentLength);
    const reader = response.body.getReader();
    const pump = async () => {
      const { done, value } = await reader.read();
      if (done) { res.end(); return; }
      res.write(Buffer.from(value));
      await pump();
    };
    await pump();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
