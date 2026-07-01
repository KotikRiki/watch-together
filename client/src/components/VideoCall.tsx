import { useEffect, useRef, useState } from "react";

interface VideoCallProps {
  socket: any;
  roomCode: string;
  username: string;
}

export function VideoCall({ socket, roomCode, username }: VideoCallProps) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const [isCallActive, setIsCallActive] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  const servers = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
    ],
  };

  const createPeerConnection = () => {
    const pc = new RTCPeerConnection(servers);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("ice-candidate", roomCode, event.candidate);
      }
    };

    pc.ontrack = (event) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    return pc;
  };

  const startCall = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: true,
      });

      localStreamRef.current = stream;
      setHasPermission(true);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      peerConnectionRef.current = createPeerConnection();

      const offer = await peerConnectionRef.current.createOffer();
      await peerConnectionRef.current.setLocalDescription(offer);

      socket.emit("call-user", roomCode, offer, username);
      setIsCallActive(true);
    } catch (error: any) {
      console.error("Error starting call:", error);
      setHasPermission(false);
    }
  };

  const endCall = () => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    setIsCallActive(false);
    socket.emit("end-call", roomCode);
  };

  useEffect(() => {
    if (!socket) return;

    const handleCallMade = async (offer: RTCSessionDescriptionInit, _callerName: string) => {
      if (isCallActive) return;

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
          audio: true,
        });

        localStreamRef.current = stream;
        setHasPermission(true);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        peerConnectionRef.current = createPeerConnection();
        await peerConnectionRef.current.setRemoteDescription(offer);

        const answer = await peerConnectionRef.current.createAnswer();
        await peerConnectionRef.current.setLocalDescription(answer);

        socket.emit("make-answer", roomCode, answer);
        setIsCallActive(true);
      } catch (error) {
        console.error("Error answering call:", error);
      }
    };

    const handleAnswerMade = async (answer: RTCSessionDescriptionInit) => {
      if (peerConnectionRef.current) {
        await peerConnectionRef.current.setRemoteDescription(answer);
      }
    };

    const handleIceCandidate = async (candidate: RTCIceCandidateInit) => {
      if (peerConnectionRef.current) {
        await peerConnectionRef.current.addIceCandidate(candidate);
      }
    };

    const handleCallEnded = () => {
      endCall();
    };

    socket.on("call-made", handleCallMade);
    socket.on("answer-made", handleAnswerMade);
    socket.on("ice-candidate", handleIceCandidate);
    socket.on("call-ended", handleCallEnded);

    return () => {
      socket.off("call-made", handleCallMade);
      socket.off("answer-made", handleAnswerMade);
      socket.off("ice-candidate", handleIceCandidate);
      socket.off("call-ended", handleCallEnded);
    };
  }, [socket, roomCode, isCallActive]);

  useEffect(() => {
    return () => {
      endCall();
    };
  }, []);

  return (
    <div className="bg-gray-900 rounded-lg p-3">
      <h3 className="text-white font-semibold mb-2 text-sm">Видеозвонок</h3>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="aspect-video bg-gray-800 rounded-lg overflow-hidden relative">
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-full object-cover"
          />
          <span className="absolute bottom-1 left-1 text-xs text-gray-400 bg-black/50 px-1 rounded">Вы</span>
        </div>
        <div className="aspect-video bg-gray-800 rounded-lg overflow-hidden relative">
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover"
          />
          <span className="absolute bottom-1 left-1 text-xs text-gray-400 bg-black/50 px-1 rounded">Собеседник</span>
        </div>
      </div>

      {hasPermission === false && (
        <p className="text-red-400 text-xs mb-2">Нет доступа к камере/микрофону</p>
      )}

      <div className="flex gap-2">
        {!isCallActive ? (
          <button
            onClick={startCall}
            className="flex-1 bg-green-600 text-white py-2.5 rounded-lg text-sm font-semibold active:bg-green-700 transition-colors"
            style={{ WebkitTapHighlightColor: "transparent" }}
          >
            Позвонить
          </button>
        ) : (
          <button
            onClick={endCall}
            className="flex-1 bg-red-600 text-white py-2.5 rounded-lg text-sm font-semibold active:bg-red-700 transition-colors"
            style={{ WebkitTapHighlightColor: "transparent" }}
          >
            Завершить
          </button>
        )}
      </div>
    </div>
  );
}
