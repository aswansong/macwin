use crate::habitpack::{ImportedPackage, KeyboardEvidence};
use crate::platform::{PlatformError, TargetPreferences};
use crate::snapshot::{Snapshot, SnapshotStore};
use serde::Serialize;

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
    }
    let software = package
        .software
        .iter()
        .map(|item| SoftwarePlanItem {
            id: item.id.clone(),
            name: item.name.clone(),
            version: item.version.clone(),
            installed: true,
            is_default_browser: item.is_default_browser,
            mac_name: item.name.clone(),
            official_url: item.official_url.clone(),
            export_supported: true,
        })
        .collect();
    ImportPlan {
        package_name,
        source_summary: format!("Windows {} x64 → Apple 芯片 Mac", package.source_os),
        created_at: package.created_at.clone(),
        items,
        software,
        guide_requested: package.guide_requested,
        contains_secrets: package.contains_secrets,
    }
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
    sections.push(GuideSection { title: "Command、Option 和 Fn".to_owned(), body: "Command 是 Mac 最常用的编辑修饰键；Option 常表示替代操作或特殊字符；Fn 用于功能键和系统功能。MacWin Alpha 不会重映射它们。".to_owned() });
    sections.push(GuideSection { title: "Mac 适合你的地方".to_owned(), body: "如果你经常外出，Apple 芯片 MacBook 的能效、触控板和睡眠唤醒整合可能更省心。轻量 AI 编程也可以利用 macOS 的 Unix 工具链。".to_owned() });
    sections.push(GuideSection { title: "Windows 仍然更合适的地方".to_owned(), body: "某些企业系统、专用 Windows 软件、游戏和特殊外设仍可能更适合留在 Windows；这不是一次迁移就能解决的差异。".to_owned() });
    sections
}

pub fn apply_plan<A: TargetAdapter>(
    adapter: &mut A,
    store: &SnapshotStore,
    package: &ImportedPackage,
) -> Result<MigrationOutcome, String> {
    let before = adapter
        .read_preferences()
        .map_err(|error| error_code(&error))?;
    let created_at = now()?;
    let _snapshot: Snapshot = store.save(before.clone(), created_at)?;
    let mut results = Vec::new();
    let finder_apply = adapter.set_finder_extensions(true).and_then(|_| {
        adapter.read_preferences().and_then(|value| {
            if value.finder_extensions {
                Ok(())
            } else {
                Err(PlatformError::Read("FINDER_VERIFY"))
            }
        })
    });
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
            after: "未改变".to_owned(),
            reason: "让文件类型一眼可见。".to_owned(),
            benefit: "减少打开错误文件的机会。".to_owned(),
            recovery: "快照可恢复".to_owned(),
            status: "failed_recoverable".to_owned(),
            error_code: Some(error_code(&error)),
        }),
    }
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
    }
    let success = results.iter().all(|item| item.status == "applied_verified");
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
        _ => return Err("MODULE_UNKNOWN".to_owned()),
    }
    let after = adapter
        .read_preferences()
        .map_err(|error| error_code(&error))?;
    let verified = if module_id == "finder_extensions" {
        after.finder_extensions == preferences.finder_extensions
    } else {
        after.key_repeat == preferences.key_repeat
            && after.initial_key_repeat == preferences.initial_key_repeat
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
            software: vec![],
            guide_requested: true,
            contains_secrets: false,
            entries: 2,
        };
        let outcome = apply_plan(&mut adapter, &store, &package).expect("outcome");
        assert_eq!(outcome.outcome, "partial");
        assert_eq!(outcome.results[0].status, "failed_recoverable");
        assert_eq!(outcome.results[1].status, "applied_verified");
        assert!(store.path().exists());
    }
}
