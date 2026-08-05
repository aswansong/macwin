import { invoke } from "@tauri-apps/api/core";
import type {
  DeviceSelfCheck,
  ExportReceipt,
  ExportSelection,
  ImportPlan,
  MigrationOutcome,
  RuntimeInfo,
  SnapshotStatus,
  WindowsScan,
} from "./types";

export interface PlanConfirmation {
  selected_module_ids: string[];
  keyboard_built_in?: boolean;
  keyboard_external?: boolean;
}

export interface ReportExportReceipt {
  path: string;
  format: string;
  bytes: number;
}

export interface UpdateCheckResult {
  status: string;
  version: string | null;
}

/**
 * This map is the one source of truth for the Tauri v2 command boundary.
 * Keep the Rust envelope shapes here; Tauri v2 exposes top-level primitive
 * command arguments in camelCase (applyPlan and rollbackModule fields), while nested DTO fields
 * keep their serde names. Do not hand-write invoke payloads in views. Tauri
 * does not infer a missing outer parameter (confirm_plan requires
 * { confirmation: ... }).
 */
export interface NativeCommandArgs {
  runtime_info: undefined;
  device_self_check: undefined;
  scan_windows: undefined;
  export_habitpack: { path: string; selection: ExportSelection };
  import_habitpack: { path: string };
  confirm_plan: { confirmation: PlanConfirmation };
  apply_plan: {
    keyboardBuiltIn: boolean;
    keyboardExternal: boolean;
    selectedModuleIds: string[];
    confirmationToken: string;
  };
  rollback_module: { moduleId: string };
  rollback_all: undefined;
  export_report: { format: "html" | "json" };
  record_error: { input: { code: string } };
  snapshot_status: undefined;
  delete_snapshot: { request: { confirmed: boolean } };
  check_update: undefined;
  install_update: { request: { confirmed: boolean } };
}

export interface NativeCommandResult {
  runtime_info: RuntimeInfo;
  device_self_check: DeviceSelfCheck;
  scan_windows: WindowsScan;
  export_habitpack: ExportReceipt;
  import_habitpack: ImportPlan;
  confirm_plan: ImportPlan;
  apply_plan: MigrationOutcome;
  rollback_module: MigrationOutcome;
  rollback_all: MigrationOutcome;
  export_report: ReportExportReceipt;
  record_error: void;
  snapshot_status: SnapshotStatus;
  delete_snapshot: SnapshotStatus;
  check_update: UpdateCheckResult;
  install_update: UpdateCheckResult;
}

export type NativeCommand = keyof NativeCommandArgs;

export function invokeNative<K extends NativeCommand>(
  command: K,
  args?: NativeCommandArgs[K],
): Promise<NativeCommandResult[K]> {
  return invoke<NativeCommandResult[K]>(command, args);
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return String(error ?? "");
}

/**
 * Convert backend/Tauri failures into a safe, stable code. Only this code is
 * sent to record_error; raw messages, paths and package contents never are.
 */
export function parseNativeError(error: unknown): string {
  const raw = errorText(error).replace(/^Error:\s*/i, "");
  if (
    /invalid\s+args?|missing\s+(?:required\s+)?(?:key|argument)|command\s+.+missing\s+required/i.test(raw)
  ) {
    return "TAURI_INVALID_ARGS";
  }
  const stable = raw.match(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/);
  return stable?.[0] ?? "UNKNOWN_ERROR";
}
