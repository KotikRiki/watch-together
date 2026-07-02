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
}

export function FloatingMessages({ messages, maxVisible = 3 }: FloatingMessagesProps) {
  const [visible, setVisible] = useState<Message[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
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
        }, 4000);
        timersRef.current.set(m.id, t);
      }
    });

    setVisible(last);

    return () => {
      timersRef.current.forEach((t) => clearTimeout(t));
      timersRef.current.clear();
    };
  }, [messages, maxVisible]);

  if (visible.length === 0) return null;

  return (
    <div className="absolute bottom-12 left-3 right-3 pointer-events-none z-10 space-y-1.5">
      {visible.map((msg, i) => (
        <div
          key={msg.id}
          className="bg-black/60 backdrop-blur-sm rounded-lg px-3 py-1.5 max-w-[70%] animate-floatMsg"
          style={{ animationDelay: `${i * 0.05}s` }}
        >
          <span className="text-blue-400 text-xs font-semibold">{msg.author}: </span>
          <span className="text-white text-xs">{msg.text}</span>
        </div>
      ))}
    </div>
  );
}
