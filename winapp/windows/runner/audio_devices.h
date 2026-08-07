#ifndef RUNNER_AUDIO_DEVICES_H_
#define RUNNER_AUDIO_DEVICES_H_

#include <flutter/flutter_engine.h>

// Микрофоны и динамики системы — для выбора устройства в настройках звонка.
//
// Библиотека звонков перечисляет их только пока звук уже идёт: до первого
// разговора её списки пусты. Поэтому список берём у Windows напрямую —
// опознаватели совпадают, и выбранное устройство библиотека потом принимает.
void RegisterAudioDeviceChannel(flutter::FlutterEngine* engine);

#endif  // RUNNER_AUDIO_DEVICES_H_
