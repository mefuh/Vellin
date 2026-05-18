import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { useAuthStore } from './stores/authStore';
import { useUIStore } from './stores/uiStore';
import './styles/global.css';

useAuthStore.getState().restoreSession();
useUIStore.getState().applyTheme();

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root not found');

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
