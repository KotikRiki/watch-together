import { useEffect, useRef, useImperativeHandle, forwardRef } from "react";
import { clog } from "../lib/logger";

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

interface VideoPlayerProps {
  videoUrl: string | null;
  videoType?: "embed" | "file";
  onTimeUpdate: (time: number) => void;
  onStateChange?: (state: "playing" | "paused" | "ended") => void;
  onPlayerReady?: () => void;
  onExternalStateChange?: (state: "playing" | "paused") => void;
  onUserAction?: (action: "play" | "pause" | "seek", time: number) => void;
  syncAction: { action: string; time: number } | null;
  onAdEnd?: (time: number) => void;
}

export interface VideoPlayerHandle {
  play: () => void;
  pause: () => void;
  seek: (time: number) => void;
  getCurrentTime: () => number;
  isReady: () => boolean;
  setPlaybackRate: (rate: number) => void;
  smoothCorrect: (targetTime: number, isPlaying: boolean) => void;
}

function getVideoInfo(url: string): { type: string; id: string } | null {
  let match;
  match = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (match) return { type: "youtube", id: match[1] };
  match = url.match(/rutube\.ru\/video\/([a-f0-9]{32})/);
  if (match) return { type: "rutube", id: match[1] };
  match = url.match(/rutube\.ru\/play\/embed\/([a-f0-9]{32})/);
  if (match) return { type: "rutube", id: match[1] };
  match = url.match(/vk\.com\/video(-?\d+_\d+)/);
  if (match) return { type: "vk", id: match[1] };
  return null;
}

export const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(
  function VideoPlayer({ videoUrl, videoType, onTimeUpdate, onStateChange, onPlayerReady, onExternalStateChange, onUserAction, syncAction, onAdEnd }, ref) {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const currentTimeRef = useRef(0);
    const readyRef = useRef(false);
    const syncActiveRef = useRef(false);
    const lastCommandTimeRef = useRef(0);
    const wasAdvertRef = useRef(false);
    const isFile = videoType === "file";
    const videoInfo = !isFile && videoUrl ? getVideoInfo(videoUrl) : null;

    // HTML5 video player for uploaded files
    useEffect(() => {
      if (!isFile || !videoUrl) return;
      const vid = videoRef.current;
      if (!vid) return;

      const onPlay = () => {
        onStateChange?.("playing");
        if (!syncActiveRef.current) {
          onExternalStateChange?.("playing");
          onUserAction?.("play", vid.currentTime);
        }
      };
      const onPause = () => {
        clog("NATIVE-PAUSE", `syncActive=${syncActiveRef.current} time=${vid.currentTime}`);
        onStateChange?.("paused");
        if (!syncActiveRef.current) {
          onExternalStateChange?.("paused");
          onUserAction?.("pause", vid.currentTime);
        }
      };
      const onSeeked = () => {
        if (!syncActiveRef.current) {
          onUserAction?.("seek", vid.currentTime);
        }
      };
      const onEnded = () => { onStateChange?.("ended"); };
      const onTime = () => { currentTimeRef.current = vid.currentTime; };
      const onCanPlay = () => {
        readyRef.current = true;
        onPlayerReady?.();
      };

      vid.addEventListener("play", onPlay);
      vid.addEventListener("pause", onPause);
      vid.addEventListener("ended", onEnded);
      vid.addEventListener("timeupdate", onTime);
      vid.addEventListener("canplay", onCanPlay);
      vid.addEventListener("seeked", onSeeked);

      return () => {
        vid.removeEventListener("play", onPlay);
        vid.removeEventListener("pause", onPause);
        vid.removeEventListener("ended", onEnded);
        vid.removeEventListener("timeupdate", onTime);
        vid.removeEventListener("canplay", onCanPlay);
        vid.removeEventListener("seeked", onSeeked);
        readyRef.current = false;
      };
    }, [isFile, videoUrl]);

    // YouTube postMessage API
    useEffect(() => {
      if (!videoUrl || !videoInfo || videoInfo.type !== "youtube") return;

      const handleMessage = (e: MessageEvent) => {
        try {
          const msg = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
          if (msg.event === "infoDelivery" && msg.info?.currentTime != null) {
            currentTimeRef.current = msg.info.currentTime;
            onTimeUpdate(msg.info.currentTime);
          }
          if (msg.event === "onReady") {
            readyRef.current = true;
            onPlayerReady?.();
          }
          if (msg.event === "onStateChange") {
            const state = msg.info?.playerState;
            const isOurCommand = Date.now() - lastCommandTimeRef.current < 1500;
            clog("YT-STATE", `state=${state} isOur=${isOurCommand} syncActive=${syncActiveRef.current}`);
            if (state === 1) { // PLAYING
              onStateChange?.("playing");
              if (!syncActiveRef.current) {
                if (isOurCommand) {
                  onExternalStateChange?.("playing");
                  onUserAction?.("play", msg.info?.currentTime || 0);
                } else {
                  onExternalStateChange?.("playing");
                  onUserAction?.("play", msg.info?.currentTime || 0);
                }
              }
            } else if (state === 2) { // PAUSED
              onStateChange?.("paused");
              if (!syncActiveRef.current) {
                if (isOurCommand) {
                  onExternalStateChange?.("paused");
                  onUserAction?.("pause", msg.info?.currentTime || 0);
                } else {
                  onExternalStateChange?.("paused");
                  onUserAction?.("pause", msg.info?.currentTime || 0);
                }
              }
            } else if (state === 0) { // ENDED
              onStateChange?.("ended");
            }
          }
        } catch {}
      };

      window.addEventListener("message", handleMessage);

      // Tell the YT iframe to start broadcasting state + time updates
      const sendListening = () => {
        try { iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ event: "listening" }), "*"); } catch {}
      };
      sendListening();
      // Retry a few times — the iframe may not be ready immediately
      const listenRetry = setInterval(sendListening, 1000);
      // Periodically poll current time as a fallback (in case infoDelivery stops)
      const pollTime = setInterval(() => {
        try { iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ event: "command", func: "getCurrentTime", args: [] }), "*"); } catch {}
      }, 2000);

      readyRef.current = true;
      onPlayerReady?.();

      return () => {
        window.removeEventListener("message", handleMessage);
        clearInterval(listenRetry);
        clearInterval(pollTime);
        readyRef.current = false;
      };
    }, [videoUrl, videoInfo?.id]);

    // RuTube postMessage API

    useEffect(() => {
      if (!videoUrl || !videoInfo || videoInfo.type !== "rutube") return;

      const handleMessage = (e: MessageEvent) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === "player:currentTime" && msg.data?.time != null) {
            currentTimeRef.current = msg.data.time;
            onTimeUpdate(msg.data.time);
          }
          if (msg.type === "player:ready") {
            readyRef.current = true;
            onPlayerReady?.();
          }
          if (msg.type === "player:changeState") {
            const isOurCommand = Date.now() - lastCommandTimeRef.current < 1500;
            const state = msg.data?.state;
            clog("RT-STATE", `state=${state} isOur=${isOurCommand} syncActive=${syncActiveRef.current}`);
            if (state === "advert") {
              wasAdvertRef.current = true;
            } else if (state === "playing") {
              onStateChange?.("playing");
              if (!syncActiveRef.current) {
                if (wasAdvertRef.current) {
                  wasAdvertRef.current = false;
                  clog("AD-END", `resuming after advert time=${currentTimeRef.current.toFixed(1)}`);
                  onAdEnd?.(currentTimeRef.current);
                } else if (isOurCommand) {
                  onExternalStateChange?.("playing");
                  onUserAction?.("play", currentTimeRef.current);
                } else {
                  onExternalStateChange?.("playing");
                  onUserAction?.("play", currentTimeRef.current);
                }
              }
            } else if (state === "paused" || state === "pause") {
              onStateChange?.("paused");
              if (!syncActiveRef.current) {
                if (isOurCommand) {
                  onExternalStateChange?.("paused");
                  onUserAction?.("pause", currentTimeRef.current);
                } else {
                  onExternalStateChange?.("paused");
                  onUserAction?.("pause", currentTimeRef.current);
                }
              }
            }
          }
        } catch {}
      };
      window.addEventListener("message", handleMessage);
      // Fallback: mark ready immediately so the loader clears even if
      // the iframe never sends a "player:ready" postMessage.
      readyRef.current = true;
      onPlayerReady?.();
      return () => window.removeEventListener("message", handleMessage);
    }, [videoUrl, videoInfo?.id]);

    // Handle sync action from peer
    useEffect(() => {
      if (!syncAction) return;
      lastCommandTimeRef.current = Date.now();
      syncActiveRef.current = true;
      setTimeout(() => { syncActiveRef.current = false; }, 1500);
      if (syncAction.action === "play") {
        currentTimeRef.current = syncAction.time;
        if (isFile && videoRef.current) {
          videoRef.current.currentTime = syncAction.time;
          videoRef.current.play();
        } else if (videoInfo?.type === "youtube") {
          iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ event: "command", func: "seekTo", args: [syncAction.time, true] }), "*");
          iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ event: "command", func: "playVideo", args: [] }), "*");
        } else if (videoInfo?.type === "rutube") {
          iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ type: "player:setCurrentTime", data: { time: syncAction.time } }), "*");
          iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ type: "player:play", data: {} }), "*");
        }
        onStateChange?.("playing");
      } else if (syncAction.action === "pause") {
        currentTimeRef.current = syncAction.time;
        if (isFile && videoRef.current) {
          videoRef.current.currentTime = syncAction.time;
          videoRef.current.pause();
        } else if (videoInfo?.type === "youtube") {
          iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ event: "command", func: "seekTo", args: [syncAction.time, true] }), "*");
          iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ event: "command", func: "pauseVideo", args: [] }), "*");
        } else if (videoInfo?.type === "rutube") {
          iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ type: "player:setCurrentTime", data: { time: syncAction.time } }), "*");
          iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ type: "player:pause", data: {} }), "*");
        }
        onStateChange?.("paused");
      } else if (syncAction.action === "seek") {
        currentTimeRef.current = syncAction.time;
        if (isFile && videoRef.current) {
          videoRef.current.currentTime = syncAction.time;
        } else if (videoInfo?.type === "youtube") {
          iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ event: "command", func: "seekTo", args: [syncAction.time, true] }), "*");
        } else if (videoInfo?.type === "rutube") {
          iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ type: "player:setCurrentTime", data: { time: syncAction.time } }), "*");
        }
      }
    }, [syncAction, videoInfo?.type, isFile]);

    // Imperative methods
    useImperativeHandle(ref, () => ({
      play: () => {
        lastCommandTimeRef.current = Date.now();
        if (isFile) videoRef.current?.play();
        else if (videoInfo?.type === "youtube") iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ event: "command", func: "playVideo", args: [] }), "*");
        else if (videoInfo?.type === "rutube") iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ type: "player:play", data: {} }), "*");
        return true;
      },
      pause: () => {
        lastCommandTimeRef.current = Date.now();
        if (isFile) videoRef.current?.pause();
        else if (videoInfo?.type === "youtube") iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ event: "command", func: "pauseVideo", args: [] }), "*");
        else if (videoInfo?.type === "rutube") iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ type: "player:pause", data: {} }), "*");
        return true;
      },
      seek: (time: number) => {
        currentTimeRef.current = time;
        // Mark as sync-driven so the resulting "seeked" event does not
        // re-broadcast the seek (which caused a ping-pong feedback loop).
        syncActiveRef.current = true;
        setTimeout(() => { syncActiveRef.current = false; }, 800);
        if (isFile && videoRef.current) {
          videoRef.current.currentTime = time;
        } else if (videoInfo?.type === "youtube") {
          iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ event: "command", func: "seekTo", args: [time, true] }), "*");
        } else if (videoInfo?.type === "rutube") {
          iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ type: "player:setCurrentTime", data: { time } }), "*");
        }
        return true;
      },
      getCurrentTime: () => {
        if (isFile && videoRef.current) return videoRef.current.currentTime;
        return currentTimeRef.current;
      },
      isReady: () => readyRef.current,
      setPlaybackRate: (rate: number) => {
        if (isFile && videoRef.current) {
          videoRef.current.playbackRate = rate;
        }
      },
      smoothCorrect: (targetTime: number, _isPlaying: boolean) => {
        const vid = videoRef.current;
        if (!vid) return;

        const current = vid.currentTime;
        const drift = current - targetTime;
        const absDrift = Math.abs(drift);

        // No correction needed for tiny drift
        if (absDrift < 2) {
          if (vid.playbackRate !== 1) vid.playbackRate = 1;
          return;
        }

        // We are BEHIND the peer: jump forward to catch up (no rollback feel)
        if (drift < -4) {
          vid.currentTime = Math.max(0, targetTime);
          return;
        }

        // We are AHEAD of the peer: never jump backward — gently slow down
        // so the peer can catch up, then restore normal speed.
        vid.playbackRate = 0.92;
        setTimeout(() => {
          if (vid && vid.playbackRate !== 1) vid.playbackRate = 1;
        }, 2000);
      },
    }));

    // Reset when URL changes
    useEffect(() => {
      readyRef.current = false;
      currentTimeRef.current = 0;
    }, [videoUrl, videoInfo?.id, isFile]);

    // Empty state
    if (!videoUrl) {
      return (
        <div className="w-full aspect-video bg-gray-900 rounded-lg flex items-center justify-center">
          <p className="text-gray-500 text-sm">Вставьте ссылку на видео или загрузите файл</p>
        </div>
      );
    }

    // File player — no native controls, custom overlay from Room
    if (isFile) {
      return (
        <div className="w-full h-full bg-black overflow-hidden relative">
          <video
            ref={videoRef}
            src={videoUrl}
            className="absolute inset-0 w-full h-full object-contain"
            playsInline
            preload="auto"
            onClick={(e) => e.stopPropagation()}
            onError={(e) => {
              const vid = e.currentTarget;
              console.error("Video load error:", vid.error?.code, vid.error?.message);
              onStateChange?.("ended");
            }}
          />
        </div>
      );
    }

    if (!videoInfo) {
      return (
        <div className="w-full h-full bg-[#12121a] flex items-center justify-center">
          <p className="text-gray-500 text-sm">Неподдерживаемая ссылка</p>
        </div>
      );
    }

    if (videoInfo.type === "vk") {
      return (
        <div className="w-full h-full bg-[#12121a] flex flex-col items-center justify-center gap-3 p-4">
          <p className="text-yellow-400 text-sm font-semibold">VK Video не поддерживается</p>
          <a
            href={`https://vk.com/video${videoInfo.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 text-xs hover:underline"
          >
            VK ↗
          </a>
        </div>
      );
    }

    if (videoInfo.type === "youtube") {
      return (
        <div className="w-full h-full bg-black overflow-hidden relative">
          <iframe
            ref={iframeRef}
            key={videoInfo.id}
            src={`https://www.youtube.com/embed/${videoInfo.id}?enablejsapi=1&controls=0&modestbranding=1&rel=0&fs=0&playsinline=1&iv_load_policy=3&showinfo=0&theme=dark&color=red`}
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          />
        </div>
      );
    }

    return (
      <div className="w-full h-full bg-black overflow-hidden relative">
        <iframe
          ref={iframeRef}
          key={videoInfo.id}
          src={`https://rutube.ru/play/embed/${videoInfo.id}?api=true`}
          className="w-full h-full"
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
        />
      </div>
    );
  }
);
