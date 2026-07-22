import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Версия UI — из winapp/package.json (единый источник; прокидывается как
// __APP_VERSION__ и уходит в заголовок X-App-Version для версионного гейтинга).
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as {
  version: string;
};

// Хост локального бэкенда для браузерного dev (`npm run dev`). Нативная сборка
// (tauri dev/build) обращается к серверу по абсолютному URL из runtime/config,
// а не через этот прокси.
const BACKEND = process.env.VITE_DEV_BACKEND ?? 'http://127.0.0.1:3001';

export default defineConfig({
  plugins: [react()],
  // Tauri читает stdout/stderr — не затираем его сообщениями Vite.
  clearScreen: false,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    // Порт по умолчанию для Tauri-фронтенда (совпадает с tauri.conf.json).
    port: 1420,
    strictPort: true,
    host: '127.0.0.1',
    proxy: {
      '/api': { target: BACKEND, changeOrigin: true },
      '/ws': { target: BACKEND.replace(/^http/, 'ws'), ws: true, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2022',
  },
});
