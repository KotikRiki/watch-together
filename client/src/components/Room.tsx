import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useSocket } from "../hooks/useSocket";
import { VideoPlayer } from "./VideoPlayer";
import type { VideoPlayerHandle } from "./VideoPlayer";
import { Chat } from "./Chat";
import { Queue } from "./Queue";

interface Message {
  id: string;
  author: string;
  text: string;
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
  const [syncAction, setSyncAction] = useState<{ action: string; time: number } | null>(null);
  const [showCall, setShowCall] = useState(false);
  const [chatExpanded, setChatExpanded] = useState(false);
  const [adPlaying, setAdPlaying] = useState(false);

  useEffect(() => {
    if (chatExpanded) messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, chatExpanded]);
  const [playerState, setPlayerState] = useState<"playing" | "paused" | "ended">("paused");
  const [isHost, setIsHost] = useState(false);
  const [hostOnly, setHostOnly] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const [peerTimes, setPeerTimes] = useState<{ time: number; isPlaying: boolean; username: string }[]>([]);
  const [watchTimes, setWatchTimes] = useState<{ username: string; seconds: number }[]>([]);
  const videoPlayerRef = useRef<VideoPlayerHandle>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastSyncEventRef = useRef(0);
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const {
    socket,
    isConnected,
    users,
    joinRoom,
    emitVideoAction,
    emitChangeVideo,
    emitChatMessage,
    emitEmojiReaction,
    emitQueueAdd,
    emitQueueNext,
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

    on("room-state", (data: { videoUrl: string | null; videoType?: string; isHost?: boolean; hostOnly?: boolean }) => {
      if (data.videoUrl) setVideoUrl(data.videoUrl);
      if (data.videoType) setVideoType(data.videoType as "embed" | "file");
      if (data.isHost) setIsHost(true);
      if (data.hostOnly !== undefined) setHostOnly(data.hostOnly);
    });

    on("video-changed", (data: { videoUrl: string; videoType?: string }) => {
      setVideoUrl(data.videoUrl);
      if (data.videoType) setVideoType(data.videoType as "embed" | "file");
    });

    on("video-sync", (data: { action: string; time: number; userId: string }) => {
      if (data.userId === socket?.id) return;
      setSyncAction({ action: data.action, time: data.time });
      setTimeout(() => setSyncAction(null), 300);
    });

    on("heartbeat", (data: { time: number; isPlaying: boolean; userId: string }) => {
      if (data.userId === socket?.id) return;
      const localTime = videoPlayerRef.current?.getCurrentTime() || 0;
      const drift = Math.abs(data.time - localTime);
      if (drift > 0.5) {
        console.log(`Drift detected: ${drift.toFixed(2)}s, correcting...`);
        videoPlayerRef.current?.seek(data.time);
      }
      if (data.isPlaying && playerState !== "playing") {
        videoPlayerRef.current?.play();
      } else if (!data.isPlaying && playerState !== "paused") {
        videoPlayerRef.current?.pause();
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
      setMessages((prev) => [...prev, message]);
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
    };
  }, [socket]);

  // Heartbeat: send current time every 3 seconds + request watch time every 10s
  useEffect(() => {
    if (!socket || !playerReady) return;

    let tick = 0;
    heartbeatIntervalRef.current = setInterval(() => {
      const time = videoPlayerRef.current?.getCurrentTime() || 0;
      // Skip sync during ads — don't broadcast play/pause/seek
      if (!adPlaying) {
        socket.emit("heartbeat", code, time, playerState === "playing");
      }
      socket.emit("user-time", code, time, playerState === "playing", username);
      tick++;
      if (tick % 3 === 0) {
        socket.emit("get-watch-time", code);
      }
    }, 3000);

    return () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
    };
  }, [socket, code, playerReady, playerState, username, adPlaying]);

  const handleLogin = (name: string) => {
    localStorage.setItem("wt_username", name);
    setUsername(name);
  };

  const handleUploadFile = async (file: File) => {
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
      emitChangeVideo(fullUrl, "file");
    } catch (err) {
      console.error("Upload failed:", err);
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

  const canControl = !hostOnly || isHost;

  const handlePlayPause = () => {
    if (!canControl || adPlaying) return;
    const newAction = playerState === "playing" ? "pause" : "play";
    const time = videoPlayerRef.current?.getCurrentTime() || 0;
    emitVideoAction(newAction, time);
    lastSyncEventRef.current = Date.now();
    // Apply locally through syncAction for reliability
    setSyncAction({ action: newAction, time });
    setTimeout(() => setSyncAction(null), 300);
  };

  const handleSeek = (time: number) => {
    if (!canControl || adPlaying) return;
    emitVideoAction("seek", time);
    lastSyncEventRef.current = Date.now();
    setSyncAction({ action: "seek", time });
    setTimeout(() => setSyncAction(null), 300);
  };

  const handleSync = () => {
    const time = videoPlayerRef.current?.getCurrentTime() || 0;
    emitVideoAction("seek", time);
    lastSyncEventRef.current = Date.now();
    setSyncAction({ action: "seek", time });
    setTimeout(() => setSyncAction(null), 300);
  };

  const toggleHostOnly = () => {
    if (!isHost) return;
    const newVal = !hostOnly;
    setHostOnly(newVal);
    socket?.emit("set-host-only", code, newVal);
  };

  if (!username) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="bg-gray-900 rounded-2xl p-6 w-full max-w-md border border-gray-800">
          <h1 className="text-2xl font-bold text-white mb-2 text-center">Войти в комнату</h1>
          <p className="text-gray-400 text-center mb-6">
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
              className="w-full bg-gray-800 text-white rounded-xl px-4 py-3 mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
            <button type="submit" className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 transition-colors">
              Войти
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="bg-gray-900 border-b border-gray-800 p-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/")} className="text-gray-400 hover:text-white text-sm">← Назад</button>
            <h1 className="text-lg font-bold hidden sm:block">Watch Together</h1>
          </div>
          <div className="flex items-center gap-3 text-xs sm:text-sm text-gray-400">
            <span className="font-mono bg-gray-800 px-2 py-1 rounded">{code}</span>
            <span>{users} в комнате</span>
            {isHost && <span className="text-yellow-400">👑</span>}
            {hostOnly && <span className="text-orange-400">🔒</span>}
            <span className={isConnected ? "text-green-500" : "text-red-500"}>{isConnected ? "●" : "○"}</span>
          </div>
        </div>
      </header>

      {/* Desktop layout — flex: video (flex-1) + chat sidebar (w-80) */}
      <div className="hidden lg:flex lg:h-[calc(100vh-72px)] gap-0">
        {/* Video column — takes all available space */}
        <div className="flex-1 flex flex-col min-w-0 p-4 pr-2 gap-3">
          {/* Video player with sticker overlay */}
          <div className="relative flex-1 min-h-0 bg-black rounded-xl overflow-hidden">
            <VideoPlayer
              ref={videoPlayerRef}
              videoUrl={videoUrl}
              videoType={videoType}
              onTimeUpdate={() => {}}
              onStateChange={(state) => setPlayerState(state)}
              onPlayerReady={() => setPlayerReady(true)}
              onAdStateChange={(isAd) => {
                setAdPlaying(isAd);
                if (isAd) socket?.emit("ad-started", code);
                else socket?.emit("ad-ended", code);
              }}
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
            {/* Sticker chat messages — right edge overlay */}
            <div className="absolute right-3 top-3 bottom-3 w-72 flex flex-col justify-end gap-1.5 pointer-events-none overflow-hidden">
              {messages.slice(-5).map((msg, i) => (
                <div
                  key={msg.id || i}
                  className="bg-black/60 backdrop-blur-sm rounded-lg px-3 py-1.5 text-sm animate-[floatMsg_8s_ease-out_forwards]"
                  style={{ animationDelay: `${i * 0.1}s` }}
                >
                  <span className="text-blue-400 font-semibold">{msg.author}: </span>
                  <span className="text-white">{msg.text}</span>
                </div>
              ))}
            </div>
            {/* Floating badges — top */}
            <div className="absolute top-2 left-2 right-2 flex items-start justify-between pointer-events-none">
              <div className="flex flex-col gap-1">
                {isHost && <span className="bg-yellow-500/80 text-black text-[10px] font-bold px-2 py-0.5 rounded-full">👑 Хост</span>}
                {hostOnly && <span className="bg-orange-500/80 text-black text-[10px] font-bold px-2 py-0.5 rounded-full">🔒</span>}
              </div>
              {watchTimes.length > 0 && (
                <div className="bg-black/60 backdrop-blur rounded-full px-2 py-0.5 flex items-center gap-1">
                  <span className="text-[10px]">⏱</span>
                  {watchTimes.map((wt, i) => (
                    <span key={i} className="text-[10px] text-green-400 font-mono">{formatTime(wt.seconds)}</span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Controls bar — compact, under video */}
          {videoUrl && (
            <div className="bg-gray-800/50 rounded-lg px-4 py-2 flex items-center gap-2 flex-wrap">
              {!playerReady ? (
                <span className="text-yellow-400 text-xs">⏳ Загрузка плеера...</span>
              ) : !canControl ? (
                <span className="text-orange-400 text-xs">🔒 Только хост управляет видео</span>
              ) : null}
              {adPlaying && (
                <span className="bg-red-600 text-white text-xs px-2 py-0.5 rounded-full font-semibold animate-pulse">📺 Реклама</span>
              )}
              <button onClick={handlePlayPause} disabled={!playerReady || !canControl || adPlaying} className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors">
                {playerState === "playing" ? "⏸ Пауза" : "▶ Играть"}
              </button>
              <button onClick={() => handleSeek(Math.max(0, (videoPlayerRef.current?.getCurrentTime() || 0) - 10))} disabled={!playerReady || !canControl || adPlaying} className="bg-gray-700 hover:bg-gray-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded-lg text-sm transition-colors">⏪ -10с</button>
              <button onClick={() => handleSeek((videoPlayerRef.current?.getCurrentTime() || 0) + 10)} disabled={!playerReady || !canControl || adPlaying} className="bg-gray-700 hover:bg-gray-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded-lg text-sm transition-colors">⏩ +10с</button>
              <button onClick={handleSync} disabled={!playerReady || adPlaying} className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded-lg text-sm transition-colors" title="Синхронизировать всех участников">🔄 Синхр.</button>
              {isHost && (
                <button
                  onClick={() => {
                    const newAd = !adPlaying;
                    setAdPlaying(newAd);
                    if (newAd) socket?.emit("ad-started", code);
                    else socket?.emit("ad-ended", code);
                  }}
                  className={`text-xs px-2 py-1 rounded-lg font-semibold transition-colors ${adPlaying ? "bg-red-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}
                >
                  📺 {adPlaying ? "Реклама идёт" : "Реклама"}
                </button>
              )}
              <span className="text-xs text-gray-400 ml-auto">{formatTime(videoPlayerRef.current?.getCurrentTime() || 0)}</span>
            </div>
          )}

          {/* Upload / URL input */}
          <div className="bg-gray-900 rounded-lg p-3">
            <div className="flex items-center gap-3">
              <label className="bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg px-4 py-2 cursor-pointer transition-colors font-semibold shrink-0">
                📁 Файл
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
                    <div className="bg-gray-800 rounded-full h-2 overflow-hidden">
                      <div className="bg-blue-500 h-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-gray-400 mt-0.5">
                      <span>{uploadProgress}%</span>
                      {uploadSpeed > 0 && <span>{formatSpeed(uploadSpeed)}</span>}
                      {uploadRemaining && <span>ост. {uploadRemaining}</span>}
                    </div>
                  </div>
                  <button onClick={cancelUpload} className="bg-red-600 hover:bg-red-700 text-white text-xs px-2 py-1 rounded font-semibold shrink-0">✕</button>
                </div>
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const target = e.target as HTMLFormElement;
                  const urlInput = target.elements.namedItem("videoUrlD") as HTMLInputElement;
                  if (urlInput.value.trim()) {
                    emitChangeVideo(urlInput.value.trim(), "embed");
                    urlInput.value = "";
                  }
                }}
                className="flex-1 flex gap-2"
              >
                <input name="videoUrlD" type="text" placeholder="YouTube, RuTube, VK Video..." className="flex-1 bg-gray-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-0" />
                <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm shrink-0 font-semibold transition-colors">▶</button>
              </form>
            </div>
            {videoUrl && (
              <div className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                <span className="text-green-400">●</span>
                <span className="truncate">{videoUrl}</span>
              </div>
            )}
          </div>

          <Queue queue={queue} onAddVideo={emitQueueAdd} onNext={emitQueueNext} />
        </div>

        {/* Chat sidebar — fixed width, full height */}
        <div className="w-80 flex flex-col border-l border-gray-800 p-3 gap-3">
          {isHost && (
            <div className="bg-gray-800/50 rounded-lg p-2.5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={hostOnly} onChange={toggleHostOnly} className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-blue-600 focus:ring-blue-500" />
                <span className="text-sm text-gray-300">Только хост управляет видео</span>
              </label>
            </div>
          )}

          {/* Time display */}
          <div className="bg-gray-800/50 rounded-lg p-2.5">
            <div className="space-y-1">
              {peerTimes.map((peer, i) => {
                const diff = Math.abs(peer.time - (videoPlayerRef.current?.getCurrentTime() || 0));
                return (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-gray-300 truncate">{peer.username}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400">{peer.isPlaying ? "▶" : "⏸"}</span>
                      <span className={`font-mono ${diff > 1 ? "text-red-400" : "text-green-400"}`}>
                        {formatTime(peer.time)}
                      </span>
                    </div>
                  </div>
                );
              })}
              {peerTimes.length === 0 && <p className="text-gray-600 text-xs">Ожидание...</p>}
            </div>
          </div>

          {/* Watch time this session */}
          {watchTimes.length > 0 && (
            <div className="bg-gray-800/50 rounded-lg p-2.5">
              <h4 className="text-gray-400 text-[11px] font-semibold mb-1 uppercase tracking-wide">⏱ Просмотрено</h4>
              <div className="space-y-1">
                {watchTimes.map((wt, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-gray-300 truncate">{wt.username}</span>
                    <span className="text-green-400 font-mono">{formatTime(wt.seconds)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Chat — fills remaining space */}
          <div className="flex-1 min-h-0">
            <Chat messages={messages} onSendMessage={(text) => emitChatMessage(username, text)} onReaction={handleReaction} username={username} />
          </div>

          <button onClick={() => setShowCall(!showCall)} className="w-full bg-gray-800 text-white py-2 rounded-lg text-sm font-semibold hover:bg-gray-700 transition-colors border border-gray-700">
            {showCall ? "Скрыть видеозвонок" : "Видеозвонок"}
          </button>

          {showCall && socket && <VideoCall socket={socket} roomCode={code || ""} username={username} />}
        </div>
      </div>

      {/* Mobile layout — full-screen video + chat overlay */}
      <div className="lg:hidden fixed inset-0 bg-black flex flex-col" style={{ top: "52px" }}>
        {/* Video — full width, takes remaining space */}
        <div className="relative flex-1 min-h-0">
          <VideoPlayer
            ref={videoPlayerRef}
            videoUrl={videoUrl}
            videoType={videoType}
            onTimeUpdate={() => {}}
            onStateChange={(state) => setPlayerState(state)}
            onPlayerReady={() => setPlayerReady(true)}
            onAdStateChange={(isAd) => {
              setAdPlaying(isAd);
              if (isAd) socket?.emit("ad-started", code);
              else socket?.emit("ad-ended", code);
            }}
            syncAction={syncAction}
          />
          {reactions.map((r) => (
            <div
              key={r.id}
              className="absolute text-3xl pointer-events-none"
              style={{ left: `${r.x}%`, top: `${r.y}%`, animation: "float-up 3s ease-out forwards" }}
            >
              {r.emoji}
            </div>
          ))}

          {/* Floating badges — top */}
          <div className="absolute top-2 left-2 right-2 flex items-start justify-between pointer-events-none">
            <div className="flex flex-col gap-1">
              {isHost && <span className="bg-yellow-500/80 text-black text-[10px] font-bold px-2 py-0.5 rounded-full">👑 Хост</span>}
              {hostOnly && <span className="bg-orange-500/80 text-black text-[10px] font-bold px-2 py-0.5 rounded-full">🔒</span>}
            </div>
            {watchTimes.length > 0 && (
              <div className="bg-black/60 backdrop-blur rounded-full px-2 py-0.5 flex items-center gap-1">
                <span className="text-[10px]">⏱</span>
                {watchTimes.map((wt, i) => (
                  <span key={i} className="text-[10px] text-green-400 font-mono">{formatTime(wt.seconds)}</span>
                ))}
              </div>
            )}
          </div>

          {/* Floating controls — bottom of video */}
          {videoUrl && (
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2 pt-6">
              {adPlaying && (
                <div className="bg-red-600 text-white text-xs px-3 py-1 rounded-full font-semibold animate-pulse mb-1.5 inline-block">📺 Реклама — синхр.暂停</div>
              )}
              <div className="flex items-center gap-1.5">
                {!playerReady ? (
                  <span className="text-yellow-400 text-[10px]">⏳</span>
                ) : !canControl ? (
                  <span className="text-orange-400 text-[10px]">🔒</span>
                ) : null}
                <button onClick={handlePlayPause} disabled={!playerReady || !canControl} className="bg-white/20 backdrop-blur disabled:opacity-30 text-white w-8 h-8 rounded-full flex items-center justify-center text-sm">
                  {playerState === "playing" ? "⏸" : "▶"}
                </button>
                <button onClick={() => handleSeek(Math.max(0, (videoPlayerRef.current?.getCurrentTime() || 0) - 10))} disabled={!playerReady || !canControl} className="bg-white/20 backdrop-blur disabled:opacity-30 text-white w-8 h-8 rounded-full flex items-center justify-center text-sm">⏪</button>
                <button onClick={() => handleSeek((videoPlayerRef.current?.getCurrentTime() || 0) + 10)} disabled={!playerReady || !canControl} className="bg-white/20 backdrop-blur disabled:opacity-30 text-white w-8 h-8 rounded-full flex items-center justify-center text-sm">⏩</button>
                <button onClick={handleSync} disabled={!playerReady} className="bg-white/20 backdrop-blur disabled:opacity-30 text-white w-8 h-8 rounded-full flex items-center justify-center text-sm">🔄</button>
                <span className="text-white/70 text-[11px] font-mono ml-auto">{formatTime(videoPlayerRef.current?.getCurrentTime() || 0)}</span>
                <label className="bg-white/20 backdrop-blur text-white w-8 h-8 rounded-full flex items-center justify-center text-sm cursor-pointer">
                  📁
                  <input type="file" accept=".mp4,.webm,.mkv,.avi,.mov,.ogg,.ogv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadFile(f); }} />
                </label>
                <button onClick={() => setShowCall(!showCall)} className="bg-white/20 backdrop-blur text-white w-8 h-8 rounded-full flex items-center justify-center text-sm">
                  {showCall ? "📞" : "📹"}
                </button>
                {isHost && (
                  <button
                    onClick={() => {
                      const newAd = !adPlaying;
                      setAdPlaying(newAd);
                      if (newAd) socket?.emit("ad-started", code);
                      else socket?.emit("ad-ended", code);
                    }}
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${adPlaying ? "bg-red-600 text-white" : "bg-white/20 backdrop-blur text-white"}`}
                  >
                    📺
                  </button>
                )}
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
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const target = e.target as HTMLFormElement;
                  const urlInput = target.elements.namedItem("videoUrlM") as HTMLInputElement;
                  if (urlInput.value.trim()) {
                    emitChangeVideo(urlInput.value.trim(), "embed");
                    urlInput.value = "";
                  }
                }}
                className="flex gap-2"
              >
                <input name="videoUrlM" type="text" placeholder="Вставьте ссылку на видео..." className="flex-1 bg-white/10 backdrop-blur text-white rounded-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-white/50" />
                <button type="submit" className="bg-blue-600 text-white px-4 py-2.5 rounded-full text-sm font-semibold shrink-0">▶</button>
              </form>
              <label className="block mt-2 bg-white/10 backdrop-blur text-white text-sm rounded-full px-4 py-2.5 text-center cursor-pointer">
                📁 Загрузить файл
                <input type="file" accept=".mp4,.webm,.mkv,.avi,.mov,.ogg,.ogv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadFile(f); }} />
              </label>
            </div>
          )}
        </div>

        {/* VideoCall — when shown */}
        {showCall && socket && (
          <div className="absolute top-2 left-2 right-2 z-30">
            <VideoCall socket={socket} roomCode={code || ""} username={username} />
          </div>
        )}

        {/* Chat overlay — peek / expanded */}
        <div
          className={`absolute left-0 right-0 bottom-0 z-20 transition-all duration-300 ease-out ${
            chatExpanded ? "top-[15%]" : ""
          }`}
          style={{ touchAction: chatExpanded ? "none" : "auto" }}
        >
          {chatExpanded ? (
            /* Expanded chat — full overlay */
            <div className="h-full flex flex-col bg-gray-950/95 backdrop-blur-sm rounded-t-2xl overflow-hidden">
              {/* Drag handle */}
              <button
                onClick={() => setChatExpanded(false)}
                className="flex justify-center pt-2 pb-1 shrink-0"
              >
                <div className="w-10 h-1 bg-gray-600 rounded-full" />
              </button>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-3 pb-2 min-h-0">
                {messages.length === 0 && (
                  <p className="text-gray-600 text-xs text-center mt-8">Пока нет сообщений</p>
                )}
                {messages.map((msg) => (
                  <div key={msg.id} className={`flex flex-col ${msg.author === username ? "items-end" : "items-start"} mb-1.5`}>
                    <span className="text-[10px] text-gray-500 mb-0.5">{msg.author}</span>
                    <div className={`px-3 py-1.5 rounded-2xl max-w-[80%] text-sm ${
                      msg.author === username
                        ? "bg-blue-600 text-white rounded-br-sm"
                        : "bg-gray-700 text-white rounded-bl-sm"
                    }`}>
                      {msg.text}
                    </div>
                  </div>
                ))}
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

              {/* Input */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const target = e.target as HTMLFormElement;
                  const input = target.elements.namedItem("chatInput") as HTMLInputElement;
                  if (input.value.trim()) {
                    emitChatMessage(username, input.value.trim());
                    input.value = "";
                  }
                }}
                className="flex gap-2 px-3 pb-3 pt-1 shrink-0"
              >
                <input
                  name="chatInput"
                  type="text"
                  placeholder="Сообщение..."
                  className="flex-1 bg-gray-800 text-white rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-0"
                />
                <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-full text-sm font-semibold shrink-0">→</button>
              </form>
            </div>
          ) : (
            /* Peek — last 2 messages + tap to expand */
            <button
              onClick={() => setChatExpanded(true)}
              className="w-full text-left bg-black/70 backdrop-blur-sm px-3 py-2 rounded-t-xl border-t border-white/10"
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-white/60 text-xs">💬 Чат</span>
                {messages.length > 0 && (
                  <span className="bg-blue-600 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                    {messages.length}
                  </span>
                )}
                <span className="text-white/40 text-[10px] ml-auto">нажмите чтобы открыть</span>
              </div>
              {messages.slice(-2).map((msg, i) => (
                <div key={msg.id || i} className="text-white/80 text-xs truncate">
                  <span className="text-blue-400 font-medium">{msg.author}:</span> {msg.text}
                </div>
              ))}
              {messages.length === 0 && (
                <span className="text-white/30 text-xs">Напишите первое сообщение...</span>
              )}
            </button>
          )}
        </div>
      </div>

      <style>{`
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

// VideoCall component inline to avoid import issues
function VideoCall({ socket, roomCode, username }: { socket: any; roomCode: string; username: string }) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const [callState, setCallState] = useState<"idle" | "calling" | "ringing" | "connected">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [micEnabled, setMicEnabled] = useState(true);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const servers = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:19302" },
    ],
  };

  const cleanup = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCallState("idle");
    setErrorMsg("");
    setVideoEnabled(true);
    setMicEnabled(true);
  }, []);

  const getMedia = async (video = true): Promise<MediaStream | null> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video, audio: true });
      streamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      setVideoEnabled(video);
      setMicEnabled(true);
      return stream;
    } catch {
      setErrorMsg("Разрешите камеру и микрофон в настройках браузера");
      return null;
    }
  };

  const startCall = async (withVideo = true) => {
    setCallState("calling");
    setErrorMsg(withVideo ? "Запрашиваю камеру..." : "Запрашиваю микрофон...");
    const stream = await getMedia(withVideo);
    if (!stream) { setCallState("idle"); return; }

    const pc = new RTCPeerConnection(servers);
    pcRef.current = pc;
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));
    pc.onicecandidate = (e) => e.candidate && socket.emit("ice-candidate", roomCode, e.candidate);
    pc.ontrack = (e) => {
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = e.streams[0];
      setCallState("connected");
      setErrorMsg("");
    };
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === "failed" || state === "disconnected") {
        setErrorMsg("Соединение потеряно");
        cleanup();
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit("call-user", roomCode, offer, username);
    setCallState("calling");
    setErrorMsg("Ожидание ответа...");
  };

  const toggleVideo = () => {
    if (!streamRef.current) return;
    const videoTrack = streamRef.current.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      setVideoEnabled(videoTrack.enabled);
    }
  };

  const toggleMic = () => {
    if (!streamRef.current) return;
    const audioTrack = streamRef.current.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setMicEnabled(audioTrack.enabled);
    }
  };

  useEffect(() => {
    if (!socket) return;

    const handleCallMade = async (offer: RTCSessionDescriptionInit) => {
      setCallState("ringing");
      setErrorMsg("Входящий звонок...");
      const stream = await getMedia(videoEnabled);
      if (!stream) { setCallState("idle"); return; }

      const pc = new RTCPeerConnection(servers);
      pcRef.current = pc;
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      pc.onicecandidate = (e) => e.candidate && socket.emit("ice-candidate", roomCode, e.candidate);
      pc.ontrack = (e) => {
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = e.streams[0];
        setCallState("connected");
        setErrorMsg("");
      };
      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        if (state === "failed" || state === "disconnected") {
          setErrorMsg("Соединение потеряно");
          cleanup();
        }
      };
      await pc.setRemoteDescription(offer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("make-answer", roomCode, answer);
      setCallState("connected");
    };

    const handleAnswerMade = async (answer: RTCSessionDescriptionInit) => {
      if (pcRef.current) {
        await pcRef.current.setRemoteDescription(answer);
        setCallState("connected");
        setErrorMsg("");
      }
    };

    const handleIceCandidate = async (c: RTCIceCandidateInit) => {
      try { await pcRef.current?.addIceCandidate(c); } catch {}
    };

    socket.on("call-made", handleCallMade);
    socket.on("answer-made", handleAnswerMade);
    socket.on("ice-candidate", handleIceCandidate);
    socket.on("call-ended", () => { setErrorMsg("Звонок завершён"); cleanup(); });

    return () => {
      socket.off("call-made", handleCallMade);
      socket.off("answer-made", handleAnswerMade);
      socket.off("ice-candidate", handleIceCandidate);
      socket.off("call-ended");
    };
  }, [socket, roomCode]);

  useEffect(() => cleanup, []);

  const stateLabel = callState === "calling" ? "Вызывает..." : callState === "ringing" ? "Звонит..." : callState === "connected" ? "Подключено" : "";
  const stateColor = callState === "connected" ? "text-green-400" : "text-yellow-400";

  return (
    <div className="bg-gray-900 rounded-lg p-3">
      <h3 className="text-white font-semibold mb-2 text-sm">{videoEnabled ? "Видеозвонок" : "Аудиозвонок"}</h3>
      {videoEnabled ? (
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="aspect-video bg-gray-800 rounded-lg overflow-hidden relative">
            <video ref={localVideoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
            <span className="absolute bottom-1 left-1 text-xs text-gray-400 bg-black/50 px-1 rounded">Вы</span>
          </div>
          <div className="aspect-video bg-gray-800 rounded-lg overflow-hidden relative">
            <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
            <span className="absolute bottom-1 left-1 text-xs text-gray-400 bg-black/50 px-1 rounded">Собеседник</span>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center gap-4 mb-3 py-4">
          <div className="w-16 h-16 rounded-full bg-gray-700 flex items-center justify-center text-2xl">🎤</div>
          <div className="w-16 h-16 rounded-full bg-gray-700 flex items-center justify-center text-2xl">🔊</div>
        </div>
      )}
      {errorMsg && <p className="text-yellow-400 text-xs mb-2">{errorMsg}</p>}
      {stateLabel && <p className={`text-xs mb-2 ${stateColor}`}>{stateLabel}</p>}

      {callState === "idle" ? (
        <div className="flex gap-2">
          <button onClick={() => startCall(true)} className="flex-1 bg-green-600 text-white py-2.5 rounded-lg text-sm font-semibold active:bg-green-700">
            📹 Видеозвонок
          </button>
          <button onClick={() => startCall(false)} className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg text-sm font-semibold active:bg-blue-700">
            🎤 Аудиозвонок
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <button onClick={toggleVideo} className={`flex-1 py-2 rounded-lg text-sm font-semibold ${videoEnabled ? "bg-gray-700 text-white" : "bg-red-600 text-white"}`}>
            {videoEnabled ? "📹 Видео" : "📹 Без видео"}
          </button>
          <button onClick={toggleMic} className={`flex-1 py-2 rounded-lg text-sm font-semibold ${micEnabled ? "bg-gray-700 text-white" : "bg-red-600 text-white"}`}>
            {micEnabled ? "🎤 Микр." : "🎤 Мute"}
          </button>
          <button onClick={() => { cleanup(); socket.emit("end-call", roomCode); }} className="flex-1 bg-red-600 text-white py-2 rounded-lg text-sm font-semibold active:bg-red-700">
            ✖
          </button>
        </div>
      )}
    </div>
  );
}
