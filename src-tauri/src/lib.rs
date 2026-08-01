mod commands;
mod engine;
mod habitpack;
mod platform;
mod snapshot;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(commands::MacWinState::default())
        .invoke_handler(tauri::generate_handler![
            commands::runtime_info,
            commands::scan_windows,
            commands::export_habitpack,
            commands::import_habitpack,
            commands::apply_plan,
            commands::rollback_module,
            commands::rollback_all
        ])
        .run(tauri::generate_context!())
        .expect("error while running MacWin");
}
