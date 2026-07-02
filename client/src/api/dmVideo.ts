import { useAuthStore } from '../stores/authStore';

/** Ответ загрузки сырого видео: идентификатор для последующего dm_send. */
export interface VideoNoteUploadResult {
  uploadId: string;
}

/**
 * VideoUploadService — загрузка сырого видео-«кружка» на сервер с прогрессом.
 * XHR (а не fetch) ради `upload.onprogress` — прогресс при плохом интернете.
 * Сервер стримит файл на диск и отвечает uploadId; транскод в mp4 идёт в фоне.
 */
export function uploadVideoNote(
  blob: Blob,
  mimeType: string,
  onProgress?: (fraction: number) => void,
): Promise<VideoNoteUploadResult> {
  return new Promise((resolve, reject) => {
    const token = useAuthStore.getState().token;
    const form = new FormData();
    const ext = mimeType.includes('mp4') ? 'mp4' : mimeType.includes('matroska') ? 'mkv' : 'webm';
    form.append('file', blob, `note.${ext}`);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/dm/video-note');
    if (token) xhr.setRequestHeader('authorization', `Bearer ${token}`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as VideoNoteUploadResult);
        } catch {
          reject(new Error('bad_response'));
        }
      } else {
        reject(new Error(xhr.status === 413 ? 'too_large' : `http_${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error('network'));
    xhr.onabort = () => reject(new Error('aborted'));
    xhr.send(form);
  });
}
