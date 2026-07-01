import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { createServer } from "http";
import { Server } from "socket.io";
import { roomsRouter } from "./routes/rooms";
import { uploadRouter, setupUploadServing } from "./routes/upload";
import { setupSocketHandlers } from "./socket/handlers";
import { initDB } from "./db/sqlite";

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

app.use(cors());
app.use(express.json());

app.use("/api/rooms", roomsRouter);
app.use("/api/upload", uploadRouter);
setupUploadServing(app);

// On Render: cwd=server, client at ../client/dist
// On cPanel: cwd=public_html/app, client at client/dist
// Local dev: cwd=server, client at ../client/dist
const possiblePaths = [
  path.join(process.cwd(), "../client/dist"),
  path.join(process.cwd(), "client/dist"),
  path.join(__dirname, "../../client/dist"),
  path.join(__dirname, "../client/dist"),
];
console.log("CWD:", process.cwd());
console.log("__dirname:", __dirname);
console.log("Possible client paths:", possiblePaths.map(p => ({ path: p, exists: fs.existsSync(path.join(p, "index.html")) })));
const clientPath = possiblePaths.find(p => fs.existsSync(path.join(p, "index.html"))) || possiblePaths[0];
console.log("Using clientPath:", clientPath);

app.get("/debug-paths", (_req, res) => {
  res.json({
    cwd: process.cwd(),
    dirname: __dirname,
    paths: possiblePaths.map(p => ({ path: p, indexExists: fs.existsSync(path.join(p, "index.html")), dirExists: fs.existsSync(p) })),
    clientPath,
  });
});

app.use(express.static(clientPath));
app.get("*", (req, res) => {
  if (!req.path.startsWith("/api/") && !req.path.startsWith("/uploads/")) {
    res.sendFile(path.join(clientPath, "index.html"));
  }
});

setupSocketHandlers(io);

const PORT = parseInt(process.env.PORT || "3000", 10);

initDB().then(() => {
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}).catch((err) => {
  console.error("Failed to init database:", err);
  process.exit(1);
});
