import { Server, Socket } from "socket.io";
import { query, generateId } from "../db/postgres";

interface RoomState {
  videoUrl: string | null;
  videoType: "embed" | "file";
  isPlaying: boolean;
  currentTime: number;
  users: Set<string>;
  usernames: Map<string, string>;
  hostSocketId: string | null;
  hostOnly: boolean;
  lastSyncTime: number;
  userTimes: Map<string, { time: number; isPlaying: boolean; username: string }>;
  watchAccumulator: Map<string, number>;
}

const rooms = new Map<string, RoomState>();
let ioRef: Server | null = null;

export function broadcastToRoom(roomCode: string, event: string, data: any) {
  ioRef?.to(roomCode).emit(event, data);
}

async function flushWatchTime(roomCode: string) {
  const roomState = rooms.get(roomCode);
  if (!roomState || !roomState.videoUrl) return;

  const roomResult = await query("SELECT id FROM rooms WHERE code = $1", [roomCode]);
  if (roomResult.rows.length === 0) return;
  const roomId = roomResult.rows[0].id;

  for (const [username, seconds] of roomState.watchAccumulator) {
    if (seconds <= 0) continue;
    await query(
      `INSERT INTO watch_sessions (room_id, video_url, username, watched_seconds)
       VALUES ($1, $2, $3, $4)`,
      [roomId, roomState.videoUrl, username, seconds]
    );
  }
  roomState.watchAccumulator.clear();
}

export function setupSocketHandlers(io: Server) {
  ioRef = io;
  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("join-room", async (roomCode: string, username: string) => {
      socket.join(roomCode);

      if (!rooms.has(roomCode)) {
        const result = await query("SELECT video_url FROM rooms WHERE code = $1", [roomCode]);
        const videoUrl = result.rows[0]?.video_url || null;
        rooms.set(roomCode, {
          videoUrl,
          videoType: "embed",
          isPlaying: false,
          currentTime: 0,
          users: new Set(),
          usernames: new Map(),
          hostSocketId: null,
          hostOnly: false,
          lastSyncTime: 0,
          userTimes: new Map(),
          watchAccumulator: new Map(),
        });
      }

      const roomState = rooms.get(roomCode)!;
      const isFirstUser = roomState.users.size === 0;
      roomState.users.add(socket.id);
      roomState.usernames.set(socket.id, username);

      if (isFirstUser) {
        roomState.hostSocketId = socket.id;
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
      });

      io.to(roomCode).emit("user-count", { userCount: roomState.users.size });
    });

    socket.on("change-video", async (roomCode: string, videoUrl: string, videoType: string) => {
      const roomState = rooms.get(roomCode);
      if (!roomState) return;
      if (roomState.hostOnly && roomState.hostSocketId !== socket.id) return;

      const changedBy = roomState.usernames.get(socket.id) || "unknown";

      await flushWatchTime(roomCode);

      const roomResult = await query("SELECT id FROM rooms WHERE code = $1", [roomCode]);
      if (roomResult.rows.length > 0) {
        const roomId = roomResult.rows[0].id;

        if (roomState.videoUrl) {
          await query(
            "INSERT INTO video_history (room_id, url, changed_by) VALUES ($1, $2, $3)",
            [roomId, roomState.videoUrl, changedBy]
          );
        }

        await query(
          "UPDATE rooms SET video_url = $1, last_active = NOW() WHERE code = $2",
          [videoUrl, roomCode]
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

      socket.to(roomCode).emit("video-sync", { action, time, userId: socket.id });
    });

    socket.on("heartbeat", (roomCode: string, time: number, isPlaying: boolean) => {
      const roomState = rooms.get(roomCode);
      if (!roomState) return;
      if (roomState.hostSocketId !== socket.id) return;

      roomState.currentTime = time;
      roomState.isPlaying = isPlaying;
      socket.to(roomCode).emit("heartbeat", { time, isPlaying, userId: socket.id });
    });

    socket.on("user-time", (roomCode: string, time: number, isPlaying: boolean, username: string) => {
      const roomState = rooms.get(roomCode);
      if (!roomState) return;

      const prev = roomState.userTimes.get(socket.id);
      if (prev && prev.isPlaying && isPlaying && roomState.videoUrl) {
        const delta = Math.abs(time - prev.time);
        if (delta > 0 && delta < 10) {
          const current = roomState.watchAccumulator.get(username) || 0;
          roomState.watchAccumulator.set(username, current + delta);
        }
      }

      roomState.userTimes.set(socket.id, { time, isPlaying, username });
      const timesArray: { time: number; isPlaying: boolean; username: string }[] = [];
      roomState.userTimes.forEach((val) => timesArray.push(val));
      io.to(roomCode).emit("user-times", { users: timesArray });
    });

    socket.on("set-host-only", (roomCode: string, hostOnly: boolean) => {
      const roomState = rooms.get(roomCode);
      if (!roomState) return;
      if (roomState.hostSocketId !== socket.id) return;
      roomState.hostOnly = hostOnly;
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
      io.to(roomCode).emit("ad-state-changed", { isAd: true });
    });

    socket.on("ad-ended", (roomCode: string) => {
      const roomState = rooms.get(roomCode);
      if (!roomState) return;
      io.to(roomCode).emit("ad-state-changed", { isAd: false });
    });

    socket.on("ad-sync", (roomCode: string, action: string, time: number) => {
      const roomState = rooms.get(roomCode);
      if (!roomState) return;

      roomState.isPlaying = action === "play";
      roomState.currentTime = time;
      roomState.lastSyncTime = Date.now();

      socket.to(roomCode).emit("video-sync", { action, time, userId: socket.id });
    });

    socket.on("chat-message", async (roomCode: string, message: { author: string; text: string; replyToId?: string }) => {
      let roomResult = await query("SELECT id FROM rooms WHERE code = $1", [roomCode]);
      let roomId: string;

      if (roomResult.rows.length === 0) {
        roomId = generateId();
        await query(
          "INSERT INTO rooms (id, code, video_url) VALUES ($1, $2, NULL) ON CONFLICT DO NOTHING",
          [roomId, roomCode]
        );
      } else {
        roomId = roomResult.rows[0].id;
      }

      const msgId = generateId();
      await query(
        "INSERT INTO messages (id, room_id, author, text, reply_to_id) VALUES ($1, $2, $3, $4, $5)",
        [msgId, roomId, message.author, message.text, message.replyToId || null]
      );

      await query(
        "UPDATE rooms SET total_messages = total_messages + 1, last_active = NOW() WHERE id = $1",
        [roomId]
      );

      io.to(roomCode).emit("new-message", {
        id: msgId,
        roomId,
        author: message.author,
        text: message.text,
        replyToId: message.replyToId || null,
        createdAt: new Date().toISOString(),
      });
    });

    socket.on("emoji-reaction", (roomCode: string, emoji: string) => {
      socket.to(roomCode).emit("reaction", { emoji, userId: socket.id });
    });

    socket.on("call-user", (roomCode: string, offer: any, callerName: string) => {
      socket.to(roomCode).emit("call-made", offer, callerName);
    });

    socket.on("make-answer", (roomCode: string, answer: any) => {
      socket.to(roomCode).emit("answer-made", answer);
    });

    socket.on("ice-candidate", (roomCode: string, candidate: any) => {
      socket.to(roomCode).emit("ice-candidate", candidate);
    });

    socket.on("end-call", (roomCode: string) => {
      socket.to(roomCode).emit("call-ended");
    });

    socket.on("play-next", async (roomCode: string) => {
      const roomState = rooms.get(roomCode);
      if (!roomState) return;

      const roomResult = await query("SELECT id FROM rooms WHERE code = $1", [roomCode]);
      if (roomResult.rows.length === 0) return;
      const roomId = roomResult.rows[0].id;

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
      await query("DELETE FROM queue WHERE id = $1", [next.id]);
      await query(
        "UPDATE rooms SET video_url = $1, last_active = NOW() WHERE id = $2",
        [next.url, roomId]
      );

      if (roomState.videoUrl) {
        await query(
          "INSERT INTO video_history (room_id, url, changed_by) VALUES ($1, $2, $3)",
          [roomId, roomState.videoUrl, "auto"]
        );
      }

      roomState.videoUrl = next.url;
      roomState.currentTime = 0;
      roomState.isPlaying = true;

      io.to(roomCode).emit("video-changed", { videoUrl: next.url, videoType: "embed" });
      io.to(roomCode).emit("queue-updated", { action: "next", removedItem: { id: next.id, url: next.url, title: next.title } });
    });

    socket.on("disconnect", async () => {
      console.log("User disconnected:", socket.id);
      for (const [roomCode, roomState] of rooms) {
        if (roomState.users.has(socket.id)) {
          const username = roomState.usernames.get(socket.id) || "unknown";
          roomState.users.delete(socket.id);
          roomState.usernames.delete(socket.id);
          roomState.userTimes.delete(socket.id);

          await flushWatchTime(roomCode);

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
        }
      }
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
