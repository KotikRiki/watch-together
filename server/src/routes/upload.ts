import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { query, generateId } from "../db/postgres";

const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// Simple rate limiter: max 5 uploads per IP per hour
const uploadCounts = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = uploadCounts.get(ip);
  if (!entry || now > entry.resetAt) {
    uploadCounts.set(ip, { count: 1, resetAt: now + 3600000 });
    return true;
  }
  if (entry.count >= 5) return false;
  entry.count++;
  return true;
}

// Cleanup old entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of uploadCounts) {
    if (now > entry.resetAt) uploadCounts.delete(ip);
  }
}, 600000);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [".mp4", ".webm", ".mkv", ".avi", ".mov", ".ogg", ".ogv"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error("Unsupported format"));
  },
});

export const uploadRouter = Router();

uploadRouter.post("/", upload.single("video"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file" });

  const ip = req.ip || req.socket.remoteAddress || "unknown";
  if (!checkRateLimit(ip)) {
    // Delete the uploaded file
    fs.unlink(req.file.path, () => {});
    return res.status(429).json({ error: "Too many uploads. Try again later." });
  }

  const filename = req.file.filename;
  const url = `/uploads/${filename}`;
  const roomCode = req.body.roomCode as string;
  const username = req.body.username as string;

  let roomId: string | null = null;
  if (roomCode) {
    const roomResult = await query("SELECT id FROM rooms WHERE code = $1", [roomCode]);
    if (roomResult.rows.length > 0) roomId = roomResult.rows[0].id;
  }

  const id = generateId();
  await query(
    "INSERT INTO uploads (id, room_id, filename, original_name, size, uploaded_by) VALUES ($1, $2, $3, $4, $5, $6)",
    [id, roomId, filename, req.file.originalname, req.file.size, username || null]
  );

  res.json({
    url,
    filename,
    originalName: req.file.originalname,
    size: req.file.size,
  });
});

export function setupUploadServing(app: any) {
  app.use("/uploads", async (req: any, res: any, next: any) => {
    const safeName = path.basename(req.url);
    const filePath = path.join(uploadDir, safeName);
    try {
      const stat = await fs.promises.stat(filePath);
      const fileSize = stat.size;
      const range = req.headers.range;

      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = end - start + 1;
        const file = fs.createReadStream(filePath, { start, end });
        const head = {
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          "Accept-Ranges": "bytes",
          "Content-Length": chunksize,
          "Content-Type": "video/mp4",
          "Cache-Control": "public, max-age=7200",
        };
        res.writeHead(206, head);
        file.pipe(res);
      } else {
        const head = {
          "Content-Length": fileSize,
          "Content-Type": "video/mp4",
          "Accept-Ranges": "bytes",
          "Cache-Control": "public, max-age=7200",
        };
        res.writeHead(200, head);
        fs.createReadStream(filePath).pipe(res);
      }
    } catch {
      next();
    }
  });
}
