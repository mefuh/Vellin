import { existsSync, readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Версия для UI берётся из client/package.json — единый источник, чтобы не
// дублировать строку версии по компонентам. Прокидывается как глобальная
// константа __APP_VERSION__ (см. src/globals.d.ts).
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as {
  version: string;
};

// Локальный HTTPS для тестов с телефона (микрофон/getUserMedia требует
// «защищённого контекста»). Включается ТОЛЬКО если в client/.certs/ лежат
// сертификаты mkcert — иначе обычный http-дев не меняется. Каталог .certs/
// не коммитится (см. .gitignore).
const devKey = new URL('./.certs/dev-key.pem', import.meta.url);
const devCert = new URL('./.certs/dev-cert.pem', import.meta.url);
const httpsConfig =
  existsSync(devKey) && existsSync(devCert)
    ? { key: readFileSync(devKey), cert: readFileSync(devCert) }
    : undefined;

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    port: 5173,
    host: true,
    https: httpsConfig,
    // Разрешаем доступ с любых хостов — нужно для тестов с телефона по LAN/через
    // туннель, иначе Vite отвечает «host not allowed».
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2022',
  },
});
