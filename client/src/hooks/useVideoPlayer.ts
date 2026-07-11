import { useState, useEffect, useRef, useCallback } from "react";
import type { Socket } from "socket.io-client";
import type { VideoPlayerHandle } from "../components/VideoPlayer";
import { clog, setLogSocket } from "../lib/logger";

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
  emitVideoSync,
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
  const manualAdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const heartbeatSyncingRef = useRef(false);
  const videoReadyAtRef = useRef(0);

  useEffect(() => {
    setLogSocket(socket, roomCode);
  }, [socket, roomCode]);

  useEffect(() => {
    playerStateRef.current = playerState;
  }, [playerState]);

  useEffect(() => {
    adPlayingRef.current = adPlaying;
  }, [adPlaying]);

  useEffect(() => {
    if (playerReady) {
      videoReadyAtRef.current = Date.now();
    }
  }, [playerReady]);

  useEffect(() => {
    videoReadyAtRef.current = 0;
  }, [videoUrl]);

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
      const myTime = videoPlayerRef.current?.getCurrentTime() || 0;
      const drift = Math.abs(data.time - myTime);
      clog("VIDEO-SYNC", `action=${data.action} from=${data.userId} drift=${drift.toFixed(1)}s state=${playerStateRef.current} ad=${adPlayingRef.current}`);
      syncFromActionRef.current = true;
      isUserActionRef.current = true;
      setTimeout(() => { syncFromActionRef.current = false; isUserActionRef.current = false; }, 500);
      if (data.action === "play") {
        setPlayerState("playing");
        videoPlayerRef.current?.play();
      } else if (data.action === "pause") {
        setPlayerState("paused");
        videoPlayerRef.current?.pause();
      } else if (data.action === "seek") {
        videoPlayerRef.current?.seek(data.time);
      }
      lastExternalChangeRef.current = Date.now();
    };

    const handleHeartbeat = (data: { time: number; isPlaying: boolean; userId: string }) => {
      if (data.userId === socket.id) return;
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
        if (sinceExternal > 3000) {
          if (data.isPlaying && playerStateRef.current !== "playing") {
            clog("HB", `PLAY from=${data.userId} hbTime=${data.time.toFixed(1)} localTime=${localTime.toFixed(1)} drift=${drift.toFixed(1)}s state=${playerStateRef.current}`);
            setPlayerState("playing");
            videoPlayerRef.current?.play();
          } else if (!data.isPlaying && playerStateRef.current !== "paused") {
            clog("HB", `PAUSE from=${data.userId} hbTime=${data.time.toFixed(1)} localTime=${localTime.toFixed(1)} drift=${drift.toFixed(1)}s state=${playerStateRef.current}`);
            setPlayerState("paused");
            videoPlayerRef.current?.pause();
          } else {
            clog("HB", `OK from=${data.userId} hbPlaying=${data.isPlaying} localState=${playerStateRef.current}`);
          }
        } else {
          clog("HB", `SKIP(sinceExt=${sinceExternal}ms) from=${data.userId} hbPlaying=${data.isPlaying}`);
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
      setAdPlaying(data.isAd);
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

  useEffect(() => {
    if (playerState === "ended" && isHost) {
      const timer = setTimeout(() => {
        emitPlayNext();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [playerState, isHost, emitPlayNext]);

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

  useEffect(() => {
    if (!socket || !playerReady) return;
    const interval = isLandscape ? 8000 : 5000;
    heartbeatIntervalRef.current = setInterval(() => {
      const time = videoPlayerRef.current?.getCurrentTime() || 0;
      if (!adPlaying) {
        socket.emit("heartbeat", roomCode, time, playerStateRef.current === "playing", username);
      }
    }, interval);
    return () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
    };
  }, [socket, roomCode, playerReady, username, isLandscape, adPlaying]);

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
    if (!canControl || adPlaying) return;
    const action = playerState === "playing" ? "pause" : "play";
    const time = videoPlayerRef.current?.getCurrentTime() || 0;
    emitVideoAction(action, time);
    lastSyncEventRef.current = Date.now();
    lastExternalChangeRef.current = Date.now();
    lastUserActionRef.current = Date.now();
    syncFromActionRef.current = true;
    setTimeout(() => { syncFromActionRef.current = false; }, 500);
    setSyncAction({ action, time });
    setTimeout(() => setSyncAction(null), 300);
  }, [canControl, playerState, adPlaying, emitVideoAction]);

  const handleSeek = useCallback((time: number) => {
    if (!canControl || adPlaying) return;
    const t = Math.max(0, time);
    emitVideoAction("seek", t);
    lastSyncEventRef.current = Date.now();
    lastExternalChangeRef.current = Date.now();
    syncFromActionRef.current = true;
    setTimeout(() => { syncFromActionRef.current = false; }, 500);
    setSyncAction({ action: "seek", time });
    setTimeout(() => setSyncAction(null), 300);
  }, [canControl, adPlaying, emitVideoAction]);

  const handleSeekRelative = useCallback((delta: number) => {
    if (!canControl || adPlaying) return;
    const current = videoPlayerRef.current?.getCurrentTime() || 0;
    const t = Math.max(0, current + delta);
    emitVideoAction("seek", t);
    lastSyncEventRef.current = Date.now();
    lastExternalChangeRef.current = Date.now();
    syncFromActionRef.current = true;
    setTimeout(() => { syncFromActionRef.current = false; }, 500);
    setSyncAction({ action: "seek", time: t });
    setTimeout(() => setSyncAction(null), 300);
  }, [canControl, adPlaying, emitVideoAction]);

  const handleSync = useCallback(() => {
    const time = videoPlayerRef.current?.getCurrentTime() || 0;
    emitVideoAction("seek", time);
    lastSyncEventRef.current = Date.now();
    lastExternalChangeRef.current = Date.now();
    syncFromActionRef.current = true;
    setTimeout(() => { syncFromActionRef.current = false; }, 500);
    setSyncAction({ action: "seek", time });
    setTimeout(() => setSyncAction(null), 300);
  }, [emitVideoAction]);

  const toggleHostOnly = useCallback(() => {
    if (!isHost) return;
    const newVal = !hostOnly;
    setHostOnly(newVal);
    socket?.emit("set-host-only", roomCode, newVal);
  }, [isHost, hostOnly, socket, roomCode]);

  const handleExternalStateChange = useCallback((newState: "playing" | "paused") => {
    if (syncFromActionRef.current) { clog("EXT-STATE", `BLOCKED(syncFrom) newState=${newState}`); return; }
    if (heartbeatSyncingRef.current) { clog("EXT-STATE", `BLOCKED(hb) newState=${newState}`); return; }
    if (adSyncRef.current) { clog("EXT-STATE", `BLOCKED(ad) newState=${newState}`); return; }
    const time = videoPlayerRef.current?.getCurrentTime() || 0;
    clog("EXT-STATE", `EMIT newState=${newState} time=${time.toFixed(1)} state=${playerStateRef.current}`);
    emitAndApply(newState === "playing" ? "play" : "pause", time, { cooldown: true });
  }, [emitAndApply]);

  const handleAdEnd = useCallback((time: number) => {
    clog("AD-END-emit", `resync after ad time=${time.toFixed(1)}`);
    setPlayerState("playing");
    syncFromActionRef.current = true;
    setTimeout(() => { syncFromActionRef.current = false; }, 500);
    emitVideoSync("play", time);
    emitVideoSync("seek", time);
  }, [emitVideoSync]);

  const handleUserAction = useCallback((action: "play" | "pause" | "seek", time: number) => {
    if (!canControl || adPlaying) { clog("USER-ACT", `BLOCKED canControl=${canControl} ad=${adPlaying} action=${action}`); return; }
    if (isUserActionRef.current) { clog("USER-ACT", `BLOCKED(isUser) action=${action}`); return; }
    if (heartbeatSyncingRef.current) { clog("USER-ACT", `BLOCKED(hb) action=${action}`); return; }
    if (adSyncRef.current) { clog("USER-ACT", `BLOCKED(ad) action=${action}`); return; }
    clog("USER-ACT", `action=${action} time=${time.toFixed(1)} state=${playerStateRef.current}`);
    isUserActionRef.current = true;
    setTimeout(() => { isUserActionRef.current = false; }, 300);
    emitAndApply(action, time, { cooldown: true });
  }, [canControl, adPlaying, emitAndApply]);

  const toggleManualAd = useCallback(() => {
    const newAd = !adPlaying;
    setAdPlaying(newAd);
    manualAdRef.current = true;
    if (manualAdTimerRef.current) clearTimeout(manualAdTimerRef.current);
    if (newAd) {
      manualAdTimerRef.current = setTimeout(() => {
        setAdPlaying(false);
        manualAdRef.current = false;
        const time = videoPlayerRef.current?.getCurrentTime() || 0;
        emitVideoSync("play", time);
        socket?.emit("ad-ended", roomCode);
      }, 30000);
    }
    const time = videoPlayerRef.current?.getCurrentTime() || 0;
    if (newAd) {
      emitVideoSync("pause", time);
      socket?.emit("ad-started", roomCode);
    } else {
      emitVideoSync("play", time);
      socket?.emit("ad-ended", roomCode);
    }
  }, [adPlaying, socket, roomCode, emitVideoSync]);

  return {
    videoUrl,
    videoType,
    playerState,
    playerReady,
    syncAction,
    adPlaying,
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
    handleAdEnd,
    toggleManualAd,
  };
}
