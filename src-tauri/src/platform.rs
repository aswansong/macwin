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
    pub scanned_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TargetPreferences {
    pub finder_extensions_existed: bool,
    pub finder_extensions: bool,
    pub key_repeat_existed: bool,
    pub key_repeat: i64,
    pub initial_key_repeat_existed: bool,
    pub initial_key_repeat: i64,
}

#[derive(Debug, Clone, thiserror::Error)]
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
            support_message: "当前平台不在 Alpha 支持范围内".to_owned(),
            alpha: true,
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
        let build = RegKey::predef(HKEY_LOCAL_MACHINE)
            .open_subkey_with_flags("SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion", KEY_READ)
            .ok()
            .and_then(|key| key.get_value::<String, _>("CurrentBuildNumber").ok())
            .and_then(|value| value.parse::<u32>().ok())
            .unwrap_or(0);
        let release = if build >= 22000 { "11" } else { "10" };
        let supported = std::env::consts::ARCH == "x86_64" && build > 0;
        RuntimeInfo {
            platform: "windows".to_owned(),
            os_version: format!("Windows {release}"),
            architecture: std::env::consts::ARCH.to_owned(),
            supported,
            support_message: if supported {
                "Windows 10/11 x64".to_owned()
            } else {
                "需要 Windows 10/11 x64".to_owned()
            },
            alpha: true,
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
        if lower.contains("chrome") {
            Some((
                "chrome",
                "Google Chrome",
                "https://www.google.com/chrome/",
                true,
            ))
        } else if lower.contains("firefox") {
            Some((
                "firefox",
                "Mozilla Firefox",
                "https://www.mozilla.org/firefox/",
                true,
            ))
        } else if lower.contains("libreoffice") {
            Some((
                "libreoffice",
                "LibreOffice",
                "https://www.libreoffice.org/",
                true,
            ))
        } else if lower.contains("visual studio code") || lower == "microsoft visual studio code" {
            Some((
                "vscode",
                "Visual Studio Code",
                "https://code.visualstudio.com/",
                false,
            ))
        } else if lower == "git" || lower.starts_with("git version") {
            Some(("git", "Git", "https://git-scm.com/", false))
        } else if lower.contains("python") {
            Some(("python", "Python", "https://www.python.org/", false))
        } else if lower.contains("node.js") || lower == "nodejs" {
            Some(("node", "Node.js", "https://nodejs.org/", false))
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
                    found.push(SoftwareFinding {
                        id: id.to_owned(),
                        name: friendly.to_owned(),
                        version: app.get_value("DisplayVersion").ok(),
                        installed: true,
                        is_default_browser: false,
                        mac_name: friendly.to_owned(),
                        official_url: official_url.to_owned(),
                        export_supported,
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
            scanned_at,
        })
    }
}

#[cfg(target_os = "macos")]
mod macos {
    use super::*;
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
            alpha: true,
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
        Ok(TargetPreferences {
            finder_extensions_existed,
            finder_extensions,
            key_repeat_existed,
            key_repeat,
            initial_key_repeat_existed,
            initial_key_repeat,
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
}
