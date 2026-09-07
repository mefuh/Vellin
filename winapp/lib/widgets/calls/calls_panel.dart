import 'package:flutter/widgets.dart';

import '../../models/call_history.dart';
import '../../models/social.dart';
import '../../theme/vellin_design.dart';
import '../../theme/vellin_glyphs.dart';
import '../ui/vellin_avatar.dart';
import '../ui/vellin_button.dart';
import '../ui/vellin_hover.dart';
import '../ui/vellin_icon.dart';
import '../ui/vellin_surfaces.dart';

/// История звонков в левой панели.
class CallsPanel extends StatelessWidget {
  final List<CallHistoryEntry> calls;
  final bool loading;
  final void Function(PublicUser user) onCallBack;
  final void Function(PublicUser user) onOpenProfile;

  const CallsPanel({
    super.key,
    required this.calls,
    required this.loading,
    required this.onCallBack,
    required this.onOpenProfile,
  });

  @override
  Widget build(BuildContext context) {
    if (loading && calls.isEmpty) return const _CallsSkeleton();
    if (calls.isEmpty) {
      return Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 20),
        child: Text(
          'Звонков ещё не было',
          textAlign: TextAlign.center,
          style: VellinType.caption.copyWith(fontSize: 12.5),
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 10),
      itemCount: calls.length,
      itemBuilder: (context, i) => _CallRow(
        call: calls[i],
        onTap: () => onOpenProfile(calls[i].peer),
        onCallBack: () => onCallBack(calls[i].peer),
      ),
    );
  }
}

class _CallRow extends StatelessWidget {
  final CallHistoryEntry call;
  final VoidCallback onTap;
  final VoidCallback onCallBack;

  const _CallRow({required this.call, required this.onTap, required this.onCallBack});

  @override
  Widget build(BuildContext context) {
    final br = BorderRadius.circular(VellinRadius.row);
    final ok = call.completed;

    return Padding(
      padding: const EdgeInsets.only(bottom: 2),
      child: VellinInteractive(
        onTap: onTap,
        focusRadius: br,
        builder: (context, s) {
          final hot = s.hovered || s.pressed;
          return AnimatedContainer(
            duration: VellinMotion.hover,
            curve: VellinMotion.standard,
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
            decoration: BoxDecoration(
              color: hot ? const Color(0x0AFFFFFF) : const Color(0x00000000),
              borderRadius: br,
            ),
            child: Row(
              children: [
                VellinAvatar(
                  username: call.peer.username,
                  avatarUrl: call.peer.avatarUrl,
                  size: 40,
                  bedColor: VellinColors.panel,
                ),
                const SizedBox(width: 11),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        call.peer.username,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: VellinType.rowTitle,
                      ),
                      const SizedBox(height: 2),
                      Row(
                        children: [
                          VellinIcon(
                            call.kind == 'video' ? VellinGlyphs.camera : VellinGlyphs.calls,
                            size: 12,
                            color: call.missed ? VellinColors.danger : VellinColors.ink32,
                          ),
                          const SizedBox(width: 6),
                          Flexible(
                            child: Text(
                              _subtitle(call),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: VellinType.caption.copyWith(
                                color: call.missed ? VellinColors.danger : VellinColors.ink32,
                                fontFeatures: VellinType.tabular,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(_when(call.createdAt), style: VellinType.time),
                    const SizedBox(height: 3),
                    Text(
                      ok ? 'состоялся' : 'не состоялся',
                      style: VellinType.caption.copyWith(
                        color: ok ? const Color(0xD993B08A) : VellinColors.danger,
                      ),
                    ),
                  ],
                ),
                // Перезвонить — только при наведении: в покое строка читается
                // как запись, а не как кнопка.
                AnimatedOpacity(
                  duration: VellinMotion.hover,
                  curve: VellinMotion.standard,
                  opacity: hot ? 1 : 0,
                  child: Padding(
                    padding: const EdgeInsets.only(left: 8),
                    child: VellinIconButton(
                      glyph: VellinGlyphs.calls,
                      onPressed: hot ? onCallBack : null,
                      size: 30,
                      radius: VellinRadius.mini,
                      glyphSize: 15,
                    ),
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  /// Строка под именем. Слово «аудио» опущено: тип и так виден по глифу, а
  /// панель узкая — лишнее слово съедало длительность многоточием.
  static String _subtitle(CallHistoryEntry c) {
    final parts = [
      c.outgoing ? 'исходящий' : 'входящий',
      if (c.kind == 'video') 'видео',
      if (c.completed)
        _duration(c.durationSec)
      else
        switch (c.outcome) {
          'missed' => c.outgoing ? 'не ответили' : 'пропущен',
          'declined' => 'отклонён',
          'cancelled' => 'отменён',
          _ => 'сорвался',
        },
    ];
    return parts.join(' · ');
  }

  static String _duration(int sec) {
    final m = sec ~/ 60;
    final s = sec % 60;
    return '$m:${s.toString().padLeft(2, '0')}';
  }

  static String _when(String iso) {
    final t = DateTime.tryParse(iso)?.toLocal();
    if (t == null) return '';
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final that = DateTime(t.year, t.month, t.day);
    final days = today.difference(that).inDays;
    if (days == 0) {
      return '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';
    }
    if (days == 1) return 'вчера';
    const months = [
      'янв', 'фев', 'мар', 'апр', 'мая', 'июн',
      'июл', 'авг', 'сен', 'окт', 'ноя', 'дек',
    ];
    return '${t.day} ${months[t.month - 1]}';
  }
}

class _CallsSkeleton extends StatelessWidget {
  const _CallsSkeleton();

  @override
  Widget build(BuildContext context) {
    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 10),
      itemCount: 6,
      itemBuilder: (_, _) => const Padding(
        padding: EdgeInsets.symmetric(horizontal: 10, vertical: 9),
        child: Row(
          children: [
            VellinSkeleton.circle(40),
            SizedBox(width: 11),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                VellinSkeleton(width: 110, height: 10),
                SizedBox(height: 8),
                VellinSkeleton(width: 150, height: 9, color: Color(0xFF161413)),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
