import { useEffect, useRef, useState, useCallback } from "react";

interface VideoCallProps {
  socket: any;
  roomCode: string;
  username: string;
  compact?: boolean;
}

export function VideoCall({ socket, roomCode, username, compact }: VideoCallProps) {
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

    const handleCallMade = async (offer: RTCSessionDescriptionInit, _callerName: string) => {
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

  if (compact) {
    return (
      <div className="bg-[#0a0a0f]/90 backdrop-blur-xl rounded-2xl border border-white/5 overflow-hidden shadow-2xl shadow-black/50">
        {callState === "connected" && videoEnabled && (
          <div className="relative w-full aspect-video bg-black">
            <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
            <div className="absolute bottom-1 right-1 w-16 h-12 bg-gray-800 rounded overflow-hidden border border-white/10">
              <video ref={localVideoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
            </div>
          </div>
        )}
        {callState !== "connected" && (
          <div className="p-3">
            {errorMsg && <p className="text-yellow-400/80 text-[10px] mb-1">{errorMsg}</p>}
            {stateLabel && <p className={`text-[10px] ${stateColor}`}>{stateLabel}</p>}
          </div>
        )}
        <div className="flex items-center gap-1.5 p-2">
          {callState === "idle" ? (
            <>
              <button onClick={() => startCall(true)} className="flex-1 py-1.5 rounded-lg text-[10px] font-semibold bg-green-500/15 text-green-400 hover:bg-green-500/25 transition-colors">
                Видео
              </button>
              <button onClick={() => startCall(false)} className="flex-1 py-1.5 rounded-lg text-[10px] font-semibold bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 transition-colors">
                Аудио
              </button>
            </>
          ) : (
            <>
              <button onClick={toggleVideo} className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${videoEnabled ? "bg-white/10 text-white/60" : "bg-red-500/20 text-red-400"}`}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
              </button>
              <button onClick={toggleMic} className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${micEnabled ? "bg-white/10 text-white/60" : "bg-red-500/20 text-red-400"}`}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>
              </button>
              <button onClick={() => { cleanup(); socket.emit("end-call", roomCode); }} className="w-7 h-7 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center hover:bg-red-500/30 transition-colors">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#0a0a0f] rounded-xl p-3 border border-white/5">
      <h3 className="text-white/70 font-medium mb-2 text-xs">{videoEnabled ? "Видеозвонок" : "Аудиозвонок"}</h3>
      {videoEnabled ? (
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="aspect-video bg-[#0f0f18] rounded-lg overflow-hidden relative">
            <video ref={localVideoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
            <span className="absolute bottom-1 left-1 text-[9px] text-white/40 bg-black/50 px-1 rounded">Вы</span>
          </div>
          <div className="aspect-video bg-[#0f0f18] rounded-lg overflow-hidden relative">
            <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
            <span className="absolute bottom-1 left-1 text-[9px] text-white/40 bg-black/50 px-1 rounded">Собеседник</span>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center gap-4 mb-3 py-4">
          <div className="w-12 h-12 rounded-full bg-[#1a1a2e] flex items-center justify-center text-lg">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/40"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>
          </div>
          <div className="w-12 h-12 rounded-full bg-[#1a1a2e] flex items-center justify-center text-lg">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/40"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
          </div>
        </div>
      )}
      {errorMsg && <p className="text-yellow-400/80 text-[10px] mb-2">{errorMsg}</p>}
      {stateLabel && <p className={`text-[10px] mb-2 ${stateColor}`}>{stateLabel}</p>}

      {callState === "idle" ? (
        <div className="flex gap-2">
          <button onClick={() => startCall(true)} className="flex-1 bg-green-600/80 hover:bg-green-600 text-white py-2 rounded-lg text-xs font-semibold transition-colors">
            Видеозвонок
          </button>
          <button onClick={() => startCall(false)} className="flex-1 bg-blue-600/80 hover:bg-blue-600 text-white py-2 rounded-lg text-xs font-semibold transition-colors">
            Аудиозвонок
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <button onClick={toggleVideo} className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${videoEnabled ? "bg-white/10 text-white/70" : "bg-red-500/20 text-red-400"}`}>
            {videoEnabled ? "Видео" : "Без видео"}
          </button>
          <button onClick={toggleMic} className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${micEnabled ? "bg-white/10 text-white/70" : "bg-red-500/20 text-red-400"}`}>
            {micEnabled ? "Микр." : "Mute"}
          </button>
          <button onClick={() => { cleanup(); socket.emit("end-call", roomCode); }} className="w-8 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg flex items-center justify-center transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      )}
    </div>
  );
}
