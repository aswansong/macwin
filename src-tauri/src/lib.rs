mod commands;
mod engine;
mod habitpack;
mod karabiner;
mod platform;
mod snapshot;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let updater = tauri_plugin_updater::Builder::new()
        .pubkey(option_env!("MACWIN_UPDATER_PUBKEY").unwrap_or("PENDING_RELEASE_KEY"))
        .build();
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(updater)
        .manage(commands::MacWinState::default())
        .invoke_handler(tauri::generate_handler![
            commands::runtime_info,
            commands::device_self_check,
            commands::scan_windows,
            commands::export_habitpack,
            commands::import_habitpack,
            commands::confirm_plan,
            commands::apply_plan,
            commands::rollback_module,
            commands::rollback_all,
            commands::export_report,
            commands::record_error,
            commands::snapshot_status,
            commands::check_update,
            commands::install_update
        ])
        .run(tauri::generate_context!())
        .expect("error while running MacWin");
}
