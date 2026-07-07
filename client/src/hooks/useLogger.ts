import { useCallback, useRef } from "react";

const API_URL = window.location.port === "5173"
  ? `http://${window.location.hostname}:3001`
  : "";

function sendToServer(endpoint: string, data: any) {
  try {
    fetch(`${API_URL}/api/logger/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).catch(() => {});
  } catch {}
}

export function useLogger() {
  const sessionIdRef = useRef<string>(Math.random().toString(36).substring(2, 10));

  const logEvent = useCallback((roomCode: string, username: string, socketId: string, eventType: string, eventData?: any) => {
    sendToServer("event", {
      roomCode,
      username,
      socketId,
      eventType,
      eventData,
      sessionId: sessionIdRef.current,
    });
  }, []);

  const logError = useCallback((roomCode: string, username: string, source: string, message: string, stack?: string) => {
    sendToServer("error", {
      roomCode,
      username,
      source,
      message,
      stack,
      url: window.location.href,
      userAgent: navigator.userAgent,
    });
  }, []);

  const logVoiceEvent = useCallback((roomCode: string, username: string, socketId: string, action: string, data?: any) => {
    logEvent(roomCode, username, socketId, `voice-${action}`, data);
  }, [logEvent]);

  const logVideoEvent = useCallback((roomCode: string, username: string, socketId: string, action: string, data?: any) => {
    logEvent(roomCode, username, socketId, `video-${action}`, data);
  }, [logEvent]);

  const logChatEvent = useCallback((roomCode: string, username: string, socketId: string, action: string, data?: any) => {
    logEvent(roomCode, username, socketId, `chat-${action}`, data);
  }, [logEvent]);

  return {
    logEvent,
    logError,
    logVoiceEvent,
    logVideoEvent,
    logChatEvent,
  };
}
