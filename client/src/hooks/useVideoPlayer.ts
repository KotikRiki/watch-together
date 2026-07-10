import { useState, useEffect, useRef, useCallback } from "react";
import type { Socket } from "socket.io-client";
import type { VideoPlayerHandle } from "../components/VideoPlayer";

interface UseVideoPlayerOptions {
  socket: Socket | null;
  roomCode: string;
  username: string;
  isLandscape: boolean;
  emitVideoAction: (action: string, time: number) => void;
  emitVideoSync: (action: string, time: number) => void;
  emitPlayNext: () => void;
  on: (event: string, callback: (...args: any[]) => void) => void;
  off: (event: string, callback?: (...args: any[]) => void) => void;
}

export function useVideoPlayer({
  socket,
  roomCode,
  username,
  isLandscape,
  emitVideoAction,
  emitPlayNext,
  on,
  off,
}: UseVideoPlayerOptions) {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoType, setVideoType] = useState<"embed" | "file">("embed");
  const [playerState, setPlayerState] = useState<"playing" | "paused" | "ended">("paused");
  const [playerReady, setPlayerReady] = useState(false);
  const [syncAction, setSyncAction] = useState<{ action: string; time: number } | null>(null);
  const [adPlaying, setAdPlaying] = useState(false);
  const [isAdPresser, setIsAdPresser] = useState(false);
  const [peerTimes, setPeerTimes] = useState<{ time: number; isPlaying: boolean; username: string }[]>([]);
  const [watchTimes, setWatchTimes] = useState<{ username: string; seconds: number }[]>([]);
  const [isHost, setIsHost] = useState(false);
  const [hostOnly, setHostOnly] = useState(false);
  const [displayTime, setDisplayTime] = useState(0);

  const videoPlayerRef = useRef<VideoPlayerHandle>(null);
  const playerStateRef = useRef<"playing" | "paused" | "ended">("paused");
  const adPlayingRef = useRef(false);
  const pendingStateRef = useRef<{ currentTime: number; isPlaying: boolean } | null>(null);
  const lastUserActionRef = useRef(0);
  const isUserActionRef = useRef(false);
  const lastExternalChangeRef = useRef(0);
  const lastSyncEventRef = useRef(0);
  const syncFromActionRef = useRef(false);
  const manualAdRef = useRef(false);
  const adSyncRef = useRef(false);
  const isAdPresserRef = useRef(false);
  const manualAdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const heartbeatSyncingRef = useRef(false);
  const videoReadyAtRef = useRef(0);

  useEffect(() => {
    playerStateRef.current = playerState;
  }, [playerState]);

  useEffect(() => {
    adPlayingRef.current = adPlaying;
  }, [adPlaying]);

  useEffect(() => {
    isAdPresserRef.current = isAdPresser;
  }, [isAdPresser]);

  // Track when player becomes ready for grace period
  useEffect(() => {
    if (playerReady) {
      videoReadyAtRef.current = Date.now();
    }
  }, [playerReady]);

  // Reset grace period on video change
  useEffect(() => {
    videoReadyAtRef.current = 0;
  }, [videoUrl]);

  // Socket events
  useEffect(() => {
    if (!socket) return;

    const handleRoomState = (data: { videoUrl: string | null; videoType?: string; isHost?: boolean; hostOnly?: boolean; currentTime?: number; isPlaying?: boolean; adPlaying?: boolean }) => {
      if (data.videoUrl) setVideoUrl(data.videoUrl);
      if (data.videoType) setVideoType(data.videoType as "embed" | "file");
      if (data.isHost) setIsHost(true);
      if (data.hostOnly !== undefined) setHostOnly(data.hostOnly);
      if (data.adPlaying) setAdPlaying(true);
      if (data.videoUrl && data.currentTime != null && data.currentTime > 0) {
        pendingStateRef.current = { currentTime: data.currentTime, isPlaying: !!data.isPlaying };
      }
    };

    const handleVideoChanged = (data: { videoUrl: string; videoType?: string }) => {
      setVideoUrl(data.videoUrl);
      if (data.videoType) setVideoType(data.videoType as "embed" | "file");
    };

    const handleVideoSync = (data: { action: string; time: number; userId: string }) => {
      // Apply sync directly without state update for faster response
      if (data.action === "play") {
        videoPlayerRef.current?.play();
      } else if (data.action === "pause") {
        videoPlayerRef.current?.pause();
      } else if (data.action === "seek") {
        videoPlayerRef.current?.seek(data.time);
      }
      lastExternalChangeRef.current = Date.now();
    };

    const handleHeartbeat = (data: { time: number; isPlaying: boolean; userId: string }) => {
      if (adPlayingRef.current) return;
      const sinceExternal = Date.now() - lastExternalChangeRef.current;
      if (sinceExternal < 1500) return;
      const sinceUserAction = Date.now() - lastUserActionRef.current;
      if (sinceUserAction < 2000) return;
      if (videoReadyAtRef.current && Date.now() - videoReadyAtRef.current < 10000) return;

      heartbeatSyncingRef.current = true;
      setTimeout(() => { heartbeatSyncingRef.current = false; }, 500);

      if (videoType === "file") {
        videoPlayerRef.current?.smoothCorrect(data.time, data.isPlaying);
      } else {
        const localTime = videoPlayerRef.current?.getCurrentTime() || 0;
        const drift = Math.abs(data.time - localTime);
        if (drift > 2) {
          videoPlayerRef.current?.seek(data.time);
        }
      }
    };

    const handleUserTimes = (data: { users: { time: number; isPlaying: boolean; username: string }[]; watchTimes?: { username: string; seconds: number }[] }) => {
      setPeerTimes(data.users);
      if (data.watchTimes) setWatchTimes(data.watchTimes);
    };

    const handleHostChanged = (data: { isHost: boolean }) => {
      setIsHost(data.isHost);
    };

    const handleHostOnlyChanged = (data: { hostOnly: boolean }) => {
      setHostOnly(data.hostOnly);
    };

    const handleAdStateChanged = (data: { isAd: boolean }) => {
      if (manualAdRef.current || isAdPresserRef.current) return;
      setAdPlaying(data.isAd);
      adSyncRef.current = true;
      setTimeout(() => { adSyncRef.current = false; }, 800);
      lastExternalChangeRef.current = Date.now();
      lastUserActionRef.current = Date.now();
      if (data.isAd) videoPlayerRef.current?.pause();
      else videoPlayerRef.current?.play();
    };

    const handleWatchTimeUpdate = (data: { watchTimes: { username: string; seconds: number }[] }) => {
      setWatchTimes(data.watchTimes);
    };

    on("room-state", handleRoomState);
    on("video-changed", handleVideoChanged);
    on("video-sync", handleVideoSync);
    on("heartbeat", handleHeartbeat);
    on("user-times", handleUserTimes);
    on("host-changed", handleHostChanged);
    on("host-only-changed", handleHostOnlyChanged);
    on("ad-state-changed", handleAdStateChanged);
    on("watch-time-update", handleWatchTimeUpdate);

    return () => {
      off("room-state", handleRoomState);
      off("video-changed", handleVideoChanged);
      off("video-sync", handleVideoSync);
      off("heartbeat", handleHeartbeat);
      off("user-times", handleUserTimes);
      off("host-changed", handleHostChanged);
      off("host-only-changed", handleHostOnlyChanged);
      off("ad-state-changed", handleAdStateChanged);
      off("watch-time-update", handleWatchTimeUpdate);
      if (manualAdTimerRef.current) clearTimeout(manualAdTimerRef.current);
    };
  }, [socket, videoType]);

  // Auto-play next from queue when video ends (host only)
  useEffect(() => {
    if (playerState === "ended" && isHost) {
      const timer = setTimeout(() => {
        emitPlayNext();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [playerState, isHost, emitPlayNext]);

  // Apply pending room state when player becomes ready
  useEffect(() => {
    if (!playerReady) return;
    const pending = pendingStateRef.current;
    if (!pending) return;
    const sinceUserAction = Date.now() - lastUserActionRef.current;
    if (sinceUserAction < 2000) { pendingStateRef.current = null; return; }
    pendingStateRef.current = null;
    videoPlayerRef.current?.seek(pending.currentTime);
    if (pending.isPlaying) {
      setTimeout(() => videoPlayerRef.current?.play(), 200);
    }
  }, [playerReady]);

  // Heartbeat
  useEffect(() => {
    if (!socket || !playerReady) return;
    const interval = isLandscape ? 8000 : 5000;
    heartbeatIntervalRef.current = setInterval(() => {
      const time = videoPlayerRef.current?.getCurrentTime() || 0;
      if (!adPlayingRef.current) {
        socket.emit("heartbeat", roomCode, time, playerStateRef.current === "playing", username);
      }
    }, interval);
    return () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
    };
  }, [socket, roomCode, playerReady, username, isLandscape]);

  // Periodic time display update (1Hz when playing)
  useEffect(() => {
    if (!playerReady || playerState !== "playing") {
      setDisplayTime(videoPlayerRef.current?.getCurrentTime() || 0);
      return;
    }
    const t = setInterval(() => {
      setDisplayTime(videoPlayerRef.current?.getCurrentTime() || 0);
    }, 1000);
    return () => clearInterval(t);
  }, [playerReady, playerState]);

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

  const handlePlayPause = useCallback(() => {
    if (!canControl) return;
    if (adPlayingRef.current && manualAdRef.current) return;
    const action = playerState === "playing" ? "pause" : "play";
    const time = videoPlayerRef.current?.getCurrentTime() || 0;
    emitAndApply(action, time, { apply: true });
  }, [canControl, playerState, emitAndApply]);

  const handleSeek = useCallback((time: number) => {
    if (!canControl || adPlaying) return;
    const t = Math.max(0, time);
    emitAndApply("seek", t, { apply: true });
  }, [canControl, adPlaying, emitAndApply]);

  const handleSeekRelative = useCallback((delta: number) => {
    if (!canControl || adPlaying) return;
    const current = videoPlayerRef.current?.getCurrentTime() || 0;
    const t = Math.max(0, current + delta);
    emitAndApply("seek", t, { apply: true });
  }, [canControl, adPlaying, emitAndApply]);

  const handleSync = useCallback(() => {
    const time = videoPlayerRef.current?.getCurrentTime() || 0;
    emitAndApply("seek", time, { apply: false });
    setSyncAction({ action: "seek", time });
    setTimeout(() => setSyncAction(null), 300);
  }, [emitAndApply]);

  const toggleHostOnly = useCallback(() => {
    if (!isHost) return;
    const newVal = !hostOnly;
    setHostOnly(newVal);
    socket?.emit("set-host-only", roomCode, newVal);
  }, [isHost, hostOnly, socket, roomCode]);

    const handleExternalStateChange = useCallback((newState: "playing" | "paused") => {
    if (syncFromActionRef.current) return;
    if (heartbeatSyncingRef.current) return;
    if (adSyncRef.current) return;
    const time = videoPlayerRef.current?.getCurrentTime() || 0;
    emitAndApply(newState === "playing" ? "play" : "pause", time, { cooldown: true });
  }, [emitAndApply]);

    const handleUserAction = useCallback((action: "play" | "pause" | "seek", time: number) => {
    if (!canControl || adPlaying) return;
    if (isUserActionRef.current) return;
    if (heartbeatSyncingRef.current) return;
    if (adSyncRef.current) return;
    isUserActionRef.current = true;
    setTimeout(() => { isUserActionRef.current = false; }, 300);
    emitAndApply(action, time, { cooldown: true });
  }, [canControl, adPlaying, emitAndApply]);

    const handleAdStateChange = useCallback((playing: boolean) => {
    if (syncFromActionRef.current) return;
    if (heartbeatSyncingRef.current) return;
    if (adSyncRef.current) return;
    const time = videoPlayerRef.current?.getCurrentTime() || 0;
    emitAndApply(playing ? "play" : "pause", time, { cooldown: true });
  }, [emitAndApply]);

  const toggleManualAd = useCallback(() => {
    const newAd = !adPlaying;
    setAdPlaying(newAd);
    setIsAdPresser(newAd);
    isAdPresserRef.current = newAd;
    if (newAd) {
      // Start ad
      manualAdRef.current = true;
      if (manualAdTimerRef.current) clearTimeout(manualAdTimerRef.current);
      manualAdTimerRef.current = setTimeout(() => {
        // Auto-end after 30s
        setAdPlaying(false);
        setIsAdPresser(false);
        isAdPresserRef.current = false;
        manualAdRef.current = false;
        socket?.emit("ad-ended", roomCode);
      }, 30000);
      socket?.emit("ad-started", roomCode);
    } else {
      // End ad — just notify server, others will play via ad-state-changed
      if (manualAdTimerRef.current) clearTimeout(manualAdTimerRef.current);
      manualAdRef.current = false;
      socket?.emit("ad-ended", roomCode);
    }
  }, [adPlaying, socket, roomCode, emitAndApply]);

  return {
    videoUrl,
    videoType,
    playerState,
    playerReady,
    syncAction,
    adPlaying,
    isAdPresser,
    peerTimes,
    watchTimes,
    isHost,
    hostOnly,
    canControl,
    displayTime,
    videoPlayerRef,
    setVideoUrl,
    setVideoType,
    setPlayerState,
    setPlayerReady,
    setAdPlaying,
    setHostOnly,
    emitAndApply,
    handlePlayPause,
    handleSeek,
    handleSeekRelative,
    handleSync,
    toggleHostOnly,
    handleExternalStateChange,
    handleUserAction,
    handleAdStateChange,
    toggleManualAd,
  };
}
