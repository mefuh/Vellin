/**
 * Общий тип для авто-цепочки «голосовые + видео-кружки вперемешку»: один
 * резолвер, единый для {@link import('./voicePlayerStore').useVoicePlayerStore}
 * и {@link import('./videoNotePlayerStore').useVideoNotePlayerStore}, чтобы после
 * конца одного медиа следующим шёл РЕАЛЬНО следующий по списку элемент — того же
 * или другого типа, — а не следующий элемент своего типа с пропуском чужого.
 */
export type MediaNext =
  | { kind: 'voice'; id: string; url: string; durationSec: number }
  | { kind: 'video'; id: string }
  | null;

export type MediaNextResolver = (currentId: string) => MediaNext;
