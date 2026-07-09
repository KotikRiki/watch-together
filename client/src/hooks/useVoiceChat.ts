import { useEffect, useRef, useState, useCallback } from "react";
import type { Socket } from "socket.io-client";

function getRTCPeerConnection() {
  try {
    const g = globalThis as Record<string, any>;
    return g.RTCPeerConnection || g.webkitRTCPeerConnection || g.mozRTCPeerConnection || null;
  } catch {
    return null;
  }
}

function isTelegramWebView(): boolean {
  try {
    const g = globalThis as Record<string, any>;
    const ua = navigator.userAgent || "";
    return !!(g.Telegram?.WebApp || ua.includes("Telegram") || ua.includes("WebView"));
  } catch {
    return false;
  }
}

const _webRtcSupported = getRTCPeerConnection() !== null;

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
    { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" },
    { urls: "turn:openrelay.metered.ca:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject" },
  ],
};

const VAD_THRESHOLD = 30;
const VAD_CHECK_INTERVAL = 500;
const RECORDING_CHUNK_INTERVAL = 60000; // 60 seconds per chunk upload

interface PeerConnection {
  socketId: string;
  pc: RTCPeerConnection;
}

interface VoiceChatOptions {
  socket: Socket | null;
  roomCode: string;
  username: string;
}

function getSupportedMimeType(): string | null {
  const types = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  for (const type of types) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) return type;
  }
  return null;
}

export function useVoiceChat({ socket, roomCode, username }: VoiceChatOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const isMutedRef = useRef(false);
  const [speakingUsers, setSpeakingUsers] = useState<Set<string>>(new Set());
  const [voiceUserCount, setVoiceUserCount] = useState(0);
  const [localVolume, setLocalVolume] = useState(0);

  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, PeerConnection>>(new Map());
  const vadIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());

  // Recording state
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunkIndexRef = useRef(0);
  const sessionStartRef = useRef<string>("");
  const lastChunkTimeRef = useRef<number>(0);

  const cleanup = useCallback(() => {
    if (vadIntervalRef.current) {
      clearInterval(vadIntervalRef.current);
      vadIntervalRef.current = null;
    }
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      try { recorderRef.current.stop(); } catch {}
    }
    recorderRef.current = null;
    audioChunksRef.current = [];
    peersRef.current.forEach(({ pc }) => pc.close());
    peersRef.current.clear();
    audioElementsRef.current.forEach((el) => {
      el.srcObject = null;
      el.remove();
    });
    audioElementsRef.current.clear();
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setIsConnected(false);
    setIsMuted(false);
    setSpeakingUsers(new Set());
    setVoiceUserCount(0);
    setLocalVolume(0);
  }, []);

  const startVAD = useCallback(() => {
    if (!localStreamRef.current) return;
    try {
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(localStreamRef.current);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      audioContextRef.current = ctx;
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let lastSpeaking = false;
      vadIntervalRef.current = setInterval(() => {
        if (!analyserRef.current || isMutedRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        setLocalVolume(avg);
        const speaking = avg > VAD_THRESHOLD;
        if (socket && roomCode && speaking !== lastSpeaking) {
          socket.emit("voice-speaking", roomCode, speaking);
          lastSpeaking = speaking;
        }
      }, VAD_CHECK_INTERVAL);
    } catch (e) {
      console.error("VAD init failed:", e);
    }
  }, [socket, roomCode]);

  const uploadAudioChunk = useCallback(
    async (blob: Blob, chunkIndex: number, durationSec: number) => {
      if (!roomCode || blob.size === 0) return;
      const formData = new FormData();
      formData.append("audio", blob, `voice-${Date.now()}.webm`);
      formData.append("roomCode", roomCode);
      formData.append("username", username || "anonymous");
      formData.append("chunkIndex", String(chunkIndex));
      formData.append("duration", String(durationSec.toFixed(1)));

      try {
        await fetch("/api/voice-upload", { method: "POST", body: formData });
      } catch (e) {
        console.error("Voice chunk upload failed:", e);
      }
    },
    [roomCode, username]
  );

  const startRecording = useCallback(
    (stream: MediaStream) => {
      const mimeType = getSupportedMimeType();
      if (!mimeType) {
        console.warn("[Recording] No supported MIME type, recording disabled");
        return;
      }
      try {
        const recorder = new MediaRecorder(stream, { mimeType });
        recorderRef.current = recorder;
        audioChunksRef.current = [];
        chunkIndexRef.current = 0;
        sessionStartRef.current = new Date().toISOString();
        lastChunkTimeRef.current = Date.now();

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunksRef.current.push(e.data);
        };

        recorder.onstop = async () => {
          if (audioChunksRef.current.length > 0) {
            const blob = new Blob(audioChunksRef.current, { type: mimeType });
            const durationSec = (Date.now() - lastChunkTimeRef.current) / 1000;
            await uploadAudioChunk(blob, chunkIndexRef.current, durationSec);
            audioChunksRef.current = [];
          }
        };

        recorder.start(RECORDING_CHUNK_INTERVAL);

        recordingIntervalRef.current = setInterval(async () => {
          if (recorderRef.current && recorderRef.current.state === "recording" && audioChunksRef.current.length > 0) {
            const blob = new Blob(audioChunksRef.current, { type: mimeType });
            const durationSec = RECORDING_CHUNK_INTERVAL / 1000;
            await uploadAudioChunk(blob, chunkIndexRef.current, durationSec);
            chunkIndexRef.current++;
            audioChunksRef.current = [];
            lastChunkTimeRef.current = Date.now();
            recorderRef.current.stop();
            recorderRef.current.start(RECORDING_CHUNK_INTERVAL);
          }
        }, RECORDING_CHUNK_INTERVAL);

        console.log("[Recording] Started, mimeType:", mimeType);
      } catch (e) {
        console.error("[Recording] Failed to start:", e);
      }
    },
    [uploadAudioChunk]
  );

  const stopRecording = useCallback(async () => {
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    recorderRef.current = null;
    chunkIndexRef.current = 0;
  }, []);

  const createPeer = useCallback(
    (targetSocketId: string, isInitiator: boolean) => {
      if (!socket || !roomCode || !localStreamRef.current) {
        console.warn("createPeer: missing socket/roomCode/localStream");
        return null;
      }

      if (peersRef.current.has(targetSocketId)) {
        console.log("createPeer: peer already exists for", targetSocketId);
        return peersRef.current.get(targetSocketId)!.pc;
      }

      const PC = getRTCPeerConnection();
      if (!PC) {
        return null;
      }

      console.log("createPeer:", targetSocketId, "initiator:", isInitiator);
      const pc = new PC(ICE_SERVERS);
      peersRef.current.set(targetSocketId, { socketId: targetSocketId, pc });

      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current!);
      });

      pc.onicecandidate = (e: RTCPeerConnectionIceEvent) => {
        if (e.candidate) {
          socket.emit("voice-ice", roomCode, targetSocketId, e.candidate);
        }
      };

      pc.ontrack = (e: RTCTrackEvent) => {
        console.log("ontrack from", targetSocketId, "streams:", e.streams.length);
        let audioEl = audioElementsRef.current.get(targetSocketId);
        if (!audioEl) {
          audioEl = document.createElement("audio");
          audioEl.autoplay = true;
          (audioEl as any).playsInline = true;
          document.body.appendChild(audioEl);
          audioElementsRef.current.set(targetSocketId, audioEl);
        }
        if (e.streams && e.streams[0]) {
          audioEl.srcObject = e.streams[0];
          audioEl.play().catch(() => {});
        }
      };

      pc.onconnectionstatechange = () => {
        console.log("PC state for", targetSocketId, ":", pc.connectionState);
        if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
          console.warn("PC failed/disconnected for", targetSocketId);
          pc.close();
          peersRef.current.delete(targetSocketId);
          const el = audioElementsRef.current.get(targetSocketId);
          if (el) {
            el.srcObject = null;
            el.remove();
            audioElementsRef.current.delete(targetSocketId);
          }
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log("ICE state for", targetSocketId, ":", pc.iceConnectionState);
      };

      if (isInitiator) {
        pc.createOffer()
          .then((offer: RTCSessionDescriptionInit) => pc.setLocalDescription(offer))
          .then(() => {
            if (pc.localDescription) {
              console.log("Sending offer to", targetSocketId);
              socket.emit("voice-offer", roomCode, targetSocketId, pc.localDescription);
            }
          })
          .catch((e: any) => console.error("createOffer failed:", e));
      }

      return pc;
    },
    [socket, roomCode]
  );

  const joinVoice = useCallback(async () => {
    if (!socket || !roomCode) return;
    if (voiceUserCount >= MAX_VOICE_USERS) {
      alert(`Голосовой чат заполнен (макс. ${MAX_VOICE_USERS} пользователей)`);
      return;
    }
    if (!_webRtcSupported) {
      const isTg = isTelegramWebView();
      const msg = isTg
        ? "Голосовой чат недоступен в браузере Telegram. Откройте сайт в Chrome, Safari или Firefox."
        : "Голосовой чат не поддерживается в этом браузере. Попробуйте Chrome или Firefox.";
      console.warn("[Voice] WebRTC not supported", { isTelegram: isTg, ua: navigator.userAgent });
      alert(msg);
      return;
    }
    try {
      console.log("joinVoice: requesting microphone...");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      console.log("joinVoice: got microphone, tracks:", stream.getTracks().length);
      setIsConnected(true);
      socket.emit("voice-join", roomCode);
      startVAD();
      startRecording(stream);
    } catch (err) {
      console.error("Failed to get microphone:", err);
      alert("Не удалось получить доступ к микрофону. Проверьте разрешения браузера.");
    }
  }, [socket, roomCode, startVAD]);

  const leaveVoice = useCallback(() => {
    stopRecording();
    if (socket && roomCode) {
      socket.emit("voice-leave", roomCode);
    }
    cleanup();
  }, [socket, roomCode, cleanup, stopRecording]);

  const toggleMute = useCallback(() => {
    if (!localStreamRef.current) return;
    const audioTrack = localStreamRef.current.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setIsMuted(!audioTrack.enabled);
      isMutedRef.current = !audioTrack.enabled;
      if (!audioTrack.enabled) setLocalVolume(0);
      if (recorderRef.current) {
        if (audioTrack.enabled && recorderRef.current.state === "paused") {
          recorderRef.current.resume();
        } else if (!audioTrack.enabled && recorderRef.current.state === "recording") {
          recorderRef.current.pause();
        }
      }
    }
  }, []);

const MAX_VOICE_USERS = 5;

  useEffect(() => {
    if (!socket || !roomCode) return;

    // New joiner receives list of existing voice users → create offers to all
    const handleVoiceUsers = (users: { socketId: string; username: string }[]) => {
      console.log("voice-users received:", users.length, "existing users");
      const total = users.length + 1;
      setVoiceUserCount(total);
      if (total > MAX_VOICE_USERS) {
        console.warn("Voice chat full, not connecting");
        return;
      }
      users.forEach((u) => {
        if (!peersRef.current.has(u.socketId)) {
          createPeer(u.socketId, true);
        }
      });
    };

    // Existing user notified of new joiner → DO NOT create peer, wait for offer
    const handleVoiceUserJoined = (_socketId: string, _joinUsername: string) => {
      console.log("voice-user-joined:", _joinUsername);
      setVoiceUserCount((prev) => prev + 1);
    };

    const handleVoiceUserLeft = (socketId: string) => {
      console.log("voice-user-left:", socketId);
      setVoiceUserCount((prev) => Math.max(0, prev - 1));
      const peer = peersRef.current.get(socketId);
      if (peer) {
        peer.pc.close();
        peersRef.current.delete(socketId);
      }
      const el = audioElementsRef.current.get(socketId);
      if (el) {
        el.srcObject = null;
        el.remove();
        audioElementsRef.current.delete(socketId);
      }
      setSpeakingUsers((prev) => {
        const next = new Set(prev);
        next.delete(socketId);
        return next;
      });
    };

    const handleVoiceOffer = async (fromSocketId: string, offer: RTCSessionDescriptionInit) => {
      console.log("voice-offer received from", fromSocketId);
      if (!localStreamRef.current) {
        console.warn("No local stream, can't answer offer");
        return;
      }
      let pc = peersRef.current.get(fromSocketId)?.pc;
      if (!pc) {
        console.log("Creating answerer peer for", fromSocketId);
        pc = createPeer(fromSocketId, false) || undefined;
      }
      if (!pc) return;
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        if (pc.localDescription) {
          console.log("Sending answer to", fromSocketId);
          socket.emit("voice-answer", roomCode, fromSocketId, pc.localDescription);
        }
      } catch (e) {
        console.error("voice-offer handling error:", e);
      }
    };

    const handleVoiceAnswer = async (fromSocketId: string, answer: RTCSessionDescriptionInit) => {
      console.log("voice-answer received from", fromSocketId);
      const peer = peersRef.current.get(fromSocketId);
      if (peer) {
        try {
          await peer.pc.setRemoteDescription(new RTCSessionDescription(answer));
        } catch (e) {
          console.error("voice-answer handling error:", e);
        }
      }
    };

    const handleVoiceIce = async (fromSocketId: string, candidate: RTCIceCandidateInit) => {
      const peer = peersRef.current.get(fromSocketId);
      if (peer) {
        try {
          await peer.pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.error("voice-ice error:", e);
        }
      }
    };

    const handleVoiceSpeaking = (socketId: string, speaking: boolean) => {
      setSpeakingUsers((prev) => {
        const next = new Set(prev);
        if (speaking) next.add(socketId);
        else next.delete(socketId);
        return next;
      });
    };

    socket.on("voice-users", handleVoiceUsers);
    socket.on("voice-user-joined", handleVoiceUserJoined);
    socket.on("voice-user-left", handleVoiceUserLeft);
    socket.on("voice-offer", handleVoiceOffer);
    socket.on("voice-answer", handleVoiceAnswer);
    socket.on("voice-ice", handleVoiceIce);
    socket.on("voice-speaking", handleVoiceSpeaking);

    return () => {
      socket.off("voice-users", handleVoiceUsers);
      socket.off("voice-user-joined", handleVoiceUserJoined);
      socket.off("voice-user-left", handleVoiceUserLeft);
      socket.off("voice-offer", handleVoiceOffer);
      socket.off("voice-answer", handleVoiceAnswer);
      socket.off("voice-ice", handleVoiceIce);
      socket.off("voice-speaking", handleVoiceSpeaking);
    };
  }, [socket, roomCode, createPeer]);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []);

  return {
    joinVoice,
    leaveVoice,
    toggleMute,
    isMuted,
    isConnected,
    speakingUsers,
    voiceUserCount,
    localVolume,
    webRtcSupported: _webRtcSupported,
    telegramDetected: isTelegramWebView(),
  };
}
