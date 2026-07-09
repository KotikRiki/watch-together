import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { createServer } from "http";
import { Server } from "socket.io";
import rateLimit from "express-rate-limit";
import { roomsRouter } from "./routes/rooms";
import { uploadRouter, setupUploadServing } from "./routes/upload";
import { adminRouter } from "./routes/admin";
import { stickersRouter } from "./routes/stickers";
import { downloadRouter } from "./routes/download";
import { logRouter } from "./routes/log";
import { loggerRouter } from "./routes/logger";
import { voiceUploadRouter } from "./routes/voice-upload";
import { setupSocketHandlers } from "./socket/handlers";
import { initDB } from "./db/postgres";
import { logError } from "./db/logger";

process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
  logError("", "", "uncaughtException", err.message, err.stack);
});
process.on("unhandledRejection", (err) => {
  console.error("Unhandled rejection:", err);
  logError("", "", "unhandledRejection", String(err));
});

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const allowed = ["https://popcornvmeste.xyz", "http://localhost:5173", "http://localhost:3001"];
      if (allowed.includes(origin) || origin.includes("popcornvmeste.xyz")) return callback(null, true);
      callback(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST"],
  },
  perMessageDeflate: {
    threshold: 256,
  },
});

// Security headers
app.use((_req, res, next) => {
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  next();
});

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests" },
});
const createLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: "Too many room creations" },
});

app.use(cors());
app.use(express.json());

app.use("/api/rooms", (req, res, next) => {
  if (req.method === "POST") return createLimiter(req, res, next);
  return apiLimiter(req, res, next);
}, roomsRouter);
app.use("/api/upload", apiLimiter, uploadRouter);
app.use("/api/admin", apiLimiter, adminRouter);
app.use("/api/stickers", apiLimiter, stickersRouter);
app.use("/api/download", apiLimiter, downloadRouter);
app.use("/api/log", apiLimiter, logRouter);
app.use("/api/logger", apiLimiter, loggerRouter);
app.use("/api/voice-upload", apiLimiter, voiceUploadRouter);
setupUploadServing(app);

app.get("/reset-pwa", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(
    '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Сброс PWA</title></head>' +
    '<body style="background:#0a0a0f;color:#fff;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">' +
    '<div style="text-align:center"><h2>Очистка кеша...</h2>' +
    '<script>' +
    '(async function(){' +
    'try{var r=await navigator.serviceWorker.getRegistrations();for(var i=0;i<r.length;i++)await r[i].unregister();}catch(e){}' +
    'try{var k=await caches.keys();for(var j=0;j<k.length;j++)await caches.delete(k[j]);}catch(e){}' +
    'setTimeout(function(){window.location.href="/";},500);' +
    '})();' +
    '</script></div></body></html>'
  );
});

app.get("/sw.js", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/javascript");
  res.send(
    "self.addEventListener('install',function(e){self.skipWaiting()});" +
    "self.addEventListener('activate',function(e){e.waitUntil(self.clients.claim())});"
  );
});

const possiblePaths = [
  path.join(process.cwd(), "../client/dist"),
  path.join(process.cwd(), "client/dist"),
  path.join(__dirname, "../../client/dist"),
  path.join(__dirname, "../client/dist"),
];
const clientPath = possiblePaths.find(p => fs.existsSync(path.join(p, "index.html"))) || possiblePaths[0];

app.use(express.static(clientPath, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith("index.html") || filePath.endsWith("sw.js") || filePath.endsWith("registerSW.js")) {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    }
  }
}));

const indexPath = path.join(clientPath, "index.html");

app.get("/", (_req, res) => {
  res.sendFile(indexPath);
});

app.get("*", (req, res) => {
  if (!req.path.startsWith("/api/") && !req.path.startsWith("/uploads/")) {
    res.sendFile(indexPath);
  }
});

setupSocketHandlers(io);

const PORT = parseInt(process.env.PORT || "3000", 10);

function startServer() {
  server.timeout = 86400000;
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

async function initWithRetry(retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      await initDB();
      console.log("Database connected successfully");
      return;
    } catch (err: any) {
      console.error(`Database connection attempt ${i + 1} failed: ${err.message}`);
      if (i < retries - 1) {
        await new Promise(r => setTimeout(r, 5000));
      }
    }
  }
  console.error("All database connection attempts failed, starting with JSON fallback");
}

initWithRetry().then(() => startServer()).catch(() => startServer());
