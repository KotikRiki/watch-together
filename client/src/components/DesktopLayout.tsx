import { VideoPlayer } from "./VideoPlayer";
import { VideoCall } from "./VideoCall";
import { Chat } from "./Chat";
import { Queue } from "./Queue";
import { VideoControls } from "./VideoControls";
import { VideoHistory } from "./VideoHistory";
import { formatTime } from "../utils";
import type { RefObject, Dispatch, SetStateAction } from "react";

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

interface PeerTime {
  username: string;
  time: number;
  isPlaying: boolean;
}

interface WatchTime {
  username: string;
  seconds: number;
}

interface DesktopLayoutProps {
  videoPlayerRef: RefObject<any>;
  videoUrl: string | null;
  videoType: "file" | "embed";
  playerState: string;
  playerReady: boolean;
  canControl: boolean;
  adPlaying: boolean;
  isHost: boolean;
  hostOnly: boolean;
  isFullscreen: boolean;
  peerTimes: PeerTime[];
  watchTimes: WatchTime[];
  syncAction: any;
  handlePlayPause: () => void;
  handleSeek: (time: number) => void;
  handleSync: () => void;
  handleAdStateChange: (playing: boolean) => void;
  handleExternalStateChange: (state: "playing" | "paused") => void;
  handleUserAction: (action: "play" | "pause" | "seek", time: number) => void;
  setPlayerState: Dispatch<SetStateAction<"ended" | "playing" | "paused">>;
  setPlayerReady: (ready: boolean) => void;
  toggleManualAd: () => void;
  toggleHostOnly: () => void;
  reactions: { id: number; emoji: string; x: number; y: number }[];
  queue: QueueItem[];
  socket: any;
  code: string;
  username: string | null;
  emitQueueAdd: (url: string) => void;
  emitQueueNext: () => void;
  handleDownloadToServer: (url: string) => void;
  downloading: boolean;
  downloadProgress: string | null;
  voiceConnected: boolean;
  voiceMuted: boolean;
  speakingUsers: Set<string>;
  localVolume: number;
  toggleMute: () => void;
  setShowVoiceModal: (show: boolean) => void;
  showCall: boolean;
  setShowCall: (show: boolean) => void;
  uploading: boolean;
  uploadProgress: number;
  uploadSpeed: number;
  uploadRemaining: string;
  cancelUpload: () => void;
  handleUploadFile: (file: File) => void;
  emitChangeVideo: (url: string, type: string) => void;
  emitChatMessage: (author: string, text: string, replyToId?: string) => void;
  handleReaction: (emoji: string) => void;
  chat: { messages: Message[]; messagesEndRef: React.RefObject<HTMLDivElement | null> };
  logChatEvent: (roomCode: string, username: string, socketId: string, action: string, data: any) => void;
  toggleFullscreen: () => void;
  apiUrl: string;
}

export function DesktopLayout(props: DesktopLayoutProps) {
  const {
    videoPlayerRef, videoUrl, videoType, playerState, playerReady, canControl, adPlaying,
    isHost, hostOnly, isFullscreen, peerTimes, watchTimes, syncAction,
    handlePlayPause, handleSeek, handleSync, handleAdStateChange, handleExternalStateChange,
    handleUserAction, setPlayerState, setPlayerReady, toggleManualAd, toggleHostOnly,
    reactions, queue, socket, code, username, emitQueueAdd, emitQueueNext,
    handleDownloadToServer, downloading, downloadProgress,
    voiceConnected, voiceMuted, speakingUsers, localVolume, toggleMute, setShowVoiceModal,
    showCall, setShowCall, uploading, uploadProgress, uploadSpeed, uploadRemaining,
    cancelUpload, handleUploadFile, emitChangeVideo, emitChatMessage, handleReaction,
    chat, logChatEvent, toggleFullscreen, apiUrl,
  } = props;

  const currentTime = videoPlayerRef.current?.getCurrentTime() || 0;

  return (
    <div className="flex flex-1 gap-0 min-h-0">
      <div className="flex-1 flex flex-col min-w-0 p-3 pr-1.5 gap-2">
        <div className="relative flex-1 min-h-0 bg-black rounded-xl overflow-hidden">
          <VideoPlayer
            ref={videoPlayerRef}
            videoUrl={videoUrl}
            videoType={videoType}
            onTimeUpdate={() => {}}
            onStateChange={(state) => setPlayerState(state)}
            onPlayerReady={() => setPlayerReady(true)}
            onAdStateChange={handleAdStateChange}
            onExternalStateChange={handleExternalStateChange}
            onUserAction={handleUserAction}
            syncAction={syncAction}
          />
          {reactions.map((r) => (
            <div key={r.id} className="absolute text-4xl pointer-events-none" style={{ left: `${r.x}%`, top: `${r.y}%`, animation: "float-up 3s ease-out forwards" }}>
              {r.emoji}
            </div>
          ))}
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

        {videoUrl && (
          <VideoControls
            variant="desktop"
            playerState={playerState}
            playerReady={playerReady}
            canControl={canControl}
            adPlaying={adPlaying}
            videoUrl={videoUrl}
            videoType={videoType}
            onPlayPause={handlePlayPause}
            onSeek={handleSeek}
            onSync={handleSync}
            onToggleAd={toggleManualAd}
            onToggleFullscreen={toggleFullscreen}
            isFullscreen={isFullscreen}
            currentTime={currentTime}
            voiceConnected={voiceConnected}
            voiceMuted={voiceMuted}
            speakingUsers={speakingUsers}
            onVoiceToggle={toggleMute}
            onShowVoiceModal={() => setShowVoiceModal(true)}
            showCall={showCall}
            onToggleCall={() => setShowCall(!showCall)}
            uploading={uploading}
            uploadProgress={uploadProgress}
            uploadSpeed={uploadSpeed}
            uploadRemaining={uploadRemaining}
            onCancelUpload={cancelUpload}
            onUploadFile={handleUploadFile}
          />
        )}

        <div className="bg-[#0e0e16] rounded-xl p-2.5 border border-white/5">
          <div className="flex items-center gap-2">
            <label className="bg-white/5 hover:bg-white/10 text-white/50 text-[12px] rounded-lg px-3 py-2 cursor-pointer transition-all font-medium shrink-0 border border-white/5 flex items-center gap-1.5">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              {uploading ? "..." : "Файл"}
              <input type="file" accept=".mp4,.webm,.mkv,.avi,.mov,.ogg,.ogv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadFile(f); }} />
            </label>
            {uploading && (
              <div className="flex-1 flex items-center gap-2">
                <div className="flex-1">
                  <div className="bg-white/5 rounded-full h-1 overflow-hidden">
                    <div className="bg-gradient-to-r from-blue-500 to-blue-400 h-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                  </div>
                  <div className="flex items-center gap-2 text-[9px] text-white/25 mt-0.5">
                    <span>{uploadProgress}%</span>
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

        <Queue queue={queue} onAddVideo={emitQueueAdd} onNext={emitQueueNext} onDeleteItem={(id) => { socket?.emit("queue-remove", code, id); }} onDownloadToServer={handleDownloadToServer} downloading={downloading} downloadProgress={downloadProgress} />

        <VideoHistory code={code} apiUrl={apiUrl} />
      </div>

      <div className="w-[340px] flex flex-col border-l border-white/5 bg-[#0c0c14] relative z-10">
        <div className="px-3 py-2.5 border-b border-white/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
              <span className="text-white/60 text-[11px] font-semibold uppercase tracking-wider">Чат и управление</span>
            </div>
            <button onClick={() => setShowCall(!showCall)} className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${showCall ? "bg-green-500/15 text-green-400" : "bg-white/5 text-white/30 hover:text-white/60"}`}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
            </button>
            <button onClick={() => voiceConnected ? toggleMute() : setShowVoiceModal(true)} className={`flex items-center gap-1 w-7 h-7 rounded-lg pl-1 pr-1.5 transition-all relative ${!voiceConnected ? "bg-white/5 text-white/30 hover:text-white/60" : voiceMuted ? "bg-red-500/15 text-red-400" : "bg-green-500/15 text-green-400"}`}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
              {voiceConnected && !voiceMuted && (
                <div className="flex items-end gap-[1px] h-3">
                  {[0.25, 0.5, 0.75, 1].map((threshold, i) => {
                    const vol = localVolume / 128;
                    const active = vol > threshold * 0.5;
                    return (
                      <div key={i} className={`w-[2px] rounded-full transition-all duration-100 ${active ? "bg-green-400" : "bg-white/10"}`} style={{ height: `${25 + i * 25}%` }} />
                    );
                  })}
                </div>
              )}
              {voiceConnected && speakingUsers.size > 0 && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-400 rounded-full animate-pulse" />}
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

          <div className="bg-white/[0.02] rounded-xl p-3 border border-white/5">
            <h4 className="text-white/25 text-[10px] font-semibold uppercase tracking-widest mb-2">Синхронизация</h4>
            <div className="space-y-1.5">
              {peerTimes.map((peer, i) => {
                const diff = Math.abs(peer.time - currentTime);
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

          <div className="flex-1 min-h-0">
            <Chat messages={chat.messages} onSendMessage={(text, replyToId) => { emitChatMessage(username || "", text, replyToId); logChatEvent(code || "", username || "", socket?.id || "", "send", { text: text.substring(0, 100) }); }} onReaction={handleReaction} username={username || ""} />
          </div>
        </div>

        {showCall && socket && (
          <div className="border-t border-white/5 p-2.5 bg-[#08080d]">
            <VideoCall socket={socket} roomCode={code || ""} username={username || ""} />
          </div>
        )}
      </div>
    </div>
  );
}
