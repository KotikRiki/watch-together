import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Send errors to server for debugging
function reportError(level: string, msg: string, stack?: string) {
  try {
    navigator.sendBeacon('/api/log', JSON.stringify({ level, message: msg, stack, url: location.href, userAgent: navigator.userAgent }));
  } catch {}
}
window.onerror = (msg) => { reportError('error', String(msg)); };
window.addEventListener('unhandledrejection', (e) => { reportError('error', String(e.reason)); });
const origConsoleError = console.error;
console.error = (...args: any[]) => { origConsoleError(...args); reportError('error', args.map(String).join(' ')); };

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

const readyBtn = document.getElementById('ready-btn');
if (readyBtn) readyBtn.style.display = 'inline-block';
