import 'dart:io';

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
import 'emoji_catalog.dart';
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
  final void Function(String messageId)? onVideoPlayed;
  final void Function(String url)? onImageTap;

  /// Мой id — чтобы подписать автора цитаты «Вы» или именем собеседника.
  final String myUserId;

  /// Режим выделения: слева появляется отметка, щелчок выбирает строку.
  final bool selecting;
  final bool selected;

  /// Над строкой открыто контекстное меню — она подсвечена, пока меню живо.
  final bool menuOpen;

  /// Номер вспышки: растёт, когда к сообщению прокрутили (закреп, цитата).
  final int flash;

  /// Сообщение удаляется — строка сворачивается.
  final bool removing;

  final void Function(DirectMessage message, Offset globalPosition)? onContextMenu;
  final VoidCallback? onToggleSelect;
  final void Function(String messageId)? onQuoteTap;

  /// Щелчок по плашке реакции: своя — снять, чужая — поставить такую же.
  final ValueChanged<String>? onReact;

  const MessageRow({
    super.key,
    required this.message,
    required this.mine,
    required this.groupStart,
    required this.peer,
    required this.myUsername,
    required this.myAvatarUrl,
    required this.peerReadAt,
    this.myUserId = '',
    this.selecting = false,
    this.selected = false,
    this.menuOpen = false,
    this.flash = 0,
    this.removing = false,
    this.onVoicePlayed,
    this.onVideoPlayed,
    this.onImageTap,
    this.onContextMenu,
    this.onToggleSelect,
    this.onQuoteTap,
    this.onReact,
  });

  @override
  Widget build(BuildContext context) {
    final content = message.isCallRecord ? _CallRecord(message: message, mine: mine) : _message(context);
    return _Collapse(
      removing: removing,
      child: _RowShell(
        selecting: selecting,
        selected: selected,
        menuOpen: menuOpen,
        flash: flash,
        topInset: message.isCallRecord || groupStart ? 12 : 4,
        onTap: selecting ? onToggleSelect : null,
        onSecondaryTapUp: selecting || message.pending || onContextMenu == null
            ? null
            : (d) => onContextMenu!(message, d.globalPosition),
        child: content,
      ),
    );
  }

  Widget _message(BuildContext context) {
    final name = mine ? 'Вы' : (peer?.username ?? '');
    final read = mine && _isRead;

    return Padding(
      // Отступ сверху ставит оболочка строки: подсветка меню и выделения
      // должна обнимать реплику, а не зазор над ней.
      padding: EdgeInsets.zero,
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
                  // В строке автора только имя: время и галочки переехали
                  // внутрь каждой реплики — так видно, что прочитано именно
                  // её, а не всю группу разом.
                  Text(
                    name,
                    style: VellinType.author.copyWith(
                      color: mine ? VellinColors.accent : VellinColors.ink62,
                    ),
                  ),
                  const SizedBox(height: 4),
                ],
                _body(context, read),
                _ReactionBar(
                  reactions: message.reactions,
                  myUserId: myUserId,
                  myUsername: myUsername,
                  myAvatarUrl: myAvatarUrl,
                  peer: peer,
                  onTap: selecting ? null : onReact,
                ),
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

  /// Пометка «переслано» и цитата ответа — над содержимым реплики.
  List<Widget> _header({double? maxWidth}) {
    final reply = message.replyTo;
    return [
      if (message.forwardedFromName != null)
        Padding(
          padding: const EdgeInsets.only(bottom: 5),
          child: _ForwardedLabel(name: message.forwardedFromName!, mine: mine),
        ),
      if (reply != null)
        Padding(
          padding: const EdgeInsets.only(bottom: 6),
          child: _ReplyQuote(
            ref: reply,
            mine: mine,
            author: reply.deleted
                ? ''
                : reply.senderId == myUserId
                    ? 'Вы'
                    : (peer?.username ?? ''),
            maxWidth: maxWidth,
            onTap: reply.deleted || onQuoteTap == null || selecting ? null : () => onQuoteTap!(reply.id),
          ),
        ),
    ];
  }

  /// Шапка отдельно от пузыря — у снимка, кружка и приглашения нет рамки,
  /// в которую её можно положить.
  Widget _withHeader(Widget child, {double? maxWidth}) {
    final header = _header(maxWidth: maxWidth);
    if (header.isEmpty) return child;
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [...header, child],
    );
  }

  Widget _body(BuildContext context, bool read) {
    if (message.voiceUrl != null) {
      return _Bubble(
        mine: mine,
        padding: const EdgeInsets.fromLTRB(10, 8, 12, 8),
        child: _withHeader(VoiceBubble(
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
          trailing: _Meta(
            time: _time(message.createdAt),
            mine: mine,
            read: read,
            pending: message.pending,
          ),
        ), maxWidth: 300),
      );
    }

    if (message.videoStatus != null) {
      return _withHeader(maxWidth: 240, VideoBubble(
        messageId: message.id,
        status: message.videoStatus,
        videoUrl: AppConfig.mediaUrl(message.videoUrl),
        thumbUrl: AppConfig.mediaUrl(message.videoThumbUrl),
        peerPublicId: peer?.publicId ?? '',
        peerName: mine ? myUsername : (peer?.username ?? ''),
        peerAvatarUrl: mine ? myAvatarUrl : peer?.avatarUrl,
        durationSec: message.videoDurationSec,
        sentAt: _Meta(
          time: _time(message.createdAt),
          mine: mine,
          read: read,
          pending: message.pending,
        ),
        played: message.videoPlayed,
        onFirstPlay: mine ? null : () => onVideoPlayed?.call(message.id),
        mine: mine,
      ));
    }

    if (message.inviteRoomId != null) {
      return _withHeader(RoomInviteCard(messageId: message.id, mine: mine), maxWidth: 300);
    }

    if (message.images.isNotEmpty) {
      final album = message.images.length > 1;
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ..._header(maxWidth: album ? _albumWidth : 232),
          _ImageBubble(
            images: message.images,
            mine: mine,
            uploading: message.pending,
            onTap: (i) {
              final url = AppConfig.mediaUrl(message.images[i].url);
              // Пока снимок грузится, ссылки у него нет — открывать нечего.
              if (url != null && message.images[i].url.isNotEmpty) onImageTap?.call(url);
            },
            meta: message.body.isEmpty
                ? _Meta(
                    time: _time(message.createdAt),
                    mine: mine,
                    read: read,
                    pending: message.pending,
                    edited: message.editedAt != null,
                  )
                : null,
            // Подпись — часть того же сообщения: живёт в рамке под снимками,
            // а не отдельным пузырём, который читается как новая реплика.
            caption: message.body.isEmpty
                ? null
                : Padding(
                    padding: const EdgeInsets.fromLTRB(9, 7, 9, 5),
                    child: _textWithMeta(read, fill: true),
                  ),
          ),
        ],
      );
    }

    final header = _header(maxWidth: 420);
    return _Bubble(
      mine: mine,
      child: header.isEmpty
          ? _textWithMeta(read)
          // Цитата или «переслано» бывают шире текста: пузырь по ширине самого
          // широкого, а строка текста растягивается до неё — метка встаёт у
          // правого края пузыря, а не сразу за коротким текстом.
          : IntrinsicWidth(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [...header, _textWithMeta(read, fill: true)],
              ),
            ),
    );
  }

  /// Текст с меткой времени в одной строке: короткая реплика и метка встают
  /// рядом, длинная переносится, и метка садится в конец последней строки.
  ///
  /// [fill] — строка занимает всю ширину пузыря, и метка прижата к его правому
  /// краю. Нужно, когда пузырь шире текста: подпись под снимками, текст под
  /// цитатой.
  Widget _textWithMeta(bool read, {bool fill = false}) {
    // Правка текста меняет размер пузыря плавно, а не скачком.
    final text = AnimatedSize(
      duration: VellinMotion.hover,
      curve: VellinMotion.standard,
      alignment: Alignment.topLeft,
      child: _text(message.body),
    );
    return Row(
      mainAxisSize: fill ? MainAxisSize.max : MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        if (fill) Expanded(child: Align(alignment: Alignment.bottomLeft, child: text)) else Flexible(child: text),
        const SizedBox(width: 9),
        Padding(
          // Метка стоит на базовой линии последней строки, а не по её верху.
          padding: const EdgeInsets.only(bottom: 1),
          child: _Meta(
            time: _time(message.createdAt),
            mine: mine,
            read: read,
            pending: message.pending,
            edited: message.editedAt != null,
          ),
        ),
      ],
    );
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

/// Ширина альбома в ленте. Одиночный снимок остаётся прежним — 232.
const double _albumWidth = 312;

/// Раскладка альбома по рядам: сколько снимков в каждом. Рядов не больше
/// трёх в ширину — мельче кадры уже не читаются.
List<int> _albumRows(int n) => switch (n) {
      1 => [1],
      2 => [2],
      3 => [1, 2],
      4 => [2, 2],
      5 => [2, 3],
      6 => [3, 3],
      7 => [1, 3, 3],
      8 => [2, 3, 3],
      9 => [3, 3, 3],
      _ => [1, 3, 3, 3],
    };

/// Высота ряда по числу кадров в нём: одиночный — крупный, тройка — ниже.
double _rowHeight(int inRow) => switch (inRow) {
      1 => 176,
      2 => 132,
      _ => 100,
    };

/// Снимок или альбом: рамка баббла, кадры с курсором увеличения.
class _ImageBubble extends StatelessWidget {
  final List<DmImage> images;
  final bool mine;

  /// Сообщение ещё отправляется — кадры под дышащей вуалью.
  final bool uploading;
  final void Function(int index) onTap;

  /// Время и галочки — капсулой поверх правого нижнего угла.
  final Widget? meta;

  /// Подпись под снимками в той же рамке (с её временем и галочками).
  final Widget? caption;

  const _ImageBubble({
    required this.images,
    required this.mine,
    required this.uploading,
    required this.onTap,
    this.meta,
    this.caption,
  });

  static const _gap = 2.0;

  @override
  Widget build(BuildContext context) {
    final album = images.length > 1;
    final width = album ? _albumWidth : 232.0;
    final rows = _albumRows(images.length);

    var index = 0;
    final rowWidgets = <Widget>[];
    for (var r = 0; r < rows.length; r++) {
      final count = rows[r];
      final height = album ? _rowHeight(count) : 150.0;
      final cells = <Widget>[];
      for (var c = 0; c < count; c++) {
        final i = index++;
        if (c > 0) cells.add(const SizedBox(width: _gap));
        cells.add(
          Expanded(
            child: _AlbumTile(
              image: images[i],
              height: height,
              order: i,
              uploading: uploading,
              onTap: () => onTap(i),
            ),
          ),
        );
      }
      if (r > 0) rowWidgets.add(const SizedBox(height: _gap));
      rowWidgets.add(Row(children: cells));
    }

    return Container(
      width: width,
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: mine ? VellinColors.accentWash : VellinColors.bubble,
        borderRadius: VellinRadius.bubble,
        border: Border.all(color: mine ? VellinColors.accentLine : VellinColors.line06),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ClipRRect(
            // Под подписью нижние углы снимков мягче: кадр переходит в текст,
            // а не заканчивает пузырь.
            borderRadius: BorderRadius.only(
              topLeft: const Radius.circular(2),
              topRight: const Radius.circular(10),
              bottomLeft: Radius.circular(caption == null ? 10 : 6),
              bottomRight: Radius.circular(caption == null ? 10 : 6),
            ),
            child: Stack(
              children: [
                Column(mainAxisSize: MainAxisSize.min, children: rowWidgets),
                // У снимков без подписи метке негде встать в тексте — кладём
                // её капсулой на последний кадр.
                if (meta != null)
                  Positioned(
                    right: 6,
                    bottom: 6,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: const Color(0xA6080706),
                        borderRadius: BorderRadius.circular(VellinRadius.pill),
                      ),
                      child: meta,
                    ),
                  ),
              ],
            ),
          ),
          ?caption,
        ],
      ),
    );
  }
}

/// Кадр альбома. Приходит лесенкой за соседом, при наведении чуть
/// приближается внутри рамки, пока грузится — под дышащей вуалью.
class _AlbumTile extends StatefulWidget {
  final DmImage image;
  final double height;
  final int order;
  final bool uploading;
  final VoidCallback onTap;

  const _AlbumTile({
    required this.image,
    required this.height,
    required this.order,
    required this.uploading,
    required this.onTap,
  });

  @override
  State<_AlbumTile> createState() => _AlbumTileState();
}

class _AlbumTileState extends State<_AlbumTile> with TickerProviderStateMixin {
  late final AnimationController _in = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 480),
  );

  /// Дыхание вуали загрузки — скелет, а не крутящийся индикатор.
  late final AnimationController _veil = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1400),
  );

  bool _hover = false;

  @override
  void initState() {
    super.initState();
    Future<void>.delayed(VellinMotion.stagger * widget.order, () {
      if (mounted) _in.forward();
    });
    if (widget.uploading) _veil.repeat(reverse: true);
  }

  @override
  void didUpdateWidget(_AlbumTile old) {
    super.didUpdateWidget(old);
    if (widget.uploading && !_veil.isAnimating) _veil.repeat(reverse: true);
    if (!widget.uploading && _veil.isAnimating) _veil.stop();
  }

  @override
  void dispose() {
    _in.dispose();
    _veil.dispose();
    super.dispose();
  }

  Widget _picture() {
    final local = widget.image.localPath;
    final placeholder = Container(height: widget.height, color: VellinColors.skeleton);
    if (local != null) {
      return Image.file(
        File(local),
        height: widget.height,
        width: double.infinity,
        fit: BoxFit.cover,
        gaplessPlayback: true,
        errorBuilder: (_, _, _) => placeholder,
      );
    }
    final url = AppConfig.mediaUrl(widget.image.url);
    if (url == null || widget.image.url.isEmpty) return placeholder;
    return Image.network(
      url,
      height: widget.height,
      width: double.infinity,
      fit: BoxFit.cover,
      gaplessPlayback: true,
      frameBuilder: (context, child, frame, sync) {
        // Кадр проявляется, когда догрузился, а не выскакивает на скелете.
        if (sync) return child;
        return Stack(
          fit: StackFit.passthrough,
          children: [
            placeholder,
            AnimatedOpacity(
              duration: VellinMotion.hover,
              curve: VellinMotion.standard,
              opacity: frame == null ? 0 : 1,
              child: child,
            ),
          ],
        );
      },
      errorBuilder: (_, _, _) => placeholder,
    );
  }

  @override
  Widget build(BuildContext context) {
    final curve = CurvedAnimation(parent: _in, curve: VellinMotion.standard);
    return FadeTransition(
      opacity: curve,
      child: AnimatedBuilder(
        animation: curve,
        builder: (context, child) => Transform.scale(scale: 0.94 + 0.06 * curve.value, child: child),
        child: MouseRegion(
          cursor: widget.uploading ? MouseCursor.defer : SystemMouseCursors.zoomIn,
          onEnter: (_) => setState(() => _hover = true),
          onExit: (_) => setState(() => _hover = false),
          child: GestureDetector(
            onTap: widget.uploading ? null : widget.onTap,
            child: SizedBox(
              height: widget.height,
              child: ClipRect(
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    AnimatedScale(
                      duration: VellinMotion.state,
                      curve: VellinMotion.standard,
                      scale: _hover && !widget.uploading ? 1.04 : 1,
                      child: _picture(),
                    ),
                    // Вуаль загрузки гаснет, когда сообщение ушло.
                    IgnorePointer(
                      child: AnimatedOpacity(
                        duration: VellinMotion.state,
                        curve: VellinMotion.standard,
                        opacity: widget.uploading ? 1 : 0,
                        child: AnimatedBuilder(
                          animation: _veil,
                          builder: (context, _) => ColoredBox(
                            color: Color.fromRGBO(8, 7, 6, 0.30 + 0.22 * VellinMotion.breathe.transform(_veil.value)),
                          ),
                        ),
                      ),
                    ),
                  ],
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
    // Уже написанная история показывается готовой: прочерчивать галочки у
    // старых реплик каждый раз, когда открыли диалог или пришло новое
    // сообщение, — значит врать про момент прочтения.
    value: 1,
  );

  @override
  void didUpdateWidget(_Ticks old) {
    super.didUpdateWidget(old);
    // Рисуем только сам переход: отправлено → доставлено → прочитано.
    if (old.read != widget.read || old.pending != widget.pending) {
      _draw.forward(from: 0);
    }
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
        // Подписи «прочитано» рядом нет: две галочки говорят это сами.
        return VellinIcon(
          VellinGlyphs.tickDouble,
          size: 18,
          box: const Size(18, 11),
          color: VellinColors.accent,
          progress: t,
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
      padding: const EdgeInsets.only(left: 38),
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

/// Время отправки и — у своих — галочки доставки. Живёт внутри реплики,
/// правее текста и на одной строке с ним.
class _Meta extends StatelessWidget {
  final String time;
  final bool mine;
  final bool read;
  final bool pending;

  /// Текст меняли после отправки — перед временем стоит «изменено».
  final bool edited;

  const _Meta({
    required this.time,
    required this.mine,
    required this.read,
    required this.pending,
    this.edited = false,
  });

  @override
  Widget build(BuildContext context) {
    final color = mine ? const Color(0x7AE2C99B) : VellinColors.ink28;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        _EditedMark(edited: edited, color: color),
        Text(
          time,
          style: VellinType.time.copyWith(color: color),
        ),
        if (mine) ...[
          const SizedBox(width: 5),
          _Ticks(read: read, pending: pending),
        ],
      ],
    );
  }
}

/// Оболочка строки: отметка выделения слева, подсветка под открытым меню и
/// вспышка, когда к сообщению прокрутили.
class _RowShell extends StatefulWidget {
  final bool selecting;
  final bool selected;
  final bool menuOpen;
  final int flash;
  final double topInset;
  final VoidCallback? onTap;
  final GestureTapUpCallback? onSecondaryTapUp;
  final Widget child;

  const _RowShell({
    required this.selecting,
    required this.selected,
    required this.menuOpen,
    required this.flash,
    required this.topInset,
    required this.onTap,
    required this.onSecondaryTapUp,
    required this.child,
  });

  @override
  State<_RowShell> createState() => _RowShellState();
}

class _RowShellState extends State<_RowShell> with SingleTickerProviderStateMixin {
  // Вспышка: быстро загорается и долго гаснет — глаз успевает найти строку.
  late final AnimationController _flash = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1600),
  );

  @override
  void initState() {
    super.initState();
    if (widget.flash > 0) _flash.forward(from: 0);
  }

  @override
  void didUpdateWidget(_RowShell old) {
    super.didUpdateWidget(old);
    if (widget.flash != old.flash && widget.flash > 0) _flash.forward(from: 0);
  }

  @override
  void dispose() {
    _flash.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final base = widget.selected
        ? const Color(0x14E2C99B)
        : widget.menuOpen
            ? VellinColors.fill045
            : const Color(0x00000000);

    return Padding(
      padding: EdgeInsets.only(top: widget.topInset),
      child: MouseRegion(
        cursor: widget.selecting ? SystemMouseCursors.click : MouseCursor.defer,
        child: GestureDetector(
          behavior: HitTestBehavior.translucent,
          onTap: widget.onTap,
          onSecondaryTapUp: widget.onSecondaryTapUp,
          child: AnimatedBuilder(
            animation: _flash,
            builder: (context, child) {
              final v = _flash.value;
              // 0–15 % — разгорание, дальше — медленное угасание.
              final glow = v == 0 || v == 1
                  ? 0.0
                  : v < 0.15
                      ? VellinMotion.standard.transform(v / 0.15)
                      : 1 - VellinMotion.standard.transform((v - 0.15) / 0.85);
              return AnimatedContainer(
                duration: VellinMotion.micro,
                curve: VellinMotion.standard,
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: Color.lerp(base, const Color(0x24E2C99B), glow),
                  borderRadius: BorderRadius.circular(VellinRadius.row),
                ),
                child: child,
              );
            },
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                _SelectMark(visible: widget.selecting, selected: widget.selected),
                Expanded(
                  child: Align(
                    alignment: Alignment.centerLeft,
                    // В режиме выделения щелчок выбирает строку целиком: плеер,
                    // снимок и цитата внутри не должны перехватывать его.
                    child: IgnorePointer(ignoring: widget.selecting, child: widget.child),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Кружок выделения. Выезжает слева, раздвигая строку, и уезжает обратно;
/// галочка внутри прочерчивается при выборе.
class _SelectMark extends StatefulWidget {
  final bool visible;
  final bool selected;
  const _SelectMark({required this.visible, required this.selected});

  @override
  State<_SelectMark> createState() => _SelectMarkState();
}

class _SelectMarkState extends State<_SelectMark> with TickerProviderStateMixin {
  late final AnimationController _show = AnimationController(
    vsync: this,
    duration: VellinMotion.hover,
    reverseDuration: VellinMotion.quick,
    value: widget.visible ? 1 : 0,
  );
  late final AnimationController _check = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 320),
    reverseDuration: VellinMotion.micro,
    value: widget.selected ? 1 : 0,
  );

  @override
  void didUpdateWidget(_SelectMark old) {
    super.didUpdateWidget(old);
    if (widget.visible != old.visible) widget.visible ? _show.forward() : _show.reverse();
    if (widget.selected != old.selected) widget.selected ? _check.forward() : _check.reverse();
  }

  @override
  void dispose() {
    _show.dispose();
    _check.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: Listenable.merge([_show, _check]),
      builder: (context, _) {
        if (_show.value == 0) return const SizedBox.shrink();
        final s = _show.status == AnimationStatus.reverse
            ? VellinMotion.exit.transform(_show.value)
            : VellinMotion.standard.transform(_show.value);
        final c = VellinMotion.standard.transform(_check.value);
        return SizedBox(
          width: 34 * s,
          child: Opacity(
            opacity: s.clamp(0.0, 1.0),
            child: Transform.translate(
              offset: Offset(-10 * (1 - s), 0),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Container(
                  width: 20,
                  height: 20,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: Color.lerp(const Color(0x00000000), VellinColors.accent, c),
                    border: Border.all(
                      color: Color.lerp(VellinColors.ink28, VellinColors.accent, c)!,
                      width: 1.25,
                    ),
                  ),
                  alignment: Alignment.center,
                  child: c == 0
                      ? null
                      : VellinIcon(
                          VellinGlyphs.check,
                          size: 13,
                          color: VellinColors.onAccent,
                          stroke: 1.8,
                          progress: c,
                        ),
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}

/// Уход удалённой строки: гаснет, чуть сжимается и схлопывает высоту, чтобы
/// соседи съехались, а не прыгнули.
class _Collapse extends StatefulWidget {
  final bool removing;
  final Widget child;
  const _Collapse({required this.removing, required this.child});

  @override
  State<_Collapse> createState() => _CollapseState();
}

class _CollapseState extends State<_Collapse> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 300),
    value: widget.removing ? 0 : 1,
  );

  @override
  void didUpdateWidget(_Collapse old) {
    super.didUpdateWidget(old);
    if (widget.removing != old.removing) widget.removing ? _c.reverse() : _c.forward();
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.removing && _c.value == 1) return widget.child;
    return AnimatedBuilder(
      animation: _c,
      builder: (context, child) {
        final t = VellinMotion.exit.transform(_c.value);
        return ClipRect(
          child: Align(
            alignment: Alignment.topLeft,
            heightFactor: t,
            child: Opacity(
              opacity: t,
              child: Transform.scale(scale: 0.96 + 0.04 * t, alignment: Alignment.centerLeft, child: child),
            ),
          ),
        );
      },
      child: widget.child,
    );
  }
}

/// «изменено» перед временем. У давно изменённых стоит сразу, у изменённых на
/// глазах — раздвигает метку и проявляется.
class _EditedMark extends StatefulWidget {
  final bool edited;
  final Color color;
  const _EditedMark({required this.edited, required this.color});

  @override
  State<_EditedMark> createState() => _EditedMarkState();
}

class _EditedMarkState extends State<_EditedMark> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: VellinMotion.state,
    value: widget.edited ? 1 : 0,
  );

  @override
  void didUpdateWidget(_EditedMark old) {
    super.didUpdateWidget(old);
    if (widget.edited != old.edited) widget.edited ? _c.forward(from: 0) : _c.reverse();
  }

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
        if (_c.value == 0) return const SizedBox.shrink();
        final t = VellinMotion.standard.transform(_c.value);
        return ClipRect(
          child: Align(
            alignment: Alignment.centerRight,
            widthFactor: t,
            child: Opacity(opacity: t, child: child),
          ),
        );
      },
      child: Padding(
        padding: const EdgeInsets.only(right: 5),
        child: Text('изменено', style: VellinType.time.copyWith(color: widget.color)),
      ),
    );
  }
}

/// «Переслано от …» над содержимым пересланной реплики.
class _ForwardedLabel extends StatelessWidget {
  final String name;
  final bool mine;
  const _ForwardedLabel({required this.name, required this.mine});

  @override
  Widget build(BuildContext context) {
    final dim = mine ? const Color(0x8CE2C99B) : VellinColors.ink45;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        VellinIcon(VellinGlyphs.forward, size: 12, color: dim),
        const SizedBox(width: 6),
        Flexible(
          child: Text.rich(
            TextSpan(
              children: [
                const TextSpan(text: 'Переслано от '),
                TextSpan(
                  text: name.isEmpty ? 'пользователя' : name,
                  style: TextStyle(
                    fontWeight: FontWeight.w500,
                    color: mine ? VellinColors.accent : VellinColors.ink72,
                  ),
                ),
              ],
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: VellinType.caption.copyWith(fontSize: 11.5, color: dim),
          ),
        ),
      ],
    );
  }
}

/// Цитата сообщения, на которое ответили. Щелчок — прокрутка к оригиналу.
class _ReplyQuote extends StatefulWidget {
  final DmReplyRef ref;
  final bool mine;
  final String author;
  final double? maxWidth;
  final VoidCallback? onTap;

  const _ReplyQuote({
    required this.ref,
    required this.mine,
    required this.author,
    required this.maxWidth,
    required this.onTap,
  });

  @override
  State<_ReplyQuote> createState() => _ReplyQuoteState();
}

class _ReplyQuoteState extends State<_ReplyQuote> {
  bool _hover = false;

  @override
  Widget build(BuildContext context) {
    final ref = widget.ref;
    final hot = _hover && widget.onTap != null;
    final glyph = switch (ref.kind) {
      DmKind.image => VellinGlyphs.image,
      DmKind.voice => VellinGlyphs.listened,
      DmKind.video => VellinGlyphs.viewed,
      DmKind.invite => VellinGlyphs.screen,
      DmKind.call => VellinGlyphs.calls,
      DmKind.text => null,
    };
    final showGlyph = !ref.deleted && glyph != null;

    return MouseRegion(
      cursor: widget.onTap == null ? MouseCursor.defer : SystemMouseCursors.click,
      onEnter: (_) => setState(() => _hover = true),
      onExit: (_) => setState(() => _hover = false),
      child: GestureDetector(
        onTap: widget.onTap,
        child: ConstrainedBox(
          constraints: BoxConstraints(maxWidth: widget.maxWidth ?? 420, minWidth: 120),
          child: AnimatedContainer(
            duration: VellinMotion.micro,
            curve: VellinMotion.standard,
            decoration: BoxDecoration(
              color: widget.mine
                  ? (hot ? const Color(0x24E2C99B) : const Color(0x14E2C99B))
                  : (hot ? VellinColors.fill055 : VellinColors.fill045),
              borderRadius: BorderRadius.circular(8),
            ),
            clipBehavior: Clip.antiAlias,
            child: IntrinsicHeight(
              child: Row(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Container(width: 2, color: ref.deleted ? VellinColors.ink24 : VellinColors.accent),
                  Flexible(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(9, 5, 10, 6),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          if (widget.author.isNotEmpty)
                            Text(
                              widget.author,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: VellinType.author.copyWith(fontSize: 11.5, color: VellinColors.accent),
                            ),
                          Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              if (showGlyph) ...[
                                VellinIcon(glyph, size: 12, color: VellinColors.ink45),
                                const SizedBox(width: 5),
                              ],
                              Flexible(
                                child: Text(
                                  ref.preview,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: VellinType.caption.copyWith(
                                    fontSize: 12,
                                    height: 1.35,
                                    fontStyle: ref.deleted ? FontStyle.italic : FontStyle.normal,
                                    color: ref.deleted ? VellinColors.ink34 : VellinColors.ink62,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Плашки реакций под репликой. Одна плашка на эмодзи, в ней — аватары тех,
/// кто его поставил.
class _ReactionBar extends StatefulWidget {
  final List<DmReaction> reactions;
  final String myUserId;
  final String myUsername;
  final String? myAvatarUrl;
  final PublicUser? peer;
  final ValueChanged<String>? onTap;

  const _ReactionBar({
    required this.reactions,
    required this.myUserId,
    required this.myUsername,
    required this.myAvatarUrl,
    required this.peer,
    required this.onTap,
  });

  @override
  State<_ReactionBar> createState() => _ReactionBarState();
}

class _ChipData {
  final String emoji;
  List<String> userIds;
  bool leaving;

  /// Была на месте при первом показе строки — появляется без анимации: иначе
  /// давние реакции «выскакивали» бы при каждой прокрутке ленты.
  final bool initial;

  _ChipData(this.emoji, this.userIds, {this.initial = false}) : leaving = false;
}

class _ReactionBarState extends State<_ReactionBar> {
  late final List<_ChipData> _chips = [
    for (final g in _group(widget.reactions).entries) _ChipData(g.key, g.value, initial: true),
  ];

  static Map<String, List<String>> _group(List<DmReaction> list) {
    final out = <String, List<String>>{};
    for (final r in list) {
      (out[r.emoji] ??= []).add(r.userId);
    }
    return out;
  }

  @override
  void didUpdateWidget(_ReactionBar old) {
    super.didUpdateWidget(old);
    final next = _group(widget.reactions);
    for (final c in _chips) {
      final users = next[c.emoji];
      if (users == null) {
        c.leaving = true;
      } else {
        c
          ..userIds = users
          ..leaving = false;
      }
    }
    for (final e in next.entries) {
      if (_chips.every((c) => c.emoji != e.key)) _chips.add(_ChipData(e.key, e.value));
    }
  }

  void _gone(_ChipData chip) {
    if (!mounted || !chip.leaving) return;
    setState(() => _chips.remove(chip));
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedSize(
      duration: VellinMotion.hover,
      curve: VellinMotion.standard,
      alignment: Alignment.topLeft,
      child: _chips.isEmpty
          ? const SizedBox(width: 0, height: 0)
          : Padding(
              padding: const EdgeInsets.only(top: 5),
              child: Wrap(
                spacing: 0,
                runSpacing: 4,
                children: [
                  for (final c in _chips)
                    _ReactionChip(
                      key: ValueKey(c.emoji),
                      emoji: c.emoji,
                      leaving: c.leaving,
                      initial: c.initial,
                      mine: c.userIds.contains(widget.myUserId),
                      avatars: [
                        for (final id in c.userIds)
                          id == widget.myUserId
                              ? (widget.myUsername, widget.myAvatarUrl)
                              : (widget.peer?.username ?? '', widget.peer?.avatarUrl),
                      ],
                      onTap: widget.onTap == null ? null : () => widget.onTap!(c.emoji),
                      onGone: () => _gone(c),
                    ),
                ],
              ),
            ),
    );
  }
}

class _ReactionChip extends StatefulWidget {
  final String emoji;
  final bool leaving;
  final bool initial;
  final bool mine;
  final List<(String, String?)> avatars;
  final VoidCallback? onTap;
  final VoidCallback onGone;

  const _ReactionChip({
    super.key,
    required this.emoji,
    required this.leaving,
    required this.initial,
    required this.mine,
    required this.avatars,
    required this.onTap,
    required this.onGone,
  });

  @override
  State<_ReactionChip> createState() => _ReactionChipState();
}

class _ReactionChipState extends State<_ReactionChip> with SingleTickerProviderStateMixin {
  // Приход — рост из точки с отложенным «щелчком» эмодзи, уход — сжатие и
  // схлопывание места, чтобы соседние плашки съехались.
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 520),
    reverseDuration: VellinMotion.quick,
    value: widget.initial ? 1 : 0,
  );
  bool _hover = false;

  @override
  void initState() {
    super.initState();
    if (!widget.initial) _c.forward();
    if (widget.leaving) _leave();
  }

  @override
  void didUpdateWidget(_ReactionChip old) {
    super.didUpdateWidget(old);
    if (widget.leaving && !old.leaving) {
      _leave();
    } else if (!widget.leaving && old.leaving) {
      _c.forward();
    }
  }

  Future<void> _leave() async {
    await _c.reverse();
    if (mounted && widget.leaving) widget.onGone();
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final mine = widget.mine;
    return AnimatedBuilder(
      animation: _c,
      builder: (context, child) {
        final reverse = _c.status == AnimationStatus.reverse;
        final t = reverse ? VellinMotion.exit.transform(_c.value) : VellinMotion.standard.transform(_c.value);
        // Эмодзи догоняет плашку: сначала встаёт подложка, потом он сам.
        final e = reverse ? t : VellinMotion.standard.transform(((_c.value - 0.18) / 0.82).clamp(0.0, 1.0));
        return ClipRect(
          child: Align(
            alignment: Alignment.centerLeft,
            widthFactor: t,
            child: Opacity(
              opacity: t.clamp(0.0, 1.0),
              child: Transform.scale(
                scale: 0.6 + 0.4 * t,
                alignment: Alignment.centerLeft,
                child: _ChipScale(emojiScale: 0.5 + 0.5 * e, child: child!),
              ),
            ),
          ),
        );
      },
      child: Padding(
        padding: const EdgeInsets.only(right: 5),
        child: MouseRegion(
          cursor: widget.onTap == null ? MouseCursor.defer : SystemMouseCursors.click,
          onEnter: (_) => setState(() => _hover = true),
          onExit: (_) => setState(() => _hover = false),
          child: GestureDetector(
            onTap: widget.onTap,
            child: AnimatedContainer(
              duration: VellinMotion.hover,
              curve: VellinMotion.standard,
              height: 26,
              padding: const EdgeInsets.only(left: 6, right: 4),
              decoration: BoxDecoration(
                color: mine
                    ? (_hover ? const Color(0x33E2C99B) : const Color(0x1FE2C99B))
                    : (_hover ? VellinColors.fill055 : VellinColors.fill045),
                borderRadius: BorderRadius.circular(VellinRadius.pill),
                border: Border.all(color: mine ? VellinColors.accentLine : VellinColors.line07),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  _ChipEmoji(emoji: widget.emoji),
                  const SizedBox(width: 4),
                  // Второй поставивший ту же реакцию — аватар въезжает, а не
                  // появляется скачком.
                  AnimatedSize(
                    duration: VellinMotion.hover,
                    curve: VellinMotion.standard,
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        for (var i = 0; i < widget.avatars.length; i++)
                          Transform.translate(
                            offset: Offset(-4.0 * i, 0),
                            child: VellinAvatar(
                              username: widget.avatars[i].$1,
                              avatarUrl: widget.avatars[i].$2,
                              size: 18,
                              ringColor: VellinColors.bg1,
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Передаёт масштаб эмодзи внутрь плашки без перестройки всей строки.
class _ChipScale extends InheritedWidget {
  final double emojiScale;
  const _ChipScale({required this.emojiScale, required super.child});

  static double of(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<_ChipScale>()?.emojiScale ?? 1;

  @override
  bool updateShouldNotify(_ChipScale old) => old.emojiScale != emojiScale;
}

class _ChipEmoji extends StatelessWidget {
  final String emoji;
  const _ChipEmoji({required this.emoji});

  @override
  Widget build(BuildContext context) {
    return Transform.scale(
      scale: _ChipScale.of(context),
      child: EmojiGlyph(emoji, size: 16),
    );
  }
}
