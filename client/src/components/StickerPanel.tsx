import { useState, useEffect } from "react";

interface Sticker {
  url: string;
  emoji: string;
  file_id: string;
  width: number;
  height: number;
  is_animated: boolean;
  is_video: boolean;
}

interface StickerPack {
  name: string;
  title: string;
  stickers: Sticker[];
}

interface StickerPanelProps {
  onSendSticker: (url: string) => void;
  onClose: () => void;
}

const STICKER_PACKS = [
  { name: "by_adel_strimy_ot_ksyuni_chb_archiveADelka_fe0d_by_offstikbot", label: "Адель" },
];

export function StickerPanel({ onSendSticker, onClose }: StickerPanelProps) {
  const [packs, setPacks] = useState<Record<string, StickerPack>>({});
  const [activePack, setActivePack] = useState(STICKER_PACKS[0].name);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchPack = async (packName: string) => {
      try {
        const r = await fetch(`/api/stickers/${packName}`);
        if (r.ok) {
          const data: StickerPack = await r.json();
          setPacks((prev) => ({ ...prev, [packName]: data }));
        } else {
          setError("Не удалось загрузить стикерпак");
        }
      } catch {
        setError("Ошибка загрузки стикеров");
      }
    };

    setLoading(true);
    Promise.all(STICKER_PACKS.map((p) => fetchPack(p.name))).then(() => setLoading(false));
  }, []);

  const currentPack = packs[activePack];

  return (
    <div className="bg-gray-900 border-t border-gray-700">
      {/* Pack tabs */}
      <div className="flex gap-1 p-2 border-b border-gray-700">
        {STICKER_PACKS.map((p) => (
          <button
            key={p.name}
            onClick={() => setActivePack(p.name)}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
              activePack === p.name
                ? "bg-blue-600 text-white"
                : "bg-gray-700 text-gray-300 hover:bg-gray-600"
            }`}
          >
            {p.label}
          </button>
        ))}
        <button
          onClick={onClose}
          className="ml-auto text-gray-400 hover:text-white text-xs px-2"
        >
          ✕
        </button>
      </div>

      {/* Stickers grid */}
      <div className="p-2 max-h-60 overflow-y-auto">
        {loading ? (
          <p className="text-gray-500 text-xs text-center py-4">Загрузка...</p>
        ) : error ? (
          <p className="text-red-400 text-xs text-center py-4">{error}</p>
        ) : currentPack?.stickers?.length ? (
          <div className="grid grid-cols-5 sm:grid-cols-8 gap-1">
            {currentPack.stickers.map((sticker) => (
              <button
                key={sticker.file_id}
                onClick={() => onSendSticker(sticker.url)}
                className="aspect-square rounded-lg overflow-hidden bg-gray-800 hover:bg-gray-700 active:scale-95 transition-all p-1"
              >
                {sticker.is_video || sticker.is_animated ? (
                  <video
                    src={sticker.url}
                    className="w-full h-full object-contain"
                    muted
                    playsInline
                    preload="metadata"
                  />
                ) : (
                  <img
                    src={sticker.url}
                    alt={sticker.emoji}
                    className="w-full h-full object-contain"
                    loading="lazy"
                  />
                )}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-xs text-center py-4">Нет стикеров</p>
        )}
      </div>
    </div>
  );
}
