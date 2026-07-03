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
  process: { rss: number; heapUsed: number; heapTotal: number; external: number; cpuPercent: number };
  system: {
    hostname: string; kernel: string; cpuModel: string; cpuCores: number;
    loadAvg: number[]; totalMem: number; usedMem: number; freeMem: number; memPercent: number;
  };
  disk: { total: number; used: number; free: number; percent: number };
  network: { rx: number; tx: number };
  services: { db: boolean; nginx: boolean };
  platform: string;
  arch: string;
  nodeVersion: string;
  processUptime: number;
  activeRooms: { code: string; users: number; videoUrl: string | null }[];
  activeUsers: number;
}

interface Room {
  id: string; code: string; videoUrl: string | null; views: number;
  totalMessages: number; uploadCount: number; queueCount: number;
  createdAt: string; lastActive: string;
}

interface Message {
  id: string; roomId: string; author: string; text: string;
  createdAt: string; roomCode?: string;
}

interface VideoHistoryItem {
  id: number; room_id: string; url: string; changed_by: string;
  created_at: string; roomCode?: string;
}

type Tab = "stats" | "rooms" | "history" | "videoHistory" | "watchTime" | "system" | "stickers";

export function Admin() {
  const [auth, setAuth] = useState<string | null>(() => localStorage.getItem("wt_admin_auth"));
  const [tab, setTab] = useState<Tab>("stats");
  const [stats, setStats] = useState<Stats | null>(null);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomsTotal, setRoomsTotal] = useState(0);
  const [roomsPage, setRoomsPage] = useState(1);
  const [roomsSort, setRoomsSort] = useState("created_at");
  const [roomsOrder, setRoomsOrder] = useState("desc");
  const [search, setSearch] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesTotal, setMessagesTotal] = useState(0);
  const [messagesPage, setMessagesPage] = useState(1);
  const [msgSearch, setMsgSearch] = useState("");
  const [msgAuthor, setMsgAuthor] = useState("");
  const [filterRoom, setFilterRoom] = useState("");
  const [videoHistory, setVideoHistory] = useState<VideoHistoryItem[]>([]);
  const [vhTotal, setVhTotal] = useState(0);
  const [vhPage, setVhPage] = useState(1);
  const [selectedRoom, setSelectedRoom] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [loginUser, setLoginUser] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [showReset, setShowReset] = useState(false);
  const [resetConfirm, setResetConfirm] = useState("");
  const [resetWhat, setResetWhat] = useState("all");
  const [toast, setToast] = useState("");
  const [watchTimeGroup, setWatchTimeGroup] = useState<"video" | "user" | "detail">("video");
  const [watchTimeData, setWatchTimeData] = useState<any>(null);
  const [stickerPacks, setStickerPacks] = useState<{ name: string; title: string; stickerCount: number }[]>([]);
  const [stickerBotOk, setStickerBotOk] = useState(false);
  const [newPackName, setNewPackName] = useState("");

  const headers: Record<string, string> = auth ? { Authorization: `Basic ${auth}` } : {};

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  const doLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const encoded = btoa(`${loginUser}:${loginPass}`);
    localStorage.setItem("wt_admin_auth", encoded);
    setAuth(encoded);
  };

  const logout = () => { localStorage.removeItem("wt_admin_auth"); setAuth(null); };

  const fetchStats = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/stats", { headers });
      if (r.ok) setStats(await r.json());
      else if (r.status === 401) logout();
      else console.error("Stats fetch failed:", r.status, await r.text().catch(() => ""));
    } catch (e) { console.error("Stats fetch error:", e); }
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
      const r = await fetch(`/api/admin/rooms?page=${roomsPage}&limit=30&search=${search}&sort=${roomsSort}&order=${roomsOrder}`, { headers });
      if (r.ok) { const d = await r.json(); setRooms(d.rooms); setRoomsTotal(d.total); }
      else if (r.status === 401) logout();
    } catch {}
    setLoading(false);
  }, [auth, roomsPage, search, roomsSort, roomsOrder]);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(messagesPage), limit: "100" });
      if (filterRoom) params.set("roomId", filterRoom);
      if (msgAuthor) params.set("author", msgAuthor);
      if (msgSearch) params.set("search", msgSearch);
      const r = await fetch(`/api/admin/history?${params}`, { headers });
      if (r.ok) { const d = await r.json(); setMessages(d.messages); setMessagesTotal(d.total); }
      else if (r.status === 401) logout();
    } catch {}
    setLoading(false);
  }, [auth, messagesPage, filterRoom, msgAuthor, msgSearch]);

  const fetchWatchTime = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ groupBy: watchTimeGroup });
      if (filterRoom) params.set("roomId", filterRoom);
      const r = await fetch(`/api/admin/watch-time?${params}`, { headers });
      if (r.ok) setWatchTimeData(await r.json());
      else if (r.status === 401) logout();
    } catch {}
    setLoading(false);
  }, [auth, watchTimeGroup, filterRoom]);

  const fetchVideoHistory = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(vhPage), limit: "50" });
      if (filterRoom) params.set("roomId", filterRoom);
      const r = await fetch(`/api/admin/video-history?${params}`, { headers });
      if (r.ok) { const d = await r.json(); setVideoHistory(d.history); setVhTotal(d.total); }
      else if (r.status === 401) logout();
    } catch {}
    setLoading(false);
  }, [auth, vhPage, filterRoom]);

  const fetchRoomDetail = async (code: string) => {
    try {
      const r = await fetch(`/api/admin/rooms/${code}`, { headers });
      if (r.ok) setSelectedRoom(await r.json());
    } catch {}
  };

  const fetchStickerPacks = useCallback(async () => {
    try {
      const r = await fetch("/api/stickers/admin/list", { headers });
      if (r.ok) {
        const d = await r.json();
        setStickerPacks(d.packs || []);
        setStickerBotOk(d.botTokenConfigured);
      }
    } catch {}
  }, [auth]);

  const clearStickerCache = async () => {
    try {
      const r = await fetch("/api/stickers/admin/clear", { ...headers, method: "POST" });
      if (r.ok) { showToast("Кеш стикеров очищен"); fetchStickerPacks(); }
    } catch {}
  };

  const loadStickerPack = async () => {
    if (!newPackName.trim()) return;
    try {
      const r = await fetch("/api/stickers/admin/load", {
        ...headers,
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ packName: newPackName.trim() }),
      });
      if (r.ok) { showToast("Пак загружен"); setNewPackName(""); fetchStickerPacks(); }
      else { const d = await r.json(); showToast(d.error || "Ошибка"); }
    } catch {}
  };

  const removeStickerPack = async (packName: string) => {
    if (!confirm(`Удалить пак ${packName} из кеша?`)) return;
    try {
      const r = await fetch(`/api/stickers/admin/${encodeURIComponent(packName)}`, { ...headers, method: "DELETE" });
      if (r.ok) { showToast("Пак удалён"); fetchStickerPacks(); }
    } catch {}
  };

  const deleteRoom = async (code: string) => {
    if (!confirm(`Удалить комнату ${code}? Все сообщения и файлы будут удалены.`)) return;
    try {
      await fetch(`/api/admin/rooms/${code}`, { ...headers, method: "DELETE" });
      showToast(`Комната ${code} удалена`);
      fetchRooms();
    } catch {}
  };

  const closeRoom = async (code: string) => {
    if (!confirm(`Закрыть комнату ${code}? Все пользователи будут отключены.`)) return;
    try {
      const r = await fetch(`/api/admin/rooms/${code}/close`, { ...headers, method: "POST" });
      if (r.ok) showToast(`Комната ${code} закрыта`);
      else showToast("Ошибка");
    } catch {}
  };

  const doReset = async () => {
    if (resetConfirm !== "RESET") return;
    try {
      const r = await fetch("/api/admin/reset", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json", "X-Confirm-Reset": "RESET" },
        body: JSON.stringify({ what: resetWhat }),
      });
      if (r.ok) { showToast("Статистика сброшена"); setShowReset(false); setResetConfirm(""); fetchStats(); }
    } catch {}
  };

  useEffect(() => {
    if (!auth) return;
    if (tab === "stats") fetchStats();
    if (tab === "rooms") fetchRooms();
    if (tab === "history") fetchHistory();
    if (tab === "videoHistory") fetchVideoHistory();
    if (tab === "watchTime") fetchWatchTime();
    if (tab === "stickers") fetchStickerPacks();
    if (tab === "system") fetchSystem();
  }, [auth, tab]);

  useEffect(() => {
    if (!auth || tab !== "rooms") return;
    fetchRooms();
    const iv = setInterval(fetchRooms, 10000);
    return () => clearInterval(iv);
  }, [auth, tab, fetchRooms]);

  useEffect(() => {
    if (!auth || tab !== "rooms") return;
    fetchRooms();
  }, [roomsPage, search, roomsSort, roomsOrder]);

  useEffect(() => {
    if (!auth || tab !== "history") return;
    fetchHistory();
  }, [messagesPage, filterRoom, msgAuthor, msgSearch]);

  useEffect(() => {
    if (!auth || tab !== "videoHistory") return;
    fetchVideoHistory();
  }, [vhPage, filterRoom]);

  useEffect(() => {
    if (!auth || tab !== "watchTime") return;
    fetchWatchTime();
  }, [watchTimeGroup, filterRoom]);

  useEffect(() => {
    if (!auth || tab !== "system") return;
    const iv = setInterval(fetchSystem, 3000);
    return () => clearInterval(iv);
  }, [auth, tab, fetchSystem]);

  if (!auth) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="bg-gray-900 rounded-2xl p-6 w-full max-w-sm border border-gray-800">
          <h1 className="text-2xl font-bold text-white mb-6 text-center">Админ-панель</h1>
          <form onSubmit={doLogin} className="space-y-3">
            <input type="text" placeholder="Логин" value={loginUser} onChange={(e) => setLoginUser(e.target.value)}
              className="w-full bg-gray-800 text-white rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500" autoFocus />
            <input type="password" placeholder="Пароль" value={loginPass} onChange={(e) => setLoginPass(e.target.value)}
              className="w-full bg-gray-800 text-white rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <button type="submit" className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 transition-colors">Войти</button>
          </form>
        </div>
      </div>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "stats", label: "📊 Обзор" },
    { id: "rooms", label: "🏠 Комнаты" },
    { id: "history", label: "💬 Сообщения" },
    { id: "videoHistory", label: "🎬 Видео" },
    { id: "watchTime", label: "⏱ Время" },
    { id: "stickers", label: "🎨 Стикеры" },
    { id: "system", label: "🖥 Сервер" },
  ];

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg animate-pulse">{toast}</div>
      )}

      <header className="bg-gray-900 border-b border-gray-800 p-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <h1 className="text-lg font-bold">Админ-панель</h1>
          <div className="flex items-center gap-3">
            <a href="/" className="text-gray-400 hover:text-white text-sm">← На сайт</a>
            <button onClick={() => setShowReset(true)} className="text-red-400 hover:text-red-300 text-sm border border-red-800 px-2 py-1 rounded">Сброс</button>
            <button onClick={logout} className="text-gray-400 hover:text-white text-sm">Выйти</button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto p-3 sm:p-4">
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors ${
                tab === t.id ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"
              }`}>{t.label}</button>
          ))}
        </div>

        {loading && <p className="text-gray-400 text-sm mb-4">Загрузка...</p>}

        {/* === STATS === */}
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
                { label: "Размер", value: fmtSize(stats.totalSize), color: "text-orange-400" },
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
                <h3 className="text-white font-semibold mb-3">Топ комнат</h3>
                <div className="space-y-2">
                  {stats.topRooms.map((r, i) => (
                    <div key={r.code} className="flex items-center gap-3 text-sm">
                      <span className="text-gray-500 w-6">#{i + 1}</span>
                      <span className="font-mono text-blue-400">{r.code}</span>
                      <span className="text-gray-400">{r.views} views</span>
                      <span className="text-gray-400">{r.totalMessages} msgs</span>
                      <span className="text-gray-600 text-xs ml-auto">{new Date(r.createdAt).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* === ROOMS === */}
        {tab === "rooms" && (
          <div className="space-y-3">
            <div className="flex gap-2 flex-wrap">
              <input type="text" placeholder="Поиск..." value={search} onChange={(e) => { setSearch(e.target.value); setRoomsPage(1); }}
                className="bg-gray-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 flex-1 min-w-[120px] max-w-xs" />
              <select value={roomsSort} onChange={(e) => setRoomsSort(e.target.value)}
                className="bg-gray-800 text-white rounded-lg px-3 py-2 text-sm">
                <option value="created_at">Дата создания</option>
                <option value="views">Просмотры</option>
                <option value="total_messages">Сообщения</option>
                <option value="last_active">Активность</option>
              </select>
              <button onClick={() => setRoomsOrder(roomsOrder === "desc" ? "asc" : "desc")}
                className="bg-gray-700 text-white px-3 py-2 rounded-lg text-sm">{roomsOrder === "desc" ? "↓" : "↑"}</button>
              <button onClick={fetchRooms} className="bg-gray-700 text-white px-3 py-2 rounded-lg text-sm">🔄</button>
            </div>
            <p className="text-gray-500 text-xs">Всего: {roomsTotal}</p>
            <div className="space-y-2">
              {rooms.map((r) => (
                <div key={r.id} className="bg-gray-900 rounded-xl p-3 border border-gray-800 hover:border-gray-600 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 cursor-pointer flex-1 min-w-0" onClick={() => fetchRoomDetail(r.code)}>
                      <span className="font-mono text-blue-400 font-bold">{r.code}</span>
                      <span className="text-gray-400 text-xs">{r.views} views</span>
                      <span className="text-gray-400 text-xs">{r.totalMessages} msgs</span>
                      <span className="text-gray-400 text-xs">{r.uploadCount} files</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-gray-600 text-xs">{new Date(r.createdAt).toLocaleDateString()}</span>
                      <button onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(r.code); showToast("Скопировано"); }}
                        className="text-gray-500 hover:text-white text-xs px-1">📋</button>
                      <button onClick={(e) => { e.stopPropagation(); closeRoom(r.code); }}
                        className="text-yellow-500 hover:text-yellow-400 text-xs px-1" title="Закрыть комнату">⚡</button>
                      <button onClick={(e) => { e.stopPropagation(); deleteRoom(r.code); }}
                        className="text-red-500 hover:text-red-400 text-xs px-1">🗑</button>
                    </div>
                  </div>
                  {r.videoUrl && <p className="text-gray-500 text-xs mt-1 truncate">{r.videoUrl}</p>}
                  <p className="text-gray-600 text-xs mt-1">Активна: {new Date(r.lastActive).toLocaleString()}</p>
                </div>
              ))}
            </div>
            <Pagination page={roomsPage} total={roomsTotal} limit={30} onChange={setRoomsPage} />

            {selectedRoom && (
              <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setSelectedRoom(null)}>
                <div className="bg-gray-900 rounded-2xl p-4 w-full max-w-lg max-h-[85vh] overflow-y-auto border border-gray-700" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-white font-bold text-lg font-mono">{selectedRoom.code}</h3>
                    <button onClick={() => setSelectedRoom(null)} className="text-gray-400 hover:text-white text-xl">✕</button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mb-4 text-sm">
                    <div className="bg-gray-800 rounded-lg p-2">views: {selectedRoom.views}</div>
                    <div className="bg-gray-800 rounded-lg p-2">msgs: {selectedRoom.messages?.length || 0}</div>
                    <div className="bg-gray-800 rounded-lg p-2">files: {selectedRoom.uploads?.length || 0}</div>
                    <div className="bg-gray-800 rounded-lg p-2">queue: {selectedRoom.queue?.length || 0}</div>
                  </div>
                  {selectedRoom.videoHistory?.length > 0 && (
                    <div className="mb-4">
                      <h4 className="text-white font-semibold text-sm mb-2">История видео</h4>
                      {selectedRoom.videoHistory.map((vh: any) => (
                        <div key={vh.id} className="bg-gray-800 rounded-lg p-2 text-xs mb-1">
                          <span className="text-gray-300 truncate block">{vh.url}</span>
                          <span className="text-gray-500">{vh.changed_by} — {new Date(vh.created_at).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <h4 className="text-white font-semibold text-sm mb-2">Сообщения</h4>
                  <div className="space-y-1 max-h-60 overflow-y-auto">
                    {(selectedRoom.messages || []).slice(0, 100).map((m: any) => (
                      <div key={m.id} className="text-xs bg-gray-800 rounded-lg p-2">
                        <span className="text-blue-400 font-semibold">{m.author}</span>
                        <span className="text-gray-600 ml-2">{new Date(m.created_at).toLocaleString()}</span>
                        <p className="text-gray-300 mt-0.5">{m.text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* === MESSAGES === */}
        {tab === "history" && (
          <div className="space-y-3">
            <div className="flex gap-2 flex-wrap">
              <input type="text" placeholder="Текст..." value={msgSearch} onChange={(e) => { setMsgSearch(e.target.value); setMessagesPage(1); }}
                className="bg-gray-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 flex-1 min-w-[100px] max-w-xs" />
              <input type="text" placeholder="Автор..." value={msgAuthor} onChange={(e) => { setMsgAuthor(e.target.value); setMessagesPage(1); }}
                className="bg-gray-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-32" />
              <input type="text" placeholder="Room ID..." value={filterRoom} onChange={(e) => { setFilterRoom(e.target.value); setMessagesPage(1); }}
                className="bg-gray-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-32" />
              <button onClick={fetchHistory} className="bg-gray-700 text-white px-3 py-2 rounded-lg text-sm">🔄</button>
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
            <Pagination page={messagesPage} total={messagesTotal} limit={100} onChange={setMessagesPage} />
          </div>
        )}

        {/* === VIDEO HISTORY === */}
        {tab === "videoHistory" && (
          <div className="space-y-3">
            <div className="flex gap-2 flex-wrap">
              <input type="text" placeholder="Room ID..." value={filterRoom} onChange={(e) => { setFilterRoom(e.target.value); setVhPage(1); }}
                className="bg-gray-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-40" />
              <button onClick={fetchVideoHistory} className="bg-gray-700 text-white px-3 py-2 rounded-lg text-sm">🔄</button>
            </div>
            <p className="text-gray-500 text-xs">Всего: {vhTotal}</p>
            <div className="space-y-1">
              {videoHistory.map((vh) => (
                <div key={vh.id} className="bg-gray-900 rounded-lg p-3 border border-gray-800 text-sm">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-green-400 font-mono text-xs">{vh.roomCode || vh.room_id}</span>
                    <span className="text-gray-400 text-xs">{vh.changed_by}</span>
                    <span className="text-gray-600 text-xs ml-auto">{new Date(vh.created_at).toLocaleString()}</span>
                  </div>
                  <p className="text-gray-300 text-xs truncate">{vh.url}</p>
                </div>
              ))}
              {videoHistory.length === 0 && <p className="text-gray-600 text-sm">Нет записей</p>}
            </div>
            <Pagination page={vhPage} total={vhTotal} limit={50} onChange={setVhPage} />
          </div>
        )}

        {/* === WATCH TIME === */}
        {tab === "watchTime" && (
          <div className="space-y-4">
            <div className="flex gap-2 flex-wrap">
              {(["video", "user", "detail"] as const).map((g) => (
                <button key={g} onClick={() => { setWatchTimeGroup(g); }}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    watchTimeGroup === g ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                  }`}>
                  {g === "video" ? "По видео" : g === "user" ? "По пользователям" : "Детали"}
                </button>
              ))}
              <input type="text" placeholder="Room ID..." value={filterRoom}
                onChange={(e) => setFilterRoom(e.target.value)}
                className="bg-gray-800 text-white rounded-lg px-3 py-2 text-sm w-32" />
            </div>

            {watchTimeData && watchTimeGroup === "video" && watchTimeData.videos && (
              <div className="space-y-2">
                <h3 className="text-white font-semibold">Время просмотра по видео</h3>
                {watchTimeData.videos.length === 0 && <p className="text-gray-600 text-sm">Нет данных</p>}
                {watchTimeData.videos.map((v: any, i: number) => (
                  <div key={i} className="bg-gray-900 rounded-lg p-3 border border-gray-800">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-gray-400 text-xs">#{i + 1}</span>
                      <span className="text-green-400 font-bold">{fmtDuration(v.totalSeconds)}</span>
                    </div>
                    <p className="text-gray-300 text-xs truncate mb-1">{v.videoUrl}</p>
                    <div className="flex gap-3 text-xs text-gray-500">
                      <span>{v.uniqueUsers} юзеров</span>
                      <span>{v.sessions} сессий</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {watchTimeData && watchTimeGroup === "user" && watchTimeData.users && (
              <div className="space-y-2">
                <h3 className="text-white font-semibold">Время просмотра по пользователям</h3>
                {watchTimeData.users.length === 0 && <p className="text-gray-600 text-sm">Нет данных</p>}
                {watchTimeData.users.map((u: any, i: number) => (
                  <div key={i} className="bg-gray-900 rounded-lg p-3 border border-gray-800 flex items-center justify-between">
                    <div>
                      <span className="text-blue-400 font-semibold">{u.username}</span>
                      <span className="text-gray-500 text-xs ml-2">{u.videos} видео, {u.sessions} сессий</span>
                    </div>
                    <span className="text-green-400 font-bold">{fmtDuration(u.totalSeconds)}</span>
                  </div>
                ))}
              </div>
            )}

            {watchTimeData && watchTimeGroup === "detail" && watchTimeData.sessions && (
              <div className="space-y-2">
                <p className="text-gray-500 text-xs">Всего: {fmtDuration(watchTimeData.totalSeconds)}</p>
                {watchTimeData.sessions.length === 0 && <p className="text-gray-600 text-sm">Нет данных</p>}
                {watchTimeData.sessions.map((s: any) => (
                  <div key={s.id} className="bg-gray-900 rounded-lg p-2 border border-gray-800 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-blue-400">{s.username}</span>
                      <span className="text-green-400 font-bold">{fmtDuration(s.watched_seconds)}</span>
                      <span className="text-gray-500 font-mono text-xs">{s.roomCode || s.room_id}</span>
                      <span className="text-gray-600 text-xs ml-auto">{new Date(s.ended_at).toLocaleString()}</span>
                    </div>
                    <p className="text-gray-500 text-xs truncate mt-0.5">{s.video_url}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* === STICKERS === */}
        {tab === "stickers" && (
          <div className="space-y-4">
            <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-white font-semibold">Telegram Sticker Packs</h3>
                <span className={stickerBotOk ? "text-green-400 text-xs" : "text-red-400 text-xs"}>
                  Bot: {stickerBotOk ? "✓ Настроен" : "✗ Не настроен"}
                </span>
              </div>

              <div className="flex gap-2 mb-4">
                <input
                  type="text"
                  value={newPackName}
                  onChange={(e) => setNewPackName(e.target.value)}
                  placeholder="Имя пака или ссылка t.me/addstickers/..."
                  className="flex-1 bg-gray-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={loadStickerPack}
                  disabled={!newPackName.trim() || !stickerBotOk}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Загрузить
                </button>
                <button
                  onClick={clearStickerCache}
                  className="bg-gray-700 text-white px-4 py-2 rounded-lg text-sm hover:bg-gray-600"
                >
                  Очистить кеш
                </button>
              </div>

              {stickerPacks.length === 0 ? (
                <p className="text-gray-500 text-sm">Нет загруженных паков в кеше</p>
              ) : (
                <div className="space-y-2">
                  {stickerPacks.map((pack) => (
                    <div key={pack.name} className="bg-gray-800 rounded-lg p-3 flex items-center justify-between">
                      <div>
                        <span className="text-white font-semibold text-sm">{pack.title || pack.name}</span>
                        <span className="text-gray-400 text-xs ml-2">{pack.stickerCount} стикеров</span>
                        <p className="text-gray-500 text-xs font-mono mt-0.5">{pack.name}</p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => { setNewPackName(pack.name); }}
                          className="text-gray-400 hover:text-white text-xs px-2"
                        >
                          📋
                        </button>
                        <button
                          onClick={() => removeStickerPack(pack.name)}
                          className="text-red-400 hover:text-red-300 text-xs px-2"
                        >
                          🗑
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* === SYSTEM === */}
        {tab === "system" && systemInfo && (
          <div className="space-y-4">
            {systemInfo.activeRooms.length > 0 && (
              <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
                <h3 className="text-white font-semibold mb-3">Активные комнаты ({systemInfo.activeUsers} юзеров)</h3>
                <div className="space-y-2">
                  {systemInfo.activeRooms.map((r) => (
                    <div key={r.code} className="flex items-center gap-3 text-sm bg-gray-800 rounded-lg p-2">
                      <span className="font-mono text-blue-400 font-bold">{r.code}</span>
                      <span className="text-green-400">{r.users} online</span>
                      {r.videoUrl && <span className="text-gray-500 text-xs truncate flex-1">{r.videoUrl}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
              <h3 className="text-white font-semibold mb-3">Система</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="bg-gray-800 rounded-lg p-2"><span className="text-gray-400">Хост:</span> <span className="text-white">{systemInfo.system.hostname}</span></div>
                <div className="bg-gray-800 rounded-lg p-2"><span className="text-gray-400">Ядро:</span> <span className="text-white">{systemInfo.system.kernel}</span></div>
                <div className="bg-gray-800 rounded-lg p-2 col-span-2"><span className="text-gray-400">CPU:</span> <span className="text-white">{systemInfo.system.cpuModel} ({systemInfo.system.cpuCores} cores)</span></div>
              </div>
            </div>

            <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-white font-semibold">CPU</h3>
                <span className="text-green-400 text-xs animate-pulse">● Live</span>
              </div>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-400">Load Average (1/5/15 мин)</span>
                    <span className={`font-bold ${systemInfo.system.loadAvg[0] > systemInfo.system.cpuCores * 0.8 ? "text-red-400" : systemInfo.system.loadAvg[0] > systemInfo.system.cpuCores * 0.5 ? "text-yellow-400" : "text-green-400"}`}>
                      {systemInfo.system.loadAvg.join(" / ")}
                    </span>
                  </div>
                  <div className="bg-gray-800 rounded-full h-2.5 overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-500 ${systemInfo.system.loadAvg[0] > systemInfo.system.cpuCores * 0.8 ? "bg-red-500" : systemInfo.system.loadAvg[0] > systemInfo.system.cpuCores * 0.5 ? "bg-yellow-500" : "bg-green-500"}`}
                      style={{ width: `${Math.min(100, (systemInfo.system.loadAvg[0] / systemInfo.system.cpuCores) * 100)}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-400">CPU Node.js (процесс)</span>
                    <span className={systemInfo.process.cpuPercent > 50 ? "text-red-400" : systemInfo.process.cpuPercent > 20 ? "text-yellow-400" : "text-green-400"}>
                      {systemInfo.process.cpuPercent}%
                    </span>
                  </div>
                  <div className="bg-gray-800 rounded-full h-2.5 overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-500 ${systemInfo.process.cpuPercent > 50 ? "bg-red-500" : systemInfo.process.cpuPercent > 20 ? "bg-yellow-500" : "bg-green-500"}`}
                      style={{ width: `${Math.min(100, systemInfo.process.cpuPercent)}%` }} />
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
              <h3 className="text-white font-semibold mb-3">RAM</h3>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-400">Системная</span>
                    <span className="text-white">{fmtSize(systemInfo.system.usedMem)} / {fmtSize(systemInfo.system.totalMem)} ({systemInfo.system.memPercent}%)</span>
                  </div>
                  <div className="bg-gray-800 rounded-full h-2.5 overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-500 ${systemInfo.system.memPercent > 85 ? "bg-red-500" : systemInfo.system.memPercent > 60 ? "bg-yellow-500" : "bg-green-500"}`}
                      style={{ width: `${Math.min(100, systemInfo.system.memPercent)}%` }} />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-gray-800 rounded-lg p-2"><p className="text-gray-400 text-xs">RSS (процесс)</p><p className="text-white font-bold text-sm">{fmtSize(systemInfo.process.rss)}</p></div>
                  <div className="bg-gray-800 rounded-lg p-2"><p className="text-gray-400 text-xs">Heap</p><p className="text-orange-400 font-bold text-sm">{fmtSize(systemInfo.process.heapUsed)} / {fmtSize(systemInfo.process.heapTotal)}</p></div>
                  <div className="bg-gray-800 rounded-lg p-2"><p className="text-gray-400 text-xs">External</p><p className="text-cyan-400 font-bold text-sm">{fmtSize(systemInfo.process.external)}</p></div>
                </div>
              </div>
            </div>

            <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
              <h3 className="text-white font-semibold mb-3">Диск</h3>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-400">/</span>
                  <span className="text-white">{fmtSize(systemInfo.disk.used)} / {fmtSize(systemInfo.disk.total)} ({systemInfo.disk.percent}%)</span>
                </div>
                <div className="bg-gray-800 rounded-full h-2.5 overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-500 ${systemInfo.disk.percent > 90 ? "bg-red-500" : systemInfo.disk.percent > 70 ? "bg-yellow-500" : "bg-blue-500"}`}
                    style={{ width: `${Math.min(100, systemInfo.disk.percent)}%` }} />
                </div>
              </div>
            </div>

            <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
              <h3 className="text-white font-semibold mb-3">Сеть</h3>
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="bg-gray-800 rounded-lg p-3">
                  <p className="text-gray-400 text-xs mb-1">↓ Загрузка (RX)</p>
                  <p className="text-green-400 font-bold text-lg">{fmtSize(systemInfo.network.rx)}</p>
                </div>
                <div className="bg-gray-800 rounded-lg p-3">
                  <p className="text-gray-400 text-xs mb-1">↑ Отдача (TX)</p>
                  <p className="text-blue-400 font-bold text-lg">{fmtSize(systemInfo.network.tx)}</p>
                </div>
              </div>
            </div>

            <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
              <h3 className="text-white font-semibold mb-3">Сервисы</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="bg-gray-800 rounded-lg p-2 flex items-center gap-2">
                  <span className={systemInfo.services.db ? "text-green-400" : "text-red-400"}>{systemInfo.services.db ? "●" : "●"}</span>
                  <span className="text-gray-400">PostgreSQL</span>
                </div>
                <div className="bg-gray-800 rounded-lg p-2 flex items-center gap-2">
                  <span className={systemInfo.services.nginx ? "text-green-400" : "text-red-400"}>{systemInfo.services.nginx ? "●" : "●"}</span>
                  <span className="text-gray-400">Nginx</span>
                </div>
              </div>
            </div>

            <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
              <h3 className="text-white font-semibold mb-3">Процесс</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="bg-gray-800 rounded-lg p-2"><span className="text-gray-400">Платформа:</span> <span className="text-white">{systemInfo.platform} ({systemInfo.arch})</span></div>
                <div className="bg-gray-800 rounded-lg p-2"><span className="text-gray-400">Node:</span> <span className="text-white">{systemInfo.nodeVersion}</span></div>
                <div className="bg-gray-800 rounded-lg p-2"><span className="text-gray-400">Аптайм:</span> <span className="text-white">{fmtUptime(systemInfo.processUptime)}</span></div>
                <div className="bg-gray-800 rounded-lg p-2"><span className="text-gray-400">Онлайн:</span> <span className="text-green-400">{systemInfo.activeUsers} юзеров</span></div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Reset Modal */}
      {showReset && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => { setShowReset(false); setResetConfirm(""); }}>
          <div className="bg-gray-900 rounded-2xl p-6 w-full max-w-md border border-red-800" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-red-400 font-bold text-lg mb-2">Сброс статистики</h3>
            <p className="text-gray-400 text-sm mb-4">Это действие необратимо. Выберите что сбросить:</p>
            <div className="space-y-2 mb-4">
              {[
                { value: "all", label: "Всё" },
                { value: "stats", label: "Только счётчики (views, messages)" },
                { value: "messages", label: "Все сообщения" },
                { value: "uploads", label: "Все загрузки" },
                { value: "queue", label: "Все очереди" },
                { value: "video_history", label: "Историю видео" },
                { value: "watch_sessions", label: "Время просмотра" },
              ].map((opt) => (
                <label key={opt.value} className="flex items-center gap-2 cursor-pointer text-sm">
                  <input type="radio" name="resetWhat" value={opt.value} checked={resetWhat === opt.value}
                    onChange={(e) => setResetWhat(e.target.value)}
                    className="text-red-600" />
                  <span className="text-gray-300">{opt.label}</span>
                </label>
              ))}
            </div>
            <p className="text-gray-400 text-xs mb-2">Введите <span className="text-red-400 font-bold">RESET</span> для подтверждения:</p>
            <input type="text" value={resetConfirm} onChange={(e) => setResetConfirm(e.target.value)} placeholder="RESET"
              className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-red-500" />
            <div className="flex gap-2">
              <button onClick={() => { setShowReset(false); setResetConfirm(""); }}
                className="flex-1 bg-gray-700 text-white py-2 rounded-lg text-sm">Отмена</button>
              <button onClick={doReset} disabled={resetConfirm !== "RESET"}
                className="flex-1 bg-red-600 text-white py-2 rounded-lg text-sm disabled:opacity-30 disabled:cursor-not-allowed">Сбросить</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Pagination({ page, total, limit, onChange }: { page: number; total: number; limit: number; onChange: (p: number) => void }) {
  const pages = Math.ceil(total / limit);
  if (pages <= 1) return null;
  return (
    <div className="flex gap-2 justify-center">
      <button onClick={() => onChange(Math.max(1, page - 1))} disabled={page === 1}
        className="bg-gray-800 text-white px-3 py-1 rounded text-sm disabled:opacity-50">←</button>
      <span className="text-gray-400 text-sm py-1">{page} / {pages}</span>
      <button onClick={() => onChange(Math.min(pages, page + 1))} disabled={page >= pages}
        className="bg-gray-800 text-white px-3 py-1 rounded text-sm disabled:opacity-50">→</button>
    </div>
  );
}

function fmtSize(bytes: number): string {
  if (!bytes || bytes < 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(2)} GB`;
}

function fmtUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function fmtDuration(seconds: number): string {
  if (!seconds) return "0с";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}ч ${m}м ${s}с`;
  if (m > 0) return `${m}м ${s}с`;
  return `${s}с`;
}
