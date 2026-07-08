import { Router } from "express";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import crypto from "crypto";

const downloadDir = path.join(__dirname, "../../downloads");
if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, { recursive: true });

// Auto-delete files older than 2 hours
setInterval(() => {
  const now = Date.now();
  const maxAge = 2 * 60 * 60 * 1000;
  try {
    for (const f of fs.readdirSync(downloadDir)) {
      if (!f.endsWith(".mp4")) continue;
      const stat = fs.statSync(path.join(downloadDir, f));
      if (now - stat.mtimeMs > maxAge) {
        fs.unlinkSync(path.join(downloadDir, f));
        console.log(`Auto-deleted old download: ${f}`);
      }
    }
  } catch {}
}, 10 * 60 * 1000); // check every 10 minutes

export const downloadRouter = Router();

const activeDownloads = new Map<string, { progress: string; clients: Set<any>; pid?: number }>();

downloadRouter.post("/", (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "No URL" });

  // SSRF protection: block internal URLs
  const blocked = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|169\.254\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|::1|fc00:|fd00:|fe80:)/i;
  try {
    const parsed = new URL(url);
    if (blocked.test(parsed.hostname) || parsed.protocol === "file:" || parsed.protocol === "data:") {
      return res.status(403).json({ error: "URL not allowed" });
    }
    // Block cloud metadata endpoints
    if (parsed.hostname === "169.254.169.254" || parsed.hostname === "metadata.google.internal") {
      return res.status(403).json({ error: "URL not allowed" });
    }
  } catch {
    return res.status(400).json({ error: "Invalid URL" });
  }

  const hash = crypto.createHash("md5").update(url).digest("hex").slice(0, 12);
  const filename = `${hash}.mp4`;
  const outputPath = path.join(downloadDir, filename);

  if (fs.existsSync(outputPath)) {
    const stat = fs.statSync(outputPath);
    if (stat.size > 100000) {
      return res.json({ url: `/api/download/stream/${filename}`, filename, size: stat.size, cached: true });
    }
  }

  activeDownloads.set(hash, { progress: "0", clients: new Set() });

  const args = [
    "--no-playlist",
    "-f", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
    "--merge-output-format", "mp4",
    "--concurrent-fragments", "50",
    "-o", outputPath,
    "--no-overwrites",
    "--newline",
    url,
  ];

  console.log(`Downloading: ${url}`);
  const proc = spawn("yt-dlp", args);
  const entry = activeDownloads.get(hash)!;
  entry.pid = proc.pid;

  // Kill process after 30 minutes timeout
  const timeout = setTimeout(() => {
    console.error(`yt-dlp timeout for ${filename}`);
    proc.kill("SIGTERM");
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    entry.progress = "error";
    entry.clients.forEach(client => client.write(`data: ${JSON.stringify({ error: "Timeout: скачивание заняло слишком много времени" })}\n\n`));
    setTimeout(() => {
      entry.clients.forEach(c => c.end());
      activeDownloads.delete(hash);
    }, 3000);
  }, 30 * 60 * 1000);

  let stderr = "";

  proc.stdout.on("data", (data) => {
    const line = data.toString().trim();
    const match = line.match(/\[download\]\s+([\d.]+)%/);
    if (match) {
      entry.progress = match[1];
      entry.clients.forEach(client => client.write(`data: ${JSON.stringify({ progress: match[1] })}\n\n`));
    }
  });

  proc.stderr.on("data", (data) => { stderr += data.toString(); });

  proc.on("close", (code) => {
    clearTimeout(timeout);
    if (code === 0 && fs.existsSync(outputPath)) {
      const stat = fs.statSync(outputPath);
      console.log(`Downloaded: ${filename} (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
      entry.progress = "done";
      entry.clients.forEach(client => client.write(`data: ${JSON.stringify({ done: true, url: `/api/download/stream/${filename}`, filename, size: stat.size })}\n\n`));
      setTimeout(() => {
        entry.clients.forEach(c => c.end());
        activeDownloads.delete(hash);
      }, 5000);
    } else {
      console.error("yt-dlp failed:", stderr);
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      const errorMsg = stderr.includes("rutube") ? "RuTube не поддерживается для скачивания" : "Ошибка скачивания";
      entry.progress = "error";
      entry.clients.forEach(client => client.write(`data: ${JSON.stringify({ error: errorMsg })}\n\n`));
      setTimeout(() => {
        entry.clients.forEach(c => c.end());
        activeDownloads.delete(hash);
      }, 3000);
    }
  });

  res.json({ hash, status: "started" });
});

downloadRouter.get("/progress/:hash", (req, res) => {
  const hash = req.params.hash;
  const entry = activeDownloads.get(hash);

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
  });

  if (!entry) {
    res.write(`data: ${JSON.stringify({ error: "not_found" })}\n\n`);
    return res.end();
  }

  entry.clients.add(res);

  res.write(`data: ${JSON.stringify({ progress: entry.progress })}\n\n`);

  if (entry.progress === "done" || entry.progress === "error") {
    res.end();
    return;
  }

  req.on("close", () => {
    entry.clients.delete(res);
  });
});

downloadRouter.get("/stream/:filename", (req, res) => {
  const safeName = path.basename(req.params.filename);
  const filePath = path.join(downloadDir, safeName);
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
      "Cache-Control": "no-cache",
    });
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      "Content-Length": fileSize,
      "Content-Type": "video/mp4",
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-cache",
    });
    fs.createReadStream(filePath).pipe(res);
  }
});

downloadRouter.get("/list", (_req, res) => {
  const files = fs.readdirSync(downloadDir)
    .filter(f => f.endsWith(".mp4"))
    .map(f => {
      const stat = fs.statSync(path.join(downloadDir, f));
      return { filename: f, size: stat.size, url: `/api/download/stream/${f}` };
    });
  res.json(files);
});
