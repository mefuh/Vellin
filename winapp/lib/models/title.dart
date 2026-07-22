// Полная модель фильма/сериала (shared: FavoriteTitle) — снимок из kinopoisk.dev.
// Используется в поиске и в редакторе избранного; для отображения в профиле
// достаточно урезанного FavoriteTitle (models/social.dart).

class TitleItem {
  final int kpId;
  final String type;
  final String title;
  final String? originalTitle;
  final int? year;
  final String? posterUrl;
  final double? ratingKp;
  final double? ratingImdb;

  const TitleItem({
    required this.kpId,
    required this.type,
    required this.title,
    required this.originalTitle,
    required this.year,
    required this.posterUrl,
    required this.ratingKp,
    required this.ratingImdb,
  });

  factory TitleItem.fromJson(Map<String, dynamic> j) => TitleItem(
        kpId: (j['kpId'] as num).toInt(),
        type: j['type'] as String? ?? 'movie',
        title: j['title'] as String? ?? '',
        originalTitle: j['originalTitle'] as String?,
        year: (j['year'] as num?)?.toInt(),
        posterUrl: j['posterUrl'] as String?,
        ratingKp: (j['ratingKp'] as num?)?.toDouble(),
        ratingImdb: (j['ratingImdb'] as num?)?.toDouble(),
      );

  Map<String, dynamic> toJson() => {
        'kpId': kpId,
        'type': type,
        'title': title,
        'originalTitle': originalTitle,
        'year': year,
        'posterUrl': posterUrl,
        'ratingKp': ratingKp,
        'ratingImdb': ratingImdb,
      };
}
