import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../state/call_controller.dart';
import '../theme/call_design.dart';
import '../webrtc/call_settings.dart';
import '../webrtc/mic_test.dart';
import 'call/call_bits.dart';
import 'call/call_glyphs.dart';

/// Настройки звонка: громкость собеседника, устройства, обработка звука и
/// проверка микрофона.
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
  bool _loading = true;

  MicTest? _test;
  StreamSubscription<double>? _levels;
  double _level = 0;
  String? _testError;

  /// Какой из списков устройств сейчас раскрыт. Разворачиваем на месте, а не
  /// выпадающим меню: меню открывается через навигатор, а окно звонка нарисовано
  /// выше него — там список оказался бы под разговором и не нажимался.
  String? _openPicker;

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
    if (!mounted) return;
    setState(() {
      _devices = found;
      _loading = false;
    });
  }

  Future<void> _toggleTest(CallController call) async {
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

    if (_loading) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 40),
        child: Center(child: CircularProgressIndicator(color: CallColors.gold)),
      );
    }

    final volume = peerId == null || peerId.isEmpty ? null : settings.volumeFor(peerId);

    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      if (volume != null) ...[
        const CallSectionLabel('Воспроизведение'),
        const SizedBox(height: 12),
        Row(crossAxisAlignment: CrossAxisAlignment.baseline, textBaseline: TextBaseline.alphabetic, children: [
          Expanded(
            child: Text('Громкость: ${widget.peerName ?? 'собеседник'}', style: CallText.row),
          ),
          Text('${(volume * 100).round()}%', style: CallText.tabularSmall),
        ]),
        const SizedBox(height: 10),
        _ThinSlider(
          value: volume,
          max: 2,
          onChanged: (v) => settings.setVolumeFor(peerId!, v),
        ),
        const SizedBox(height: 6),
        Text('Запоминается для этого собеседника отдельно', style: CallText.rowHint),
        const SizedBox(height: 26),
        const CallDivider(),
        const SizedBox(height: 26),
      ],

      const CallSectionLabel('Устройства'),
      const SizedBox(height: 14),
      _DevicePicker(
        id: 'mic',
        label: 'Микрофон',
        devices: _devices.mics,
        value: settings.micId,
        systemLabel: _devices.labelFor(_devices.mics, _devices.defaultMicId),
        open: _openPicker == 'mic',
        onToggle: () => setState(() => _openPicker = _openPicker == 'mic' ? null : 'mic'),
        onChanged: (id) {
          settings.setMic(id);
          setState(() => _openPicker = null);
        },
      ),
      const SizedBox(height: 14),
      _DevicePicker(
        id: 'camera',
        label: 'Камера',
        devices: _devices.cameras,
        value: settings.cameraId,
        open: _openPicker == 'camera',
        onToggle: () => setState(() => _openPicker = _openPicker == 'camera' ? null : 'camera'),
        onChanged: (id) {
          settings.setCamera(id);
          setState(() => _openPicker = null);
        },
      ),
      const SizedBox(height: 14),
      _DevicePicker(
        id: 'speaker',
        label: 'Динамики',
        devices: _devices.speakers,
        value: settings.speakerId,
        systemLabel: _devices.labelFor(_devices.speakers, _devices.defaultSpeakerId),
        open: _openPicker == 'speaker',
        onToggle: () => setState(() => _openPicker = _openPicker == 'speaker' ? null : 'speaker'),
        onChanged: (id) {
          settings.setSpeaker(id);
          setState(() => _openPicker = null);
        },
      ),

      const SizedBox(height: 26),
      const CallDivider(),
      const SizedBox(height: 26),

      const CallSectionLabel('Обработка звука'),
      const SizedBox(height: 8),
      _ProcessingRow(
        title: 'Шумоподавление',
        hint: 'Убирает фоновый шум комнаты',
        value: settings.noiseSuppression,
        onChanged: (v) => settings.setProcessing(noiseSuppression: v),
      ),
      _ProcessingRow(
        title: 'Эхоподавление',
        hint: 'Рекомендуется без наушников',
        value: settings.echoCancellation,
        onChanged: (v) => settings.setProcessing(echoCancellation: v),
      ),
      _ProcessingRow(
        title: 'Авторегулировка громкости',
        hint: 'Выравнивает уровень вашего голоса',
        value: settings.autoGain,
        onChanged: (v) => settings.setProcessing(autoGain: v),
      ),

      const SizedBox(height: 26),
      const CallDivider(),
      const SizedBox(height: 26),

      const CallSectionLabel('Тест микрофона'),
      const SizedBox(height: 14),
      Container(
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.03),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: Colors.white.withValues(alpha: 0.055)),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          MicLevelBars(level: _level, active: _test != null),
          const SizedBox(height: 14),
          Row(children: [
            Expanded(
              child: Text(
                _testError ??
                    (_test != null
                        ? 'Скажите пару слов — полоски должны двигаться'
                        : 'Проверьте, что голос доходит до выбранного микрофона'),
                style: CallText.rowHint.copyWith(
                  color: _testError != null ? CallColors.dangerSoft : CallColors.textLabel,
                ),
              ),
            ),
            const SizedBox(width: 12),
            _TextPill(
              label: _test != null ? 'Остановить' : 'Проверить',
              active: _test != null,
              onTap: () => _toggleTest(call),
            ),
          ]),
        ]),
      ),
    ]);
  }
}

/// Панель настроек звонка: 400 справа, матовое стекло, въезжает сбоку.
class CallSettingsSidePanel extends StatefulWidget {
  final String? peerId;
  final String? peerName;
  final VoidCallback onClose;
  const CallSettingsSidePanel({
    super.key,
    required this.onClose,
    this.peerId,
    this.peerName,
  });

  @override
  State<CallSettingsSidePanel> createState() => _CallSettingsSidePanelState();
}

class _CallSettingsSidePanelState extends State<CallSettingsSidePanel>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: CallMotion.slow)
    ..forward();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _c,
      builder: (context, child) {
        final t = CallMotion.ease.transform(_c.value);
        return Opacity(
          opacity: t,
          child: Transform.translate(offset: Offset(36 * (1 - t), 0), child: child),
        );
      },
      child: Align(
        alignment: Alignment.centerRight,
        child: SizedBox(
          width: CallGeometry.panelWidth,
          height: double.infinity,
          child: Glass(
            blur: 40,
            radius: BorderRadius.zero,
            color: CallColors.panelGlass,
            border: Colors.transparent,
            child: Container(
              decoration: BoxDecoration(
                border: Border(left: BorderSide(color: CallColors.stroke)),
              ),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(26, 26, 18, 18),
                  child: Row(children: [
                    Expanded(child: Text('Настройки звонка', style: CallText.panelTitle)),
                    _IconSquare(glyph: CallGlyphs.close, onTap: widget.onClose, tooltip: 'Закрыть'),
                  ]),
                ),
                Expanded(
                  child: ScrollConfiguration(
                    behavior: const _ThinScrollBehavior(),
                    child: SingleChildScrollView(
                      padding: const EdgeInsets.fromLTRB(26, 0, 22, 30),
                      child: CallSettingsPanel(peerId: widget.peerId, peerName: widget.peerName),
                    ),
                  ),
                ),
              ]),
            ),
          ),
        ),
      ),
    );
  }
}

/// Полоски прокрутки — тонкие, без стрелок и трека.
class _ThinScrollBehavior extends ScrollBehavior {
  const _ThinScrollBehavior();

  @override
  Widget buildScrollbar(BuildContext context, Widget child, ScrollableDetails details) {
    return RawScrollbar(
      controller: details.controller,
      thickness: 4,
      radius: const Radius.circular(999),
      thumbColor: Colors.white.withValues(alpha: 0.10),
      child: child,
    );
  }
}

/// Выбор устройства: строка со значением, раскрывающаяся списком.
class _DevicePicker extends StatelessWidget {
  final String id;
  final String label;
  final List<CallDevice> devices;
  final String? value;

  /// Что система отдаёт разговорам сама — показываем рядом с «как в системе»,
  /// чтобы этот пункт не был котом в мешке.
  final String? systemLabel;
  final bool open;
  final VoidCallback onToggle;
  final ValueChanged<String?> onChanged;

  const _DevicePicker({
    required this.id,
    required this.label,
    required this.devices,
    required this.value,
    required this.open,
    required this.onToggle,
    required this.onChanged,
    this.systemLabel,
  });

  @override
  Widget build(BuildContext context) {
    // Запомненного устройства может уже не быть — показываем системное, чтобы
    // список не врал про то, что сейчас работает.
    final known = value != null && devices.any((d) => d.id == value);
    final current = known
        ? devices.firstWhere((d) => d.id == value).label
        : (systemLabel == null ? 'Как в системе' : 'Как в системе · $systemLabel');

    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(label, style: CallText.rowHint.copyWith(color: CallColors.textFaint)),
      const SizedBox(height: 6),
      _PickerRow(value: current, open: open, onTap: onToggle),
      AnimatedSize(
        duration: CallMotion.base,
        curve: CallMotion.ease,
        alignment: Alignment.topCenter,
        child: !open
            ? const SizedBox(width: double.infinity)
            : Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Container(
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.025),
                    borderRadius: BorderRadius.circular(13),
                    border: Border.all(color: Colors.white.withValues(alpha: 0.06)),
                  ),
                  clipBehavior: Clip.antiAlias,
                  child: Column(children: [
                    _DeviceOption(
                      label: systemLabel == null ? 'Как в системе' : 'Как в системе · $systemLabel',
                      selected: !known,
                      onTap: () => onChanged(null),
                    ),
                    for (final d in devices)
                      _DeviceOption(
                        label: d.label,
                        selected: known && d.id == value,
                        onTap: () => onChanged(d.id),
                      ),
                    if (devices.isEmpty)
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 12),
                        child: Align(
                          alignment: Alignment.centerLeft,
                          child: Text('Устройств не найдено', style: CallText.rowHint),
                        ),
                      ),
                  ]),
                ),
              ),
      ),
    ]);
  }
}

class _PickerRow extends StatefulWidget {
  final String value;
  final bool open;
  final VoidCallback onTap;
  const _PickerRow({required this.value, required this.open, required this.onTap});

  @override
  State<_PickerRow> createState() => _PickerRowState();
}

class _PickerRowState extends State<_PickerRow> {
  bool _hover = false;

  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      cursor: SystemMouseCursors.click,
      onEnter: (_) => setState(() => _hover = true),
      onExit: (_) => setState(() => _hover = false),
      child: GestureDetector(
        onTap: widget.onTap,
        child: AnimatedContainer(
          duration: CallMotion.fast,
          curve: CallMotion.ease,
          padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 13),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: _hover ? 0.07 : 0.035),
            borderRadius: BorderRadius.circular(13),
            border: Border.all(
              color: Colors.white.withValues(alpha: _hover ? 0.12 : 0.06),
            ),
          ),
          child: Row(children: [
            Expanded(
              child: Text(
                widget.value,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontFamily: CallText.family,
                  fontSize: 13,
                  color: CallColors.textBody,
                ),
              ),
            ),
            const SizedBox(width: 10),
            CallIcon(
              widget.open ? CallGlyphs.chevronUp : CallGlyphs.chevronDown,
              size: 10,
              color: CallColors.textFaint,
            ),
          ]),
        ),
      ),
    );
  }
}

class _DeviceOption extends StatefulWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;
  const _DeviceOption({required this.label, required this.selected, required this.onTap});

  @override
  State<_DeviceOption> createState() => _DeviceOptionState();
}

class _DeviceOptionState extends State<_DeviceOption> {
  bool _hover = false;

  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      cursor: SystemMouseCursors.click,
      onEnter: (_) => setState(() => _hover = true),
      onExit: (_) => setState(() => _hover = false),
      child: GestureDetector(
        onTap: widget.onTap,
        behavior: HitTestBehavior.opaque,
        child: AnimatedContainer(
          duration: CallMotion.fast,
          curve: CallMotion.ease,
          padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 11),
          color: _hover ? Colors.white.withValues(alpha: 0.05) : Colors.transparent,
          child: Row(children: [
            AnimatedContainer(
              duration: CallMotion.fast,
              width: 6,
              height: 6,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: widget.selected ? CallColors.gold : Colors.white.withValues(alpha: 0.14),
                boxShadow: widget.selected
                    ? [BoxShadow(color: CallColors.gold.withValues(alpha: 0.7), blurRadius: 10)]
                    : const [],
              ),
            ),
            const SizedBox(width: 11),
            Expanded(
              child: Text(
                widget.label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontFamily: CallText.family,
                  fontSize: 12.5,
                  color: widget.selected ? CallColors.textStrong : CallColors.textMuted,
                ),
              ),
            ),
          ]),
        ),
      ),
    );
  }
}

/// Строка обработки звука.
class _ProcessingRow extends StatelessWidget {
  final String title;
  final String hint;
  final bool value;
  final ValueChanged<bool> onChanged;
  const _ProcessingRow({
    required this.title,
    required this.hint,
    required this.value,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      cursor: SystemMouseCursors.click,
      child: GestureDetector(
        onTap: () => onChanged(!value),
        behavior: HitTestBehavior.opaque,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 13, horizontal: 2),
          child: Row(children: [
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(title, style: CallText.row.copyWith(color: Colors.white.withValues(alpha: 0.82))),
                const SizedBox(height: 3),
                Text(hint, style: CallText.rowHint),
              ]),
            ),
            const SizedBox(width: 16),
            CallSwitch(value: value, onChanged: onChanged),
          ]),
        ),
      ),
    );
  }
}

/// Ползунок: нить в 2 пикселя и светящаяся костяшка 12.
class _ThinSlider extends StatelessWidget {
  final double value;
  final double max;
  final ValueChanged<double> onChanged;
  const _ThinSlider({required this.value, required this.max, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return SliderTheme(
      data: SliderThemeData(
        trackHeight: 2,
        activeTrackColor: const Color(0xFFF0E8D8).withValues(alpha: 0.95),
        inactiveTrackColor: Colors.white.withValues(alpha: 0.12),
        thumbColor: const Color(0xFFF0E8D8),
        overlayColor: CallColors.gold.withValues(alpha: 0.14),
        thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 6, elevation: 0, pressedElevation: 0),
        overlayShape: const RoundSliderOverlayShape(overlayRadius: 14),
        trackShape: const RectangularSliderTrackShape(),
        // Делений не рисуем: значение читается по надписи справа сверху.
        showValueIndicator: ShowValueIndicator.never,
      ),
      child: SizedBox(
        height: 16,
        child: Slider(value: value.clamp(0, max), max: max, onChanged: onChanged),
      ),
    );
  }
}

/// Небольшая кнопка-пилюля внутри карточки.
class _TextPill extends StatefulWidget {
  final String label;
  final bool active;
  final VoidCallback onTap;
  const _TextPill({required this.label, required this.active, required this.onTap});

  @override
  State<_TextPill> createState() => _TextPillState();
}

class _TextPillState extends State<_TextPill> {
  bool _hover = false;

  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      cursor: SystemMouseCursors.click,
      onEnter: (_) => setState(() => _hover = true),
      onExit: (_) => setState(() => _hover = false),
      child: GestureDetector(
        onTap: widget.onTap,
        child: AnimatedContainer(
          duration: CallMotion.fast,
          curve: CallMotion.ease,
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(999),
            color: widget.active
                ? CallColors.gold.withValues(alpha: 0.14)
                : Colors.white.withValues(alpha: _hover ? 0.12 : 0.07),
            border: Border.all(
              color: widget.active ? CallColors.goldStroke : Colors.white.withValues(alpha: 0.08),
            ),
          ),
          child: Text(
            widget.label.toUpperCase(),
            style: TextStyle(
              fontFamily: CallText.family,
              fontSize: 10.5,
              letterSpacing: 0.84,
              color: widget.active ? CallColors.gold : Colors.white.withValues(alpha: 0.62),
            ),
          ),
        ),
      ),
    );
  }
}

/// Квадратная кнопка-иконка в шапке панели.
class _IconSquare extends StatefulWidget {
  final CallGlyph glyph;
  final VoidCallback onTap;
  final String tooltip;
  const _IconSquare({required this.glyph, required this.onTap, required this.tooltip});

  @override
  State<_IconSquare> createState() => _IconSquareState();
}

class _IconSquareState extends State<_IconSquare> {
  bool _hover = false;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: widget.tooltip,
      child: MouseRegion(
        cursor: SystemMouseCursors.click,
        onEnter: (_) => setState(() => _hover = true),
        onExit: (_) => setState(() => _hover = false),
        child: GestureDetector(
          onTap: widget.onTap,
          child: AnimatedContainer(
            duration: CallMotion.fast,
            curve: CallMotion.ease,
            width: 30,
            height: 30,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(9),
              color: _hover ? Colors.white.withValues(alpha: 0.07) : Colors.transparent,
            ),
            child: CallIcon(
              widget.glyph,
              size: 11,
              color: _hover ? Colors.white : CallColors.textFaint,
            ),
          ),
        ),
      ),
    );
  }
}
