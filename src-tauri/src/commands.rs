use crate::engine::{self, ImportPlan, MigrationOutcome, NativeAdapter, SoftwarePlanItem};
use crate::habitpack::{self, KeyboardEvidence, PackageInput, PointerEvidence};
use crate::karabiner::{self, KarabinerStatus, KeyboardDevice};
use crate::platform::{self, RuntimeInfo, SoftwareFinding, WindowsScan};
use crate::snapshot::default_store;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::Path;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_updater::UpdaterExt;

#[derive(Default)]
pub struct MacWinState {
    pub package: Mutex<Option<habitpack::ImportedPackage>>,
    pub plan: Mutex<Option<ImportPlan>>,
    pub outcome: Mutex<Option<MigrationOutcome>>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ExportSelection {
    pub include_keyboard: bool,
    pub include_pointer: bool,
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

#[derive(Debug, Clone, Serialize)]
pub struct ReportExportReceipt {
    pub path: String,
    pub format: String,
    pub bytes: usize,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ErrorLogInput {
    pub code: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct UpdateCheckResult {
    pub status: String,
    pub version: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateInstallRequest {
    pub confirmed: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct SnapshotStatus {
    pub available: bool,
    pub version: Option<String>,
    pub created_at: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct PlanConfirmation {
    pub selected_module_ids: Vec<String>,
    pub keyboard_built_in: Option<bool>,
    pub keyboard_external: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DeviceSelfCheck {
    pub app_version: String,
    pub format_version: String,
    pub runtime: RuntimeInfo,
    pub keyboard_devices: Vec<KeyboardDevice>,
    pub karabiner: KarabinerStatus,
    pub snapshot: SnapshotStatus,
    pub recent_modules: Vec<String>,
    pub privacy_note: String,
}

#[tauri::command]
pub fn runtime_info() -> RuntimeInfo {
    platform::runtime_info()
}

#[tauri::command]
pub fn device_self_check(app: AppHandle, state: State<'_, MacWinState>) -> DeviceSelfCheck {
    let recent_modules = state
        .outcome
        .lock()
        .ok()
        .and_then(|outcome| outcome.clone())
        .map(|outcome| outcome.results.into_iter().map(|result| format!("{}:{}", result.module_id, result.status)).collect())
        .unwrap_or_default();
    let plan = karabiner::plan_for_target();
    DeviceSelfCheck {
        app_version: env!("CARGO_PKG_VERSION").to_owned(),
        format_version: habitpack::SCHEMA_VERSION.to_owned(),
        runtime: platform::runtime_info(),
        keyboard_devices: plan.devices,
        karabiner: plan.karabiner,
        snapshot: match snapshot_status_for(&app) {
            Ok(snapshot) => snapshot,
            Err(error) => SnapshotStatus {
                available: false,
                version: None,
                created_at: None,
                error: Some(error),
            },
        },
        recent_modules,
        privacy_note: "本地生成；不含用户名、路径、序列号、密码或原始配置".to_owned(),
    }
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
    let pointer = if selection.include_pointer {
        Some(PointerEvidence {
            mouse_direction: Some(scan.mouse_scroll_direction.clone()),
            trackpad_direction: Some(scan.trackpad_scroll_direction.clone()),
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
            pointer,
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
    let runtime = platform::runtime_info();
    if !runtime.supported || runtime.platform != "macos" {
        return Err("UNSUPPORTED_PLATFORM".to_owned());
    }
    let current = platform::read_target_preferences().map_err(|error| error.to_string())?;
    let package_name = Path::new(&path)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("迁移包")
        .to_owned();
    let mut plan = engine::make_plan(&package, &current, package_name);
    plan.confirmation_token = engine::confirmation_token(&plan);
    *state.package.lock().map_err(|_| "STATE_LOCK".to_owned())? = Some(package);
    *state.plan.lock().map_err(|_| "STATE_LOCK".to_owned())? = Some(plan.clone());
    let _ = app;
    Ok(plan)
}

#[tauri::command]
pub fn confirm_plan(
    state: State<'_, MacWinState>,
    confirmation: PlanConfirmation,
) -> Result<ImportPlan, String> {
    let mut plan = state
        .plan
        .lock()
        .map_err(|_| "STATE_LOCK".to_owned())?
        .clone()
        .ok_or_else(|| "PLAN_MISSING".to_owned())?;
    let known: HashSet<String> = plan
        .items
        .iter()
        .map(|item| item.module_id.clone())
        .chain(plan.software.iter().map(|item| format!("software.{}", item.id)))
        .collect();
    let mut selected = confirmation.selected_module_ids;
    selected.sort();
    selected.dedup();
    if selected.iter().any(|module| !known.contains(module)) {
        return Err("PLAN_MODULE_UNKNOWN".to_owned());
    }
    plan.selected_module_ids = selected;
    if let Some(value) = confirmation.keyboard_built_in {
        plan.keyboard_compatibility.built_in_enabled = value;
    }
    if let Some(value) = confirmation.keyboard_external {
        plan.keyboard_compatibility.external_enabled = value;
    }
    plan.confirmation_token = engine::confirmation_token(&plan);
    *state.plan.lock().map_err(|_| "STATE_LOCK".to_owned())? = Some(plan.clone());
    Ok(plan)
}

#[tauri::command]
pub fn apply_plan(
    app: AppHandle,
    state: State<'_, MacWinState>,
    keyboard_built_in: Option<bool>,
    keyboard_external: Option<bool>,
    selected_module_ids: Vec<String>,
    confirmation_token: String,
) -> Result<MigrationOutcome, String> {
    let runtime = platform::runtime_info();
    if !runtime.supported || runtime.platform != "macos" {
        return Err("UNSUPPORTED_PLATFORM".to_owned());
    }
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
    let plan = state
        .plan
        .lock()
        .map_err(|_| "STATE_LOCK".to_owned())?
        .clone()
        .ok_or_else(|| "PLAN_MISSING".to_owned())?;
    if confirmation_token.is_empty() || confirmation_token != plan.confirmation_token {
        return Err("PLAN_NOT_CONFIRMED".to_owned());
    }
    let mut requested = selected_module_ids;
    requested.sort();
    requested.dedup();
    if requested != plan.selected_module_ids {
        return Err("PLAN_NOT_CONFIRMED".to_owned());
    }
    let mut request = karabiner::request_from_plan(&plan.keyboard_compatibility);
    if let Some(enabled) = keyboard_built_in { request.built_in_enabled = enabled; }
    if let Some(enabled) = keyboard_external { request.external_enabled = enabled; }
    let selected = plan.selected_module_ids.iter().cloned().collect::<HashSet<_>>();
    let outcome = engine::apply_plan(&mut adapter, &store, &package, &request, &selected)?;
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
    for module in ["pointer_scroll", "keyboard_compatibility", "keyboard_repeat", "finder_extensions"] {
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

fn html_escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

fn report_html(outcome: &MigrationOutcome) -> String {
    let rows = outcome
        .results
        .iter()
        .map(|result| {
            format!(
                "<tr><th>{}</th><td>{} → {}</td><td>{}</td><td>{}</td></tr>",
                html_escape(&result.title),
                html_escape(&result.before),
                html_escape(&result.after),
                html_escape(&result.status),
                html_escape(&result.recovery),
            )
        })
        .collect::<String>();
    format!(
        "<!doctype html><meta charset=\"utf-8\"><title>MacWin 迁移报告</title><style>body{{font:16px system-ui,sans-serif;max-width:900px;margin:40px auto;padding:0 20px;color:#20283a}}table{{border-collapse:collapse;width:100%}}th,td{{border-bottom:1px solid #e5e8ef;padding:12px;text-align:left}}small{{color:#667085}}</style><h1>MacWin 迁移报告</h1><p><small>完成时间：{} · 结果：{}</small></p><table><thead><tr><th>模块</th><th>变化</th><th>状态</th><th>恢复</th></tr></thead><tbody>{}</tbody></table><p><small>此报告不包含 Wi‑Fi 密码、账号、完整路径、设备序列号或个人文件。</small></p>",
        html_escape(&outcome.completed_at),
        html_escape(&outcome.outcome),
        rows
    )
}

#[tauri::command]
pub fn export_report(
    app: AppHandle,
    state: State<'_, MacWinState>,
    format: String,
) -> Result<ReportExportReceipt, String> {
    let outcome = state
        .outcome
        .lock()
        .map_err(|_| "STATE_LOCK".to_owned())?
        .clone()
        .ok_or_else(|| "OUTCOME_MISSING".to_owned())?;
    let normalized = format.to_ascii_lowercase();
    if normalized != "html" && normalized != "json" {
        return Err("REPORT_FORMAT".to_owned());
    }
    let root = app
        .path()
        .app_data_dir()
        .map_err(|_| "APP_DATA_PATH".to_owned())?
        .join("reports");
    std::fs::create_dir_all(&root).map_err(|_| "REPORT_DIRECTORY".to_owned())?;
    let stamp = outcome.completed_at.replace([':', '-'], "");
    let path = root.join(format!("macwin-report-{stamp}.{normalized}"));
    let bytes = if normalized == "html" {
        report_html(&outcome).into_bytes()
    } else {
        serde_json::to_vec_pretty(&outcome).map_err(|_| "REPORT_SERIALIZE".to_owned())?
    };
    let temp = root.join(format!(".macwin-report-{}.tmp", std::process::id()));
    std::fs::write(&temp, &bytes).map_err(|_| "REPORT_WRITE".to_owned())?;
    std::fs::rename(&temp, &path).map_err(|_| "REPORT_RENAME".to_owned())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
    }
    Ok(ReportExportReceipt { path: path.to_string_lossy().into_owned(), format: normalized, bytes: bytes.len() })
}

#[tauri::command]
pub fn record_error(app: AppHandle, input: ErrorLogInput) -> Result<(), String> {
    let code = input.code.trim().to_ascii_uppercase();
    if code.is_empty()
        || code.len() > 64
        || !code
            .bytes()
            .all(|byte| byte.is_ascii_uppercase() || byte.is_ascii_digit() || byte == b'_' || byte == b'-')
    {
        return Err("ERROR_LOG_CODE".to_owned());
    }
    let format = time::format_description::parse_borrowed::<1>(
        "[year]-[month]-[day]T[hour]:[minute]:[second]Z",
    )
    .map_err(|_| "ERROR_LOG_TIME".to_owned())?;
    let timestamp = time::OffsetDateTime::now_utc()
        .format(&format)
        .map_err(|_| "ERROR_LOG_TIME".to_owned())?;
    let root = app
        .path()
        .app_data_dir()
        .map_err(|_| "APP_DATA_PATH".to_owned())?
        .join("logs");
    std::fs::create_dir_all(&root).map_err(|_| "ERROR_LOG_DIRECTORY".to_owned())?;
    let path = root.join("errors.jsonl");
    use std::io::Write;
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|_| "ERROR_LOG_WRITE".to_owned())?;
    let line = serde_json::json!({"at": timestamp, "code": code});
    writeln!(file, "{}", serde_json::to_string(&line).map_err(|_| "ERROR_LOG_SERIALIZE".to_owned())?)
        .map_err(|_| "ERROR_LOG_WRITE".to_owned())?;
    file.sync_all().map_err(|_| "ERROR_LOG_WRITE".to_owned())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

#[tauri::command]
pub fn snapshot_status(app: AppHandle) -> Result<SnapshotStatus, String> {
    snapshot_status_for(&app)
}

fn snapshot_status_for(app: &AppHandle) -> Result<SnapshotStatus, String> {
    let root = app
        .path()
        .app_data_dir()
        .map_err(|_| "APP_DATA_PATH".to_owned())?;
    let snapshot = default_store(&root).load()?;
    Ok(match snapshot {
        Some(snapshot) => SnapshotStatus {
            available: true,
            version: Some(snapshot.version),
            created_at: Some(snapshot.created_at),
            error: None,
        },
        None => SnapshotStatus {
            available: false,
            version: None,
            created_at: None,
            error: None,
        },
    })
}

#[tauri::command]
pub async fn check_update(app: AppHandle) -> Result<UpdateCheckResult, String> {
    let Some(pubkey) = option_env!("MACWIN_UPDATER_PUBKEY") else {
        return Err("UPDATE_NOT_CONFIGURED".to_owned());
    };
    if pubkey.is_empty() || pubkey == "PENDING_RELEASE_KEY" {
        return Err("UPDATE_NOT_CONFIGURED".to_owned());
    }
    let updater = app.updater().map_err(|_| "UPDATE_NOT_CONFIGURED".to_owned())?;
    let update = updater
        .check()
        .await
        .map_err(|_| "UPDATE_CHECK_FAILED".to_owned())?;
    Ok(match update {
        Some(update) => UpdateCheckResult {
            status: "available".to_owned(),
            version: Some(update.version),
        },
        None => UpdateCheckResult {
            status: "current".to_owned(),
            version: None,
        },
    })
}

#[tauri::command]
pub async fn install_update(
    app: AppHandle,
    request: UpdateInstallRequest,
) -> Result<UpdateCheckResult, String> {
    if !request.confirmed {
        return Err("UPDATE_CONFIRM_REQUIRED".to_owned());
    }
    let Some(pubkey) = option_env!("MACWIN_UPDATER_PUBKEY") else {
        return Err("UPDATE_NOT_CONFIGURED".to_owned());
    };
    if pubkey.is_empty() || pubkey == "PENDING_RELEASE_KEY" {
        return Err("UPDATE_NOT_CONFIGURED".to_owned());
    }
    let updater = app.updater().map_err(|_| "UPDATE_NOT_CONFIGURED".to_owned())?;
    let Some(update) = updater
        .check()
        .await
        .map_err(|_| "UPDATE_CHECK_FAILED".to_owned())?
    else {
        return Ok(UpdateCheckResult { status: "current".to_owned(), version: None });
    };
    let version = update.version.clone();
    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(|_| "UPDATE_INSTALL_FAILED".to_owned())?;
    Ok(UpdateCheckResult { status: "installed_restart_required".to_owned(), version: Some(version) })
}

#[allow(dead_code)]
fn _software_type_is_serializable(_: SoftwareFinding, _: SoftwarePlanItem) {}
