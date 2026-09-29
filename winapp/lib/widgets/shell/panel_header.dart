import 'package:flutter/widgets.dart';

import '../../theme/vellin_design.dart';
import '../ui/vellin_field.dart';

/// Шапка левой панели — одна на все разделы: заголовок, счётчик рядом с ним
/// и поле поиска под ними.
class PanelHeader extends StatelessWidget {
  final String title;

  /// Счётчик у заголовка: «12 непрочитанных», «7 в друзьях».
  final String? counter;

  final TextEditingController searchController;
  final String searchPlaceholder;
  final ValueChanged<String>? onSearch;

  /// Ряд под поиском: табы «Друзей», если раздел их показывает.
  final Widget? footer;

  const PanelHeader({
    super.key,
    required this.title,
    required this.searchController,
    this.counter,
    this.searchPlaceholder = 'Поиск',
    this.onSearch,
    this.footer,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 18, 16, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Text(title, style: VellinType.paneTitle),
              if (counter != null) ...[
                const SizedBox(width: 8),
                Flexible(
                  child: Text(
                    counter!,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: VellinType.caption.copyWith(
                      color: const Color(0x4DFFFFFF),
                      fontFeatures: VellinType.tabular,
                    ),
                  ),
                ),
              ],
            ],
          ),
          const SizedBox(height: 12),
          VellinSearchField(
            controller: searchController,
            placeholder: searchPlaceholder,
            onChanged: onSearch,
          ),
          if (footer != null) ...[
            const SizedBox(height: 12),
            footer!,
          ],
        ],
      ),
    );
  }
}
