import type {
  ExportSelection,
  ImportPlan,
  ModuleResult,
  PlanItem,
  SoftwareFinding,
  WindowsScan,
} from "./types";

/** Runtime-facing allowlists. Unknown future values must remain visible as unsupported, never executable. */
export const SUPPORTED_PLAN_MODULE_IDS = new Set([
  "finder_extensions",
  "keyboard_repeat",
  "keyboard_compatibility",
  "pointer_scroll",
]);

export const HIDDEN_PLAN_MODULE_IDS = new Set(["keyboard_repeat"]);

export const SUPPORTED_SOFTWARE_IDS = new Set([
  "edge",
  "chrome",
  "firefox",
  "microsoft365",
  "wps",
  "vscode",
  "git",
  "node",
  "python",
  "codex-cli",
  "claude-code",
]);

export function isPreviewEnvironment(isTauri: boolean, isDev: boolean): boolean {
  return !isTauri && isDev;
}

export function friendlyError(value: unknown): string {
  const code = String(value ?? "").replace(/^Error:\s*/, "");
  const messages: Record<string, string> = {
    TAURI_INVALID_ARGS: "MacWin 与原生组件的参数没有对齐，系统没有被修改；请重新打开应用后再试。",
    UNKNOWN_ERROR: "这一步没有完成，MacWin 没有继续修改系统；请重试或查看错误码。",
    SNAPSHOT_INTEGRITY: "迁移前快照完整性校验失败，已停止恢复；原设置不会被猜测覆盖。",
    SNAPSHOT_INVALID: "迁移前快照格式无效，已停止恢复。",
    SNAPSHOT_MISSING: "没有找到这次迁移的快照，无法安全恢复。",
    PLAN_NOT_CONFIRMED: "迁移计划已变化，请重新打开计划并确认后再应用。",
    PLAN_MODULE_UNKNOWN: "迁移计划包含当前版本不认识的项目，已停止应用；请更新 MacWin 或重新导出迁移包。",
    PLAN_MISSING: "没有找到可用的迁移计划，请重新导入迁移包。",
    OUTCOME_MISSING: "没有找到可用的迁移结果，请重新执行迁移。",
    UNSUPPORTED_PLATFORM: "当前设备不在正式支持范围内，MacWin 不会修改系统。",
    IMPORT_EXTENSION: "请选择 .habitpack 迁移包。",
    HP_ZIP_STREAM: "迁移包压缩结构不受支持，已拒绝导入。",
    HP_ZIP_LAYOUT: "迁移包结构或完整性不正确，已拒绝导入。",
    HP_SCHEMA_VERSION: "这个迁移包的格式版本不受支持，请使用同一 major 版本的 MacWin 导出；未知未来 major 不会被导入。",
    MODIFIER_READ: "无法读取内置键盘的 macOS 原生映射，MacWin 没有修改它。",
    MODIFIER_WRITE: "无法写入内置键盘的 macOS 原生映射，已跳过修改。",
    MODIFIER_VERIFY: "内置键盘原生映射写入后校验失败，已停止继续修改。",
    MODIFIER_RESTORE: "无法恢复内置键盘原有映射。",
    MODIFIER_ROLLBACK_VERIFY: "内置键盘原生映射恢复后校验失败。",
    MODIFIER_SNAPSHOT: "迁移前快照缺少内置键盘映射，无法安全恢复。",
    UPDATE_CONFIRM_REQUIRED: "更新必须经过确认。",
    UPDATE_INSTALL_FAILED: "更新下载、签名校验或安装失败；当前版本未被替换。",
    SNAPSHOT_DELETE_CONFIRM_REQUIRED: "删除快照必须经过确认。",
    SNAPSHOT_DELETE: "无法删除迁移前快照；它仍然保留。",
    MODULE_NOT_RESTORABLE: "这个模块没有在本次迁移中成功修改，不能把它当作需要恢复的设置。",
    PLAN_EMPTY_SELECTION: "没有选择任何可应用项目；请返回计划页勾选至少一项。",
    SNAPSHOT_CREATE: "无法保存迁移前快照，MacWin 已停止应用；原设置没有被覆盖。",
    SNAPSHOT_LOAD: "无法读取迁移前快照，MacWin 已停止恢复；原设置保持不变。",
    ACCESSIBILITY_DENIED: "系统没有授予辅助功能权限；相关模块已降级，其他模块不受影响。",
    UAC_DENIED: "没有获得 Windows 管理员授权；相关项目已跳过，其他项目可以继续。",
    UPDATE_NOT_CONFIGURED: "当前公开版未启用自动更新；请从 GitHub Releases 手动下载并校验 SHA256SUMS。本地迁移功能不受影响。",
  };
  return messages[code] ?? (code ? `操作未完成（错误码 ${code}）。MacWin 没有继续修改系统，请重试或查看错误提示。` : "发生未知错误，请查看报告中的错误码。");
}

function selectedSoftwareIds(plan: ImportPlan): Set<string> {
  return new Set(
    plan.software
      .filter((item) => SUPPORTED_SOFTWARE_IDS.has(item.id))
      .map((item) => `software.${item.id}`),
  );
}

export function isKnownPlanModuleId(moduleId: string, plan?: ImportPlan): boolean {
  if (SUPPORTED_PLAN_MODULE_IDS.has(moduleId)) return true;
  if (moduleId === "wifi.personal") return Boolean(plan?.wifi);
  return Boolean(plan && selectedSoftwareIds(plan).has(moduleId));
}

/**
 * Preserve backend modules such as keyboard_repeat even when the compact v6 UI
 * does not render them as a separate first-level row. Unknown modules are kept
 * in the plan for a visible warning, but removed from the executable selection.
 */
export function normalizePlan(plan: ImportPlan): ImportPlan {
  const selected = plan.selected_module_ids.filter((moduleId) => isKnownPlanModuleId(moduleId, plan));
  return { ...plan, selected_module_ids: [...new Set(selected)] };
}

export function visiblePlanItems(plan: ImportPlan): PlanItem[] {
  return plan.items.filter((item) => {
    const moduleId = String(item.module_id);
    return SUPPORTED_PLAN_MODULE_IDS.has(moduleId) && !HIDDEN_PLAN_MODULE_IDS.has(moduleId);
  });
}

export function unsupportedPlanItems(plan: ImportPlan): PlanItem[] {
  return plan.items.filter((item) => !SUPPORTED_PLAN_MODULE_IDS.has(String(item.module_id)));
}

export function unsupportedSoftware(plan: ImportPlan): SoftwareFinding[] {
  return plan.software.filter((item) => !SUPPORTED_SOFTWARE_IDS.has(item.id));
}

/** The Windows page does not ask users to re-confirm software; Mac plan is the single confirmation point. */
export function defaultSoftwareIds(scan: WindowsScan): string[] {
  return scan.software
    .filter((item) => item.installed && item.export_supported && SUPPORTED_SOFTWARE_IDS.has(item.id))
    .map((item) => item.id);
}

export function planGroupModuleIds(plan: ImportPlan, group: "habits" | "software"): string[] {
  if (group === "software") {
    return plan.software
      .filter((item) => item.installed && SUPPORTED_SOFTWARE_IDS.has(item.id))
      .map((item) => `software.${item.id}`);
  }
  const ids = plan.items
    .map((item) => String(item.module_id))
    .filter((moduleId) => SUPPORTED_PLAN_MODULE_IDS.has(moduleId));
  if (plan.wifi) ids.push("wifi.personal");
  return ids;
}

export function selectedModulesForConfirmation(plan: ImportPlan): string[] {
  return plan.selected_module_ids.filter((moduleId) => isKnownPlanModuleId(moduleId, plan));
}

export function canRestoreModule(result: ModuleResult): boolean {
  const restorable = new Set([
    "finder_extensions",
    "keyboard_repeat",
    "keyboard_compatibility",
    "pointer_scroll",
    "wifi.personal",
  ]);
  return restorable.has(result.module_id) && ["applied_verified", "failed_recoverable"].includes(result.status);
}

export interface ExportSummaryRow {
  title: string;
  tone: "blue" | "yellow" | "mint" | "aqua";
  kind: "habit" | "software" | "system" | "wifi";
  status: string;
}

export interface ExportSummary {
  selectedCount: number;
  containsSecrets: boolean;
  rows: ExportSummaryRow[];
}

/** Build the W3 summary from the real Windows scan and selection, never fictional plan data. */
export function exportSummaryFromSelection(scan: WindowsScan, selection: ExportSelection): ExportSummary {
  const software = scan.software.filter(
    (item) => item.installed && item.export_supported && SUPPORTED_SOFTWARE_IDS.has(item.id) && selection.software_ids.includes(item.id),
  );
  const selectedCount = (selection.include_keyboard ? 1 : 0) + (selection.include_pointer ? 1 : 0) + software.length;
  return {
    selectedCount,
    containsSecrets: false,
    rows: [
      {
        title: "操作习惯",
        tone: "blue",
        kind: "habit",
        status: selection.include_keyboard || selection.include_pointer ? "已包含" : "未选择",
      },
      {
        title: "软件与开发",
        tone: "yellow",
        kind: "software",
        status: software.length ? `${software.length} 项 · Mac 端确认` : "Mac 端确认",
      },
      {
        title: "系统设置",
        tone: "mint",
        kind: "system",
        status: selection.guide_requested ? "已包含指南" : "未选择指南",
      },
      {
        title: "Wi‑Fi",
        tone: "aqua",
        kind: "wifi",
        status: "当前版本不读取或导出密码",
      },
    ],
  };
}
