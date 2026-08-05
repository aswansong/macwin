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
  category: string;
  install_mode: string;
  requires_homebrew: boolean;
  /** Present in Mac import plans; Windows scan responses from the native adapter may omit it. */
  version_policy?: string;
}

export interface WindowsScan {
  runtime: RuntimeInfo;
  default_browser: string | null;
  software: SoftwareFinding[];
  wifi?: WifiFinding[];
  input_languages: string[];
  keyboard_layouts: string[];
  keyboard_repeat_speed: number;
  keyboard_repeat_delay: number;
  mouse_scroll_direction: "natural" | "windows_style" | string;
  trackpad_scroll_direction: "natural" | "windows_style" | string;
  scanned_at: string;
}

export interface WifiFinding {
  id: string;
  name: string;
  security: string;
  credential_status: "available" | "unavailable" | "not_selected";
}

export interface ExportSelection {
  include_keyboard: boolean;
  include_pointer: boolean;
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
  module_id: "finder_extensions" | "keyboard_repeat" | "keyboard_compatibility" | "pointer_scroll";
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
  confirmation_token: string;
  pointer: PointerEvidence | null;
  pointer_support: PointerSupport;
  wifi?: WifiPlan;
  selected_module_ids: string[];
}

export interface WifiPlan {
  name: string;
  credential_status: "available" | "credential_unavailable" | "not_selected";
  contains_secrets: boolean;
  note: string;
}

export interface PointerEvidence {
  mouse_direction: string | null;
  trackpad_direction: string | null;
}

export interface PointerSupport {
  linear_mouse_installed: boolean;
  linear_mouse_version: string | null;
  native_independent: boolean;
  permission: string;
  official_url: string;
}

export interface KeyboardDevice {
  name: string;
  kind: "built_in" | "external" | string;
  recognized: boolean;
  redacted_id: string;
}

export interface KeyboardConflictStatus {
  detected: boolean;
  detail: string;
}

export interface SnapshotStatus {
  available: boolean;
  version: string | null;
  created_at: string | null;
  error: string | null;
}

export interface KeyboardCompatibilityPlan {
  built_in_enabled: boolean;
  external_enabled: boolean;
  devices: KeyboardDevice[];
  shortcuts: string[];
  exceptions: string[];
  conflict: KeyboardConflictStatus;
  recovery: string;
}

export interface DeviceSelfCheck {
  app_version: string;
  format_version: string;
  runtime: RuntimeInfo;
  keyboard_devices: KeyboardDevice[];
  keyboard_conflict: KeyboardConflictStatus;
  snapshot: SnapshotStatus;
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
  | "unchanged"
  | "skipped";

export interface ModuleResult {
  module_id: string;
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
  | "export"
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
  preview: PreviewState;
}

export type PreviewScenario =
  | "normal"
  | "uac-denied"
  | "permission-denied"
  | "offline"
  | "third-party-declined"
  | "module-failed"
  | "corrupt-package";

export interface PreviewState {
  scenario: PreviewScenario;
  wifiPasswordSelected: boolean;
  linearMouseConfirmed: boolean;
}
