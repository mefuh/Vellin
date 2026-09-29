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
using flutter::EncodableList;
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

std::string FriendlyName(IMMDevice* device) {
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

std::string DeviceId(IMMDevice* device) {
  LPWSTR id = nullptr;
  if (FAILED(device->GetId(&id))) return std::string();
  std::string result = Utf8(id);
  ::CoTaskMemFree(id);
  return result;
}

/// Устройство, которое система отдаёт разговорам, — им звонок пользуется, пока
/// человек не выбрал другое.
std::string CommunicationsDeviceId(IMMDeviceEnumerator* enumerator, EDataFlow flow) {
  ComPtr<IMMDevice> device;
  if (FAILED(enumerator->GetDefaultAudioEndpoint(flow, eCommunications, &device))) {
    return std::string();
  }
  return DeviceId(device.Get());
}

EncodableList ActiveDevices(IMMDeviceEnumerator* enumerator, EDataFlow flow) {
  EncodableList list;
  ComPtr<IMMDeviceCollection> collection;
  // Только работающие устройства: отключённые и выключенные показывать незачем,
  // выбрать их всё равно нельзя.
  if (FAILED(enumerator->EnumAudioEndpoints(flow, DEVICE_STATE_ACTIVE, &collection))) {
    return list;
  }
  UINT count = 0;
  if (FAILED(collection->GetCount(&count))) return list;
  for (UINT i = 0; i < count; i++) {
    ComPtr<IMMDevice> device;
    if (FAILED(collection->Item(i, &device))) continue;
    std::string id = DeviceId(device.Get());
    if (id.empty()) continue;
    list.push_back(EncodableValue(EncodableMap{
        {EncodableValue("id"), EncodableValue(id)},
        {EncodableValue("label"), EncodableValue(FriendlyName(device.Get()))},
    }));
  }
  return list;
}

}  // namespace

void RegisterAudioDeviceChannel(flutter::FlutterEngine* engine) {
  if (!engine) return;
  auto channel = std::make_shared<flutter::MethodChannel<EncodableValue>>(
      engine->messenger(), "vellin/audio_devices",
      &flutter::StandardMethodCodec::GetInstance());

  channel->SetMethodCallHandler(
      [](const flutter::MethodCall<EncodableValue>& call,
         std::unique_ptr<flutter::MethodResult<EncodableValue>> result) {
        if (call.method_name() != "list") {
          result->NotImplemented();
          return;
        }

        ComPtr<IMMDeviceEnumerator> enumerator;
        if (FAILED(::CoCreateInstance(__uuidof(MMDeviceEnumerator), nullptr, CLSCTX_ALL,
                                      __uuidof(IMMDeviceEnumerator),
                                      reinterpret_cast<void**>(enumerator.GetAddressOf())))) {
          // Пустые списки читаются как «узнать не удалось» — приложение скажет
          // это словами, а не пустым местом.
          result->Success(EncodableValue(EncodableMap{}));
          return;
        }

        result->Success(EncodableValue(EncodableMap{
            {EncodableValue("capture"), EncodableValue(ActiveDevices(enumerator.Get(), eCapture))},
            {EncodableValue("render"), EncodableValue(ActiveDevices(enumerator.Get(), eRender))},
            {EncodableValue("defaultCapture"),
             EncodableValue(CommunicationsDeviceId(enumerator.Get(), eCapture))},
            {EncodableValue("defaultRender"),
             EncodableValue(CommunicationsDeviceId(enumerator.Get(), eRender))},
        }));
      });

  // Канал должен пережить вызов: держим ссылку на время работы приложения.
  static std::shared_ptr<flutter::MethodChannel<EncodableValue>> keep_alive;
  keep_alive = channel;
}
