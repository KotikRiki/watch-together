import { useState, useEffect, useCallback } from "react";

interface Stats {
  totalRooms: number;
  totalMessages: number;
  totalUploads: number;
  totalQueueItems: number;
  totalViews: number;
  totalSize: number;
  uniqueUsers: number;
  roomsLastDay: number;
  messagesLastDay: number;
  topRooms: { code: string; views: number; totalMessages: number; createdAt: string }[];
}

interface SystemInfo {
  hostname: string;
  platform: string;
  arch: string;
  cpuModel: string;
  cpuCores: number;
  cpuUsage: number;
  loadAvg1m: number;
  loadAvg5m: number;
  loadAvg15m: number;
  totalMem: number;
  usedMem: number;
  freeMem: number;
  memPercent: number;
  systemUptime: number;
  processUptime: number;
  nodeVersion: string;
}

interface Room {
  id: string;
  code: string;
  videoUrl: string | null;
  views: number;
  totalMessages: number;
  uploadCount: number;
  queueCount: number;
  createdAt: string;
  lastActive: string;
}

interface Message {
  id: string;
  roomId: string;
  author: string;
  text: string;
  createdAt: string;
  roomCode?: string;
}

export function Admin() {
  const [auth, setAuth] = useState<string | null>(() => localStorage.getItem("wt_admin_auth"));
  const [tab, setTab] = useState<"stats" | "rooms" | "history" | "system">("stats");
  const [stats, setStats] = useState<Stats | null>(null);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomsTotal, setRoomsTotal] = useState(0);
  const [roomsPage, setRoomsPage] = useState(1);
  const [search, setSearch] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesTotal, setMessagesTotal] = useState(0);
  const [messagesPage, setMessagesPage] = useState(1);
  const [filterRoom, setFilterRoom] = useState("");
  const [selectedRoom, setSelectedRoom] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [loginUser, setLoginUser] = useState("");
  const [loginPass, setLoginPass] = useState("");

  const headers: Record<string, string> = auth ? { Authorization: `Basic ${auth}` } : {};

  const doLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const encoded = btoa(`${loginUser}:${loginPass}`);
    localStorage.setItem("wt_admin_auth", encoded);
    setAuth(encoded);
  };

  const logout = () => {
    localStorage.removeItem("wt_admin_auth");
    setAuth(null);
  };

  const fetchStats = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/stats", { headers });
      if (r.ok) setStats(await r.json());
      else if (r.status === 401) logout();
    } catch {}
  }, [auth]);

  const fetchSystem = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/system", { headers });
      if (r.ok) setSystemInfo(await r.json());
      else if (r.status === 401) logout();
    } catch {}
  }, [auth]);

  const fetchRooms = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/rooms?page=${roomsPage}&limit=30&search=${search}`, { headers });
      if (r.ok) {
        const data = await r.json();
        setRooms(data.rooms);
        setRoomsTotal(data.total);
      } else if (r.status === 401) logout();
    } catch {}
    setLoading(false);
  }, [auth, roomsPage, search]);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/history?page=${messagesPage}&limit=100${filterRoom ? `&roomId=${filterRoom}` : ""}`, { headers });
      if (r.ok) {
        const data = await r.json();
        setMessages(data.messages);
        setMessagesTotal(data.total);
      } else if (r.status === 401) logout();
    } catch {}
    setLoading(false);
  }, [auth, messagesPage, filterRoom]);

  const fetchRoomDetail = async (code: string) => {
    try {
      const r = await fetch(`/api/admin/rooms/${code}`, { headers });
      if (r.ok) setSelectedRoom(await r.json());
    } catch {}
  };

  useEffect(() => {
    if (!auth) return;
    if (tab === "stats") fetchStats();
    if (tab === "rooms") fetchRooms();
    if (tab === "history") fetchHistory();
    if (tab === "system") fetchSystem();
  }, [auth, tab, roomsPage, messagesPage, filterRoom, search]);

  // Auto-refresh system tab every 3s
  useEffect(() => {
    if (!auth || tab !== "system") return;
    const iv = setInterval(fetchSystem, 3000);
    return () => clearInterval(iv);
  }, [auth, tab, fetchSystem]);

  if (!auth) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="bg-gray-900 rounded-2xl p-6 w-full max-w-sm border border-gray-800">
          <h1 className="text-2xl font-bold text-white mb-6 text-center">🔐 Админ-панель</h1>
          <form onSubmit={doLogin} className="space-y-3">
            <input
              type="text"
              placeholder="Логин"
              value={loginUser}
              onChange={(e) => setLoginUser(e.target.value)}
              className="w-full bg-gray-800 text-white rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
            <input
              type="password"
              placeholder="Пароль"
              value={loginPass}
              onChange={(e) => setLoginPass(e.target.value)}
              className="w-full bg-gray-800 text-white rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button type="submit" className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 transition-colors">
              Войти
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="bg-gray-900 border-b border-gray-800 p-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <h1 className="text-lg font-bold">⚙️ Админ-панель</h1>
          <div className="flex items-center gap-3">
            <a href="/" className="text-gray-400 hover:text-white text-sm">← На сайт</a>
            <button onClick={logout} className="text-red-400 hover:text-red-300 text-sm">Выйти</button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto p-3 sm:p-4">
        <div className="flex gap-2 mb-4 overflow-x-auto">
          {(["stats", "rooms", "history", "system"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors ${
                tab === t ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"
              }`}
            >
              {t === "stats" ? "📊 Статистика" : t === "rooms" ? "🏠 Комнаты" : t === "history" ? "📜 История" : "🖥 Сервер"}
            </button>
          ))}
        </div>

        {loading && <p className="text-gray-400 text-sm mb-4">Загрузка...</p>}

        {/* Stats Tab */}
        {tab === "stats" && stats && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {[
                { label: "Комнат", value: stats.totalRooms, color: "text-blue-400" },
                { label: "Сообщений", value: stats.totalMessages, color: "text-green-400" },
                { label: "Загрузок", value: stats.totalUploads, color: "text-purple-400" },
                { label: "Просмотров", value: stats.totalViews, color: "text-yellow-400" },
                { label: "Юзеров", value: stats.uniqueUsers, color: "text-pink-400" },
                { label: "Очередь", value: stats.totalQueueItems, color: "text-cyan-400" },
                { label: "Размер файлов", value: formatSize(stats.totalSize), color: "text-orange-400" },
                { label: "Комнат (24ч)", value: stats.roomsLastDay, color: "text-blue-300" },
                { label: "Сообщений (24ч)", value: stats.messagesLastDay, color: "text-green-300" },
              ].map((s) => (
                <div key={s.label} className="bg-gray-900 rounded-xl p-4 border border-gray-800">
                  <p className="text-gray-400 text-xs mb-1">{s.label}</p>
                  <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                </div>
              ))}
            </div>

            {stats.topRooms.length > 0 && (
              <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
                <h3 className="text-white font-semibold mb-3">🏆 Топ комнат</h3>
                <div className="space-y-2">
                  {stats.topRooms.map((r, i) => (
                    <div key={r.code} className="flex items-center gap-3 text-sm">
                      <span className="text-gray-500 w-6">#{i + 1}</span>
                      <span className="font-mono text-blue-400">{r.code}</span>
                      <span className="text-gray-400">{r.views} 👁</span>
                      <span className="text-gray-400">{r.totalMessages} 💬</span>
                      <span className="text-gray-600 text-xs ml-auto">{new Date(r.createdAt).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* System Tab */}
        {tab === "system" && systemInfo && (
          <div className="space-y-4">
            <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-white font-semibold">🖥 Информация о сервере</h3>
                <span className="text-green-400 text-xs animate-pulse">● Live</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <InfoBox label="Хост" value={systemInfo.hostname} />
                <InfoBox label="Платформа" value={`${systemInfo.platform} (${systemInfo.arch})`} />
                <InfoBox label="Node.js" value={systemInfo.nodeVersion} />
                <InfoBox label="CPU" value={systemInfo.cpuModel} wide />
                <InfoBox label="Ядра" value={systemInfo.cpuCores.toString()} />
              </div>
            </div>

            <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
              <h3 className="text-white font-semibold mb-3">⚡ CPU</h3>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-400">Загрузка CPU</span>
                    <span className={systemInfo.cpuUsage > 80 ? "text-red-400" : systemInfo.cpuUsage > 50 ? "text-yellow-400" : "text-green-400"}>
                      {systemInfo.cpuUsage}%
                    </span>
                  </div>
                  <div className="bg-gray-800 rounded-full h-3 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 rounded-full ${
                        systemInfo.cpuUsage > 80 ? "bg-red-500" : systemInfo.cpuUsage > 50 ? "bg-yellow-500" : "bg-green-500"
                      }`}
                      style={{ width: `${Math.min(100, systemInfo.cpuUsage)}%` }}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="bg-gray-800 rounded-lg p-3">
                    <p className="text-gray-400 text-xs">Load 1m</p>
                    <p className="text-white font-bold">{systemInfo.loadAvg1m}</p>
                  </div>
                  <div className="bg-gray-800 rounded-lg p-3">
                    <p className="text-gray-400 text-xs">Load 5m</p>
                    <p className="text-white font-bold">{systemInfo.loadAvg5m}</p>
                  </div>
                  <div className="bg-gray-800 rounded-lg p-3">
                    <p className="text-gray-400 text-xs">Load 15m</p>
                    <p className="text-white font-bold">{systemInfo.loadAvg15m}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
              <h3 className="text-white font-semibold mb-3">🧠 Память</h3>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-400">Использование RAM</span>
                    <span className={systemInfo.memPercent > 80 ? "text-red-400" : systemInfo.memPercent > 50 ? "text-yellow-400" : "text-green-400"}>
                      {systemInfo.memPercent}%
                    </span>
                  </div>
                  <div className="bg-gray-800 rounded-full h-3 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 rounded-full ${
                        systemInfo.memPercent > 80 ? "bg-red-500" : systemInfo.memPercent > 50 ? "bg-yellow-500" : "bg-green-500"
                      }`}
                      style={{ width: `${Math.min(100, systemInfo.memPercent)}%` }}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="bg-gray-800 rounded-lg p-3">
                    <p className="text-gray-400 text-xs">Всего</p>
                    <p className="text-white font-bold">{formatSize(systemInfo.totalMem)}</p>
                  </div>
                  <div className="bg-gray-800 rounded-lg p-3">
                    <p className="text-gray-400 text-xs">Занято</p>
                    <p className="text-orange-400 font-bold">{formatSize(systemInfo.usedMem)}</p>
                  </div>
                  <div className="bg-gray-800 rounded-lg p-3">
                    <p className="text-gray-400 text-xs">Свободно</p>
                    <p className="text-green-400 font-bold">{formatSize(systemInfo.freeMem)}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
              <h3 className="text-white font-semibold mb-3">⏱ Аптайм</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-800 rounded-lg p-3">
                  <p className="text-gray-400 text-xs">Система</p>
                  <p className="text-white font-bold">{formatUptime(systemInfo.systemUptime)}</p>
                </div>
                <div className="bg-gray-800 rounded-lg p-3">
                  <p className="text-gray-400 text-xs">Процесс</p>
                  <p className="text-blue-400 font-bold">{formatUptime(systemInfo.processUptime)}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Rooms Tab */}
        {tab === "rooms" && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Поиск по коду..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setRoomsPage(1); }}
                className="flex-1 bg-gray-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 max-w-xs"
              />
              <button onClick={() => fetchRooms()} className="bg-gray-700 text-white px-4 py-2 rounded-lg text-sm hover:bg-gray-600">🔄</button>
            </div>

            <p className="text-gray-500 text-xs">Всего: {roomsTotal}</p>

            <div className="space-y-2">
              {rooms.map((r) => (
                <div
                  key={r.id}
                  className="bg-gray-900 rounded-xl p-3 border border-gray-800 cursor-pointer hover:border-gray-600 transition-colors"
                  onClick={() => fetchRoomDetail(r.code)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-blue-400 font-bold">{r.code}</span>
                      <span className="text-gray-400 text-xs">{r.views} 👁</span>
                      <span className="text-gray-400 text-xs">{r.totalMessages} 💬</span>
                      <span className="text-gray-400 text-xs">{r.uploadCount} 📁</span>
                    </div>
                    <span className="text-gray-600 text-xs">{new Date(r.createdAt).toLocaleDateString()}</span>
                  </div>
                  {r.videoUrl && (
                    <p className="text-gray-500 text-xs mt-1 truncate">{r.videoUrl}</p>
                  )}
                  <p className="text-gray-600 text-xs mt-1">Активна: {new Date(r.lastActive).toLocaleString()}</p>
                </div>
              ))}
            </div>

            {roomsTotal > 30 && (
              <div className="flex gap-2 justify-center">
                <button onClick={() => setRoomsPage((p) => Math.max(1, p - 1))} disabled={roomsPage === 1} className="bg-gray-800 text-white px-3 py-1 rounded text-sm disabled:opacity-50">← Назад</button>
                <span className="text-gray-400 text-sm py-1">{roomsPage} / {Math.ceil(roomsTotal / 30)}</span>
                <button onClick={() => setRoomsPage((p) => p + 1)} disabled={roomsPage >= Math.ceil(roomsTotal / 30)} className="bg-gray-800 text-white px-3 py-1 rounded text-sm disabled:opacity-50">Далее →</button>
              </div>
            )}

            {selectedRoom && (
              <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setSelectedRoom(null)}>
                <div className="bg-gray-900 rounded-2xl p-4 w-full max-w-lg max-h-[80vh] overflow-y-auto border border-gray-700" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-white font-bold text-lg font-mono">{selectedRoom.code}</h3>
                    <button onClick={() => setSelectedRoom(null)} className="text-gray-400 hover:text-white text-xl">✕</button>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mb-4 text-sm">
                    <div className="bg-gray-800 rounded-lg p-2"><span className="text-gray-400">👁:</span> {selectedRoom.views}</div>
                    <div className="bg-gray-800 rounded-lg p-2"><span className="text-gray-400">💬:</span> {selectedRoom.messages.length}</div>
                    <div className="bg-gray-800 rounded-lg p-2"><span className="text-gray-400">📁:</span> {selectedRoom.uploads.length}</div>
                    <div className="bg-gray-800 rounded-lg p-2"><span className="text-gray-400">📋:</span> {selectedRoom.queue.length}</div>
                  </div>

                  {selectedRoom.videoUrl && <p className="text-gray-400 text-xs mb-3 truncate">Видео: {selectedRoom.videoUrl}</p>}

                  {selectedRoom.uploads.length > 0 && (
                    <div className="mb-4">
                      <h4 className="text-white font-semibold text-sm mb-2">📁 Загрузки</h4>
                      {selectedRoom.uploads.map((u: any) => (
                        <div key={u.id} className="bg-gray-800 rounded-lg p-2 text-xs mb-1">
                          <span className="text-gray-300">{u.originalName}</span>
                          <span className="text-gray-500 ml-2">{formatSize(u.size)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <h4 className="text-white font-semibold text-sm mb-2">💬 ({selectedRoom.messages.length})</h4>
                  <div className="space-y-1 max-h-60 overflow-y-auto">
                    {selectedRoom.messages.map((m: any) => (
                      <div key={m.id} className="text-xs bg-gray-800 rounded-lg p-2">
                        <span className="text-blue-400 font-semibold">{m.author}</span>
                        <span className="text-gray-600 ml-2">{new Date(m.createdAt).toLocaleString()}</span>
                        <p className="text-gray-300 mt-0.5">{m.text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* History Tab */}
        {tab === "history" && (
          <div className="space-y-3">
            <div className="flex gap-2 flex-wrap">
              <input
                type="text"
                placeholder="Room ID для фильтра..."
                value={filterRoom}
                onChange={(e) => { setFilterRoom(e.target.value); setMessagesPage(1); }}
                className="bg-gray-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 max-w-xs"
              />
              <button onClick={() => fetchHistory()} className="bg-gray-700 text-white px-4 py-2 rounded-lg text-sm hover:bg-gray-600">🔄</button>
            </div>

            <p className="text-gray-500 text-xs">Всего: {messagesTotal}</p>

            <div className="space-y-1">
              {messages.map((m) => (
                <div key={m.id} className="bg-gray-900 rounded-lg p-3 border border-gray-800 text-sm">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-blue-400 font-semibold">{m.author}</span>
                    <span className="text-gray-600 text-xs">{new Date(m.createdAt).toLocaleString()}</span>
                    {m.roomCode && <span className="text-gray-500 font-mono text-xs bg-gray-800 px-1.5 py-0.5 rounded">{m.roomCode}</span>}
                  </div>
                  <p className="text-gray-300">{m.text}</p>
                </div>
              ))}
            </div>

            {messagesTotal > 100 && (
              <div className="flex gap-2 justify-center">
                <button onClick={() => setMessagesPage((p) => Math.max(1, p - 1))} disabled={messagesPage === 1} className="bg-gray-800 text-white px-3 py-1 rounded text-sm disabled:opacity-50">← Назад</button>
                <span className="text-gray-400 text-sm py-1">{messagesPage} / {Math.ceil(messagesTotal / 100)}</span>
                <button onClick={() => setMessagesPage((p) => p + 1)} disabled={messagesPage >= Math.ceil(messagesTotal / 100)} className="bg-gray-800 text-white px-3 py-1 rounded text-sm disabled:opacity-50">Далее →</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function InfoBox({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={`bg-gray-800 rounded-lg p-2 ${wide ? "col-span-2 sm:col-span-3" : ""}`}>
      <p className="text-gray-400 text-xs">{label}</p>
      <p className="text-white text-sm font-semibold truncate">{value}</p>
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(2)} GB`;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
