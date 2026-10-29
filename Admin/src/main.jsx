import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Register Service Worker for PWA installability on mobile (Android & iOS)
// Only register in top-level window (never inside embedded iframes or simulators where service workers are disallowed by browser security)
if ('serviceWorker' in navigator && window.self === window.top) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      if (err?.name !== 'SecurityError') {
        console.warn('Service worker registration note:', err);
      }
    });
  });
}

