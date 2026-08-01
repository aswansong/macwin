export type PlatformKind = "windows" | "macos" | "unsupported";

export interface RuntimeInfo {
  platform: PlatformKind;
  os_version: string;
  architecture: string;
  supported: boolean;
  support_message: string;
  alpha: boolean;
}

export interface SoftwareFinding {
  id: string;
  name: string;
  version: string | null;
  installed: boolean;
  is_default_browser: boolean;
  mac_name: string;
  official_url: string;
  export_supported: boolean;
}

export interface WindowsScan {
  runtime: RuntimeInfo;
  default_browser: string | null;
  software: SoftwareFinding[];
  input_languages: string[];
  keyboard_layouts: string[];
  keyboard_repeat_speed: number;
  keyboard_repeat_delay: number;
  scanned_at: string;
}

export interface ExportSelection {
  include_keyboard: boolean;
  software_ids: string[];
  guide_requested: boolean;
}

export interface ExportReceipt {
  path: string;
  package_bytes: number;
  modules: string[];
  contains_secrets: boolean;
  validated: boolean;
}

export interface PlanItem {
  module_id: "finder_extensions" | "keyboard_repeat" | "keyboard_compatibility";
  title: string;
  current_value: string;
  target_value: string;
  reason: string;
  benefit: string;
  verification: string;
  recovery: string;
  requires_admin: boolean;
}

export interface ImportPlan {
  package_name: string;
  source_summary: string;
  created_at: string;
  items: PlanItem[];
  software: SoftwareFinding[];
  guide_requested: boolean;
  contains_secrets: boolean;
  keyboard_compatibility: KeyboardCompatibilityPlan;
}

export interface KeyboardDevice {
  name: string;
  kind: "built_in" | "external" | string;
  recognized: boolean;
  redacted_id: string;
}

export interface KarabinerStatus {
  installed: boolean;
  version: string | null;
  config_present: boolean;
  permission: string;
  official_url: string;
}

export interface KeyboardCompatibilityPlan {
  built_in_enabled: boolean;
  external_enabled: boolean;
  devices: KeyboardDevice[];
  shortcuts: string[];
  exceptions: string[];
  karabiner: KarabinerStatus;
  recovery: string;
}

export interface DeviceSelfCheck {
  app_version: string;
  format_version: string;
  runtime: RuntimeInfo;
  keyboard_devices: KeyboardDevice[];
  karabiner: KarabinerStatus;
  recent_modules: string[];
  privacy_note: string;
}

export type ModuleStatus =
  | "applied_verified"
  | "failed_recoverable"
  | "rolled_back_verified"
  | "manual_action_required"
  | "skipped_permission"
  | "unknown_requires_review"
  | "unchanged";

export interface ModuleResult {
  module_id: "finder_extensions" | "keyboard_repeat" | "keyboard_compatibility";
  title: string;
  before: string;
  after: string;
  reason: string;
  benefit: string;
  recovery: string;
  status: ModuleStatus;
  error_code: string | null;
}

export interface MigrationOutcome {
  outcome: "completed" | "partial" | "restored";
  completed_at: string;
  snapshot_available: boolean;
  results: ModuleResult[];
  guide_sections: GuideSection[];
}

export interface GuideSection {
  title: string;
  body: string;
}

export type View =
  | "home"
  | "scanning"
  | "scan"
  | "exported"
  | "plan"
  | "applying"
  | "complete"
  | "report"
  | "guide"
  | "restore"
  | "diagnostics";

export interface AppState {
  view: View;
  runtime: RuntimeInfo | null;
  scan: WindowsScan | null;
  plan: ImportPlan | null;
  outcome: MigrationOutcome | null;
  selection: ExportSelection;
  receipt: ExportReceipt | null;
  diagnostics: DeviceSelfCheck | null;
  busy: boolean;
  error: string | null;
  webPreview: boolean;
}
