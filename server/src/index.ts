import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { createServer } from "http";
import { Server } from "socket.io";
import { roomsRouter } from "./routes/rooms";
import { uploadRouter, setupUploadServing } from "./routes/upload";
import { adminRouter } from "./routes/admin";
import { stickersRouter } from "./routes/stickers";
import { setupSocketHandlers } from "./socket/handlers";
import { initDB } from "./db/postgres";

process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
});
process.on("unhandledRejection", (err) => {
  console.error("Unhandled rejection:", err);
});

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

app.use(cors());
app.use(express.json());

app.use("/api/rooms", roomsRouter);
app.use("/api/upload", uploadRouter);
app.use("/api/admin", adminRouter);
app.use("/api/stickers", stickersRouter);
setupUploadServing(app);

const possiblePaths = [
  path.join(process.cwd(), "../client/dist"),
  path.join(process.cwd(), "client/dist"),
  path.join(__dirname, "../../client/dist"),
  path.join(__dirname, "../client/dist"),
];
const clientPath = possiblePaths.find(p => fs.existsSync(path.join(p, "index.html"))) || possiblePaths[0];

app.use(express.static(clientPath));

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
