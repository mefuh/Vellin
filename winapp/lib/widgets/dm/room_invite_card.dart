import 'package:flutter/widgets.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../api/api_client.dart';
import '../../app_config.dart';
import '../../theme/vellin_design.dart';
import '../../theme/vellin_glyphs.dart';
import '../ui/vellin_button.dart';
import '../ui/vellin_icon.dart';
import '../ui/vellin_surfaces.dart';

/// Приглашение в комнату совместного просмотра.
///
/// Комнат в Windows-клиенте нет — они живут в вебе, поэтому карточка
/// показывает, куда зовут, и открывает комнату в браузере. Раньше на её месте
/// была строка текста с эмодзи, по которой нельзя было даже понять, какая
/// комната имеется в виду.
class RoomInviteCard extends StatefulWidget {
  final String messageId;
  final bool mine;

  const RoomInviteCard({super.key, required this.messageId, required this.mine});

  @override
  State<RoomInviteCard> createState() => _RoomInviteCardState();
}

class _RoomInviteCardState extends State<RoomInviteCard> {
  Map<String, dynamic>? _info;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final j = await context.read<ApiClient>().get('/dm/room-invite/${widget.messageId}/info');
      if (mounted) {
        setState(() {
          _info = j as Map<String, dynamic>;
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _open() async {
    final slug = _info?['slug'] as String?;
    final target = slug != null && slug.isNotEmpty
        ? '${AppConfig.siteUrl}/room/$slug'
        : AppConfig.siteUrl;
    await launchUrl(Uri.parse(target), mode: LaunchMode.externalApplication);
  }

  @override
  Widget build(BuildContext context) {
    final info = _info;
    final available = info?['available'] as bool? ?? false;
    final poster = AppConfig.mediaUrl(info?['videoPoster'] as String?);

    return Container(
      width: 300,
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: widget.mine ? VellinColors.accentWash : VellinColors.bubble,
        borderRadius: VellinRadius.bubble,
        border: Border.all(color: widget.mine ? VellinColors.accentLine : VellinColors.line06),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const VellinIcon(VellinGlyphs.screen, size: 14, color: VellinColors.accent),
              const SizedBox(width: 8),
              Text(
                'Приглашение в комнату',
                style: VellinType.caption.copyWith(fontSize: 11, letterSpacing: 0.9, color: VellinColors.accent),
              ),
            ],
          ),
          const SizedBox(height: 10),
          if (_loading)
            const Row(
              children: [
                VellinSkeleton(width: 44, height: 62, radius: 6),
                SizedBox(width: 10),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    VellinSkeleton(width: 140, height: 10),
                    SizedBox(height: 8),
                    VellinSkeleton(width: 90, height: 9, color: Color(0xFF161413)),
                  ],
                ),
              ],
            )
          else
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(6),
                  child: Container(
                    width: 44,
                    height: 62,
                    color: VellinColors.bg5,
                    child: poster == null
                        ? null
                        : Image.network(poster, fit: BoxFit.cover,
                            errorBuilder: (_, _, _) => const SizedBox.shrink()),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        info?['roomName'] as String? ?? 'Комната',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: VellinType.rowTitle,
                      ),
                      const SizedBox(height: 3),
                      Text(
                        info?['videoTitle'] as String? ?? 'Видео ещё не выбрано',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: VellinType.caption.copyWith(fontSize: 12),
                      ),
                      if (info != null) ...[
                        const SizedBox(height: 6),
                        Text(
                          available
                              ? '${info['participantCount']} из ${info['maxParticipants']} · ${info['ownerUsername']}'
                              : 'Комната закрыта',
                          style: VellinType.caption.copyWith(
                            fontSize: 11,
                            color: available ? VellinColors.ink32 : VellinColors.danger,
                            fontFeatures: VellinType.tabular,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ],
            ),
          const SizedBox(height: 10),
          VellinButton(
            label: 'Открыть в браузере',
            glyph: VellinGlyphs.screen,
            tone: VellinButtonTone.goldTint,
            height: 34,
            radius: VellinRadius.button,
            expand: true,
            onPressed: available || _info == null ? _open : null,
          ),
        ],
      ),
    );
  }
}
