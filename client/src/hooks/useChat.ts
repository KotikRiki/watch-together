import { useState, useRef, useCallback } from "react";
import type { Socket } from "socket.io-client";

interface Message {
  id: string;
  author: string;
  text: string;
  replyToId?: string | null;
  createdAt: string;
  userColor?: string;
}

interface UseChatOptions {
  socket: Socket | null;
  roomCode: string;
  username: string;
  on: (event: string, callback: (...args: any[]) => void) => void;
  off: (event: string, callback?: (...args: any[]) => void) => void;
}

export function useChat({
  socket,
  roomCode,
  username,
}: UseChatOptions) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatListRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  }, []);

  const addMessage = useCallback((msg: Message) => {
    setMessages(prev => {
      const exists = prev.some(m => m.id === msg.id);
      if (exists) return prev;
      return [...prev, msg];
    });
  }, []);

  const handleChatMessage = useCallback((msg: Message) => {
    addMessage(msg);
    scrollToBottom();
  }, [addMessage, scrollToBottom]);

  const handleChatHistory = useCallback((history: Message[]) => {
    setMessages(history);
    scrollToBottom();
  }, [scrollToBottom]);

  const sendMessage = useCallback(() => {
    if (!chatInput.trim()) return;
    if (!username) return;
    socket?.emit("chat-message", roomCode, { author: username, text: chatInput.trim(), replyToId: replyTo?.id || null });
    setChatInput("");
    setReplyTo(null);
  }, [chatInput, username, socket, roomCode, replyTo]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }, [sendMessage]);

  return {
    messages,
    chatInput,
    setChatInput,
    replyTo,
    setReplyTo,
    messagesEndRef,
    chatListRef,
    sendMessage,
    handleKeyDown,
    handleChatMessage,
    handleChatHistory,
    addMessage,
  };
}
