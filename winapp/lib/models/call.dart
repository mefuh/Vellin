// Модели звонка в личных сообщениях, зеркалят `@vellin/shared` (domain.ts).

import 'social.dart';

/// Состояние микрофона и камеры одной стороны.
class DmCallMediaState {
  final bool audio;
  final bool video;
  const DmCallMediaState({required this.audio, required this.video});

  factory DmCallMediaState.fromJson(Map<String, dynamic> j) => DmCallMediaState(
        audio: j['audio'] as bool? ?? true,
        video: j['video'] as bool? ?? false,
      );
}

/// Полное состояние звонка. Источник правды — сервер, клиент его отражает.
class DmCallSnapshot {
  final String callId;
  final String callerId;
  final String calleeId;
  final bool video;

  /// 'ringing' | 'active' | 'ended'.
  final String phase;
  final String createdAt;
  final String? answeredAt;
  final String? endReason;

  /// Соединения, ведущие разговор с каждой стороны. Своё сравниваем с ними,
  /// чтобы понять, наш ли это звонок или он идёт на другом устройстве.
  final String callerConnId;
  final String? calleeConnId;
  final Map<String, DmCallMediaState> media;

  const DmCallSnapshot({
    required this.callId,
    required this.callerId,
    required this.calleeId,
    required this.video,
    required this.phase,
    required this.createdAt,
    required this.answeredAt,
    required this.endReason,
    required this.callerConnId,
    required this.calleeConnId,
    required this.media,
  });

  factory DmCallSnapshot.fromJson(Map<String, dynamic> j) {
    final rawMedia = j['media'];
    final media = <String, DmCallMediaState>{};
    if (rawMedia is Map) {
      rawMedia.forEach((k, v) {
        if (v is Map<String, dynamic>) media['$k'] = DmCallMediaState.fromJson(v);
      });
    }
    return DmCallSnapshot(
      callId: j['callId'] as String? ?? '',
      callerId: j['callerId'] as String? ?? '',
      calleeId: j['calleeId'] as String? ?? '',
      video: j['video'] as bool? ?? false,
      phase: j['phase'] as String? ?? 'ended',
      createdAt: j['createdAt'] as String? ?? '',
      answeredAt: j['answeredAt'] as String?,
      endReason: j['endReason'] as String?,
      callerConnId: j['callerConnId'] as String? ?? '',
      calleeConnId: j['calleeConnId'] as String?,
      media: media,
    );
  }

  /// Снимок с обновлённым состоянием микрофона/камеры одной стороны.
  ///
  /// Сервер шлёт переключение камеры отдельным сообщением, а не новым снимком,
  /// поэтому состояние обновляет клиент — иначе включённая по ходу разговора
  /// камера собеседника не появилась бы на экране.
  DmCallSnapshot withMedia(String userId, DmCallMediaState state) => DmCallSnapshot(
        callId: callId,
        callerId: callerId,
        calleeId: calleeId,
        video: video,
        phase: phase,
        createdAt: createdAt,
        answeredAt: answeredAt,
        endReason: endReason,
        callerConnId: callerConnId,
        calleeConnId: calleeConnId,
        media: {...media, userId: state},
      );

  bool get isRinging => phase == 'ringing';
  bool get isActive => phase == 'active';
  bool get isEnded => phase == 'ended';

  /// Собеседник глазами пользователя [myUserId].
  String peerIdFor(String myUserId) => callerId == myUserId ? calleeId : callerId;

  /// Соединение, которое ведёт разговор со стороны [myUserId].
  String? connFor(String myUserId) => callerId == myUserId ? callerConnId : calleeConnId;
}

/// Входящий звонок: состояние + карточка звонящего.
class IncomingDmCall {
  final DmCallSnapshot call;
  final PublicUser from;
  const IncomingDmCall(this.call, this.from);
}
