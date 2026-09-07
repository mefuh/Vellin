import 'package:flutter/widgets.dart';

import '../../app_config.dart';
import '../../models/dm.dart';
import '../../models/social.dart';
import '../../theme/vellin_design.dart';
import '../../theme/vellin_glyphs.dart';
import '../ui/vellin_avatar.dart';
import '../ui/vellin_icon.dart';
import '../video_bubble.dart';
import '../voice_bubble.dart';
import 'room_invite_card.dart';

/// Реплика в ленте: аватар слева, строка автора, баббл.
///
/// Все реплики выровнены по левому краю — и свои, и чужие. Своё отличается не
/// стороной, а золотом: подписью «Вы», обводкой аватара и заливкой баббла.
class MessageRow extends StatelessWidget {
  final DirectMessage message;
  final bool mine;

  /// Первая реплика в группе от одного отправителя: только у неё рисуются
  /// аватар и строка автора, остальные идут отступом.
  final bool groupStart;

  final PublicUser? peer;
  final String myUsername;
  final String? myAvatarUrl;

  /// Собеседник прочитал переписку до этого момента (для галочек).
  final DateTime? peerReadAt;

  final void Function(String messageId)? onVoicePlayed;
  final void Function(String url)? onImageTap;

  const MessageRow({
    super.key,
    required this.message,
    required this.mine,
    required this.groupStart,
    required this.peer,
    required this.myUsername,
    required this.myAvatarUrl,
    required this.peerReadAt,
    this.onVoicePlayed,
    this.onImageTap,
  });

  @override
  Widget build(BuildContext context) {
    if (message.isCallRecord) return _CallRecord(message: message, mine: mine);

    final name = mine ? 'Вы' : (peer?.username ?? '');
    final read = mine && _isRead;

    return Padding(
      padding: EdgeInsets.only(top: groupStart ? 12 : 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 38,
            child: groupStart
                ? Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: VellinAvatar(
                      username: mine ? myUsername : (peer?.username ?? ''),
                      avatarUrl: mine ? myAvatarUrl : peer?.avatarUrl,
                      size: 28,
                      ringColor: mine ? const Color(0x57E2C99B) : VellinColors.line07,
                      bedColor: VellinColors.bg1,
                    ),
                  )
                : null,
          ),
          Flexible(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (groupStart) ...[
                  Row(
                    children: [
                      Text(
                        name,
                        style: VellinType.author.copyWith(
                          color: mine ? VellinColors.accent : VellinColors.ink62,
                        ),
                      ),
                      const SizedBox(width: 7),
                      Text(_time(message.createdAt), style: VellinType.time),
                      if (mine) ...[
                        const SizedBox(width: 7),
                        _Ticks(read: read, pending: message.pending),
                      ],
                    ],
                  ),
                  const SizedBox(height: 4),
                ],
                _body(context),
              ],
            ),
          ),
        ],
      ),
    );
  }

  bool get _isRead {
    final at = peerReadAt;
    if (at == null) return false;
    final sent = DateTime.tryParse(message.createdAt);
    return sent != null && !sent.isAfter(at);
  }

  Widget _body(BuildContext context) {
    if (message.voiceUrl != null) {
      return _Bubble(
        mine: mine,
        padding: const EdgeInsets.fromLTRB(10, 8, 12, 8),
        child: VoiceBubble(
          messageId: message.id,
          url: AppConfig.mediaUrl(message.voiceUrl)!,
          durationSec: message.voiceDurationSec ?? 0,
          peaks: message.voicePeaks ?? const [],
          mine: mine,
          played: message.voicePlayed,
          peerPublicId: peer?.publicId ?? '',
          peerName: mine ? myUsername : (peer?.username ?? ''),
          peerAvatarUrl: mine ? myAvatarUrl : peer?.avatarUrl,
          onFirstPlay: mine ? null : () => onVoicePlayed?.call(message.id),
        ),
      );
    }

    if (message.videoStatus != null) {
      return VideoBubble(
        status: message.videoStatus,
        videoUrl: AppConfig.mediaUrl(message.videoUrl),
        thumbUrl: AppConfig.mediaUrl(message.videoThumbUrl),
        mine: mine,
      );
    }

    if (message.inviteRoomId != null) {
      return RoomInviteCard(messageId: message.id, mine: mine);
    }

    if (message.imageUrl != null) {
      final url = AppConfig.mediaUrl(message.imageUrl);
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _ImageBubble(url: url, mine: mine, onTap: url == null ? null : () => onImageTap?.call(url)),
          if (message.body.isNotEmpty) ...[
            const SizedBox(height: 4),
            _Bubble(mine: mine, child: _text(message.body)),
          ],
        ],
      );
    }

    return _Bubble(mine: mine, child: _text(message.body));
  }

  Widget _text(String body) => Text(
        body,
        style: VellinType.body.copyWith(
          color: mine ? const Color(0xEBFFF8EB) : VellinColors.ink88,
        ),
      );

  static String _time(String iso) {
    final t = DateTime.tryParse(iso)?.toLocal();
    if (t == null) return '';
    return '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';
  }
}

/// Оболочка баббла: острый верхний левый угол — «хвост» к аватару.
class _Bubble extends StatelessWidget {
  final Widget child;
  final bool mine;
  final EdgeInsets padding;

  const _Bubble({
    required this.child,
    required this.mine,
    this.padding = const EdgeInsets.symmetric(horizontal: 13, vertical: 9),
  });

  @override
  Widget build(BuildContext context) {
    return ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 620),
      child: Container(
        padding: padding,
        decoration: BoxDecoration(
          color: mine ? VellinColors.accentWash : VellinColors.bubble,
          borderRadius: VellinRadius.bubble,
          border: Border.all(color: mine ? VellinColors.accentLine : VellinColors.line06),
        ),
        child: child,
      ),
    );
  }
}

/// Изображение: рамка баббла, кадр 232×150, курсор увеличения.
class _ImageBubble extends StatefulWidget {
  final String? url;
  final bool mine;
  final VoidCallback? onTap;

  const _ImageBubble({required this.url, required this.mine, this.onTap});

  @override
  State<_ImageBubble> createState() => _ImageBubbleState();
}

class _ImageBubbleState extends State<_ImageBubble> with SingleTickerProviderStateMixin {
  late final AnimationController _in = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 480),
  )..forward();

  @override
  void dispose() {
    _in.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final curve = CurvedAnimation(parent: _in, curve: VellinMotion.standard);

    return FadeTransition(
      opacity: curve,
      child: AnimatedBuilder(
        animation: curve,
        builder: (context, child) => Transform.translate(
          offset: Offset(0, 6 * (1 - curve.value)),
          child: Transform.scale(scale: 0.94 + 0.06 * curve.value, alignment: Alignment.topLeft, child: child),
        ),
        child: MouseRegion(
          cursor: widget.onTap == null ? MouseCursor.defer : SystemMouseCursors.zoomIn,
          child: GestureDetector(
            onTap: widget.onTap,
            child: Container(
              width: 232,
              padding: const EdgeInsets.all(4),
              decoration: BoxDecoration(
                color: widget.mine ? VellinColors.accentWash : VellinColors.bubble,
                borderRadius: VellinRadius.bubble,
                border: Border.all(color: widget.mine ? VellinColors.accentLine : VellinColors.line06),
              ),
              child: ClipRRect(
                borderRadius: const BorderRadius.only(
                  topLeft: Radius.circular(2),
                  topRight: Radius.circular(10),
                  bottomLeft: Radius.circular(10),
                  bottomRight: Radius.circular(10),
                ),
                child: widget.url == null
                    ? Container(height: 150, color: VellinColors.skeleton)
                    : Image.network(
                        widget.url!,
                        height: 150,
                        width: double.infinity,
                        fit: BoxFit.cover,
                        errorBuilder: (_, _, _) => Container(height: 150, color: VellinColors.skeleton),
                      ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Галочки статуса: одна — доставлено, две золотые с подписью — прочитано.
/// Линии прочерчиваются, а не появляются целиком.
class _Ticks extends StatefulWidget {
  final bool read;
  final bool pending;
  const _Ticks({required this.read, required this.pending});

  @override
  State<_Ticks> createState() => _TicksState();
}

class _TicksState extends State<_Ticks> with SingleTickerProviderStateMixin {
  late final AnimationController _draw = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 500),
  )..forward();

  @override
  void didUpdateWidget(_Ticks old) {
    super.didUpdateWidget(old);
    // Вторая галочка приезжает позже первой — прочерчиваем её заново.
    if (old.read != widget.read) _draw.forward(from: 0);
  }

  @override
  void dispose() {
    _draw.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.pending) {
      return Text('отправляется', style: VellinType.time.copyWith(color: VellinColors.ink24));
    }

    return AnimatedBuilder(
      animation: _draw,
      builder: (context, _) {
        final t = VellinMotion.standard.transform(_draw.value);
        if (!widget.read) {
          return VellinIcon(
            VellinGlyphs.tickSingle,
            size: 13,
            box: const Size(13, 11),
            color: VellinColors.ink34,
            progress: t,
          );
        }
        return Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            VellinIcon(
              VellinGlyphs.tickDouble,
              size: 18,
              box: const Size(18, 11),
              color: VellinColors.accent,
              progress: t,
            ),
            const SizedBox(width: 6),
            Opacity(
              opacity: t,
              child: Text(
                'прочитано',
                style: VellinType.time.copyWith(fontSize: 10, color: const Color(0x99E2C99B)),
              ),
            ),
          ],
        );
      },
    );
  }
}

/// Запись о звонке в переписке: не реплика, а отметка события.
class _CallRecord extends StatelessWidget {
  final DirectMessage message;
  final bool mine;
  const _CallRecord({required this.message, required this.mine});

  @override
  Widget build(BuildContext context) {
    final missed = message.callOutcome == 'missed';
    final failed = message.callOutcome == 'failed' || message.callOutcome == 'declined';
    final color = missed ? VellinColors.danger : VellinColors.ink45;

    return Padding(
      padding: const EdgeInsets.only(top: 12, left: 38),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: VellinColors.fill03,
          borderRadius: BorderRadius.circular(VellinRadius.row),
          border: Border.all(color: VellinColors.line06),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            VellinIcon(
              message.callKind == 'video' ? VellinGlyphs.camera : VellinGlyphs.calls,
              size: 14,
              box: message.callKind == 'video' ? const Size(18, 18) : const Size(18, 18),
              color: color,
            ),
            const SizedBox(width: 8),
            Text(
              _label(missed, failed),
              style: VellinType.caption.copyWith(fontSize: 12.5, color: color),
            ),
            if (message.callDurationSec != null && message.callDurationSec! > 0) ...[
              const SizedBox(width: 8),
              Text(
                _duration(message.callDurationSec!),
                style: VellinType.caption.copyWith(
                  fontSize: 12,
                  color: VellinColors.ink28,
                  fontFeatures: VellinType.tabular,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  String _label(bool missed, bool failed) {
    if (missed) return mine ? 'Не дозвонились' : 'Пропущенный звонок';
    if (message.callOutcome == 'declined') return mine ? 'Звонок отклонён' : 'Вы отклонили звонок';
    if (message.callOutcome == 'cancelled') return 'Отменённый звонок';
    if (failed) return 'Звонок не состоялся';
    return mine ? 'Исходящий звонок' : 'Входящий звонок';
  }

  static String _duration(int sec) =>
      '${(sec ~/ 60).toString().padLeft(1, '0')}:${(sec % 60).toString().padLeft(2, '0')}';
}
