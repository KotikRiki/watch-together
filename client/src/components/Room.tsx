import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useSocket } from "../hooks/useSocket";
import { useSafariTabHider, isStandalone, isIOSSafari, tryHideSafariBars } from "../hooks/useSafariTabHider";
import { useVoiceChat } from "../hooks/useVoiceChat";
import { useLogger } from "../hooks/useLogger";
import { useVideoPlayer } from "../hooks/useVideoPlayer";
import { useChat } from "../hooks/useChat";
import { VoiceJoinModal } from "./VoiceJoinModal";
import { DesktopLayout } from "./DesktopLayout";
import { MobileOverlay } from "./MobileOverlay";

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

export function Room() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const [username, setUsername] = useState<string | null>(() => localStorage.getItem("wt_username"));

  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [reactions, setReactions] = useState<{ id: number; emoji: string; x: number; y: number }[]>([]);
  const [floatingMessages, setFloatingMessages] = useState<{ id: number; text: string; author: string }[]>([]);
  const lastMsgCountRef = useRef(0);
  const [showCall, setShowCall] = useState(false);
  const [chatExpanded, setChatExpanded] = useState(false);
  const [showStickersMobile, setShowStickersMobile] = useState(false);
  const [replyToMobile, setReplyToMobile] = useState<Message | null>(null);
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
  const isPWA = isStandalone();
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const roomContainerRef = useRef<HTMLDivElement>(null);
  const desktopContainerRef = useRef<HTMLDivElement>(null);
  const [landscapeChatOpen, setLandscapeChatOpen] = useState(false);
  const [landscapeEmojiOpen, setLandscapeEmojiOpen] = useState(false);
  const [landscapeBarsVisible, setLandscapeBarsVisible] = useState(true);
  const landscapeBarsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chatExpandedRef = useRef(false);
  const [safeAreaTop, setSafeAreaTop] = useState(0);
  const [safeAreaBottom, setSafeAreaBottom] = useState(0);

  useEffect(() => {
    chatExpandedRef.current = chatExpanded;
  }, [chatExpanded]);

  // Measure safe area insets (works in PWA standalone mode)
  useEffect(() => {
    const update = () => {
      const top = parseInt(getComputedStyle(document.documentElement).getPropertyValue("env(safe-area-inset-top)") || "0", 10) || 0;
      const bottom = parseInt(getComputedStyle(document.documentElement).getPropertyValue("env(safe-area-inset-bottom)") || "0", 10) || 0;
      // Fallback: use visualViewport offset if env() returns 0
      if (top === 0 && window.visualViewport) {
        setSafeAreaTop(Math.max(0, window.visualViewport.offsetTop));
      } else {
        setSafeAreaTop(top);
      }
      setSafeAreaBottom(bottom);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    document.title = "Watch Together";
    return () => { document.title = "Watch Together"; };
  }, []);

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

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  useSafariTabHider(isMobile);

  const toggleFullscreen = useCallback(async () => {
    if (isMobile) {
      if (isLandscape) {
        try { await document.exitFullscreen(); } catch {}
        if (isIOSSafari() && !isPWA) tryHideSafariBars();
        return;
      }
      try {
        await document.documentElement.requestFullscreen();
        return;
      } catch {}
      setShowRotateHint(true);
      if (rotateHintTimerRef.current) clearTimeout(rotateHintTimerRef.current);
      rotateHintTimerRef.current = setTimeout(() => setShowRotateHint(false), 4500);
      return;
    }
    const container = desktopContainerRef.current;
    if (!container) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await container.requestFullscreen();
      }
    } catch {}
  }, [isMobile, isLandscape, isPWA]);

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

  const videoPlayer = useVideoPlayer({
    socket,
    roomCode: code || "",
    username: username || "",
    isLandscape,
    emitVideoAction,
    emitVideoSync,
    emitPlayNext,
    on,
    off,
  });

  const chat = useChat({
    socket,
    roomCode: code || "",
    username: username || "",
    on,
    off,
  });

  const apiUrl = window.location.port === "5173"
    ? `http://${window.location.hostname}:3001`
    : "";

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadSpeed, setUploadSpeed] = useState(0);
  const [uploadRemaining, setUploadRemaining] = useState("");
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  const handleUploadFile = (file: File) => {
    if (file.size > 500 * 1024 * 1024) { alert("Файл слишком большой (макс. 500 МБ)"); return; }
    setUploading(true);
    setUploadProgress(0);
    setUploadSpeed(0);
    setUploadRemaining("");
    let lastLoaded = 0;
    let lastTime = Date.now();
    const formData = new FormData();
    formData.append("video", file);
    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        setUploadProgress(pct);
        const now = Date.now();
        const dt = (now - lastTime) / 1000;
        if (dt >= 0.5) {
          const bytesPerSec = (e.loaded - lastLoaded) / dt;
          const remainingBytes = e.total - e.loaded;
          const remainingSec = bytesPerSec > 0 ? remainingBytes / bytesPerSec : 0;
          setUploadSpeed(bytesPerSec);
          setUploadRemaining(remainingSec > 60 ? `${Math.ceil(remainingSec / 60)} мин` : remainingSec > 0 ? `${Math.ceil(remainingSec)} сек` : "");
          lastLoaded = e.loaded;
          lastTime = now;
        }
      }
    });
    xhr.addEventListener("load", () => {
      if (xhr.status === 200) {
        const result = JSON.parse(xhr.responseText);
        emitQueueAdd(`${apiUrl}${result.url}`, result.originalName || file.name);
      } else {
        try { alert(JSON.parse(xhr.responseText).error || "Ошибка загрузки"); } catch { alert("Ошибка загрузки"); }
      }
      setUploading(false); setUploadProgress(0); setUploadSpeed(0); setUploadRemaining(""); xhrRef.current = null;
    });
    xhr.addEventListener("error", () => { alert("Ошибка сети при загрузке"); setUploading(false); setUploadProgress(0); xhrRef.current = null; });
    xhr.addEventListener("abort", () => { setUploading(false); setUploadProgress(0); xhrRef.current = null; });
    xhr.open("POST", `${apiUrl}/api/upload`);
    xhr.send(formData);
  };

  const cancelUpload = () => { xhrRef.current?.abort(); };

  const {
    joinVoice,
    toggleMute,
    isMuted: voiceMuted,
    isConnected: voiceConnected,
    speakingUsers,
    voiceUserCount,
    localVolume,
    webRtcSupported,
    telegramDetected,
  } = useVoiceChat({ socket, roomCode: code || "", username: username || "" });

  const { logEvent, logVoiceEvent, logChatEvent } = useLogger();

  useEffect(() => {
    if (username && socket && isConnected) {
      joinRoom(username);
      logEvent(code || "", username, socket.id || "", "page-load", { url: window.location.href });
    }
  }, [username, socket, isConnected]);

  // Fetch chat history on join
  useEffect(() => {
    if (!code) return;
    fetch(`${apiUrl}/api/rooms/${code}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.messages) chat.handleChatHistory(data.messages);
      })
      .catch(() => {});
  }, [code]);

  useEffect(() => {
    if (!socket) return;

    on("new-message", (message: Message) => {
      chat.addMessage(message);
      if (!chatExpandedRef.current) {
        setUnreadCount((c) => {
          const next = c + 1;
          document.title = next > 0 ? `(${next}) Watch Together` : "Watch Together";
          return next;
        });
      }
    });

    on("queue-updated", (data: { action: string; item?: QueueItem; removedItem?: QueueItem; removedItemId?: string }) => {
      if (data.action === "add" && data.item) {
        setQueue((prev) => [...prev, data.item!]);
      } else if (data.action === "next" && data.removedItem) {
        setQueue((prev) => prev.filter((item) => item.id !== data.removedItem!.id));
      } else if (data.action === "remove" && data.removedItemId) {
        setQueue((prev) => prev.filter((item) => item.id !== data.removedItemId));
      }
    });

    on("reaction", (data: { emoji: string; userId: string }) => {
      const r = { id: Date.now() + Math.random(), emoji: data.emoji, x: Math.random() * 80 + 10, y: Math.random() * 80 + 10 };
      setReactions((prev) => [...prev, r]);
      setTimeout(() => setReactions((prev) => prev.filter((x) => x.id !== r.id)), 3000);
    });

    on("room-closed", () => {
      alert("Комната закрыта администратором");
      navigate("/");
    });

    return () => {
      off("new-message");
      off("queue-updated");
      off("reaction");
      off("room-closed");
    };
  }, [socket]);

  useEffect(() => {
    if (chatExpanded) {
      chat.messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      setUnreadCount(0);
      if (document.title.startsWith("(")) document.title = document.title.replace(/^\(\d+\)\s*/, "");
    }
    if (isLandscape && !chatExpanded && chat.messages.length > lastMsgCountRef.current && chat.messages.length > 0) {
      const lastMsg = chat.messages[chat.messages.length - 1];
      if (lastMsg.author !== username && !lastMsg.text.startsWith("[sticker]")) {
        const fm = { id: Date.now(), text: lastMsg.text, author: lastMsg.author };
        setFloatingMessages(prev => [...prev.slice(-4), fm]);
        setTimeout(() => setFloatingMessages(prev => prev.filter(m => m.id !== fm.id)), 5000);
      }
    }
    lastMsgCountRef.current = chat.messages.length;
  }, [chat.messages, chatExpanded, isLandscape, username]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // Keyboard hotkeys (desktop only)
  useEffect(() => {
    if (isMobile) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.code) {
        case "Space":
          e.preventDefault();
          videoPlayer.handlePlayPause();
          break;
        case "ArrowLeft":
          e.preventDefault();
          videoPlayer.handleSeek(Math.max(0, (videoPlayer.videoPlayerRef.current?.getCurrentTime?.() || 0) - 10));
          break;
        case "ArrowRight":
          e.preventDefault();
          videoPlayer.handleSeek((videoPlayer.videoPlayerRef.current?.getCurrentTime?.() || 0) + 10);
          break;
        case "KeyF":
          e.preventDefault();
          toggleFullscreen();
          break;
        case "KeyM":
          e.preventDefault();
          toggleMute();
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isMobile, videoPlayer.handlePlayPause, videoPlayer.handleSeek, videoPlayer.videoPlayerRef, toggleFullscreen, toggleMute]);

  const handleLogin = (name: string) => {
    localStorage.setItem("wt_username", name);
    setUsername(name);
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

  const canControl = videoPlayer.canControl;

  return (
    <div className="min-h-screen bg-[#08080d] flex flex-col relative">
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
            <button
              onClick={() => {
                navigator.clipboard.writeText(code || "");
                const el = document.getElementById("copy-btn-feedback");
                if (el) { el.textContent = "✓"; setTimeout(() => { el.textContent = "⧉"; }, 1500); }
              }}
              className="text-white/30 hover:text-white/60 transition-colors"
            >
              <span id="copy-btn-feedback">⧉</span>
            </button>
          </div>
          <div className="flex items-center gap-1.5 bg-white/5 rounded-full px-2.5 py-1 border border-white/5">
            <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? "bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.4)]" : "bg-red-400"}`} />
            <span className="text-white/50 text-[11px]">{users}</span>
          </div>
          {videoPlayer.isHost && <span className="text-[10px] bg-yellow-500/10 text-yellow-400/90 px-2 py-0.5 rounded-full border border-yellow-500/10 font-medium">Хост</span>}
          {videoPlayer.hostOnly && <span className="text-[10px] bg-orange-500/10 text-orange-400/90 px-2 py-0.5 rounded-full border border-orange-500/10 font-medium">Ограничен</span>}
        </div>
      </header>

      {/* Desktop layout */}
      {!isMobile && (
        <div ref={desktopContainerRef} className="flex flex-1 gap-0 min-h-0">
          <DesktopLayout
            videoPlayerRef={videoPlayer.videoPlayerRef}
            videoUrl={videoPlayer.videoUrl}
            videoType={videoPlayer.videoType}
            playerState={videoPlayer.playerState}
            playerReady={videoPlayer.playerReady}
            canControl={canControl}
            adPlaying={videoPlayer.adPlaying}
            isHost={videoPlayer.isHost}
            hostOnly={videoPlayer.hostOnly}
            isFullscreen={isFullscreen}
            peerTimes={videoPlayer.peerTimes}
            watchTimes={videoPlayer.watchTimes}
            syncAction={videoPlayer.syncAction}
            handlePlayPause={videoPlayer.handlePlayPause}
            handleSeek={videoPlayer.handleSeek}
            handleSeekRelative={videoPlayer.handleSeekRelative}
            handleSync={videoPlayer.handleSync}
            handleAdStateChange={videoPlayer.handleAdStateChange}
            handleExternalStateChange={videoPlayer.handleExternalStateChange}
            handleUserAction={videoPlayer.handleUserAction}
            setPlayerState={videoPlayer.setPlayerState}
            setPlayerReady={videoPlayer.setPlayerReady}
            toggleManualAd={videoPlayer.toggleManualAd}
            toggleHostOnly={videoPlayer.toggleHostOnly}
            reactions={reactions}
            queue={queue}
            socket={socket}
            code={code || ""}
            username={username || ""}
            emitQueueAdd={emitQueueAdd}
            emitQueueNext={emitQueueNext}
            handleDownloadToServer={handleDownloadToServer}
            downloading={downloading}
            downloadProgress={downloadProgress}
            voiceConnected={voiceConnected}
            voiceMuted={voiceMuted}
            speakingUsers={speakingUsers}
            localVolume={localVolume}
            toggleMute={toggleMute}
            setShowVoiceModal={setShowVoiceModal}
            showCall={showCall}
            setShowCall={setShowCall}
            uploading={uploading}
            uploadProgress={uploadProgress}
            uploadSpeed={uploadSpeed}
            uploadRemaining={uploadRemaining}
            cancelUpload={cancelUpload}
            handleUploadFile={handleUploadFile}
            emitChangeVideo={emitChangeVideo}
            emitChatMessage={emitChatMessage}
            handleReaction={handleReaction}
            chat={chat}
            logChatEvent={logChatEvent}
            toggleFullscreen={toggleFullscreen}
            apiUrl={apiUrl}
            displayTime={videoPlayer.displayTime}
          />
        </div>
      )}

      {/* Mobile layout */}
      {isMobile && (
        <div ref={roomContainerRef} className="fixed inset-0 bg-[#0a0a0f] flex flex-col transition-all duration-300" style={{ paddingTop: safeAreaTop || undefined, paddingBottom: safeAreaBottom || undefined }}>
          <MobileOverlay
            isLandscape={isLandscape}
            isFullscreen={isFullscreen}
            videoPlayerRef={videoPlayer.videoPlayerRef}
            videoUrl={videoPlayer.videoUrl}
            videoType={videoPlayer.videoType}
            playerState={videoPlayer.playerState}
            playerReady={videoPlayer.playerReady}
            canControl={canControl}
            adPlaying={videoPlayer.adPlaying}
            isHost={videoPlayer.isHost}
            hostOnly={videoPlayer.hostOnly}
            syncAction={videoPlayer.syncAction}
            handlePlayPause={videoPlayer.handlePlayPause}
            handleSeek={videoPlayer.handleSeek}
            handleSeekRelative={videoPlayer.handleSeekRelative}
            handleSync={videoPlayer.handleSync}
            handleAdStateChange={videoPlayer.handleAdStateChange}
            handleExternalStateChange={videoPlayer.handleExternalStateChange}
            handleUserAction={videoPlayer.handleUserAction}
            setPlayerState={videoPlayer.setPlayerState}
            setPlayerReady={videoPlayer.setPlayerReady}
            toggleManualAd={videoPlayer.toggleManualAd}
            toggleHostOnly={videoPlayer.toggleHostOnly}
            displayTime={videoPlayer.displayTime}
            reactions={reactions}
            floatingMessages={floatingMessages}
            voiceConnected={voiceConnected}
            voiceMuted={voiceMuted}
            speakingUsers={speakingUsers}
            localVolume={localVolume}
            toggleMute={toggleMute}
            setShowVoiceModal={setShowVoiceModal}
            showCall={showCall}
            setShowCall={setShowCall}
            uploading={uploading}
            uploadProgress={uploadProgress}
            uploadSpeed={uploadSpeed}
            uploadRemaining={uploadRemaining}
            cancelUpload={cancelUpload}
            handleUploadFile={handleUploadFile}
            emitChangeVideo={emitChangeVideo}
            emitChatMessage={emitChatMessage}
            handleReaction={handleReaction}
            toggleFullscreen={toggleFullscreen}
            navigate={navigate}
            code={code || ""}
            username={username || ""}
            chat={chat}
            unreadCount={unreadCount}
            chatExpanded={chatExpanded}
            setChatExpanded={setChatExpanded}
            landscapeChatOpen={landscapeChatOpen}
            setLandscapeChatOpen={setLandscapeChatOpen}
            landscapeEmojiOpen={landscapeEmojiOpen}
            setLandscapeEmojiOpen={setLandscapeEmojiOpen}
            landscapeBarsVisible={landscapeBarsVisible}
            resetLandscapeBars={resetLandscapeBars}
            showRotateHint={showRotateHint}
            setShowRotateHint={setShowRotateHint}
            rotateHintTimerRef={rotateHintTimerRef}
            isPWA={isPWA}
            showStickersMobile={showStickersMobile}
            setShowStickersMobile={setShowStickersMobile}
            replyToMobile={replyToMobile}
            setReplyToMobile={setReplyToMobile}
          />
        </div>
      )}

      {/* Voice Chat Join Modal */}
      {showVoiceModal && (
        <VoiceJoinModal
          userCount={voiceUserCount}
          webRtcSupported={webRtcSupported}
          telegramDetected={telegramDetected}
          onJoin={async () => { await joinVoice(); logVoiceEvent(code || "", username || "", socket?.id || "", "connect"); setShowVoiceModal(false); }}
          onDismiss={() => setShowVoiceModal(false)}
        />
      )}

    </div>
  );
}
