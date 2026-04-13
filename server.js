const express = require('express');
const multer  = require('multer');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');

const app  = express();
const PORT = process.env.PORT || 1919;
const UPLOAD_DIR = path.join(__dirname, 'uploads');

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── Multer storage config ─────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename:    (req, file, cb) => {
    // Preserve original name; prefix timestamp to avoid collisions
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}_${safe}`);
  }
});
const upload = multer({ storage });

// ── Routes ────────────────────────────────────────────────────────────────────

// POST /upload  – upload one or more files
app.post('/upload', upload.array('files'), (req, res) => {
  if (!req.files || req.files.length === 0)
    return res.status(400).json({ error: 'No files received' });

  const saved = req.files.map(f => ({
    stored: f.filename,
    original: f.originalname,
    size: f.size
  }));
  res.json({ message: 'Upload successful', files: saved });
});

// GET /files  – list all stored files
app.get('/files', (req, res) => {
  const items = fs.readdirSync(UPLOAD_DIR).map(name => {
    const stat = fs.statSync(path.join(UPLOAD_DIR, name));
    return { name, size: stat.size, modified: stat.mtime };
  });
  res.json({ count: items.length, files: items });
});

// GET /files/:name  – download a file
app.get('/files/:name', (req, res) => {
  const file = path.join(UPLOAD_DIR, path.basename(req.params.name));
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'Not found' });
  res.download(file);
});

// DELETE /files/:name  – delete a file
app.delete('/files/:name', (req, res) => {
  const file = path.join(UPLOAD_DIR, path.basename(req.params.name));
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'Not found' });
  fs.unlinkSync(file);
  res.json({ message: `Deleted: ${req.params.name}` });
});

// GET /  – health check
app.get('/', (req, res) => res.json({ status: 'running', port: PORT }));

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n  File Store running at http://localhost:${PORT}`);
  console.log(`  Upload folder : ${UPLOAD_DIR}\n`);
});
