import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

const RECENT_KEY = "wt_recent_rooms";

function getRecentRooms(): { code: string; at: number }[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
  } catch {
    return [];
  }
}

function addRecentRoom(code: string) {
  const list = getRecentRooms().filter(r => r.code !== code);
  list.unshift({ code: code.toUpperCase(), at: Date.now() });
  localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 5)));
}

export function useRecentRooms() {
  const [rooms, setRooms] = useState<{ code: string; at: number }[]>([]);
  useEffect(() => {
    setRooms(getRecentRooms());
    const onFocus = () => setRooms(getRecentRooms());
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);
  return { recentRooms: rooms, addRecentRoom };
}

export function CreateRoom() {
  const navigate = useNavigate();
  const [joinCode, setJoinCode] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [joinError, setJoinError] = useState("");
  const [usePassword, setUsePassword] = useState(false);
  const [roomPassword, setRoomPassword] = useState("");
  const { recentRooms, addRecentRoom } = useRecentRooms();

  const apiUrl = window.location.port === "5173"
    ? `http://${window.location.hostname}:3001`
    : "";

  const handleCreate = async () => {
    setIsCreating(true);
    try {
      const response = await fetch(`${apiUrl}/api/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: usePassword && roomPassword ? roomPassword : undefined }),
      });
      const room = await response.json();
      addRecentRoom(room.code);
      navigate(`/room/${room.code}`);
    } catch (error) {
      console.error("Failed to create room:", error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoin = async () => {
    if (!joinCode.trim()) return;
    setJoinError("");
    try {
      const code = joinCode.trim().toUpperCase();
      const res = await fetch(`${apiUrl}/api/rooms/${code}`);
      if (res.ok) {
        addRecentRoom(code);
        navigate(`/room/${code}`);
      } else {
        setJoinError("Комната не найдена");
      }
    } catch {
      setJoinError("Ошибка соединения");
    }
  };

  const handleRecent = (code: string) => {
    addRecentRoom(code);
    navigate(`/room/${code}`);
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

        {/* Recent rooms */}
        {recentRooms.length > 0 && (
          <div className="mb-5">
            <div className="text-gray-600 text-[11px] uppercase tracking-wider mb-2 px-1">Недавние комнаты</div>
            <div className="flex flex-wrap gap-2">
              {recentRooms.map(r => (
                <button
                  key={r.code}
                  onClick={() => handleRecent(r.code)}
                  className="bg-white/5 hover:bg-white/10 text-white/70 hover:text-white font-mono text-sm px-3 py-1.5 rounded-lg border border-white/5 transition-all active:scale-95"
                >
                  {r.code}
                </button>
              ))}
            </div>
          </div>
        )}

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

          {/* Password toggle */}
          <div className="mt-4">
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <div
                onClick={() => setUsePassword(!usePassword)}
                className={`relative w-9 h-5 rounded-full transition-colors ${usePassword ? "bg-blue-500" : "bg-white/10"}`}
              >
                <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${usePassword ? "translate-x-4" : ""}`} />
              </div>
              <span className="text-gray-400 text-xs">Пароль на комнату</span>
            </label>
            {usePassword && (
              <input
                type="password"
                value={roomPassword}
                onChange={(e) => setRoomPassword(e.target.value)}
                placeholder="Придумайте пароль"
                className="w-full bg-white/5 text-white rounded-xl px-4 py-2.5 mt-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500/50 placeholder:text-gray-600 transition-all"
              />
            )}
          </div>

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
            {joinError && <p className="text-red-400 text-xs text-center mb-3">{joinError}</p>}
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