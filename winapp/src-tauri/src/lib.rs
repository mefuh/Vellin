/// Точка входа нативной оболочки. Плагины:
///  - os: сведения о платформе/версии ОС;
///  - store: приватное хранилище сессии (token + user) в каталоге приложения;
///  - http: HTTP-запросы из Rust (минуя CORS браузерного WebView).
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_http::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
