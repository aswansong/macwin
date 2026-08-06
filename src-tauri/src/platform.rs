use crate::habitpack::PointerEvidence;
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct RuntimeInfo {
    pub platform: String,
    pub os_version: String,
    pub architecture: String,
    pub supported: bool,
    pub support_message: String,
    pub alpha: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct SoftwareFinding {
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
}

#[derive(Debug, Clone, Serialize)]
pub struct PointerSupport {
    pub linear_mouse_installed: bool,
    pub linear_mouse_version: Option<String>,
    pub native_independent: bool,
    pub permission: String,
    pub official_url: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct PointerApplyReport {
    pub status: String,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct WindowsScan {
    pub runtime: RuntimeInfo,
    pub default_browser: Option<String>,
    pub software: Vec<SoftwareFinding>,
    pub input_languages: Vec<String>,
    pub keyboard_layouts: Vec<String>,
    pub keyboard_repeat_speed: u8,
    pub keyboard_repeat_delay: u8,
    pub mouse_scroll_direction: String,
    pub trackpad_scroll_direction: String,
    pub scanned_at: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct TargetPreferences {
    pub finder_extensions_existed: bool,
    pub finder_extensions: bool,
    pub key_repeat_existed: bool,
    pub key_repeat: i64,
    pub initial_key_repeat_existed: bool,
    pub initial_key_repeat: i64,
    pub pointer_scroll_existed: bool,
    pub pointer_scroll_reversed: bool,
    /// The exact per-device modifier mapping captured before MacWin writes.
    /// `None` means the built-in keyboard was not available at snapshot time.
    pub built_in_modifier_key: Option<String>,
    pub built_in_modifier_mapping_existed: bool,
    pub built_in_modifier_mapping: Option<String>,
}

#[derive(Debug, Clone, thiserror::Error)]
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub enum PlatformError {
    #[error("unsupported platform")]
    Unsupported,
    #[error("read failed: {0}")]
    Read(&'static str),
    #[error("write failed: {0}")]
    Write(&'static str),
}

pub fn runtime_info() -> RuntimeInfo {
    #[cfg(windows)]
    {
        windows::runtime_info()
    }
    #[cfg(target_os = "macos")]
    {
        macos::runtime_info()
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        RuntimeInfo {
            platform: "unsupported".to_owned(),
            os_version: std::env::consts::OS.to_owned(),
            architecture: std::env::consts::ARCH.to_owned(),
            supported: false,
            support_message: "需要 Windows 10/11 x64 → Apple 芯片 macOS 15/26".to_owned(),
            alpha: false,
        }
    }
}

pub fn scan_windows() -> Result<WindowsScan, PlatformError> {
    #[cfg(windows)]
    {
        windows::scan()
    }
    #[cfg(not(windows))]
    {
        Err(PlatformError::Unsupported)
    }
}

pub fn read_target_preferences() -> Result<TargetPreferences, PlatformError> {
    #[cfg(target_os = "macos")]
    {
        macos::read_preferences()
    }
    #[cfg(not(target_os = "macos"))]
    {
        Err(PlatformError::Unsupported)
    }
}

pub fn apply_finder_extensions(value: bool) -> Result<(), PlatformError> {
    #[cfg(target_os = "macos")]
    {
        macos::write_finder_extensions(value)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = value;
        Err(PlatformError::Unsupported)
    }
}

pub fn apply_keyboard_repeat(
    key_repeat: i64,
    initial_key_repeat: i64,
) -> Result<(), PlatformError> {
    #[cfg(target_os = "macos")]
    {
        macos::write_keyboard_repeat(key_repeat, initial_key_repeat)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (key_repeat, initial_key_repeat);
        Err(PlatformError::Unsupported)
    }
}

pub fn restore_finder_extensions(previous: TargetPreferences) -> Result<(), PlatformError> {
    #[cfg(target_os = "macos")]
    {
        macos::restore_finder_extensions(previous)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = previous;
        Err(PlatformError::Unsupported)
    }
}

pub fn restore_keyboard_repeat(previous: TargetPreferences) -> Result<(), PlatformError> {
    #[cfg(target_os = "macos")]
    {
        macos::restore_keyboard_repeat(previous)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = previous;
        Err(PlatformError::Unsupported)
    }
}

pub fn pointer_support() -> PointerSupport {
    #[cfg(target_os = "macos")]
    {
        macos::pointer_support()
    }
    #[cfg(not(target_os = "macos"))]
    {
        PointerSupport {
            linear_mouse_installed: false,
            linear_mouse_version: None,
            native_independent: false,
            permission: "目标 Mac 上检查".to_owned(),
            official_url: "https://linearmouse.app/".to_owned(),
        }
    }
}

pub fn apply_pointer(pointer: &PointerEvidence) -> Result<PointerApplyReport, PlatformError> {
    #[cfg(target_os = "macos")]
    {
        macos::apply_pointer(pointer)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = pointer;
        Err(PlatformError::Unsupported)
    }
}

pub fn restore_pointer(previous: TargetPreferences) -> Result<PointerApplyReport, PlatformError> {
    #[cfg(target_os = "macos")]
    {
        macos::restore_pointer(previous)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = previous;
        Err(PlatformError::Unsupported)
    }
}

pub fn keyboard_devices() -> Vec<crate::keyboard::KeyboardDevice> {
    #[cfg(target_os = "macos")]
    {
        macos::keyboard_devices()
    }
    #[cfg(not(target_os = "macos"))]
    {
        Vec::new()
    }
}

pub fn keyboard_conflict_status() -> crate::keyboard::KeyboardConflictStatus {
    #[cfg(target_os = "macos")]
    {
        macos::keyboard_conflict_status()
    }
    #[cfg(not(target_os = "macos"))]
    {
        crate::keyboard::KeyboardConflictStatus {
            detected: false,
            detail: "目标 Mac 上检查".to_owned(),
        }
    }
}

pub fn apply_builtin_modifier_swap() -> Result<crate::keyboard::ApplyReport, PlatformError> {
    #[cfg(target_os = "macos")]
    {
        macos::apply_builtin_modifier_swap()
    }
    #[cfg(not(target_os = "macos"))]
    {
        Err(PlatformError::Unsupported)
    }
}

pub fn restore_builtin_modifier_mapping(
    previous: &TargetPreferences,
) -> Result<crate::keyboard::ApplyReport, PlatformError> {
    #[cfg(target_os = "macos")]
    {
        macos::restore_builtin_modifier_mapping(previous)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = previous;
        Err(PlatformError::Unsupported)
    }
}

#[cfg(windows)]
mod windows {
    use super::*;
    use std::mem::MaybeUninit;
    use windows_sys::Win32::Globalization::{GetLocaleInfoW, LOCALE_SENGLANGUAGE};
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetKeyboardLayoutList, HKL};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        SystemParametersInfoW, SPI_GETKEYBOARDDELAY, SPI_GETKEYBOARDSPEED,
    };
    use winreg::enums::{
        HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ, KEY_WOW64_32KEY, KEY_WOW64_64KEY,
    };
    use winreg::RegKey;

    pub fn runtime_info() -> RuntimeInfo {
        let version_key = RegKey::predef(HKEY_LOCAL_MACHINE)
            .open_subkey_with_flags("SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion", KEY_READ)
            .ok();
        let build = version_key
            .as_ref()
            .and_then(|key| key.get_value::<String, _>("CurrentBuildNumber").ok())
            .and_then(|value| value.parse::<u32>().ok())
            .unwrap_or(0);
        let product_name = version_key
            .as_ref()
            .and_then(|key| key.get_value::<String, _>("ProductName").ok())
            .unwrap_or_default();
        let release = if build >= 22000 {
            Some("11")
        } else if build >= 10240 {
            Some("10")
        } else {
            None
        };
        let supported = std::env::consts::ARCH == "x86_64"
            && release.is_some()
            && product_name.contains("Windows")
            && !product_name.contains("Server");
        RuntimeInfo {
            platform: "windows".to_owned(),
            os_version: release
                .map(|value| format!("Windows {value}"))
                .unwrap_or_else(|| product_name.clone()),
            architecture: std::env::consts::ARCH.to_owned(),
            supported,
            support_message: if supported {
                "Windows 10/11 x64".to_owned()
            } else {
                "需要 Windows 10/11 x64".to_owned()
            },
            alpha: false,
        }
    }

    fn default_browser_id() -> Option<String> {
        let key = RegKey::predef(HKEY_CURRENT_USER).open_subkey_with_flags("Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\https\\UserChoice", KEY_READ).ok()?;
        let prog_id: String = key.get_value("ProgId").ok()?;
        let lower = prog_id.to_ascii_lowercase();
        if lower.contains("chrome") {
            Some("chrome".to_owned())
        } else if lower.contains("firefox") {
            Some("firefox".to_owned())
        } else if lower.contains("edge") || lower.contains("msedge") {
            Some("edge".to_owned())
        } else {
            None
        }
    }

    fn whitelist(name: &str) -> Option<(&'static str, &'static str, &'static str, bool)> {
        let lower = name.to_ascii_lowercase();
        if lower == "microsoft edge" || lower.starts_with("microsoft edge ") {
            Some((
                "edge",
                "Microsoft Edge",
                "https://www.microsoft.com/edge",
                true,
            ))
        } else if lower == "google chrome" || lower.starts_with("google chrome ") {
            Some((
                "chrome",
                "Google Chrome",
                "https://www.google.com/chrome/",
                true,
            ))
        } else if lower == "mozilla firefox" || lower.starts_with("mozilla firefox ") {
            Some((
                "firefox",
                "Mozilla Firefox",
                "https://www.mozilla.org/firefox/",
                true,
            ))
        } else if lower.contains("microsoft 365") || lower.contains("microsoft office") {
            Some((
                "microsoft365",
                "Microsoft 365",
                "https://www.microsoft.com/microsoft-365",
                true,
            ))
        } else if lower.contains("wps office") || lower == "wps" {
            Some(("wps", "WPS Office", "https://www.wps.com/", true))
        } else if lower.contains("visual studio code") || lower == "microsoft visual studio code" {
            Some((
                "vscode",
                "Visual Studio Code",
                "https://code.visualstudio.com/",
                true,
            ))
        } else if lower == "git"
            || lower.starts_with("git version")
            || lower.contains("git for windows")
        {
            Some(("git", "Git", "https://git-scm.com/", true))
        } else if lower.contains("python") {
            Some(("python", "Python", "https://www.python.org/", true))
        } else if lower.contains("node.js") || lower == "nodejs" || lower.starts_with("node.js ") {
            Some(("node", "Node.js", "https://nodejs.org/", true))
        } else if lower.contains("codex") {
            Some((
                "codex-cli",
                "Codex CLI",
                "https://github.com/openai/codex",
                true,
            ))
        } else if lower.contains("claude code") {
            Some((
                "claude-code",
                "Claude Code",
                "https://docs.anthropic.com/en/docs/claude-code",
                true,
            ))
        } else {
            None
        }
    }

    fn installed_software() -> Vec<SoftwareFinding> {
        let mut found: Vec<SoftwareFinding> = Vec::new();
        for root in [
            RegKey::predef(HKEY_CURRENT_USER),
            RegKey::predef(HKEY_LOCAL_MACHINE),
        ] {
            for view in [KEY_WOW64_64KEY, KEY_WOW64_32KEY] {
                let Ok(uninstall) = root.open_subkey_with_flags(
                    "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
                    KEY_READ | view,
                ) else {
                    continue;
                };
                for name in uninstall.enum_keys().flatten() {
                    let Ok(app) = uninstall.open_subkey_with_flags(&name, KEY_READ) else {
                        continue;
                    };
                    let Ok(display_name) = app.get_value::<String, _>("DisplayName") else {
                        continue;
                    };
                    let Some((id, friendly, official_url, export_supported)) =
                        whitelist(&display_name)
                    else {
                        continue;
                    };
                    if found.iter().any(|item| item.id == id) {
                        continue;
                    }
                    let category = match id {
                        "edge" | "chrome" | "firefox" => "browser",
                        "microsoft365" | "wps" => "office",
                        _ => "developer",
                    };
                    found.push(SoftwareFinding {
                        id: id.to_owned(),
                        name: friendly.to_owned(),
                        version: app.get_value("DisplayVersion").ok(),
                        installed: true,
                        is_default_browser: false,
                        mac_name: friendly.to_owned(),
                        official_url: official_url.to_owned(),
                        export_supported,
                        category: category.to_owned(),
                        install_mode: "official_manual".to_owned(),
                        requires_homebrew: false,
                    });
                }
            }
        }
        found
    }

    fn keyboard_layouts() -> (Vec<String>, Vec<String>) {
        let count = unsafe { GetKeyboardLayoutList(0, std::ptr::null_mut()) };
        if count <= 0 {
            return (Vec::new(), Vec::new());
        }
        let mut handles: Vec<HKL> = vec![std::ptr::null_mut(); count as usize];
        let actual = unsafe { GetKeyboardLayoutList(count, handles.as_mut_ptr()) };
        handles.truncate(actual.max(0) as usize);
        let mut layouts = Vec::new();
        let mut languages = Vec::new();
        for handle in handles {
            let raw = handle as usize as u32;
            let id = format!("{raw:08x}");
            let lcid = raw & 0xffff;
            let mut buffer = [0u16; 80];
            let length = unsafe {
                GetLocaleInfoW(
                    lcid,
                    LOCALE_SENGLANGUAGE,
                    buffer.as_mut_ptr(),
                    buffer.len() as i32,
                )
            };
            let language = if length > 1 {
                String::from_utf16_lossy(&buffer[..length as usize - 1])
            } else {
                id.clone()
            };
            layouts.push(id);
            if !languages.contains(&language) {
                languages.push(language);
            }
        }
        (languages, layouts)
    }

    fn repeat_settings() -> (u8, u8) {
        let mut speed = MaybeUninit::<u32>::zeroed();
        let mut delay = MaybeUninit::<u32>::zeroed();
        let speed_ok =
            unsafe { SystemParametersInfoW(SPI_GETKEYBOARDSPEED, 0, speed.as_mut_ptr().cast(), 0) }
                != 0;
        let delay_ok =
            unsafe { SystemParametersInfoW(SPI_GETKEYBOARDDELAY, 0, delay.as_mut_ptr().cast(), 0) }
                != 0;
        let speed = if speed_ok {
            unsafe { speed.assume_init() }.min(31) as u8
        } else {
            31
        };
        let delay = if delay_ok {
            unsafe { delay.assume_init() }.min(3) as u8
        } else {
            1
        };
        (speed, delay)
    }

    pub fn scan() -> Result<WindowsScan, PlatformError> {
        let runtime = runtime_info();
        if !runtime.supported {
            return Err(PlatformError::Unsupported);
        }
        let default = default_browser_id();
        let mut software = installed_software();
        for item in &mut software {
            item.is_default_browser = default.as_deref() == Some(item.id.as_str());
        }
        let (input_languages, keyboard_layouts) = keyboard_layouts();
        let (speed, delay) = repeat_settings();
        let scanned_at = time::OffsetDateTime::now_utc()
            .format(
                &time::format_description::parse_borrowed::<1>(
                    "[year]-[month]-[day]T[hour]:[minute]:[second]Z",
                )
                .map_err(|_| PlatformError::Read("time"))?,
            )
            .map_err(|_| PlatformError::Read("time"))?;
        Ok(WindowsScan {
            runtime,
            default_browser: default,
            software,
            input_languages,
            keyboard_layouts,
            keyboard_repeat_speed: speed,
            keyboard_repeat_delay: delay,
            mouse_scroll_direction: "windows_style".to_owned(),
            trackpad_scroll_direction: "windows_style".to_owned(),
            scanned_at,
        })
    }

    #[cfg(test)]
    mod tests {
        use super::whitelist;

        #[test]
        fn developer_whitelist_entries_are_exportable() {
            for name in [
                "Visual Studio Code",
                "Git for Windows",
                "Python 3.12",
                "Node.js",
                "Codex CLI",
                "Claude Code",
            ] {
                assert!(whitelist(name).is_some_and(|entry| entry.3), "{name}");
            }
        }

        #[test]
        fn v1_excludes_deferred_developer_and_office_tools() {
            for name in ["LibreOffice", "GitHub CLI", "uv", "Jupyter", "Ruff"] {
                assert!(whitelist(name).is_none(), "{name}");
            }
        }
    }
}

#[cfg(target_os = "macos")]
mod macos {
    use super::*;
    use crate::habitpack::PointerEvidence;
    use crate::keyboard::{ApplyReport, KeyboardConflictStatus, KeyboardDevice};
    use sha2::{Digest, Sha256};
    use std::process::Command;

    pub fn runtime_info() -> RuntimeInfo {
        let version = Command::new("/usr/bin/sw_vers")
            .arg("-productVersion")
            .output()
            .ok()
            .and_then(|output| String::from_utf8(output.stdout).ok())
            .map(|value| value.trim().to_owned())
            .unwrap_or_else(|| "unknown".to_owned());
        let major = version
            .split('.')
            .next()
            .and_then(|value| value.parse::<u32>().ok())
            .unwrap_or(0);
        let supported = std::env::consts::ARCH == "aarch64" && (major == 15 || major == 26);
        RuntimeInfo {
            platform: "macos".to_owned(),
            os_version: version,
            architecture: std::env::consts::ARCH.to_owned(),
            supported,
            support_message: if supported {
                "Apple 芯片 Mac · macOS 15/26".to_owned()
            } else {
                "需要 Apple 芯片 Mac · macOS 15/26".to_owned()
            },
            alpha: false,
        }
    }

    fn defaults_read(domain: &str, key: &str) -> Result<Option<String>, PlatformError> {
        let output = Command::new("/usr/bin/defaults")
            .args(["read", domain, key])
            .output()
            .map_err(|_| PlatformError::Read("defaults"))?;
        if !output.status.success() {
            return Ok(None);
        }
        Ok(String::from_utf8(output.stdout)
            .ok()
            .map(|value| value.trim().to_owned()))
    }

    fn current_host_defaults_read(key: &str) -> Result<Option<String>, PlatformError> {
        let output = Command::new("/usr/bin/defaults")
            .args(["-currentHost", "read", "-g", key])
            .output()
            .map_err(|_| PlatformError::Read("MODIFIER_READ"))?;
        if !output.status.success() {
            return Ok(None);
        }
        Ok(String::from_utf8(output.stdout)
            .ok()
            .map(|value| value.trim().to_owned())
            .filter(|value| !value.is_empty()))
    }

    fn parse_bool(value: Option<String>) -> (bool, bool) {
        match value {
            Some(value)
                if value.eq_ignore_ascii_case("1") || value.eq_ignore_ascii_case("true") =>
            {
                (true, true)
            }
            Some(_) => (true, false),
            None => (false, false),
        }
    }
    fn parse_number(value: Option<String>) -> (bool, i64) {
        match value.and_then(|value| value.parse::<i64>().ok()) {
            Some(value) => (true, value),
            None => (false, 0),
        }
    }

    pub fn read_preferences() -> Result<TargetPreferences, PlatformError> {
        let (finder_extensions_existed, finder_extensions) =
            parse_bool(defaults_read("NSGlobalDomain", "AppleShowAllExtensions")?);
        let (key_repeat_existed, key_repeat) =
            parse_number(defaults_read("NSGlobalDomain", "KeyRepeat")?);
        let (initial_key_repeat_existed, initial_key_repeat) =
            parse_number(defaults_read("NSGlobalDomain", "InitialKeyRepeat")?);
        let (pointer_scroll_existed, pointer_scroll_reversed) = parse_bool(defaults_read(
            "NSGlobalDomain",
            "com.apple.swipescrolldirection",
        )?);
        let built_in_modifier_key = built_in_modifier_key();
        let built_in_modifier_mapping = built_in_modifier_key
            .as_deref()
            .map(current_host_defaults_read)
            .transpose()?
            .flatten();
        Ok(TargetPreferences {
            finder_extensions_existed,
            finder_extensions,
            key_repeat_existed,
            key_repeat,
            initial_key_repeat_existed,
            initial_key_repeat,
            pointer_scroll_existed,
            pointer_scroll_reversed,
            built_in_modifier_mapping_existed: built_in_modifier_mapping.is_some(),
            built_in_modifier_key,
            built_in_modifier_mapping,
        })
    }

    fn write_defaults(args: &[&str]) -> Result<(), PlatformError> {
        let status = Command::new("/usr/bin/defaults")
            .args(args)
            .status()
            .map_err(|_| PlatformError::Write("defaults"))?;
        if status.success() {
            Ok(())
        } else {
            Err(PlatformError::Write("defaults"))
        }
    }
    pub fn write_finder_extensions(value: bool) -> Result<(), PlatformError> {
        write_defaults(&[
            "write",
            "NSGlobalDomain",
            "AppleShowAllExtensions",
            "-bool",
            if value { "true" } else { "false" },
        ])
    }
    pub fn restore_finder_extensions(previous: TargetPreferences) -> Result<(), PlatformError> {
        if previous.finder_extensions_existed {
            write_finder_extensions(previous.finder_extensions)
        } else {
            write_defaults(&["delete", "NSGlobalDomain", "AppleShowAllExtensions"])
        }
    }
    pub fn write_keyboard_repeat(
        key_repeat: i64,
        initial_key_repeat: i64,
    ) -> Result<(), PlatformError> {
        let key = key_repeat.clamp(2, 24).to_string();
        let initial = initial_key_repeat.clamp(15, 60).to_string();
        write_defaults(&["write", "NSGlobalDomain", "KeyRepeat", "-int", &key])?;
        write_defaults(&[
            "write",
            "NSGlobalDomain",
            "InitialKeyRepeat",
            "-int",
            &initial,
        ])
    }
    pub fn restore_keyboard_repeat(previous: TargetPreferences) -> Result<(), PlatformError> {
        if previous.key_repeat_existed {
            let key = previous.key_repeat.clamp(2, 24).to_string();
            write_defaults(&["write", "NSGlobalDomain", "KeyRepeat", "-int", &key])?;
        } else {
            write_defaults(&["delete", "NSGlobalDomain", "KeyRepeat"])?;
        }
        if previous.initial_key_repeat_existed {
            let initial = previous.initial_key_repeat.clamp(15, 60).to_string();
            write_defaults(&[
                "write",
                "NSGlobalDomain",
                "InitialKeyRepeat",
                "-int",
                &initial,
            ])
        } else {
            write_defaults(&["delete", "NSGlobalDomain", "InitialKeyRepeat"])
        }
    }

    pub fn apply_pointer_scroll(reversed: bool) -> Result<(), PlatformError> {
        write_defaults(&[
            "write",
            "NSGlobalDomain",
            "com.apple.swipescrolldirection",
            "-bool",
            if reversed { "true" } else { "false" },
        ])
    }

    pub fn restore_pointer_scroll(previous: TargetPreferences) -> Result<(), PlatformError> {
        if previous.pointer_scroll_existed {
            apply_pointer_scroll(previous.pointer_scroll_reversed)
        } else {
            write_defaults(&["delete", "NSGlobalDomain", "com.apple.swipescrolldirection"])
        }
    }

    fn linear_mouse_version() -> Option<String> {
        let output = Command::new("/usr/bin/defaults")
            .args([
                "read",
                "/Applications/LinearMouse.app/Contents/Info",
                "CFBundleShortVersionString",
            ])
            .output()
            .ok()?;
        if !output.status.success() {
            return None;
        }
        String::from_utf8(output.stdout)
            .ok()
            .map(|value| value.trim().to_owned())
            .filter(|value| !value.is_empty())
    }

    pub fn pointer_support() -> PointerSupport {
        let installed = std::path::Path::new("/Applications/LinearMouse.app").exists();
        PointerSupport {
            linear_mouse_installed: installed,
            linear_mouse_version: if installed {
                linear_mouse_version()
            } else {
                None
            },
            native_independent: false,
            permission: if installed {
                "LinearMouse 首次使用需要系统辅助功能授权；它会常驻菜单栏，可随时退出和卸载"
                    .to_owned()
            } else {
                "原生 macOS 只能同时改变全局滚动方向；需要独立设置时请先确认 LinearMouse 的来源、权限、常驻与卸载影响".to_owned()
            },
            official_url: "https://linearmouse.app/".to_owned(),
        }
    }

    pub fn apply_pointer(pointer: &PointerEvidence) -> Result<PointerApplyReport, PlatformError> {
        let mouse = pointer.mouse_direction.as_deref();
        let trackpad = pointer.trackpad_direction.as_deref();
        if mouse.is_none() && trackpad.is_none() {
            return Ok(PointerApplyReport {
                status: "unchanged".to_owned(),
                detail: "未选择鼠标或触控板".to_owned(),
            });
        }
        if mouse == trackpad && mouse.is_some() {
            let reversed = mouse == Some("natural");
            apply_pointer_scroll(reversed)?;
            let current = read_preferences()?;
            if current.pointer_scroll_reversed != reversed {
                return Err(PlatformError::Read("POINTER_VERIFY"));
            }
            return Ok(PointerApplyReport {
                status: "applied_verified".to_owned(),
                detail: "鼠标与触控板使用相同方向，已用 macOS 原生设置写入并复核".to_owned(),
            });
        }
        let support = pointer_support();
        Ok(PointerApplyReport {
            status: "manual_action_required".to_owned(),
            detail: if support.linear_mouse_installed {
                "鼠标与触控板方向不同；LinearMouse 已安装，但 MacWin 不会猜测其配置格式，请在计划确认后按官方界面完成并回到 MacWin 复核".to_owned()
            } else {
                "鼠标与触控板方向不同；macOS 原生设置无法独立处理，请先从官方入口安装并授权 LinearMouse，再回到 MacWin 重试".to_owned()
            },
        })
    }

    pub fn restore_pointer(
        previous: TargetPreferences,
    ) -> Result<PointerApplyReport, PlatformError> {
        restore_pointer_scroll(previous.clone())?;
        let current = read_preferences()?;
        if current.pointer_scroll_existed != previous.pointer_scroll_existed
            || current.pointer_scroll_reversed != previous.pointer_scroll_reversed
        {
            return Err(PlatformError::Read("POINTER_ROLLBACK_VERIFY"));
        }
        Ok(PointerApplyReport {
            status: "rolled_back_verified".to_owned(),
            detail: "已恢复迁移前的原生滚动方向".to_owned(),
        })
    }

    fn parse_hid_number(value: &str) -> Option<u64> {
        if let Some(hex) = value.strip_prefix("0x") {
            u64::from_str_radix(hex, 16).ok()
        } else {
            value.parse().ok()
        }
    }

    fn redacted_id(raw: &str) -> String {
        let mut hash = Sha256::new();
        hash.update(raw.as_bytes());
        let digest = hash.finalize();
        format!(
            "kb-{}",
            digest[..6]
                .iter()
                .map(|byte| format!("{byte:02x}"))
                .collect::<String>()
        )
    }

    /// Read-only HID enumeration. We only keep the vendor/product/location
    /// tuple needed by macOS' per-device defaults key and a redacted display ID.
    pub fn keyboard_devices() -> Vec<KeyboardDevice> {
        let output = Command::new("/usr/bin/hidutil")
            .args(["list"])
            .output()
            .ok()
            .and_then(|output| {
                if output.status.success() {
                    String::from_utf8(output.stdout).ok()
                } else {
                    None
                }
            });
        let Some(output) = output else {
            return Vec::new();
        };
        let mut seen = std::collections::HashSet::new();
        output
            .lines()
            .skip(2)
            .filter_map(|line| {
                let columns = line.split_whitespace().collect::<Vec<_>>();
                if columns.len() < 6
                    || parse_hid_number(columns[3]) != Some(1)
                    || parse_hid_number(columns[4]) != Some(6)
                {
                    return None;
                }
                let vendor_id = parse_hid_number(columns[0]);
                let product_id = parse_hid_number(columns[1]);
                let location_id = parse_hid_number(columns[2]);
                let built_in = columns.last().is_some_and(|value| *value == "1");
                let kind = if built_in { "built_in" } else { "external" };
                let raw = format!(
                    "{}:{}:{}:{}",
                    vendor_id.unwrap_or_default(),
                    product_id.unwrap_or_default(),
                    location_id.unwrap_or_default(),
                    kind
                );
                if !seen.insert(raw.clone()) {
                    return None;
                }
                let recognized = if built_in {
                    location_id.is_some_and(|value| value != 0)
                } else {
                    vendor_id.is_some_and(|value| value != 0)
                        && product_id.is_some_and(|value| value != 0)
                };
                Some(KeyboardDevice {
                    name: if built_in {
                        "MacBook 内置键盘".to_owned()
                    } else {
                        "外接键盘".to_owned()
                    },
                    kind: kind.to_owned(),
                    recognized,
                    redacted_id: redacted_id(&raw),
                    vendor_id,
                    product_id,
                    location_id,
                })
            })
            .collect()
    }

    fn built_in_modifier_key() -> Option<String> {
        keyboard_devices()
            .into_iter()
            .find(|device| device.kind == "built_in" && device.recognized)
            .map(|device| {
                format!(
                    "com.apple.keyboard.modifiermapping.{}-{}-{}",
                    device.vendor_id.unwrap_or_default(),
                    device.product_id.unwrap_or_default(),
                    device.location_id.unwrap_or_default()
                )
            })
    }

    pub fn keyboard_conflict_status() -> KeyboardConflictStatus {
        let config = std::env::var_os("HOME")
            .map(std::path::PathBuf::from)
            .map(|home| home.join(".config/karabiner/karabiner.json"));
        let detected = config.as_ref().is_some_and(|path| path.exists());
        KeyboardConflictStatus {
            detected,
            detail: if detected {
                "检测到第三方键位配置文件；MacWin 只写入 macOS 原生内置键盘映射，不读取或修改该文件"
                    .to_owned()
            } else {
                "未检测到已知第三方键位配置；MacWin 不会安装或写入第三方工具".to_owned()
            },
        }
    }

    const LEFT_CONTROL: &str = "30064771296";
    const LEFT_COMMAND: &str = "30064771299";
    const RIGHT_CONTROL: &str = "30064771300";
    const RIGHT_COMMAND: &str = "30064771303";

    fn normalized_mapping(value: &str) -> String {
        value.chars().filter(|ch| !ch.is_whitespace()).collect()
    }

    fn mapping_contains_swap(value: &str) -> bool {
        let normalized = normalized_mapping(value);
        [
            (LEFT_CONTROL, LEFT_COMMAND),
            (LEFT_COMMAND, LEFT_CONTROL),
            (RIGHT_CONTROL, RIGHT_COMMAND),
            (RIGHT_COMMAND, RIGHT_CONTROL),
        ]
        .iter()
        .all(|(source, destination)| {
            normalized.contains(&format!(
                "HIDKeyboardModifierMappingDst={destination};HIDKeyboardModifierMappingSrc={source};"
            )) || normalized.contains(&format!(
                "HIDKeyboardModifierMappingSrc={source};HIDKeyboardModifierMappingDst={destination};"
            ))
        })
    }

    fn write_builtin_mapping(key: &str) -> Result<(), PlatformError> {
        // `defaults` cannot nest `-dict` values inside `-array` arguments.
        // Give it one OpenStep property-list value instead; this is the same
        // native per-device mapping format that `defaults read` returns.
        let mut mapping = String::from("(\n");
        for (source, destination) in [
            (LEFT_CONTROL, LEFT_COMMAND),
            (LEFT_COMMAND, LEFT_CONTROL),
            (RIGHT_CONTROL, RIGHT_COMMAND),
            (RIGHT_COMMAND, RIGHT_CONTROL),
        ] {
            mapping.push_str(&format!(
                "{{\nHIDKeyboardModifierMappingSrc = {source};\nHIDKeyboardModifierMappingDst = {destination};\n}},\n"
            ));
        }
        mapping.push(')');
        let status = Command::new("/usr/bin/defaults")
            .args(["-currentHost", "write", "-g", key, &mapping])
            .status()
            .map_err(|_| PlatformError::Write("MODIFIER_WRITE"))?;
        if status.success() {
            Ok(())
        } else {
            Err(PlatformError::Write("MODIFIER_WRITE"))
        }
    }

    fn write_exact_mapping(key: &str, raw: &str) -> Result<(), PlatformError> {
        let status = Command::new("/usr/bin/defaults")
            .args(["-currentHost", "write", "-g", key, raw])
            .status()
            .map_err(|_| PlatformError::Write("MODIFIER_RESTORE"))?;
        if status.success() {
            Ok(())
        } else {
            Err(PlatformError::Write("MODIFIER_RESTORE"))
        }
    }

    fn delete_mapping(key: &str) -> Result<(), PlatformError> {
        let status = Command::new("/usr/bin/defaults")
            .args(["-currentHost", "delete", "-g", key])
            .status()
            .map_err(|_| PlatformError::Write("MODIFIER_RESTORE"))?;
        if status.success() || current_host_defaults_read(key)?.is_none() {
            Ok(())
        } else {
            Err(PlatformError::Write("MODIFIER_RESTORE"))
        }
    }

    pub fn apply_builtin_modifier_swap() -> Result<ApplyReport, PlatformError> {
        let Some(key) = built_in_modifier_key() else {
            return Ok(ApplyReport {
                status: "manual_action_required".to_owned(),
                detail: "未识别到内置键盘，MacWin 不会猜测设备".to_owned(),
            });
        };
        write_builtin_mapping(&key)?;
        let verified = current_host_defaults_read(&key)?
            .filter(|value| mapping_contains_swap(value))
            .is_some();
        if !verified {
            return Err(PlatformError::Read("MODIFIER_VERIFY"));
        }
        Ok(ApplyReport {
            status: "applied_verified".to_owned(),
            detail: "已用 macOS 原生设置把内置键盘 Control 与 Command 完整互换；外接键盘保持不变"
                .to_owned(),
        })
    }

    pub fn restore_builtin_modifier_mapping(
        previous: &TargetPreferences,
    ) -> Result<ApplyReport, PlatformError> {
        let Some(key) = previous.built_in_modifier_key.as_deref() else {
            return Ok(ApplyReport {
                status: "rolled_back_verified".to_owned(),
                detail: "快照中没有可恢复的内置键盘映射".to_owned(),
            });
        };
        if previous.built_in_modifier_mapping_existed {
            let raw = previous
                .built_in_modifier_mapping
                .as_deref()
                .ok_or(PlatformError::Read("MODIFIER_SNAPSHOT"))?;
            write_exact_mapping(key, raw)?;
        } else {
            delete_mapping(key)?;
        }
        let current = current_host_defaults_read(key);
        let verified = if previous.built_in_modifier_mapping_existed {
            current.ok().flatten().is_some_and(|value| {
                normalized_mapping(&value)
                    == normalized_mapping(
                        previous
                            .built_in_modifier_mapping
                            .as_deref()
                            .unwrap_or_default(),
                    )
            })
        } else {
            current.ok().flatten().is_none()
        };
        if !verified {
            return Err(PlatformError::Read("MODIFIER_ROLLBACK_VERIFY"));
        }
        Ok(ApplyReport {
            status: "rolled_back_verified".to_owned(),
            detail: "已按快照精确恢复内置键盘 Control/Command 映射".to_owned(),
        })
    }
}
