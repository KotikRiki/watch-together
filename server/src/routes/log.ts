import { Router } from "express";
import fs from "fs";
import path from "path";

const logFile = path.join(__dirname, "../../error.log");

export const logRouter = Router();

logRouter.post("/", (req, res) => {
  const body = req.body;
  const entry = `[${new Date().toISOString()}] [${body.level || "?"}] ${body.message || "?"}\n${body.extra ? body.extra + "\n" : ""}URL: ${body.url || "?"}\nUA: ${body.ua || body.userAgent || "?"}\n---\n`;
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
