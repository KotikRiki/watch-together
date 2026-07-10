import { Server, Socket } from "socket.io";
import { query, generateId } from "../db/postgres";
import { logEvent } from "../db/logger";
import { verifyPassword } from "../utils/password";

interface RoomState {
  roomId: string | null;
  videoUrl: string | null;
  videoType: "embed" | "file";
  isPlaying: boolean;
  currentTime: number;
  adPlaying: boolean;
  users: Set<string>;
  usernames: Map<string, string>;
  hostSocketId: string | null;
  hostId: string | null;
  hostOnly: boolean;
  lastSyncTime: number;
  userTimes: Map<string, { time: number; isPlaying: boolean; username: string }>;
  watchAccumulator: Map<string, number>;
  voiceUsers: Set<string>;
}

const rooms = new Map<string, RoomState>();
let ioRef: Server | null = null;

// Message buffer for batch DB writes
const messageBuffer: { roomId: string; msgId: string; author: string; text: string; replyToId: string | null; createdAt: string }[] = [];

async function flushMessages() {
  if (messageBuffer.length === 0) return;
  const batch = messageBuffer.splice(0, messageBuffer.length);
  const values: any[] = [];
  const placeholders = batch.map((m, i) => {
    values.push(m.msgId, m.roomId, m.author, m.text, m.replyToId);
    return `($${i * 5 + 1}, $${i * 5 + 2}, $${i * 5 + 3}, $${i * 5 + 4}, $${i * 5 + 5})`;
  }).join(", ");
  try {
    await query(`INSERT INTO messages (id, room_id, author, text, reply_to_id) VALUES ${placeholders}`, values);
  } catch (err: any) {
    console.error("Failed to flush messages:", err.message);
  }
}

setInterval(flushMessages, 5000);

export function broadcastToRoom(roomCode: string, event: string, data: any) {
  ioRef?.to(roomCode).emit(event, data);
}

async function flushWatchTime(roomCode: string) {
  const roomState = rooms.get(roomCode);
  if (!roomState || !roomState.videoUrl || roomState.watchAccumulator.size === 0) return;

  let roomId = roomState.roomId;
  if (!roomId) {
    const roomResult = await query("SELECT id FROM rooms WHERE code = $1", [roomCode]);
    if (roomResult.rows.length === 0) return;
    roomId = roomResult.rows[0].id;
    roomState.roomId = roomId;
  }

  const entries = Array.from(roomState.watchAccumulator.entries()).filter(([username, s]) => s > 0 && username);
  if (entries.length === 0) { roomState.watchAccumulator.clear(); return; }

  // Batch insert
  const values: any[] = [];
  const placeholders = entries.map(([, seconds], i) => {
    values.push(roomId, roomState.videoUrl, entries[i][0], seconds);
    return `($${i * 4 + 1}, $${i * 4 + 2}, $${i * 4 + 3}, $${i * 4 + 4})`;
  }).join(", ");

  await query(
    `INSERT INTO watch_sessions (room_id, video_url, username, watched_seconds) VALUES ${placeholders}`,
    values
  );
  roomState.watchAccumulator.clear();
}

const flushTimers = new Map<string, ReturnType<typeof setTimeout>>();

function debouncedFlush(roomCode: string) {
  if (flushTimers.has(roomCode)) return;
  flushTimers.set(roomCode, setTimeout(() => {
    flushTimers.delete(roomCode);
    flushWatchTime(roomCode);
  }, 5000));
}

export function setupSocketHandlers(io: Server) {
  ioRef = io;
  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("join-room", async (roomCode: string, username: string, password?: string) => {
      // Load room from DB if not in memory
      if (!rooms.has(roomCode)) {
        const result = await query("SELECT video_url, video_type, password_hash FROM rooms WHERE code = $1", [roomCode]);
        if (result.rows.length === 0) {
          socket.emit("join-error", { error: "Комната не найдена" });
          return;
        }
        const videoUrl = result.rows[0]?.video_url || null;
        const dbVideoType = result.rows[0]?.video_type;
        const passwordHash = result.rows[0]?.password_hash;
        if (passwordHash && !password) {
          socket.emit("join-error", { error: "Требуется пароль" });
          return;
        }
        if (passwordHash && password && !verifyPassword(password, passwordHash)) {
          socket.emit("join-error", { error: "Неверный пароль" });
          return;
        }
        rooms.set(roomCode, {
          roomId: null,
          videoUrl,
          videoType: (dbVideoType === "file" || dbVideoType === "embed") ? dbVideoType : (videoUrl && /\.(mp4|webm|mkv|mov|avi|ogg|ogv)($|\?)/i.test(videoUrl) ? "file" : "embed"),
          isPlaying: false,
          adPlaying: false,
          currentTime: 0,
          users: new Set(),
          usernames: new Map(),
          hostSocketId: null,
          hostId: null,
          hostOnly: false,
          lastSyncTime: 0,
          userTimes: new Map(),
          watchAccumulator: new Map(),
          voiceUsers: new Set(),
        });
      } else {
        // Room in memory — still check password if it's first user (room may have been loaded without password check)
        const roomState = rooms.get(roomCode)!;
        if (roomState.users.size === 0) {
          const result = await query("SELECT password_hash FROM rooms WHERE code = $1", [roomCode]);
          const passwordHash = result.rows[0]?.password_hash;
          if (passwordHash && !password) {
            socket.emit("join-error", { error: "Требуется пароль" });
            return;
          }
          if (passwordHash && password && !verifyPassword(password, passwordHash)) {
            socket.emit("join-error", { error: "Неверный пароль" });
            return;
          }
        }
      }

      socket.join(roomCode);
      (socket as any).roomCode = roomCode;
      (socket as any).username = username;

      const roomState = rooms.get(roomCode)!;
      const isFirstUser = roomState.users.size === 0;
      roomState.users.add(socket.id);
      roomState.usernames.set(socket.id, username);

      if (isFirstUser) {
        roomState.hostSocketId = socket.id;
        roomState.hostId = username;
        socket.emit("host-changed", { isHost: true });
      }

      await query(
        "UPDATE rooms SET views = views + 1, last_active = NOW() WHERE code = $1",
        [roomCode]
      );

      socket.emit("room-state", {
        videoUrl: roomState.videoUrl,
        videoType: roomState.videoType,
        isHost: roomState.hostSocketId === socket.id,
        hostOnly: roomState.hostOnly,
        currentTime: roomState.currentTime,
        isPlaying: roomState.isPlaying,
        adPlaying: roomState.adPlaying,
      });

      io.to(roomCode).emit("user-count", { userCount: roomState.users.size });

      logEvent(roomCode, username, socket.id, "join-room", { userCount: roomState.users.size }, socket.handshake.address);
    });

    socket.on("change-video", async (roomCode: string, videoUrl: string, videoType: string) => {
      const roomState = rooms.get(roomCode);
      if (!roomState) return;
      if (roomState.hostOnly && roomState.hostSocketId !== socket.id) return;

      const changedBy = roomState.usernames.get(socket.id) || "unknown";
      logEvent(roomCode, changedBy, socket.id, "change-video", { videoUrl, videoType, from: roomState.videoUrl });

      debouncedFlush(roomCode);

      let roomId = roomState.roomId;
      if (!roomId) {
        const roomResult = await query("SELECT id FROM rooms WHERE code = $1", [roomCode]);
        if (roomResult.rows.length > 0) {
          roomId = roomResult.rows[0].id;
          roomState.roomId = roomId;
        }
      }

      if (roomId) {
        if (roomState.videoUrl) {
          await query(
            "INSERT INTO video_history (room_id, url, changed_by) VALUES ($1, $2, $3)",
            [roomId, roomState.videoUrl, changedBy]
          );
        }
        await query(
          "UPDATE rooms SET video_url = $1, video_type = $2, last_active = NOW() WHERE id = $3",
          [videoUrl, videoType === "file" ? "file" : "embed", roomId]
        );
      }

      roomState.videoUrl = videoUrl;
      roomState.videoType = videoType === "file" ? "file" : "embed";
      roomState.currentTime = 0;
      roomState.isPlaying = false;

      io.to(roomCode).emit("video-changed", { videoUrl, videoType: roomState.videoType });
    });

    socket.on("video-action", (roomCode: string, action: string, time: number) => {
      const roomState = rooms.get(roomCode);
      if (!roomState) return;
      if (roomState.hostOnly && roomState.hostSocketId !== socket.id) return;

      roomState.isPlaying = action === "play";
      roomState.currentTime = time;
      roomState.lastSyncTime = Date.now();

      logEvent(roomCode, roomState.usernames.get(socket.id) || "", socket.id, "video-action", { action, time });

      io.to(roomCode).emit("video-sync", { action, time, userId: socket.id });
    });

    socket.on("heartbeat", (roomCode: string, time: number, isPlaying: boolean, username: string) => {
      const roomState = rooms.get(roomCode);
      if (!roomState) return;

      // Update watch time accumulator
      const prev = roomState.userTimes.get(socket.id);
      if (prev && prev.isPlaying && isPlaying && roomState.videoUrl) {
        const delta = Math.abs(time - prev.time);
        if (delta > 0 && delta < 10) {
          const current = roomState.watchAccumulator.get(username) || 0;
          roomState.watchAccumulator.set(username, current + delta);
        }
      }
      roomState.userTimes.set(socket.id, { time, isPlaying, username });

      // If host — broadcast sync to non-host clients only
      if (roomState.hostSocketId === socket.id) {
        roomState.currentTime = time;
        roomState.isPlaying = isPlaying;
        socket.to(roomCode).emit("heartbeat", { time, isPlaying, userId: socket.id });
      }

      // Send full user-times only to host (for sync display)
      if (roomState.hostSocketId && roomState.hostSocketId !== socket.id) {
        const timesArray: { time: number; isPlaying: boolean; username: string }[] = [];
        roomState.userTimes.forEach((val) => timesArray.push(val));
        const watchTimes: { username: string; seconds: number }[] = [];
        roomState.watchAccumulator.forEach((seconds, username) => {
          watchTimes.push({ username, seconds });
        });
        io.to(roomState.hostSocketId).emit("user-times", { users: timesArray, watchTimes });
      }
    });

    socket.on("set-host-only", (roomCode: string, hostOnly: boolean) => {
      const roomState = rooms.get(roomCode);
      if (!roomState) return;
      if (roomState.hostSocketId !== socket.id) return;
      roomState.hostOnly = hostOnly;
      logEvent(roomCode, roomState.usernames.get(socket.id) || "", socket.id, "set-host-only", { hostOnly });
      io.to(roomCode).emit("host-only-changed", { hostOnly });
    });

    socket.on("get-watch-time", (roomCode: string) => {
      const roomState = rooms.get(roomCode);
      if (!roomState) return;
      const watchTimes: { username: string; seconds: number }[] = [];
      roomState.watchAccumulator.forEach((seconds, username) => {
        watchTimes.push({ username, seconds });
      });
      socket.emit("watch-time-update", { watchTimes, videoUrl: roomState.videoUrl });
    });

    socket.on("ad-started", (roomCode: string) => {
      const roomState = rooms.get(roomCode);
      if (!roomState) return;
      if (socket.id !== roomState.hostSocketId) return;
      roomState.adPlaying = true;
      const socketUsername = roomState.usernames.get(socket.id) || "";
      logEvent(roomCode, socketUsername, socket.id, "ad-started");
      io.to(roomCode).emit("ad-state-changed", { isAd: true });
    });

    socket.on("ad-ended", (roomCode: string) => {
      const roomState = rooms.get(roomCode);
      if (!roomState) return;
      if (socket.id !== roomState.hostSocketId) return;
      roomState.adPlaying = false;
      const socketUsername = roomState.usernames.get(socket.id) || "";
      logEvent(roomCode, socketUsername, socket.id, "ad-ended");
      io.to(roomCode).emit("ad-state-changed", { isAd: false });
    });

    socket.on("ad-sync", (roomCode: string, action: string, time: number) => {
      const roomState = rooms.get(roomCode);
      if (!roomState) return;
      if (roomState.hostOnly && roomState.hostSocketId !== socket.id) return;

      roomState.isPlaying = action === "play";
      roomState.currentTime = time;
      roomState.lastSyncTime = Date.now();

      io.to(roomCode).emit("video-sync", { action, time, userId: socket.id });
    });

    socket.on("chat-message", async (roomCode: string, message: { author: string; text: string; replyToId?: string }) => {
      if (!message || typeof message.text !== "string" || message.text.length > 5000 || message.text.trim().length === 0) return;
      if (!message.author || typeof message.author !== "string") return;

      const roomState = rooms.get(roomCode);
      let roomId = roomState?.roomId;

      if (!roomId) {
        const roomResult = await query("SELECT id FROM rooms WHERE code = $1", [roomCode]);
        if (roomResult.rows.length === 0) {
          roomId = generateId();
          await query("INSERT INTO rooms (id, code, video_url) VALUES ($1, $2, NULL) ON CONFLICT DO NOTHING", [roomId, roomCode]);
        } else {
          roomId = roomResult.rows[0].id;
        }
        if (roomState && roomId) roomState.roomId = roomId;
      }

      const msgId = generateId();
      const now = new Date().toISOString();

      messageBuffer.push({
        roomId: roomId!,
        msgId,
        author: message.author,
        text: message.text,
        replyToId: message.replyToId || null,
        createdAt: now,
      });

      logEvent(roomCode, message.author, socket.id, "chat-message", { textLen: message.text.length });

      io.to(roomCode).emit("new-message", {
        id: msgId,
        roomId,
        author: message.author,
        text: message.text,
        replyToId: message.replyToId || null,
        createdAt: now,
      });
    });

    socket.on("emoji-reaction", (roomCode: string, emoji: string) => {
      const roomState = rooms.get(roomCode);
      const username = roomState?.usernames.get(socket.id) || "";
      logEvent(roomCode, username, socket.id, "emoji-reaction", { emoji });
      socket.to(roomCode).emit("reaction", { emoji, userId: socket.id });
    });

    socket.on("queue-add", async (roomCode: string, videoUrl: string, title?: string) => {
      const roomState = rooms.get(roomCode);
      if (!roomState) return;
      let roomId = roomState.roomId;
      if (!roomId) {
        const roomResult = await query("SELECT id FROM rooms WHERE code = $1", [roomCode]);
        if (roomResult.rows.length === 0) return;
        roomId = roomResult.rows[0].id;
        roomState.roomId = roomId;
      }
      const maxResult = await query(
        "SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order FROM queue WHERE room_id = $1",
        [roomId]
      );
      const nextOrder = maxResult.rows[0].next_order;
      const id = generateId();
      await query(
        "INSERT INTO queue (id, room_id, url, title, sort_order) VALUES ($1, $2, $3, $4, $5)",
        [id, roomId, videoUrl, title || null, nextOrder]
      );
      const item = { id, url: videoUrl, title: title || null, order: nextOrder };
      io.to(roomCode).emit("queue-updated", { action: "add", item });
    });

    socket.on("queue-remove", async (roomCode: string, itemId: string) => {
      const roomState = rooms.get(roomCode);
      if (!roomState) return;
      let roomId = roomState.roomId;
      if (!roomId) {
        const roomResult = await query("SELECT id FROM rooms WHERE code = $1", [roomCode]);
        if (roomResult.rows.length === 0) return;
        roomId = roomResult.rows[0].id;
        roomState.roomId = roomId;
      }
      await query("DELETE FROM queue WHERE id = $1 AND room_id = $2", [itemId, roomId]);
      io.to(roomCode).emit("queue-updated", { action: "remove", removedItemId: itemId });
    });

    socket.on("call-user", (roomCode: string, offer: any, callerName: string) => {
      logEvent(roomCode, callerName, socket.id, "call-user");
      socket.to(roomCode).emit("call-made", offer, callerName);
    });

    socket.on("make-answer", (roomCode: string, answer: any) => {
      socket.to(roomCode).emit("answer-made", answer);
    });

    socket.on("ice-candidate", (roomCode: string, candidate: any) => {
      socket.to(roomCode).emit("ice-candidate", candidate);
    });

    socket.on("end-call", (roomCode: string) => {
      const roomState = rooms.get(roomCode);
      const username = roomState?.usernames.get(socket.id) || "";
      logEvent(roomCode, username, socket.id, "end-call");
      socket.to(roomCode).emit("call-ended");
    });

    socket.on("play-next", async (roomCode: string) => {
      const roomState = rooms.get(roomCode);
      if (!roomState) return;

      if (socket.id !== roomState.hostSocketId) return;
      const socketUsername = roomState.usernames.get(socket.id) || "";

      let roomId = roomState.roomId;
      if (!roomId) {
        const roomResult = await query("SELECT id FROM rooms WHERE code = $1", [roomCode]);
        if (roomResult.rows.length === 0) return;
        roomId = roomResult.rows[0].id;
        roomState.roomId = roomId;
      }

      const nextResult = await query(
        "SELECT id, url, title FROM queue WHERE room_id = $1 ORDER BY sort_order ASC LIMIT 1",
        [roomId]
      );

      if (nextResult.rows.length === 0) {
        io.to(roomCode).emit("video-changed", { videoUrl: null, videoType: "embed" });
        roomState.videoUrl = null;
        return;
      }

      const next = nextResult.rows[0];
      const nextVideoType = /\.(mp4|webm|mkv|mov|avi|ogg|ogv)($|\?)/i.test(next.url) ? "file" : "embed";
      await query("DELETE FROM queue WHERE id = $1", [next.id]);
      await query(
        "UPDATE rooms SET video_url = $1, video_type = $2, last_active = NOW() WHERE id = $3",
        [next.url, nextVideoType, roomId]
      );

      if (roomState.videoUrl) {
        await query(
          "INSERT INTO video_history (room_id, url, changed_by) VALUES ($1, $2, $3)",
          [roomId, roomState.videoUrl, "auto"]
        );
      }

      roomState.videoUrl = next.url;
      roomState.videoType = nextVideoType;
      roomState.currentTime = 0;
      roomState.isPlaying = true;

      logEvent(roomCode, socketUsername || "", socket.id, "play-next", { videoUrl: next.url, title: next.title });

      io.to(roomCode).emit("video-changed", { videoUrl: next.url, videoType: /\.(mp4|webm|mkv|mov|avi|ogg|ogv)($|\?)/i.test(next.url) ? "file" : "embed" });
      io.to(roomCode).emit("queue-updated", { action: "next", removedItem: { id: next.id, url: next.url, title: next.title } });
    });

    // ============ VOICE CHAT ============

    socket.on("voice-join", (roomCode: string) => {
      const roomState = rooms.get(roomCode);
      if (!roomState) return;

      roomState.voiceUsers.add(socket.id);

      // Send existing voice users to the new joiner
      const existingUsers: { socketId: string; username: string }[] = [];
      roomState.voiceUsers.forEach((sid) => {
        if (sid !== socket.id) {
          existingUsers.push({ socketId: sid, username: roomState.usernames.get(sid) || "unknown" });
        }
      });
      socket.emit("voice-users", existingUsers);

      // Notify others
      socket.to(roomCode).emit("voice-user-joined", socket.id, roomState.usernames.get(socket.id) || "unknown");

      logEvent(roomCode, roomState.usernames.get(socket.id) || "", socket.id, "voice-join", { voiceUsers: roomState.voiceUsers.size });
    });

    socket.on("voice-leave", (roomCode: string) => {
      const roomState = rooms.get(roomCode);
      if (!roomState) return;

      roomState.voiceUsers.delete(socket.id);
      socket.to(roomCode).emit("voice-user-left", socket.id);

      logEvent(roomCode, roomState.usernames.get(socket.id) || "", socket.id, "voice-leave", { voiceUsers: roomState.voiceUsers.size });
    });

    socket.on("voice-offer", (roomCode: string, targetSocketId: string, offer: any) => {
      io.to(targetSocketId).emit("voice-offer", socket.id, offer, rooms.get(roomCode)?.usernames.get(socket.id) || "unknown");
    });

    socket.on("voice-answer", (roomCode: string, targetSocketId: string, answer: any) => {
      io.to(targetSocketId).emit("voice-answer", socket.id, answer);
    });

    socket.on("voice-ice", (roomCode: string, targetSocketId: string, candidate: any) => {
      io.to(targetSocketId).emit("voice-ice", socket.id, candidate);
    });

    socket.on("voice-speaking", (roomCode: string, speaking: boolean) => {
      socket.to(roomCode).emit("voice-speaking", socket.id, speaking);
    });

    socket.on("disconnect", async () => {
      const roomCode = (socket as any).roomCode;
      const username = (socket as any).username || "unknown";
      if (!roomCode) return;

      console.log("User disconnected:", socket.id);
      const roomState = rooms.get(roomCode);
      if (!roomState) return;

      roomState.users.delete(socket.id);
      roomState.usernames.delete(socket.id);
      roomState.userTimes.delete(socket.id);

      // Voice chat cleanup
      if (roomState.voiceUsers.has(socket.id)) {
        roomState.voiceUsers.delete(socket.id);
        io.to(roomCode).emit("voice-user-left", socket.id);
      }

      logEvent(roomCode, username, socket.id, "disconnect", { remaining: roomState.users.size });

      debouncedFlush(roomCode);

      io.to(roomCode).emit("user-count", { userCount: roomState.users.size });
      const timesArray: { time: number; isPlaying: boolean; username: string }[] = [];
      roomState.userTimes.forEach((val) => timesArray.push(val));
      io.to(roomCode).emit("user-times", { users: timesArray });
      if (roomState.hostSocketId === socket.id) {
        const remaining = Array.from(roomState.users);
        roomState.hostSocketId = remaining.length > 0 ? remaining[0] : null;
        if (roomState.hostSocketId) io.to(roomState.hostSocketId).emit("host-changed", { isHost: true });
      }
      if (roomState.users.size === 0) rooms.delete(roomCode);
    });
  });
}

// Flush all watch time every 60 seconds
setInterval(() => {
  rooms.forEach((_state, roomCode) => {
    flushWatchTime(roomCode);
  });
}, 60000);

export function getActiveRooms() {
  const active: { code: string; users: number; videoUrl: string | null }[] = [];
  rooms.forEach((state, code) => {
    active.push({ code, users: state.users.size, videoUrl: state.videoUrl });
  });
  return active;
}

export function getActiveUserCount() {
  let count = 0;
  rooms.forEach((state) => { count += state.users.size; });
  return count;
}
