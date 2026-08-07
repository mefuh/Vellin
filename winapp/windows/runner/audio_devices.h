#ifndef RUNNER_AUDIO_DEVICES_H_
#define RUNNER_AUDIO_DEVICES_H_

#include <flutter/flutter_engine.h>

// Устройства связи Windows: какие микрофон и динамик система отдаёт звонкам.
//
// Библиотека звонков на Windows своих устройств не перечисляет и выбирать их не
// даёт — она всегда берёт «устройства связи» из настроек системы. Показать их
// название можно только самим, отсюда этот канал.
void RegisterAudioDeviceChannel(flutter::FlutterEngine* engine);

#endif  // RUNNER_AUDIO_DEVICES_H_
