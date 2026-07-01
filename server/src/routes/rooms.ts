import { Router } from "express";
import { getDB, generateId, saveDB } from "../db/sqlite";

export const roomsRouter = Router();

function generateCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

roomsRouter.post("/", (req, res) => {
  try {
    const { videoUrl } = req.body;
    const code = generateCode();
    const id = generateId();
    const db = getDB();
    db.rooms.push({ id, code, videoUrl: videoUrl || null, createdAt: new Date().toISOString() });
    saveDB();
    res.json({ id, code, videoUrl: videoUrl || null });
  } catch (error) {
    res.status(500).json({ error: "Failed to create room" });
  }
});

roomsRouter.get("/:code", (req, res) => {
  try {
    const { code } = req.params;
    const db = getDB();
    const room = db.rooms.find((r: any) => r.code === code);
    if (!room) return res.status(404).json({ error: "Room not found" });
    const messages = db.messages.filter((m: any) => m.roomId === room.id).slice(-50);
    const queue = db.queue.filter((q: any) => q.roomId === room.id).sort((a: any, b: any) => a.order - b.order);
    res.json({ ...room, messages, queue });
  } catch (error) {
    res.status(500).json({ error: "Failed to get room" });
  }
});

roomsRouter.post("/:code/queue", (req, res) => {
  try {
    const { code } = req.params;
    const { url, title } = req.body;
    const db = getDB();
    const room = db.rooms.find((r: any) => r.code === code);
    if (!room) return res.status(404).json({ error: "Room not found" });
    const existing = db.queue.filter((q: any) => q.roomId === room.id);
    const maxOrder = existing.reduce((max: number, q: any) => Math.max(max, q.order), -1);
    const item = { id: generateId(), roomId: room.id, url, title: title || null, order: maxOrder + 1 };
    db.queue.push(item);
    saveDB();
    res.json(item);
  } catch (error) {
    res.status(500).json({ error: "Failed to add to queue" });
  }
});

roomsRouter.delete("/:code/queue/:itemId", (req, res) => {
  try {
    const { itemId } = req.params;
    const db = getDB();
    db.queue = db.queue.filter((q: any) => q.id !== itemId);
    saveDB();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to remove from queue" });
  }
});
