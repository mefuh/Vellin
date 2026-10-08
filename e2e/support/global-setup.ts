import { mkdirSync, writeFileSync } from 'node:fs';
import { API, CREATED_USERS, RUN_DIR, SITE, VOICE_A, VOICE_B } from './env';
import { prepareVoices } from './voices';

export default async function globalSetup(): Promise<void> {
  // Стенд должен быть поднят до тестов — иначе каждый тест падал бы по
  // таймауту с непонятной причиной.
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  for (const url of [SITE, `${API.replace(/\/api$/, '')}/health`]) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
    } catch (e) {
      throw new Error(`Стенд недоступен (${url}): ${(e as Error).message}. Запустите npm run dev.`);
    }
  }
  mkdirSync(RUN_DIR, { recursive: true });
  writeFileSync(CREATED_USERS, '');
  const source = prepareVoices(VOICE_A, VOICE_B);
  console.log(`Голоса микрофонов: ${source}`);
}
