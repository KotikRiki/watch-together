import { Router } from "express";
import fs from "fs";
import path from "path";

const logFile = path.join(__dirname, "../../error.log");

export const logRouter = Router();

logRouter.post("/", (req, res) => {
  const { level, message, stack, url, userAgent } = req.body;
  const entry = `[${new Date().toISOString()}] [${level}] ${message}\n${stack ? stack + "\n" : ""}URL: ${url}\nUA: ${userAgent}\n---\n`;
  fs.appendFileSync(logFile, entry);
  res.json({ ok: true });
});

logRouter.get("/", (req, res) => {
  const lines = parseInt(req.query.lines as string) || 50;
  if (!fs.existsSync(logFile)) return res.send("No logs yet");
  const content = fs.readFileSync(logFile, "utf8");
  const allLines = content.split("---\n").filter(Boolean);
  res.type("text/plain").send(allLines.slice(-lines).join("---\n"));
});
