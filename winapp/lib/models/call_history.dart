// Модели истории звонков, зеркалят типы `@vellin/shared` (domain.ts/api.ts).
import 'social.dart';

/// Одна строка истории звонков.
class CallHistoryEntry {
  final String id;
  final PublicUser peer;

  /// 'outgoing' — звонил я, 'incoming' — мне.
  final String direction;

  /// 'audio' | 'video'.
  final String kind;

  /// 'completed' | 'missed' | 'declined' | 'cancelled' | 'failed'.
  final String outcome;

  final int durationSec;
  final String createdAt;

  const CallHistoryEntry({
    required this.id,
    required this.peer,
    required this.direction,
    required this.kind,
    required this.outcome,
    required this.durationSec,
    required this.createdAt,
  });

  bool get outgoing => direction == 'outgoing';
  bool get completed => outcome == 'completed';
  bool get missed => outcome == 'missed';

  factory CallHistoryEntry.fromJson(Map<String, dynamic> j) => CallHistoryEntry(
        id: j['id'] as String? ?? '',
        peer: PublicUser.fromJson(j['peer'] as Map<String, dynamic>),
        direction: j['direction'] as String? ?? 'incoming',
        kind: j['kind'] as String? ?? 'audio',
        outcome: j['outcome'] as String? ?? 'completed',
        durationSec: (j['durationSec'] as num?)?.toInt() ?? 0,
        createdAt: j['createdAt'] as String? ?? '',
      );
}
