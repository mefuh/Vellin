import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
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

/**
 * Раздача установщиков нативных клиентов на `/downloads/*` в dev — повторяет
 * то, что в проде делает Caddy (bind-mount ./release/winapp → /srv/downloads).
 * Без этого кнопка «Скачать» на /download в локальной сборке ведёт в никуда:
 * dev-сервер отдал бы SPA-fallback или пустой ответ.
 *
 * Ищем файл сначала в release/winapp (куда кладут опубликованные сборки),
 * затем в installer/dist — свежий результат installer/build.ps1, чтобы после
 * локальной сборки ничего не копировать руками.
 */
function installerDownloads(): Plugin {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const dirs = [join(root, 'release', 'winapp'), join(root, 'installer', 'dist')];

  return {
    name: 'vellin-installer-downloads',
    configureServer(server) {
      server.middlewares.use('/downloads', (req, res, next) => {
        // basename отсекает любые ../ — наружу каталогов не выходим.
        const name = basename(decodeURIComponent((req.url ?? '').split('?')[0]));
        if (!name) return next();
        const file = dirs.map((d) => join(d, name)).find((p) => existsSync(p) && statSync(p).isFile());
        if (!file) {
          res.statusCode = 404;
          res.end(`Установщик ${name} не найден. Положите его в release/winapp/.`);
          return;
        }
        res.setHeader('content-type', 'application/octet-stream');
        res.setHeader('content-length', statSync(file).size);
        res.setHeader('content-disposition', `attachment; filename="${name}"`);
        createReadStream(file).pipe(res);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), installerDownloads()],
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
