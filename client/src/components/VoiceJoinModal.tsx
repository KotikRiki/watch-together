interface VoiceJoinModalProps {
  userCount: number;
  webRtcSupported: boolean;
  telegramDetected: boolean;
  onJoin: () => void;
  onDismiss: () => void;
}

export function VoiceJoinModal({ userCount, webRtcSupported, telegramDetected, onJoin, onDismiss }: VoiceJoinModalProps) {
  if (!webRtcSupported) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]">
        <div
          className="bg-[#12121a] rounded-2xl p-6 w-full max-w-[320px] border border-white/5 shadow-2xl shadow-black/50 relative mx-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-red-500/20 to-red-600/10 flex items-center justify-center mx-auto mb-4 border border-red-500/10">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          </div>

          <h2 className="text-white/90 text-base font-bold text-center mb-1">Голосовой чат недоступен</h2>
          <p className="text-white/40 text-xs text-center mb-5">
            {telegramDetected
              ? "Браузер Telegram не поддерживает WebRTC. Откройте сайт в Chrome, Safari или Firefox."
              : "Этот браузер не поддерживает WebRTC. Попробуйте Chrome или Firefox."}
          </p>

          <div className="flex flex-col gap-2">
            <button
              onClick={() => window.open(location.href, "_blank")}
              className="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white py-3 rounded-xl font-semibold text-sm transition-all shadow-lg shadow-blue-500/20 active:scale-[0.98]"
            >
              Открыть в браузере
            </button>
            <button
              onClick={onDismiss}
              className="w-full bg-white/5 hover:bg-white/10 text-white/40 hover:text-white/60 py-2.5 rounded-xl text-sm transition-all"
            >
              Закрыть
            </button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]">
      <div
        className="bg-[#12121a] rounded-2xl p-6 w-full max-w-[320px] border border-white/5 shadow-2xl shadow-black/50 relative mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mic icon */}
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-green-500/20 to-green-600/10 flex items-center justify-center mx-auto mb-4 border border-green-500/10">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
        </div>

        {/* Title */}
        <h2 className="text-white/90 text-base font-bold text-center mb-1">Голосовой чат</h2>
        <p className="text-white/40 text-xs text-center mb-5">
          {userCount > 0
            ? `${userCount} ${userCount === 1 ? "человек" : userCount < 5 ? "человека" : "человек"} в голосе`
            : "Будьте первым"}
        </p>

        {/* Description */}
        <div className="bg-white/[0.02] rounded-xl p-3 border border-white/5 mb-5">
          <p className="text-white/30 text-[11px] leading-relaxed text-center">
            Микрофон включится автоматически. Вы сможете отключить его в любой момент кнопкой 🎤
          </p>
        </div>

        {/* Buttons */}
        <div className="flex flex-col gap-2">
          <button
            onClick={onJoin}
            className="w-full bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 text-white py-3 rounded-xl font-semibold text-sm transition-all shadow-lg shadow-green-500/20 active:scale-[0.98]"
          >
            Подключиться
          </button>
          <button
            onClick={onDismiss}
            className="w-full bg-white/5 hover:bg-white/10 text-white/40 hover:text-white/60 py-2.5 rounded-xl text-sm transition-all"
          >
            Позже
          </button>
        </div>
      </div>
    </div>
  );
}
