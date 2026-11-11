import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './studio.scss';

const rootEl = document.getElementById('studio-root');
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
