import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";

const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

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

uploadRouter.post("/", upload.single("video"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file" });

  const filename = req.file.filename;
  const url = `/uploads/${filename}`;

  res.json({
    url,
    filename,
    originalName: req.file.originalname,
    size: req.file.size,
  });
});

export function setupUploadServing(app: any) {
  app.use("/uploads", (req: any, res: any, next: any) => {
    const filePath = path.join(uploadDir, req.url);
    if (!fs.existsSync(filePath)) return next();

    const stat = fs.statSync(filePath);
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
      };
      res.writeHead(206, head);
      file.pipe(res);
    } else {
      const head = {
        "Content-Length": fileSize,
        "Content-Type": "video/mp4",
        "Accept-Ranges": "bytes",
      };
      res.writeHead(200, head);
      fs.createReadStream(filePath).pipe(res);
    }
  });
}
