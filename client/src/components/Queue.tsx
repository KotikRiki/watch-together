import { useState } from "react";

interface QueueItem {
  id: string;
  url: string;
  title: string | null;
  order: number;
}

interface QueueProps {
  queue: QueueItem[];
  onAddVideo: (url: string, title?: string) => void;
  onNext: () => void;
}

export function Queue({ queue, onAddVideo, onNext }: QueueProps) {
  const [newUrl, setNewUrl] = useState("");

  const handleAdd = () => {
    if (newUrl.trim()) {
      onAddVideo(newUrl.trim());
      setNewUrl("");
    }
  };

  return (
    <div className="bg-gray-900 rounded-lg p-4">
      <h3 className="text-white font-semibold mb-3">Очередь видео</h3>

      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={newUrl}
          onChange={(e) => setNewUrl(e.target.value)}
          placeholder="Вставьте ссылку на видео..."
          className="flex-1 bg-gray-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={handleAdd}
          className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700"
        >
          Добавить
        </button>
      </div>

      <div className="space-y-2 mb-4">
        {queue.length === 0 ? (
          <p className="text-gray-500 text-sm">Очередь пуста</p>
        ) : (
          queue.map((item, index) => (
            <div
              key={item.id}
              className="flex items-center gap-2 bg-gray-800 rounded-lg p-2"
            >
              <span className="text-gray-500 text-sm">{index + 1}.</span>
              <span className="text-white text-sm flex-1 truncate">
                {item.title || item.url}
              </span>
            </div>
          ))
        )}
      </div>

      {queue.length > 0 && (
        <button
          onClick={onNext}
          className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm hover:bg-blue-700"
        >
          Следующее видео
        </button>
      )}
    </div>
  );
}
