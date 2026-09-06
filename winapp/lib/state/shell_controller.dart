import 'package:flutter/foundation.dart';

/// Раздел рейла. Раздел меняет ТОЛЬКО левую панель: открытый диалог или
/// профиль в правой области при переключении никуда не девается.
enum RailSection { messages, friends, calls }

/// Что показывает правая область.
enum RightPaneKind { empty, chat, profile }

/// Состояние оболочки: выбранный раздел, содержимое правой области и
/// открытость фрейма настроек.
///
/// Живёт отдельно от контроллеров данных: тем всё равно, что сейчас на экране,
/// а оболочке всё равно, откуда взялись сообщения и друзья.
class ShellController extends ChangeNotifier {
  RailSection _section = RailSection.messages;
  RightPaneKind _pane = RightPaneKind.empty;
  String? _profilePublicId;
  bool _settingsOpen = false;
  String _settingsTab = 'profile';

  RailSection get section => _section;
  RightPaneKind get pane => _pane;

  /// Чей профиль открыт в правой области (null — свой).
  String? get profilePublicId => _profilePublicId;

  bool get settingsOpen => _settingsOpen;
  String get settingsTab => _settingsTab;

  void selectSection(RailSection s) {
    if (_section == s) return;
    _section = s;
    notifyListeners();
  }

  /// Правая область показывает переписку. Сам тред открывает DmController —
  /// оболочка только знает, что теперь в правой области чат.
  void showChat() {
    if (_pane == RightPaneKind.chat) return;
    _pane = RightPaneKind.chat;
    notifyListeners();
  }

  /// Профиль поверх правой области. [publicId] null — свой профиль.
  void showProfile(String? publicId) {
    _pane = RightPaneKind.profile;
    _profilePublicId = publicId;
    notifyListeners();
  }

  /// Уйти из профиля: если диалог открыт — вернуться в него, иначе в пустоту.
  void closeProfile({required bool hasOpenChat}) {
    _pane = hasOpenChat ? RightPaneKind.chat : RightPaneKind.empty;
    _profilePublicId = null;
    notifyListeners();
  }

  void showEmpty() {
    _pane = RightPaneKind.empty;
    _profilePublicId = null;
    notifyListeners();
  }

  void openSettings([String? tab]) {
    _settingsOpen = true;
    if (tab != null) _settingsTab = tab;
    notifyListeners();
  }

  void closeSettings() {
    if (!_settingsOpen) return;
    _settingsOpen = false;
    notifyListeners();
  }

  void selectSettingsTab(String tab) {
    if (_settingsTab == tab) return;
    _settingsTab = tab;
    notifyListeners();
  }
}
