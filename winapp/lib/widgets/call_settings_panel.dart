import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher_string.dart';

import '../state/call_controller.dart';
import '../theme/vellin_theme.dart';
import '../webrtc/call_settings.dart';
import '../webrtc/mic_test.dart';

/// Настройки звонка: устройства, обработка звука, проверка микрофона и
/// громкость собеседника.
///
/// Один и тот же набор нужен и до звонка (раздел настроек), и посреди
/// разговора (кнопка в ряду управления), поэтому это виджет, а не экран: слой
/// звонка живёт выше навигатора и открыть там страницу не из чего.
class CallSettingsPanel extends StatefulWidget {
  /// Чью громкость настраивать. Пусто — разговора нет, полоса громкости не
  /// показывается: непонятно, чью именно крутить.
  final String? peerId;
  final String? peerName;

  const CallSettingsPanel({super.key, this.peerId, this.peerName});

  @override
  State<CallSettingsPanel> createState() => _CallSettingsPanelState();
}

class _CallSettingsPanelState extends State<CallSettingsPanel> {
  CallDevices _devices = CallDevices.empty;
  SystemAudioDevices _audio = SystemAudioDevices.unknown;
  bool _loading = true;

  MicTest? _test;
  StreamSubscription<double>? _levels;
  double _level = 0;
  String? _testError;

  @override
  void initState() {
    super.initState();
    _loadDevices();
  }

  @override
  void dispose() {
    _levels?.cancel();
    _test?.dispose();
    super.dispose();
  }

  Future<void> _loadDevices() async {
    final found = await CallSettings.devices();
    final audio = await CallSettings.systemAudioDevices();
    if (!mounted) return;
    setState(() {
      _devices = found;
      _audio = audio;
      _loading = false;
    });
  }

  /// Открыть параметры звука Windows: микрофон и динамик звонка выбираются там.
  Future<void> _openSystemSound() async {
    try {
      await launchUrlString('ms-settings:sound');
    } catch (_) {
      // Не открылось — человек дойдёт до настроек сам.
    }
  }

  Future<void> _toggleTest(CallSettings settings, CallController call) async {
    if (_test != null) {
      await _stopTest();
      return;
    }
    // В разговоре микрофон занят звонком — уровень берём из самого звонка.
    final inCall = call.call != null && call.isMine;
    final test = MicTest(fromCall: inCall ? call.micLevel : null);
    final started = await test.start();
    if (!mounted) return;
    if (!started) {
      await test.dispose();
      setState(() => _testError = 'Микрофон занят другой записью');
      return;
    }
    _levels = test.levels.listen((v) {
      if (mounted) setState(() => _level = v);
    });
    setState(() {
      _test = test;
      _testError = null;
      _level = 0;
    });
  }

  Future<void> _stopTest() async {
    final test = _test;
    await _levels?.cancel();
    _levels = null;
    setState(() {
      _test = null;
      _level = 0;
    });
    await test?.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final call = context.watch<CallController>();
    final settings = context.watch<CallSettings>();
    final peerId = widget.peerId;

    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      if (_loading)
        const Padding(
          padding: EdgeInsets.symmetric(vertical: 28),
          child: Center(child: CircularProgressIndicator(color: VellinColors.accentHi)),
        )
      else ...[
        // Микрофон и динамик звонку выдаёт Windows: библиотека звонков своих
        // устройств не перечисляет и выбирать их не даёт. Поэтому показываем,
        // что система отдала разговорам, и уводим менять это к ней.
        _SystemAudioRow(
          icon: Icons.mic,
          label: 'Микрофон',
          device: _audio.micLabel,
          onOpenSettings: _openSystemSound,
        ),
        const SizedBox(height: 10),
        _SystemAudioRow(
          icon: Icons.volume_up,
          label: 'Динамик',
          device: _audio.speakerLabel,
          onOpenSettings: _openSystemSound,
        ),
        const SizedBox(height: 6),
        const Text(
          'Звонок использует устройства связи Windows. Сменить их можно в '
          'параметрах звука — там же, где они выбираются для других программ.',
          style: TextStyle(color: VellinColors.text3, fontSize: 12),
        ),
        const SizedBox(height: 16),
        _DevicePicker(
          label: 'Камера',
          icon: Icons.videocam,
          devices: _devices.cameras,
          value: settings.cameraId,
          onChanged: settings.setCamera,
        ),
        const SizedBox(height: 18),

        // Проверка микрофона.
        Row(children: [
          OutlinedButton.icon(
            onPressed: () => _toggleTest(settings, call),
            icon: Icon(_test != null ? Icons.stop : Icons.graphic_eq, size: 18),
            style: OutlinedButton.styleFrom(
              foregroundColor: _test != null ? VellinColors.accentHi : VellinColors.text1,
              side: BorderSide(color: _test != null ? VellinColors.accentHi : VellinColors.line2),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
            ),
            label: Text(_test != null ? 'Остановить проверку' : 'Проверить микрофон'),
          ),
          const SizedBox(width: 14),
          Expanded(child: _LevelBar(level: _level, active: _test != null)),
        ]),
        if (_test != null)
          const Padding(
            padding: EdgeInsets.only(top: 8),
            child: Text('Скажите что-нибудь — полоса должна двигаться',
                style: TextStyle(color: VellinColors.text3, fontSize: 12.5)),
          ),
        if (_testError != null)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(_testError!,
                style: const TextStyle(color: VellinColors.accentHi, fontSize: 12.5)),
          ),

        const SizedBox(height: 20),
        const Divider(height: 1, thickness: 1, color: VellinColors.line2),
        const SizedBox(height: 16),

        const Text('Обработка звука',
            style: TextStyle(color: VellinColors.text3, fontSize: 11.5)),
        const SizedBox(height: 6),
        _Toggle(
          label: 'Шумоподавление',
          hint: 'Убирает ровный фон: вентилятор, улицу, клавиатуру',
          value: settings.noiseSuppression,
          onChanged: (v) => settings.setProcessing(noiseSuppression: v),
        ),
        _Toggle(
          label: 'Эхоподавление',
          hint: 'Нужно, когда звук идёт из колонок, а не из наушников',
          value: settings.echoCancellation,
          onChanged: (v) => settings.setProcessing(echoCancellation: v),
        ),
        _Toggle(
          label: 'Авторегулировка громкости',
          hint: 'Выравнивает голос, если вы то ближе, то дальше от микрофона',
          value: settings.autoGain,
          onChanged: (v) => settings.setProcessing(autoGain: v),
        ),

        if (peerId != null && peerId.isNotEmpty) ...[
          const SizedBox(height: 20),
          const Divider(height: 1, thickness: 1, color: VellinColors.line2),
          const SizedBox(height: 16),
          Text('Громкость: ${widget.peerName ?? 'собеседник'}',
              style: const TextStyle(color: VellinColors.text3, fontSize: 11.5)),
          Row(children: [
            Expanded(
              child: Slider(
                value: settings.volumeFor(peerId),
                max: 2,
                divisions: 20,
                activeColor: VellinColors.accent,
                inactiveColor: VellinColors.bg3,
                onChanged: (v) => settings.setVolumeFor(peerId, v),
              ),
            ),
            SizedBox(
              width: 52,
              child: Text('${(settings.volumeFor(peerId) * 100).round()}%',
                  textAlign: TextAlign.right,
                  style: const TextStyle(color: VellinColors.text1, fontSize: 13)),
            ),
          ]),
          const Text('Запоминается для этого собеседника отдельно',
              style: TextStyle(color: VellinColors.text3, fontSize: 12.5)),
        ],
      ],
    ]);
  }
}

/// Устройство звука, выданное системой: показываем, но не выбираем.
class _SystemAudioRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String device;
  final VoidCallback onOpenSettings;
  const _SystemAudioRow({
    required this.icon,
    required this.label,
    required this.device,
    required this.onOpenSettings,
  });

  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        Icon(icon, size: 15, color: VellinColors.text3),
        const SizedBox(width: 7),
        Text(label, style: const TextStyle(color: VellinColors.text3, fontSize: 11.5)),
      ]),
      const SizedBox(height: 6),
      Container(
        width: double.infinity,
        padding: const EdgeInsets.fromLTRB(12, 4, 4, 4),
        decoration: BoxDecoration(
          color: VellinColors.bg2,
          borderRadius: BorderRadius.circular(VellinRadius.sm),
          border: Border.all(color: VellinColors.line2),
        ),
        child: Row(children: [
          Expanded(
            child: Text(
              // Пустое название значит, что устройство не нашлось: так и
              // говорим, иначе строка выглядела бы сломанной.
              device.isEmpty ? 'Устройство не найдено' : device,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: device.isEmpty ? VellinColors.text3 : VellinColors.text0,
                fontSize: 13,
              ),
            ),
          ),
          TextButton(
            onPressed: onOpenSettings,
            style: TextButton.styleFrom(foregroundColor: VellinColors.text1),
            child: const Text('Сменить'),
          ),
        ]),
      ),
    ]);
  }
}

/// Выбор устройства. Первый пункт — «как в системе»: тогда настройка не
/// ломается, когда камеру отключили.
class _DevicePicker extends StatelessWidget {
  final String label;
  final IconData icon;
  final List<CallDevice> devices;
  final String? value;
  final ValueChanged<String?> onChanged;

  const _DevicePicker({
    required this.label,
    required this.icon,
    required this.devices,
    required this.value,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    // Запомненного устройства может уже не быть — показываем системное, чтобы
    // список не врал про то, что сейчас работает.
    final known = value != null && devices.any((d) => d.id == value);
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        Icon(icon, size: 15, color: VellinColors.text3),
        const SizedBox(width: 7),
        Text(label, style: const TextStyle(color: VellinColors.text3, fontSize: 11.5)),
      ]),
      const SizedBox(height: 6),
      Container(
        width: double.infinity,
        decoration: BoxDecoration(
          color: VellinColors.bg2,
          borderRadius: BorderRadius.circular(VellinRadius.sm),
          border: Border.all(color: VellinColors.line2),
        ),
        child: Column(children: [
          _Option(
            label: 'Как в системе',
            selected: !known,
            onTap: () => onChanged(null),
          ),
          for (final d in devices)
            _Option(
              label: d.label,
              selected: known && d.id == value,
              onTap: () => onChanged(d.id),
            ),
          if (devices.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text('Устройств не найдено',
                    style: TextStyle(color: VellinColors.text3, fontSize: 13)),
              ),
            ),
        ]),
      ),
    ]);
  }
}

/// Пункт списка устройств.
///
/// Список нарисован целиком, а не выпадающим меню: меню открывается через
/// навигатор, а окно звонка нарисовано выше него — там оно оказалось бы под
/// разговором и не нажималось.
class _Option extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;
  const _Option({required this.label, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? VellinColors.bg3 : Colors.transparent,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          child: Row(children: [
            Icon(
              selected ? Icons.radio_button_checked : Icons.radio_button_unchecked,
              size: 16,
              color: selected ? VellinColors.accent : VellinColors.text3,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: selected ? VellinColors.text0 : VellinColors.text1,
                  fontSize: 13,
                ),
              ),
            ),
          ]),
        ),
      ),
    );
  }
}

class _Toggle extends StatelessWidget {
  final String label;
  final String hint;
  final bool value;
  final ValueChanged<bool> onChanged;
  const _Toggle({
    required this.label,
    required this.hint,
    required this.value,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(children: [
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(label, style: const TextStyle(color: VellinColors.text0, fontSize: 13.5)),
            const SizedBox(height: 2),
            Text(hint, style: const TextStyle(color: VellinColors.text3, fontSize: 12)),
          ]),
        ),
        const SizedBox(width: 12),
        Switch(
          value: value,
          onChanged: onChanged,
          activeThumbColor: Colors.white,
          activeTrackColor: VellinColors.accent,
        ),
      ]),
    );
  }
}

/// Шкала уровня микрофона.
class _LevelBar extends StatelessWidget {
  final double level;
  final bool active;
  const _LevelBar({required this.level, required this.active});

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(999),
      child: Container(
        height: 10,
        color: VellinColors.bg3,
        child: Align(
          alignment: Alignment.centerLeft,
          child: AnimatedFractionallySizedBox(
            duration: const Duration(milliseconds: 90),
            widthFactor: active ? level.clamp(0.0, 1.0) : 0,
            child: Container(
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [VellinColors.ok, VellinColors.accentHi],
                ),
                borderRadius: BorderRadius.circular(999),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
