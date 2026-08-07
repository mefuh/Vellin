import { CallDeviceSettings } from '../call/CallDeviceSettings';
import { Card } from './ProfilePrimitives';

/**
 * Устройства и обработка звука для звонков. Те же настройки открываются
 * кнопкой прямо в разговоре — здесь они нужны, чтобы проверить микрофон
 * заранее, а не когда собеседник уже не слышит.
 */
export function AudioVideoSection() {
  return (
    <Card
      title="Звук и видео"
      desc="Устройства звонка, обработка звука и проверка микрофона. Настройки хранятся в этом браузере."
      contained={false}
    >
      <CallDeviceSettings />
    </Card>
  );
}
