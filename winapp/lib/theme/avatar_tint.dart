import 'package:flutter/material.dart';

/// Цвет градиент-заглушки аватара (когда картинка не загружена).
///
/// Хеш считается вручную (FNV-1a), а НЕ через `String.hashCode`: Dart
/// рандомизирует хеш строк для каждого процесса, поэтому один и тот же
/// пользователь получал разные цвета в приложении и во всплывающем
/// уведомлении (оно живёт отдельным процессом), да и просто менял цвет после
/// перезапуска.
Color avatarTint(String seed, String fallback) {
  final key = seed.isEmpty ? fallback : seed;
  var hash = 0x811c9dc5;
  for (final unit in key.codeUnits) {
    hash ^= unit;
    hash = (hash * 0x01000193) & 0xFFFFFFFF;
  }
  return HSLColor.fromAHSL(1, (hash % 360).toDouble(), 0.5, 0.4).toColor();
}
