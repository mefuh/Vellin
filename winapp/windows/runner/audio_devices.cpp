#include "audio_devices.h"

#include <flutter/method_channel.h>
#include <flutter/standard_method_codec.h>
#include <windows.h>
#include <wrl/client.h>

// Порядок важен и потому не по алфавиту: ключи свойств устройства объявлены
// макросом, который приносит initguid.h, а он должен идти первым — иначе
// заголовок с ключами не собирается.
#include <mmdeviceapi.h>
#include <initguid.h>
#include <functiondiscoverykeys_devpkey.h>

#include <memory>
#include <string>

namespace {

using Microsoft::WRL::ComPtr;
using flutter::EncodableMap;
using flutter::EncodableValue;

std::string Utf8(const wchar_t* text) {
  if (!text) return std::string();
  int size = ::WideCharToMultiByte(CP_UTF8, 0, text, -1, nullptr, 0, nullptr, nullptr);
  if (size <= 1) return std::string();
  std::string out(static_cast<size_t>(size - 1), '\0');
  ::WideCharToMultiByte(CP_UTF8, 0, text, -1, out.data(), size, nullptr, nullptr);
  return out;
}

// Название устройства, которое система отдаёт разговорам, — то самое, что
// показано в «Параметры → Звук» как устройство связи.
std::string CommunicationsDeviceName(IMMDeviceEnumerator* enumerator, EDataFlow flow) {
  ComPtr<IMMDevice> device;
  // Устройства может не быть вовсе — тогда и звонку брать нечего.
  if (FAILED(enumerator->GetDefaultAudioEndpoint(flow, eCommunications, &device))) {
    return std::string();
  }
  ComPtr<IPropertyStore> props;
  if (FAILED(device->OpenPropertyStore(STGM_READ, &props))) return std::string();

  PROPVARIANT name;
  ::PropVariantInit(&name);
  if (FAILED(props->GetValue(PKEY_Device_FriendlyName, &name))) {
    ::PropVariantClear(&name);
    return std::string();
  }
  std::string result = name.vt == VT_LPWSTR ? Utf8(name.pwszVal) : std::string();
  ::PropVariantClear(&name);
  return result;
}

}  // namespace

void RegisterAudioDeviceChannel(flutter::FlutterEngine* engine) {
  if (!engine) return;
  auto channel = std::make_shared<flutter::MethodChannel<EncodableValue>>(
      engine->messenger(), "vellin/audio_devices",
      &flutter::StandardMethodCodec::GetInstance());

  channel->SetMethodCallHandler(
      [channel](const flutter::MethodCall<EncodableValue>& call,
                std::unique_ptr<flutter::MethodResult<EncodableValue>> result) {
        if (call.method_name() != "communications") {
          result->NotImplemented();
          return;
        }

        ComPtr<IMMDeviceEnumerator> enumerator;
        if (FAILED(::CoCreateInstance(__uuidof(MMDeviceEnumerator), nullptr, CLSCTX_ALL,
                                      __uuidof(IMMDeviceEnumerator),
                                      reinterpret_cast<void**>(enumerator.GetAddressOf())))) {
          // Пустые названия читаются как «узнать не удалось» — приложение
          // покажет это словами, а не пустым местом.
          result->Success(EncodableValue(EncodableMap{
              {EncodableValue("capture"), EncodableValue(std::string())},
              {EncodableValue("render"), EncodableValue(std::string())},
          }));
          return;
        }

        result->Success(EncodableValue(EncodableMap{
            {EncodableValue("capture"),
             EncodableValue(CommunicationsDeviceName(enumerator.Get(), eCapture))},
            {EncodableValue("render"),
             EncodableValue(CommunicationsDeviceName(enumerator.Get(), eRender))},
        }));
      });

  // Канал должен пережить вызов: обработчик держит его сам, а здесь остаётся
  // ссылка на время работы приложения.
  static std::shared_ptr<flutter::MethodChannel<EncodableValue>> keep_alive;
  keep_alive = channel;
}
