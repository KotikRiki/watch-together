import { Server, Socket } from "socket.io";
import { getDB, generateId, saveDB } from "../db/sqlite";

interface RoomState {
  videoUrl: string | null;
  videoType: "embed" | "file";
  isPlaying: boolean;
  currentTime: number;
  users: Set<string>;
  hostSocketId: string | null;
  hostOnly: boolean;
  lastSyncTime: number;
  userTimes: Map<string, { time: number; isPlaying: boolean; username: string }>;
}

const rooms = new Map<string, RoomState>();

export function setupSocketHandlers(io: Server) {
  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("join-room", (roomCode: string, username: string) => {
      socket.join(roomCode);

      if (!rooms.has(roomCode)) {
        const db = getDB();
        const room = db.rooms.find((r: any) => r.code === roomCode);
        rooms.set(roomCode, {
          videoUrl: room?.videoUrl || null,
          videoType: "embed",
          isPlaying: false,
          currentTime: 0,
          users: new Set(),
          hostSocketId: null,
          hostOnly: false,
          lastSyncTime: 0,
          userTimes: new Map(),
        });
      }

      const roomState = rooms.get(roomCode)!;
      const isFirstUser = roomState.users.size === 0;
      roomState.users.add(socket.id);

      if (isFirstUser) {
        roomState.hostSocketId = socket.id;
        socket.emit("host-changed", { isHost: true });
      }

      socket.emit("room-state", {
        videoUrl: roomState.videoUrl,
        videoType: roomState.videoType,
        isHost: roomState.hostSocketId === socket.id,
        hostOnly: roomState.hostOnly,
      });

      io.to(roomCode).emit("user-count", { userCount: roomState.users.size });
    });

    socket.on("change-video", (roomCode: string, videoUrl: string, videoType: string) => {
      const roomState = rooms.get(roomCode);
      if (!roomState) return;
      if (roomState.hostOnly && roomState.hostSocketId !== socket.id) return;

      roomState.videoUrl = videoUrl;
      roomState.videoType = videoType === "file" ? "file" : "embed";
      roomState.currentTime = 0;
      roomState.isPlaying = false;

      const db = getDB();
      const room = db.rooms.find((r: any) => r.code === roomCode);
      if (room) { room.videoUrl = videoUrl; saveDB(); }

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

    socket.on("chat-message", (roomCode: string, message: { author: string; text: string }) => {
      const db = getDB();
      let room = db.rooms.find((r: any) => r.code === roomCode);
      let roomId: string;

      if (!room) {
        roomId = generateId();
        db.rooms.push({ id: roomId, code: roomCode, videoUrl: null, createdAt: new Date().toISOString() });
      } else {
        roomId = room.id;
      }

      const msgId = generateId();
      const msg = { id: msgId, roomId, author: message.author, text: message.text, createdAt: new Date().toISOString() };
      db.messages.push(msg);
      saveDB();

      io.to(roomCode).emit("new-message", msg);
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

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
      rooms.forEach((roomState, roomCode) => {
        if (roomState.users.has(socket.id)) {
          roomState.users.delete(socket.id);
          roomState.userTimes.delete(socket.id);
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
      });
    });
  });
}
