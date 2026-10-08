import { join } from 'node:path';

export const SITE = process.env.VELLIN_SITE ?? 'https://localhost:5173';
export const API = process.env.VELLIN_API ?? 'http://localhost:3001/api';

/** Каталог служебных файлов прогона: голоса, список созданных людей. */
export const RUN_DIR = join(__dirname, '..', '.run');
export const VOICE_A = join(RUN_DIR, 'voice-a.wav');
export const VOICE_B = join(RUN_DIR, 'voice-b.wav');
export const CREATED_USERS = join(RUN_DIR, 'users.jsonl');

/** Сколько секунд длится проверка стабильности разговора. */
export const SOAK_SEC = Number(process.env.CALL_SOAK_SEC ?? 60);
