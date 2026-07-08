import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import Database from "better-sqlite3";

const LOGS_DIR = path.join(process.env.LOGS_DIR || "/opt/watch-together/logs");
const VOICE_DIR = path.join(LOGS_DIR, "voice-records");
if (!fs.existsSync(VOICE_DIR)) fs.mkdirSync(VOICE_DIR, { recursive: true });

const db = new Database(path.join(LOGS_DIR, "activity.db"));
db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS voice_chunks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_code TEXT NOT NULL,
    username TEXT,
    chunk_index INTEGER NOT NULL DEFAULT 0,
    started_at TEXT DEFAULT (datetime('now')),
    file_path TEXT NOT NULL,
    file_size INTEGER DEFAULT 0,
    duration_sec REAL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_vc_room ON voice_chunks(room_code);
`);

const insertChunk = db.prepare(
  "INSERT INTO voice_chunks (room_code, username, chunk_index, file_path, file_size, duration_sec) VALUES (?, ?, ?, ?, ?, ?)"
);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const roomCode = (req.body.roomCode as string) || "unknown";
    const roomDir = path.join(VOICE_DIR, roomCode);
    if (!fs.existsSync(roomDir)) fs.mkdirSync(roomDir, { recursive: true });
    cb(null, roomDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || ".webm";
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [".webm", ".ogg", ".opus", ".mp3", ".wav"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext) || file.mimetype.startsWith("audio/")) cb(null, true);
    else cb(new Error("Unsupported audio format"));
  },
});

export const voiceUploadRouter = Router();

voiceUploadRouter.post("/", upload.single("audio"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file" });

  const roomCode = req.body.roomCode as string;
  const username = req.body.username as string;
  const chunkIndex = parseInt(req.body.chunkIndex || "0", 10);
  const duration = parseFloat(req.body.duration || "0");
  const filePath = path.join(VOICE_DIR, roomCode, req.file.filename);

  const id = insertChunk.run(roomCode, username || null, chunkIndex, filePath, req.file.size, duration);

  res.json({
    ok: true,
    id: Number(id.lastInsertRowid),
    filename: req.file.filename,
    size: req.file.size,
  });
});

voiceUploadRouter.get("/rooms/:roomCode", (req, res) => {
  const roomCode = req.params.roomCode;
  const rows = db.prepare(
    "SELECT id, room_code, username, chunk_index, started_at, file_size, duration_sec FROM voice_chunks WHERE room_code = ? ORDER BY chunk_index"
  ).all(roomCode);
  res.json(rows);
});

voiceUploadRouter.get("/download/:roomCode/:filename", (req, res) => {
  const safeName = path.basename(req.params.filename);
  const filePath = path.join(VOICE_DIR, req.params.roomCode, safeName);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "Not found" });
  res.download(filePath);
});
