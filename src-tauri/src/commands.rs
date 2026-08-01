use crate::engine::{self, ImportPlan, MigrationOutcome, NativeAdapter, SoftwarePlanItem};
use crate::habitpack::{self, KeyboardEvidence, PackageInput};
use crate::platform::{self, RuntimeInfo, SoftwareFinding, WindowsScan};
use crate::snapshot::default_store;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

#[derive(Default)]
pub struct MacWinState {
    pub package: Mutex<Option<habitpack::ImportedPackage>>,
    pub plan: Mutex<Option<ImportPlan>>,
    pub outcome: Mutex<Option<MigrationOutcome>>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ExportSelection {
    pub include_keyboard: bool,
    pub software_ids: Vec<String>,
    pub guide_requested: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct ExportReceipt {
    pub path: String,
    pub package_bytes: usize,
    pub modules: Vec<String>,
    pub contains_secrets: bool,
    pub validated: bool,
}

#[tauri::command]
pub fn runtime_info() -> RuntimeInfo {
    platform::runtime_info()
}

#[tauri::command]
pub fn scan_windows() -> Result<WindowsScan, String> {
    platform::scan_windows().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn export_habitpack(path: String, selection: ExportSelection) -> Result<ExportReceipt, String> {
    if path.is_empty() || !path.to_ascii_lowercase().ends_with(".habitpack") {
        return Err("EXPORT_EXTENSION".to_owned());
    }
    let scan = platform::scan_windows().map_err(|error| error.to_string())?;
    let keyboard = if selection.include_keyboard {
        Some(KeyboardEvidence {
            speed: scan.keyboard_repeat_speed,
            delay: scan.keyboard_repeat_delay,
            layouts: scan.keyboard_layouts.clone(),
        })
    } else {
        None
    };
    let software = scan
        .software
        .into_iter()
        .filter(|item| item.export_supported && selection.software_ids.contains(&item.id))
        .map(|item| habitpack::SoftwareEvidence {
            id: item.id,
            name: item.name,
            version: item.version,
            is_default_browser: item.is_default_browser,
            official_url: item.official_url,
        })
        .collect();
    let receipt = habitpack::write_package(
        Path::new(&path),
        PackageInput {
            source_os: scan
                .runtime
                .os_version
                .trim_start_matches("Windows ")
                .to_owned(),
            keyboard,
            software,
            guide_requested: selection.guide_requested,
        },
    )
    .map_err(|error| error.code.to_owned())?;
    let bytes = std::fs::metadata(&path)
        .map_err(|_| "EXPORT_STAT".to_owned())?
        .len() as usize;
    Ok(ExportReceipt {
        path,
        package_bytes: bytes,
        modules: receipt.modules,
        contains_secrets: false,
        validated: true,
    })
}

#[tauri::command]
pub fn import_habitpack(
    app: AppHandle,
    state: State<'_, MacWinState>,
    path: String,
) -> Result<ImportPlan, String> {
    if path.is_empty() || !path.to_ascii_lowercase().ends_with(".habitpack") {
        return Err("IMPORT_EXTENSION".to_owned());
    }
    let package = habitpack::parse_file(&path).map_err(|error| error.code.to_owned())?;
    let current = platform::read_target_preferences().map_err(|error| error.to_string())?;
    let package_name = Path::new(&path)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("迁移包")
        .to_owned();
    let plan = engine::make_plan(&package, &current, package_name);
    *state.package.lock().map_err(|_| "STATE_LOCK".to_owned())? = Some(package);
    *state.plan.lock().map_err(|_| "STATE_LOCK".to_owned())? = Some(plan.clone());
    let _ = app;
    Ok(plan)
}

#[tauri::command]
pub fn apply_plan(
    app: AppHandle,
    state: State<'_, MacWinState>,
) -> Result<MigrationOutcome, String> {
    let package = state
        .package
        .lock()
        .map_err(|_| "STATE_LOCK".to_owned())?
        .clone()
        .ok_or_else(|| "PLAN_MISSING".to_owned())?;
    let root = app
        .path()
        .app_data_dir()
        .map_err(|_| "APP_DATA_PATH".to_owned())?;
    let store = default_store(&root);
    let mut adapter = NativeAdapter;
    let outcome = engine::apply_plan(&mut adapter, &store, &package)?;
    *state.outcome.lock().map_err(|_| "STATE_LOCK".to_owned())? = Some(outcome.clone());
    Ok(outcome)
}

#[tauri::command]
pub fn rollback_module(
    app: AppHandle,
    state: State<'_, MacWinState>,
    module_id: String,
) -> Result<MigrationOutcome, String> {
    let root = app
        .path()
        .app_data_dir()
        .map_err(|_| "APP_DATA_PATH".to_owned())?;
    let store = default_store(&root);
    let mut adapter = NativeAdapter;
    let mut outcome = state
        .outcome
        .lock()
        .map_err(|_| "STATE_LOCK".to_owned())?
        .clone()
        .ok_or_else(|| "OUTCOME_MISSING".to_owned())?;
    engine::rollback_module(&mut adapter, &store, &module_id, &mut outcome.results)?;
    outcome.outcome = "restored".to_owned();
    *state.outcome.lock().map_err(|_| "STATE_LOCK".to_owned())? = Some(outcome.clone());
    Ok(outcome)
}

#[tauri::command]
pub fn rollback_all(
    app: AppHandle,
    state: State<'_, MacWinState>,
) -> Result<MigrationOutcome, String> {
    let root = app
        .path()
        .app_data_dir()
        .map_err(|_| "APP_DATA_PATH".to_owned())?;
    let store = default_store(&root);
    let mut adapter = NativeAdapter;
    let mut outcome = state
        .outcome
        .lock()
        .map_err(|_| "STATE_LOCK".to_owned())?
        .clone()
        .ok_or_else(|| "OUTCOME_MISSING".to_owned())?;
    let mut first_error = None;
    for module in ["keyboard_repeat", "finder_extensions"] {
        if let Err(error) =
            engine::rollback_module(&mut adapter, &store, module, &mut outcome.results)
        {
            first_error.get_or_insert(error);
        }
    }
    if let Some(error) = first_error {
        return Err(error);
    }
    outcome.outcome = "restored".to_owned();
    *state.outcome.lock().map_err(|_| "STATE_LOCK".to_owned())? = Some(outcome.clone());
    Ok(outcome)
}

#[allow(dead_code)]
fn _software_type_is_serializable(_: SoftwareFinding, _: SoftwarePlanItem) {}
