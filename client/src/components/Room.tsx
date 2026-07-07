import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useSocket } from "../hooks/useSocket";
import { VideoPlayer } from "./VideoPlayer";
import { VideoCall } from "./VideoCall";
import { LandscapeChat } from "./LandscapeChat";
import type { VideoPlayerHandle } from "./VideoPlayer";
import { Chat } from "./Chat";
import { StickerPanel } from "./StickerPanel";
import { Queue } from "./Queue";

interface Message {
  id: string;
  author: string;
  text: string;
  replyToId?: string | null;
  createdAt: string;
}

interface QueueItem {
  id: string;
  url: string;
  title: string | null;
  order: number;
}

const EMOJI_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🔥", "🎉", "👀", "💯", "😱", "🤣", "😍", "🥳", "😎", "🤔", "💀"];

export function Room() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const [username, setUsername] = useState<string | null>(() => localStorage.getItem("wt_username"));
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoType, setVideoType] = useState<"embed" | "file">("embed");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadSpeed, setUploadSpeed] = useState(0);
  const [uploadRemaining, setUploadRemaining] = useState("");
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [reactions, setReactions] = useState<{ id: number; emoji: string; x: number; y: number }[]>([]);
  const [floatingMessages, setFloatingMessages] = useState<{ id: number; text: string; author: string }[]>([]);
  const lastMsgCountRef = useRef(0);
  const [syncAction, setSyncAction] = useState<{ action: string; time: number } | null>(null);
  const [showCall, setShowCall] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [chatExpanded, setChatExpanded] = useState(false);
  const [showStickersMobile, setShowStickersMobile] = useState(false);
  const [replyToMobile, setReplyToMobile] = useState<Message | null>(null);
  const [adPlaying, setAdPlaying] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLandscape, setIsLandscape] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showRotateHint, setShowRotateHint] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<string | null>(null);
  const rotateHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isMobile, setIsMobile] = useState(() => {
    const ua = navigator.userAgent;
    const isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    const isSmallScreen = window.innerWidth < 1024;
    const isMobileUA = /Android|iPhone|iPad|iPod|Telegram/i.test(ua);
    return isSmallScreen || (isTouchDevice && isMobileUA);
  });
  const roomContainerRef = useRef<HTMLDivElement>(null);
  const desktopContainerRef = useRef<HTMLDivElement>(null);
  const [landscapeChatOpen, setLandscapeChatOpen] = useState(false);
  const [landscapeEmojiOpen, setLandscapeEmojiOpen] = useState(false);
  const [landscapeBarsVisible, setLandscapeBarsVisible] = useState(true);
  const landscapeBarsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isUserActionRef = useRef(false);
  const pendingStateRef = useRef<{ currentTime: number; isPlaying: boolean } | null>(null);
  const lastUserActionRef = useRef(0);

  useEffect(() => {
    chatExpandedRef.current = chatExpanded;
  }, [chatExpanded]);

  useEffect(() => {
    document.title = "Watch Together";
    return () => { document.title = "Watch Together"; };
  }, []);

  // Orientation detection + mobile recheck
  useEffect(() => {
    const check = () => {
      const ls = window.matchMedia("(orientation: landscape)").matches;
      const wide = window.innerWidth > window.innerHeight;
      setIsLandscape(ls || wide);
      const ua = navigator.userAgent;
      const isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;
      const isSmallScreen = window.innerWidth < 1024;
      const isMobileUA = /Android|iPhone|iPad|iPod|Telegram/i.test(ua);
      setIsMobile(isSmallScreen || (isTouchDevice && isMobileUA));
    };
    check();
    const onResize = () => check();
    const onOrientation = () => setTimeout(check, 100);
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onOrientation);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onOrientation);
    };
  }, []);

  // Fullscreen tracking
  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const toggleFullscreen = async () => {
    if (isMobile) {
      if (isLandscape) {
        // Try to exit fullscreen
        try { await document.exitFullscreen(); } catch {}
        // Force Safari to show address bar
        window.scrollTo(0, 1);
        setTimeout(() => window.scrollTo(0, 0), 200);
        return;
      }
      // Portrait — try Fullscreen API on document.documentElement (works on iOS Safari)
      try {
        await document.documentElement.requestFullscreen();
        return;
      } catch {}
      // Fallback: show rotate hint
      setShowRotateHint(true);
      if (rotateHintTimerRef.current) clearTimeout(rotateHintTimerRef.current);
      rotateHintTimerRef.current = setTimeout(() => setShowRotateHint(false), 5000);
      return;
    }
    // Desktop — native fullscreen
    const container = desktopContainerRef.current;
    if (!container) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await container.requestFullscreen();
      }
    } catch {}
  };

  useEffect(() => {
    if (chatExpanded) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      setUnreadCount(0);
      if (document.title.startsWith("(")) document.title = document.title.replace(/^\(\d+\)\s*/, "");
    }
    // Show new messages as floating in landscape
    if (isLandscape && !chatExpanded && messages.length > lastMsgCountRef.current && messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.author !== username && !lastMsg.text.startsWith("[sticker]")) {
        const fm = { id: Date.now(), text: lastMsg.text, author: lastMsg.author };
        setFloatingMessages(prev => [...prev.slice(-4), fm]);
        setTimeout(() => setFloatingMessages(prev => prev.filter(m => m.id !== fm.id)), 5000);
      }
    }
    lastMsgCountRef.current = messages.length;
  }, [messages, chatExpanded, isLandscape, username]);
  const [playerState, setPlayerState] = useState<"playing" | "paused" | "ended">("paused");
  const playerStateRef = useRef<"playing" | "paused" | "ended">("paused");
  const [isHost, setIsHost] = useState(false);
  const [hostOnly, setHostOnly] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const [peerTimes, setPeerTimes] = useState<{ time: number; isPlaying: boolean; username: string }[]>([]);
  const [watchTimes, setWatchTimes] = useState<{ username: string; seconds: number }[]>([]);
  const videoPlayerRef = useRef<VideoPlayerHandle>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatExpandedRef = useRef(false);
  const lastSyncEventRef = useRef(0);
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const syncFromActionRef = useRef(false);
  const lastExternalChangeRef = useRef(0);
  const manualAdRef = useRef(false);
  const manualAdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    playerStateRef.current = playerState;
  }, [playerState]);

  // Auto-hide landscape bars after 3s
  useEffect(() => {
    if (isLandscape && !landscapeChatOpen && !showCall) {
      landscapeBarsTimerRef.current = setTimeout(() => setLandscapeBarsVisible(false), 3000);
    } else {
      setLandscapeBarsVisible(true);
    }
    return () => { if (landscapeBarsTimerRef.current) clearTimeout(landscapeBarsTimerRef.current); };
  }, [isLandscape, landscapeChatOpen, showCall]);

  const resetLandscapeBars = () => {
    setLandscapeBarsVisible(true);
    if (landscapeBarsTimerRef.current) clearTimeout(landscapeBarsTimerRef.current);
    if (isLandscape && !landscapeChatOpen && !showCall) {
      landscapeBarsTimerRef.current = setTimeout(() => setLandscapeBarsVisible(false), 3000);
    }
  };

  const {
    socket,
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
  } = useSocket(code || null);

  // Auto-join room after username is set
  useEffect(() => {
    if (username && socket && isConnected) {
      joinRoom(username);
    }
  }, [username, socket, isConnected]);

  useEffect(() => {
    if (!socket) return;

    on("room-state", (data: { videoUrl: string | null; videoType?: string; isHost?: boolean; hostOnly?: boolean; currentTime?: number; isPlaying?: boolean }) => {
      if (data.videoUrl) setVideoUrl(data.videoUrl);
      if (data.videoType) setVideoType(data.videoType as "embed" | "file");
      if (data.isHost) setIsHost(true);
      if (data.hostOnly !== undefined) setHostOnly(data.hostOnly);
      // Store state for player ready callback — no hardcoded timeouts
      if (data.videoUrl && data.currentTime != null && data.currentTime > 0) {
        pendingStateRef.current = { currentTime: data.currentTime, isPlaying: !!data.isPlaying };
      }
    });

    on("video-changed", (data: { videoUrl: string; videoType?: string }) => {
      setVideoUrl(data.videoUrl);
      if (data.videoType) setVideoType(data.videoType as "embed" | "file");
    });

    on("video-sync", (data: { action: string; time: number; userId: string }) => {
      setSyncAction({ action: data.action, time: data.time });
      setTimeout(() => setSyncAction(null), 300);
    });

    on("heartbeat", (data: { time: number; isPlaying: boolean; userId: string }) => {
      const sinceExternal = Date.now() - lastExternalChangeRef.current;
      if (sinceExternal < 1500) return;
      // Skip heartbeat correction for 2s after any user action
      const sinceUserAction = Date.now() - lastUserActionRef.current;
      if (sinceUserAction < 2000) return;

      if (videoType === "file") {
        videoPlayerRef.current?.smoothCorrect(data.time, data.isPlaying);
      } else {
        const localTime = videoPlayerRef.current?.getCurrentTime() || 0;
        const drift = Math.abs(data.time - localTime);
        if (drift > 2) {
          videoPlayerRef.current?.seek(data.time);
        }
        if (sinceExternal > 3000) {
          if (data.isPlaying && playerStateRef.current !== "playing") {
            videoPlayerRef.current?.play();
          } else if (!data.isPlaying && playerStateRef.current !== "paused") {
            videoPlayerRef.current?.pause();
          }
        }
      }
    });

    on("user-times", (data: { users: { time: number; isPlaying: boolean; username: string }[] }) => {
      setPeerTimes(data.users);
    });

    on("host-changed", (data: { isHost: boolean }) => {
      setIsHost(data.isHost);
    });

    on("host-only-changed", (data: { hostOnly: boolean }) => {
      setHostOnly(data.hostOnly);
    });

    on("new-message", (message: Message) => {
      setMessages((prev) => {
        const next = [...prev, message];
        return next.length > 200 ? next.slice(-200) : next;
      });
      if (!chatExpandedRef.current) {
        setUnreadCount((c) => {
          const next = c + 1;
          document.title = next > 0 ? `(${next}) Watch Together` : "Watch Together";
          return next;
        });
      }
    });

    on("queue-updated", (data: { action: string; item?: QueueItem; removedItem?: QueueItem }) => {
      if (data.action === "add" && data.item) {
        setQueue((prev) => [...prev, data.item!]);
      } else if (data.action === "next" && data.removedItem) {
        setQueue((prev) => prev.filter((item) => item.id !== data.removedItem!.id));
      }
    });

    on("reaction", (data: { emoji: string; userId: string }) => {
      const r = { id: Date.now() + Math.random(), emoji: data.emoji, x: Math.random() * 80 + 10, y: Math.random() * 80 + 10 };
      setReactions((prev) => [...prev, r]);
      setTimeout(() => setReactions((prev) => prev.filter((x) => x.id !== r.id)), 3000);
    });

    on("watch-time-update", (data: { watchTimes: { username: string; seconds: number }[] }) => {
      setWatchTimes(data.watchTimes);
    });

    on("ad-state-changed", (data: { isAd: boolean }) => {
      setAdPlaying(data.isAd);
    });

    on("room-closed", () => {
      alert("Комната закрыта администратором");
      navigate("/");
    });

    return () => {
      off("room-state");
      off("video-sync");
      off("video-changed");
      off("heartbeat");
      off("user-times");
      off("host-changed");
      off("host-only-changed");
      off("new-message");
      off("queue-updated");
      off("reaction");
      off("watch-time-update");
      off("ad-state-changed");
      off("room-closed");
      if (manualAdTimerRef.current) clearTimeout(manualAdTimerRef.current);
    };
  }, [socket]);

  // Auto-play next from queue when video ends (host only)
  useEffect(() => {
    if (playerState === "ended" && isHost && queue.length > 0) {
      const timer = setTimeout(() => {
        emitPlayNext();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [playerState, isHost, queue.length]);

  // Apply pending room state when player becomes ready (new user join)
  useEffect(() => {
    if (!playerReady) return;
    const pending = pendingStateRef.current;
    if (!pending) return;
    // Don't apply if user already started interacting
    const sinceUserAction = Date.now() - lastUserActionRef.current;
    if (sinceUserAction < 2000) { pendingStateRef.current = null; return; }
    pendingStateRef.current = null;

    videoPlayerRef.current?.seek(pending.currentTime);
    if (pending.isPlaying) {
      setTimeout(() => videoPlayerRef.current?.play(), 200);
    }
  }, [playerReady]);

  // Warn before leaving
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // Heartbeat: use refs to avoid recreating interval
  const adPlayingRef = useRef(adPlaying);
  adPlayingRef.current = adPlaying;

  useEffect(() => {
    if (!socket || !playerReady) return;
    const interval = isLandscape ? 5000 : 3000;
    let tick = 0;
    heartbeatIntervalRef.current = setInterval(() => {
      const time = videoPlayerRef.current?.getCurrentTime() || 0;
      if (!adPlayingRef.current) {
        socket.emit("heartbeat", code, time, playerStateRef.current === "playing");
      }
      socket.emit("user-time", code, time, playerStateRef.current === "playing", username);
      tick++;
      if (tick % 3 === 0) {
        socket.emit("get-watch-time", code);
      }
    }, interval);
    return () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
    };
  }, [socket, code, playerReady, username, isLandscape]);

  const handleLogin = (name: string) => {
    localStorage.setItem("wt_username", name);
    setUsername(name);
  };

  const handleUploadFile = async (file: File) => {
    if (file.size > 500 * 1024 * 1024) { alert("Файл слишком большой (макс. 500 МБ)"); return; }
    setUploading(true);
    setUploadProgress(0);
    setUploadSpeed(0);
    setUploadRemaining("");
    const startTime = Date.now();
    let lastLoaded = 0;
    let lastTime = startTime;

    try {
      const formData = new FormData();
      formData.append("video", file);

      const xhr = new XMLHttpRequest();
      xhrRef.current = xhr;

      const promise = new Promise<{ url: string; originalName: string }>((resolve, reject) => {
        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            const percent = Math.round((e.loaded / e.total) * 100);
            setUploadProgress(percent);

            const now = Date.now();
            const dt = (now - lastTime) / 1000;
            if (dt >= 0.5) {
              const bytesPerSec = (e.loaded - lastLoaded) / dt;
              const remainingBytes = e.total - e.loaded;
              const remainingSec = bytesPerSec > 0 ? remainingBytes / bytesPerSec : 0;

              setUploadSpeed(bytesPerSec);
              if (remainingSec > 60) {
                setUploadRemaining(`${Math.ceil(remainingSec / 60)} мин`);
              } else if (remainingSec > 0) {
                setUploadRemaining(`${Math.ceil(remainingSec)} сек`);
              } else {
                setUploadRemaining("");
              }

              lastLoaded = e.loaded;
              lastTime = now;
            }
          }
        });
        xhr.upload.addEventListener("load", () => {});
        xhr.addEventListener("load", () => {
          if (xhr.status === 200) resolve(JSON.parse(xhr.responseText));
          else reject(new Error("Upload failed"));
        });
        xhr.addEventListener("error", () => { reject(new Error("Upload error")); });
        xhr.addEventListener("abort", () => { reject(new Error("Upload cancelled")); });
      });

      const apiUrl = window.location.port === "5173"
        ? `http://${window.location.hostname}:3001`
        : "";
      xhr.open("POST", `${apiUrl}/api/upload`);
      xhr.send(formData);

      const result = await promise;
      const fullUrl = `${apiUrl}${result.url}`;
      emitQueueAdd(fullUrl, result.originalName || "Загруженное видео");
    } catch (err) {
      console.error("Upload failed:", err);
      alert("Ошибка загрузки файла");
    } finally {
      setUploading(false);
      setUploadProgress(0);
      setUploadSpeed(0);
      setUploadRemaining("");
      xhrRef.current = null;
    }
  };

  const cancelUpload = () => {
    xhrRef.current?.abort();
  };

  const formatSpeed = (bytesPerSec: number): string => {
    if (bytesPerSec > 1024 * 1024) return `${(bytesPerSec / 1024 / 1024).toFixed(1)} МБ/с`;
    if (bytesPerSec > 1024) return `${(bytesPerSec / 1024).toFixed(0)} КБ/с`;
    return `${bytesPerSec.toFixed(0)} Б/с`;
  };

  const handleReaction = (emoji: string) => {
    emitEmojiReaction(emoji);
    const r = { id: Date.now() + Math.random(), emoji, x: Math.random() * 80 + 10, y: Math.random() * 80 + 10 };
    setReactions((prev) => [...prev, r]);
    setTimeout(() => setReactions((prev) => prev.filter((x) => x.id !== r.id)), 3000);
  };

  const handleDownloadToServer = async (url: string) => {
    setDownloading(true);
    setDownloadProgress("0");
    try {
      const res = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (data.error) {
        alert(data.error);
        setDownloading(false);
        setDownloadProgress(null);
        return;
      }
      const hash = data.hash;
      const evtSource = new EventSource(`/api/download/progress/${hash}`);
      evtSource.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.progress) setDownloadProgress(msg.progress);
        if (msg.done) {
          evtSource.close();
          setDownloading(false);
          setDownloadProgress(null);
          emitChangeVideo(msg.url, "file");
        }
        if (msg.error) {
          evtSource.close();
          setDownloading(false);
          setDownloadProgress(null);
          alert(msg.error);
        }
      };
      evtSource.onerror = () => {
        evtSource.close();
        setDownloading(false);
        setDownloadProgress(null);
      };
    } catch (e) {
      setDownloading(false);
      setDownloadProgress(null);
      alert("Ошибка скачивания");
    }
  };

  const canControl = !hostOnly || isHost;

  const emitAndApply = useCallback((action: string, time: number, opts?: { apply?: boolean; cooldown?: boolean }) => {
    if (opts?.apply) {
      if (action === "play") videoPlayerRef.current?.play();
      else if (action === "pause") videoPlayerRef.current?.pause();
      else if (action === "seek") videoPlayerRef.current?.seek(time);
    }
    emitVideoAction(action, time);
    if (opts?.cooldown !== false) {
      lastSyncEventRef.current = Date.now();
      lastExternalChangeRef.current = Date.now();
      lastUserActionRef.current = Date.now();
      syncFromActionRef.current = true;
      setTimeout(() => { syncFromActionRef.current = false; }, 500);
    }
  }, [emitVideoAction]);

  const handlePlayPause = () => {
    if (!canControl) return;
    const action = playerState === "playing" ? "pause" : "play";
    const time = videoPlayerRef.current?.getCurrentTime() || 0;
    emitAndApply(action, time, { apply: true });
  };

  const handleSeek = (time: number) => {
    if (!canControl || adPlaying) return;
    const t = Math.max(0, time);
    emitAndApply("seek", t, { apply: true });
  };

  const handleSync = () => {
    const time = videoPlayerRef.current?.getCurrentTime() || 0;
    emitAndApply("seek", time, { apply: false });
    setSyncAction({ action: "seek", time });
    setTimeout(() => setSyncAction(null), 300);
  };

  const toggleHostOnly = () => {
    if (!isHost) return;
    const newVal = !hostOnly;
    setHostOnly(newVal);
    socket?.emit("set-host-only", code, newVal);
  };

  const handleExternalStateChange = (newState: "playing" | "paused") => {
    if (syncFromActionRef.current) return;
    const time = videoPlayerRef.current?.getCurrentTime() || 0;
    emitAndApply(newState === "playing" ? "play" : "pause", time, { cooldown: true });
  };

  const handleUserAction = (action: "play" | "pause" | "seek", time: number) => {
    if (!canControl || adPlaying) return;
    if (isUserActionRef.current) return;
    isUserActionRef.current = true;
    setTimeout(() => { isUserActionRef.current = false; }, 300);
    emitAndApply(action, time, { cooldown: true });
  };

  if (!username) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-4">
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-[-30%] left-[-20%] w-[60%] h-[60%] bg-blue-600/5 rounded-full blur-[120px]" />
        </div>
        <div className="bg-[#12121a] rounded-2xl p-6 w-full max-w-sm border border-white/5 shadow-2xl shadow-black/50 relative z-10">
          <h1 className="text-xl font-bold text-white mb-1 text-center">Войти в комнату</h1>
          <p className="text-gray-500 text-center mb-6 text-sm">
            Код: <span className="text-blue-400 font-mono font-bold">{code}</span>
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const target = e.target as HTMLFormElement;
              const input = target.elements.namedItem("username") as HTMLInputElement;
              if (input.value.trim()) handleLogin(input.value.trim());
            }}
          >
            <input
              name="username"
              type="text"
              placeholder="Ваше имя..."
              className="w-full bg-white/5 text-white rounded-xl px-4 py-3 mb-3 focus:outline-none focus:ring-1 focus:ring-blue-500/50 focus:bg-white/[0.07] placeholder:text-gray-600 transition-all"
              autoFocus
            />
            <button type="submit" className="w-full bg-gradient-to-r from-blue-600 to-blue-500 text-white py-3 rounded-xl font-semibold text-sm hover:from-blue-500 hover:to-blue-400 transition-all shadow-lg shadow-blue-500/20 active:scale-[0.98]">
              Войти
            </button>
          </form>
        </div>
      </div>
    );
  }

    return (
      <div className="min-h-screen bg-[#08080d] flex flex-col relative">
        {/* Subtle background gradients */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-[-20%] right-[-10%] w-[40%] h-[40%] bg-blue-600/3 rounded-full blur-[100px]" />
          <div className="absolute bottom-[-15%] left-[-5%] w-[30%] h-[30%] bg-purple-600/3 rounded-full blur-[80px]" />
        </div>

        {/* Header */}
        <header className={`${isMobile && isLandscape ? "hidden" : ""} h-[52px] border-b border-white/5 flex items-center px-4 shrink-0 bg-[#0a0a0f]/90 backdrop-blur-xl relative z-10`}>
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/")} className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white transition-all">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            </button>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/10">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
              </div>
              <h1 className="text-sm font-bold text-white/90 hidden sm:block">Watch Together</h1>
            </div>
          </div>
          <div className="flex items-center gap-2.5 text-xs ml-auto">
            <div className="flex items-center gap-1.5 bg-white/5 rounded-full px-3 py-1 border border-white/5">
              <span className="font-mono text-white/60 text-[11px]">{code}</span>
              <button onClick={() => { navigator.clipboard.writeText(code || ""); }} className="text-white/30 hover:text-white/60 transition-colors">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              </button>
            </div>
            <div className="flex items-center gap-1.5 bg-white/5 rounded-full px-2.5 py-1 border border-white/5">
              <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? "bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.4)]" : "bg-red-400"}`} />
              <span className="text-white/50 text-[11px]">{users}</span>
            </div>
            {isHost && <span className="text-[10px] bg-yellow-500/10 text-yellow-400/90 px-2 py-0.5 rounded-full border border-yellow-500/10 font-medium">Хост</span>}
            {hostOnly && <span className="text-[10px] bg-orange-500/10 text-orange-400/90 px-2 py-0.5 rounded-full border border-orange-500/10 font-medium">Ограничен</span>}
          </div>
        </header>

      {/* Desktop layout — flex: video (flex-1) + chat sidebar (w-80) */}
      {!isMobile && (
      <div ref={desktopContainerRef} className="flex flex-1 gap-0 min-h-0">
        {/* Video column — takes all available space */}
        <div className="flex-1 flex flex-col min-w-0 p-3 pr-1.5 gap-2">
          {/* Video player */}
          <div className="relative flex-1 min-h-0 bg-black rounded-xl overflow-hidden">
            <VideoPlayer
              ref={videoPlayerRef}
              videoUrl={videoUrl}
              videoType={videoType}
              onTimeUpdate={() => {}}
              onStateChange={(state) => setPlayerState(state)}
              onPlayerReady={() => setPlayerReady(true)}
              onAdStateChange={(isAd) => {
                if (manualAdRef.current) return;
                setAdPlaying(isAd);
                if (isAd) socket?.emit("ad-started", code);
                else socket?.emit("ad-ended", code);
              }}
              onExternalStateChange={handleExternalStateChange}
              onUserAction={handleUserAction}
              syncAction={syncAction}
            />
            {/* Emoji reactions */}
            {reactions.map((r) => (
              <div
                key={r.id}
                className="absolute text-4xl pointer-events-none"
                style={{ left: `${r.x}%`, top: `${r.y}%`, animation: "float-up 3s ease-out forwards" }}
              >
                {r.emoji}
              </div>
            ))}
            {/* Floating badges — top */}
            <div className="absolute top-2 left-2 right-2 flex items-start justify-between pointer-events-none">
              <div className="flex flex-col gap-1">
                {isHost && <span className="bg-yellow-500/15 text-yellow-400 text-[10px] font-medium px-2 py-0.5 rounded-full border border-yellow-500/10">Хост</span>}
                {hostOnly && <span className="bg-orange-500/15 text-orange-400 text-[10px] font-medium px-2 py-0.5 rounded-full border border-orange-500/10">Ограничен</span>}
              </div>
              <button onClick={toggleFullscreen} className="pointer-events-auto bg-white/10 backdrop-blur text-white/60 text-[11px] px-2.5 py-1 rounded-lg hover:text-white transition-colors">
                {isFullscreen ? "Выйти" : "Полный"}
              </button>
              {watchTimes.length > 0 && (
                <div className="bg-black/40 backdrop-blur rounded-full px-2 py-0.5 flex items-center gap-1">
                  {watchTimes.map((wt, i) => (
                    <span key={i} className="text-[10px] text-green-400/80 font-mono">{formatTime(wt.seconds)}</span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Controls bar */}
          {videoUrl && (
            <div className="bg-[#0e0e16] rounded-xl px-3 py-2 flex items-center gap-1.5 border border-white/5">
              {!playerReady ? (
                <span className="text-yellow-400/80 text-[11px] flex items-center gap-1.5">
                  <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                  Загрузка...
                </span>
              ) : !canControl ? (
                <span className="text-orange-400/60 text-[11px]">Только хост</span>
              ) : null}
              {adPlaying && (
                <span className="bg-red-500/15 text-red-400 text-[10px] px-2 py-0.5 rounded-full font-medium border border-red-500/10 animate-pulse">Реклама</span>
              )}
              <button onClick={handlePlayPause} disabled={!playerReady || !canControl || adPlaying} className="bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 disabled:from-white/10 disabled:to-white/10 text-white disabled:text-white/30 px-4 py-1.5 rounded-lg text-[13px] font-semibold transition-all active:scale-95 shadow-lg shadow-blue-500/10 disabled:shadow-none">
                {playerState === "playing" ? "Пауза" : "Играть"}
              </button>
              <div className="flex items-center gap-0.5">
                <button onClick={() => handleSeek(Math.max(0, (videoPlayerRef.current?.getCurrentTime() || 0) - 10))} disabled={!playerReady || !canControl || adPlaying} className="bg-white/5 hover:bg-white/10 disabled:opacity-30 text-white/50 w-8 h-8 rounded-lg flex items-center justify-center transition-all text-[11px] font-mono">-10</button>
                <button onClick={() => handleSeek((videoPlayerRef.current?.getCurrentTime() || 0) + 10)} disabled={!playerReady || !canControl || adPlaying} className="bg-white/5 hover:bg-white/10 disabled:opacity-30 text-white/50 w-8 h-8 rounded-lg flex items-center justify-center transition-all text-[11px] font-mono">+10</button>
              </div>
              <button onClick={handleSync} disabled={!playerReady || adPlaying} className="bg-white/5 hover:bg-white/10 disabled:opacity-30 text-white/30 px-2.5 py-1.5 rounded-lg text-[11px] transition-all" title="Синхронизировать всех">Синхр.</button>
              <button
                onClick={() => {
                  const newAd = !adPlaying;
                  setAdPlaying(newAd);
                  manualAdRef.current = true;
                  if (manualAdTimerRef.current) clearTimeout(manualAdTimerRef.current);
                  manualAdTimerRef.current = setTimeout(() => { manualAdRef.current = false; }, 30000);
                  const time = videoPlayerRef.current?.getCurrentTime() || 0;
                  const action = newAd ? "pause" : "play";
                  emitVideoSync(action, time);
                  if (newAd) socket?.emit("ad-started", code);
                  else socket?.emit("ad-ended", code);
                }}
                className={`text-[11px] px-2.5 py-1 rounded-lg font-medium transition-all ${adPlaying ? "bg-red-500/15 text-red-400 border border-red-500/10" : "bg-white/5 text-white/30 hover:bg-white/10 hover:text-white/50 border border-white/5"}`}
              >
                {adPlaying ? "Реклама" : "Реклама"}
              </button>
              <span className="text-[11px] text-white/25 ml-auto font-mono tabular-nums">{formatTime(videoPlayerRef.current?.getCurrentTime() || 0)}</span>
            </div>
          )}

          {/* Upload / URL input */}
          <div className="bg-[#0e0e16] rounded-xl p-2.5 border border-white/5">
            <div className="flex items-center gap-2">
              <label className="bg-white/5 hover:bg-white/10 text-white/50 text-[12px] rounded-lg px-3 py-2 cursor-pointer transition-all font-medium shrink-0 border border-white/5 flex items-center gap-1.5">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                Файл
                <input
                  type="file"
                  accept=".mp4,.webm,.mkv,.avi,.mov,.ogg,.ogv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleUploadFile(file);
                  }}
                />
              </label>
              {uploading && (
                <div className="flex-1 flex items-center gap-2">
                  <div className="flex-1">
                    <div className="bg-white/5 rounded-full h-1 overflow-hidden">
                      <div className="bg-gradient-to-r from-blue-500 to-blue-400 h-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                    </div>
                    <div className="flex items-center gap-2 text-[9px] text-white/25 mt-0.5">
                      <span>{uploadProgress}%</span>
                      {uploadSpeed > 0 && <span>{formatSpeed(uploadSpeed)}</span>}
                      {uploadRemaining && <span>{uploadRemaining}</span>}
                    </div>
                  </div>
                  <button onClick={cancelUpload} className="bg-red-500/10 hover:bg-red-500/20 text-red-400/60 text-[10px] w-6 h-6 rounded-lg flex items-center justify-center font-bold shrink-0 transition-all">✕</button>
                </div>
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const target = e.target as HTMLFormElement;
                  const urlInput = target.elements.namedItem("videoUrlD") as HTMLInputElement;
                  if (urlInput.value.trim()) {
                    emitChangeVideo(urlInput.value.trim(), /\.(mp4|webm|mkv|mov|avi|ogg|ogv)($|\?)/i.test(urlInput.value.trim()) ? "file" : "embed");
                    urlInput.value = "";
                  }
                }}
                className="flex-1 flex gap-1.5"
              >
                <input name="videoUrlD" type="text" placeholder="YouTube, RuTube или ссылка..." className="flex-1 bg-white/[0.03] text-white rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-blue-500/30 min-w-0 placeholder:text-white/20 border border-white/5 transition-all" />
                <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-2 rounded-lg text-[13px] shrink-0 font-medium transition-all active:scale-95 shadow-lg shadow-blue-500/10">▶</button>
              </form>
            </div>
            {videoUrl && (
              <div className="text-[10px] text-white/15 mt-1.5 truncate px-1 font-mono">{videoUrl}</div>
            )}
          </div>

          <Queue queue={queue} onAddVideo={emitQueueAdd} onNext={emitQueueNext} onDeleteItem={(id) => { socket?.emit("queue-remove", code, id); setQueue(prev => prev.filter(item => item.id !== id)); }} onDownloadToServer={handleDownloadToServer} downloading={downloading} downloadProgress={downloadProgress} />
        </div>

        {/* Chat sidebar */}
        <div className="w-[340px] flex flex-col border-l border-white/5 bg-[#0c0c14] relative z-10">
          {/* Sidebar header */}
          <div className="px-3 py-2.5 border-b border-white/5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                <span className="text-white/60 text-[11px] font-semibold uppercase tracking-wider">Чат и управление</span>
              </div>
              <button onClick={() => setShowCall(!showCall)} className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${showCall ? "bg-green-500/15 text-green-400" : "bg-white/5 text-white/30 hover:text-white/60"}`}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
              </button>
            </div>
          </div>

          <div className="flex-1 flex flex-col p-2.5 gap-2 min-h-0">
            {isHost && (
              <div className="bg-gradient-to-r from-yellow-500/5 to-transparent rounded-xl p-3 border border-yellow-500/10">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <div className="relative">
                    <input type="checkbox" checked={hostOnly} onChange={toggleHostOnly} className="peer sr-only" />
                    <div className="w-9 h-5 bg-white/10 rounded-full peer-checked:bg-blue-600 transition-colors" />
                    <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full peer-checked:translate-x-4 transition-transform shadow-sm" />
                  </div>
                  <span className="text-[12px] text-white/50">Только хост управляет видео</span>
                </label>
              </div>
            )}

            {/* Time sync */}
            <div className="bg-white/[0.02] rounded-xl p-3 border border-white/5">
              <h4 className="text-white/25 text-[10px] font-semibold uppercase tracking-widest mb-2">Синхронизация</h4>
              <div className="space-y-1.5">
                {peerTimes.map((peer, i) => {
                  const diff = Math.abs(peer.time - (videoPlayerRef.current?.getCurrentTime() || 0));
                  return (
                    <div key={i} className="flex items-center justify-between text-[11px]">
                      <div className="flex items-center gap-2">
                        <span className={`w-1 h-1 rounded-full ${diff > 1 ? "bg-red-400" : "bg-green-400"}`} />
                        <span className="text-white/50 truncate">{peer.username}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-white/20 text-[10px]">{peer.isPlaying ? "▶" : "⏸"}</span>
                        <span className="font-mono text-white/60">{formatTime(peer.time)}</span>
                      </div>
                    </div>
                  );
                })}
                {peerTimes.length === 0 && <p className="text-white/15 text-[11px]">Ожидание...</p>}
              </div>
            </div>

            {/* Watch time */}
            {watchTimes.length > 0 && (
              <div className="bg-white/[0.02] rounded-xl p-3 border border-white/5">
                <h4 className="text-white/25 text-[10px] font-semibold uppercase tracking-widest mb-2">Просмотрено</h4>
                <div className="space-y-1.5">
                  {watchTimes.map((wt, i) => (
                    <div key={i} className="flex items-center justify-between text-[11px]">
                      <span className="text-white/50 truncate">{wt.username}</span>
                      <span className="text-green-400/80 font-mono">{formatTime(wt.seconds)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Chat — fills remaining space */}
            <div className="flex-1 min-h-0">
              <Chat messages={messages} onSendMessage={(text, replyToId) => emitChatMessage(username, text, replyToId)} onReaction={handleReaction} username={username} />
            </div>
          </div>

          {/* Call widget */}
          {showCall && socket && (
            <div className="border-t border-white/5 p-2.5 bg-[#08080d]">
              <VideoCall socket={socket} roomCode={code || ""} username={username} />
            </div>
          )}
        </div>
      </div>
      )}

      {/* Mobile layout — full-screen video + chat overlay */}
      {isMobile && (
      <div ref={roomContainerRef} className="fixed inset-0 bg-[#0a0a0f] flex flex-col transition-all duration-300" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>

        {/* SINGLE VideoPlayer — always mounted, never remounts */}
        <div className={`${isLandscape ? "absolute inset-0 z-10" : "relative flex-1 min-h-0 bg-black"}`}>
          <VideoPlayer
            ref={videoPlayerRef}
            videoUrl={videoUrl}
            videoType={videoType}
            onTimeUpdate={() => {}}
            onStateChange={(state) => setPlayerState(state)}
            onPlayerReady={() => setPlayerReady(true)}
            onAdStateChange={(isAd) => {
              if (manualAdRef.current) return;
              setAdPlaying(isAd);
              if (isAd) socket?.emit("ad-started", code);
              else socket?.emit("ad-ended", code);
            }}
            onExternalStateChange={handleExternalStateChange}
            onUserAction={handleUserAction}
            syncAction={syncAction}
          />

          {/* Custom controls overlay for file videos — only chat button */}
          {videoType === "file" && videoUrl && !isLandscape && (
            <div className="absolute inset-0 z-20">
              {/* Tap to play/pause */}
              <div className="absolute inset-0 pointer-events-auto" onClick={() => handlePlayPause()} />

              {/* Chat button — top right */}
              <div className="absolute top-3 right-3 pointer-events-auto">
                <button onClick={(e) => { e.stopPropagation(); setChatExpanded(!chatExpanded); }} className="relative w-10 h-10 rounded-full bg-black/40 backdrop-blur flex items-center justify-center text-white/70 hover:text-white">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                  {unreadCount > 0 && !chatExpanded && <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] w-3.5 h-3.5 rounded-full flex items-center justify-center font-bold">{unreadCount > 9 ? "9+" : unreadCount}</span>}
                </button>
              </div>
            </div>
          )}

        </div>

        {/* Reactions — always on top of everything */}
        {reactions.map((r) => (
          <div key={r.id} className="absolute text-3xl pointer-events-none z-40" style={{ left: `${r.x}%`, top: `${r.y}%`, animation: "float-up 3s ease-out forwards" }}>
            {r.emoji}
          </div>
        ))}

        {/* Floating chat messages in landscape — bottom right */}
        {isLandscape && floatingMessages.map((fm) => (
          <div key={fm.id} className="absolute bottom-16 right-3 z-40 pointer-events-none max-w-[60%] animate-[slideUp_0.3s_ease-out]" style={{ animation: "float-up 5s ease-out forwards" }}>
            <div className="bg-black/60 backdrop-blur rounded-lg px-3 py-1.5 border border-white/5">
              <span className="text-white/40 text-[9px] block">{fm.author}</span>
              <span className="text-white/80 text-[11px]">{fm.text}</span>
            </div>
          </div>
        ))}

        {/* ============ LANDSCAPE OVERLAYS ============ */}
        {isLandscape && (
          <div className="absolute inset-0 z-20 pointer-events-none" onTouchStart={resetLandscapeBars} onClick={() => { resetLandscapeBars(); }}>
            {/* Persistent exit button — always visible in landscape */}
            <button onClick={(e) => { e.stopPropagation(); setShowRotateHint(true); if (rotateHintTimerRef.current) clearTimeout(rotateHintTimerRef.current); rotateHintTimerRef.current = setTimeout(() => setShowRotateHint(false), 5000); }} className="pointer-events-auto absolute top-2 left-2 z-40 w-7 h-7 rounded-full bg-black/40 backdrop-blur flex items-center justify-center text-white/50 hover:text-white transition-all opacity-60 hover:opacity-100">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
            </button>
            {/* Top bar — hidden for file videos, only chat */}
            {videoType !== "file" && (
              <div className={`pointer-events-auto absolute top-0 left-0 right-0 bg-gradient-to-b from-black/30 via-black/15 to-transparent transition-opacity duration-500 ${landscapeBarsVisible ? "opacity-100" : "opacity-0"}`}>
                <div className="flex items-center justify-between px-3 py-2">
                  <button onClick={() => navigate("/")} className="text-white/60 text-xs flex items-center gap-1 hover:text-white transition-colors">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                    Назад
                  </button>
                  <div className="flex items-center gap-2">
                    <span className="text-white/40 text-[10px] font-mono bg-white/10 px-2 py-0.5 rounded-full">{code}</span>
                    {isHost && <span className="text-[10px] bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full font-medium">Хост</span>}
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setLandscapeChatOpen(!landscapeChatOpen)} className={`relative w-8 h-8 rounded-full flex items-center justify-center transition-all ${landscapeChatOpen ? "bg-blue-500/20 text-blue-400" : "bg-white/10 text-white/60 hover:text-white"}`}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                      {unreadCount > 0 && !landscapeChatOpen && <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[8px] w-3.5 h-3.5 rounded-full flex items-center justify-center font-bold">{unreadCount > 9 ? "9+" : unreadCount}</span>}
                    </button>
                    <button onClick={() => setMicMuted(!micMuted)} className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${micMuted ? "bg-red-500/20 text-red-400" : "bg-white/10 text-white/60 hover:text-white"}`}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    </button>
                    <button onClick={toggleFullscreen} className="w-8 h-8 rounded-full bg-white/10 text-white/60 flex items-center justify-center hover:text-white transition-all">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></svg>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* File videos: chat button top right (in portrait) */}
            {videoType === "file" && !isLandscape && (
              <div className="pointer-events-auto absolute top-3 right-3">
                <button onClick={() => setChatExpanded(!chatExpanded)} className="relative w-10 h-10 rounded-full bg-black/40 backdrop-blur flex items-center justify-center text-white/70 hover:text-white">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                  {unreadCount > 0 && !chatExpanded && <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] w-3.5 h-3.5 rounded-full flex items-center justify-center font-bold">{unreadCount > 9 ? "9+" : unreadCount}</span>}
                </button>
              </div>
            )}

            {/* File videos in landscape: chat button top right */}
            {videoType === "file" && isLandscape && (
              <div className={`pointer-events-auto absolute top-2 right-2 z-30 transition-opacity duration-500 ${landscapeBarsVisible ? "opacity-100" : "opacity-0"}`}>
                <button onClick={() => setLandscapeChatOpen(!landscapeChatOpen)} className={`relative w-9 h-9 rounded-full flex items-center justify-center transition-all ${landscapeChatOpen ? "bg-blue-500/20 text-blue-400" : "bg-black/40 backdrop-blur text-white/60 hover:text-white"}`}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                  {unreadCount > 0 && !landscapeChatOpen && <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[8px] w-3.5 h-3.5 rounded-full flex items-center justify-center font-bold">{unreadCount > 9 ? "9+" : unreadCount}</span>}
                </button>
              </div>
            )}

            {/* Bottom bar */}
            <div onClick={(e) => e.stopPropagation()} className={`pointer-events-auto absolute bottom-0 left-0 right-0 z-30 bg-gradient-to-t from-black/30 via-black/15 to-transparent transition-opacity duration-500 ${videoType === "file" || landscapeBarsVisible ? "opacity-100" : "opacity-0"}`}>
              <div className="flex items-center justify-between px-3 py-2">
                <div className="flex items-center gap-2">
                  {videoUrl && (
                    <>
                      <button onClick={handlePlayPause} disabled={!playerReady || !canControl || adPlaying} className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center text-white disabled:opacity-30 hover:bg-white/25 transition-all active:scale-90">
                        {playerState === "playing" ? (
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                        ) : (
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                        )}
                      </button>
                      <button onClick={() => handleSeek(Math.max(0, (videoPlayerRef.current?.getCurrentTime() || 0) - 10))} disabled={!playerReady || !canControl} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/70 disabled:opacity-30 hover:text-white transition-all">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                      </button>
                      <button onClick={() => handleSeek((videoPlayerRef.current?.getCurrentTime() || 0) + 10)} disabled={!playerReady || !canControl} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/70 disabled:opacity-30 hover:text-white transition-all">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                      </button>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {adPlaying && <span className="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full font-medium animate-pulse">Реклама</span>}
                  <span className="text-white/50 text-[11px] font-mono">{formatTime(videoPlayerRef.current?.getCurrentTime() || 0)}</span>
                  <button onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition-all">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
                  </button>
                </div>
              </div>
            </div>

            {/* Chat panel — slides from right */}
            {landscapeChatOpen && (
              <LandscapeChat
                messages={messages}
                username={username}
                onSendMessage={(text) => emitChatMessage(username, text)}
                onReaction={handleReaction}
                onClose={() => setLandscapeChatOpen(false)}
              />
            )}

            {/* Call widget — bottom left */}
            {showCall && socket && (
              <div className="pointer-events-auto absolute bottom-14 left-3 z-30 w-64 max-w-[60vw]">
                <VideoCall socket={socket} roomCode={code || ""} username={username} compact />
                <button onClick={() => setShowCall(false)} className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-[#0f0f18] border border-white/10 text-white/30 hover:text-white flex items-center justify-center transition-colors">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            )}

            {/* Emoji bar — collapsible, right side in landscape */}
            <div className="pointer-events-auto absolute bottom-16 right-3 z-30 flex flex-col items-end gap-1" onClick={(e) => e.stopPropagation()}>
              {landscapeEmojiOpen && (
                <div className="flex flex-col gap-1 bg-[#0f0f18]/90 backdrop-blur-lg rounded-2xl px-1.5 py-2 border border-white/5 animate-[slideUp_0.15s_ease-out]">
                  {EMOJI_REACTIONS.map((emoji) => (
                    <button key={emoji} onClick={() => { handleReaction(emoji); setLandscapeEmojiOpen(false); }} className="text-lg p-0.5 active:scale-125 transition-transform select-none">{emoji}</button>
                  ))}
                </div>
              )}
              <button onClick={() => setLandscapeEmojiOpen(!landscapeEmojiOpen)} className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${landscapeEmojiOpen ? "bg-blue-500/20 text-blue-400" : "bg-white/10 text-white/60 hover:text-white"}`}>
                <span className="text-lg">😊</span>
              </button>
            </div>
          </div>
        )}

        {/* ============ PORTRAIT OVERLAYS ============ */}
        {!isLandscape && (
          <>
            {/* Floating badges — top */}
            <div className="absolute top-2 left-2 right-2 flex items-start justify-between pointer-events-none z-10">
              <div className="flex flex-col gap-1">
                {isHost && <span className="bg-yellow-500/80 text-black text-[10px] font-bold px-2 py-0.5 rounded-full">👑 Хост</span>}
                {hostOnly && <span className="bg-orange-500/80 text-black text-[10px] font-bold px-2 py-0.5 rounded-full">🔒</span>}
              </div>
            </div>

            {/* Floating controls — bottom of video */}
            {videoUrl && (
              <div className="absolute bottom-0 left-0 right-0 z-30 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-3 pt-8 pointer-events-auto">
                {adPlaying && (
                  <div className="bg-red-500/90 text-white text-[10px] px-2.5 py-0.5 rounded-full font-medium animate-pulse mb-2 inline-block">Реклама</div>
                )}
                <div className="flex items-center gap-1.5">
                  {!playerReady ? (
                    <span className="text-yellow-400 text-[10px]">⏳</span>
                  ) : !canControl ? (
                    <span className="text-orange-400 text-[10px]">🔒</span>
                  ) : null}
                  <button onClick={handlePlayPause} disabled={!playerReady || !canControl || adPlaying} className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center text-white disabled:opacity-30 hover:bg-white/25 transition-all active:scale-90">
                    {playerState === "playing" ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                    )}
                  </button>
                  <button onClick={() => handleSeek(Math.max(0, (videoPlayerRef.current?.getCurrentTime() || 0) - 10))} disabled={!playerReady || !canControl} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/70 disabled:opacity-30 hover:text-white transition-all">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                  </button>
                  <button onClick={() => handleSeek((videoPlayerRef.current?.getCurrentTime() || 0) + 10)} disabled={!playerReady || !canControl} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/70 disabled:opacity-30 hover:text-white transition-all">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                  </button>
                  {videoType !== "file" && (
                    <button onClick={handleSync} disabled={!playerReady || adPlaying} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/50 disabled:opacity-30 hover:text-white transition-all">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                    </button>
                  )}
                  <span className="text-white/50 text-[11px] font-mono ml-auto">{formatTime(videoPlayerRef.current?.getCurrentTime() || 0)}</span>
                  {videoType !== "file" && (
                    <label className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/60 cursor-pointer hover:text-white transition-all">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                      <input type="file" accept=".mp4,.webm,.mkv,.avi,.mov,.ogg,.ogv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadFile(f); }} />
                    </label>
                  )}
                  {videoType !== "file" && (
                    <button onClick={() => setShowCall(!showCall)} className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${showCall ? "bg-green-500/20 text-green-400" : "bg-white/10 text-white/60 hover:text-white"}`}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                    </button>
                  )}
                  {videoType !== "file" && (
                    <button onClick={() => { const newAd = !adPlaying; setAdPlaying(newAd); manualAdRef.current = true; if (manualAdTimerRef.current) clearTimeout(manualAdTimerRef.current); manualAdTimerRef.current = setTimeout(() => { manualAdRef.current = false; }, 30000); const time = videoPlayerRef.current?.getCurrentTime() || 0; const action = newAd ? "pause" : "play"; emitVideoSync(action, time); if (newAd) socket?.emit("ad-started", code); else socket?.emit("ad-ended", code); }} className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${adPlaying ? "bg-red-500/20 text-red-400" : "bg-white/10 text-white/60 hover:text-white"}`}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></svg>
                    </button>
                  )}
                  <button onClick={toggleFullscreen} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition-all">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
                  </button>
                </div>
                {uploading && (
                  <div className="mt-1 flex items-center gap-2">
                    <div className="flex-1">
                      <div className="bg-white/20 rounded-full h-1 overflow-hidden">
                        <div className="bg-blue-400 h-full transition-all" style={{ width: `${uploadProgress}%` }} />
                      </div>
                      <div className="flex items-center gap-2 text-[9px] text-white/50 mt-0.5">
                        <span>{uploadProgress}%</span>
                        {uploadSpeed > 0 && <span>{formatSpeed(uploadSpeed)}</span>}
                        {uploadRemaining && <span>ост. {uploadRemaining}</span>}
                      </div>
                    </div>
                    <button onClick={cancelUpload} className="bg-red-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0">✕</button>
                  </div>
                )}
              </div>
            )}

            {/* No video — show URL input */}
            {!videoUrl && (
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3 z-10">
                <form onSubmit={(e) => { e.preventDefault(); const target = e.target as HTMLFormElement; const urlInput = target.elements.namedItem("videoUrlM") as HTMLInputElement; if (urlInput.value.trim()) { emitChangeVideo(urlInput.value.trim(), /\.(mp4|webm|mkv|mov|avi|ogg|ogv)($|\?)/i.test(urlInput.value.trim()) ? "file" : "embed"); urlInput.value = ""; } }} className="flex gap-2">
                  <input name="videoUrlM" type="text" placeholder="Вставьте ссылку на видео..." className="flex-1 bg-white/10 backdrop-blur text-white rounded-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-white/50" />
                  <button type="submit" className="bg-blue-600 text-white px-4 py-2.5 rounded-full text-sm font-semibold shrink-0">▶</button>
                </form>
                <label className="block mt-2 bg-white/10 backdrop-blur text-white text-sm rounded-full px-4 py-2.5 text-center cursor-pointer">
                  📁 Загрузить файл
                  <input type="file" accept=".mp4,.webm,.mkv,.avi,.mov,.ogg,.ogv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadFile(f); }} />
                </label>
              </div>
            )}
          </>
        )}

        {/* Rotate phone hint */}
        {showRotateHint && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]" onClick={() => setShowRotateHint(false)}>
            <div className="flex flex-col items-center gap-4 max-w-[280px] px-6">
              {isLandscape ? (
                <>
                  <div className="w-16 h-28 border-2 border-white/40 rounded-xl relative rotate-90" style={{ animation: "phoneRotate 2s ease-in-out infinite" }}>
                    <div className="absolute top-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-white/30 rounded-full" />
                    <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-white/30 rounded-full" />
                  </div>
                  <span className="text-white/90 text-sm font-semibold">Как выйти из полноэкранного режима?</span>
                  <div className="text-white/50 text-xs leading-relaxed text-center space-y-2">
                    <p>Поверните телефон <b className="text-white/70">вертикально</b></p>
                    <p>или нажмите кнопку <b className="text-white/70">↩</b> в левом верхнем углу</p>
                  </div>
                </>
              ) : (
                <>
                  <div className="w-16 h-28 border-2 border-white/40 rounded-xl relative" style={{ transformOrigin: "center center", animation: "phoneRotate 2s ease-in-out infinite" }}>
                    <div className="absolute top-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-white/30 rounded-full" />
                    <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-white/30 rounded-full" />
                  </div>
                  <span className="text-white/90 text-sm font-semibold">Как включить полноэкранный режим?</span>
                  <div className="text-white/50 text-xs leading-relaxed text-center space-y-2">
                    <p>1. Поверните телефон <b className="text-white/70">горизонтально</b></p>
                    <p>2. В Safari нажмите <b className="text-white/70">иконку «АА»</b> в адресной строке</p>
                    <p>3. Выберите <b className="text-white/70">«Скрыть строку состояния»</b></p>
                  </div>
                </>
              )}
              <span className="text-white/30 text-[10px] mt-2">Нажмите чтобы закрыть</span>
            </div>
          </div>
        )}

        {/* VideoCall — when shown */}
        {showCall && socket && (
          <div className="absolute top-2 left-2 right-2 z-30">
            <VideoCall socket={socket} roomCode={code || ""} username={username} />
          </div>
        )}

        {/* Chat overlay — floating button / expanded */}
        {!isLandscape && (
          <>
            {/* Floating chat button */}
            {!chatExpanded && (
              <button
                onClick={() => setChatExpanded(true)}
                className="absolute bottom-20 right-3 z-30 w-9 h-9 rounded-full bg-white/10 backdrop-blur text-white/40 flex items-center justify-center active:scale-90 transition-all hover:bg-white/15 hover:text-white/60"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] w-4 h-4 rounded-full flex items-center justify-center font-bold">{unreadCount > 9 ? "9+" : unreadCount}</span>
                )}
              </button>
            )}
            {/* Expanded chat — full overlay */}
            {chatExpanded && (
              <div className="absolute inset-0 z-30 flex flex-col bg-[#0a0a0f]/40 backdrop-blur-xl pt-12 pb-20">
              {/* Close button */}
              <div className="flex items-center justify-between px-3 pt-2 pb-1 shrink-0">
                <span className="text-gray-400 text-xs font-semibold">💬 Чат</span>
                <button
                  onClick={() => setChatExpanded(false)}
                  className="w-7 h-7 rounded-full bg-gray-800 text-gray-400 hover:text-white flex items-center justify-center text-sm"
                >
                  ✕
                </button>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-3 pb-2 min-h-0">
                {messages.length === 0 && (
                  <p className="text-gray-600 text-xs text-center mt-8">Пока нет сообщений</p>
                )}
                {messages.map((msg) => {
                  const replyMsg = msg.replyToId ? messages.find((m) => m.id === msg.replyToId) : null;
                  return (
                    <div key={msg.id} className={`flex flex-col ${msg.author === username ? "items-end" : "items-start"} mb-1.5`}>
                      <span className="text-[10px] text-gray-500 mb-0.5">{msg.author}</span>
                      {msg.text.startsWith("[sticker]") && msg.text.endsWith("[/sticker]") ? (
                        <div className="relative">
                          {replyMsg && (
                            <div className="text-[9px] mb-0.5 px-2 py-0.5 rounded bg-gray-700/50 border-l-2 border-gray-500">
                              <span className="font-semibold">{replyMsg.author}</span>
                              <span className="opacity-70 ml-1">{replyMsg.text.replace(/\[sticker\].*?\[\/sticker\]/, "🖼 стикер").substring(0, 30)}</span>
                            </div>
                          )}
                          <video
                            src={msg.text.replace("[sticker]", "").replace("[/sticker]", "")}
                            className="w-32 h-32 object-contain"
                            autoPlay
                            loop
                            muted
                            playsInline
                          />
                        </div>
                      ) : (
                        <div className="relative group">
                          {replyMsg && (
                            <div className="text-[9px] mb-0.5 px-2 py-0.5 rounded bg-gray-700/50 border-l-2 border-gray-500">
                              <span className="font-semibold">{replyMsg.author}</span>
                              <span className="opacity-70 ml-1">{replyMsg.text.replace(/\[sticker\].*?\[\/sticker\]/, "🖼 стикер").substring(0, 30)}</span>
                            </div>
                          )}
                          <div
                            className={`px-3 py-1.5 rounded-2xl max-w-[80%] text-sm ${
                              msg.author === username
                                ? "bg-blue-600 text-white rounded-br-sm"
                                : "bg-gray-700 text-white rounded-bl-sm"
                            }`}
                            onClick={() => {
                              if (replyToMobile?.id === msg.id) setReplyToMobile(null);
                              else setReplyToMobile(msg);
                            }}
                          >
                            {msg.text}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Emoji quick bar */}
              <div className="flex gap-0.5 px-2 py-1 justify-center flex-wrap border-t border-gray-800 shrink-0">
                {EMOJI_REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => handleReaction(emoji)}
                    className="text-lg p-0.5 active:scale-125 transition-transform select-none"
                    style={{ WebkitTapHighlightColor: "transparent" }}
                  >
                    {emoji}
                  </button>
                ))}
              </div>

              {/* Host toggle — only in expanded chat */}
              {isHost && (
                <label className="flex items-center gap-2 px-4 py-1.5 border-t border-gray-800 cursor-pointer shrink-0">
                  <input type="checkbox" checked={hostOnly} onChange={toggleHostOnly} className="w-3.5 h-3.5 rounded bg-gray-700 border-gray-600 text-blue-600 focus:ring-blue-500" />
                  <span className="text-xs text-gray-400">Только хост управляет видео</span>
                </label>
              )}

              {/* Sticker panel */}
              {showStickersMobile && (
                <StickerPanel
                  onSendSticker={(url) => {
                    emitChatMessage(username, `[sticker]${url}[/sticker]`, replyToMobile?.id);
                    setShowStickersMobile(false);
                    setReplyToMobile(null);
                  }}
                  onClose={() => setShowStickersMobile(false)}
                />
              )}

              {/* Reply indicator */}
              {replyToMobile && (
                <div className="flex items-center gap-2 px-3 py-1 bg-gray-800 text-xs shrink-0">
                  <span className="text-blue-400">↩ {replyToMobile.author}</span>
                  <span className="text-gray-400 truncate flex-1">{replyToMobile.text.replace(/\[sticker\].*?\[\/sticker\]/, "🖼 стикер").substring(0, 40)}</span>
                  <button onClick={() => setReplyToMobile(null)} className="text-gray-500 hover:text-white">✕</button>
                </div>
              )}

              {/* Input */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const target = e.target as HTMLFormElement;
                  const input = target.elements.namedItem("chatInput") as HTMLInputElement;
                  if (input.value.trim()) {
                    emitChatMessage(username, input.value.trim(), replyToMobile?.id);
                    input.value = "";
                    setReplyToMobile(null);
                  }
                }}
                className="flex gap-1 px-3 pb-3 pt-1 shrink-0"
              >
                <button
                  type="button"
                  onClick={() => setShowStickersMobile(!showStickersMobile)}
                  className={`text-xl px-2 rounded-lg shrink-0 transition-colors ${
                    showStickersMobile ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"
                  }`}
                >
                  🎨
                </button>
                <input
                  name="chatInput"
                  type="text"
                  placeholder="Сообщение..."
                  className="flex-1 bg-gray-800 text-white rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-0"
                />
                <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-full text-sm font-semibold shrink-0">→</button>
              </form>
            </div>
            )}
          </>
        )}
      </div>
      )}

      <style>{`
        @keyframes fadeIn {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
        @keyframes phoneRotate {
          0%, 100% { transform: rotate(0deg); }
          50% { transform: rotate(90deg); }
        }
        @keyframes float-up {
          0% { opacity:1; transform:translateY(0) scale(1); }
          100% { opacity:0; transform:translateY(-100px) scale(1.5); }
        }
        @keyframes floatMsg {
          0% { opacity: 0; transform: translateY(10px); }
          15% { opacity: 1; transform: translateY(0); }
          85% { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}


