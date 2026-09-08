import 'dart:async';
import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import '../runtime/media_gate.dart';
import '../theme/vellin_design.dart';
import 'ui/vellin_button.dart';
import 'ui/vellin_hover.dart';
import 'ui/vellin_surfaces.dart';

/// Результат записи кружка: путь к файлу + длительность в секундах.
typedef CircleRecording = ({String path, int seconds});

/// Открывает модалку записи видео-кружка (круглая превью вебки). Возвращает
/// запись или null, если отменили/нет камеры.
Future<CircleRecording?> showCircleRecorder(BuildContext context) {
  return showDialog<CircleRecording?>(
    context: context,
    barrierDismissible: false,
    builder: (_) => const _CircleRecorderDialog(),
  );
}

class _CircleRecorderDialog extends StatefulWidget {
  const _CircleRecorderDialog();
  @override
  State<_CircleRecorderDialog> createState() => _CircleRecorderDialogState();
}

class _CircleRecorderDialogState extends State<_CircleRecorderDialog> {
  CameraController? _cam;
  String? _error;
  bool _recording = false;
  int _seconds = 0;
  Timer? _timer;
  static const _maxSeconds = 60;

  @override
  void initState() {
    super.initState();
    _init();
  }

  Future<void> _init() async {
    // Камера и микрофон монопольны: пока идёт звонок, кружок записать нечем, а
    // начавшийся звонок закрывает это окно сам.
    if (!MediaGate.instance.beginRecording(_closeForCall)) {
      setState(() => _error = 'Идёт звонок');
      return;
    }
    try {
      final cams = await availableCameras();
      if (cams.isEmpty) {
        setState(() => _error = 'Камера не найдена');
        return;
      }
      final cam = CameraController(cams.first, ResolutionPreset.medium, enableAudio: true);
      await cam.initialize();
      if (!mounted) return;
      setState(() => _cam = cam);
    } catch (e) {
      if (mounted) setState(() => _error = 'Нет доступа к камере');
    }
  }

  /// Звонок забрал устройства: запись бросаем, окно закрываем без результата.
  Future<void> _closeForCall() async {
    _timer?.cancel();
    try {
      if (_recording) await _cam?.stopVideoRecording();
    } catch (_) {}
    _recording = false;
    if (mounted) Navigator.of(context).pop(null);
  }

  @override
  void dispose() {
    _timer?.cancel();
    MediaGate.instance.endRecording();
    _cam?.dispose();
    super.dispose();
  }

  Future<void> _startStop() async {
    final cam = _cam;
    if (cam == null) return;
    if (!_recording) {
      await cam.startVideoRecording();
      setState(() {
        _recording = true;
        _seconds = 0;
      });
      _timer = Timer.periodic(const Duration(seconds: 1), (_) {
        setState(() => _seconds++);
        if (_seconds >= _maxSeconds) _stopAndReturn();
      });
    } else {
      await _stopAndReturn();
    }
  }

  Future<void> _stopAndReturn() async {
    final cam = _cam;
    if (cam == null || !_recording) return;
    _timer?.cancel();
    final file = await cam.stopVideoRecording();
    final seconds = _seconds;
    if (!mounted) return;
    Navigator.of(context).pop((path: file.path, seconds: seconds < 1 ? 1 : seconds));
  }

  String _fmt(int s) => '0:${(s % 60).toString().padLeft(2, '0')}';

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: VellinColors.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(VellinRadius.card),
        side: const BorderSide(color: VellinColors.line06),
      ),
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Text('Видео-кружок', style: VellinType.paneTitle),
          const SizedBox(height: 20),
          SizedBox(
            width: 260,
            height: 260,
            child: _error != null
                ? Center(
                    child: Text(
                      _error!,
                      style: VellinType.body.copyWith(color: VellinColors.warning),
                    ),
                  )
                : _cam == null
                    // Ожидание камеры — скелет круга, а не крутящийся кружок.
                    ? const VellinSkeleton(width: 260, height: 260, radius: 130)
                    : ClipOval(
                        child: SizedBox.expand(
                          child: FittedBox(
                            fit: BoxFit.cover,
                            child: SizedBox(
                              width: _cam!.value.previewSize?.height ?? 260,
                              height: _cam!.value.previewSize?.width ?? 260,
                              child: CameraPreview(_cam!),
                            ),
                          ),
                        ),
                      ),
          ),
          const SizedBox(height: 16),
          if (_recording)
            Text(
              'Запись · ${_fmt(_seconds)}',
              style: VellinType.body.copyWith(
                fontSize: 13.5,
                color: VellinColors.accent,
                fontWeight: FontWeight.w600,
                fontFeatures: VellinType.tabular,
              ),
            )
          else
            Text(
              'Нажмите, чтобы записать (до 60 секунд)',
              style: VellinType.caption.copyWith(fontSize: 12.5),
            ),
          const SizedBox(height: 18),
          Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
            VellinButton(
              label: 'Отмена',
              tone: VellinButtonTone.ghost,
              onPressed: () => Navigator.of(context).pop(null),
            ),
            _ShutterButton(
              recording: _recording,
              onTap: _error == null && _cam != null ? _startStop : null,
            ),
            const SizedBox(width: 76),
          ]),
        ]),
      ),
    );
  }
}

/// Кнопка записи: золотой круг, во время записи — тёмный с квадратом внутри.
class _ShutterButton extends StatelessWidget {
  final bool recording;
  final VoidCallback? onTap;

  const _ShutterButton({required this.recording, this.onTap});

  @override
  Widget build(BuildContext context) {
    return VellinInteractive(
      onTap: onTap,
      focusRadius: BorderRadius.circular(30),
      builder: (context, s) {
        final hot = (s.hovered || s.pressed) && onTap != null;
        return AnimatedContainer(
          duration: VellinMotion.state,
          curve: VellinMotion.standard,
          width: 60,
          height: 60,
          decoration: BoxDecoration(
            color: recording ? VellinColors.surface : VellinColors.accent,
            shape: BoxShape.circle,
            border: Border.all(
              color: recording ? VellinColors.accentLineStrong : VellinColors.accent,
              width: 3,
            ),
            boxShadow: !recording && hot ? VellinShadow.accentButton : null,
          ),
          alignment: Alignment.center,
          // Квадрат «стоп» вырастает из точки — отдельной иконки не нужно.
          child: AnimatedContainer(
            duration: VellinMotion.state,
            curve: VellinMotion.standard,
            width: recording ? 20 : 0,
            height: recording ? 20 : 0,
            decoration: BoxDecoration(
              color: VellinColors.accent,
              borderRadius: BorderRadius.circular(5),
            ),
          ),
        );
      },
    );
  }
}
