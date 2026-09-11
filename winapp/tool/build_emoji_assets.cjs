// Отбирает картинки Apple для смайликов каталога реакций и пишет карту в Dart.
//
// Запуск из winapp/ после правки каталога (emoji_catalog.dart) или набора
// по умолчанию (recent_reactions.dart):
//   npm pack emoji-datasource-apple && tar -xzf emoji-datasource-apple-*.tgz
//   node tool/build_emoji_assets.cjs . ./package
const fs = require('fs');
const path = require('path');

const root = process.argv[2]; // winapp
const pkg = process.argv[3]; // распакованный emoji-datasource-apple
const catalog = fs.readFileSync(path.join(root, 'lib/widgets/dm/emoji_catalog.dart'), 'utf8');
const recent = fs.readFileSync(path.join(root, 'lib/state/recent_reactions.dart'), 'utf8');

const wanted = new Set();
// Записи разделов: «эмодзи слова; эмодзи слова» внутри ''' … '''.
for (const block of catalog.match(/'''([\s\S]*?)'''/g) ?? []) {
  for (const part of block.slice(3, -3).split(';')) {
    const t = part.trim();
    if (t) wanted.add(t.split(' ')[0]);
  }
}
// Иконки вкладок и стандартный набор полосы.
for (const m of catalog.matchAll(/EmojiSection\('[^']*', '([^']+)'/g)) wanted.add(m[1]);
const defaults = recent.match(/defaults = \[([^\]]*)\]/);
for (const m of defaults[1].matchAll(/'([^']+)'/g)) wanted.add(m[1]);

const hex = (s) => [...s].map((c) => c.codePointAt(0).toString(16).padStart(4, '0')).join('-');
const bare = (h) => h.split('-').filter((x) => x !== 'fe0f').join('-');

const data = JSON.parse(fs.readFileSync(path.join(pkg, 'emoji.json'), 'utf8'));
const byKey = new Map();
for (const e of data) {
  if (!e.has_img_apple) continue;
  const file = e.image;
  for (const k of [e.unified, e.non_qualified].filter(Boolean)) {
    byKey.set(k.toLowerCase(), file);
    byKey.set(bare(k.toLowerCase()), file);
  }
}

const outDir = path.join(root, 'assets/emoji/apple');
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const map = [];
const missing = [];
for (const e of wanted) {
  const h = hex(e);
  const file = byKey.get(h) ?? byKey.get(bare(h));
  if (!file) {
    missing.push(`${e} ${h}`);
    continue;
  }
  fs.copyFileSync(path.join(pkg, 'img/apple/64', file), path.join(outDir, file));
  map.push([e, file]);
}

const esc = (s) => [...s].map((c) => `\\u{${c.codePointAt(0).toString(16)}}`).join('');
const dart = `// Сгенерировано из emoji-datasource-apple ${require(path.join(pkg, 'package.json')).version}: смайлик → картинка.
// Меняется вместе с каталогом реакций — не править руками.

const Map<String, String> appleEmojiAssets = {
${map.map(([e, f]) => `  '${esc(e)}': '${f}',`).join('\n')}
};
`;
fs.writeFileSync(path.join(root, 'lib/widgets/dm/emoji_assets.dart'), dart);

let bytes = 0;
for (const f of fs.readdirSync(outDir)) bytes += fs.statSync(path.join(outDir, f)).size;
console.log(`wanted ${wanted.size}, copied ${map.length}, size ${(bytes / 1024).toFixed(0)} KB`);
if (missing.length) console.log('missing:', missing.join(' | '));
