import { Router } from "express";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import crypto from "crypto";

const downloadDir = path.join(__dirname, "../../downloads");
if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, { recursive: true });

export const downloadRouter = Router();

// Track active downloads
const activeDownloads = new Map<string, { progress: string; pid?: number }>();

downloadRouter.post("/", (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "No URL" });

  // Create deterministic filename from URL hash
  const hash = crypto.createHash("md5").update(url).digest("hex").slice(0, 12);
  const filename = `${hash}.mp4`;
  const outputPath = path.join(downloadDir, filename);

  // Check if already downloaded
  if (fs.existsSync(outputPath)) {
    const stat = fs.statSync(outputPath);
    if (stat.size > 100000) { // > 100KB = valid file
      return res.json({ url: `/api/download/stream/${filename}`, filename, size: stat.size, cached: true });
    }
  }

  activeDownloads.set(hash, { progress: "starting" });

  const args = [
    "--no-playlist",
    "-f", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
    "--merge-output-format", "mp4",
    "-o", outputPath,
    "--no-overwrites",
    "--newline",
    url,
  ];

  console.log(`Downloading: ${url}`);
  const proc = spawn("yt-dlp", args);
  activeDownloads.set(hash, { progress: "downloading", pid: proc.pid });

  let stderr = "";

  proc.stdout.on("data", (data) => {
    const line = data.toString().trim();
    // Parse yt-dlp progress: [download] 42.3% of ~50MiB at 5MiB/s ETA 00:08
    const match = line.match(/\[download\]\s+([\d.]+)%/);
    if (match) {
      activeDownloads.set(hash, { progress: `${match[1]}%`, pid: proc.pid });
    }
  });

  proc.stderr.on("data", (data) => { stderr += data.toString(); });

  proc.on("close", (code) => {
    if (code === 0 && fs.existsSync(outputPath)) {
      const stat = fs.statSync(outputPath);
      console.log(`Downloaded: ${filename} (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
      activeDownloads.set(hash, { progress: "done" });
      // Cleanup after 5 min
      setTimeout(() => activeDownloads.delete(hash), 300000);
    } else {
      console.error("yt-dlp failed:", stderr);
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      activeDownloads.set(hash, { progress: "error" });
    }
  });

  // Poll for completion (max 5 min)
  const start = Date.now();
  const poll = setInterval(() => {
    const entry = activeDownloads.get(hash);
    if (!entry || entry.progress === "done") {
      clearInterval(poll);
      if (fs.existsSync(outputPath)) {
        const stat = fs.statSync(outputPath);
        res.json({ url: `/api/download/stream/${filename}`, filename, size: stat.size });
      } else {
        res.status(500).json({ error: "Download failed" });
      }
    } else if (entry.progress === "error") {
      clearInterval(poll);
      res.status(500).json({ error: "Download failed" });
    } else if (Date.now() - start > 300000) {
      clearInterval(poll);
      if (proc.pid) try { process.kill(proc.pid, "SIGKILL"); } catch {}
      res.status(504).json({ error: "Download timeout" });
    }
  }, 1000);
});

// Progress check endpoint
downloadRouter.get("/progress/:hash", (req, res) => {
  const entry = activeDownloads.get(req.params.hash);
  if (!entry) return res.json({ progress: "not_found" });
  res.json({ progress: entry.progress });
});

// Stream downloaded video with range request support
downloadRouter.get("/stream/:filename", (req, res) => {
  const filePath = path.join(downloadDir, req.params.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "Not found" });

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunkSize = end - start + 1;

    res.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${fileSize}`,
      "Accept-Ranges": "bytes",
      "Content-Length": chunkSize,
      "Content-Type": "video/mp4",
    });
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      "Content-Length": fileSize,
      "Content-Type": "video/mp4",
    });
    fs.createReadStream(filePath).pipe(res);
  }
});

// List downloaded videos
downloadRouter.get("/list", (_req, res) => {
  const files = fs.readdirSync(downloadDir)
    .filter(f => f.endsWith(".mp4"))
    .map(f => {
      const stat = fs.statSync(path.join(downloadDir, f));
      return { filename: f, size: stat.size, url: `/api/download/stream/${f}` };
    });
  res.json(files);
});
