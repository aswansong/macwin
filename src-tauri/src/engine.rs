use crate::habitpack::{ImportedPackage, KeyboardEvidence, PointerEvidence};
use crate::karabiner::{ApplyReport, KeyboardCompatibilityPlan, KeyboardCompatibilityRequest};
use crate::platform::{PlatformError, PointerSupport, TargetPreferences};
use crate::snapshot::{Snapshot, SnapshotStore};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::collections::HashSet;

pub trait TargetAdapter {
    fn read_preferences(&mut self) -> Result<TargetPreferences, PlatformError>;
    fn set_finder_extensions(&mut self, value: bool) -> Result<(), PlatformError>;
    fn set_keyboard_repeat(
        &mut self,
        key_repeat: i64,
        initial_key_repeat: i64,
    ) -> Result<(), PlatformError>;
    fn restore_keyboard_repeat(&mut self, previous: TargetPreferences)
        -> Result<(), PlatformError>;
    fn set_keyboard_compatibility(
        &mut self,
        request: &KeyboardCompatibilityRequest,
    ) -> Result<ApplyReport, PlatformError>;
    fn restore_keyboard_compatibility(&mut self) -> Result<ApplyReport, PlatformError>;
    fn set_pointer(
        &mut self,
        pointer: &PointerEvidence,
    ) -> Result<crate::platform::PointerApplyReport, PlatformError>;
    fn restore_pointer(
        &mut self,
        previous: TargetPreferences,
    ) -> Result<crate::platform::PointerApplyReport, PlatformError>;
}

pub struct NativeAdapter;

impl TargetAdapter for NativeAdapter {
    fn read_preferences(&mut self) -> Result<TargetPreferences, PlatformError> {
        crate::platform::read_target_preferences()
    }
    fn set_finder_extensions(&mut self, value: bool) -> Result<(), PlatformError> {
        crate::platform::apply_finder_extensions(value)
    }
    fn set_keyboard_repeat(
        &mut self,
        key_repeat: i64,
        initial_key_repeat: i64,
    ) -> Result<(), PlatformError> {
        crate::platform::apply_keyboard_repeat(key_repeat, initial_key_repeat)
    }
    fn restore_keyboard_repeat(
        &mut self,
        previous: TargetPreferences,
    ) -> Result<(), PlatformError> {
        crate::platform::restore_keyboard_repeat(previous)
    }
    fn set_keyboard_compatibility(
        &mut self,
        request: &KeyboardCompatibilityRequest,
    ) -> Result<ApplyReport, PlatformError> {
        crate::karabiner::apply(request)
    }
    fn restore_keyboard_compatibility(&mut self) -> Result<ApplyReport, PlatformError> {
        crate::karabiner::remove(&crate::platform::read_target_preferences()?)
    }
    fn set_pointer(
        &mut self,
        pointer: &PointerEvidence,
    ) -> Result<crate::platform::PointerApplyReport, PlatformError> {
        crate::platform::apply_pointer(pointer)
    }
    fn restore_pointer(
        &mut self,
        previous: TargetPreferences,
    ) -> Result<crate::platform::PointerApplyReport, PlatformError> {
        crate::platform::restore_pointer(previous)
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct PlanItem {
    pub module_id: String,
    pub title: String,
    pub current_value: String,
    pub target_value: String,
    pub reason: String,
    pub benefit: String,
    pub verification: String,
    pub recovery: String,
    pub requires_admin: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct SoftwarePlanItem {
    pub id: String,
    pub name: String,
    pub version: Option<String>,
    pub installed: bool,
    pub is_default_browser: bool,
    pub mac_name: String,
    pub official_url: String,
    pub export_supported: bool,
    pub category: String,
    pub install_mode: String,
    pub requires_homebrew: bool,
    pub version_policy: String,
}

fn software_metadata(id: &str) -> (&'static str, &'static str, bool, &'static str) {
    match id {
        "edge" | "chrome" | "firefox" => ("browser", "official_manual", false, "最新稳定版"),
        "microsoft365" | "wps" => ("office", "official_manual", false, "最新稳定版"),
        "vscode" | "git" | "node" | "python" | "codex-cli" | "claude-code" => {
            ("developer", "official_manual", false, "主版本匹配")
        }
        _ => ("other", "official_manual", false, "官方版本"),
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct ImportPlan {
    pub package_name: String,
    pub source_summary: String,
    pub created_at: String,
    pub items: Vec<PlanItem>,
    pub software: Vec<SoftwarePlanItem>,
    pub guide_requested: bool,
    pub contains_secrets: bool,
    pub keyboard_compatibility: KeyboardCompatibilityPlan,
    pub pointer: Option<PointerEvidence>,
    pub pointer_support: PointerSupport,
    pub selected_module_ids: Vec<String>,
    pub confirmation_token: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ModuleResult {
    pub module_id: String,
    pub title: String,
    pub before: String,
    pub after: String,
    pub reason: String,
    pub benefit: String,
    pub recovery: String,
    pub status: String,
    pub error_code: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct GuideSection {
    pub title: String,
    pub body: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct MigrationOutcome {
    pub outcome: String,
    pub completed_at: String,
    pub snapshot_available: bool,
    pub results: Vec<ModuleResult>,
    pub guide_sections: Vec<GuideSection>,
}

pub fn map_keyboard(evidence: &KeyboardEvidence) -> (i64, i64) {
    // Windows speed is 0..31. macOS KeyRepeat is a repeat interval in 60 Hz ticks.
    // The two endpoints intentionally stay within Apple's documented preference range.
    let denominator = 2.5 + (27.5 * f64::from(evidence.speed) / 31.0);
    let key_repeat = (60.0 / denominator).round() as i64;
    let initial_key_repeat = 15 * (i64::from(evidence.delay) + 1);
    (key_repeat.clamp(2, 24), initial_key_repeat.clamp(15, 60))
}

pub fn make_plan(
    package: &ImportedPackage,
    current: &TargetPreferences,
    package_name: String,
) -> ImportPlan {
    let finder_current = if current.finder_extensions_existed {
        if current.finder_extensions {
            "显示"
        } else {
            "隐藏"
        }
    } else {
        "系统默认"
    };
    let mut items = vec![PlanItem {
        module_id: "finder_extensions".to_owned(),
        title: "显示文件扩展名".to_owned(),
        current_value: finder_current.to_owned(),
        target_value: "显示".to_owned(),
        reason: "Windows 用户通常直接看到 .docx、.xlsx 等扩展名。".to_owned(),
        benefit: "打开文件时更容易确认真实类型。".to_owned(),
        verification: "重新读取 Finder 偏好".to_owned(),
        recovery: "恢复到迁移前值".to_owned(),
        requires_admin: false,
    }];
    if let Some(keyboard) = &package.keyboard {
        let (key_repeat, initial) = map_keyboard(keyboard);
        let current_value = if current.key_repeat_existed || current.initial_key_repeat_existed {
            format!(
                "KeyRepeat={} · InitialKeyRepeat={}",
                current.key_repeat, current.initial_key_repeat
            )
        } else {
            "系统默认".to_owned()
        };
        items.push(PlanItem {
            module_id: "keyboard_repeat".to_owned(),
            title: "键盘重复速度".to_owned(),
            current_value,
            target_value: format!("KeyRepeat={} · InitialKeyRepeat={}", key_repeat, initial),
            reason: "保留你熟悉的按键响应节奏。".to_owned(),
            benefit: "长按删除和移动光标时更接近原来的手感。".to_owned(),
            verification: "重新读取系统键盘偏好".to_owned(),
            recovery: "恢复到迁移前值".to_owned(),
            requires_admin: false,
        });
        items.push(PlanItem {
            module_id: "keyboard_compatibility".to_owned(),
            title: "选择性 Ctrl 兼容".to_owned(),
            current_value: "未启用".to_owned(),
            target_value: "普通应用 Ctrl+C/V/X/Z → Command 组合".to_owned(),
            reason: "降低从 Windows 迁移后的快捷键落差。".to_owned(),
            benefit: "终端、远程桌面和虚拟机仍保留真实 Ctrl。".to_owned(),
            verification: "重新读取并验证 MacWin 自己的规则。".to_owned(),
            recovery: "只移除 MacWin 自己的规则。".to_owned(),
            requires_admin: false,
        });
    }
    if let Some(pointer) = &package.pointer {
        items.push(PlanItem {
            module_id: "pointer_scroll".to_owned(),
            title: "鼠标与触控板滚动方向".to_owned(),
            current_value: if current.pointer_scroll_existed {
                if current.pointer_scroll_reversed {
                    "自然"
                } else {
                    "Windows 风格"
                }
            } else {
                "系统默认"
            }
            .to_owned(),
            target_value: format!(
                "鼠标={} · 触控板={}",
                pointer.mouse_direction.as_deref().unwrap_or("未选择"),
                pointer.trackpad_direction.as_deref().unwrap_or("未选择")
            ),
            reason: "保留你在 Windows 上熟悉的滚动方向。".to_owned(),
            benefit: "鼠标与触控板分别说明，目标设备不存在时不会伪报成功。".to_owned(),
            verification: "写入后重新读取原生状态；需要 LinearMouse 时由用户按官方界面完成并复核。"
                .to_owned(),
            recovery: "恢复到迁移前值；第三方工具规则不由 MacWin 猜测删除。".to_owned(),
            requires_admin: false,
        });
    }
    let software: Vec<SoftwarePlanItem> = package
        .software
        .iter()
        .map(|item| {
            let (category, install_mode, requires_homebrew, version_policy) =
                software_metadata(&item.id);
            SoftwarePlanItem {
                id: item.id.clone(),
                name: item.name.clone(),
                version: item.version.clone(),
                installed: true,
                is_default_browser: item.is_default_browser,
                mac_name: item.name.clone(),
                official_url: item.official_url.clone(),
                export_supported: true,
                category: category.to_owned(),
                install_mode: install_mode.to_owned(),
                requires_homebrew,
                version_policy: version_policy.to_owned(),
            }
        })
        .collect();
    let mut selected_module_ids = items
        .iter()
        .map(|item| item.module_id.clone())
        .collect::<Vec<_>>();
    selected_module_ids.extend(software.iter().map(|item| format!("software.{}", item.id)));
    ImportPlan {
        package_name,
        source_summary: format!("Windows {} x64 → Apple 芯片 Mac", package.source_os),
        created_at: package.created_at.clone(),
        items,
        software,
        guide_requested: package.guide_requested,
        contains_secrets: package.contains_secrets,
        keyboard_compatibility: crate::karabiner::plan_for_target(),
        pointer: package.pointer.clone(),
        pointer_support: crate::platform::pointer_support(),
        selected_module_ids,
        confirmation_token: String::new(),
    }
}

pub fn confirmation_token(plan: &ImportPlan) -> String {
    let canonical = serde_json::json!({
        "package_name": plan.package_name,
        "source_summary": plan.source_summary,
        "created_at": plan.created_at,
        "items": plan.items.iter().map(|item| (&item.module_id, &item.target_value)).collect::<Vec<_>>(),
        "software": plan.software.iter().map(|item| (&item.id, &item.version)).collect::<Vec<_>>(),
        "keyboard": (&plan.keyboard_compatibility.built_in_enabled, &plan.keyboard_compatibility.external_enabled),
        "selected_modules": &plan.selected_module_ids,
    });
    let mut digest = Sha256::new();
    digest.update(serde_json::to_vec(&canonical).expect("plan token serialization"));
    format!("{:x}", digest.finalize())
}

fn now() -> Result<String, String> {
    let format = time::format_description::parse_borrowed::<1>(
        "[year]-[month]-[day]T[hour]:[minute]:[second]Z",
    )
    .map_err(|_| "TIME".to_owned())?;
    time::OffsetDateTime::now_utc()
        .format(&format)
        .map_err(|_| "TIME".to_owned())
}
fn error_code(error: &PlatformError) -> String {
    match error {
        PlatformError::Unsupported => "UNSUPPORTED_PLATFORM".to_owned(),
        PlatformError::Read(code) | PlatformError::Write(code) => (*code).to_owned(),
    }
}
fn finder_before(preferences: &TargetPreferences) -> String {
    if preferences.finder_extensions_existed {
        if preferences.finder_extensions {
            "显示".to_owned()
        } else {
            "隐藏".to_owned()
        }
    } else {
        "系统默认".to_owned()
    }
}
fn keyboard_before(preferences: &TargetPreferences) -> String {
    if preferences.key_repeat_existed || preferences.initial_key_repeat_existed {
        format!(
            "KeyRepeat={} · InitialKeyRepeat={}",
            preferences.key_repeat, preferences.initial_key_repeat
        )
    } else {
        "系统默认".to_owned()
    }
}
fn guide(results: &[ModuleResult], requested: bool) -> Vec<GuideSection> {
    if !requested {
        return Vec::new();
    }
    let keyboard = results
        .iter()
        .any(|item| item.module_id == "keyboard_repeat" && item.status == "applied_verified");
    let mut sections = Vec::new();
    if keyboard {
        sections.push(GuideSection { title: "键盘重复速度".to_owned(), body: "MacWin 只调整了按键重复节奏，没有交换 Ctrl 和 Command，也没有改变终端、远程桌面或虚拟机中的真实 Ctrl。".to_owned() });
    }
    if results
        .iter()
        .any(|item| item.module_id == "keyboard_compatibility" && item.status == "applied_verified")
    {
        sections.push(GuideSection { title: "选择性 Ctrl 兼容".to_owned(), body: "普通 Mac 应用中的 Ctrl+C/V/X/Z/Y/A/S/F/P/N/O/W/T/L/R 会转换为对应的 Command 组合；Terminal、iTerm2、Warp、远程桌面、虚拟机和 VS Code 默认保留真实 Ctrl。".to_owned() });
    }
    if results.iter().any(|item| {
        item.module_id.starts_with("software.") && item.status == "manual_action_required"
    }) {
        sections.push(GuideSection { title: "软件与开发环境".to_owned(), body: "MacWin 只保留了你选择的软件安装建议，不会搬运账号、许可证、浏览器数据或项目文件。请从报告中的官方入口逐项安装，并在安装后打开应用或命令确认版本。".to_owned() });
    }
    sections.push(GuideSection { title: "Command、Option 和 Fn".to_owned(), body: "Command 是 Mac 最常用的编辑修饰键；Option 常表示替代操作或特殊字符；Fn 用于功能键和系统功能。MacWin 不会全局交换它们。".to_owned() });
    sections.push(GuideSection { title: "Mac 适合你的地方".to_owned(), body: "如果你经常外出，Apple 芯片 MacBook 的能效、触控板和睡眠唤醒整合可能更省心。轻量 AI 编程也可以利用 macOS 的 Unix 工具链。".to_owned() });
    sections.push(GuideSection { title: "Windows 仍然更合适的地方".to_owned(), body: "某些企业系统、专用 Windows 软件、游戏和特殊外设仍可能更适合留在 Windows；这不是一次迁移就能解决的差异。".to_owned() });
    sections
}

pub fn apply_plan<A: TargetAdapter>(
    adapter: &mut A,
    store: &SnapshotStore,
    package: &ImportedPackage,
    keyboard_request: &KeyboardCompatibilityRequest,
    selected_module_ids: &HashSet<String>,
) -> Result<MigrationOutcome, String> {
    let before = adapter
        .read_preferences()
        .map_err(|error| error_code(&error))?;
    let created_at = now()?;
    let _snapshot: Snapshot = store.ensure(before.clone(), created_at)?;
    let mut results = Vec::new();
    let finder_apply = if selected_module_ids.contains("finder_extensions") {
        adapter.set_finder_extensions(true).and_then(|_| {
            adapter.read_preferences().and_then(|value| {
                if value.finder_extensions {
                    Ok(())
                } else {
                    Err(PlatformError::Read("FINDER_VERIFY"))
                }
            })
        })
    } else {
        Err(PlatformError::Read("MODULE_SKIPPED"))
    };
    match finder_apply {
        Ok(()) => results.push(ModuleResult {
            module_id: "finder_extensions".to_owned(),
            title: "显示文件扩展名".to_owned(),
            before: finder_before(&before),
            after: "显示".to_owned(),
            reason: "让文件类型一眼可见。".to_owned(),
            benefit: "减少打开错误文件的机会。".to_owned(),
            recovery: "可恢复到迁移前值".to_owned(),
            status: "applied_verified".to_owned(),
            error_code: None,
        }),
        Err(error) => results.push(ModuleResult {
            module_id: "finder_extensions".to_owned(),
            title: "显示文件扩展名".to_owned(),
            before: finder_before(&before),
            after: if error_code(&error) == "MODULE_SKIPPED" {
                "已跳过"
            } else {
                "未改变"
            }
            .to_owned(),
            reason: if error_code(&error) == "MODULE_SKIPPED" {
                "用户在计划页取消了此模块。"
            } else {
                "让文件类型一眼可见。"
            }
            .to_owned(),
            benefit: "减少打开错误文件的机会。".to_owned(),
            recovery: "快照可恢复".to_owned(),
            status: if error_code(&error) == "MODULE_SKIPPED" {
                "skipped"
            } else {
                "failed_recoverable"
            }
            .to_owned(),
            error_code: (error_code(&error) != "MODULE_SKIPPED").then(|| error_code(&error)),
        }),
    }
    if selected_module_ids.contains("keyboard_repeat") {
        if let Some(keyboard) = &package.keyboard {
            let (key_repeat, initial) = map_keyboard(keyboard);
            let keyboard_apply = adapter
                .set_keyboard_repeat(key_repeat, initial)
                .and_then(|_| {
                    adapter.read_preferences().and_then(|value| {
                        if value.key_repeat == key_repeat && value.initial_key_repeat == initial {
                            Ok(())
                        } else {
                            Err(PlatformError::Read("KEYBOARD_VERIFY"))
                        }
                    })
                });
            match keyboard_apply {
                Ok(()) => results.push(ModuleResult {
                    module_id: "keyboard_repeat".to_owned(),
                    title: "键盘重复速度".to_owned(),
                    before: keyboard_before(&before),
                    after: format!("KeyRepeat={} · InitialKeyRepeat={}", key_repeat, initial),
                    reason: "减少换机后的手感差异。".to_owned(),
                    benefit: "删除和移动文字更熟悉。".to_owned(),
                    recovery: "可恢复到迁移前值".to_owned(),
                    status: "applied_verified".to_owned(),
                    error_code: None,
                }),
                Err(error) => results.push(ModuleResult {
                    module_id: "keyboard_repeat".to_owned(),
                    title: "键盘重复速度".to_owned(),
                    before: keyboard_before(&before),
                    after: "未改变".to_owned(),
                    reason: "减少换机后的手感差异。".to_owned(),
                    benefit: "删除和移动文字更熟悉。".to_owned(),
                    recovery: "快照可恢复".to_owned(),
                    status: "failed_recoverable".to_owned(),
                    error_code: Some(error_code(&error)),
                }),
            }
        } else {
            results.push(ModuleResult {
                module_id: "keyboard_repeat".to_owned(),
                title: "键盘重复速度".to_owned(),
                before: keyboard_before(&before),
                after: "已跳过".to_owned(),
                reason: "用户在计划页取消了此模块。".to_owned(),
                benefit: "不会修改按键重复节奏。".to_owned(),
                recovery: "无需恢复。".to_owned(),
                status: "skipped".to_owned(),
                error_code: None,
            });
        }
    } else {
        results.push(ModuleResult {
            module_id: "keyboard_repeat".to_owned(),
            title: "键盘重复速度".to_owned(),
            before: keyboard_before(&before),
            after: "已跳过".to_owned(),
            reason: "用户在计划页取消了此模块。".to_owned(),
            benefit: "不会修改按键重复节奏。".to_owned(),
            recovery: "无需恢复。".to_owned(),
            status: "skipped".to_owned(),
            error_code: None,
        });
    }
    if selected_module_ids.contains("keyboard_compatibility") {
        if package.keyboard.is_some() {
            let compatibility_apply = adapter.set_keyboard_compatibility(keyboard_request);
            match compatibility_apply {
                Ok(report) if report.status == "applied_verified" => results.push(ModuleResult {
                    module_id: "keyboard_compatibility".to_owned(),
                    title: "选择性 Ctrl 兼容".to_owned(),
                    before: "未启用".to_owned(),
                    after: "普通应用 Ctrl 组合已启用".to_owned(),
                    reason: "让常用 Windows 快捷键在普通 Mac 应用中更接近原来的手感。".to_owned(),
                    benefit: "Ctrl+C/V/X/Z 等可继续使用，终端和远程桌面仍保留真实 Ctrl。"
                        .to_owned(),
                    recovery: "只移除 MacWin 自己的规则".to_owned(),
                    status: "applied_verified".to_owned(),
                    error_code: None,
                }),
                Ok(report) => results.push(ModuleResult {
                    module_id: "keyboard_compatibility".to_owned(),
                    title: "选择性 Ctrl 兼容".to_owned(),
                    before: "未启用".to_owned(),
                    after: "等待手动完成".to_owned(),
                    reason: "第三方工具或系统授权尚未就绪。".to_owned(),
                    benefit: report.detail,
                    recovery: "无需恢复，规则尚未写入".to_owned(),
                    status: "manual_action_required".to_owned(),
                    error_code: None,
                }),
                Err(error) => results.push(ModuleResult {
                    module_id: "keyboard_compatibility".to_owned(),
                    title: "选择性 Ctrl 兼容".to_owned(),
                    before: "未启用".to_owned(),
                    after: "未改变".to_owned(),
                    reason: "写入规则时遇到错误。".to_owned(),
                    benefit: "不会全局交换 Ctrl 和 Command。".to_owned(),
                    recovery: "保留原配置，可稍后重试".to_owned(),
                    status: "failed_recoverable".to_owned(),
                    error_code: Some(error_code(&error)),
                }),
            }
        } else {
            results.push(ModuleResult {
                module_id: "keyboard_compatibility".to_owned(),
                title: "选择性 Ctrl 兼容".to_owned(),
                before: "未启用".to_owned(),
                after: "已跳过".to_owned(),
                reason: "用户在计划页取消了此模块。".to_owned(),
                benefit: "不会写入键盘兼容规则。".to_owned(),
                recovery: "无需恢复。".to_owned(),
                status: "skipped".to_owned(),
                error_code: None,
            });
        }
    } else {
        results.push(ModuleResult {
            module_id: "keyboard_compatibility".to_owned(),
            title: "选择性 Ctrl 兼容".to_owned(),
            before: "未启用".to_owned(),
            after: "已跳过".to_owned(),
            reason: "用户在计划页取消了此模块。".to_owned(),
            benefit: "不会写入键盘兼容规则。".to_owned(),
            recovery: "无需恢复。".to_owned(),
            status: "skipped".to_owned(),
            error_code: None,
        });
    }
    if let Some(pointer) = &package.pointer {
        if !selected_module_ids.contains("pointer_scroll") {
            results.push(ModuleResult {
                module_id: "pointer_scroll".to_owned(),
                title: "鼠标与触控板滚动方向".to_owned(),
                before: "迁移前原生方向".to_owned(),
                after: "已跳过".to_owned(),
                reason: "用户在计划页取消了此模块。".to_owned(),
                benefit: "不会修改滚动方向。".to_owned(),
                recovery: "无需恢复。".to_owned(),
                status: "skipped".to_owned(),
                error_code: None,
            });
        } else {
            match adapter.set_pointer(pointer) {
                Ok(report) if report.status == "applied_verified" => results.push(ModuleResult {
                    module_id: "pointer_scroll".to_owned(),
                    title: "鼠标与触控板滚动方向".to_owned(),
                    before: "迁移前原生方向".to_owned(),
                    after: "已按设备目标方向应用".to_owned(),
                    reason: "保留 Windows 的滚动习惯。".to_owned(),
                    benefit: report.detail,
                    recovery: "可恢复到迁移前值".to_owned(),
                    status: "applied_verified".to_owned(),
                    error_code: None,
                }),
                Ok(report) => results.push(ModuleResult {
                    module_id: "pointer_scroll".to_owned(),
                    title: "鼠标与触控板滚动方向".to_owned(),
                    before: "迁移前原生方向".to_owned(),
                    after: "等待手动完成".to_owned(),
                    reason: "原生接口不能独立改变两个设备，未猜测第三方配置。".to_owned(),
                    benefit: report.detail,
                    recovery: "未写入 MacWin 规则，无需恢复".to_owned(),
                    status: "manual_action_required".to_owned(),
                    error_code: None,
                }),
                Err(error) => results.push(ModuleResult {
                    module_id: "pointer_scroll".to_owned(),
                    title: "鼠标与触控板滚动方向".to_owned(),
                    before: "迁移前原生方向".to_owned(),
                    after: "未改变".to_owned(),
                    reason: "写入或复核失败。".to_owned(),
                    benefit: "不会把一个设备的结果冒充另一个设备。".to_owned(),
                    recovery: "保留原状态，可稍后重试".to_owned(),
                    status: "failed_recoverable".to_owned(),
                    error_code: Some(error_code(&error)),
                }),
            }
        }
    }
    for software in &package.software {
        let module_id = format!("software.{}", software.id);
        if selected_module_ids.contains(&module_id) {
            results.push(ModuleResult {
                module_id,
                title: software.name.clone(),
                before: "MacWin 未读取目标端安装状态".to_owned(),
                after: "等待从官方入口手动安装".to_owned(),
                reason: "当前版本不会静默下载或绕过 Gatekeeper；只保留你在 Windows 端选择的软件。"
                    .to_owned(),
                benefit: "来源和版本策略清楚，账号、许可证和个人数据不会被搬运。".to_owned(),
                recovery: "不会修改已安装软件，无需恢复。".to_owned(),
                status: "manual_action_required".to_owned(),
                error_code: None,
            });
        } else {
            results.push(ModuleResult {
                module_id,
                title: software.name.clone(),
                before: "未读取".to_owned(),
                after: "已跳过".to_owned(),
                reason: "用户在 Mac 计划页取消了此软件。".to_owned(),
                benefit: "不会安装或修改软件。".to_owned(),
                recovery: "无需恢复。".to_owned(),
                status: "skipped".to_owned(),
                error_code: None,
            });
        }
    }
    let success = results
        .iter()
        .all(|item| matches!(item.status.as_str(), "applied_verified" | "skipped"));
    let completed_at = now()?;
    Ok(MigrationOutcome {
        outcome: if success { "completed" } else { "partial" }.to_owned(),
        completed_at,
        snapshot_available: true,
        guide_sections: guide(&results, package.guide_requested),
        results,
    })
}

pub fn rollback_module<A: TargetAdapter>(
    adapter: &mut A,
    store: &SnapshotStore,
    module_id: &str,
    previous: &mut [ModuleResult],
) -> Result<(), String> {
    let snapshot = store.load()?.ok_or_else(|| "SNAPSHOT_MISSING".to_owned())?;
    let preferences = TargetPreferences::from(snapshot.preferences.clone());
    match module_id {
        "finder_extensions" => crate::platform::restore_finder_extensions(preferences.clone())
            .map_err(|error| error_code(&error))?,
        "keyboard_repeat" => adapter
            .restore_keyboard_repeat(preferences.clone())
            .map_err(|error| error_code(&error))?,
        "keyboard_compatibility" => {
            let _ = adapter
                .restore_keyboard_compatibility()
                .map_err(|error| error_code(&error))?;
        }
        "pointer_scroll" => {
            let _ = adapter
                .restore_pointer(preferences.clone())
                .map_err(|error| error_code(&error))?;
        }
        _ => return Err("MODULE_UNKNOWN".to_owned()),
    }
    let after = adapter
        .read_preferences()
        .map_err(|error| error_code(&error))?;
    let verified = if module_id == "finder_extensions" {
        after.finder_extensions == preferences.finder_extensions
    } else if module_id == "keyboard_repeat" {
        after.key_repeat == preferences.key_repeat
            && after.initial_key_repeat == preferences.initial_key_repeat
    } else if module_id == "pointer_scroll" {
        after.pointer_scroll_existed == preferences.pointer_scroll_existed
            && after.pointer_scroll_reversed == preferences.pointer_scroll_reversed
    } else {
        true
    };
    if !verified {
        return Err("ROLLBACK_VERIFY".to_owned());
    }
    for result in previous
        .iter_mut()
        .filter(|result| result.module_id == module_id)
    {
        result.after = result.before.clone();
        result.status = "rolled_back_verified".to_owned();
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    struct Fake {
        value: TargetPreferences,
        fail_finder: bool,
    }
    impl TargetAdapter for Fake {
        fn read_preferences(&mut self) -> Result<TargetPreferences, PlatformError> {
            Ok(self.value.clone())
        }
        fn set_finder_extensions(&mut self, value: bool) -> Result<(), PlatformError> {
            if self.fail_finder {
                Err(PlatformError::Write("FAKE_FINDER"))
            } else {
                self.value.finder_extensions = value;
                self.value.finder_extensions_existed = true;
                Ok(())
            }
        }
        fn set_keyboard_repeat(&mut self, key: i64, initial: i64) -> Result<(), PlatformError> {
            self.value.key_repeat = key;
            self.value.initial_key_repeat = initial;
            self.value.key_repeat_existed = true;
            self.value.initial_key_repeat_existed = true;
            Ok(())
        }
        fn restore_keyboard_repeat(
            &mut self,
            previous: TargetPreferences,
        ) -> Result<(), PlatformError> {
            self.value.key_repeat = previous.key_repeat;
            self.value.initial_key_repeat = previous.initial_key_repeat;
            Ok(())
        }
        fn set_keyboard_compatibility(
            &mut self,
            _request: &KeyboardCompatibilityRequest,
        ) -> Result<ApplyReport, PlatformError> {
            Ok(ApplyReport {
                status: "manual_action_required".to_owned(),
                detail: "fake".to_owned(),
            })
        }
        fn restore_keyboard_compatibility(&mut self) -> Result<ApplyReport, PlatformError> {
            Ok(ApplyReport {
                status: "rolled_back_verified".to_owned(),
                detail: "fake".to_owned(),
            })
        }
        fn set_pointer(
            &mut self,
            _pointer: &PointerEvidence,
        ) -> Result<crate::platform::PointerApplyReport, PlatformError> {
            Ok(crate::platform::PointerApplyReport {
                status: "manual_action_required".to_owned(),
                detail: "fake".to_owned(),
            })
        }
        fn restore_pointer(
            &mut self,
            _previous: TargetPreferences,
        ) -> Result<crate::platform::PointerApplyReport, PlatformError> {
            Ok(crate::platform::PointerApplyReport {
                status: "rolled_back_verified".to_owned(),
                detail: "fake".to_owned(),
            })
        }
    }
    #[test]
    fn mapping_stays_in_safe_range() {
        let (key, initial) = map_keyboard(&KeyboardEvidence {
            speed: 31,
            delay: 3,
            layouts: vec![],
        });
        assert!((2..=24).contains(&key));
        assert_eq!(initial, 60);
    }
    #[test]
    fn confirmation_token_changes_when_module_selection_changes() {
        let package = ImportedPackage {
            created_at: "2026-08-02T00:00:00Z".to_owned(),
            source_os: "11".to_owned(),
            keyboard: None,
            pointer: None,
            software: vec![],
            guide_requested: false,
            contains_secrets: false,
            entries: 1,
        };
        let preferences = TargetPreferences {
            finder_extensions_existed: false,
            finder_extensions: false,
            key_repeat_existed: false,
            key_repeat: 0,
            initial_key_repeat_existed: false,
            initial_key_repeat: 0,
            pointer_scroll_existed: false,
            pointer_scroll_reversed: false,
        };
        let mut first = make_plan(&package, &preferences, "a.habitpack".to_owned());
        let token = confirmation_token(&first);
        first.selected_module_ids.clear();
        assert_ne!(token, confirmation_token(&first));
    }
    #[test]
    fn fake_adapter_applies_and_can_fail_in_isolation() {
        let directory = tempfile::tempdir().expect("temp");
        let store = SnapshotStore::new(directory.path());
        let mut adapter = Fake {
            value: TargetPreferences {
                finder_extensions_existed: true,
                finder_extensions: false,
                key_repeat_existed: true,
                key_repeat: 12,
                initial_key_repeat_existed: true,
                initial_key_repeat: 30,
                pointer_scroll_existed: true,
                pointer_scroll_reversed: false,
            },
            fail_finder: true,
        };
        let package = ImportedPackage {
            created_at: "2026-08-02T00:00:00Z".to_owned(),
            source_os: "11".to_owned(),
            keyboard: Some(KeyboardEvidence {
                speed: 20,
                delay: 1,
                layouts: vec![],
            }),
            pointer: None,
            software: vec![],
            guide_requested: true,
            contains_secrets: false,
            entries: 2,
        };
        let selected = [
            "finder_extensions",
            "keyboard_repeat",
            "keyboard_compatibility",
        ]
        .into_iter()
        .map(str::to_owned)
        .collect();
        let outcome = apply_plan(
            &mut adapter,
            &store,
            &package,
            &KeyboardCompatibilityRequest {
                built_in_enabled: false,
                external_enabled: false,
                devices: vec![],
            },
            &selected,
        )
        .expect("outcome");
        assert_eq!(outcome.outcome, "partial");
        assert_eq!(outcome.results[0].status, "failed_recoverable");
        assert_eq!(outcome.results[1].status, "applied_verified");
        assert!(store.path().exists());
    }

    #[test]
    fn cancelled_keyboard_modules_are_reported_as_skipped() {
        let directory = tempfile::tempdir().expect("temp");
        let store = SnapshotStore::new(directory.path());
        let mut adapter = Fake {
            value: TargetPreferences {
                finder_extensions_existed: true,
                finder_extensions: false,
                key_repeat_existed: true,
                key_repeat: 12,
                initial_key_repeat_existed: true,
                initial_key_repeat: 30,
                pointer_scroll_existed: false,
                pointer_scroll_reversed: false,
            },
            fail_finder: false,
        };
        let before_key_repeat = adapter.value.key_repeat;
        let package = ImportedPackage {
            created_at: "2026-08-02T00:00:00Z".to_owned(),
            source_os: "11".to_owned(),
            keyboard: Some(KeyboardEvidence {
                speed: 20,
                delay: 1,
                layouts: vec![],
            }),
            pointer: None,
            software: vec![],
            guide_requested: false,
            contains_secrets: false,
            entries: 2,
        };
        let selected = ["finder_extensions".to_owned()].into_iter().collect();
        let outcome = apply_plan(
            &mut adapter,
            &store,
            &package,
            &KeyboardCompatibilityRequest {
                built_in_enabled: false,
                external_enabled: false,
                devices: vec![],
            },
            &selected,
        )
        .expect("outcome");
        assert_eq!(adapter.value.key_repeat, before_key_repeat);
        assert_eq!(
            outcome
                .results
                .iter()
                .find(|result| result.module_id == "keyboard_repeat")
                .map(|result| result.status.as_str()),
            Some("skipped")
        );
        assert_eq!(
            outcome
                .results
                .iter()
                .find(|result| result.module_id == "keyboard_compatibility")
                .map(|result| result.status.as_str()),
            Some("skipped")
        );
    }

    #[test]
    fn selected_software_is_manual_and_not_reported_as_installed() {
        let directory = tempfile::tempdir().expect("temp");
        let store = SnapshotStore::new(directory.path());
        let mut adapter = Fake {
            value: TargetPreferences {
                finder_extensions_existed: true,
                finder_extensions: false,
                key_repeat_existed: false,
                key_repeat: 0,
                initial_key_repeat_existed: false,
                initial_key_repeat: 0,
                pointer_scroll_existed: false,
                pointer_scroll_reversed: false,
            },
            fail_finder: false,
        };
        let package = ImportedPackage {
            created_at: "2026-08-02T00:00:00Z".to_owned(),
            source_os: "11".to_owned(),
            keyboard: None,
            pointer: None,
            software: vec![crate::habitpack::SoftwareEvidence {
                id: "vscode".to_owned(),
                name: "Visual Studio Code".to_owned(),
                version: Some("1.92".to_owned()),
                is_default_browser: false,
                official_url: "https://code.visualstudio.com/".to_owned(),
            }],
            guide_requested: true,
            contains_secrets: false,
            entries: 2,
        };
        let preferences = adapter.value.clone();
        let plan = make_plan(&package, &preferences, "demo.habitpack".to_owned());
        assert!(plan
            .selected_module_ids
            .iter()
            .any(|id| id == "software.vscode"));
        let selected = plan.selected_module_ids.iter().cloned().collect();
        let outcome = apply_plan(
            &mut adapter,
            &store,
            &package,
            &KeyboardCompatibilityRequest {
                built_in_enabled: false,
                external_enabled: false,
                devices: vec![],
            },
            &selected,
        )
        .expect("outcome");
        let software = outcome
            .results
            .iter()
            .find(|result| result.module_id == "software.vscode")
            .expect("software result");
        assert_eq!(software.status, "manual_action_required");
        assert_eq!(outcome.outcome, "partial");
    }
}
