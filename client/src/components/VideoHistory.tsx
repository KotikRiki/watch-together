import { useState, useEffect } from "react";

interface HistoryEntry {
  url: string;
  changed_by: string;
  created_at: string;
}

function extractTitle(url: string): string {
  if (url.includes("youtube.com") || url.includes("youtu.be")) {
    const m = url.match(/[?&]v=([^&]+)/) || url.match(/youtu\.be\/([^?]+)/);
    return m ? `YouTube #${m[1].slice(0, 6)}` : "YouTube";
  }
  if (url.includes("rutube.ru")) return "RuTube";
  if (url.includes("/uploads/")) {
    const parts = url.split("/");
    const file = parts[parts.length - 1];
    return decodeURIComponent(file).slice(0, 20);
  }
  return url.slice(0, 30);
}

export function VideoHistory({ code, apiUrl }: { code: string; apiUrl: string }) {
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !code) return;
    setLoading(true);
    fetch(`${apiUrl}/api/rooms/${code}/history`)
      .then(r => r.json())
      .then(data => { setHistory(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [open, code, apiUrl]);

  return (
    <div className="bg-[#0e0e16] rounded-xl border border-white/5">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 text-[12px] text-white/40 hover:text-white/60 transition-colors"
      >
        <span className="font-medium">История видео</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`transition-transform ${open ? "rotate-180" : ""}`}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div className="px-3 pb-2 max-h-40 overflow-y-auto">
          {loading && <p className="text-white/20 text-[11px]">Загрузка...</p>}
          {!loading && history.length === 0 && <p className="text-white/20 text-[11px]">Пусто</p>}
          {history.map((h, i) => (
            <div key={i} className="flex items-center gap-2 py-1 border-t border-white/5 first:border-0">
              <span className="w-1 h-1 rounded-full bg-white/10 shrink-0" />
              <span className="text-white/50 text-[11px] truncate flex-1" title={h.url}>{extractTitle(h.url)}</span>
              <span className="text-white/20 text-[10px] shrink-0">{h.changed_by?.slice(0, 8)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
