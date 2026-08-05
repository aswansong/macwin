import { describe, expect, it } from "vitest";
import {
  canRestoreModule,
  defaultSoftwareIds,
  exportSummaryFromSelection,
  friendlyError,
  isPreviewEnvironment,
  normalizePlan,
  planGroupModuleIds,
  selectedModulesForConfirmation,
  unsupportedPlanItems,
  visiblePlanItems,
} from "./ui-contract";
import type { ImportPlan, WindowsScan } from "./types";

function fixturePlan(): ImportPlan {
  return {
    package_name: "fixture.habitpack",
    source_summary: "Windows 11 x64 → Apple 芯片 Mac",
    created_at: "2026-08-03T00:00:00Z",
    items: [
      { module_id: "finder_extensions", title: "扩展名", current_value: "隐藏", target_value: "显示", reason: "原因", benefit: "收益", verification: "复核", recovery: "恢复", requires_admin: false },
      { module_id: "keyboard_repeat", title: "键盘节奏", current_value: "默认", target_value: "匹配", reason: "原因", benefit: "收益", verification: "复核", recovery: "恢复", requires_admin: false },
      { module_id: "future_module" as ImportPlan["items"][number]["module_id"], title: "未来设置", current_value: "未知", target_value: "未知", reason: "未知", benefit: "未知", verification: "未知", recovery: "不可用", requires_admin: false },
    ],
    software: [
      { id: "chrome", name: "Chrome", version: "1", installed: true, is_default_browser: true, mac_name: "Chrome", official_url: "https://example.com", export_supported: true, category: "browser", install_mode: "official_manual", requires_homebrew: false, version_policy: "最新稳定版" },
      { id: "future-tool", name: "未来工具", version: null, installed: true, is_default_browser: false, mac_name: "未来工具", official_url: "https://example.com", export_supported: true, category: "developer", install_mode: "official_manual", requires_homebrew: false, version_policy: "待验证" },
    ],
    guide_requested: true,
    contains_secrets: false,
    keyboard_compatibility: { built_in_enabled: true, external_enabled: false, devices: [], shortcuts: [], exceptions: [], karabiner: { installed: false, version: null, config_present: false, permission: "", official_url: "" }, recovery: "恢复" },
    confirmation_token: "token",
    pointer: null,
    pointer_support: { linear_mouse_installed: false, linear_mouse_version: null, native_independent: false, permission: "", official_url: "" },
    wifi: { name: "Home", credential_status: "not_selected", contains_secrets: false, note: "" },
    selected_module_ids: ["finder_extensions", "keyboard_repeat", "future_module", "software.chrome", "software.future-tool", "wifi.personal"],
  };
}

function fixtureScan(): WindowsScan {
  return {
    runtime: { platform: "windows", os_version: "Windows 11", architecture: "x86_64", supported: true, support_message: "", alpha: false },
    default_browser: "Chrome",
    software: [
      { id: "chrome", name: "Chrome", version: "1", installed: true, is_default_browser: true, mac_name: "Chrome", official_url: "https://example.com", export_supported: true, category: "browser", install_mode: "official_manual", requires_homebrew: false, version_policy: "最新稳定版" },
      { id: "future-tool", name: "未来工具", version: "1", installed: true, is_default_browser: false, mac_name: "未来工具", official_url: "https://example.com", export_supported: true, category: "developer", install_mode: "official_manual", requires_homebrew: false, version_policy: "待验证" },
    ],
    input_languages: [],
    keyboard_layouts: [],
    keyboard_repeat_speed: 1,
    keyboard_repeat_delay: 1,
    mouse_scroll_direction: "windows_style",
    trackpad_scroll_direction: "windows_style",
    scanned_at: "2026-08-03T00:00:00Z",
  };
}

describe("v6 integration contracts", () => {
  it("keeps preview data out of Tauri mode", () => {
    expect(isPreviewEnvironment(false, true)).toBe(true);
    expect(isPreviewEnvironment(true, true)).toBe(false);
    expect(isPreviewEnvironment(false, false)).toBe(false);
  });

  it("preserves hidden keyboard repeat while filtering unknown selections", () => {
    const normalized = normalizePlan(fixturePlan());
    expect(normalized.items.some((item) => item.module_id === "keyboard_repeat")).toBe(true);
    expect(normalized.selected_module_ids).toEqual(["finder_extensions", "keyboard_repeat", "software.chrome", "wifi.personal"]);
    expect(visiblePlanItems(normalized).some((item) => item.module_id === "keyboard_repeat")).toBe(false);
    expect(planGroupModuleIds(normalized, "habits")).toContain("keyboard_repeat");
    expect(unsupportedPlanItems(normalized).map((item) => item.title)).toEqual(["未来设置"]);
    const remainingAfterHabitDeselection = normalized.selected_module_ids.filter((moduleId) => !planGroupModuleIds(normalized, "habits").includes(moduleId));
    expect(remainingAfterHabitDeselection).toEqual(["software.chrome"]);
    expect(selectedModulesForConfirmation({ ...normalized, selected_module_ids: [...normalized.selected_module_ids, "future_module"] })).toEqual(normalized.selected_module_ids);
  });

  it("does not expose real Wi-Fi secrets in the export summary", () => {
    const summary = exportSummaryFromSelection(fixtureScan(), { include_keyboard: true, include_pointer: true, software_ids: ["chrome"], guide_requested: true });
    expect(summary.selectedCount).toBe(3);
    expect(summary.containsSecrets).toBe(false);
    expect(summary.rows.find((row) => row.title === "Wi‑Fi")?.status).toContain("不读取");
  });

  it("carries detected software to the Mac plan for one confirmation", () => {
    expect(defaultSoftwareIds(fixtureScan())).toEqual(["chrome"]);
  });

  it("offers recovery only for modules that can be restored", () => {
    expect(canRestoreModule({ module_id: "finder_extensions", title: "", before: "", after: "", reason: "", benefit: "", recovery: "", status: "applied_verified", error_code: null })).toBe(true);
    expect(canRestoreModule({ module_id: "software.chrome", title: "", before: "", after: "", reason: "", benefit: "", recovery: "", status: "manual_action_required", error_code: null })).toBe(false);
    expect(friendlyError("HP_SCHEMA_VERSION")).toContain("同一 major");
    expect(friendlyError("TAURI_INVALID_ARGS")).toContain("参数没有对齐");
    expect(friendlyError("UNKNOWN_ERROR")).toContain("没有继续修改系统");
  });
});
