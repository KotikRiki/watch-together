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

export function Room() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const [username, setUsername] = useState<string | null>(() => localStorage.getItem("wt_username"));
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoType, setVideoType] = useState<"embed" | "file">("embed");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [reactions, setReactions] = useState<{ id: number; emoji: string; x: number; y: number }[]>([]);
  const [syncAction, setSyncAction] = useState<{ action: string; time: number } | null>(null);
  const [showCall, setShowCall] = useState(false);
  const [playerState, setPlayerState] = useState<"playing" | "paused" | "ended">("paused");
  const [isHost, setIsHost] = useState(false);
  const [hostOnly, setHostOnly] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const [showChat, setShowChat] = useState(true);
  const [peerTimes, setPeerTimes] = useState<{ time: number; isPlaying: boolean; username: string }[]>([]);
  const videoPlayerRef = useRef<VideoPlayerHandle>(null);
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
      // Ignore if this is from ourselves
      if (data.userId === socket?.id) return;
      // Cooldown: ignore sync events within 2s after our own sync
      const now = Date.now();
      if (now - lastSyncEventRef.current < 2000) return;

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
    };
  }, [socket]);

  // Heartbeat: send current time every 5 seconds
  useEffect(() => {
    if (!socket || !playerReady) return;

    heartbeatIntervalRef.current = setInterval(() => {
      const time = videoPlayerRef.current?.getCurrentTime() || 0;
      socket.emit("heartbeat", code, time, playerState === "playing");
      socket.emit("user-time", code, time, playerState === "playing", username);
    }, 3000);

    return () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
    };
  }, [socket, code, playerReady, playerState, username]);

  const handleLogin = (name: string) => {
    localStorage.setItem("wt_username", name);
    setUsername(name);
  };

  const handleUploadFile = async (file: File) => {
    setUploading(true);
    setUploadProgress(0);
    try {
      const formData = new FormData();
      formData.append("video", file);

      const xhr = new XMLHttpRequest();
      const promise = new Promise<{ url: string; originalName: string }>((resolve, reject) => {
        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            setUploadProgress(Math.round((e.loaded / e.total) * 100));
          }
        });
        xhr.addEventListener("load", () => {
          if (xhr.status === 200) resolve(JSON.parse(xhr.responseText));
          else reject(new Error("Upload failed"));
        });
        xhr.addEventListener("error", () => reject(new Error("Upload error")));
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
    }
  };

  const handleReaction = (emoji: string) => {
    emitEmojiReaction(emoji);
    const r = { id: Date.now() + Math.random(), emoji, x: Math.random() * 80 + 10, y: Math.random() * 80 + 10 };
    setReactions((prev) => [...prev, r]);
    setTimeout(() => setReactions((prev) => prev.filter((x) => x.id !== r.id)), 3000);
  };

  const canControl = !hostOnly || isHost;

  const handlePlayPause = () => {
    if (!canControl) return;
    const newAction = playerState === "playing" ? "pause" : "play";
    const time = videoPlayerRef.current?.getCurrentTime() || 0;
    emitVideoAction(newAction, time);
    lastSyncEventRef.current = Date.now();
    // Apply locally through syncAction for reliability
    setSyncAction({ action: newAction, time });
    setTimeout(() => setSyncAction(null), 300);
  };

  const handleSeek = (time: number) => {
    if (!canControl) return;
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

      <main className="max-w-7xl mx-auto p-3 sm:p-4">
        {/* Desktop layout */}
        <div className="hidden lg:grid lg:grid-cols-3 gap-4">
          <div className="col-span-2 space-y-4">
            <div className="relative">
              <VideoPlayer
                ref={videoPlayerRef}
                videoUrl={videoUrl}
                videoType={videoType}
                onTimeUpdate={() => {}}
                onStateChange={(state) => setPlayerState(state)}
                onPlayerReady={() => setPlayerReady(true)}
                syncAction={syncAction}
              />
              {reactions.map((r) => (
                <div
                  key={r.id}
                  className="absolute text-3xl sm:text-4xl pointer-events-none"
                  style={{ left: `${r.x}%`, top: `${r.y}%`, animation: "float-up 3s ease-out forwards" }}
                >
                  {r.emoji}
                </div>
              ))}
            </div>

            {videoUrl && (
              <div className="bg-gray-800/50 rounded-lg px-4 py-2 flex items-center gap-2 min-w-0">
                <span className="text-green-400 shrink-0">▶</span>
                <span className="text-gray-300 text-sm truncate">{videoUrl}</span>
              </div>
            )}

            {videoUrl && (
              <div className="bg-gray-800/50 rounded-lg px-4 py-2 flex items-center gap-2 flex-wrap">
                {!playerReady ? (
                  <span className="text-yellow-400 text-xs">⏳ Загрузка плеера...</span>
                ) : !canControl ? (
                  <span className="text-orange-400 text-xs">🔒 Только хост управляет видео</span>
                ) : null}
                <button onClick={handlePlayPause} disabled={!playerReady || !canControl} className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors">
                  {playerState === "playing" ? "⏸ Пауза" : "▶ Играть"}
                </button>
                <button onClick={() => handleSeek(Math.max(0, (videoPlayerRef.current?.getCurrentTime() || 0) - 10))} disabled={!playerReady || !canControl} className="bg-gray-700 hover:bg-gray-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded-lg text-sm transition-colors">⏪ -10с</button>
                <button onClick={() => handleSeek((videoPlayerRef.current?.getCurrentTime() || 0) + 10)} disabled={!playerReady || !canControl} className="bg-gray-700 hover:bg-gray-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded-lg text-sm transition-colors">⏩ +10с</button>
                <button onClick={handleSync} disabled={!playerReady} className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded-lg text-sm transition-colors" title="Синхронизировать всех участников">🔄 Синхр.</button>
                <span className="text-xs text-gray-400 ml-auto">{playerState === "playing" ? "▶ Воспроизведение" : "⏸ На паузе"}</span>
              </div>
            )}

            <div className="bg-gray-900 rounded-lg p-3 sm:p-4">
              <h3 className="text-white font-semibold mb-2 text-sm">Запустить видео</h3>
              <div className="space-y-2">
                <label className="block bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg px-4 py-3 text-center cursor-pointer transition-colors font-semibold">
                  📁 Загрузить файл с компьютера
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
                  <div>
                    <div className="bg-gray-800 rounded-full h-2 overflow-hidden">
                      <div className="bg-blue-500 h-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                    </div>
                    <span className="text-xs text-gray-400">{uploadProgress}%</span>
                  </div>
                )}
                <div className="text-center text-xs text-gray-500">или</div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const target = e.target as HTMLFormElement;
                    const urlInput = target.elements.namedItem("videoUrl") as HTMLInputElement;
                    if (urlInput.value.trim()) {
                      emitChangeVideo(urlInput.value.trim(), "embed");
                      urlInput.value = "";
                    }
                  }}
                  className="flex gap-2"
                >
                  <input name="videoUrl" type="text" placeholder="Ссылка на YouTube, RuTube, VK..." className="flex-1 bg-gray-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-0" />
                  <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 shrink-0">▶</button>
                </form>
              </div>
              {videoType === "file" && videoUrl && (
                <div className="mt-2 flex items-center gap-2 text-xs">
                  <span className="text-green-400">●</span>
                  <span className="text-gray-400">Файловое видео — нет рекламы</span>
                </div>
              )}
            </div>

            <Queue queue={queue} onAddVideo={emitQueueAdd} onNext={emitQueueNext} />
          </div>

          <div className="space-y-4">
            {isHost && (
              <div className="bg-gray-800/50 rounded-lg p-3">
                <h3 className="text-white font-semibold mb-2 text-sm">Управление комнатой</h3>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={hostOnly} onChange={toggleHostOnly} className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-blue-600 focus:ring-blue-500" />
                  <span className="text-sm text-gray-300">Только хост управляет видео</span>
                </label>
              </div>
            )}

            {/* Time display */}
            <div className="bg-gray-800/50 rounded-lg p-3">
              <h3 className="text-white font-semibold mb-2 text-sm">⏱ Время пользователей</h3>
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
                        {diff > 1 && <span className="text-red-400">⚠</span>}
                      </div>
                    </div>
                  );
                })}
                {peerTimes.length === 0 && <p className="text-gray-600 text-xs">Ожидание...</p>}
              </div>
            </div>

            <div className="h-64 sm:h-80 lg:h-96">
              <Chat messages={messages} onSendMessage={(text) => emitChatMessage(username, text)} onReaction={handleReaction} username={username} />
            </div>

            <button onClick={() => setShowCall(!showCall)} className="w-full bg-gray-800 text-white py-3 rounded-xl font-semibold hover:bg-gray-700 transition-colors border border-gray-700 text-sm">
              {showCall ? "Скрыть видеозвонок" : "Видеозвонок"}
            </button>

            {showCall && socket && <VideoCall socket={socket} roomCode={code || ""} username={username} />}
          </div>
        </div>

        {/* Mobile layout */}
        <div className="lg:hidden space-y-3">
          <div className="relative">
            <VideoPlayer
              ref={videoPlayerRef}
              videoUrl={videoUrl}
              videoType={videoType}
              onTimeUpdate={() => {}}
              onStateChange={(state) => setPlayerState(state)}
              onPlayerReady={() => setPlayerReady(true)}
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
          </div>

          {videoUrl && (
            <div className="bg-gray-800/50 rounded-lg px-3 py-2 flex items-center gap-2">
              {!playerReady ? (
                <span className="text-yellow-400 text-xs">⏳ Загрузка...</span>
              ) : !canControl ? (
                <span className="text-orange-400 text-xs">🔒</span>
              ) : null}
              <button onClick={handlePlayPause} disabled={!playerReady || !canControl} className="bg-blue-600 disabled:bg-gray-600 text-white px-3 py-1 rounded text-sm">
                {playerState === "playing" ? "⏸" : "▶"}
              </button>
              <button onClick={() => handleSeek(Math.max(0, (videoPlayerRef.current?.getCurrentTime() || 0) - 10))} disabled={!playerReady || !canControl} className="bg-gray-700 disabled:bg-gray-600 text-white px-2 py-1 rounded text-sm">⏪</button>
              <button onClick={() => handleSeek((videoPlayerRef.current?.getCurrentTime() || 0) + 10)} disabled={!playerReady || !canControl} className="bg-gray-700 disabled:bg-gray-600 text-white px-2 py-1 rounded text-sm">⏩</button>
              <button onClick={handleSync} disabled={!playerReady} className="bg-purple-600 disabled:bg-gray-600 text-white px-3 py-1 rounded text-sm">🔄</button>
              <span className="text-xs text-gray-400 ml-auto">{formatTime(videoPlayerRef.current?.getCurrentTime() || 0)}</span>
            </div>
          )}

          {/* Mobile time display */}
          <div className="bg-gray-800/50 rounded-lg px-3 py-2 flex items-center gap-3 text-xs">
            <span className="text-gray-400">⏱</span>
            {peerTimes.map((peer, i) => {
              const diff = Math.abs(peer.time - (videoPlayerRef.current?.getCurrentTime() || 0));
              return (
                <span key={i} className={diff > 1 ? "text-red-400" : "text-green-400"}>
                  {peer.username}: {formatTime(peer.time)}
                </span>
              );
            })}
            {peerTimes.length === 0 && <span className="text-gray-600">Ожидание...</span>}
          </div>

          {/* Mobile video URL input */}
          <div className="bg-gray-900 rounded-lg p-3 space-y-2">
            <label className="block bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg px-4 py-3 text-center cursor-pointer transition-colors font-semibold">
              📁 Загрузить файл
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
              <div>
                <div className="bg-gray-800 rounded-full h-2 overflow-hidden">
                  <div className="bg-blue-500 h-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                </div>
                <span className="text-xs text-gray-400">{uploadProgress}%</span>
              </div>
            )}
            <div className="text-center text-xs text-gray-500">или</div>
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
              <input name="videoUrlM" type="text" placeholder="Ссылка на YouTube, RuTube, VK..." className="flex-1 bg-gray-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-0" />
              <button type="submit" className="bg-blue-600 text-white px-3 py-2 rounded-lg text-sm shrink-0">▶</button>
            </form>
          </div>

          {/* Mobile chat toggle */}
          <button onClick={() => setShowChat(!showChat)} className="w-full bg-gray-800 text-white py-2 rounded-lg text-sm font-semibold border border-gray-700">
            {showChat ? "💬 Скрыть чат" : "💬 Показать чат"}
          </button>

          {showChat && (
            <div className="h-64">
              <Chat messages={messages} onSendMessage={(text) => emitChatMessage(username, text)} onReaction={handleReaction} username={username} />
            </div>
          )}

          {isHost && (
            <div className="bg-gray-800/50 rounded-lg p-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={hostOnly} onChange={toggleHostOnly} className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-blue-600 focus:ring-blue-500" />
                <span className="text-sm text-gray-300">Только хост управляет видео</span>
              </label>
            </div>
          )}

          <button onClick={() => setShowCall(!showCall)} className="w-full bg-gray-800 text-white py-3 rounded-xl font-semibold hover:bg-gray-700 transition-colors border border-gray-700 text-sm">
            {showCall ? "Скрыть видеозвонок" : "Видеозвонок"}
          </button>

          {showCall && socket && <VideoCall socket={socket} roomCode={code || ""} username={username} />}
        </div>
      </main>

      <style>{`@keyframes float-up { 0% { opacity:1; transform:translateY(0) scale(1); } 100% { opacity:0; transform:translateY(-100px) scale(1.5); } }`}</style>
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
  }, []);

  const getMedia = async (): Promise<MediaStream | null> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      return stream;
    } catch {
      setErrorMsg("Разрешите камеру и микрофон в настройках браузера");
      return null;
    }
  };

  const startCall = async () => {
    setCallState("calling");
    setErrorMsg("Запрашиваю камеру...");
    const stream = await getMedia();
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

  useEffect(() => {
    if (!socket) return;

    const handleCallMade = async (offer: RTCSessionDescriptionInit) => {
      setCallState("ringing");
      setErrorMsg("Входящий звонок...");
      const stream = await getMedia();
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
      <h3 className="text-white font-semibold mb-2 text-sm">Видеозвонок</h3>
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
      {errorMsg && <p className="text-yellow-400 text-xs mb-2">{errorMsg}</p>}
      {stateLabel && <p className={`text-xs mb-2 ${stateColor}`}>{stateLabel}</p>}
      {callState === "idle" ? (
        <button onClick={startCall} className="w-full bg-green-600 text-white py-2.5 rounded-lg text-sm font-semibold active:bg-green-700">
          Позвонить
        </button>
      ) : (
        <button onClick={() => { cleanup(); socket.emit("end-call", roomCode); }} className="w-full bg-red-600 text-white py-2.5 rounded-lg text-sm font-semibold active:bg-red-700">
          Завершить
        </button>
      )}
    </div>
  );
}
