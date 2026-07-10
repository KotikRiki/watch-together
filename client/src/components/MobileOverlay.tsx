import { VideoPlayer } from "./VideoPlayer";
import { VideoCall } from "./VideoCall";
import { LandscapeChat } from "./LandscapeChat";
import { StickerPanel } from "./StickerPanel";
import { VideoControls } from "./VideoControls";
import { userColor } from "../utils";
import type { RefObject, Dispatch, SetStateAction } from "react";

interface Message {
  id: string;
  author: string;
  text: string;
  replyToId?: string | null;
  createdAt: string;
}

const EMOJI_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🔥", "🎉", "👀", "💯", "😱", "🤣", "😍", "🥳", "😎", "🤔", "💀"];

interface MobileOverlayProps {
  isLandscape: boolean;
  isFullscreen: boolean;
  videoPlayerRef: RefObject<any>;
  videoUrl: string | null;
  videoType: "file" | "embed";
  playerState: "ended" | "playing" | "paused";
  playerReady: boolean;
  canControl: boolean;
  adPlaying: boolean;
  isAdPresser: boolean;
  isHost: boolean;
  hostOnly: boolean;
  syncAction: any;
  handlePlayPause: () => void;
  handleSeek: (time: number) => void;
  handleSeekRelative: (delta: number) => void;
  handleSync: () => void;
  displayTime: number;
  onSetPlaybackRate?: (rate: number) => void;
  handleAdStateChange: (playing: boolean) => void;
  handleExternalStateChange: (state: "playing" | "paused") => void;
  handleUserAction: (action: "play" | "pause" | "seek", time: number) => void;
  setPlayerState: Dispatch<SetStateAction<"ended" | "playing" | "paused">>;
  setPlayerReady: (ready: boolean) => void;
  toggleManualAd: () => void;
  toggleHostOnly: () => void;
  reactions: { id: number; emoji: string; x: number; y: number }[];
  floatingMessages: { id: number; text: string; author: string }[];
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
  toggleFullscreen: () => void;
  navigate: (path: string) => void;
  code: string;
  username: string | null;
  chat: { messages: Message[]; messagesEndRef: React.RefObject<HTMLDivElement | null> };
  unreadCount: number;
  chatExpanded: boolean;
  setChatExpanded: (show: boolean) => void;
  landscapeChatOpen: boolean;
  setLandscapeChatOpen: (show: boolean) => void;
  landscapeEmojiOpen: boolean;
  setLandscapeEmojiOpen: (show: boolean) => void;
  landscapeBarsVisible: boolean;
  resetLandscapeBars: () => void;
  showRotateHint: boolean;
  setShowRotateHint: (show: boolean) => void;
  rotateHintTimerRef: React.RefObject<ReturnType<typeof setTimeout> | null>;
  isPWA: boolean;
  showStickersMobile: boolean;
  setShowStickersMobile: (show: boolean) => void;
  replyToMobile: Message | null;
  setReplyToMobile: (msg: Message | null) => void;
}

function isIOSSafari(): boolean {
  try {
    const ua = navigator.userAgent;
    return /iPad|iPhone|iPod/.test(ua) || (ua.includes("Mac") && "ontouchstart" in window);
  } catch {
    return false;
  }
}

export function MobileOverlay(props: MobileOverlayProps) {
  const {
    isLandscape, isFullscreen, videoPlayerRef, videoUrl, videoType, playerState, playerReady,
    canControl, adPlaying, isAdPresser, isHost, hostOnly, syncAction,
    handlePlayPause, handleSeek, handleSeekRelative, handleSync, handleAdStateChange, handleExternalStateChange, displayTime, onSetPlaybackRate,
    handleUserAction, setPlayerState, setPlayerReady, toggleManualAd, toggleHostOnly,
    reactions, floatingMessages,
    voiceConnected, voiceMuted, speakingUsers, localVolume, toggleMute, setShowVoiceModal,
    showCall, setShowCall,
    uploading, uploadProgress, uploadSpeed, uploadRemaining, cancelUpload, handleUploadFile,
    emitChangeVideo, emitChatMessage, handleReaction, toggleFullscreen,
    navigate, code, username, chat, unreadCount,
    chatExpanded, setChatExpanded, landscapeChatOpen, setLandscapeChatOpen,
    landscapeEmojiOpen, setLandscapeEmojiOpen, landscapeBarsVisible, resetLandscapeBars,
    showRotateHint, setShowRotateHint, rotateHintTimerRef, isPWA,
    showStickersMobile, setShowStickersMobile, replyToMobile, setReplyToMobile,
  } = props;

  const currentTime = displayTime || videoPlayerRef.current?.getCurrentTime() || 0;

  return (
    <>
      {/* Video player */}
      <div className={`${isLandscape ? "absolute inset-0 z-10" : "relative flex-1 min-h-0 bg-black"}`}>
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

        {videoType === "file" && videoUrl && !isLandscape && (
          <div className="absolute inset-0 z-20">
            <div className="absolute inset-0 pointer-events-auto" onClick={() => handlePlayPause()} />
            <div className="absolute top-3 right-3 pointer-events-auto">
              <button onClick={(e) => { e.stopPropagation(); setChatExpanded(!chatExpanded); }} className="relative w-10 h-10 rounded-full bg-black/40 backdrop-blur flex items-center justify-center text-white/70 hover:text-white">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                {unreadCount > 0 && !chatExpanded && <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] w-3.5 h-3.5 rounded-full flex items-center justify-center font-bold">{unreadCount > 9 ? "9+" : unreadCount}</span>}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Reactions */}
      {reactions.map((r) => (
        <div key={r.id} className="absolute text-3xl pointer-events-none z-40" style={{ left: `${r.x}%`, top: `${r.y}%`, animation: "float-up 3s ease-out forwards" }}>
          {r.emoji}
        </div>
      ))}

      {/* Floating chat messages (landscape) */}
      {isLandscape && floatingMessages.map((fm) => (
        <div key={fm.id} className="absolute bottom-16 right-3 z-40 pointer-events-none max-w-[60%] animate-[slideUp_0.3s_ease-out]" style={{ animation: "float-up 5s ease-out forwards" }}>
          <div className="bg-black/60 backdrop-blur rounded-lg px-3 py-1.5 border border-white/5">
            <span className="text-[9px] block" style={{ color: userColor(fm.author) }}>{fm.author}</span>
            <span className="text-white/80 text-[11px]">{fm.text}</span>
          </div>
        </div>
      ))}

      {/* Landscape overlays */}
      {isLandscape && (
        <div className="absolute inset-0 z-20 pointer-events-none" onTouchStart={resetLandscapeBars} onClick={() => resetLandscapeBars()}>
          <button onClick={(e) => { e.stopPropagation(); setShowRotateHint(true); if (rotateHintTimerRef.current) clearTimeout(rotateHintTimerRef.current); rotateHintTimerRef.current = setTimeout(() => setShowRotateHint(false), 5000); }} className="pointer-events-auto absolute top-2 left-2 z-40 w-7 h-7 rounded-full bg-black/40 backdrop-blur flex items-center justify-center text-white/50 hover:text-white transition-all opacity-60 hover:opacity-100">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
          </button>
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
                  <button onClick={() => voiceConnected ? toggleMute() : setShowVoiceModal(true)} className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${!voiceConnected ? "bg-white/10 text-white/40" : voiceMuted ? "bg-red-500/20 text-red-400" : "bg-green-500/15 text-green-400"}`}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    {voiceConnected && speakingUsers.size > 0 && <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-green-400 rounded-full animate-pulse" />}
                  </button>
                  {voiceConnected && !voiceMuted && (
                    <div className="flex items-end gap-[2px] h-4">
                      {[0.25, 0.5, 0.75, 1].map((threshold, i) => {
                        const vol = localVolume / 128;
                        const active = vol > threshold * 0.5;
                        return (
                          <div key={i} className={`w-[3px] rounded-full transition-all duration-100 ${active ? "bg-green-400" : "bg-white/10"}`} style={{ height: `${25 + i * 25}%` }} />
                        );
                      })}
                    </div>
                  )}
                  <button onClick={toggleFullscreen} className="w-8 h-8 rounded-full bg-white/10 text-white/60 flex items-center justify-center hover:text-white transition-all">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></svg>
                  </button>
                </div>
              </div>
            </div>
          )}

          {videoType === "file" && !isLandscape && (
            <div className="pointer-events-auto absolute top-3 right-3">
              <button onClick={() => setChatExpanded(!chatExpanded)} className="relative w-10 h-10 rounded-full bg-black/40 backdrop-blur flex items-center justify-center text-white/70 hover:text-white">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                {unreadCount > 0 && !chatExpanded && <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] w-3.5 h-3.5 rounded-full flex items-center justify-center font-bold">{unreadCount > 9 ? "9+" : unreadCount}</span>}
              </button>
            </div>
          )}

          {videoType === "file" && isLandscape && (
            <div className={`pointer-events-auto absolute top-2 right-2 z-30 transition-opacity duration-500 ${landscapeBarsVisible ? "opacity-100" : "opacity-0"}`}>
              <button onClick={() => setLandscapeChatOpen(!landscapeChatOpen)} className={`relative w-9 h-9 rounded-full flex items-center justify-center transition-all ${landscapeChatOpen ? "bg-blue-500/20 text-blue-400" : "bg-black/40 backdrop-blur text-white/60 hover:text-white"}`}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                {unreadCount > 0 && !landscapeChatOpen && <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[8px] w-3.5 h-3.5 rounded-full flex items-center justify-center font-bold">{unreadCount > 9 ? "9+" : unreadCount}</span>}
              </button>
            </div>
          )}

          {videoUrl && (
            <div onClick={(e) => e.stopPropagation()} className={`pointer-events-auto absolute bottom-0 left-0 right-0 z-30 bg-gradient-to-t from-black/30 via-black/15 to-transparent transition-opacity duration-500 ${videoType === "file" || landscapeBarsVisible ? "opacity-100" : "opacity-0"}`}>
              <VideoControls
                variant="landscape"
                playerState={playerState}
                playerReady={playerReady}
                canControl={canControl}
                adPlaying={adPlaying}
                isAdPresser={isAdPresser}
                videoUrl={videoUrl}
                videoType={videoType}
                onPlayPause={handlePlayPause}
                onSeek={handleSeek}
                onSeekRelative={handleSeekRelative}
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
                onSetPlaybackRate={onSetPlaybackRate}
              />
            </div>
          )}

          {landscapeChatOpen && (
            <LandscapeChat
              messages={chat.messages}
              username={username || ""}
              onSendMessage={(text) => emitChatMessage(username || "", text)}
              onReaction={handleReaction}
              onClose={() => setLandscapeChatOpen(false)}
            />
          )}

          {showCall && (
            <div className="pointer-events-auto absolute bottom-14 left-3 z-30 w-64 max-w-[60vw]">
              <VideoCall socket={null} roomCode={code} username={username || ""} compact />
              <button onClick={() => setShowCall(false)} className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-[#0f0f18] border border-white/10 text-white/30 hover:text-white flex items-center justify-center transition-colors">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          )}

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

      {/* Portrait overlays */}
      {!isLandscape && (
        <>
          <div className="absolute top-2 left-2 right-2 flex items-start justify-between pointer-events-none z-10">
            <div className="flex flex-col gap-1">
              {isHost && <span className="bg-yellow-500/80 text-black text-[10px] font-bold px-2 py-0.5 rounded-full">👑 Хост</span>}
              {hostOnly && <span className="bg-orange-500/80 text-black text-[10px] font-bold px-2 py-0.5 rounded-full">🔒</span>}
            </div>
          </div>

          {videoUrl && (
            <VideoControls
              variant="portrait"
              playerState={playerState}
              playerReady={playerReady}
              canControl={canControl}
              adPlaying={adPlaying}
              isAdPresser={isAdPresser}
              videoUrl={videoUrl}
              videoType={videoType}
              onPlayPause={handlePlayPause}
              onSeek={handleSeek}
              onSeekRelative={handleSeekRelative}
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
              onSetPlaybackRate={onSetPlaybackRate}
            />
          )}

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

      {/* Rotate hint */}
      {showRotateHint && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]" onClick={() => setShowRotateHint(false)}>
          <div className="flex flex-col items-center gap-3 max-w-[300px] px-6">
            {isIOSSafari() && !isPWA ? (
              <>
                <div className="w-8 h-8 bg-blue-500/20 rounded-xl flex items-center justify-center text-xl">+</div>
                <span className="text-white/90 text-sm font-semibold text-center">Добавьте на домашний экран</span>
                <span className="text-white/50 text-xs leading-relaxed text-center">
                  Нажмите <span className="text-white/70">Поделиться</span> → <span className="text-white/70">На экран «Домой»</span>, затем откройте оттуда. Бары Safari скроются автоматически.
                </span>
              </>
            ) : (
              <>
                <div className="w-16 h-28 border-2 border-white/40 rounded-xl relative" style={{ transformOrigin: "center center", animation: "phoneRotate 2s ease-in-out infinite" }}>
                  <div className="absolute top-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-white/30 rounded-full" />
                  <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-white/30 rounded-full" />
                </div>
                <span className="text-white/90 text-sm font-semibold text-center">Поверните телефон горизонтально</span>
                <span className="text-white/50 text-xs leading-relaxed text-center">Адресная строка скроется автоматически</span>
              </>
            )}
            <span className="text-white/30 text-[10px]">Нажмите чтобы закрыть</span>
          </div>
        </div>
      )}

      {showCall && (
        <div className="absolute top-2 left-2 right-2 z-30">
          <VideoCall socket={null} roomCode={code} username={username || ""} />
        </div>
      )}

      {/* Chat overlay (portrait) */}
      {!isLandscape && (
        <>
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
          {chatExpanded && (
            <div className="absolute inset-0 z-30 flex flex-col bg-[#0a0a0f]/40 backdrop-blur-xl pt-12 pb-20">
              <div className="flex items-center justify-between px-3 pt-2 pb-1 shrink-0">
                <span className="text-gray-400 text-xs font-semibold">💬 Чат</span>
                <button onClick={() => setChatExpanded(false)} className="w-7 h-7 rounded-full bg-gray-800 text-gray-400 hover:text-white flex items-center justify-center text-sm">✕</button>
              </div>

              <div className="flex-1 overflow-y-auto px-3 pb-2 min-h-0">
                {chat.messages.length === 0 && (
                  <p className="text-gray-600 text-xs text-center mt-8">Пока нет сообщений</p>
                )}
                {chat.messages.map((msg) => {
                  const replyMsg = msg.replyToId ? chat.messages.find((m) => m.id === msg.replyToId) : null;
                  return (
                    <div key={msg.id} className={`flex flex-col ${msg.author === username ? "items-end" : "items-start"} mb-1.5`}>
                      <span className="text-[10px] mb-0.5" style={{ color: userColor(msg.author) }}>{msg.author}</span>
                      {msg.text.startsWith("[sticker]") && msg.text.endsWith("[/sticker]") ? (
                        <div className="relative">
                          {replyMsg && (
                            <div className="text-[9px] mb-0.5 px-2 py-0.5 rounded bg-gray-700/50 border-l-2 border-gray-500">
                              <span className="font-semibold">{replyMsg.author}</span>
                              <span className="opacity-70 ml-1">{replyMsg.text.replace(/\[sticker\].*?\[\/sticker\]/, "🖼 стикер").substring(0, 30)}</span>
                            </div>
                          )}
                          <video src={msg.text.replace("[sticker]", "").replace("[/sticker]", "")} className="w-32 h-32 object-contain" autoPlay loop muted playsInline />
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
                            className={`px-3 py-1.5 rounded-2xl max-w-[80%] text-sm ${msg.author === username ? "bg-blue-600 text-white rounded-br-sm" : "bg-gray-700 text-white rounded-bl-sm"}`}
                            onClick={() => { if (replyToMobile?.id === msg.id) setReplyToMobile(null); else setReplyToMobile(msg); }}
                          >
                            {msg.text}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                <div ref={chat.messagesEndRef} />
              </div>

              <div className="flex gap-0.5 px-2 py-1 justify-center flex-wrap border-t border-gray-800 shrink-0">
                {EMOJI_REACTIONS.map((emoji) => (
                  <button key={emoji} onClick={() => handleReaction(emoji)} className="text-lg p-0.5 active:scale-125 transition-transform select-none" style={{ WebkitTapHighlightColor: "transparent" }}>{emoji}</button>
                ))}
              </div>

              {isHost && (
                <label className="flex items-center gap-2 px-4 py-1.5 border-t border-gray-800 cursor-pointer shrink-0">
                  <input type="checkbox" checked={hostOnly} onChange={toggleHostOnly} className="w-3.5 h-3.5 rounded bg-gray-700 border-gray-600 text-blue-600 focus:ring-blue-500" />
                  <span className="text-xs text-gray-400">Только хост управляет видео</span>
                </label>
              )}

              {showStickersMobile && (
                <StickerPanel
                  onSendSticker={(url) => { emitChatMessage(username || "", `[sticker]${url}[/sticker]`, replyToMobile?.id); setShowStickersMobile(false); setReplyToMobile(null); }}
                  onClose={() => setShowStickersMobile(false)}
                />
              )}

              {replyToMobile && (
                <div className="flex items-center gap-2 px-3 py-1 bg-gray-800 text-xs shrink-0">
                  <span className="text-blue-400">↩ {replyToMobile.author}</span>
                  <span className="text-gray-400 truncate flex-1">{replyToMobile.text.replace(/\[sticker\].*?\[\/sticker\]/, "🖼 стикер").substring(0, 40)}</span>
                  <button onClick={() => setReplyToMobile(null)} className="text-gray-500 hover:text-white">✕</button>
                </div>
              )}

              <form
                onSubmit={(e) => { e.preventDefault(); const target = e.target as HTMLFormElement; const input = target.elements.namedItem("chatInput") as HTMLInputElement; if (input.value.trim()) { emitChatMessage(username || "", input.value.trim(), replyToMobile?.id); input.value = ""; setReplyToMobile(null); } }}
                className="flex gap-1 px-3 pb-3 pt-1 shrink-0"
              >
                <button type="button" onClick={() => setShowStickersMobile(!showStickersMobile)} className={`text-xl px-2 rounded-lg shrink-0 transition-colors ${showStickersMobile ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"}`}>🎨</button>
                <input name="chatInput" type="text" placeholder="Сообщение..." className="flex-1 bg-gray-800 text-white rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-0" />
                <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-full text-sm font-semibold shrink-0">→</button>
              </form>
            </div>
          )}
        </>
      )}
    </>
  );
}
