import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Detailed error logging to server
function log(level: string, msg: string, extra?: string) {
  try {
    const data = JSON.stringify({ level, message: msg, extra: extra || "", url: location.href, ua: navigator.userAgent, ts: Date.now() });
    navigator.sendBeacon('/api/log', new Blob([data], { type: 'application/json' }));
  } catch {}
}

// Catch all errors
window.onerror = (msg, src, line, col, err) => {
  log('error', String(msg), `src:${src} line:${line}:${col} stack:${err?.stack || ""}`);
};
window.addEventListener('unhandledrejection', (e) => {
  log('unhandledrejection', String(e.reason), `stack:${e.reason?.stack || ""}`);
});

// Override console to log errors + warnings
const origError = console.error;
const origWarn = console.warn;
console.error = (...args: any[]) => { origError(...args); log('console.error', args.map(a => typeof a === 'object' ? JSON.stringify(a)?.slice(0, 500) : String(a)).join(' ')); };
console.warn = (...args: any[]) => { origWarn(...args); log('console.warn', args.map(a => typeof a === 'object' ? JSON.stringify(a)?.slice(0, 200) : String(a)).join(' ')); };

// Log socket events
const origFetch = window.fetch;
window.fetch = async (...args: any[]) => {
  try {
    const res = await origFetch(args[0] as any, args[1] as any);
    if (!res.ok) log('fetch_error', `${res.status} ${String(args[0])?.slice(0, 100)}`);
    return res;
  } catch (e: any) {
    log('fetch_exception', `${String(args[0])?.slice(0, 100)} ${e.message}`);
    throw e;
  }
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

const readyBtn = document.getElementById('ready-btn');
if (readyBtn) readyBtn.style.display = 'inline-block';
