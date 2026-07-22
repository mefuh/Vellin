import '../models/title.dart';
import 'api_client.dart';

/// Справочники профиля: города (гео) и фильмы/сериалы (kinopoisk.dev) +
/// избранное. Все эндпоинты требуют авторизации.
class CatalogApi {
  final ApiClient _c;
  CatalogApi(this._c);

  /// Подсказки городов для поля «Город» (формат «Город, Страна»). Сохранять в
  /// профиль можно только значение ровно из этого списка.
  Future<List<String>> searchCities(String q) async {
    final j = await _c.get('/geo/cities?q=${Uri.encodeQueryComponent(q)}') as Map<String, dynamic>;
    return (j['cities'] as List).cast<String>();
  }

  /// Поиск фильмов/сериалов для добавления в избранное.
  Future<List<TitleItem>> searchTitles(String q) async {
    final j = await _c.get('/titles/search?q=${Uri.encodeQueryComponent(q)}') as Map<String, dynamic>;
    return (j['titles'] as List).map((e) => TitleItem.fromJson(e as Map<String, dynamic>)).toList();
  }

  /// Текущее избранное пользователя.
  Future<List<TitleItem>> favorites() async {
    final j = await _c.get('/titles/favorites') as Map<String, dynamic>;
    return (j['titles'] as List).map((e) => TitleItem.fromJson(e as Map<String, dynamic>)).toList();
  }

  /// Полная замена избранного (сервер хранит порядок). Возвращает сохранённое.
  Future<List<TitleItem>> setFavorites(List<TitleItem> titles) async {
    final j = await _c.put('/titles/favorites', {'titles': titles.map((t) => t.toJson()).toList()}) as Map<String, dynamic>;
    return (j['titles'] as List).map((e) => TitleItem.fromJson(e as Map<String, dynamic>)).toList();
  }
}
