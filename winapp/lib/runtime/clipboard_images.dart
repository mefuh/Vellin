import 'dart:io';
import 'dart:isolate';

import 'package:image/image.dart' as img;
import 'package:pasteboard/pasteboard.dart';

/// Форматы, которые принимает сервер для фото в личных сообщениях.
const photoExtensions = ['jpg', 'jpeg', 'png', 'webp'];

bool isPhotoPath(String path) {
  final dot = path.lastIndexOf('.');
  return dot >= 0 && photoExtensions.contains(path.substring(dot + 1).toLowerCase());
}

/// Фото из буфера обмена — пути к файлам, готовым к загрузке.
///
/// Файлы, скопированные в проводнике, берутся как есть (кроме не-фото).
/// Картинка — скриншот, копия из браузера или редактора — приходит от Windows
/// в BMP, а сервер принимает JPEG, PNG и WebP: она перекодируется в PNG во
/// временный файл. Пустой список — фото в буфере нет.
Future<List<String>> readClipboardPhotos() async {
  try {
    final files = (await Pasteboard.files()).where(isPhotoPath).toList();
    if (files.isNotEmpty) return files;

    final bytes = await Pasteboard.image;
    if (bytes == null || bytes.isEmpty) return const [];
    // Декодирование большого скриншота занимает заметное время — не в
    // потоке интерфейса, иначе окно подвисает на вставке.
    final png = await Isolate.run(() {
      final decoded = img.decodeImage(bytes);
      if (decoded == null) return null;
      // Буфер Windows отдаёт 32 бита без настоящей прозрачности: альфа там
      // нулевая, и PNG с ней вышел бы пустым. Три канала — картинка как есть.
      return img.encodePng(decoded.convert(numChannels: 3));
    });
    if (png == null) return const [];
    final file = File(
      '${Directory.systemTemp.path}${Platform.pathSeparator}vellin_paste_${DateTime.now().microsecondsSinceEpoch}.png',
    );
    await file.writeAsBytes(png);
    return [file.path];
  } catch (_) {
    // Буфер занят другой программой или формат не разобрали — вставлять нечего.
    return const [];
  }
}
