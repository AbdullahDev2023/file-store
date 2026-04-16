const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 1919;
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const SESSION_DIR = path.join(UPLOAD_DIR, '.sessions');
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'https://store.visioncoachinginstitute.online';

// ── Bootstrap storage folders ────────────────────────────────────────────────
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(SESSION_DIR, { recursive: true });

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Multer storage config ─────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const safe = sanitizeFilename(file.originalname);
    cb(null, `${Date.now()}_${safe}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 40 * 1024 * 1024 * 1024 } // 40 GB
});

function sanitizeFilename(name) {
  return path.basename(String(name || 'file')).replace(/[^a-zA-Z0-9._-]/g, '_');
}

function fileUrl(req, storedName) {
  return `${req.protocol}://${req.get('host')}/files/${encodeURIComponent(storedName)}`;
}

function sessionPath(uploadId) {
  return path.join(SESSION_DIR, `${uploadId}.json`);
}

function loadSession(uploadId) {
  const file = sessionPath(uploadId);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function saveSession(session) {
  fs.writeFileSync(sessionPath(session.uploadId), JSON.stringify(session, null, 2));
}

function deleteSession(uploadId) {
  const file = sessionPath(uploadId);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

function ensureSession(uploadId) {
  const session = loadSession(uploadId);
  if (!session) {
    const err = new Error('Upload session not found');
    err.statusCode = 404;
    throw err;
  }
  return session;
}

function createStoredName(originalName) {
  return `${Date.now()}_${sanitizeFilename(originalName)}`;
}

function resolveUploadPath(storedName) {
  return path.join(UPLOAD_DIR, path.basename(storedName));
}

function listStoredFiles() {
  return fs.readdirSync(UPLOAD_DIR)
    .filter(name => name !== '.sessions')
    .map(name => {
      const fullPath = resolveUploadPath(name);
      const stat = fs.statSync(fullPath);
      if (!stat.isFile()) return null;
      return { name, size: stat.size, modified: stat.mtime };
    })
    .filter(Boolean);
}

// ── Resumable upload helpers ─────────────────────────────────────────────────
function createResumableSession(originalName, totalChunks, totalSize) {
  const uploadId = crypto.randomUUID();
  const storedName = createStoredName(originalName);
  const session = {
    uploadId,
    originalName,
    storedName,
    totalChunks,
    totalSize,
    receivedChunks: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  saveSession(session);
  return session;
}

function chunkPath(uploadId, chunkIndex) {
  return path.join(SESSION_DIR, `${uploadId}.${chunkIndex}.part`);
}

function assembleChunks(session) {
  const targetPath = resolveUploadPath(session.storedName);
  const parts = [];

  for (let index = 0; index < session.totalChunks; index += 1) {
    const partPath = chunkPath(session.uploadId, index);
    if (!fs.existsSync(partPath)) {
      throw new Error(`Missing chunk ${index}`);
    }
    parts.push(fs.readFileSync(partPath));
  }

  fs.writeFileSync(targetPath, Buffer.concat(parts));
}

function buildFilePayload(req, name, originalName, size) {
  return {
    stored: name,
    original: originalName,
    size,
    url: fileUrl(req, name)
  };
}

function isVideoFile(name) {
  return ['.mp4', '.webm', '.mov', '.m4v', '.ogg', '.avi', '.mkv']
    .includes(path.extname(name).toLowerCase());
}

function sendVideoWithRange(req, res, filePath) {
  const stat = fs.statSync(filePath);
  const range = req.headers.range;

  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', `video/${path.extname(filePath).slice(1).toLowerCase() === 'm4v' ? 'mp4' : path.extname(filePath).slice(1).toLowerCase()}`);

  if (!range) {
    res.setHeader('Content-Length', stat.size);
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  const match = range.match(/bytes=(\d+)-(\d*)/);
  if (!match) {
    res.status(416).end();
    return;
  }

  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : stat.size - 1;
  if (start >= stat.size || end >= stat.size) {
    res.status(416).setHeader('Content-Range', `bytes */${stat.size}`).end();
    return;
  }

  const chunkEnd = Math.min(end, stat.size - 1);
  res.status(206);
  res.setHeader('Content-Range', `bytes ${start}-${chunkEnd}/${stat.size}`);
  res.setHeader('Content-Length', chunkEnd - start + 1);
  fs.createReadStream(filePath, { start, end: chunkEnd }).pipe(res);
}

function renderVideoPage(name, fileUrlPath) {
  const safeName = String(name).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeName} - File Store</title>
  <style>
    :root { color-scheme: dark; }
    body { margin: 0; font-family: Arial, sans-serif; background: #0b0b10; color: #fff; }
    .shell { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
    .card { width: min(1100px, 100%); background: #15151d; border: 1px solid #2b2b36; border-radius: 18px; overflow: hidden; box-shadow: 0 20px 80px rgba(0,0,0,.45); }
    .top { padding: 18px 20px; display: flex; justify-content: space-between; gap: 16px; align-items: center; border-bottom: 1px solid #2b2b36; }
    .name { font-size: 14px; font-weight: 600; word-break: break-all; }
    .back { color: #9ca3af; text-decoration: none; font-size: 14px; }
    .player { background: #000; }
    video { display: block; width: 100%; max-height: calc(100vh - 180px); background: #000; }
    .meta { padding: 14px 20px 20px; color: #9ca3af; font-size: 13px; }
    .meta a { color: #8b5cf6; }
  </style>
</head>
<body>
  <div class="shell">
    <div class="card">
      <div class="top">
        <div class="name">${safeName}</div>
        <a class="back" href="/">Back to files</a>
      </div>
      <div class="player">
        <video controls autoplay playsinline preload="metadata">
          <source src="${fileUrlPath}" />
        </video>
      </div>
      <div class="meta">
        Streamed from File Store. If playback does not start, open the direct file URL: <a href="${fileUrlPath}">${fileUrlPath}</a>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function renderGuidePage(baseUrl) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>File Store Guide</title>
  <style>
    :root { color-scheme: dark; }
    body { margin: 0; font-family: Arial, sans-serif; background: #09090b; color: #fafafa; }
    .wrap { max-width: 1100px; margin: 0 auto; padding: 32px 20px 60px; }
    h1 { font-size: 28px; margin-bottom: 8px; }
    p, li { color: #a1a1aa; line-height: 1.6; }
    .card { background: #14141a; border: 1px solid #2a2a35; border-radius: 16px; padding: 20px; margin: 18px 0; }
    pre { overflow:auto; background:#0f0f14; border:1px solid #2a2a35; border-radius:12px; padding:16px; }
    code { font-family: Consolas, monospace; font-size: 13px; }
    .tag { display:inline-block; padding:4px 10px; border-radius:999px; background:#1f1f29; color:#d4d4d8; font-size:12px; margin-right:8px; }
    a { color: #8b5cf6; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>File Store Guide</h1>
    <p>Hosted base URL: <a href="${baseUrl}">${baseUrl}</a></p>
    <div class="card">
      <span class="tag">PowerShell curl</span>
      <p>Use PowerShell's built-in <code>curl</code> alias or <code>curl.exe</code>. These examples work in Windows PowerShell and PowerShell 7.</p>
    </div>
    <div class="card">
      <h2>Upload a file</h2>
      <pre><code>curl.exe -X POST "${baseUrl}/upload" -F "files=@C:\\path\\to\\file.mp4"</code></pre>
    </div>
    <div class="card">
      <h2>Upload multiple files</h2>
      <pre><code>curl.exe -X POST "${baseUrl}/upload" -F "files=@C:\\path\\to\\file1.pdf" -F "files=@C:\\path\\to\\file2.png"</code></pre>
    </div>
    <div class="card">
      <h2>List all files</h2>
      <pre><code>curl.exe "${baseUrl}/files"</code></pre>
    </div>
    <div class="card">
      <h2>Download a file</h2>
      <pre><code>curl.exe -L "${baseUrl}/files/&lt;stored_name&gt;" -o "C:\\Downloads\\&lt;stored_name&gt;"</code></pre>
    </div>
    <div class="card">
      <h2>Watch a video in browser</h2>
      <pre><code>${baseUrl}/watch/&lt;stored_name&gt;</code></pre>
    </div>
    <div class="card">
      <h2>Delete a file</h2>
      <pre><code>curl.exe -X DELETE "${baseUrl}/files/&lt;stored_name&gt;"</code></pre>
    </div>
    <div class="card">
      <h2>Resumable upload flow</h2>
      <pre><code># 1) Create a session
curl.exe -X POST "${baseUrl}/uploads/init" -H "Content-Type: application/json" -d '{"fileName":"video.mp4","totalChunks":4,"totalSize":12345678}'

# 2) Upload each chunk
curl.exe -X POST "${baseUrl}/uploads/&lt;uploadId&gt;/chunk?chunkIndex=0" --data-binary "@C:\\path\\to\\chunk-0.bin"

# 3) Check progress
curl.exe "${baseUrl}/uploads/&lt;uploadId&gt;"

# 4) Finalize
curl.exe -X POST "${baseUrl}/uploads/&lt;uploadId&gt;/complete"</code></pre>
    </div>
    <div class="card">
      <h2>API endpoints</h2>
      <ul>
        <li><code>POST /upload</code> single-shot upload</li>
        <li><code>POST /uploads/init</code> create resumable upload session</li>
        <li><code>POST /uploads/:uploadId/chunk</code> upload a chunk</li>
        <li><code>GET /uploads/:uploadId</code> check resumable progress</li>
        <li><code>POST /uploads/:uploadId/complete</code> finalize resumable upload</li>
        <li><code>GET /files</code> list files</li>
        <li><code>GET /files/:name</code> download or stream file</li>
        <li><code>GET /watch/:name</code> open video player page</li>
        <li><code>DELETE /files/:name</code> delete file</li>
      </ul>
    </div>
  </div>
</body>
</html>`;
}

// ── Routes ────────────────────────────────────────────────────────────────────

// POST /upload  – upload one or more files in a single request
app.post('/upload', upload.array('files'), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files received' });
  }

  const saved = req.files.map(f => buildFilePayload(req, f.filename, f.originalname, f.size));
  res.json({
    message: 'Upload successful',
    files: saved
  });
});

// POST /uploads/init  – start a resumable upload session
app.post('/uploads/init', (req, res) => {
  const { fileName, totalChunks, totalSize } = req.body || {};

  if (!fileName || !Number.isInteger(totalChunks) || totalChunks <= 0) {
    return res.status(400).json({ error: 'fileName and totalChunks are required' });
  }

  const session = createResumableSession(
    sanitizeFilename(fileName),
    totalChunks,
    Number.isFinite(totalSize) ? totalSize : null
  );

  res.json({
    message: 'Upload session created',
    uploadId: session.uploadId,
    originalName: session.originalName,
    totalChunks: session.totalChunks,
    totalSize: session.totalSize,
    chunkUrl: `${req.protocol}://${req.get('host')}/uploads/${session.uploadId}/chunk`,
    statusUrl: `${req.protocol}://${req.get('host')}/uploads/${session.uploadId}`,
    completeUrl: `${req.protocol}://${req.get('host')}/uploads/${session.uploadId}/complete`
  });
});

// POST /uploads/:uploadId/chunk  – store a chunk for a resumable upload
app.post('/uploads/:uploadId/chunk', express.raw({ type: '*/*', limit: '512mb' }), (req, res) => {
  try {
    const session = ensureSession(req.params.uploadId);
    const chunkIndex = Number(req.query.chunkIndex);

    if (!Number.isInteger(chunkIndex) || chunkIndex < 0) {
      return res.status(400).json({ error: 'chunkIndex must be a non-negative integer' });
    }

    if (chunkIndex >= session.totalChunks) {
      return res.status(400).json({ error: 'chunkIndex is out of range' });
    }

    const chunkData = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || []);
    if (chunkData.length === 0) {
      return res.status(400).json({ error: 'Empty chunk received' });
    }

    fs.writeFileSync(chunkPath(session.uploadId, chunkIndex), chunkData);
    if (!session.receivedChunks.includes(chunkIndex)) {
      session.receivedChunks.push(chunkIndex);
    }
    session.updatedAt = new Date().toISOString();
    saveSession(session);

    res.json({
      message: 'Chunk stored',
      uploadId: session.uploadId,
      chunkIndex,
      receivedChunks: session.receivedChunks.length,
      totalChunks: session.totalChunks
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || 'Chunk upload failed' });
  }
});

// GET /uploads/:uploadId  – inspect resumable upload progress
app.get('/uploads/:uploadId', (req, res) => {
  try {
    const session = ensureSession(req.params.uploadId);
    res.json({
      uploadId: session.uploadId,
      originalName: session.originalName,
      storedName: session.storedName,
      totalChunks: session.totalChunks,
      totalSize: session.totalSize,
      receivedChunks: session.receivedChunks,
      missingChunks: Array.from({ length: session.totalChunks }, (_, i) => i)
        .filter(i => !session.receivedChunks.includes(i)),
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      isComplete: session.receivedChunks.length === session.totalChunks,
      url: session.receivedChunks.length === session.totalChunks ? fileUrl(req, session.storedName) : null
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || 'Failed to read upload session' });
  }
});

// POST /uploads/:uploadId/complete  – assemble the uploaded chunks
app.post('/uploads/:uploadId/complete', (req, res) => {
  try {
    const session = ensureSession(req.params.uploadId);
    const missingChunks = Array.from({ length: session.totalChunks }, (_, i) => i)
      .filter(i => !session.receivedChunks.includes(i));

    if (missingChunks.length > 0) {
      return res.status(409).json({
        error: 'Upload is incomplete',
        missingChunks
      });
    }

    assembleChunks(session);
    const stat = fs.statSync(resolveUploadPath(session.storedName));
    deleteSession(session.uploadId);

    res.json({
      message: 'Upload completed',
      file: buildFilePayload(req, session.storedName, session.originalName, stat.size),
      url: fileUrl(req, session.storedName)
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || 'Failed to finalize upload' });
  }
});

// GET /files  – list all stored files
app.get('/files', (req, res) => {
  const items = listStoredFiles().map(item => ({
    ...item,
    url: fileUrl(req, item.name)
  }));
  res.json({ count: items.length, files: items });
});

// GET /files/:name  – download a file
app.get('/files/:name', (req, res) => {
  const file = resolveUploadPath(req.params.name);
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'Not found' });
  if (isVideoFile(file)) {
    return sendVideoWithRange(req, res, file);
  }
  res.download(file);
});

// GET /watch/:name  – open a video player page
app.get('/watch/:name', (req, res) => {
  const file = resolveUploadPath(req.params.name);
  if (!fs.existsSync(file)) return res.status(404).send('Not found');
  if (!isVideoFile(file)) return res.redirect(`/files/${encodeURIComponent(req.params.name)}`);
  const source = `${req.protocol}://${req.get('host')}/files/${encodeURIComponent(req.params.name)}`;
  res.type('html').send(renderVideoPage(req.params.name, source));
});

// DELETE /files/:name  – delete a file
app.delete('/files/:name', (req, res) => {
  const file = resolveUploadPath(req.params.name);
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'Not found' });
  fs.unlinkSync(file);
  res.json({ message: `Deleted: ${req.params.name}` });
});

// GET /  – serve web UI
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// GET /guide  – server guide with PowerShell curl examples
app.get('/guide', (req, res) => {
  res.type('html').send(renderGuidePage(PUBLIC_BASE_URL));
});

// Centralized error handling so resumable upload failures stay readable
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  res.status(error.statusCode || 500).json({
    error: error.message || 'Internal server error'
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
  console.log(`\n  File Store running at http://localhost:${PORT}`);
  console.log(`  Upload folder : ${UPLOAD_DIR}\n`);
});

// Allow large file uploads to take up to 12 hours
server.timeout = 12 * 60 * 60 * 1000; // 12 h (ms)
server.keepAliveTimeout = 12 * 60 * 60 * 1000;
