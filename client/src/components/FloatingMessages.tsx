import { useState, useEffect, useRef } from "react";

interface Message {
  id: string;
  author: string;
  text: string;
  createdAt: string;
}

interface FloatingMessagesProps {
  messages: Message[];
  maxVisible?: number;
  enabled?: boolean;
}

export function FloatingMessages({ messages, maxVisible = 3, enabled = true }: FloatingMessagesProps) {
  const [visible, setVisible] = useState<Message[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    if (!enabled) {
      setVisible([]);
      timersRef.current.forEach((t) => clearTimeout(t));
      timersRef.current.clear();
      return;
    }

    const last = messages.slice(-maxVisible);
    const lastIds = new Set(last.map((m) => m.id));

    timersRef.current.forEach((t, id) => {
      if (!lastIds.has(id)) {
        clearTimeout(t);
        timersRef.current.delete(id);
      }
    });

    last.forEach((m) => {
      if (!timersRef.current.has(m.id)) {
        const t = setTimeout(() => {
          setVisible((prev) => prev.filter((v) => v.id !== m.id));
          timersRef.current.delete(m.id);
        }, 5500);
        timersRef.current.set(m.id, t);
      }
    });

    setVisible(last);

    return () => {
      timersRef.current.forEach((t) => clearTimeout(t));
      timersRef.current.clear();
    };
  }, [messages, maxVisible, enabled]);

  if (visible.length === 0 || !enabled) return null;

  const isSticker = (text: string) => text.startsWith("[sticker]") && text.endsWith("[/sticker]");

  return (
    <div className="absolute bottom-12 left-3 right-3 pointer-events-none z-10 space-y-1.5">
      {visible.map((msg, i) => (
        <div
          key={msg.id}
          className="bg-black/50 backdrop-blur-sm rounded-lg px-3 py-1.5 max-w-[70%] animate-[floatMsg_5.5s_ease-out_forwards]"
          style={{ animationDelay: `${i * 0.05}s` }}
        >
          {isSticker(msg.text) ? (
            <div className="flex items-center gap-1.5">
              <span className="text-blue-400 text-xs font-semibold">{msg.author}</span>
              <video
                src={msg.text.replace("[sticker]", "").replace("[/sticker]", "")}
                className="w-10 h-10 object-contain inline-block"
                autoPlay
                loop
                muted
                playsInline
              />
            </div>
          ) : (
            <>
              <span className="text-blue-400 text-xs font-semibold">{msg.author}: </span>
              <span className="text-white text-xs">{msg.text}</span>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
