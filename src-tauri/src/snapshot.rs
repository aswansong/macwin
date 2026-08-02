use crate::platform::TargetPreferences;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

const SNAPSHOT_VERSION: &str = "v1.0.0";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Snapshot {
    pub version: String,
    pub created_at: String,
    pub preferences: TargetPreferencesWire,
    pub integrity_sha256: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TargetPreferencesWire {
    pub finder_extensions_existed: bool,
    pub finder_extensions: bool,
    pub key_repeat_existed: bool,
    pub key_repeat: i64,
    pub initial_key_repeat_existed: bool,
    pub initial_key_repeat: i64,
    #[serde(default)]
    pub pointer_scroll_existed: bool,
    #[serde(default)]
    pub pointer_scroll_reversed: bool,
}

impl From<TargetPreferences> for TargetPreferencesWire {
    fn from(value: TargetPreferences) -> Self {
        Self {
            finder_extensions_existed: value.finder_extensions_existed,
            finder_extensions: value.finder_extensions,
            key_repeat_existed: value.key_repeat_existed,
            key_repeat: value.key_repeat,
            initial_key_repeat_existed: value.initial_key_repeat_existed,
            initial_key_repeat: value.initial_key_repeat,
            pointer_scroll_existed: value.pointer_scroll_existed,
            pointer_scroll_reversed: value.pointer_scroll_reversed,
        }
    }
}

impl From<TargetPreferencesWire> for TargetPreferences {
    fn from(value: TargetPreferencesWire) -> Self {
        Self {
            finder_extensions_existed: value.finder_extensions_existed,
            finder_extensions: value.finder_extensions,
            key_repeat_existed: value.key_repeat_existed,
            key_repeat: value.key_repeat,
            initial_key_repeat_existed: value.initial_key_repeat_existed,
            initial_key_repeat: value.initial_key_repeat,
            pointer_scroll_existed: value.pointer_scroll_existed,
            pointer_scroll_reversed: value.pointer_scroll_reversed,
        }
    }
}

#[derive(Debug, Clone)]
pub struct SnapshotStore {
    base: PathBuf,
}

impl SnapshotStore {
    pub fn new(base: impl Into<PathBuf>) -> Self {
        Self { base: base.into() }
    }
    pub fn path(&self) -> PathBuf {
        self.base.join("macwin-snapshot.json")
    }

    pub fn save(
        &self,
        preferences: TargetPreferences,
        created_at: String,
    ) -> Result<Snapshot, String> {
        fs::create_dir_all(&self.base).map_err(|_| "SNAPSHOT_DIRECTORY".to_owned())?;
        let wire = TargetPreferencesWire::from(preferences);
        let unsigned = serde_json::to_vec(&serde_json::json!({"version":SNAPSHOT_VERSION,"created_at":created_at,"preferences":wire.clone()})).map_err(|_| "SNAPSHOT_SERIALIZE".to_owned())?;
        let mut hash = Sha256::new();
        hash.update(&unsigned);
        let integrity_sha256 = format!("{:x}", hash.finalize());
        let snapshot = Snapshot {
            version: SNAPSHOT_VERSION.to_owned(),
            created_at,
            preferences: wire,
            integrity_sha256,
        };
        let bytes =
            serde_json::to_vec_pretty(&snapshot).map_err(|_| "SNAPSHOT_SERIALIZE".to_owned())?;
        let temp = self.base.join(".macwin-snapshot.tmp");
        let mut file = OpenOptions::new()
            .create(true)
            .truncate(true)
            .write(true)
            .open(&temp)
            .map_err(|_| "SNAPSHOT_WRITE".to_owned())?;
        file.write_all(&bytes)
            .map_err(|_| "SNAPSHOT_WRITE".to_owned())?;
        file.sync_all().map_err(|_| "SNAPSHOT_WRITE".to_owned())?;
        drop(file);
        fs::rename(&temp, self.path()).map_err(|_| "SNAPSHOT_RENAME".to_owned())?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = fs::set_permissions(self.path(), fs::Permissions::from_mode(0o600));
        }
        Ok(snapshot)
    }

    pub fn ensure(
        &self,
        preferences: TargetPreferences,
        created_at: String,
    ) -> Result<Snapshot, String> {
        if let Some(existing) = self.load()? {
            return Ok(existing);
        }
        self.save(preferences, created_at)
    }

    pub fn load(&self) -> Result<Option<Snapshot>, String> {
        let path = self.path();
        if !path.exists() {
            return Ok(None);
        }
        let bytes = fs::read(&path).map_err(|_| "SNAPSHOT_READ".to_owned())?;
        let snapshot: Snapshot =
            serde_json::from_slice(&bytes).map_err(|_| "SNAPSHOT_INVALID".to_owned())?;
        if snapshot.version != SNAPSHOT_VERSION || snapshot.integrity_sha256.len() != 64 {
            return Err("SNAPSHOT_INVALID".to_owned());
        }
        let unsigned = serde_json::to_vec(&serde_json::json!({
            "version": snapshot.version,
            "created_at": snapshot.created_at,
            "preferences": snapshot.preferences,
        }))
        .map_err(|_| "SNAPSHOT_INVALID".to_owned())?;
        let mut hash = Sha256::new();
        hash.update(&unsigned);
        let expected = format!("{:x}", hash.finalize());
        if expected != snapshot.integrity_sha256 {
            return Err("SNAPSHOT_INTEGRITY".to_owned());
        }
        Ok(Some(snapshot))
    }

    pub fn delete(&self) -> Result<bool, String> {
        match fs::remove_file(self.path()) {
            Ok(()) => Ok(true),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
            Err(_) => Err("SNAPSHOT_DELETE".to_owned()),
        }
    }
}

pub fn default_store(root: &Path) -> SnapshotStore {
    SnapshotStore::new(root.join("snapshots"))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn snapshot_round_trip_never_contains_secret_like_fields() {
        let directory = tempfile::tempdir().expect("temp");
        let store = SnapshotStore::new(directory.path());
        let preferences = TargetPreferences {
            finder_extensions_existed: true,
            finder_extensions: false,
            key_repeat_existed: true,
            key_repeat: 6,
            initial_key_repeat_existed: true,
            initial_key_repeat: 30,
            pointer_scroll_existed: true,
            pointer_scroll_reversed: false,
        };
        let _ = store
            .save(preferences.clone(), "2026-08-02T00:00:00Z".to_owned())
            .expect("save");
        let loaded = store.load().expect("load").expect("snapshot");
        assert_eq!(TargetPreferences::from(loaded.preferences), preferences);
        let text = std::fs::read_to_string(store.path()).expect("read");
        assert!(!text.contains("password"));
        assert!(!text.contains("ssid"));
        assert!(!text.contains("secret"));
    }

    #[test]
    fn snapshot_tampering_is_rejected() {
        let directory = tempfile::tempdir().expect("temp");
        let store = SnapshotStore::new(directory.path());
        store
            .save(
                TargetPreferences {
                    finder_extensions_existed: true,
                    finder_extensions: true,
                    key_repeat_existed: true,
                    key_repeat: 6,
                    initial_key_repeat_existed: true,
                    initial_key_repeat: 30,
                    pointer_scroll_existed: true,
                    pointer_scroll_reversed: false,
                },
                "2026-08-02T00:00:00Z".to_owned(),
            )
            .expect("save");
        let bytes = std::fs::read(store.path()).expect("read");
        let mut value: serde_json::Value = serde_json::from_slice(&bytes).expect("json");
        value["preferences"]["key_repeat"] = serde_json::json!(24);
        std::fs::write(
            store.path(),
            serde_json::to_vec_pretty(&value).expect("json"),
        )
        .expect("tamper");
        assert_eq!(store.load().unwrap_err(), "SNAPSHOT_INTEGRITY");
    }

    #[test]
    fn deleting_snapshot_is_explicit_and_idempotent() {
        let directory = tempfile::tempdir().expect("temp");
        let store = SnapshotStore::new(directory.path());
        assert!(!store.delete().expect("missing is safe"));
        store
            .save(
                TargetPreferences {
                    finder_extensions_existed: false,
                    finder_extensions: false,
                    key_repeat_existed: false,
                    key_repeat: 0,
                    initial_key_repeat_existed: false,
                    initial_key_repeat: 0,
                    pointer_scroll_existed: false,
                    pointer_scroll_reversed: false,
                },
                "2026-08-02T00:00:00Z".to_owned(),
            )
            .expect("save");
        assert!(store.delete().expect("delete"));
        assert!(store.load().expect("load").is_none());
    }
}
