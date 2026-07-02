import { Router } from "express";
import { getDB } from "../db/sqlite";

export const adminRouter = Router();

const ADMIN_USER = process.env.ADMIN_USER || "Admin";
const ADMIN_PASS = process.env.ADMIN_PASS || "HeCJB/O4du[v1gGt";

function authMiddleware(req: any, res: any, next: any) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Basic ")) {
    res.setHeader("WWW-Authenticate", 'Basic realm="Admin"');
    return res.status(401).json({ error: "Unauthorized" });
  }
  const decoded = Buffer.from(authHeader.split(" ")[1], "base64").toString();
  const [user, pass] = decoded.split(":");
  if (user === ADMIN_USER && pass === ADMIN_PASS) {
    return next();
  }
  res.setHeader("WWW-Authenticate", 'Basic realm="Admin"');
  return res.status(401).json({ error: "Invalid credentials" });
}

adminRouter.use(authMiddleware);

adminRouter.get("/stats", (_req, res) => {
  const db = getDB();
  const totalRooms = db.rooms.length;
  const totalMessages = db.messages.length;
  const totalUploads = db.uploads.length;
  const totalQueueItems = db.queue.length;

  const totalViews = db.rooms.reduce((sum: number, r: any) => sum + (r.views || 0), 0);
  const totalSize = db.uploads.reduce((sum: number, u: any) => sum + (u.size || 0), 0);

  const uniqueAuthors = new Set(db.messages.map((m: any) => m.author));

  const now = Date.now();
  const day = 86400000;
  const roomsLastDay = db.rooms.filter((r: any) => now - new Date(r.createdAt).getTime() < day).length;
  const messagesLastDay = db.messages.filter((m: any) => now - new Date(m.createdAt).getTime() < day).length;

  const topRooms = db.rooms
    .map((r: any) => ({
      code: r.code,
      views: r.views || 0,
      totalMessages: db.messages.filter((m: any) => m.roomId === r.id).length,
      createdAt: r.createdAt,
    }))
    .sort((a: any, b: any) => b.views - a.views)
    .slice(0, 10);

  res.json({
    totalRooms,
    totalMessages,
    totalUploads,
    totalQueueItems,
    totalViews,
    totalSize,
    uniqueUsers: uniqueAuthors.size,
    roomsLastDay,
    messagesLastDay,
    topRooms,
  });
});

adminRouter.get("/rooms", (req, res) => {
  const db = getDB();
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 50;
  const search = (req.query.search as string) || "";

  let rooms = db.rooms.map((r: any) => {
    const msgCount = db.messages.filter((m: any) => m.roomId === r.id).length;
    const uploadCount = db.uploads.filter((u: any) => u.roomId === r.id).length;
    const queueCount = db.queue.filter((q: any) => q.roomId === r.id).length;
    return {
      id: r.id,
      code: r.code,
      videoUrl: r.videoUrl,
      views: r.views || 0,
      totalMessages: msgCount,
      uploadCount,
      queueCount,
      createdAt: r.createdAt,
      lastActive: r.lastActive || r.createdAt,
    };
  });

  if (search) {
    rooms = rooms.filter((r: any) =>
      r.code.toLowerCase().includes(search.toLowerCase())
    );
  }

  rooms.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const total = rooms.length;
  const start = (page - 1) * limit;
  const paginatedRooms = rooms.slice(start, start + limit);

  res.json({ rooms: paginatedRooms, total, page, limit });
});

adminRouter.get("/rooms/:code", (req, res) => {
  const db = getDB();
  const room = db.rooms.find((r: any) => r.code === req.params.code);
  if (!room) return res.status(404).json({ error: "Room not found" });

  const messages = db.messages.filter((m: any) => m.roomId === room.id);
  const queue = db.queue.filter((q: any) => q.roomId === room.id).sort((a: any, b: any) => a.order - b.order);
  const uploads = db.uploads.filter((u: any) => u.roomId === room.id);

  res.json({
    ...room,
    views: room.views || 0,
    lastActive: room.lastActive || room.createdAt,
    messages,
    queue,
    uploads,
  });
});

adminRouter.get("/history", (req, res) => {
  const db = getDB();
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 100;
  const roomId = req.query.roomId as string;

  let messages = db.messages;
  if (roomId) {
    messages = messages.filter((m: any) => m.roomId === roomId);
  }

  messages.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const total = messages.length;
  const start = (page - 1) * limit;
  const paginated = messages.slice(start, start + limit);

  const enriched = paginated.map((m: any) => {
    const room = db.rooms.find((r: any) => r.id === m.roomId);
    return { ...m, roomCode: room?.code || "unknown" };
  });

  res.json({ messages: enriched, total, page, limit });
});
