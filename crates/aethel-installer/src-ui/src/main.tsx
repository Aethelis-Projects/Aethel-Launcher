import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './i18n';
import './index.css';

// WS-31: Disable browser context menu across entire installer UI except text inputs
document.addEventListener('contextmenu', (e) => {
  const t = e.target as HTMLElement | null;
  if (!t || !t.closest('input, textarea, [contenteditable="true"]')) {
    e.preventDefault();
    e.stopPropagation();
  }
});

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
