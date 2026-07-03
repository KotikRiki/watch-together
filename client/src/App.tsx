import { useEffect, useState } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "./hooks/useTheme";
import { CreateRoom } from "./components/CreateRoom";
import { Room } from "./components/Room";
import { Admin } from "./components/Admin";

function PWAUpdatePrompt() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [updateSW, setUpdateSW] = useState<((reload?: boolean) => Promise<void>) | null>(null);

  useEffect(() => {
    let unreg: (() => void) | undefined;
    import("virtual:pwa-register").then(({ registerSW }) => {
      const update = registerSW({
        onNeedRefresh() {
          setNeedRefresh(true);
          setUpdateSW(() => update);
        },
        onOfflineReady() {
          console.log("App ready to work offline");
        },
      });
      unreg = () => update();
    });
    return () => { unreg?.(); };
  }, []);

  if (!needRefresh) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] bg-blue-600 text-white px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 text-sm font-semibold animate-[slideUp_0.3s_ease-out]">
      <span>🔄 Доступна новая версия</span>
      <button
        onClick={() => updateSW?.(true)}
        className="bg-white text-blue-600 px-3 py-1 rounded-lg text-xs font-bold hover:bg-blue-50 transition-colors"
      >
        Обновить
      </button>
      <button
        onClick={() => setNeedRefresh(false)}
        className="text-white/60 hover:text-white text-xs"
      >
        ✕
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
