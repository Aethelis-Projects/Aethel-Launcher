import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './i18n'
import App from './App.tsx'

// WS-31: Disable browser context menu across entire UI except text inputs
document.addEventListener('contextmenu', (e) => {
  const t = e.target as HTMLElement | null;
  if (!t || !t.closest('input, textarea, [contenteditable="true"]')) {
    e.preventDefault();
    e.stopPropagation();
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
