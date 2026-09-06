import 'package:flutter/widgets.dart';

import '../../app_config.dart';
import '../../theme/vellin_design.dart';

/// Присутствие человека. Три состояния вместо прежнего «в сети / не в сети»:
/// «недавно» нужно и списку, и меню статуса в карточке «я».
enum VellinPresence { online, away, offline }

extension VellinPresenceColor on VellinPresence {
  Color get color => switch (this) {
        VellinPresence.online => VellinColors.online,
        VellinPresence.away => VellinColors.away,
        VellinPresence.offline => VellinColors.offline,
      };

  String get label => switch (this) {
        VellinPresence.online => 'В сети',
        VellinPresence.away => 'Недавно',
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
            child: Container(
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
