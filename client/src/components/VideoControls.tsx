import { useState } from "react";
import { formatTime } from "../utils";

interface VideoControlsProps {
  variant: "desktop" | "portrait" | "landscape";
  playerReady: boolean;
  canControl: boolean;
  adPlaying: boolean;
  isAdPresser: boolean;
  videoUrl: string;
  videoType: "file" | "embed";
  onPlayPause: () => void;
  onSeek: (time: number) => void;
  onSeekRelative: (delta: number) => void;
  onSync: () => void;
  onToggleAd: () => void;
  onToggleFullscreen: () => void;
  isFullscreen: boolean;
  currentTime: number;
  playerState: "ended" | "playing" | "paused";
  voiceConnected: boolean;
  voiceMuted: boolean;
  speakingUsers: Set<string>;
  onVoiceToggle: () => void;
  onShowVoiceModal: () => void;
  showCall: boolean;
  onToggleCall: () => void;
  uploading: boolean;
  uploadProgress: number;
  uploadSpeed: number;
  uploadRemaining: string;
  onCancelUpload: () => void;
  onUploadFile: (file: File) => void;
  onSetPlaybackRate?: (rate: number) => void;
}

function PlayIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"/></svg>;
}

function PauseIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>;
}

function SeekBackIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>;
}

function SeekForwardIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>;
}

function MicIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>;
}

function FullscreenIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>;
}

function ExitFullscreenIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></svg>;
}

function SyncIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>;
}

function UploadIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>;
}

function VideoCallIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>;
}

function AdIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></svg>;
}

export function VideoControls(props: VideoControlsProps) {
  const { variant, playerReady, canControl, adPlaying, isAdPresser, videoUrl, videoType, onPlayPause, onSeekRelative, onSync, onToggleAd, onToggleFullscreen, isFullscreen, currentTime, voiceConnected, voiceMuted, speakingUsers, onVoiceToggle, onShowVoiceModal, showCall, onToggleCall, uploading, uploadProgress, uploadSpeed, uploadRemaining, onCancelUpload, onUploadFile, onSetPlaybackRate } = props;
  const [rateIdx, setRateIdx] = useState(1);
  const rates = [0.75, 1, 1.25, 1.5, 2];
  const cycleRate = () => {
    if (!onSetPlaybackRate) return;
    const next = (rateIdx + 1) % rates.length;
    setRateIdx(next);
    onSetPlaybackRate(rates[next]);
  };

  const voiceBtnClass = `flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] transition-all ${!voiceConnected ? "bg-white/5 text-white/30 hover:bg-white/10 hover:text-white/50" : voiceMuted ? "bg-red-500/15 text-red-400" : "bg-green-500/15 text-green-400"}`;

  if (variant === "desktop") {
    return (
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
        <button onClick={onPlayPause} disabled={!playerReady || !canControl || isAdPresser} className="bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 disabled:from-white/10 disabled:to-white/10 text-white disabled:text-white/30 px-4 py-1.5 rounded-lg text-[13px] font-semibold transition-all active:scale-95 shadow-lg shadow-blue-500/10 disabled:shadow-none">
          {props.playerState === "playing" ? "Пауза" : "Играть"}
        </button>
        <div className="flex items-center gap-0.5">
          <button onClick={() => onSeekRelative(-10)} disabled={!playerReady || !canControl} className="bg-white/5 hover:bg-white/10 disabled:opacity-30 text-white/50 w-8 h-8 rounded-lg flex items-center justify-center transition-all text-[11px] font-mono">-10</button>
          <button onClick={() => onSeekRelative(10)} disabled={!playerReady || !canControl} className="bg-white/5 hover:bg-white/10 disabled:opacity-30 text-white/50 w-8 h-8 rounded-lg flex items-center justify-center transition-all text-[11px] font-mono">+10</button>
        </div>
        {videoType === "file" && onSetPlaybackRate && (
          <button onClick={cycleRate} disabled={!playerReady} className="bg-white/5 hover:bg-white/10 disabled:opacity-30 text-white/70 px-2 py-1 rounded-lg text-[11px] font-mono tabular-nums" title="Скорость">{rates[rateIdx]}x</button>
        )}
        <button onClick={onSync} disabled={!playerReady} className="bg-white/5 hover:bg-white/10 disabled:opacity-30 text-white/30 px-2.5 py-1.5 rounded-lg text-[11px] transition-all" title="Синхронизировать всех">Синхр.</button>
        <button onClick={voiceConnected ? onVoiceToggle : onShowVoiceModal} className={voiceBtnClass}>
          <MicIcon />
          {voiceConnected && speakingUsers.size > 0 && <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />}
        </button>
        <button onClick={onToggleAd} className={`text-[11px] px-2.5 py-1 rounded-lg font-medium transition-all ${adPlaying ? "bg-red-500/15 text-red-400 border border-red-500/10" : "bg-white/5 text-white/30 hover:bg-white/10 hover:text-white/50 border border-white/5"}`}>
          {adPlaying ? "✓ Реклама" : "Реклама"}
        </button>
        <span className="text-[11px] text-white/25 ml-auto font-mono tabular-nums">{formatTime(currentTime)}</span>
      </div>
    );
  }

  if (variant === "landscape") {
    return (
      <div className="pointer-events-auto absolute bottom-0 left-0 right-0 z-30 bg-gradient-to-t from-black/30 via-black/15 to-transparent">
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-2">
            {videoUrl && (
              <>
                <button onClick={onPlayPause} disabled={!playerReady || !canControl || isAdPresser} className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center text-white disabled:opacity-30 hover:bg-white/25 transition-all active:scale-90">
                  {props.playerState === "playing" ? <PauseIcon /> : <PlayIcon />}
                </button>
                <button onClick={() => onSeekRelative(-10)} disabled={!playerReady || !canControl} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/70 disabled:opacity-30 hover:text-white transition-all">
                  <SeekBackIcon />
                </button>
                <button onClick={() => onSeekRelative(10)} disabled={!playerReady || !canControl} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/70 disabled:opacity-30 hover:text-white transition-all">
                  <SeekForwardIcon />
                </button>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            {adPlaying && <span className="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full font-medium animate-pulse">Реклама</span>}
            <span className="text-white/50 text-[11px] font-mono">{formatTime(currentTime)}</span>
            <button onClick={voiceConnected ? onVoiceToggle : onShowVoiceModal} className={`w-8 h-8 rounded-full flex items-center justify-center transition-all relative ${!voiceConnected ? "bg-white/10 text-white/40" : voiceMuted ? "bg-red-500/20 text-red-400" : "bg-green-500/15 text-green-400"}`}>
              <MicIcon />
              {voiceConnected && speakingUsers.size > 0 && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-400 rounded-full animate-pulse" />}
            </button>
            <button onClick={(e) => { e.stopPropagation(); onToggleFullscreen(); }} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition-all">
              {isFullscreen ? <ExitFullscreenIcon /> : <FullscreenIcon />}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Portrait
  return (
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
        <button onClick={onPlayPause} disabled={!playerReady || !canControl || isAdPresser} className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center text-white disabled:opacity-30 hover:bg-white/25 transition-all active:scale-90">
          {props.playerState === "playing" ? <PauseIcon /> : <PlayIcon />}
        </button>
        <button onClick={() => onSeekRelative(-10)} disabled={!playerReady || !canControl} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/70 disabled:opacity-30 hover:text-white transition-all">
          <SeekBackIcon />
        </button>
        <button onClick={() => onSeekRelative(10)} disabled={!playerReady || !canControl} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/70 disabled:opacity-30 hover:text-white transition-all">
          <SeekForwardIcon />
        </button>
        {videoType !== "file" && (
          <button onClick={onSync} disabled={!playerReady} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/50 disabled:opacity-30 hover:text-white transition-all">
            <SyncIcon />
          </button>
        )}
        <span className="text-white/50 text-[11px] font-mono ml-auto">{formatTime(currentTime)}</span>
        {videoType !== "file" && (
          <label className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/60 cursor-pointer hover:text-white transition-all">
            <UploadIcon />
            <input type="file" accept=".mp4,.webm,.mkv,.avi,.mov,.ogg,.ogv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onUploadFile(f); }} />
          </label>
        )}
        <button onClick={voiceConnected ? onVoiceToggle : onShowVoiceModal} className={`w-8 h-8 rounded-full flex items-center justify-center transition-all relative ${!voiceConnected ? "bg-white/10 text-white/30" : voiceMuted ? "bg-red-500/20 text-red-400" : "bg-green-500/15 text-green-400"}`}>
          <MicIcon />
          {voiceConnected && speakingUsers.size > 0 && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-400 rounded-full animate-pulse" />}
        </button>
        {videoType !== "file" && (
          <button onClick={onToggleCall} className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${showCall ? "bg-green-500/20 text-green-400" : "bg-white/10 text-white/60 hover:text-white"}`}>
            <VideoCallIcon />
          </button>
        )}
        {videoType !== "file" && (
          <button onClick={onToggleAd} className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${adPlaying ? "bg-red-500/20 text-red-400" : "bg-white/10 text-white/60 hover:text-white"}`}>
            <AdIcon />
          </button>
        )}
        <button onClick={onToggleFullscreen} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition-all">
          {isFullscreen ? <ExitFullscreenIcon /> : <FullscreenIcon />}
        </button>
      </div>
      {uploading && (
        <div className="mt-1 flex items-center gap-2">
          <div className="flex-1">
            <div className="bg-white/20 rounded-full h-1 overflow-hidden">
              <div className="bg-blue-400 h-full transition-all" style={{ width: uploadProgress + "%" }} />
            </div>
            <div className="flex items-center gap-2 text-[9px] text-white/50 mt-0.5">
              <span>{uploadProgress}%</span>
              {uploadSpeed > 0 && <span>{uploadSpeed > 1024 * 1024 ? `${(uploadSpeed / 1024 / 1024).toFixed(1)} МБ/с` : `${(uploadSpeed / 1024).toFixed(0)} КБ/с`}</span>}
              {uploadRemaining && <span>ост. {uploadRemaining}</span>}
            </div>
          </div>
          <button onClick={onCancelUpload} className="bg-red-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0">✕</button>
        </div>
      )}
    </div>
  );
}
