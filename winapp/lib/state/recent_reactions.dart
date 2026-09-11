import 'package:flutter/foundation.dart';

import '../storage/prefs.dart';

/// Последние использованные реакции — для короткой полосы над меню сообщения.
///
/// Живут на этом компьютере, как и прочие настройки поведения окна: это
/// привычка руки, а не данные аккаунта.
class RecentReactions extends ChangeNotifier {
  RecentReactions._();
  static final instance = RecentReactions._();

  static const _key = 'vellin_recent_reactions';

  /// Короткая полоса вмещает столько реакций.
  static const quickCount = 7;

  /// Набор до первой реакции: сердце, лайк, дизлайк, смех, улыбка, грусть, огонь.
  static const defaults = ['❤️', '👍', '👎', '😂', '😊', '😢', '🔥'];

  final List<String> _recent = [];

  Future<void> load() async {
    try {
      final p = await openPrefs();
      _recent
        ..clear()
        ..addAll(p.getStringList(_key) ?? const []);
      notifyListeners();
    } catch (_) {
      // Нет истории — полоса покажет стандартный набор.
    }
  }

  /// Полоса: сначала недавние, остаток добивается стандартными без повторов.
  List<String> get quick {
    final out = <String>[];
    for (final e in [..._recent, ...defaults]) {
      if (!out.contains(e)) out.add(e);
      if (out.length == quickCount) break;
    }
    return out;
  }

  /// Реакцию поставили — она встаёт первой.
  Future<void> use(String emoji) async {
    _recent
      ..remove(emoji)
      ..insert(0, emoji);
    if (_recent.length > 24) _recent.removeRange(24, _recent.length);
    notifyListeners();
    try {
      final p = await openPrefs();
      await p.setStringList(_key, List.of(_recent));
    } catch (_) {}
  }
}
