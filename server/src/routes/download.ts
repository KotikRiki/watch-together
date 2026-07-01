import { Router } from "express";
import { execFile } from "child_process";
import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";

const downloadDir = path.join(__dirname, "../../uploads");
if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, { recursive: true });

export const downloadRouter = Router();

downloadRouter.post("/", (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "No URL" });

  const filename = `${uuidv4()}.mp4`;
  const outputPath = path.join(downloadDir, filename);

  // Use yt-dlp to download best quality mp4
  const args = [
    "--no-playlist",
    "-f", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
    "--merge-output-format", "mp4",
    "-o", outputPath,
    "--no-overwrites",
    url,
  ];

  console.log(`Downloading: ${url}`);

  const proc = execFile("yt-dlp", args, { timeout: 300000 }, (error, stdout, stderr) => {
    if (error) {
      console.error("yt-dlp error:", error.message);
      // Cleanup
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      return res.status(500).json({ error: "Download failed", details: error.message });
    }

    if (!fs.existsSync(outputPath)) {
      return res.status(500).json({ error: "File not created" });
    }

    const stat = fs.statSync(outputPath);
    const fileUrl = `/uploads/${filename}`;

    console.log(`Downloaded: ${filename} (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);

    res.json({
      url: fileUrl,
      filename,
      size: stat.size,
    });
  });

  // Send progress via SSE-like approach - store pid for cancellation
  (req as any).downloadPid = proc.pid;
});

downloadRouter.get("/progress", (req, res) => {
  // Placeholder for future progress tracking
  res.json({ status: "ok" });
});
