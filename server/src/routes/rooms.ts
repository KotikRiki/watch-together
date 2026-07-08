import { Router } from "express";
import { query, generateId } from "../db/postgres";
import { broadcastToRoom } from "../socket/handlers";

export const roomsRouter = Router();

function generateCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

roomsRouter.post("/", async (req, res) => {
  try {
    const { videoUrl } = req.body;
    const code = generateCode();
    const id = generateId();
    await query(
      "INSERT INTO rooms (id, code, video_url) VALUES ($1, $2, $3)",
      [id, code, videoUrl || null]
    );
    res.json({ id, code, videoUrl: videoUrl || null });
  } catch (error) {
    console.error("Failed to create room:", error);
    res.status(500).json({ error: "Failed to create room" });
  }
});

roomsRouter.get("/:code", async (req, res) => {
  try {
    const { code } = req.params;
    const roomResult = await query("SELECT * FROM rooms WHERE code = $1", [code]);
    if (roomResult.rows.length === 0) return res.status(404).json({ error: "Room not found" });
    const room = roomResult.rows[0];

    const messagesResult = await query(
      "SELECT * FROM messages WHERE room_id = $1 ORDER BY created_at ASC LIMIT 200",
      [room.id]
    );
    const queueResult = await query(
      "SELECT id, room_id, url, title, sort_order as \"order\" FROM queue WHERE room_id = $1 ORDER BY sort_order",
      [room.id]
    );

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
    });
  } catch (error) {
    console.error("Failed to get room:", error);
    res.status(500).json({ error: "Failed to get room" });
  }
});

roomsRouter.get("/:code/history", async (req, res) => {
  try {
    const { code } = req.params;
    const roomResult = await query("SELECT id FROM rooms WHERE code = $1", [code]);
    if (roomResult.rows.length === 0) return res.status(404).json({ error: "Room not found" });
    const roomId = roomResult.rows[0].id;
    const result = await query(
      "SELECT vh.url, vh.changed_by, vh.created_at FROM video_history vh WHERE vh.room_id = $1 ORDER BY vh.created_at DESC LIMIT 50",
      [roomId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Failed to get video history:", error);
    res.status(500).json({ error: "Failed to get video history" });
  }
});

roomsRouter.post("/:code/queue", async (req, res) => {
  try {
    const { code } = req.params;
    const { url, title } = req.body;
    const roomResult = await query("SELECT id FROM rooms WHERE code = $1", [code]);
    if (roomResult.rows.length === 0) return res.status(404).json({ error: "Room not found" });
    const roomId = roomResult.rows[0].id;

    const maxResult = await query(
      "SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order FROM queue WHERE room_id = $1",
      [roomId]
    );
    const nextOrder = maxResult.rows[0].next_order;
    const id = generateId();

    await query(
      "INSERT INTO queue (id, room_id, url, title, sort_order) VALUES ($1, $2, $3, $4, $5)",
      [id, roomId, url, title || null, nextOrder]
    );
    broadcastToRoom(code, "queue-updated", { action: "add", item: { id, url, title: title || null, order: nextOrder } });
    res.json({ id, roomId, url, title: title || null, order: nextOrder });
  } catch (error) {
    console.error("Failed to add to queue:", error);
    res.status(500).json({ error: "Failed to add to queue" });
  }
});

roomsRouter.delete("/:code/queue/:itemId", async (req, res) => {
  try {
    const { itemId } = req.params;
    await query("DELETE FROM queue WHERE id = $1", [itemId]);
    res.json({ success: true });
  } catch (error) {
    console.error("Failed to remove from queue:", error);
    res.status(500).json({ error: "Failed to remove from queue" });
  }
});
