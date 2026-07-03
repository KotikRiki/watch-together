import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

const SOCKET_URL = window.location.port === "5173"
  ? `http://${window.location.hostname}:3001`
  : window.location.origin;

export function useSocket(roomCode: string | null) {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [users, setUsers] = useState(0);

  useEffect(() => {
    if (!roomCode) return;

    const socket = io(SOCKET_URL);
    socketRef.current = socket;

    socket.on("connect", () => {
      setIsConnected(true);
    });

    socket.on("disconnect", () => {
      setIsConnected(false);
    });

    socket.on("user-count", (data: { userCount: number }) => {
      setUsers(data.userCount);
    });

    return () => {
      socket.disconnect();
    };
  }, [roomCode]);

  const joinRoom = (username: string) => {
    if (socketRef.current && roomCode) {
      socketRef.current.emit("join-room", roomCode, username);
    }
  };

  const emitVideoAction = (action: string, time: number) => {
    if (socketRef.current && roomCode) {
      socketRef.current.emit("video-action", roomCode, action, time);
    }
  };

  const emitVideoSync = (action: string, time: number) => {
    if (socketRef.current && roomCode) {
      socketRef.current.emit("ad-sync", roomCode, action, time);
    }
  };

  const emitChangeVideo = (videoUrl: string, videoType: string = "embed") => {
    if (socketRef.current && roomCode) {
      socketRef.current.emit("change-video", roomCode, videoUrl, videoType);
    }
  };

  const emitChatMessage = (author: string, text: string, replyToId?: string) => {
    if (socketRef.current && roomCode) {
      socketRef.current.emit("chat-message", roomCode, { author, text, replyToId });
    }
  };

  const emitEmojiReaction = (emoji: string) => {
    if (socketRef.current && roomCode) {
      socketRef.current.emit("emoji-reaction", roomCode, emoji);
    }
  };

  const emitQueueAdd = (videoUrl: string, title?: string) => {
    if (socketRef.current && roomCode) {
      socketRef.current.emit("queue-add", roomCode, videoUrl, title);
    }
  };

  const emitQueueNext = () => {
    if (socketRef.current && roomCode) {
      socketRef.current.emit("remove-from-queue", roomCode);
    }
  };

  const emitPlayNext = () => {
    if (socketRef.current && roomCode) {
      socketRef.current.emit("play-next", roomCode);
    }
  };

  const on = (event: string, callback: (...args: any[]) => void) => {
    if (socketRef.current) {
      socketRef.current.on(event, callback);
    }
  };

  const off = (event: string, callback?: (...args: any[]) => void) => {
    if (socketRef.current) {
      socketRef.current.off(event, callback);
    }
  };

  return {
    socket: socketRef.current,
    isConnected,
    users,
    joinRoom,
    emitVideoAction,
    emitVideoSync,
    emitChangeVideo,
    emitChatMessage,
    emitEmojiReaction,
    emitQueueAdd,
    emitQueueNext,
    emitPlayNext,
    on,
    off,
  };
}
