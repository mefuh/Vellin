// В релизной сборке прячем консольное окно (Windows).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    vellin_winapp_lib::run()
}
