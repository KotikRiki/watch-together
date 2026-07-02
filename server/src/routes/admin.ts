import { Router } from "express";
import os from "os";
import { query } from "../db/postgres";
import { getActiveRooms, getActiveUserCount } from "../socket/handlers";

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
  if (user === ADMIN_USER && pass === ADMIN_PASS) return next();
  res.setHeader("WWW-Authenticate", 'Basic realm="Admin"');
  return res.status(401).json({ error: "Invalid credentials" });
}

adminRouter.use(authMiddleware);

const cpuUsagePrev = { user: 0, system: 0 };
let lastCpuTime = Date.now();

function getCpuPercent(): number {
  const usage = process.cpuUsage();
  const deltaUser = usage.user - cpuUsagePrev.user;
  const deltaSystem = usage.system - cpuUsagePrev.system;
  cpuUsagePrev.user = usage.user;
  cpuUsagePrev.system = usage.system;
  const now = Date.now();
  const elapsedMs = now - lastCpuTime;
  lastCpuTime = now;
  if (elapsedMs === 0) return 0;
  return Math.min(100, ((deltaUser + deltaSystem) / 1000 / elapsedMs) * 100);
}

adminRouter.get("/stats", async (_req, res) => {
  try {
    const [roomsResult, msgsResult, uploadsResult, queueResult, viewsResult, sizeResult, authorsResult, roomsDayResult, msgsDayResult, topResult] = await Promise.all([
      query("SELECT COUNT(*)::int as cnt FROM rooms"),
      query("SELECT COUNT(*)::int as cnt FROM messages"),
      query("SELECT COUNT(*)::int as cnt FROM uploads"),
      query("SELECT COUNT(*)::int as cnt FROM queue"),
      query("SELECT COALESCE(SUM(views), 0)::int as total FROM rooms"),
      query("SELECT COALESCE(SUM(size), 0)::bigint as total FROM uploads"),
      query("SELECT COUNT(DISTINCT author)::int as cnt FROM messages"),
      query("SELECT COUNT(*)::int as cnt FROM rooms WHERE created_at > NOW() - INTERVAL '1 day'"),
      query("SELECT COUNT(*)::int as cnt FROM messages WHERE created_at > NOW() - INTERVAL '1 day'"),
      query(`SELECT r.code, r.views, 
        (SELECT COUNT(*)::int FROM messages m WHERE m.room_id = r.id) as "totalMessages",
        r.created_at as "createdAt"
        FROM rooms r ORDER BY r.views DESC LIMIT 10`),
    ]);

    res.json({
      totalRooms: roomsResult.rows[0].cnt,
      totalMessages: msgsResult.rows[0].cnt,
      totalUploads: uploadsResult.rows[0].cnt,
      totalQueueItems: queueResult.rows[0].cnt,
      totalViews: viewsResult.rows[0].total,
      totalSize: parseInt(sizeResult.rows[0].total),
      uniqueUsers: authorsResult.rows[0].cnt,
      roomsLastDay: roomsDayResult.rows[0].cnt,
      messagesLastDay: msgsDayResult.rows[0].cnt,
      topRooms: topResult.rows,
    });
  } catch (error) {
    console.error("Stats error:", error);
    res.status(500).json({ error: "Failed to get stats" });
  }
});

adminRouter.get("/system", (_req, res) => {
  const mem = process.memoryUsage();
  const cpuPercent = getCpuPercent();
  const processUptime = process.uptime();

  let cgroupCpu: number | null = null;
  let cgroupMem: { used: number; limit: number } | null = null;

  try {
    const fs = require("fs");
    const cpuStat = fs.readFileSync("/sys/fs/cgroup/cpu.stat", "utf-8");
    const usageMatch = cpuStat.match(/usage_usec (\d+)/);
    if (usageMatch) cgroupCpu = parseInt(usageMatch[1]);

    const memStat = fs.readFileSync("/sys/fs/cgroup/memory.current", "utf-8");
    cgroupMem = { used: parseInt(memStat.trim()), limit: 0 };
    try {
      const memMax = fs.readFileSync("/sys/fs/cgroup/memory.max", "utf-8");
      cgroupMem.limit = memMax.trim() === "max" ? 0 : parseInt(memMax.trim());
    } catch {}
  } catch {}

  res.json({
    process: {
      rss: mem.rss,
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      external: mem.external,
      cpuPercent: parseFloat(cpuPercent.toFixed(1)),
    },
    cgroup: {
      cpu: cgroupCpu,
      mem: cgroupMem,
    },
    platform: os.platform(),
    arch: os.arch(),
    nodeVersion: process.version,
    processUptime: Math.floor(processUptime),
    activeRooms: getActiveRooms(),
    activeUsers: getActiveUserCount(),
  });
});

adminRouter.get("/rooms", async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const search = (req.query.search as string) || "";
    const sort = (req.query.sort as string) || "created_at";
    const order = (req.query.order as string) === "asc" ? "ASC" : "DESC";
    const offset = (page - 1) * limit;

    const validSorts: Record<string, string> = {
      created_at: "r.created_at",
      views: "r.views",
      total_messages: "r.total_messages",
      last_active: "r.last_active",
    };
    const sortColumn = validSorts[sort] || "r.created_at";

    let roomsQuery: string;
    let countQuery: string;
    let params: any[];

    if (search) {
      roomsQuery = `SELECT r.id, r.code, r.video_url as "videoUrl", r.views, r.total_messages as "totalMessages",
        (SELECT COUNT(*)::int FROM uploads u WHERE u.room_id = r.id) as "uploadCount",
        (SELECT COUNT(*)::int FROM queue q WHERE q.room_id = r.id) as "queueCount",
        r.created_at as "createdAt", r.last_active as "lastActive"
        FROM rooms r WHERE r.code ILIKE $1 ORDER BY ${sortColumn} ${order} LIMIT $2 OFFSET $3`;
      countQuery = "SELECT COUNT(*)::int as cnt FROM rooms WHERE code ILIKE $1";
      params = [`%${search}%`, limit, offset];
    } else {
      roomsQuery = `SELECT r.id, r.code, r.video_url as "videoUrl", r.views, r.total_messages as "totalMessages",
        (SELECT COUNT(*)::int FROM uploads u WHERE u.room_id = r.id) as "uploadCount",
        (SELECT COUNT(*)::int FROM queue q WHERE q.room_id = r.id) as "queueCount",
        r.created_at as "createdAt", r.last_active as "lastActive"
        FROM rooms r ORDER BY ${sortColumn} ${order} LIMIT $1 OFFSET $2`;
      countQuery = "SELECT COUNT(*)::int as cnt FROM rooms";
      params = [limit, offset];
    }

    const [roomsResult, countResult] = await Promise.all([
      query(roomsQuery, params),
      query(countQuery, search ? [`%${search}%`] : []),
    ]);

    res.json({
      rooms: roomsResult.rows,
      total: countResult.rows[0].cnt,
      page,
      limit,
    });
  } catch (error) {
    console.error("Rooms list error:", error);
    res.status(500).json({ error: "Failed to get rooms" });
  }
});

adminRouter.get("/rooms/:code", async (req, res) => {
  try {
    const roomResult = await query("SELECT * FROM rooms WHERE code = $1", [req.params.code]);
    if (roomResult.rows.length === 0) return res.status(404).json({ error: "Room not found" });
    const room = roomResult.rows[0];

    const [messagesResult, queueResult, uploadsResult, historyResult] = await Promise.all([
      query("SELECT * FROM messages WHERE room_id = $1 ORDER BY created_at DESC LIMIT 500", [room.id]),
      query("SELECT id, url, title, sort_order as \"order\" FROM queue WHERE room_id = $1 ORDER BY sort_order", [room.id]),
      query("SELECT * FROM uploads WHERE room_id = $1 ORDER BY created_at DESC", [room.id]),
      query("SELECT * FROM video_history WHERE room_id = $1 ORDER BY created_at DESC LIMIT 100", [room.id]),
    ]);

    res.json({
      id: room.id,
      code: room.code,
      videoUrl: room.video_url,
      views: room.views,
      totalMessages: room.total_messages,
      createdAt: room.created_at,
      lastActive: room.last_active,
      messages: messagesResult.rows,
      queue: queueResult.rows,
      uploads: uploadsResult.rows,
      videoHistory: historyResult.rows,
    });
  } catch (error) {
    console.error("Room detail error:", error);
    res.status(500).json({ error: "Failed to get room" });
  }
});

adminRouter.get("/history", async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 100;
    const roomId = req.query.roomId as string;
    const author = req.query.author as string;
    const search = req.query.search as string;
    const offset = (page - 1) * limit;

    let where = "1=1";
    let params: any[] = [];
    let paramIdx = 1;

    if (roomId) { where += ` AND m.room_id = $${paramIdx++}`; params.push(roomId); }
    if (author) { where += ` AND m.author ILIKE $${paramIdx++}`; params.push(`%${author}%`); }
    if (search) { where += ` AND m.text ILIKE $${paramIdx++}`; params.push(`%${search}%`); }

    const countResult = await query(`SELECT COUNT(*)::int as cnt FROM messages m WHERE ${where}`, params);
    const msgsResult = await query(
      `SELECT m.*, r.code as "roomCode" FROM messages m
       LEFT JOIN rooms r ON r.id = m.room_id
       WHERE ${where}
       ORDER BY m.created_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      [...params, limit, offset]
    );

    res.json({
      messages: msgsResult.rows,
      total: countResult.rows[0].cnt,
      page,
      limit,
    });
  } catch (error) {
    console.error("History error:", error);
    res.status(500).json({ error: "Failed to get history" });
  }
});

adminRouter.get("/video-history", async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const roomId = req.query.roomId as string;
    const offset = (page - 1) * limit;

    let where = "1=1";
    let params: any[] = [];
    let paramIdx = 1;

    if (roomId) { where += ` AND vh.room_id = $${paramIdx++}`; params.push(roomId); }

    const countResult = await query(`SELECT COUNT(*)::int as cnt FROM video_history vh WHERE ${where}`, params);
    const result = await query(
      `SELECT vh.*, r.code as "roomCode" FROM video_history vh
       LEFT JOIN rooms r ON r.id = vh.room_id
       WHERE ${where}
       ORDER BY vh.created_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      [...params, limit, offset]
    );

    res.json({
      history: result.rows,
      total: countResult.rows[0].cnt,
      page,
      limit,
    });
  } catch (error) {
    console.error("Video history error:", error);
    res.status(500).json({ error: "Failed to get video history" });
  }
});

adminRouter.post("/reset", async (req, res) => {
  try {
    const confirm = req.headers["x-confirm-reset"];
    if (confirm !== "RESET") {
      return res.status(400).json({ error: "Send X-Confirm-Reset: RESET header to confirm" });
    }

    const what = req.body.what || "all";

    if (what === "all" || what === "stats") {
      await query("UPDATE rooms SET views = 0, total_messages = 0");
    }
    if (what === "all" || what === "messages") {
      await query("DELETE FROM messages");
    }
    if (what === "all" || what === "uploads") {
      await query("DELETE FROM uploads");
    }
    if (what === "all" || what === "queue") {
      await query("DELETE FROM queue");
    }
    if (what === "all" || what === "video_history") {
      await query("DELETE FROM video_history");
    }

    res.json({ success: true, reset: what });
  } catch (error) {
    console.error("Reset error:", error);
    res.status(500).json({ error: "Failed to reset" });
  }
});

adminRouter.delete("/rooms/:code", async (req, res) => {
  try {
    const roomResult = await query("SELECT id FROM rooms WHERE code = $1", [req.params.code]);
    if (roomResult.rows.length === 0) return res.status(404).json({ error: "Room not found" });
    await query("DELETE FROM rooms WHERE code = $1", [req.params.code]);
    res.json({ success: true });
  } catch (error) {
    console.error("Delete room error:", error);
    res.status(500).json({ error: "Failed to delete room" });
  }
});
