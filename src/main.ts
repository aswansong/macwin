import { open, save } from "@tauri-apps/plugin-dialog";
import packageMetadata from "../package.json";
import { initialState, setView, statusLabel } from "./app-state";
import {
  invokeNative,
  parseNativeError,
  type NativeCommand,
  type NativeCommandArgs,
  type NativeCommandResult,
} from "./native-bridge";
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
  unsupportedSoftware,
  visiblePlanItems,
} from "./ui-contract";
import type {
  DeviceSelfCheck,
  GuideSection,
  ImportPlan,
  MigrationOutcome,
  ModuleResult,
  PreviewScenario,
  RuntimeInfo,
  View,
  WindowsScan,
} from "./types";
import "./styles.css";

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new Error("MacWin root not found");
const appRoot = root;
const APP_VERSION = packageMetadata.version;

const isTauri = Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
const previewEnabled = isPreviewEnvironment(isTauri, import.meta.env.DEV);
const query = new URLSearchParams(window.location.search);
const previewToolbarEnabled = previewEnabled && query.get("preview") === "1";
const previewPlatform = query.get("platform") === "windows" ? "windows" : "macos";
const previewScenario = parseScenario(query.get("scenario"));
let state = initialState(previewEnabled);
if (previewEnabled) state = { ...state, preview: { ...state.preview, scenario: previewScenario } };

function parseScenario(value: string | null): PreviewScenario {
  const allowed: PreviewScenario[] = ["normal", "uac-denied", "permission-denied", "offline", "third-party-declined", "module-failed", "corrupt-package"];
  return allowed.includes(value as PreviewScenario) ? value as PreviewScenario : "normal";
}

function runtimeFor(platform: "windows" | "macos"): RuntimeInfo {
  return platform === "windows"
    ? { platform, os_version: "Windows 11（预览）", architecture: "x86_64", supported: true, support_message: "Windows 10/11 x64", alpha: false }
    : { platform, os_version: "macOS 15（预览）", architecture: "arm64", supported: true, support_message: "Apple 芯片 Mac · macOS 15/26", alpha: false };
}

const previewRuntime = runtimeFor(previewPlatform);

const previewScan: WindowsScan = {
  runtime: runtimeFor("windows"),
  default_browser: "Chrome",
  software: [
    { id: "chrome", name: "Google Chrome", version: "126", installed: true, is_default_browser: true, mac_name: "Google Chrome", official_url: "https://www.google.com/chrome/", export_supported: true, category: "browser", install_mode: "official_manual", requires_homebrew: false, version_policy: "最新稳定版" },
    { id: "vscode", name: "Visual Studio Code", version: "1.92", installed: true, is_default_browser: false, mac_name: "Visual Studio Code", official_url: "https://code.visualstudio.com/", export_supported: true, category: "developer", install_mode: "official_manual", requires_homebrew: false, version_policy: "主版本匹配" },
    { id: "wps", name: "WPS Office", version: "12.1", installed: true, is_default_browser: false, mac_name: "WPS Office", official_url: "https://www.wps.com/", export_supported: true, category: "office", install_mode: "official_manual", requires_homebrew: false, version_policy: "最新稳定版" },
  ],
  wifi: [{ id: "wifi-home", name: "Home Wi‑Fi", security: "WPA2 Personal", credential_status: "available" }],
  input_languages: ["中文（简体）", "English (US)"],
  keyboard_layouts: ["00000804", "00000409"],
  keyboard_repeat_speed: 24,
  keyboard_repeat_delay: 1,
  mouse_scroll_direction: "windows_style",
  trackpad_scroll_direction: "windows_style",
  scanned_at: "2026-08-02T10:00:00Z",
};

const previewPlanBase: ImportPlan = {
  package_name: "windows-habits.habitpack",
  source_summary: "Windows 11 x64 → Apple 芯片 Mac",
  created_at: "2026-08-02T10:00:00Z",
  guide_requested: true,
  contains_secrets: false,
  software: previewScan.software,
  items: [
    { module_id: "finder_extensions", title: "显示文件扩展名", current_value: "隐藏（当前）", target_value: "显示", reason: "Windows 用户通常直接看到文件扩展名。", benefit: "打开文件时更容易确认真实类型。", verification: "重新读取 Finder 偏好", recovery: "恢复到迁移前值", requires_admin: false },
    { module_id: "keyboard_repeat", title: "键盘重复速度", current_value: "Mac 当前值", target_value: "匹配 Windows 节奏", reason: "保留你熟悉的按键响应节奏。", benefit: "删除和移动文字时手感更接近原来。", verification: "重新读取键盘偏好", recovery: "恢复到迁移前值", requires_admin: false },
    { module_id: "keyboard_compatibility", title: "内置键盘 Control ↔ Command", current_value: "原生映射", target_value: "内置键盘物理 Control ↔ Command", reason: "让 MacBook 内置键盘更接近 Windows 的键位肌肉记忆。", benefit: "外接键盘保持不变，Option 与 Fn 不重映射。", verification: "重新读取 macOS 原生修饰键映射", recovery: "按快照精确恢复原有映射", requires_admin: false },
    { module_id: "pointer_scroll", title: "鼠标与触控板滚动方向", current_value: "读取 Mac 当前值", target_value: "按来源设备分别处理", reason: "保留鼠标和触控板在 Windows 上的使用习惯。", benefit: "两个设备的方向分别说明，不互相覆盖。", verification: "分别读取鼠标与触控板结果", recovery: "恢复迁移前值", requires_admin: false },
  ],
    keyboard_compatibility: {
    built_in_enabled: true,
      external_enabled: false,
    devices: [
      { name: "MacBook 内置键盘（演示）", kind: "built_in", recognized: true, redacted_id: "kb-demo-01" },
      { name: "Windows 外接键盘（演示）", kind: "external", recognized: true, redacted_id: "kb-demo-02" },
    ],
    shortcuts: ["Ctrl+C → Command+C", "Ctrl+V → Command+V", "Ctrl+Z → Command+Z", "Ctrl+Y → Command+Y"],
    exceptions: ["Terminal", "远程桌面", "Parallels / VMware / UTM", "VS Code 集成终端"],
    conflict: { detected: false, detail: "浏览器演示数据；只检查冲突，不安装第三方工具" },
    recovery: "按快照精确恢复内置键盘原有映射",
  },
  confirmation_token: "preview-plan-confirmed-v1",
  pointer: { mouse_direction: "windows_style", trackpad_direction: "windows_style" },
  pointer_support: { linear_mouse_installed: false, linear_mouse_version: null, native_independent: false, permission: "浏览器演示数据；实际 Mac 按系统要求检查", official_url: "https://linearmouse.app/" },
  wifi: { name: "Home Wi‑Fi", credential_status: "not_selected", contains_secrets: false, note: "当前只带网络名；密码需要再次明确选择。" },
  selected_module_ids: ["finder_extensions", "keyboard_repeat", "keyboard_compatibility", "pointer_scroll", "software.chrome", "software.vscode", "software.wps"],
};

const previewDiagnostics: DeviceSelfCheck = {
  app_version: APP_VERSION,
  format_version: "1.0.0",
  runtime: runtimeFor("macos"),
  keyboard_devices: previewPlanBase.keyboard_compatibility.devices,
  keyboard_conflict: previewPlanBase.keyboard_compatibility.conflict,
  snapshot: { available: false, version: null, created_at: null, error: null },
  recent_modules: [],
  privacy_note: "浏览器演示数据；真实应用只在本机生成，不含用户名、路径、序列号或密码",
};

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}

function previewPlanForState(): ImportPlan {
  const hasWindowsSelection = Boolean(state.scan || state.receipt);
  const selected = hasWindowsSelection ? new Set<string>() : new Set(previewPlanBase.selected_module_ids);
  if (hasWindowsSelection) {
    if (state.selection.include_keyboard) ["finder_extensions", "keyboard_repeat", "keyboard_compatibility"].forEach((id) => selected.add(id));
    if (state.selection.include_pointer) selected.add("pointer_scroll");
    state.selection.software_ids.forEach((id) => selected.add(`software.${id}`));
  }
  const wifiSelected = state.preview.wifiPasswordSelected;
  const wifi = { ...previewPlanBase.wifi!, credential_status: wifiSelected ? "available" as const : "not_selected" as const, contains_secrets: wifiSelected, note: wifiSelected ? "已主动选择密码；迁移包第一版不加密，Mac 导入成功后应删除副本。" : "当前只带网络名；密码需要再次明确选择。" };
  if (wifiSelected) selected.add("wifi.personal");
  return { ...previewPlanBase, guide_requested: hasWindowsSelection ? state.selection.guide_requested : true, wifi, contains_secrets: wifiSelected, selected_module_ids: [...selected] };
}

function invokeOrPreview<K extends NativeCommand>(command: K, args?: NativeCommandArgs[K]): Promise<NativeCommandResult[K]> {
  if (isTauri) return invokeNative(command, args);
  if (command === "runtime_info") return Promise.resolve(previewRuntime as NativeCommandResult[K]);
  if (command === "scan_windows") return Promise.resolve(previewScan as NativeCommandResult[K]);
  if (command === "import_habitpack") {
    if (state.preview.scenario === "corrupt-package") return Promise.reject(new Error("HP_ZIP_LAYOUT"));
    return Promise.resolve(previewPlanForState() as NativeCommandResult[K]);
  }
  if (command === "confirm_plan") {
    const confirmation = (args as NativeCommandArgs["confirm_plan"] | undefined)?.confirmation;
    return Promise.resolve({ ...previewPlanForState(), selected_module_ids: confirmation?.selected_module_ids ?? previewPlanForState().selected_module_ids } as NativeCommandResult[K]);
  }
  if (command === "export_habitpack") {
    const plan = previewPlanForState();
    return Promise.resolve({ path: "浏览器预览，不会写入文件", package_bytes: 0, modules: plan.selected_module_ids, contains_secrets: plan.contains_secrets, validated: true } as NativeCommandResult[K]);
  }
  if (command === "apply_plan") return Promise.resolve(previewOutcome() as NativeCommandResult[K]);
  if (command === "rollback_module") return Promise.resolve(previewRollback((args as NativeCommandArgs["rollback_module"] | undefined)?.moduleId ?? "") as NativeCommandResult[K]);
  if (command === "rollback_all") return Promise.resolve(previewRollback("all") as NativeCommandResult[K]);
  if (command === "device_self_check") return Promise.resolve(previewDiagnostics as NativeCommandResult[K]);
  if (command === "export_report") return Promise.resolve({ path: "浏览器预览，不会写入文件", format: (args as NativeCommandArgs["export_report"] | undefined)?.format ?? "html", bytes: 0 } as NativeCommandResult[K]);
  return Promise.reject(new Error("浏览器预览不支持此操作"));
}

function previewOutcome(): MigrationOutcome {
  const plan = state.plan ?? previewPlanForState();
  const selected = new Set(plan.selected_module_ids);
  const results: ModuleResult[] = [];
  const add = (result: ModuleResult) => { if (selected.has(result.module_id)) results.push(result); };
  const permissionDenied = state.preview.scenario === "permission-denied";
  const moduleFailed = state.preview.scenario === "module-failed";
  const thirdPartyDeclined = state.preview.scenario === "third-party-declined" || !state.preview.linearMouseConfirmed;
  add({ module_id: "finder_extensions", title: "显示文件扩展名", before: "隐藏", after: moduleFailed ? "未改变" : "显示", reason: "让文件类型一眼可见。", benefit: "减少打开错误文件的机会。", recovery: "可恢复到迁移前值", status: moduleFailed ? "failed_recoverable" : "applied_verified", error_code: moduleFailed ? "FINDER_VERIFY" : null });
  add({ module_id: "keyboard_repeat", title: "键盘重复速度", before: "Mac 当前值", after: permissionDenied ? "未改变" : "已匹配 Windows 节奏", reason: "保留你熟悉的按键响应节奏。", benefit: "删除和移动文字时手感更接近原来。", recovery: "可恢复到迁移前值", status: permissionDenied ? "skipped_permission" : "applied_verified", error_code: permissionDenied ? "ACCESSIBILITY_DENIED" : null });
  add({ module_id: "keyboard_compatibility", title: "内置键盘 Control ↔ Command", before: "原生映射", after: permissionDenied ? "未改变" : "内置键盘物理 Control ↔ Command", reason: "让 MacBook 内置键盘更接近 Windows 的键位肌肉记忆。", benefit: "外接键盘保持不变，Option 与 Fn 不重映射。", recovery: "按快照精确恢复原有映射", status: permissionDenied ? "skipped_permission" : "applied_verified", error_code: permissionDenied ? "ACCESSIBILITY_DENIED" : null });
  const pointerManual = state.preview.scenario === "offline" ? "当前离线；稍后可重试" : thirdPartyDeclined ? "未确认 LinearMouse；请按官方入口完成" : "需要按官方工具界面完成并回到 MacWin 复核";
  add({ module_id: "pointer_scroll", title: "鼠标与触控板滚动方向", before: "Mac 当前值", after: pointerManual, reason: "两个设备的方向分别处理。", benefit: "鼠标方向可保留，触控板仍单独验证。", recovery: "恢复迁移前值", status: "manual_action_required", error_code: null });
  if (selected.has("wifi.personal")) {
    const denied = state.preview.scenario === "uac-denied";
    results.push({ module_id: "wifi.personal", title: "Home Wi‑Fi", before: "未读取密码", after: denied ? "只保留网络名" : "等待在 Mac 系统网络中写入", reason: denied ? "UAC 被拒绝，未读取密码。" : "只处理用户主动选择的个人网络。", benefit: "网络名可以继续带到 Mac，密码不会出现在报告或快照。", recovery: "只恢复网络记录，不保存密码", status: denied ? "skipped_permission" : "manual_action_required", error_code: denied ? "UAC_DENIED" : null });
  }
  plan.software.filter((item) => item.installed).forEach((item) => {
    const moduleId = `software.${item.id}`;
    if (!selected.has(moduleId)) return;
    const offline = state.preview.scenario === "offline";
    results.push({ module_id: moduleId, title: item.name, before: "未读取", after: offline ? "离线，稍后从官方入口完成" : "等待从官方入口手动安装", reason: offline ? "当前无法连接官方入口。" : "当前版本不会静默下载或绕过 Gatekeeper。", benefit: "来源清楚，账号、项目和浏览器数据不会搬运。", recovery: "无需恢复", status: "manual_action_required", error_code: null });
  });
  const failureCount = results.filter((result) => ["failed_recoverable", "unknown_requires_review"].includes(result.status)).length;
  const pendingCount = results.filter((result) => ["manual_action_required", "skipped_permission", "skipped"].includes(result.status)).length;
  return { outcome: failureCount ? "partial" : pendingCount ? "partial" : "completed", completed_at: "2026-08-02T10:01:00Z", snapshot_available: true, results, guide_sections: guideSections(results.some((result) => result.module_id === "keyboard_compatibility")) };
}

function previewRollback(moduleId: string): MigrationOutcome {
  const outcome = state.outcome ?? previewOutcome();
  const shouldRestore = (id: string) => moduleId === "all" || id === moduleId;
  outcome.outcome = "restored";
  outcome.results = outcome.results.map((result) => shouldRestore(result.module_id) && ["applied_verified", "failed_recoverable"].includes(result.status) ? { ...result, after: result.before, status: "rolled_back_verified" as const } : result);
  return outcome;
}

function guideSections(keyboard: boolean): GuideSection[] {
  const sections: GuideSection[] = [
    { title: "Command、Option 和 Fn", body: "Command 是 Mac 常用的编辑修饰键；Option 常表示替代操作或特殊字符；Fn 用于功能键和系统功能。MacWin 不会全局交换它们。" },
    { title: "鼠标与触控板", body: "鼠标和触控板是两个设置。计划和结果会分别说明；如果第三方工具没有授权，只需按官方入口完成后再回到 MacWin。" },
    { title: "Windows 仍然更合适的地方", body: "某些企业系统、专用 Windows 软件、游戏和特殊外设仍可能更适合留在 Windows；这不是一次迁移就能解决的差异。" },
  ];
  if (keyboard) sections.unshift({ title: "内置键盘 Control ↔ Command", body: "MacBook 内置键盘的物理 Control 与 Command 已互换；外接键盘保持原样，Option 与 Fn 不重映射。" });
  return sections;
}

function setBusy(busy: boolean, error: string | null = null): void { state = { ...state, busy, error }; render(); }
function updateView(view: View): void { state = setView(state, view); render(); }
function goHome(): void { state = { ...state, view: "home", busy: false, error: null }; void loadRuntime(); }

function renderPlatformIcon(kind: "windows" | "macos" | "unsupported"): string {
  if (kind === "macos") return `<span class="platform-emblem apple" aria-hidden="true"></span>`;
  if (kind === "windows") return `<span class="platform-emblem windows" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M1 2h10v9H1zM13 2h10v9H13zM1 13h10v9H1zM13 13h10v9H13z"/></svg></span>`;
  return `<span class="platform-emblem neutral" aria-hidden="true">•</span>`;
}

function renderModuleGlyph(kind: "habit" | "software" | "system" | "wifi" | "file"): string {
  const paths: Record<typeof kind, string> = {
    habit: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M6 9h2m2 0h2m2 0h2m2 0H18M6 12h2m2 0h2m2 0h2m2 0H18M6 15h12"/>',
    software: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',
    system: '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.2-1.7l2-1.2-2-3.4-2.1 1.2a7 7 0 0 0-2.9-1.7V2.8h-4v2.4a7 7 0 0 0-2.9 1.7L4.8 5.7l-2 3.4 2 1.2A7 7 0 0 0 4.6 12c0 .6.1 1.2.2 1.7l-2 1.2 2 3.4 2.1-1.2a7 7 0 0 0 2.9 1.7v2.4h4v-2.4a7 7 0 0 0 2.9-1.7l2.1 1.2 2-3.4-2-1.2c.1-.5.2-1.1.2-1.7Z"/>',
    wifi: '<path d="M3 9a14 14 0 0 1 18 0M6 13a9.5 9.5 0 0 1 12 0M9.5 17a4.5 4.5 0 0 1 5 0"/><circle cx="12" cy="20" r="1" fill="currentColor" stroke="none"/>',
    file: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v5h4M10 13h5M10 17h5"/>',
  };
  return `<svg class="module-glyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths[kind]}</svg>`;
}

function renderWindowTitlebar(kind: "windows" | "macos" | "unsupported"): string {
  const mac = kind === "macos";
  return `<header class="reference-titlebar ${mac ? "reference-titlebar-mac" : "reference-titlebar-windows"}">
    <button class="reference-brand" data-action="home" aria-label="回到首页"><span class="brand-mark">MW</span><strong>MacWin</strong></button>
    <div class="reference-titlebar-actions"><button class="titlebar-action" data-action="diagnostics" aria-label="设备自检">▧</button><button class="titlebar-action" data-action="check-update" aria-label="检查更新">⚙</button></div>
  </header>`;
}

function renderReferenceRail(type: "windows" | "mac", active: number): string {
  const labels = type === "windows" ? ["检测", "选择", "导出"] : ["Windows 检测", "确认计划", "Mac 完成"];
  return `<aside class="reference-rail" aria-label="${type === "windows" ? "Windows 流程" : "Mac 迁移流程"}"><div class="reference-rail-brand">${type === "windows" ? renderPlatformIcon("windows") : renderPlatformIcon("macos")}<span>${type === "windows" ? "Windows → Mac" : "迁移地图"}</span></div><div class="reference-rail-steps">${labels.map((label, index) => {
    const step = index + 1;
    const stateClass = active > step ? "completed" : active === step ? "current" : "pending";
    return `<div class="reference-rail-step ${stateClass}"><span class="reference-rail-node">${active > step ? "✓" : step}</span><div><strong>${label}</strong><small>${stateClass === "completed" ? "已完成" : stateClass === "current" ? (type === "windows" ? "当前步骤" : "当前计划") : "待开始"}</small></div></div>`;
  }).join("")}</div><p class="reference-rail-note">确认前不修改系统。每个模块独立验证，拒绝权限只影响相关动作。</p></aside>`;
}

function renderTicketSlot(kind: "habit" | "software" | "system" | "wifi", title: string, active: boolean, detail: string): string {
  const tone = kind === "habit" ? "blue" : kind === "software" ? "yellow" : kind === "system" ? "mint" : "aqua";
  return `<div class="ticket-slot tone-${tone} ${active ? "is-selected" : "is-empty"}"><span class="ticket-slot-icon">${renderModuleGlyph(kind)}</span><strong>${title}</strong><small>${active ? "已选择" : detail}</small></div>`;
}

function renderHabitTicket(orientation: "horizontal" | "vertical", variant: "home" | "selection" | "export" | "empty"): string {
  const isHome = variant === "home";
  const isExport = variant === "export";
  const habits = isHome || state.selection.include_keyboard || state.selection.include_pointer || Boolean(state.plan?.selected_module_ids.some((id) => ["keyboard_compatibility", "pointer_scroll"].includes(id)));
  const software = isHome || isExport || Boolean(state.plan?.selected_module_ids.some((id) => id.startsWith("software."))) || Boolean(state.scan?.software.some((item) => item.installed));
  const system = isHome || state.selection.guide_requested || Boolean(state.plan?.guide_requested);
  const wifi = isHome || state.preview.wifiPasswordSelected || Boolean(state.plan?.selected_module_ids.includes("wifi.personal"));
  const vertical = orientation === "vertical";
  return `<article class="habit-ticket ${vertical ? "habit-ticket-vertical" : "habit-ticket-horizontal"} ${variant === "empty" ? "ticket-empty" : ""}">
    <div class="ticket-strap" aria-hidden="true"><span class="ticket-ring"></span></div>
    <div class="ticket-paper"><div class="ticket-paper-inner">
      <div class="ticket-masthead"><span>MACWIN / HABIT PASS</span><span>${escapeHtml(APP_VERSION)}</span></div>
      <div class="ticket-heading"><strong>.habitpack</strong><span class="ticket-stamp">MACWIN<br/>HABIT PASS</span></div>
      <div class="ticket-rule"></div>
      ${vertical ? `<div class="ticket-file-placeholder">${renderModuleGlyph("file")}<span>MacWin 迁移包</span></div><div class="ticket-safe-line">${renderModuleGlyph("system")}<span>受保护的迁移数据</span></div>` : `<div class="ticket-modules">${renderTicketSlot("habit", "操作习惯", habits, "未选择")}${renderTicketSlot("software", "软件与开发", software, "空位")}${renderTicketSlot("system", "系统设置", system, "未选择")}${renderTicketSlot("wifi", "Wi‑Fi", wifi, "未选择")}</div><div class="ticket-route"><span>Windows</span><i>→</i><span>Mac</span></div>`}
      <div class="ticket-foot"><span>${isExport ? "由 MacWin 验证" : "由你选择"}</span><span>${state.preview.wifiPasswordSelected || state.plan?.contains_secrets ? "含敏感信息" : "不搬个人文件"}</span></div>
    </div></div>
    <div class="ticket-barcode" aria-hidden="true">${Array.from({ length: 22 }, (_, index) => `<span style="--bar:${(index % 4) + 1}"></span>`).join("")}</div>
  </article>`;
}

function renderJourney(side: "windows" | "mac" | "home", step: number, type: "windows" | "mac"): string {
  const labels = type === "windows" ? ["检测", "选择", "导出"] : ["导入", "确认", "执行", "完成"];
  const platformKind = type === "windows" ? "windows" : "macos";
  return `<nav class="journey" aria-label="${type === "windows" ? "Windows 流程" : "Mac 流程"}"><div class="journey-steps">${labels.map((label, index) => {
    const active = side === type && step >= index + 1;
    return `<span class="journey-step ${active ? "active" : ""} ${side === type && step === index + 1 ? "current" : ""}"><span class="journey-node">${index + 1}</span><span>${label}</span></span>${index < labels.length - 1 ? `<span class="journey-connector ${active && step > index + 1 ? "active" : ""}"></span>` : ""}`;
  }).join("")}</div><span class="journey-endpoint">${renderPlatformIcon(platformKind)}<span>${side === "windows" ? "Windows" : side === "mac" ? "Mac" : "入口"}</span></span></nav>`;
}

function renderMapRail(active: number): string {
  const steps = ["导入并检查", "确认计划", "执行与验证", "结果与恢复"];
  return `<aside class="map-rail" aria-label="Mac 迁移地图"><div class="map-rail-label">C / 迁移地图</div>${steps.map((step, index) => `<div class="map-stop ${active >= index + 1 ? "active" : ""} ${active === index + 1 ? "current" : ""}"><span class="map-dot">${active > index + 1 ? "✓" : index + 1}</span><span>${step}</span></div>`).join("")}<p class="map-rail-note">计划确认前不修改系统。每个模块独立验证，拒绝权限只影响依赖它的动作。</p></aside>`;
}

function renderErrorPanel(): string {
  return state.error ? `<div class="error-panel" role="alert"><span class="status-glyph bad">!</span><div><strong>没有完成这一步</strong><p>${escapeHtml(friendlyError(state.error))}</p></div><button class="icon-button" data-action="clear-error" aria-label="关闭错误提示">×</button></div>` : "";
}

function renderPreviewToolbar(): string {
  if (!previewToolbarEnabled) return "";
  const scenarios: Array<[PreviewScenario, string]> = [["normal", "正常"], ["uac-denied", "UAC 拒绝"], ["permission-denied", "Mac 权限拒绝"], ["offline", "离线"], ["third-party-declined", "第三方拒绝"], ["module-failed", "单模块失败"], ["corrupt-package", "损坏迁移包"]];
  return `<div class="preview-toolbar" aria-label="浏览器预览控制"><span class="preview-label">预览</span><button class="preview-platform ${previewPlatform === "windows" ? "selected" : ""}" data-preview-platform="windows">Windows</button><button class="preview-platform ${previewPlatform === "macos" ? "selected" : ""}" data-preview-platform="macos">Mac</button><label>情境<select data-preview-scenario>${scenarios.map((option) => { const value = option[0]; const label = option[1]; return `<option value="${value}" ${state.preview.scenario === value ? "selected" : ""}>${label}</option>`; }).join("")}</select></label><span class="preview-note">虚构数据 · 不修改系统</span></div>`;
}

function renderShell(content: string, eyebrow: string, title: string, description = "", journey: string = ""): string {
  const platformKind = state.runtime?.platform === "windows" ? "windows" : state.runtime?.platform === "macos" ? "macos" : "unsupported";
  return `<div class="app-shell reference-shell ${platformKind}">${renderWindowTitlebar(platformKind)}<main class="main-content reference-main"><div class="content-column">${journey}${renderErrorPanel()}${eyebrow ? `<div class="eyebrow platform-eyebrow">${renderPlatformIcon(platformKind)}<span>${escapeHtml(eyebrow)}</span></div>` : ""}${title ? `<h1>${escapeHtml(title)}</h1>` : ""}${description ? `<p class="lead">${escapeHtml(description)}</p>` : ""}${content}</div></main>${renderPreviewToolbar()}</div>`;
}

function renderMigrationHome(): string {
  if (!state.outcome || state.runtime?.platform !== "macos") return "";
  const pending = state.outcome.results.filter((result) => !["applied_verified", "rolled_back_verified"].includes(result.status)).length;
  return `<section class="migration-home"><div class="section-title"><span class="section-index mint">M</span><div><h2>迁移主页</h2><p>最近一次结果已保存在本机。${pending ? `${pending} 个项目仍需处理。` : "没有待处理项目。"}</p></div></div><div class="home-links"><button class="home-link" data-action="report"><span>报告</span><strong>查看变更报告</strong><small>状态、原因、验证与恢复方式</small></button><button class="home-link" data-action="guide"><span>指南</span><strong>打开我的 Mac 指南</strong><small>只显示这次迁移真正相关的内容</small></button><button class="home-link" data-action="restore"><span>恢复</span><strong>恢复迁移前状态</strong><small>按模块恢复，或全部恢复</small></button></div></section>`;
}

function renderHome(): string {
  if (!state.runtime) {
    return renderShell(`<section class="activity-panel"><div class="activity-icon mint">⌁</div><h2>正在读取当前平台</h2><p>MacWin 会先确认系统和架构，再显示可用入口。</p></section>`, "设备检查", "", "", "");
  }
  if (state.runtime?.platform === "windows") {
    return renderShell(`<section class="reference-page windows-detect-page"><div class="windows-detect-copy"><div class="reference-kicker">W1 / WINDOWS 来源端</div><div class="windows-heading"><span class="windows-heading-mark">${renderPlatformIcon("windows")}</span><div><h1>检测这台 Windows</h1><p>查看可以迁移的习惯与环境</p></div></div><div class="reference-scan-list"><div class="reference-scan-row"><span class="scan-row-icon tone-blue">${renderModuleGlyph("habit")}</span><span><strong>操作习惯</strong><small>键盘、鼠标与触控板</small></span><span class="scan-row-check">□</span></div><div class="reference-scan-row"><span class="scan-row-icon tone-yellow">${renderModuleGlyph("software")}</span><span><strong>软件与开发</strong><small>浏览器、办公与轻量开发工具</small></span><span class="scan-row-check">□</span></div><div class="reference-scan-row"><span class="scan-row-icon tone-mint">${renderModuleGlyph("system")}</span><span><strong>系统设置</strong><small>可恢复的显示与输入偏好</small></span><span class="scan-row-check">□</span></div><div class="reference-scan-row"><span class="scan-row-icon tone-aqua">${renderModuleGlyph("wifi")}</span><span><strong>Wi‑Fi</strong><small>只处理用户逐项选择的个人网络</small></span><span class="scan-row-check">□</span></div></div></div><aside class="windows-detect-ticket">${renderHabitTicket("vertical", "empty")}</aside><div class="reference-bottom-bar windows-bottom-bar"><span class="bottom-bar-note">扫描前不会读取浏览器历史、密码、Cookie、账号或登录状态。</span><button class="reference-primary blue-action" data-action="start-scan"><span>${renderModuleGlyph("file")}</span><b>开始检测</b><i>→</i></button></div></section>`, "", "", "", "");
  }
  if (state.runtime.platform !== "macos") {
    return renderShell(`<section class="activity-panel"><div class="activity-icon coral">!</div><h2>当前设备不受支持</h2><p>${escapeHtml(state.runtime.support_message)}。MacWin 不会修改系统。</p><div class="notice-line"><span class="status-glyph warning">i</span><span>正式范围：Windows 10/11 x64 来源端，或 Apple 芯片 macOS 15/26 目标端。</span></div></section>`, "设备检查", "", "", "");
  }
  const migrationHome = renderMigrationHome();
  const previewSafety = state.webPreview
    ? '<span><i class="safety-mark yellow">✓</i>浏览器演示数据，不会修改系统</span>'
    : '<span><i class="safety-mark yellow">✓</i>确认计划前不会修改系统</span>';
  return renderShell(`<section class="reference-page mac-cover-page"><div class="mac-cover-copy"><div class="reference-kicker">B / MAC 目标端</div><div class="mac-brand-lockup"><span class="brand-mark">MW</span><strong>MacWin</strong></div><h1>把 Windows<br/>习惯装进一张<span>通行证</span></h1><p>旧电脑打包，新 Mac 接住。</p><div class="reference-safety-list"><span><i class="safety-mark mint">✓</i>只迁移习惯与环境，不搬个人文件</span>${previewSafety}</div><div class="mac-cover-foot"><span class="tiny-play">▷</span><span>应用前先看计划</span></div></div><div class="mac-cover-ticket"><div class="ticket-stage">${renderHabitTicket("horizontal", "home")}</div><div class="ticket-route"><span class="route-origin">Windows</span><i>→</i><span class="route-target">Mac</span></div><button class="reference-primary blue-action mac-import-button" data-action="import"><span>${renderModuleGlyph("file")}</span><b>导入这张迁移通行证</b><i>↓</i></button></div></section>${migrationHome}`, "", "", "", "");
}

function renderScanning(): string {
  return renderShell(`<section class="activity-panel"><div class="activity-icon blue">⌁</div><h2>正在读取白名单设置</h2><p>只读取系统版本、输入设置和已知软件。不会访问个人文件。</p><div class="activity-list"><div class="activity-row done"><span>✓</span><strong>平台兼容性</strong><small>Windows 10/11 x64</small></div><div class="activity-row active"><span>•</span><strong>输入设置</strong><small>当前阶段</small></div><div class="activity-row"><span>○</span><strong>软件与开发</strong><small>等待读取</small></div></div></section>`, "Windows 端 · 检测", "正在检测", "完成后只展示你能选择的变化。", renderJourney("windows", 1, "windows"));
}

function renderScan(): string {
  const scan = state.scan;
  if (!scan) return renderHome();
  const wifi = scan.wifi?.[0];
  const habitsChecked = state.selection.include_keyboard || state.selection.include_pointer;
  const wifiChoice = state.webPreview
    ? `<label class="reference-option-row wifi-option-row"><input type="checkbox" data-wifi-password ${state.preview.wifiPasswordSelected ? "checked" : ""}/><span class="option-row-icon tone-aqua">${renderModuleGlyph("wifi")}</span><span class="option-row-copy"><strong>Wi‑Fi</strong><small>${wifi ? `${escapeHtml(wifi.name)} · ${escapeHtml(wifi.security)}` : "未发现可处理的个人网络"}<em>密码需单独确认；迁移包第一版不加密</em></small></span><span class="option-row-state">${state.preview.wifiPasswordSelected ? "已选择" : "未选择"}<b>›</b></span></label>`
    : `<div class="reference-option-row option-static wifi-option-row"><span class="option-row-icon tone-aqua">${renderModuleGlyph("wifi")}</span><span class="option-row-copy"><strong>Wi‑Fi</strong><small>${wifi ? `${escapeHtml(wifi.name)} · ${escapeHtml(wifi.security)}` : "当前版本不会读取或导出 Wi‑Fi 密码"}<em>密码迁移尚未启用；不会写入迁移包</em></small></span><span class="option-row-state">当前未启用<b>›</b></span></div>`;
  const wifiSafety = state.webPreview ? "含密码时需要管理员权限；不会迁移个人文件、账号或浏览器资料。" : "当前版本不读取 Wi‑Fi 密码；不会把它写入迁移包。";
  return renderShell(`<section class="reference-page windows-select-page"><div class="windows-select-grid"><section class="windows-select-copy"><div class="reference-kicker">W2 / WINDOWS 选择</div><h1>选择要带走的内容</h1><p class="reference-subtitle">只勾选你想在 Mac 上继续使用的习惯与环境。</p><div class="reference-option-list"><label class="reference-option-row"><input type="checkbox" data-habits-toggle ${habitsChecked ? "checked" : ""}/><span class="option-row-icon tone-blue">${renderModuleGlyph("habit")}</span><span class="option-row-copy"><strong>操作习惯</strong><small>键盘、鼠标与触控板；普通应用保留熟悉的 Ctrl 操作。</small></span><span class="option-row-state">${habitsChecked ? "已选择" : "未选择"}<b>›</b></span></label><div class="reference-option-row option-static"><span class="option-row-icon tone-yellow">${renderModuleGlyph("software")}</span><span class="option-row-copy"><strong>软件与开发</strong><small>浏览器、办公与轻量开发工具，Mac 端计划中确认。</small></span><span class="option-row-state">Mac 端确认<b>›</b></span></div><label class="reference-option-row"><input type="checkbox" data-guide ${state.selection.guide_requested ? "checked" : ""}/><span class="option-row-icon tone-mint">${renderModuleGlyph("system")}</span><span class="option-row-copy"><strong>系统设置</strong><small>显示、输入与恢复方式；生成与你的选择相符的指南。</small></span><span class="option-row-state">${state.selection.guide_requested ? "已选择" : "未选择"}<b>›</b></span></label>${wifiChoice}</div><div class="select-safety-line"><span>⌁</span><span>${wifiSafety}</span></div></section><aside class="windows-select-ticket"><div class="ticket-stage selection-ticket-stage">${renderHabitTicket("horizontal", "selection")}</div><div class="ticket-selection-meta"><span>✦</span><strong>票面会随选择即时更新</strong><small>系统设置当前未选；软件将在 Mac 计划中确认。</small></div></aside></div><div class="reference-bottom-bar"><span class="bottom-bar-note">文件只在本机生成，你决定保存在哪里。</span><button class="secondary-button" data-action="home">返回</button><button class="reference-primary blue-action" data-action="export-review"><span>${renderModuleGlyph("file")}</span><b>生成迁移包</b><i>↓</i></button></div></section>`, "", "", "", "");
}

function renderExportReview(): string {
  const previewPlan = state.webPreview ? previewPlanForState() : null;
  const summary = previewPlan
    ? {
        selectedCount: previewPlan.selected_module_ids.length,
        containsSecrets: previewPlan.contains_secrets,
        habitsSelected: previewPlan.selected_module_ids.some((moduleId) => ["finder_extensions", "keyboard_repeat", "keyboard_compatibility", "pointer_scroll"].includes(moduleId)),
        softwareSelected: previewPlan.selected_module_ids.some((moduleId) => moduleId.startsWith("software.")),
        rows: [
          { title: "操作习惯", tone: "blue", kind: "habit", status: "" },
          { title: "软件与开发", tone: "yellow", kind: "software", status: "" },
          { title: "系统设置", tone: "mint", kind: "system", status: previewPlan.guide_requested ? "已包含" : "未选择" },
          { title: "Wi‑Fi", tone: "aqua", kind: "wifi", status: previewPlan.contains_secrets ? "含敏感信息" : previewPlan.selected_module_ids.includes("wifi.personal") ? "仅网络名" : "未选择" },
        ],
      }
    : state.scan
      ? exportSummaryFromSelection(state.scan, state.selection)
      : { selectedCount: 0, containsSecrets: false, rows: [] };
  const rows = summary.rows.map((row) => {
    const status = row.title === "操作习惯" && "habitsSelected" in summary ? (summary.habitsSelected ? "已包含" : "未选择") : row.title === "软件与开发" && "softwareSelected" in summary ? (summary.softwareSelected ? "已记录 · Mac 端确认" : "Mac 端确认") : row.status;
    return `<div class="export-summary-row"><span class="option-row-icon tone-${row.tone}">${renderModuleGlyph(row.kind as "habit" | "software" | "system" | "wifi")}</span><strong>${row.title}</strong><small>${status}</small></div>`;
  }).join("");
  return renderShell(`<section class="reference-page windows-export-page"><div class="windows-export-grid"><div class="windows-export-rail">${renderReferenceRail("windows", 3)}<div class="rail-security">✓ <span>迁移安全保护中</span></div></div><div class="windows-export-ticket"><div class="reference-kicker">W3 / EXPORT</div>${renderHabitTicket("vertical", "export")}</div><section class="windows-export-summary"><div class="reference-kicker">导出前复核</div><h1>确认迁移包内容 <span class="summary-check">✓</span></h1><p>选择已经整理好；点击导出后才会写入你指定的位置，并再次验证结构和引用。</p><div class="export-summary-list">${rows}</div><div class="export-summary-rule"></div><div class="export-summary-meta"><span>包含 ${summary.selectedCount} 项规则</span><span class="${summary.containsSecrets ? "accent-danger" : ""}">${summary.containsSecrets ? "含 Wi‑Fi 密码" : "不含密码"}</span></div><button class="reference-primary blue-action export-submit" data-action="export"><span>${renderModuleGlyph("file")}</span><b>导出迁移包</b><i>↓</i></button><div class="export-small-notes"><span>⌑　迁移包只保存在你选择的位置</span>${summary.containsSecrets ? "<span>▣　含 Wi‑Fi 密码时请勿公开分享</span>" : "<span>▣　不含密码；核心迁移可离线完成</span>"}</div></section></div></section>`, "", "", "", "");
}

function renderExported(): string {
  const receipt = state.receipt;
  const nextAction = state.webPreview
    ? `<button class="primary-cta coral" data-action="handoff"><span><b>交给 Mac 预览</b><small>继续打开导入入口</small></span><i>→</i></button>`
    : `<span class="bottom-bar-note">请在 MacWin 的 Mac 端打开“导入迁移包”，再选择这个文件。</span>`;
  return renderShell(`<section class="handoff-panel"><div class="handoff-status"><span class="status-glyph good">✓</span><div><span class="home-marker">W3 / 已验证</span><h2>迁移包已准备好</h2><p>${escapeHtml(receipt?.path ?? "浏览器预览，不会写入文件")}</p></div></div><div class="handoff-route"><div class="handoff-stop blue"><span>W</span><strong>Windows</strong><small>生成并验证</small></div><div class="handoff-line"></div><div class="handoff-stop coral"><span>M</span><strong>Mac</strong><small>导入后先看计划</small></div></div><div class="handoff-copy"><strong>下一步</strong><p>用 U 盘或你信任的本地方式把文件带到 Mac。MacWin 不会替你上传。</p>${receipt?.contains_secrets ? `<p class="accent-danger">此包包含 Wi‑Fi 密码；导入成功后删除不再需要的副本。</p>` : ""}</div><div class="action-row"><button class="secondary-button" data-action="home">回到首页</button>${nextAction}</div></section>`, "Windows 端 · 导出", "准备交给 Mac", "生成和验证都完成了。", renderJourney("windows", 3, "windows"));
}

let expandedPlanGroups = new Set<string>();
let activeDetailModuleId: string | null = null;

function groupSelectedState(plan: ImportPlan, group: "habits" | "software"): { selected: number; total: number; checked: boolean } {
  const ids = planGroupModuleIds(plan, group);
  const selected = ids.filter((moduleId) => plan.selected_module_ids.includes(moduleId)).length;
  return { selected, total: ids.length, checked: ids.length > 0 && selected === ids.length };
}

function renderPlanChoice(moduleId: string, title: string, subtitle: string, checked: boolean, inputAttributes: string): string {
  const moduleAttribute = inputAttributes.includes("data-software-plan") ? "" : `data-module="${escapeHtml(moduleId)}"`;
  return `<div class="plan-choice-row"><input type="checkbox" aria-label="选择 ${escapeHtml(title)}" ${moduleAttribute} ${inputAttributes} ${checked ? "checked" : ""}/><button class="plan-choice-name" type="button" data-detail-id="${escapeHtml(moduleId)}"><strong>${escapeHtml(title)}</strong><small>${escapeHtml(subtitle)}</small></button></div>`;
}

function renderPlanGroup(plan: ImportPlan, group: "habits" | "software", title: string, subtitle: string, children: string): string {
  const stateForGroup = groupSelectedState(plan, group);
  const expanded = expandedPlanGroups.has(group);
  const icon = group === "habits" ? "habit" : "software";
  const risks = group === "habits" ? `${plan.contains_secrets ? '<span class="plan-flag sensitive">含敏感信息</span>' : ""}<span class="plan-flag permission">需按系统授权</span>` : `<span class="plan-flag manual">官方入口</span><span class="plan-flag manual">不可自动恢复</span>`;
  return `<section class="plan-group reference-plan-group ${expanded ? "expanded" : ""}"><div class="plan-group-row"><label class="plan-group-choice"><input type="checkbox" data-group-toggle="${group}" ${stateForGroup.checked ? "checked" : ""}/><span class="plan-group-icon tone-${icon === "habit" ? "blue" : "yellow"}">${renderModuleGlyph(icon as "habit" | "software")}</span><span class="plan-group-label"><strong>${title}</strong><small>${subtitle}</small></span></label><div class="plan-group-flags">${risks}</div><button class="group-toggle" type="button" data-group-expand="${group}" aria-expanded="${expanded ? "true" : "false"}">${expanded ? "收起" : "查看项目"}<span aria-hidden="true">${expanded ? "−" : "+"}</span></button></div><div class="plan-group-items" data-group-items="${group}" ${expanded ? "" : "hidden"}>${children}</div></section>`;
}

function renderDetailModal(plan: ImportPlan): string {
  if (!activeDetailModuleId) return "";
  const moduleId = activeDetailModuleId;
  const item = plan.items.find((candidate) => candidate.module_id === moduleId);
  const software = plan.software.find((candidate) => `software.${candidate.id}` === moduleId);
  let title = "这项设置";
  let subtitle = "";
  let body = "";
  let result = "";
  let recovery = "";
  let extra = "";
  if (item && !["pointer_scroll", "keyboard_compatibility"].includes(moduleId)) {
    title = item.title;
    subtitle = item.current_value;
    body = item.reason;
    result = `${item.target_value}。${item.benefit}`;
    recovery = item.recovery;
  } else if (software) {
    title = software.name;
    subtitle = "软件与开发";
    body = "MacWin 只记录你选择的软件，不搬运账号、许可证、项目文件、浏览器数据或登录状态。";
    result = "之后可以从软件自己的入口完成安装；MacWin 不会静默安装。";
    recovery = "软件没有被 MacWin 修改，不需要恢复。";
  } else if (moduleId === "wifi.personal" && plan.wifi) {
    title = plan.wifi.name;
    subtitle = "个人 Wi‑Fi";
    body = "带上这条网络记录，方便你在 Mac 上继续使用。";
    result = plan.wifi.contains_secrets ? "你主动选择的密码会随迁移包带走，但不会写进报告或迁移前快照。" : "当前只带网络名，密码仍由你单独决定。";
    recovery = "只恢复本次迁移记录，不影响其他网络。";
  } else if (moduleId === "pointer_scroll") {
    title = "鼠标与触控板滚动方向";
    subtitle = "系统与习惯";
    body = "鼠标和触控板分别处理，不会把一个设备的方向强行套到另一个设备上。";
    const support = plan.pointer_support;
    const previewConfirmed = state.webPreview && state.preview.linearMouseConfirmed;
    result = previewConfirmed
      ? "已确认从官方入口完成辅助功能授权，执行后回到 MacWin 验证。"
      : support.native_independent
        ? "当前 Mac 支持原生独立方向；执行后会分别读取鼠标与触控板结果。"
        : support.linear_mouse_installed
          ? `已检测到 LinearMouse${support.linear_mouse_version ? ` ${support.linear_mouse_version}` : ""}；仍需按官方界面授权并回到 MacWin 复核。`
          : "未检测到可用的独立方向工具；请按官方入口完成 LinearMouse 和辅助功能授权。"
    recovery = "恢复迁移前的滚动方向记录。";
    extra = state.webPreview
      ? `<label class="detail-consent"><input type="checkbox" data-linear-mouse ${state.preview.linearMouseConfirmed ? "checked" : ""}/><span><strong>我已阅读用途和权限</strong><small>${state.preview.linearMouseConfirmed ? "已确认" : "未确认时，指针方向会保留为手动完成"}</small></span></label><a class="detail-link" href="${escapeHtml(support.official_url)}" target="_blank" rel="noreferrer">查看官方说明 ↗</a>`
      : `<div class="detail-readonly-note"><strong>系统状态</strong><small>${escapeHtml(support.permission)}</small></div><a class="detail-link" href="${escapeHtml(support.official_url)}" target="_blank" rel="noreferrer">查看官方说明 ↗</a>`;
  } else if (moduleId === "keyboard_compatibility") {
    title = "内置键盘 Control ↔ Command";
    subtitle = "系统与习惯";
    body = "只修改 MacBook 内置键盘的物理 Control 与 Command；外接键盘、Option 和 Fn 保持原样。";
    result = "内置键盘的快捷键位置更接近 Windows，且可以按快照精确恢复。";
    recovery = plan.keyboard_compatibility.recovery;
  }
  return `<div class="detail-modal-backdrop" data-detail-backdrop><section class="detail-modal" role="dialog" aria-modal="true" aria-labelledby="detail-modal-title"><button class="detail-modal-close" type="button" data-action="close-detail" aria-label="关闭详情">×</button><span class="home-marker blue-text">选项说明</span><h2 id="detail-modal-title">${escapeHtml(title)}</h2><p class="detail-modal-subtitle">${escapeHtml(subtitle)}</p><div class="detail-modal-section"><strong>会做什么</strong><p>${escapeHtml(body)}</p></div><div class="detail-modal-section"><strong>你会看到的结果</strong><p>${escapeHtml(result)}</p></div><div class="detail-modal-section"><strong>如何恢复</strong><p>${escapeHtml(recovery)}</p></div>${extra}</section></div>`;
}

function renderPlan(): string {
  const plan = state.plan;
  if (!plan) return renderHome();
  const systemItems = visiblePlanItems(plan);
  const softwareItems = plan.software.filter((item) => item.installed && !unsupportedSoftware(plan).some((candidate) => candidate.id === item.id));
  const systemChildren = systemItems.map((item) => renderPlanChoice(item.module_id, item.title, item.module_id === "keyboard_compatibility" ? "仅内置键盘 Control ↔ Command" : item.module_id === "pointer_scroll" ? "鼠标与触控板分别处理" : "按 Windows 习惯调整", plan.selected_module_ids.includes(item.module_id), "")).join("");
  const wifiChoice = plan.wifi ? renderPlanChoice("wifi.personal", plan.wifi.name, plan.wifi.contains_secrets ? "已选择密码 · 敏感信息" : "只带网络名", plan.selected_module_ids.includes("wifi.personal"), "") : "";
  const softwareChildren = softwareItems.map((item) => renderPlanChoice(`software.${item.id}`, item.name, "点击查看说明", plan.selected_module_ids.includes(`software.${item.id}`), `data-software-plan="${escapeHtml(item.id)}"`)).join("");
  const unsupported = [...unsupportedPlanItems(plan).map((item) => item.title), ...unsupportedSoftware(plan).map((item) => item.name)];
  const unsupportedNotice = unsupported.length ? `<div class="plan-unsupported-notice" role="status"><strong>有 ${unsupported.length} 项暂不支持</strong><span>${escapeHtml(unsupported.join("、"))}。它们不会被自动应用，请更新 MacWin 或按官方方式处理。</span></div>` : "";
  const habitsGroup = renderPlanGroup(plan, "habits", "系统与习惯", "键盘、鼠标、Finder 与 Wi‑Fi", `${systemChildren}${wifiChoice}` || `<p class="empty-line">没有可迁移的系统习惯</p>`);
  const softwareGroup = renderPlanGroup(plan, "software", "软件与开发", "浏览器、开发工具与办公软件", softwareChildren || `<p class="empty-line">没有选择软件</p>`);
  const count = plan.selected_module_ids.length;
  return renderShell(`<section class="reference-page mac-plan-page"><div class="mac-plan-grid"><div class="mac-plan-rail">${renderReferenceRail("mac", 2)}</div><section class="mac-plan-content"><div class="reference-kicker">C / MAC 目标端</div><div class="mac-plan-heading"><div><h1>确认迁移计划</h1><p>先看清楚，再让它发生。</p></div><span class="snapshot-reminder">⌁　迁移前快照会先保存</span></div><section class="reference-plan-list">${unsupportedNotice}${habitsGroup}${softwareGroup}</section><div class="plan-bottom-note"><span>ⓘ</span><span>拒绝某项权限不会影响其他模块；点开分组名称可查看具体项目。</span></div></section></div><div class="reference-bottom-bar plan-bottom-bar"><button class="secondary-button" data-action="home">取消</button><span class="bottom-bar-note">${count} 项将处理 · ${plan.contains_secrets ? "含敏感信息" : "不含密码"}</span><button class="reference-primary blue-action" data-action="apply" ${count ? "" : "disabled"}><b>确认并应用</b><i>→</i></button></div></section>${renderDetailModal(plan)}`, "", "", "", "");
}

function renderApplying(): string {
  return renderShell(`<div class="mac-map applying-map"><div>${renderMapRail(3)}</div><section class="activity-panel"><div class="activity-icon coral">↗</div><h2>正在保存快照并应用设置</h2><p>先保存迁移前状态，再逐项验证结果。请不要关闭 MacWin。</p><div class="activity-list"><div class="activity-row done"><span>✓</span><strong>迁移前快照</strong><small>已创建并验证</small></div><div class="activity-row active"><span>•</span><strong>正在执行已确认模块</strong><small>每个动作完成后重新读取结果</small></div><div class="activity-row"><span>○</span><strong>生成报告与指南</strong><small>等待验证结果</small></div></div></section></div>`, "Mac 端 · 执行", "正在执行计划", "权限拒绝或单模块失败不会被显示成全部成功。", "");
}

function resultMark(result: ModuleResult): string {
  const good = ["applied_verified", "rolled_back_verified"].includes(result.status);
  return `<span class="status-glyph ${good ? "good" : "warning"}">${good ? "✓" : "!"}</span>`;
}

function resultRow(result: ModuleResult): string {
  return `<article class="result-row">${resultMark(result)}<div><div class="result-title"><strong>${escapeHtml(result.title)}</strong><span class="status-text">${escapeHtml(statusLabel(result.status))}</span></div><span class="module-change"><b>结果</b>${escapeHtml(result.before)} <i>→</i> ${escapeHtml(result.after)}</span><small>${escapeHtml(result.benefit)}${result.error_code ? ` · 错误码 ${escapeHtml(result.error_code)}` : ""}</small></div></article>`;
}

function renderComplete(): string {
  const outcome = state.outcome;
  if (!outcome) return renderHome();
  const failed = outcome.results.some((result) => ["failed_recoverable", "unknown_requires_review"].includes(result.status));
  const pending = outcome.results.some((result) => ["manual_action_required", "skipped_permission", "skipped"].includes(result.status));
  const restored = outcome.outcome === "restored";
  const title = restored ? "恢复结果" : failed ? "部分未完成" : pending ? "已完成，还有项目待处理" : "迁移完成";
  const copy = restored ? "只显示已经恢复并验证的动作；其他项目保持原状态。" : "结果由每个模块的验证状态决定，不用一个总成功覆盖失败或待处理。";
  return renderShell(`<div class="mac-map result-map"><div>${renderMapRail(4)}</div><section class="result-content"><div class="result-heading"><span class="result-emblem ${failed ? "warning" : restored ? "mint" : "good"}">${failed ? "!" : restored ? "↶" : "✓"}</span><div><span class="home-marker ${failed ? "coral-text" : "blue-text"}">${restored ? "C4 / 恢复" : "C4 / 结果"}</span><h2>${title}</h2><p>${copy}</p></div></div><section class="result-list">${outcome.results.length ? outcome.results.map(resultRow).join("") : `<p class="empty-line">没有可显示的模块结果。</p>`}</section><div class="result-actions"><button class="home-link" data-action="report"><span>报告</span><strong>查看变更报告</strong><small>之前、现在、原因和状态</small></button><button class="home-link" data-action="guide"><span>指南</span><strong>打开我的 Mac 指南</strong><small>只解释已确认的内容</small></button><button class="home-link" data-action="restore"><span>恢复</span><strong>按模块恢复</strong><small>回到迁移前快照的值</small></button></div><div class="action-row"><button class="secondary-button" data-action="home">回到迁移主页</button></div></section></div>`, "Mac 端 · 结果", "", "", "");
}

function renderReport(): string {
  const outcome = state.outcome;
  if (!outcome) return renderHome();
  return renderShell(`<div class="mac-map subpage-map"><div>${renderMapRail(4)}</div><section class="report-content"><div class="section-title"><span class="section-index mint">R</span><div><h2>迁移变更报告</h2><p>只记录用户可理解的变化，不展示原始配置或秘密。</p></div></div><section class="report-sheet"><div class="report-meta"><span>MacWin ${escapeHtml(APP_VERSION)}</span><span>${escapeHtml(outcome.completed_at)}</span></div>${outcome.results.map((result) => `<div class="report-line"><div class="result-title"><strong>${escapeHtml(result.title)}</strong><span class="status-text">${escapeHtml(statusLabel(result.status))}</span></div><span>${escapeHtml(result.before)} <i>→</i> ${escapeHtml(result.after)}</span><small>原因：${escapeHtml(result.reason)}　收益：${escapeHtml(result.benefit)}${result.error_code ? `　错误码：${escapeHtml(result.error_code)}` : ""}</small></div>`).join("")}<div class="report-footnote">快照：${outcome.snapshot_available ? "已保存，可按模块恢复" : "未找到"} · 报告不包含 Wi‑Fi 密码、账号、路径、Token 或个人文件。</div></section><div class="action-row"><button class="secondary-button" data-action="complete">返回结果</button><button class="primary-cta dark" data-action="download-report"><span><b>保存 HTML 报告</b><small>本地文件</small></span><i>↗</i></button><button class="secondary-button" data-action="download-report-json">保存脱敏 JSON</button></div></section></div>`, "迁移后主页 · 报告", "", "", "");
}

function renderGuide(): string {
  const sections = state.outcome?.guide_sections ?? guideSections(true);
  return renderShell(`<div class="mac-map subpage-map"><div>${renderMapRail(4)}</div><section class="guide-content"><div class="section-title"><span class="section-index blue">G</span><div><h2>你的 Mac 使用指南</h2><p>只保留和这次选择、结果与恢复方式有关的说明。</p></div></div><section class="guide-list">${sections.map((section, index) => `<article><span class="guide-number">${String(index + 1).padStart(2, "0")}</span><div><h3>${escapeHtml(section.title)}</h3><p>${escapeHtml(section.body)}</p></div></article>`).join("")}</section><div class="action-row"><button class="secondary-button" data-action="complete">返回结果</button></div></section></div>`, "迁移后主页 · 指南", "", "", "");
}

function renderRestore(): string {
  const results = state.outcome?.results ?? [];
  const rows = results.map((result) => canRestoreModule(result) ? `<div class="restore-row"><div><strong>${escapeHtml(result.title)}</strong><small>恢复到：${escapeHtml(result.before)}</small></div><button class="small-button" data-rollback="${escapeHtml(result.module_id)}">恢复</button></div>` : `<div class="restore-row"><div><strong>${escapeHtml(result.title)}</strong><small>${result.status === "rolled_back_verified" ? "已经恢复并验证" : "本次未修改系统，不提供恢复动作"}</small></div><span class="status-text">${escapeHtml(statusLabel(result.status))}</span></div>`).join("");
  return renderShell(`<div class="mac-map subpage-map"><div>${renderMapRail(4)}</div><section class="restore-content"><div class="section-title"><span class="section-index coral">↶</span><div><h2>恢复迁移前状态</h2><p>恢复针对这次快照，不是恢复出厂设置，也不会影响未参与迁移的设置。</p></div></div><section class="restore-list">${rows || `<p class="empty-line">没有可恢复的动作。</p>`}</section><div class="notice-line"><span class="status-glyph good">i</span><span>全部恢复会按依赖逆序处理；Wi‑Fi 快照不包含密码。</span></div><div class="action-row"><button class="secondary-button" data-action="complete">暂不恢复</button><button class="primary-cta dark" data-action="rollback-all" ${results.some(canRestoreModule) ? "" : "disabled"}><span><b>全部恢复</b><small>只处理可恢复模块</small></span><i>↶</i></button></div></section></div>`, "迁移后主页 · 恢复", "", "", "");
}

let lastRenderedView: View | null = null;

function renderDiagnostics(): string {
  const diagnostics = state.diagnostics;
  if (!diagnostics) return renderShell(`<div class="activity-panel"><div class="activity-icon mint">✓</div><h2>正在生成设备自检</h2><p>只读取本机信息，不上传。</p></div>`, "设备自检", "", "", "");
  const devices = diagnostics.keyboard_devices.length ? diagnostics.keyboard_devices.map((device) => `<div class="device-line"><strong>${escapeHtml(device.name)}</strong><small>${device.kind === "built_in" ? "内置键盘" : "外接键盘"} · 脱敏标识 ${escapeHtml(device.redacted_id)} · ${device.recognized ? "可安全匹配" : "不会猜测"}</small></div>`).join("") : `<p class="empty-line">未发现可安全识别的键盘</p>`;
  const snapshot = diagnostics.snapshot.available ? `已保存${diagnostics.snapshot.created_at ? ` · ${escapeHtml(diagnostics.snapshot.created_at)}` : ""}` : diagnostics.snapshot.error ? `不可用 · ${escapeHtml(friendlyError(diagnostics.snapshot.error))}` : "未找到";
  const deleteButton = isTauri && diagnostics.snapshot.available ? `<button class="secondary-button" data-action="delete-snapshot">删除迁移前快照</button>` : "";
  return renderShell(`<section class="diagnostics-sheet"><div class="section-title"><span class="section-index mint">D</span><div><h2>设备自检</h2><p>检查当前设备边界，不读取用户名、完整路径、序列号或原始配置。</p></div></div><div class="diagnostic-grid"><div><span>应用</span><strong>${escapeHtml(diagnostics.app_version)}</strong></div><div><span>规则格式</span><strong>${escapeHtml(diagnostics.format_version)}</strong></div><div><span>系统</span><strong>${escapeHtml(diagnostics.runtime.os_version)} · ${escapeHtml(diagnostics.runtime.architecture)}</strong></div><div><span>键位冲突检查</span><strong>${diagnostics.keyboard_conflict.detected ? "发现可能冲突" : "未发现"}</strong><small>${escapeHtml(diagnostics.keyboard_conflict.detail)}</small></div><div><span>迁移前快照</span><strong>${snapshot}</strong><small>卸载应用不会自动删除</small></div></div><h3>键盘设备</h3>${devices}<h3>最近模块</h3><p class="muted">${diagnostics.recent_modules.length ? escapeHtml(diagnostics.recent_modules.join(" · ")) : "暂无执行记录"}</p><div class="notice-line"><span class="status-glyph good">i</span><span>${escapeHtml(diagnostics.privacy_note)}</span></div><div class="action-row"><button class="secondary-button" data-action="home">返回首页</button>${deleteButton}</div></section>`, "设备自检", "", "", "");
}

function render(): void {
  const content = state.view === "home" ? renderHome() : state.view === "scanning" ? renderScanning() : state.view === "scan" ? renderScan() : state.view === "export" ? renderExportReview() : state.view === "exported" ? renderExported() : state.view === "plan" ? renderPlan() : state.view === "applying" ? renderApplying() : state.view === "complete" ? renderComplete() : state.view === "report" ? renderReport() : state.view === "guide" ? renderGuide() : state.view === "restore" ? renderRestore() : renderDiagnostics();
  appRoot.innerHTML = state.busy ? `${content}<div class="busy-overlay" role="status">正在处理…</div>` : content;
  bindEvents();
  if (lastRenderedView !== state.view) {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    lastRenderedView = state.view;
  }
}

function recordError(error: unknown): string {
  const code = parseNativeError(error);
  if (isTauri) void invokeNative("record_error", { input: { code } }).catch(() => undefined);
  return code;
}

async function runScan(): Promise<void> {
  if (state.runtime?.platform !== "windows" || state.runtime.supported !== true) { const code = recordError("UNSUPPORTED_PLATFORM"); state = { ...state, error: code }; render(); return; }
  state = { ...state, view: "scanning", busy: true, error: null }; render();
  try { const scan = await invokeOrPreview("scan_windows"); state = { ...state, scan, runtime: scan.runtime, selection: { ...state.selection, software_ids: defaultSoftwareIds(scan) }, view: "scan", busy: false }; }
  catch (error) { const code = recordError(error); state = { ...state, view: "home", busy: false, error: code }; }
  render();
}

async function exportPackage(): Promise<void> {
  if (!state.scan) return;
  setBusy(true);
  try {
    const path = isTauri ? await save({ defaultPath: "windows-habits.habitpack", filters: [{ name: "MacWin 迁移包", extensions: ["habitpack"] }] }) : null;
    if (!path && isTauri) { setBusy(false); return; }
    const receipt = await invokeOrPreview("export_habitpack", { path: path ?? "preview.habitpack", selection: state.selection });
    state = { ...state, receipt, view: "exported", busy: false };
  } catch (error) { const code = recordError(error); state = { ...state, busy: false, error: code }; }
  render();
}

async function importPackage(): Promise<void> {
  if (state.runtime?.platform !== "macos" || state.runtime.supported !== true) { const code = recordError("UNSUPPORTED_PLATFORM"); state = { ...state, error: code }; render(); return; }
  try {
    const path = isTauri ? await open({ multiple: false, directory: false, filters: [{ name: "MacWin 迁移包", extensions: ["habitpack"] }] }) : "preview.habitpack";
    if (!path && isTauri) return;
    setBusy(true);
    const importedPlan = await invokeOrPreview("import_habitpack", { path: path ?? "preview.habitpack" });
    const plan = normalizePlan(importedPlan);
    expandedPlanGroups = new Set();
    activeDetailModuleId = null;
    state = { ...state, plan, runtime: isTauri ? state.runtime : runtimeFor("macos"), view: "plan", busy: false, error: null };
  } catch (error) { const code = recordError(error); state = { ...state, view: "home", busy: false, error: code }; }
  render();
}

async function applyPlan(): Promise<void> {
  const plan = state.plan;
  if (!plan?.selected_module_ids.length) return;
  state = { ...state, view: "applying", busy: true, error: null }; render();
  try {
    const keyboard = plan.keyboard_compatibility;
    const selectedModuleIds = selectedModulesForConfirmation(plan);
    const confirmedRaw = await invokeOrPreview("confirm_plan", { confirmation: { selected_module_ids: selectedModuleIds, keyboard_built_in: keyboard.built_in_enabled, keyboard_external: keyboard.external_enabled } });
    const confirmed = normalizePlan({ ...confirmedRaw, selected_module_ids: selectedModuleIds });
    state = { ...state, plan: confirmed };
    const outcome = await invokeOrPreview("apply_plan", { keyboardBuiltIn: confirmed.keyboard_compatibility.built_in_enabled, keyboardExternal: confirmed.keyboard_compatibility.external_enabled, selectedModuleIds: confirmed.selected_module_ids, confirmationToken: confirmed.confirmation_token });
    state = { ...state, outcome, view: "complete", busy: false };
  } catch (error) { const code = recordError(error); state = { ...state, view: "plan", busy: false, error: code }; }
  render();
}

async function rollback(moduleId?: string): Promise<void> {
  state = { ...state, busy: true, error: null }; render();
  try { const outcome = moduleId ? await invokeOrPreview("rollback_module", { moduleId }) : await invokeOrPreview("rollback_all"); state = { ...state, outcome, view: "complete", busy: false }; }
  catch (error) { const code = recordError(error); state = { ...state, busy: false, error: code }; }
  render();
}

async function runDiagnostics(): Promise<void> {
  state = { ...state, view: "diagnostics", busy: true, error: null }; render();
  try { const diagnostics = await invokeOrPreview("device_self_check"); state = { ...state, diagnostics, busy: false }; }
  catch (error) { const code = recordError(error); state = { ...state, busy: false, error: code }; }
  render();
}

async function deleteSnapshot(): Promise<void> {
  if (!isTauri || !state.diagnostics?.snapshot.available) return;
  if (!window.confirm("删除迁移前快照后，MacWin 将无法自动恢复这次迁移。确定删除吗？")) return;
  setBusy(true);
  try { const snapshot = await invokeOrPreview("delete_snapshot", { request: { confirmed: true } }); state = { ...state, diagnostics: { ...state.diagnostics, snapshot }, busy: false }; }
  catch (error) { const code = recordError(error); state = { ...state, busy: false, error: code }; }
  render();
}

function updatePreviewQuery(key: string, value: string): void {
  const next = new URL(window.location.href);
  next.searchParams.set(key, value);
  window.location.assign(next.toString());
}

function handoffToMac(): void {
  if (!previewEnabled) return;
  state = { ...state, runtime: runtimeFor("macos"), view: "home", error: null };
  window.history.replaceState({}, "", `?preview=1&platform=macos&scenario=${encodeURIComponent(state.preview.scenario)}`);
  render();
}

function bindEvents(): void {
  appRoot.querySelectorAll<HTMLElement>("[data-action]").forEach((element) => element.addEventListener("click", () => {
    const action = element.dataset.action;
    if (action === "home") goHome();
    else if (action === "clear-error") { state = { ...state, error: null }; render(); }
    else if (action === "close-detail") { activeDetailModuleId = null; render(); }
    else if (action === "start-scan") void runScan();
    else if (action === "import") void importPackage();
    else if (action === "export-review") updateView("export");
    else if (action === "back-to-scan") updateView("scan");
    else if (action === "export") void exportPackage();
    else if (action === "handoff") handoffToMac();
    else if (action === "apply") void applyPlan();
    else if (action === "complete") updateView("complete");
    else if (action === "report") updateView("report");
    else if (action === "guide") updateView("guide");
    else if (action === "restore") updateView("restore");
    else if (action === "rollback-all") void rollback();
    else if (action === "diagnostics") void runDiagnostics();
    else if (action === "delete-snapshot") void deleteSnapshot();
    else if (action === "check-update") void checkUpdate(true);
    else if (action === "privacy") window.alert("MacWin 只迁移白名单习惯与环境，不读取个人文件、浏览器历史/密码/Cookie、账号、Token 或项目代码；除版本检查外不联网。所有真实变化前必须确认计划，快照保留到你主动删除。详见仓库中的 D-008、D-012、D-019。");
    else if (action === "download-report") void saveReport("html");
    else if (action === "download-report-json") void saveReport("json");
  }));
  appRoot.querySelectorAll<HTMLInputElement>("input[data-keyboard]").forEach((input) => input.addEventListener("change", () => { state = { ...state, selection: { ...state.selection, include_keyboard: input.checked } }; render(); }));
  appRoot.querySelectorAll<HTMLInputElement>("input[data-habits-toggle]").forEach((input) => input.addEventListener("change", () => { state = { ...state, selection: { ...state.selection, include_keyboard: input.checked, include_pointer: input.checked } }; render(); }));
  appRoot.querySelectorAll<HTMLInputElement>("input[data-pointer]").forEach((input) => input.addEventListener("change", () => { state = { ...state, selection: { ...state.selection, include_pointer: input.checked } }; render(); }));
  appRoot.querySelectorAll<HTMLInputElement>("input[data-guide]").forEach((input) => input.addEventListener("change", () => { state = { ...state, selection: { ...state.selection, guide_requested: input.checked } }; render(); }));
  appRoot.querySelectorAll<HTMLInputElement>("input[data-wifi-password]").forEach((input) => input.addEventListener("change", () => { state = { ...state, preview: { ...state.preview, wifiPasswordSelected: input.checked } }; render(); }));
  appRoot.querySelectorAll<HTMLInputElement>("input[data-keyboard-kind]").forEach((input) => input.addEventListener("change", () => { const kind = input.dataset.keyboardKind; if (!state.plan?.keyboard_compatibility || (kind !== "built_in" && kind !== "external")) return; const keyboard = { ...state.plan.keyboard_compatibility, ...(kind === "built_in" ? { built_in_enabled: input.checked } : { external_enabled: input.checked }) }; state = { ...state, plan: { ...state.plan, keyboard_compatibility: keyboard } }; render(); }));
  appRoot.querySelectorAll<HTMLInputElement>("input[data-module]").forEach((input) => input.addEventListener("change", () => { if (!state.plan) return; const moduleId = input.dataset.module ?? ""; const selected = input.checked ? [...state.plan.selected_module_ids, moduleId] : state.plan.selected_module_ids.filter((value) => value !== moduleId); state = { ...state, plan: { ...state.plan, selected_module_ids: [...new Set(selected)] } }; render(); }));
  appRoot.querySelectorAll<HTMLInputElement>("input[data-software]").forEach((input) => input.addEventListener("change", () => { const id = input.dataset.software ?? ""; const ids = input.checked ? [...state.selection.software_ids, id] : state.selection.software_ids.filter((value) => value !== id); state = { ...state, selection: { ...state.selection, software_ids: [...new Set(ids)] } }; render(); }));
  appRoot.querySelectorAll<HTMLInputElement>("input[data-software-plan]").forEach((input) => input.addEventListener("change", () => { if (!state.plan) return; const moduleId = `software.${input.dataset.softwarePlan ?? ""}`; const selected = input.checked ? [...state.plan.selected_module_ids, moduleId] : state.plan.selected_module_ids.filter((value) => value !== moduleId); state = { ...state, plan: { ...state.plan, selected_module_ids: [...new Set(selected)] } }; render(); }));
  appRoot.querySelectorAll<HTMLInputElement>("input[data-group-toggle]").forEach((input) => input.addEventListener("change", () => {
    if (!state.plan) return;
    const group = input.dataset.groupToggle as "habits" | "software";
    const ids = planGroupModuleIds(state.plan, group);
    const selected = input.checked ? [...state.plan.selected_module_ids, ...ids] : state.plan.selected_module_ids.filter((value) => !ids.includes(value));
    state = { ...state, plan: { ...state.plan, selected_module_ids: [...new Set(selected)] } };
    render();
  }));
  appRoot.querySelectorAll<HTMLButtonElement>("button[data-group-expand]").forEach((button) => button.addEventListener("click", () => {
    const group = button.dataset.groupExpand ?? "";
    if (expandedPlanGroups.has(group)) expandedPlanGroups.delete(group); else expandedPlanGroups.add(group);
    render();
  }));
  appRoot.querySelectorAll<HTMLButtonElement>("button[data-detail-id]").forEach((button) => button.addEventListener("click", () => { activeDetailModuleId = button.dataset.detailId ?? null; render(); }));
  appRoot.querySelectorAll<HTMLElement>("[data-detail-backdrop]").forEach((backdrop) => backdrop.addEventListener("click", (event) => { if (event.target === backdrop) { activeDetailModuleId = null; render(); } }));
  appRoot.querySelectorAll<HTMLInputElement>("input[data-linear-mouse]").forEach((input) => input.addEventListener("change", () => { state = { ...state, preview: { ...state.preview, linearMouseConfirmed: input.checked } }; render(); }));
  appRoot.querySelectorAll<HTMLElement>("[data-rollback]").forEach((element) => element.addEventListener("click", () => void rollback(element.dataset.rollback)));
  appRoot.querySelectorAll<HTMLElement>("[data-preview-platform]").forEach((element) => element.addEventListener("click", () => updatePreviewQuery("platform", element.dataset.previewPlatform ?? "macos")));
  appRoot.querySelectorAll<HTMLSelectElement>("[data-preview-scenario]").forEach((select) => select.addEventListener("change", () => updatePreviewQuery("scenario", select.value)));
  appRoot.querySelectorAll<HTMLInputElement>("input[data-group-toggle]").forEach((input) => {
    if (!state.plan) return;
    const group = input.dataset.groupToggle as "habits" | "software";
    const groupState = groupSelectedState(state.plan, group);
    input.indeterminate = groupState.selected > 0 && !groupState.checked;
  });
}

async function saveReport(format: "html" | "json"): Promise<void> {
  const text = state.outcome?.results.map((result) => `${result.title}：${result.before} → ${result.after}（${statusLabel(result.status)}）`).join("\n") ?? "";
  if (isTauri) { try { const receipt = await invokeOrPreview("export_report", { format }); window.alert(`报告已保存：${receipt.path}`); } catch (error) { const code = recordError(error); state = { ...state, error: code }; render(); } return; }
  await navigator.clipboard?.writeText(text);
  window.alert(format === "html" ? "浏览器演示已复制报告文字；真实应用会保存 HTML 文件。" : "浏览器演示已复制脱敏报告文字；真实应用会保存 JSON 文件。");
}

async function checkUpdate(showResult: boolean): Promise<void> {
  if (!isTauri) { if (showResult) window.alert("浏览器演示不会联网检查更新。"); return; }
  try { const result = await invokeOrPreview("check_update"); if (showResult && result.status === "available") { const confirmed = window.confirm(`发现新版本 ${result.version ?? ""}。MacWin 会先验证签名，再下载并安装。现在安装吗？`); if (confirmed) { const installed = await invokeOrPreview("install_update", { request: { confirmed: true } }); window.alert(installed.status === "installed_restart_required" ? `版本 ${installed.version ?? ""} 已安装，重启 MacWin 后生效。` : "当前已是最新版本。"); } } else if (showResult) window.alert("当前已是最新版本。"); }
  catch (error) { if (showResult && parseNativeError(error) !== "UPDATE_NOT_CONFIGURED") recordError(error); if (showResult) window.alert("暂时无法检查更新；离线时不影响本地迁移功能。"); }
}

async function loadRuntime(): Promise<void> {
  try { state = { ...state, runtime: await invokeOrPreview("runtime_info") }; }
  catch (error) { const code = recordError(error); state = { ...state, runtime: { platform: "unsupported", os_version: "无法读取", architecture: "unknown", supported: false, support_message: "无法确认当前设备是否受支持", alpha: false }, error: code }; }
  if (isTauri) void checkUpdate(false);
  render();
}

void loadRuntime();
