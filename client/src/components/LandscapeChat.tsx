import { useRef } from "react";

interface ChatMessage {
  id: string;
  author: string;
  text: string;
}

interface LandscapeChatProps {
  messages: ChatMessage[];
  username: string;
  onSendMessage: (text: string) => void;
  onReaction: (emoji: string) => void;
  onClose: () => void;
}

const EMOJI_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🔥", "👀", "🎉"];

export function LandscapeChat({ messages, username, onSendMessage, onReaction, onClose }: LandscapeChatProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  return (
    <div className="pointer-events-auto absolute top-0 right-0 bottom-0 w-1/2 min-w-[280px] max-w-[85vw] z-30 flex flex-col bg-[#0f0f18]/30 backdrop-blur-xl border-l border-white/5 animate-[slideInRight_0.2s_ease-out]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <span className="text-white/70 text-sm font-medium">Чат</span>
        <button onClick={onClose} className="w-7 h-7 rounded-full bg-white/5 flex items-center justify-center text-white/40 hover:text-white transition-colors">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2 min-h-0 space-y-2">
        {messages.length === 0 && <p className="text-gray-600 text-xs text-center mt-12">Пока нет сообщений</p>}
        {messages.map((msg) => (
          <div key={msg.id} className={`flex flex-col ${msg.author === username ? "items-end" : "items-start"}`}>
            <span className="text-[10px] text-gray-500 mb-0.5 px-1">{msg.author}</span>
            {msg.text.startsWith("[sticker]") ? (
              <video src={msg.text.replace("[sticker]", "").replace("[/sticker]", "")} className="w-28 h-28 object-contain" autoPlay loop muted playsInline />
            ) : (
              <div className={`px-3 py-1.5 rounded-2xl max-w-[85%] text-sm ${msg.author === username ? "bg-blue-600 text-white rounded-br-md" : "bg-white/10 text-white rounded-bl-md"}`}>{msg.text}</div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <div className="flex gap-0.5 px-2 py-1 justify-center flex-wrap border-t border-white/5">
        {EMOJI_REACTIONS.map((emoji) => (
          <button key={emoji} onClick={() => onReaction(emoji)} className="text-base p-0.5 active:scale-125 transition-transform select-none">{emoji}</button>
        ))}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); const target = e.target as HTMLFormElement; const input = target.elements.namedItem("chatInputL") as HTMLInputElement; if (input.value.trim()) { onSendMessage(input.value.trim()); input.value = ""; } }} className="flex gap-2 px-3 pb-3 pt-1">
        <input name="chatInputL" type="text" placeholder="Сообщение..." className="flex-1 bg-white/5 text-white rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500/50 placeholder:text-gray-600" />
        <button type="submit" className="bg-blue-600 text-white w-9 h-9 rounded-full flex items-center justify-center shrink-0 hover:bg-blue-500 transition-colors active:scale-90">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </form>
    </div>
  );
}
