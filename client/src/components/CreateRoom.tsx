import { useState } from "react";
import { useNavigate } from "react-router-dom";

export function CreateRoom() {
  const navigate = useNavigate();
  const [joinCode, setJoinCode] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async () => {
    setIsCreating(true);
    try {
      const apiUrl = window.location.port === "5173"
        ? `http://${window.location.hostname}:3001`
        : "";
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
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">
            Watch<span className="text-blue-400">Together</span>
          </h1>
          <p className="text-gray-400">
            Смотрите видео вместе с друзьями
          </p>
        </div>

        {/* Card */}
        <div className="bg-gray-900 rounded-2xl p-6 border border-gray-800">
          {/* Create button */}
          <button
            onClick={handleCreate}
            disabled={isCreating}
            className="w-full bg-blue-600 text-white py-4 rounded-xl font-semibold text-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isCreating ? "Создание..." : "+ Создать комнату"}
          </button>

          {/* Divider */}
          <div className="flex items-center my-6">
            <div className="flex-1 border-t border-gray-700"></div>
            <span className="px-3 text-gray-500 text-sm">или</span>
            <div className="flex-1 border-t border-gray-700"></div>
          </div>

          {/* Join */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">
              Войти по коду комнаты
            </label>
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="Код из 6 букв"
              maxLength={6}
              className="w-full bg-gray-800 text-white text-center text-xl font-mono tracking-widest rounded-xl px-4 py-3 mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-600"
              onKeyPress={(e) => {
                if (e.key === "Enter") handleJoin();
              }}
            />
            <button
              onClick={handleJoin}
              disabled={!joinCode.trim()}
              className="w-full bg-gray-800 text-white py-3 rounded-xl font-semibold hover:bg-gray-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed border border-gray-700"
            >
              Присоединиться
            </button>
          </div>
        </div>

        {/* Platforms */}
        <div className="mt-6 text-center text-gray-500 text-sm">
          YouTube • RuTube • Загрузка файлов
        </div>

        {/* Force update button — temporary for testing */}
        <div className="mt-4 text-center">
          <button
            onClick={async () => {
              if ("serviceWorker" in navigator) {
                const regs = await navigator.serviceWorker.getRegistrations();
                for (const r of regs) await r.unregister();
              }
              caches.keys().then(keys => keys.forEach(k => caches.delete(k)));
              window.location.reload();
            }}
            className="text-gray-600 text-[10px] hover:text-gray-400 transition-colors underline"
          >
            ⚡ Принудительно обновить SW
          </button>
        </div>
      </div>
    </div>
  );
}
