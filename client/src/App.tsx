import { useEffect, useRef, useState } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "./hooks/useTheme";
import { CreateRoom } from "./components/CreateRoom";
import { Room } from "./components/Room";
import { Admin } from "./components/Admin";

function PWAUpdatePrompt() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const updateRef = useRef<((reload?: boolean) => Promise<void>) | null>(null);

  useEffect(() => {
    import("virtual:pwa-register").then(({ registerSW }) => {
      updateRef.current = registerSW({
        onNeedRefresh() {
          setNeedRefresh(true);
        },
      });
    });
  }, []);

  if (!needRefresh) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] bg-[#12121a]/95 backdrop-blur-xl text-white px-4 py-3 rounded-2xl shadow-2xl shadow-black/50 flex items-center gap-3 text-sm font-medium border border-white/10">
      <span className="text-white/80">Доступна новая версия</span>
      <button
        onClick={() => updateRef.current?.(true)}
        className="bg-blue-600 text-white px-3 py-1 rounded-lg text-xs font-semibold hover:bg-blue-500 transition-colors active:scale-95"
      >
        Обновить
      </button>
      <button
        onClick={() => setNeedRefresh(false)}
        className="text-white/30 hover:text-white/60 transition-colors"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <PWAUpdatePrompt />
      <Router>
        <Routes>
          <Route path="/" element={<CreateRoom />} />
          <Route path="/room/:code" element={<Room />} />
          <Route path="/admin" element={<Admin />} />
        </Routes>
      </Router>
    </ThemeProvider>
  );
}

export default App;
