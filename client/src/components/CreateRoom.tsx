import { useState } from "react";
import { useNavigate } from "react-router-dom";

export function CreateRoom() {
  const navigate = useNavigate();
  const [joinCode, setJoinCode] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const apiUrl = window.location.port === "5173"
    ? `http://${window.location.hostname}:3001`
    : "";

  const handleCreate = async () => {
    setIsCreating(true);
    try {
      const response = await fetch(`${apiUrl}/api/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const room = await response.json();
      navigate(`/room/${room.code}`);
    } catch (error) {
      console.error("Failed to create room:", error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoin = () => {
    if (joinCode.trim()) {
      navigate(`/room/${joinCode.trim().toUpperCase()}`);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-4">
      {/* Subtle gradient background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-30%] left-[-20%] w-[60%] h-[60%] bg-blue-600/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-purple-600/5 rounded-full blur-[100px]" />
      </div>

      <div className="w-full max-w-sm relative z-10">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg shadow-blue-500/20 mb-4">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Watch Together
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Смотрите видео вместе в реальном времени
          </p>
        </div>

        {/* Card */}
        <div className="bg-[#12121a] rounded-2xl p-5 border border-white/5 shadow-2xl shadow-black/50">
          {/* Create button */}
          <button
            onClick={handleCreate}
            disabled={isCreating}
            className="w-full bg-gradient-to-r from-blue-600 to-blue-500 text-white py-3.5 rounded-xl font-semibold text-sm hover:from-blue-500 hover:to-blue-400 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-blue-500/20 active:scale-[0.98]"
          >
            {isCreating ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                Создание...
              </span>
            ) : "Создать комнату"}
          </button>

          {/* Divider */}
          <div className="flex items-center my-5">
            <div className="flex-1 h-px bg-white/5" />
            <span className="px-3 text-gray-600 text-xs">или войти по коду</span>
            <div className="flex-1 h-px bg-white/5" />
          </div>

          {/* Join by code */}
          <div>
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="Код комнаты"
              maxLength={6}
              className="w-full bg-white/5 text-white text-center text-lg font-mono tracking-[0.3em] rounded-xl px-4 py-3 mb-3 focus:outline-none focus:ring-1 focus:ring-blue-500/50 focus:bg-white/[0.07] placeholder:text-gray-600 placeholder:tracking-normal placeholder:font-sans transition-all"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleJoin();
              }}
            />
            <button
              onClick={handleJoin}
              disabled={!joinCode.trim()}
              className="w-full bg-white/5 text-gray-300 py-3 rounded-xl font-semibold text-sm hover:bg-white/10 transition-all disabled:opacity-20 disabled:cursor-not-allowed border border-white/5 active:scale-[0.98]"
            >
              Присоединиться
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 flex items-center justify-center gap-3 text-gray-600 text-[11px]">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500/60" />
            YouTube
          </span>
          <span className="text-gray-700">·</span>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-500/60" />
            RuTube
          </span>
          <span className="text-gray-700">·</span>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-500/60" />
            Файлы
          </span>
        </div>
      </div>
    </div>
  );
}
