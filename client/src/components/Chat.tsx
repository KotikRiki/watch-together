import { useState, useEffect, useRef } from "react";
import { StickerPanel } from "./StickerPanel";

interface Message {
  id: string;
  author: string;
  text: string;
  replyToId?: string | null;
  createdAt: string;
}

interface ChatProps {
  messages: Message[];
  onSendMessage: (text: string, replyToId?: string) => void;
  onReaction: (emoji: string) => void;
  username: string;
}

const EMOJI_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🔥", "🎉", "👀", "💯", "😱", "🤣", "😍", "🥳", "😎", "🤔", "💀"];

export function Chat({ messages, onSendMessage, onReaction, username }: ChatProps) {
  const [input, setInput] = useState("");
  const [showStickers, setShowStickers] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (input.trim()) {
      onSendMessage(input.trim(), replyTo?.id);
      setInput("");
      setReplyTo(null);
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
        {messages.map((msg) => {
          const replyMsg = msg.replyToId ? messages.find((m) => m.id === msg.replyToId) : null;
          return (
            <div
              key={msg.id}
              className={`flex flex-col ${
                msg.author === username ? "items-end" : "items-start"
              }`}
            >
              <span className="text-xs text-gray-500 mb-0.5">{msg.author}</span>
              {msg.text.startsWith("[sticker]") && msg.text.endsWith("[/sticker]") ? (
                <video
                  src={msg.text.replace("[sticker]", "").replace("[/sticker]", "")}
                  className="w-32 h-32 object-contain"
                  autoPlay
                  loop
                  muted
                  playsInline
                />
              ) : (
                <div
                  className={`group relative px-3 py-1.5 rounded-lg max-w-[80%] text-sm ${
                    msg.author === username
                      ? "bg-blue-600 text-white"
                      : "bg-gray-700 text-white"
                  }`}
                >
                  {replyMsg && (
                    <div className={`text-[10px] mb-1 px-2 py-0.5 rounded border-l-2 ${
                      msg.author === username
                        ? "border-blue-300 bg-blue-700/50"
                        : "border-gray-500 bg-gray-600/50"
                    }`}>
                      <span className="font-semibold">{replyMsg.author}</span>
                      <span className="opacity-70 ml-1">{replyMsg.text.replace(/\[sticker\].*?\[\/sticker\]/, "🖼 стикер").substring(0, 40)}</span>
                    </div>
                  )}
                  {msg.text}
                  <button
                    onClick={() => setReplyTo(replyTo?.id === msg.id ? null : msg)}
                    className={`absolute -top-1 -right-1 w-5 h-5 rounded-full bg-gray-800 text-gray-400 hover:text-white text-[10px] items-center justify-center flex sm:hidden group-hover:flex transition-colors ${
                      replyTo?.id === msg.id ? "!flex bg-blue-600 text-white" : ""
                    }`}
                  >
                    ↩
                  </button>
                </div>
              )}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {showStickers && (
        <StickerPanel
          onSendSticker={handleSendSticker}
          onClose={() => setShowStickers(false)}
        />
      )}

      <div className="p-2 border-t border-gray-700">
        {replyTo && (
          <div className="flex items-center gap-2 mb-2 px-2 py-1 bg-gray-800 rounded-lg text-xs">
            <span className="text-blue-400">↩ {replyTo.author}</span>
            <span className="text-gray-400 truncate flex-1">{replyTo.text.replace(/\[sticker\].*?\[\/sticker\]/, "🖼 стикер").substring(0, 50)}</span>
            <button onClick={() => setReplyTo(null)} className="text-gray-500 hover:text-white">✕</button>
          </div>
        )}
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
            placeholder={replyTo ? `Ответ ${replyTo.author}...` : "Сообщение..."}
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
