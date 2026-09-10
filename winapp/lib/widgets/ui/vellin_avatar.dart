import 'package:flutter/widgets.dart';

import '../../app_config.dart';
import '../../theme/vellin_design.dart';
import '../../theme/vellin_glyphs.dart';
import 'vellin_icon.dart';

/// Присутствие человека. Три состояния вместо прежнего «в сети / не в сети»:
/// «не беспокоить» нужно и списку, и меню статуса в карточке «я».
enum VellinPresence { online, dnd, offline }

/// Статус с сервера ('online' | 'dnd' | 'offline') → присутствие для вида.
/// 'away' — прежнее «недавно»: могло сохраниться в старой сессии на диске.
VellinPresence presenceFromStatus(String? status) => switch (status) {
      'online' => VellinPresence.online,
      'dnd' || 'away' => VellinPresence.dnd,
      _ => VellinPresence.offline,
    };

extension VellinPresenceColor on VellinPresence {
  Color get color => switch (this) {
        VellinPresence.online => VellinColors.online,
        VellinPresence.dnd => VellinColors.dnd,
        VellinPresence.offline => VellinColors.offline,
      };

  String get label => switch (this) {
        VellinPresence.online => 'В сети',
        VellinPresence.dnd => 'Не беспокоить',
        VellinPresence.offline => 'Не в сети',
      };
}

/// Аватар: картинка либо градиентная заглушка с инициалом.
///
/// Заглушка нейтральная (белый градиент на просвет), а не цветная по seed:
/// в новом языке единственный цвет — золото, и разноцветные кружки в списке
/// спорили бы с ним.
class VellinAvatar extends StatelessWidget {
  final String username;
  final String? avatarUrl;
  final double size;

  /// Присутствие. null — точка не рисуется.
  final VellinPresence? presence;

  /// Цвет фона под аватаром — им обводится точка присутствия, чтобы она
  /// читалась как вырез, а не как наклейка.
  final Color bedColor;

  /// Обводка самого аватара. У своих реплик в ленте она золотая.
  final Color? ringColor;

  const VellinAvatar({
    super.key,
    required this.username,
    this.avatarUrl,
    this.size = 40,
    this.presence,
    this.bedColor = VellinColors.panel,
    this.ringColor,
  });

  @override
  Widget build(BuildContext context) {
    final url = AppConfig.mediaUrl(avatarUrl);
    final initial = username.isNotEmpty ? username.characters.first.toUpperCase() : '?';

    final avatar = Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: VellinColors.avatarBed,
        border: Border.all(color: ringColor ?? VellinAvatarSpec.border, width: 1),
        gradient: url == null
            ? const LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [VellinAvatarSpec.gradientBegin, VellinAvatarSpec.gradientEnd],
              )
            : null,
        image: url != null
            ? DecorationImage(image: NetworkImage(url), fit: BoxFit.cover)
            : null,
      ),
      alignment: Alignment.center,
      child: url == null
          ? Text(
              initial,
              style: TextStyle(
                fontFamily: VellinType.family,
                fontSize: VellinAvatarSpec.initialSize(size),
                fontWeight: FontWeight.w300,
                letterSpacing: VellinAvatarSpec.initialSize(size) * 0.04,
                color: VellinColors.ink72,
              ),
            )
          : null,
    );

    if (presence == null) return avatar;

    final dot = VellinAvatarSpec.dotSize(size);
    return SizedBox(
      width: size,
      height: size,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          avatar,
          Positioned(
            right: -1,
            bottom: -1,
            // «Не беспокоить» — месяц в том же вырезе фона: цветом три статуса
            // на маленькой точке различаются плохо, формой — сразу.
            child: presence == VellinPresence.dnd
                ? Container(
                    width: dot + 4,
                    height: dot + 4,
                    decoration: BoxDecoration(shape: BoxShape.circle, color: bedColor),
                    alignment: Alignment.center,
                    child: VellinIcon.filled(
                      VellinGlyphs.moonFilled,
                      size: dot + 1,
                      box: const Size(12, 12),
                      color: VellinColors.dnd,
                    ),
                  )
                : Container(
                    width: dot,
                    height: dot,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: presence!.color,
                      border: Border.all(color: bedColor, width: 2),
                    ),
                  ),
          ),
        ],
      ),
    );
  }
}
