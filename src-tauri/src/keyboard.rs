//! Native keyboard compatibility for MacWin.
//!
//! The first release uses macOS' built-in per-device modifier mapping for the
//! MacBook keyboard only.  It deliberately does not install, configure, or
//! remove a third-party remapper.  A small read-only conflict check is exposed
//! so the plan can warn when another remapper may compete for the same device.

#![cfg_attr(not(target_os = "macos"), allow(dead_code))]

use crate::platform::{PlatformError, TargetPreferences};
use serde::Serialize;

pub const SHORTCUTS: &[&str] = &["Control ↔ Command（内置键盘）"];

#[derive(Debug, Clone, Serialize)]
pub struct KeyboardDevice {
    pub name: String,
    pub kind: String,
    pub recognized: bool,
    pub redacted_id: String,
    #[serde(skip_serializing)]
    pub vendor_id: Option<u64>,
    #[serde(skip_serializing)]
    pub product_id: Option<u64>,
    #[serde(skip_serializing)]
    pub location_id: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct KeyboardConflictStatus {
    pub detected: bool,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct KeyboardCompatibilityPlan {
    pub built_in_enabled: bool,
    /// Kept in the wire contract for old frontends. Native v1 never changes
    /// external keyboards automatically, so this is always false.
    pub external_enabled: bool,
    pub devices: Vec<KeyboardDevice>,
    pub shortcuts: Vec<String>,
    pub exceptions: Vec<String>,
    pub conflict: KeyboardConflictStatus,
    pub recovery: String,
}

#[derive(Debug, Clone)]
pub struct KeyboardCompatibilityRequest {
    pub built_in_enabled: bool,
    /// Compatibility input retained for old clients; ignored by native v1.
    pub external_enabled: bool,
    pub devices: Vec<KeyboardDevice>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ApplyReport {
    pub status: String,
    pub detail: String,
}

pub fn plan_for_target() -> KeyboardCompatibilityPlan {
    let devices = crate::platform::keyboard_devices();
    let built_in_enabled = devices
        .iter()
        .any(|device| device.kind == "built_in" && device.recognized);
    KeyboardCompatibilityPlan {
        built_in_enabled,
        external_enabled: false,
        devices,
        shortcuts: SHORTCUTS.iter().map(|value| (*value).to_owned()).collect(),
        exceptions: vec![
            "外接键盘默认不改变".to_owned(),
            "Option 与 Fn 不重映射".to_owned(),
            "冲突检测只读，不安装第三方工具".to_owned(),
        ],
        conflict: crate::platform::keyboard_conflict_status(),
        recovery: "恢复内置键盘原有 Control/Command 映射（包括原来不存在的状态）".to_owned(),
    }
}

pub fn request_from_plan(plan: &KeyboardCompatibilityPlan) -> KeyboardCompatibilityRequest {
    KeyboardCompatibilityRequest {
        built_in_enabled: plan.built_in_enabled,
        external_enabled: false,
        devices: plan.devices.clone(),
    }
}

pub fn apply(request: &KeyboardCompatibilityRequest) -> Result<ApplyReport, PlatformError> {
    if !request.built_in_enabled {
        return Ok(ApplyReport {
            status: "unchanged".to_owned(),
            detail: "未选择内置键盘兼容；外接键盘保持系统原样".to_owned(),
        });
    }
    if !request
        .devices
        .iter()
        .any(|device| device.kind == "built_in" && device.recognized)
    {
        return Ok(ApplyReport {
            status: "manual_action_required".to_owned(),
            detail: "未识别到内置键盘，MacWin 不会猜测设备".to_owned(),
        });
    }
    crate::platform::apply_builtin_modifier_swap()
}

pub fn remove(previous: &TargetPreferences) -> Result<ApplyReport, PlatformError> {
    crate::platform::restore_builtin_modifier_mapping(previous)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn native_plan_never_enables_external_keyboard() {
        let plan = KeyboardCompatibilityPlan {
            built_in_enabled: true,
            external_enabled: true,
            devices: Vec::new(),
            shortcuts: Vec::new(),
            exceptions: Vec::new(),
            conflict: KeyboardConflictStatus {
                detected: false,
                detail: String::new(),
            },
            recovery: String::new(),
        };
        assert!(!request_from_plan(&plan).external_enabled);
    }

    #[test]
    fn native_target_plan_keeps_external_and_option_fn_unchanged() {
        let plan = plan_for_target();
        assert!(!plan.external_enabled);
        assert!(plan
            .exceptions
            .iter()
            .any(|item| item.contains("Option") && item.contains("Fn")));
        assert!(plan.recovery.contains("原有 Control/Command 映射"));
    }

    #[test]
    fn native_shortcut_contract_has_one_built_in_mapping() {
        let plan = plan_for_target();
        assert_eq!(plan.shortcuts, vec!["Control ↔ Command（内置键盘）"]);
        assert!(plan.shortcuts.iter().all(|item| item.contains("内置键盘")));
    }
}
