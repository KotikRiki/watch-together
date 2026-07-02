import { useState, useEffect, useRef } from "react";
import { StickerPanel } from "./StickerPanel";

interface Message {
  id: string;
  author: string;
  text: string;
  createdAt: string;
}

interface ChatProps {
  messages: Message[];
  onSendMessage: (text: string) => void;
  onReaction: (emoji: string) => void;
  username: string;
}

const EMOJI_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🔥", "🎉", "👀", "💯", "😱", "🤣", "😍", "🥳", "😎", "🤔", "💀"];

export function Chat({ messages, onSendMessage, onReaction, username }: ChatProps) {
  const [input, setInput] = useState("");
  const [showStickers, setShowStickers] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (input.trim()) {
      onSendMessage(input.trim());
      setInput("");
    }
  };

  const handleEmoji = (emoji: string, e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onReaction(emoji);
  };

  const handleSendSticker = (url: string) => {
    onSendMessage(`[sticker]${url}[/sticker]`);
    setShowStickers(false);
  };

  return (
    <div className="flex flex-col h-full bg-gray-900 rounded-lg">
      <div className="p-3 border-b border-gray-700">
        <h3 className="text-white font-semibold text-sm">Чат</h3>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
        {messages.length === 0 && (
          <p className="text-gray-600 text-xs text-center mt-4">Пока нет сообщений</p>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${
              msg.author === username ? "items-end" : "items-start"
            }`}
          >
            <span className="text-xs text-gray-500 mb-0.5">{msg.author}</span>
            {msg.text.startsWith("[sticker]") && msg.text.endsWith("[/sticker]") ? (
              <img
                src={msg.text.replace("[sticker]", "").replace("[/sticker]", "")}
                alt="sticker"
                className="w-32 h-32 object-contain"
              />
            ) : (
              <div
                className={`px-3 py-1.5 rounded-lg max-w-[80%] text-sm ${
                  msg.author === username
                    ? "bg-blue-600 text-white"
                    : "bg-gray-700 text-white"
                }`}
              >
                {msg.text}
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {showStickers && (
        <StickerPanel
          onSendSticker={handleSendSticker}
          onClose={() => setShowStickers(false)}
        />
      )}

      <div className="p-2 border-t border-gray-700">
        <div className="flex gap-0.5 mb-2 justify-center flex-wrap">
          {EMOJI_REACTIONS.map((emoji) => (
            <button
              key={emoji}
              onClick={(e) => handleEmoji(emoji, e)}
              onTouchEnd={(e) => handleEmoji(emoji, e)}
              className="text-lg sm:text-xl p-1 active:scale-125 transition-transform select-none"
              style={{ WebkitTapHighlightColor: "transparent" }}
            >
              {emoji}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex gap-2">
          <button
            type="button"
            onClick={() => setShowStickers(!showStickers)}
            className={`text-xl px-2 rounded-lg shrink-0 transition-colors ${
              showStickers ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"
            }`}
          >
            🎨
          </button>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Сообщение..."
            className="flex-1 bg-gray-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-0"
          />
          <button
            type="submit"
            className="bg-blue-600 text-white px-3 py-2 rounded-lg text-sm hover:bg-blue-700 shrink-0"
          >
            →
          </button>
        </form>
      </div>
    </div>
  );
}
