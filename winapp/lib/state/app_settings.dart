import 'package:flutter/foundation.dart';
import 'package:flutter/scheduler.dart';
import '../storage/prefs.dart';

/// Настройки приложения: уведомления и оформление.
///
/// Живут на этом компьютере, а не в аккаунте: они про поведение окна, а не про
/// человека. Читаются один раз на старте и сохраняются по каждому изменению.
class AppSettings extends ChangeNotifier {
  static const _kToasts = 'vellin_toasts_enabled';
  static const _kToastPreview = 'vellin_toasts_preview';
  static const _kMessageSound = 'vellin_message_sound';
  static const _kRingtone = 'vellin_ringtone_enabled';
  static const _kReduceMotion = 'vellin_reduce_motion';
  static const _kTextScale = 'vellin_text_scale';
  static const _kPeerPanel = 'vellin_peer_panel_open';

  bool _toasts = true;
  bool _toastPreview = true;
  bool _messageSound = true;
  bool _ringtone = true;
  bool _reduceMotion = false;
  double _textScale = 1;
  bool _peerPanel = true;

  /// Показывать всплывающие уведомления, когда окно не в фокусе.
  bool get toasts => _toasts;

  /// Показывать в них текст сообщения. Выключено — только «Новое сообщение».
  bool get toastPreview => _toastPreview;

  /// Звук новой реплики в личных сообщениях.
  bool get messageSound => _messageSound;

  /// Мелодия входящего звонка. Гудки собеседнику она не отключает.
  bool get ringtone => _ringtone;

  /// Ускоренные переходы: то же движение, но втрое короче.
  bool get reduceMotion => _reduceMotion;

  /// Масштаб текста: 0.9 · 1.0 · 1.1.
  double get textScale => _textScale;

  /// Боковая панель собеседника в чате. Новому человеку она открыта — закроет
  /// сам, и тогда выбор сохранится.
  bool get peerPanelOpen => _peerPanel;

  Future<void> load() async {
    try {
      final p = await openPrefs();
      _toasts = p.getBool(_kToasts) ?? true;
      _toastPreview = p.getBool(_kToastPreview) ?? true;
      _messageSound = p.getBool(_kMessageSound) ?? true;
      _ringtone = p.getBool(_kRingtone) ?? true;
      _reduceMotion = p.getBool(_kReduceMotion) ?? false;
      _textScale = p.getDouble(_kTextScale) ?? 1;
      _peerPanel = p.getBool(_kPeerPanel) ?? true;
    } catch (_) {
      // Настройки не прочитались — работаем на значениях по умолчанию.
    }
    _applyMotion();
    notifyListeners();
  }

  Future<void> setToasts(bool v) => _setBool(_kToasts, v, () => _toasts = v);
  Future<void> setToastPreview(bool v) => _setBool(_kToastPreview, v, () => _toastPreview = v);
  Future<void> setMessageSound(bool v) => _setBool(_kMessageSound, v, () => _messageSound = v);
  Future<void> setRingtone(bool v) => _setBool(_kRingtone, v, () => _ringtone = v);
  Future<void> setPeerPanelOpen(bool v) => _setBool(_kPeerPanel, v, () => _peerPanel = v);

  Future<void> setReduceMotion(bool v) async {
    await _setBool(_kReduceMotion, v, () => _reduceMotion = v);
    _applyMotion();
  }

  Future<void> setTextScale(double v) async {
    _textScale = v;
    notifyListeners();
    try {
      final p = await openPrefs();
      await p.setDouble(_kTextScale, v);
    } catch (_) {}
  }

  Future<void> _setBool(String key, bool value, VoidCallback apply) async {
    apply();
    notifyListeners();
    try {
      final p = await openPrefs();
      await p.setBool(key, value);
    } catch (_) {}
  }

  /// Ускорение переходов — через общий множитель времени анимаций: длительности
  /// в токенах трогать нельзя, иначе движение разъедется по разным файлам.
  void _applyMotion() {
    timeDilation = _reduceMotion ? 0.35 : 1.0;
  }
}
