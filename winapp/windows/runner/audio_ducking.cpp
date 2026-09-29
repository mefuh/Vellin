#include "audio_ducking.h"

#include <audiopolicy.h>
#include <mmdeviceapi.h>
#include <windows.h>
#include <wrl/client.h>

#include <vector>

namespace {

using Microsoft::WRL::ComPtr;

// Отказ действует, пока жив объект сессии, — поэтому держим их до конца работы
// приложения. Отпустить их значит вернуть приглушение.
std::vector<ComPtr<IAudioSessionControl2>> g_sessions;

// Заявить отказ на устройстве, которое система считает «разговорным».
void OptOut(IMMDeviceEnumerator* enumerator, EDataFlow flow) {
  ComPtr<IMMDevice> device;
  // Устройства может не быть вовсе (нет микрофона, нет звуковой карты) — тогда
  // и приглушать нечего.
  if (FAILED(enumerator->GetDefaultAudioEndpoint(flow, eCommunications, &device))) {
    return;
  }

  ComPtr<IAudioSessionManager2> manager;
  if (FAILED(device->Activate(__uuidof(IAudioSessionManager2), CLSCTX_ALL, nullptr,
                              reinterpret_cast<void**>(manager.GetAddressOf())))) {
    return;
  }

  // Пустой идентификатор — сессия приложения по умолчанию. Именно в ней
  // открывает свои потоки WebRTC, поэтому отказ распространяется и на них,
  // хотя заявлен заранее.
  ComPtr<IAudioSessionControl> control;
  if (FAILED(manager->GetAudioSessionControl(nullptr, 0, control.GetAddressOf()))) {
    return;
  }

  ComPtr<IAudioSessionControl2> control2;
  if (FAILED(control.As(&control2))) {
    return;
  }

  if (FAILED(control2->SetDuckingPreference(TRUE))) {
    return;
  }
  g_sessions.push_back(control2);
}

}  // namespace

void DisableCommunicationsDucking() {
  ComPtr<IMMDeviceEnumerator> enumerator;
  if (FAILED(::CoCreateInstance(__uuidof(MMDeviceEnumerator), nullptr, CLSCTX_ALL,
                                __uuidof(IMMDeviceEnumerator),
                                reinterpret_cast<void**>(enumerator.GetAddressOf())))) {
    return;
  }

  // Приглушение запускает открытый микрофон, а применяется оно к воспроизведению
  // — заявляем отказ на обеих сторонах. Ошибка на любой из них ничего не ломает:
  // в худшем случае останется поведение системы по умолчанию.
  OptOut(enumerator.Get(), eRender);
  OptOut(enumerator.Get(), eCapture);
}
