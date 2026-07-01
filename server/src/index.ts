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

const clientDist = path.join(process.cwd(), "../client/dist");
const altClientDist = path.join(__dirname, "../../client/dist");
const clientPath = fs.existsSync(clientDist) ? clientDist : altClientDist;
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
