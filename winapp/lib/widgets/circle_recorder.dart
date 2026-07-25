import 'dart:async';
import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import '../theme/vellin_theme.dart';

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

  @override
  void dispose() {
    _timer?.cancel();
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
      backgroundColor: VellinColors.bg1,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(VellinRadius.xl)),
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const Text('Видео-кружок', style: TextStyle(color: VellinColors.text0, fontSize: 17, fontWeight: FontWeight.w600)),
          const SizedBox(height: 20),
          SizedBox(
            width: 260,
            height: 260,
            child: _error != null
                ? Center(child: Text(_error!, style: const TextStyle(color: VellinColors.text2)))
                : _cam == null
                    ? const Center(child: CircularProgressIndicator(color: VellinColors.accentHi))
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
            Text('Запись · ${_fmt(_seconds)}', style: const TextStyle(color: VellinColors.accentHi, fontSize: 14, fontWeight: FontWeight.w600))
          else
            const Text('Нажмите, чтобы записать (до 60с)', style: TextStyle(color: VellinColors.text2, fontSize: 13)),
          const SizedBox(height: 16),
          Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(null),
              style: TextButton.styleFrom(foregroundColor: VellinColors.text1),
              child: const Text('Отмена'),
            ),
            GestureDetector(
              onTap: _error == null && _cam != null ? _startStop : null,
              child: Container(
                width: 60,
                height: 60,
                decoration: BoxDecoration(
                  color: _recording ? VellinColors.bg3 : VellinColors.accent,
                  shape: BoxShape.circle,
                  border: Border.all(color: VellinColors.accent, width: 3),
                ),
                child: Icon(_recording ? Icons.stop : Icons.fiber_manual_record, color: _recording ? VellinColors.accent : Colors.white, size: 28),
              ),
            ),
            const SizedBox(width: 60),
          ]),
        ]),
      ),
    );
  }
}
