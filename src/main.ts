import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { initialState, setView, statusLabel } from "./app-state";
import type {
  DeviceSelfCheck,
  ExportReceipt,
  GuideSection,
  ImportPlan,
  MigrationOutcome,
  ModuleResult,
  PreviewScenario,
  RuntimeInfo,
  SnapshotStatus,
  View,
  WindowsScan,
} from "./types";
import "./styles.css";

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new Error("MacWin root not found");
const appRoot = root;

const isTauri = Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
const previewEnabled = !isTauri && import.meta.env.DEV;
const query = new URLSearchParams(window.location.search);
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
    { module_id: "keyboard_compatibility", title: "选择性 Ctrl 兼容", current_value: "未启用", target_value: "普通应用转换为对应 Command", reason: "降低从 Windows 迁移后的快捷键落差。", benefit: "终端、远程桌面和虚拟机仍保留真实 Ctrl。", verification: "验证 MacWin 自己的规则", recovery: "只移除 MacWin 自己的规则", requires_admin: false },
    { module_id: "pointer_scroll", title: "鼠标与触控板滚动方向", current_value: "读取 Mac 当前值", target_value: "按来源设备分别处理", reason: "保留鼠标和触控板在 Windows 上的使用习惯。", benefit: "两个设备的方向分别说明，不互相覆盖。", verification: "分别读取鼠标与触控板结果", recovery: "恢复迁移前值", requires_admin: false },
  ],
  keyboard_compatibility: {
    built_in_enabled: true,
    external_enabled: true,
    devices: [
      { name: "MacBook 内置键盘（演示）", kind: "built_in", recognized: true, redacted_id: "kb-demo-01" },
      { name: "Windows 外接键盘（演示）", kind: "external", recognized: true, redacted_id: "kb-demo-02" },
    ],
    shortcuts: ["Ctrl+C → Command+C", "Ctrl+V → Command+V", "Ctrl+Z → Command+Z", "Ctrl+Y → Command+Y"],
    exceptions: ["Terminal", "远程桌面", "Parallels / VMware / UTM", "VS Code 集成终端"],
    karabiner: { installed: false, version: null, config_present: false, permission: "浏览器演示数据；实际 Mac 按系统提示授权", official_url: "https://karabiner-elements.pqrs.org/" },
    recovery: "只移除 MacWin 自己的规则",
  },
  confirmation_token: "preview-plan-confirmed-v1",
  pointer: { mouse_direction: "windows_style", trackpad_direction: "windows_style" },
  pointer_support: { linear_mouse_installed: false, linear_mouse_version: null, native_independent: false, permission: "浏览器演示数据；实际 Mac 按系统要求检查", official_url: "https://linearmouse.app/" },
  wifi: { name: "Home Wi‑Fi", credential_status: "not_selected", contains_secrets: false, note: "当前只带网络名；密码需要再次明确选择。" },
  selected_module_ids: ["finder_extensions", "keyboard_compatibility", "pointer_scroll", "software.chrome", "software.vscode", "software.wps"],
};

const previewDiagnostics: DeviceSelfCheck = {
  app_version: "1.0.0-rc.1",
  format_version: "1.0.0",
  runtime: runtimeFor("macos"),
  keyboard_devices: previewPlanBase.keyboard_compatibility.devices,
  karabiner: previewPlanBase.keyboard_compatibility.karabiner,
  snapshot: { available: false, version: null, created_at: null, error: null },
  recent_modules: [],
  privacy_note: "浏览器演示数据；真实应用只在本机生成，不含用户名、路径、序列号或密码",
};

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}

function friendlyError(value: unknown): string {
  const code = String(value ?? "").replace(/^Error:\s*/, "");
  const messages: Record<string, string> = {
    SNAPSHOT_INTEGRITY: "迁移前快照完整性校验失败，已停止恢复；原设置不会被猜测覆盖。",
    SNAPSHOT_INVALID: "迁移前快照格式无效，已停止恢复。",
    SNAPSHOT_MISSING: "没有找到这次迁移的快照，无法安全恢复。",
    PLAN_NOT_CONFIRMED: "迁移计划已变化，请重新打开计划并确认后再应用。",
    UNSUPPORTED_PLATFORM: "当前设备不在正式支持范围内，MacWin 不会修改系统。",
    IMPORT_EXTENSION: "请选择 .habitpack 迁移包。",
    HP_ZIP_STREAM: "迁移包压缩结构不受支持，已拒绝导入。",
    HP_ZIP_LAYOUT: "迁移包结构或完整性不正确，已拒绝导入。",
    KARABINER_JSON: "Karabiner 配置不是有效 JSON，MacWin 没有写入它。",
    KARABINER_STRUCTURE: "Karabiner 配置结构不受支持，MacWin 没有猜测修改。",
    KARABINER_BACKUP: "无法创建 Karabiner 迁移前备份，已跳过写入。",
    UPDATE_CONFIRM_REQUIRED: "更新必须经过确认。",
    UPDATE_INSTALL_FAILED: "更新下载、签名校验或安装失败；当前版本未被替换。",
    SNAPSHOT_DELETE_CONFIRM_REQUIRED: "删除快照必须经过确认。",
    SNAPSHOT_DELETE: "无法删除迁移前快照；它仍然保留。",
    MODULE_NOT_RESTORABLE: "这个模块没有在本次迁移中成功修改，不能把它当作需要恢复的设置。",
  };
  return messages[code] ?? (code || "发生未知错误，请查看报告中的错误码。");
}

function previewPlanForState(): ImportPlan {
  const handoff = Boolean(state.receipt);
  const selected = handoff ? new Set<string>() : new Set(previewPlanBase.selected_module_ids);
  if (handoff) {
    if (state.selection.include_keyboard) ["finder_extensions", "keyboard_compatibility"].forEach((id) => selected.add(id));
    if (state.selection.include_pointer) selected.add("pointer_scroll");
    state.selection.software_ids.forEach((id) => selected.add(`software.${id}`));
  }
  const wifiSelected = state.preview.wifiPasswordSelected;
  const wifi = { ...previewPlanBase.wifi!, credential_status: wifiSelected ? "available" as const : "not_selected" as const, contains_secrets: wifiSelected, note: wifiSelected ? "已主动选择密码；迁移包第一版不加密，Mac 导入成功后应删除副本。" : "当前只带网络名；密码需要再次明确选择。" };
  if (wifiSelected) selected.add("wifi.personal");
  return { ...previewPlanBase, guide_requested: state.selection.guide_requested || !handoff, wifi, contains_secrets: wifiSelected, selected_module_ids: [...selected] };
}

function invokeOrPreview<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (isTauri) return invoke<T>(command, args);
  if (command === "runtime_info") return Promise.resolve(previewRuntime as T);
  if (command === "scan_windows") return Promise.resolve(previewScan as T);
  if (command === "import_habitpack") {
    if (state.preview.scenario === "corrupt-package") return Promise.reject(new Error("HP_ZIP_LAYOUT"));
    return Promise.resolve(previewPlanForState() as T);
  }
  if (command === "confirm_plan") return Promise.resolve({ ...previewPlanForState(), selected_module_ids: (args?.selected_module_ids as string[] | undefined) ?? previewPlanForState().selected_module_ids } as T);
  if (command === "export_habitpack") {
    const plan = previewPlanForState();
    return Promise.resolve({ path: "浏览器预览，不会写入文件", package_bytes: 0, modules: plan.selected_module_ids, contains_secrets: plan.contains_secrets, validated: true } as T);
  }
  if (command === "apply_plan") return Promise.resolve(previewOutcome() as T);
  if (command === "rollback_module") return Promise.resolve(previewRollback(args?.module_id as string) as T);
  if (command === "rollback_all") return Promise.resolve(previewRollback("all") as T);
  if (command === "device_self_check") return Promise.resolve(previewDiagnostics as T);
  if (command === "export_report") return Promise.resolve({ path: "浏览器预览，不会写入文件", format: args?.format ?? "html", bytes: 0 } as T);
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
  add({ module_id: "keyboard_compatibility", title: "选择性 Ctrl 兼容", before: "未启用", after: permissionDenied ? "未改变" : "普通应用使用对应 Command", reason: "降低从 Windows 迁移后的快捷键落差。", benefit: "终端、远程桌面和虚拟机仍保留真实 Ctrl。", recovery: "只移除 MacWin 自己的规则", status: permissionDenied ? "skipped_permission" : "applied_verified", error_code: permissionDenied ? "ACCESSIBILITY_DENIED" : null });
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
  if (keyboard) sections.unshift({ title: "选择性 Ctrl 兼容", body: "普通应用中的常用 Ctrl 组合可以对应 Command；Terminal、远程桌面、虚拟机和 VS Code 集成终端保留真实 Ctrl。" });
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
  if (!previewEnabled) return "";
  const scenarios: Array<[PreviewScenario, string]> = [["normal", "正常"], ["uac-denied", "UAC 拒绝"], ["permission-denied", "Mac 权限拒绝"], ["offline", "离线"], ["third-party-declined", "第三方拒绝"], ["module-failed", "单模块失败"], ["corrupt-package", "损坏迁移包"]];
  return `<div class="preview-toolbar" aria-label="浏览器预览控制"><span class="preview-label">预览</span><button class="preview-platform ${previewPlatform === "windows" ? "selected" : ""}" data-preview-platform="windows">Windows</button><button class="preview-platform ${previewPlatform === "macos" ? "selected" : ""}" data-preview-platform="macos">Mac</button><label>情境<select data-preview-scenario>${scenarios.map((option) => { const value = option[0]; const label = option[1]; return `<option value="${value}" ${state.preview.scenario === value ? "selected" : ""}>${label}</option>`; }).join("")}</select></label><span class="preview-note">虚构数据 · 不修改系统</span></div>`;
}

function renderShell(content: string, eyebrow: string, title: string, description = "", journey: string = ""): string {
  const platform = state.runtime?.platform === "windows" ? "Windows → Mac" : state.runtime?.platform === "macos" ? "Mac 目标端" : "离线、本地、可恢复";
  const platformKind = state.runtime?.platform === "windows" ? "windows" : state.runtime?.platform === "macos" ? "macos" : "unsupported";
  const platformMark = renderPlatformIcon(platformKind);
  return `<div class="app-shell"><header class="topbar"><button class="brand-button" data-action="home" aria-label="回到首页"><span class="brand-mark">MW</span><span><strong>MacWin</strong><small>双持 Mac 和 Windows 的好帮手</small></span></button><div class="topbar-meta"><span class="platform-chip">${platformMark}<span>${escapeHtml(platform)}</span></span><span class="version-chip">v1.0</span></div></header><main class="main-content"><div class="content-column">${journey}${renderErrorPanel()}<div class="eyebrow platform-eyebrow">${platformMark}<span>${escapeHtml(eyebrow)}</span></div><h1>${escapeHtml(title)}</h1>${description ? `<p class="lead">${escapeHtml(description)}</p>` : ""}${content}</div></main><footer class="privacy-footer"><span class="privacy-dot"></span><span>${state.webPreview ? "浏览器演示数据 · 不会修改系统" : "全程本地处理 · 不搬个人文件 · 不上传扫描结果"}</span><span class="footer-spacer"></span><button class="text-button" data-action="diagnostics">设备自检</button><button class="text-button" data-action="check-update">检查更新</button><a class="text-button" href="https://github.com/aswansong/macwin/issues" target="_blank" rel="noreferrer">反馈问题 ↗</a><button class="text-button" data-action="privacy">隐私与支持</button></footer>${renderPreviewToolbar()}</div>`;
}

function passportModules(): string {
  const selected = state.view === "scan" || state.view === "export" ? state.selection : state.plan ? { include_keyboard: state.plan.selected_module_ids.includes("keyboard_compatibility"), include_pointer: state.plan.selected_module_ids.includes("pointer_scroll"), software_ids: state.plan.selected_module_ids.filter((id) => id.startsWith("software.")).map((id) => id.replace("software.", "")), guide_requested: state.plan.guide_requested } : state.selection;
  const modules = [
    selected.include_keyboard ? ["键盘", "KEY"] : null,
    selected.include_pointer ? ["指针", "PTR"] : null,
    selected.software_ids.length ? ["软件", "APP"] : null,
    state.preview.wifiPasswordSelected ? ["Wi‑Fi", "NET"] : null,
    selected.guide_requested ? ["指南", "GUIDE"] : null,
  ].filter(Boolean) as string[][];
  return modules.length ? modules.map((module) => { const label = module[0]; const code = module[1]; return `<span class="passport-module"><b>${code}</b><span>${label}</span></span>`; }).join("") : `<span class="passport-empty">选择内容后会出现在这里</span>`;
}

function renderPassport(large = false): string {
  const plan = state.plan;
  const secret = plan?.contains_secrets || state.preview.wifiPasswordSelected;
  return `<div class="passport-card ${large ? "large" : ""}"><div class="passport-edge"><span></span><span></span><span></span><span></span><span></span><span></span></div><div class="passport-head"><span>MACWIN / HABITPACK</span><span>1.0.0</span></div><div class="passport-title"><span class="passport-monogram">MW</span><div><strong>习惯<br/>通行证</strong><small>WINDOWS → MAC</small></div></div><div class="passport-stamp">${secret ? "含敏感信息" : "LOCAL / OFFLINE"}</div><div class="passport-rule"></div><div class="passport-modules">${passportModules()}</div><div class="passport-foot"><span>由你选择</span><span>${secret ? "导入后删除副本" : "不搬个人文件"}</span></div></div>`;
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
    return renderShell(`<section class="home-layout windows-home"><div class="home-copy"><span class="home-marker">W1 / 检测</span><h2>检测这台 Windows</h2><p>MacWin 只读取白名单习惯与环境，扫描在本机完成，不搬个人文件。</p><div class="scope-list"><div class="scope-row"><span class="scope-icon blue">⌘</span><span><strong>操作习惯</strong><small>键盘、鼠标与触控板</small></span></div><div class="scope-row"><span class="scope-icon coral">□</span><span><strong>软件与开发</strong><small>浏览器、办公与轻量开发工具</small></span></div><div class="scope-row"><span class="scope-icon mint">◌</span><span><strong>系统设置</strong><small>可恢复的显示与输入偏好</small></span></div><div class="scope-row"><span class="scope-icon yellow">⌁</span><span><strong>个人 Wi‑Fi</strong><small>只处理用户逐项选择的网络</small></span></div></div></div><aside class="home-action"><div class="system-readout"><span class="status-glyph good">✓</span><div><strong>${escapeHtml(state.runtime.support_message)}</strong><small>${escapeHtml(state.runtime.os_version)} · ${escapeHtml(state.runtime.architecture)}</small></div></div><button class="primary-cta blue" data-action="start-scan"><span><b>开始检测</b><small>约需几步 · 默认不需要管理员权限</small></span><i>→</i></button><p class="home-boundary">检测前不会读取文件、浏览器历史/密码、Cookie、账号或登录状态。</p></aside></section>`, "Windows 来源端", "", "", renderJourney("windows", 1, "windows"));
  }
  if (state.runtime.platform !== "macos") {
    return renderShell(`<section class="activity-panel"><div class="activity-icon coral">!</div><h2>当前设备不受支持</h2><p>${escapeHtml(state.runtime.support_message)}。MacWin 不会修改系统。</p><div class="notice-line"><span class="status-glyph warning">i</span><span>正式范围：Windows 10/11 x64 来源端，或 Apple 芯片 macOS 15/26 目标端。</span></div></section>`, "设备检查", "", "", "");
  }
  const migrationHome = renderMigrationHome();
  return renderShell(`<section class="cover-layout"><div class="cover-copy"><span class="home-marker coral-text">B / 迁移封面</span><h2>你的习惯通行证</h2><p>导入 Windows 端生成的 .habitpack，先检查内容，再决定这台 Mac 要做什么。</p><button class="primary-cta coral" data-action="import"><span><b>导入迁移包</b><small>只接受经过验证的 .habitpack</small></span><i>→</i></button><div class="cover-facts"><span><b>本机离线</b><small>除版本检查外不上传数据</small></span><span><b>先看计划</b><small>确认前不会修改系统</small></span></div></div><aside class="cover-object">${renderPassport(true)}</aside></section>${migrationHome}<section class="home-note"><strong>迁移包不是整机备份。</strong><span>Wi‑Fi 密码若被主动选择，会在包中标记为敏感信息；报告、日志和快照都不会显示密码。</span></section>`, "Mac 目标端", "", "", "");
}

function renderScanning(): string {
  return renderShell(`<section class="activity-panel"><div class="activity-icon blue">⌁</div><h2>正在读取白名单设置</h2><p>只读取系统版本、输入设置和已知软件。不会访问个人文件。</p><div class="activity-list"><div class="activity-row done"><span>✓</span><strong>平台兼容性</strong><small>Windows 10/11 x64</small></div><div class="activity-row active"><span>•</span><strong>输入设置</strong><small>当前阶段</small></div><div class="activity-row"><span>○</span><strong>软件与开发</strong><small>等待读取</small></div></div></section>`, "Windows 端 · 检测", "正在检测", "完成后只展示你能选择的变化。", renderJourney("windows", 1, "windows"));
}

function renderWindowsSelectionRow(input: string, title: string, description: string, checked: boolean, badge = ""): string {
  return `<label class="selection-row"><input type="checkbox" ${input} ${checked ? "checked" : ""}/><span class="selection-copy"><strong>${escapeHtml(title)}</strong><small>${escapeHtml(description)}</small></span>${badge ? `<span class="risk-badge">${escapeHtml(badge)}</span>` : ""}</label>`;
}

function renderScan(): string {
  const scan = state.scan;
  if (!scan) return renderHome();
  const installed = scan.software.filter((item) => item.installed);
  const wifi = scan.wifi?.[0];
  return renderShell(`<div class="windows-workspace"><section class="selection-panel"><div class="section-title"><span class="section-index blue">W2</span><div><h2>选择要带到 Mac 的内容</h2><p>复选框就是选择状态。常用软件在 Mac 计划中只确认一次。</p></div></div><div class="discovery-list"><div class="list-heading"><span>操作习惯</span><small>可以分别恢复</small></div>${renderWindowsSelectionRow("data-keyboard", "选择性 Ctrl 兼容", "普通应用支持 Ctrl+C/V/X/Z；终端和远程桌面保留真实 Ctrl。", state.selection.include_keyboard)}${renderWindowsSelectionRow("data-pointer", "鼠标与触控板滚动方向", "两个设备分开记录，Mac 端按结果验证。", state.selection.include_pointer)}<div class="list-heading"><span>软件与开发</span><small>Mac 计划中一次确认</small></div>${installed.map((item) => `<div class="finding-row"><span class="scope-icon coral">□</span><span><strong>${escapeHtml(item.name)}</strong><small>${item.category === "developer" ? "开发工具" : "白名单软件"} · ${escapeHtml(item.version_policy)} · Mac 端再确认</small></span></div>`).join("")}<div class="list-heading"><span>系统设置</span><small>只加入指南内容</small></div>${renderWindowsSelectionRow("data-guide", "个性化 Mac 使用指南", "只解释这次实际选择、Command、Option、Fn 和恢复方式。", state.selection.guide_requested)}<div class="list-heading"><span>个人 Wi‑Fi</span><small>逐项选择，密码另行同意</small></div>${wifi ? `<div class="wifi-choice"><div class="wifi-network"><span class="scope-icon yellow">⌁</span><div><strong>${escapeHtml(wifi.name)}</strong><small>${escapeHtml(wifi.security)} · 只保留网络名也可以</small></div></div><label class="selection-row nested"><input type="checkbox" data-wifi-password ${state.preview.wifiPasswordSelected ? "checked" : ""}/><span class="selection-copy"><strong>同时带上 Wi‑Fi 密码</strong><small>迁移包第一版不加密；选择后可能触发一次 UAC。</small></span><span class="risk-badge sensitive">敏感信息</span></label></div>` : `<p class="empty-line">没有发现可处理的个人 Wi‑Fi</p>`}</div><div class="notice-line"><span class="status-glyph good">i</span><span>不会读取浏览器书签、历史、密码、Cookie、账号或项目文件。</span></div><div class="action-row"><button class="secondary-button" data-action="home">返回</button><button class="primary-cta dark" data-action="export-review"><span><b>查看迁移包</b><small>确认选择与敏感信息提示</small></span><i>→</i></button></div></section><aside class="passport-dock"><div class="dock-heading"><span>实时预览</span><small>.habitpack</small></div>${renderPassport()}<div class="passport-dock-note"><span class="status-glyph good">✓</span><span>你每次勾选，票面都会同步更新。</span></div></aside></div>`, "Windows 端 · 选择", "", "", renderJourney("windows", 2, "windows"));
}

function renderExportReview(): string {
  const plan = previewPlanForState();
  const selected = plan.selected_module_ids.length;
  const secret = plan.contains_secrets;
  return renderShell(`<div class="export-workspace"><section class="export-review"><div class="section-title"><span class="section-index coral">W3</span><div><h2>检查迁移包</h2><p>生成前确认内容；生成后会重新打开并验证结构、哈希和选择引用。</p></div></div><div class="route-summary"><div class="route-summary-row done"><span>✓</span><div><strong>检测</strong><small>已读取 Windows 白名单设置</small></div></div><div class="route-summary-row done"><span>✓</span><div><strong>选择</strong><small>${selected} 个模块将写入迁移包</small></div></div><div class="route-summary-row current"><span>3</span><div><strong>导出</strong><small>生成、验证，再交给 Mac</small></div></div></div><div class="review-lines"><div><span>包内容</span><strong>${selected} 个选择 · ${plan.guide_requested ? "含指南" : "不含指南"}</strong></div><div><span>敏感信息</span><strong class="${secret ? "accent-danger" : ""}">${secret ? "含 Wi‑Fi 密码" : "不含密码"}</strong></div><div><span>保存方式</span><strong>用户选择本地位置</strong></div></div>${secret ? `<div class="notice-line warning"><span class="status-glyph warning">!</span><span>这是未加密迁移包。请只用你控制的本地方式传输，Mac 导入成功后删除不再需要的副本。</span></div>` : `<div class="notice-line"><span class="status-glyph good">✓</span><span>扫描与导出都在本机完成；MacWin 不会自动上传或同步迁移包。</span></div>`}<div class="action-row"><button class="secondary-button" data-action="back-to-scan">返回选择</button><button class="primary-cta coral" data-action="export"><span><b>生成并验证迁移包</b><small>写入后立即检查结构与引用</small></span><i>→</i></button></div></section><aside class="passport-dock export-passport"><div class="dock-heading"><span>将要交给 Mac</span><small>预览</small></div>${renderPassport()}<p class="dock-caption">.habitpack 是声明式迁移包，不包含可执行脚本或任意命令。</p></aside></div>`, "Windows 端 · 导出", "", "", renderJourney("windows", 3, "windows"));
}

function renderExported(): string {
  const receipt = state.receipt;
  return renderShell(`<section class="handoff-panel"><div class="handoff-status"><span class="status-glyph good">✓</span><div><span class="home-marker">W3 / 已验证</span><h2>迁移包已准备好</h2><p>${escapeHtml(receipt?.path ?? "浏览器预览，不会写入文件")}</p></div></div><div class="handoff-route"><div class="handoff-stop blue"><span>W</span><strong>Windows</strong><small>生成并验证</small></div><div class="handoff-line"></div><div class="handoff-stop coral"><span>M</span><strong>Mac</strong><small>导入后先看计划</small></div></div><div class="handoff-copy"><strong>下一步</strong><p>用 U 盘或你信任的本地方式把文件带到 Mac。MacWin 不会替你上传。</p>${receipt?.contains_secrets ? `<p class="accent-danger">此包包含 Wi‑Fi 密码；导入成功后删除不再需要的副本。</p>` : ""}</div><div class="action-row"><button class="secondary-button" data-action="home">回到首页</button><button class="primary-cta coral" data-action="handoff"><span><b>交给 Mac 预览</b><small>继续打开导入入口</small></span><i>→</i></button></div></section>`, "Windows 端 · 导出", "准备交给 Mac", "生成和验证都完成了。", renderJourney("windows", 3, "windows"));
}

const hiddenPlanModuleIds = new Set(["keyboard_repeat"]);
let expandedPlanGroups = new Set<string>();
let activeDetailModuleId: string | null = null;

function normalizePlan(plan: ImportPlan): ImportPlan {
  const items = plan.items.filter((item) => !hiddenPlanModuleIds.has(item.module_id));
  const selected_module_ids = plan.selected_module_ids.filter((moduleId) => !hiddenPlanModuleIds.has(moduleId));
  return { ...plan, items, selected_module_ids };
}

function visiblePlanItems(plan: ImportPlan): ImportPlan["items"] {
  return plan.items.filter((item) => !hiddenPlanModuleIds.has(item.module_id));
}

function planGroupModuleIds(plan: ImportPlan, group: "habits" | "software"): string[] {
  if (group === "software") return plan.software.filter((item) => item.installed).map((item) => `software.${item.id}`);
  return visiblePlanItems(plan).map((item) => item.module_id);
}

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
  return `<section class="plan-group ${expanded ? "expanded" : ""}"><div class="plan-group-row"><label class="plan-group-choice"><input type="checkbox" data-group-toggle="${group}" ${stateForGroup.checked ? "checked" : ""}/><span><strong>${title}</strong><small>${subtitle}</small></span></label><button class="group-toggle" type="button" data-group-expand="${group}" aria-expanded="${expanded ? "true" : "false"}">${expanded ? "收起" : "展开"}<span aria-hidden="true">${expanded ? "−" : "+"}</span></button></div><div class="plan-group-items" data-group-items="${group}" ${expanded ? "" : "hidden"}>${children}</div></section>`;
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
    result = state.preview.linearMouseConfirmed ? "已确认从官方入口完成辅助功能授权，执行后回到 MacWin 验证。" : "需要从官方入口完成 LinearMouse 和辅助功能授权；拒绝后仍可继续其他项目。";
    recovery = "恢复迁移前的滚动方向记录。";
    extra = `<label class="detail-consent"><input type="checkbox" data-linear-mouse ${state.preview.linearMouseConfirmed ? "checked" : ""} ${state.webPreview ? "" : "disabled"}/><span><strong>我已阅读用途和权限</strong><small>${state.preview.linearMouseConfirmed ? "已确认" : "未确认时，指针方向会保留为手动完成"}</small></span></label><a class="detail-link" href="${escapeHtml(plan.pointer_support.official_url)}" target="_blank" rel="noreferrer">查看官方说明 ↗</a>`;
  } else if (moduleId === "keyboard_compatibility") {
    title = "选择性 Ctrl 兼容";
    subtitle = "系统与习惯";
    body = "普通应用里的 Ctrl+C/V/X/Z 等组合会对应到 Command。Terminal、远程桌面、虚拟机和 VS Code 集成终端保留真实 Ctrl。";
    result = "复制、粘贴和撤销更接近 Windows 的手感，同时不影响需要真实 Ctrl 的场景。";
    recovery = plan.keyboard_compatibility.recovery;
  }
  return `<div class="detail-modal-backdrop" data-detail-backdrop><section class="detail-modal" role="dialog" aria-modal="true" aria-labelledby="detail-modal-title"><button class="detail-modal-close" type="button" data-action="close-detail" aria-label="关闭详情">×</button><span class="home-marker blue-text">选项说明</span><h2 id="detail-modal-title">${escapeHtml(title)}</h2><p class="detail-modal-subtitle">${escapeHtml(subtitle)}</p><div class="detail-modal-section"><strong>会做什么</strong><p>${escapeHtml(body)}</p></div><div class="detail-modal-section"><strong>你会看到的结果</strong><p>${escapeHtml(result)}</p></div><div class="detail-modal-section"><strong>如何恢复</strong><p>${escapeHtml(recovery)}</p></div>${extra}</section></div>`;
}

function renderPlan(): string {
  const plan = state.plan;
  if (!plan) return renderHome();
  const systemItems = visiblePlanItems(plan);
  const softwareItems = plan.software.filter((item) => item.installed);
  const systemChildren = systemItems.map((item) => renderPlanChoice(item.module_id, item.title, item.module_id === "keyboard_compatibility" ? "普通应用使用对应 Command" : item.module_id === "pointer_scroll" ? "鼠标与触控板分别处理" : "按 Windows 习惯调整", plan.selected_module_ids.includes(item.module_id), "")).join("");
  const wifiChoice = plan.wifi ? renderPlanChoice("wifi.personal", plan.wifi.name, plan.wifi.contains_secrets ? "已选择密码 · 敏感信息" : "只带网络名", plan.selected_module_ids.includes("wifi.personal"), "") : "";
  const softwareChildren = softwareItems.map((item) => renderPlanChoice(`software.${item.id}`, item.name, "点击查看说明", plan.selected_module_ids.includes(`software.${item.id}`), `data-software-plan="${escapeHtml(item.id)}"`)).join("");
  const habitsGroup = renderPlanGroup(plan, "habits", "系统与习惯", "键盘、鼠标、Finder 与 Wi‑Fi", `${systemChildren}${wifiChoice}` || `<p class="empty-line">没有可迁移的系统习惯</p>`);
  const softwareGroup = renderPlanGroup(plan, "software", "软件与开发", "浏览器、开发工具与办公软件", softwareChildren || `<p class="empty-line">没有选择软件</p>`);
  const count = plan.selected_module_ids.length;
  return renderShell(`<div class="mac-map"><div>${renderMapRail(2)}</div><section class="plan-content"><div class="section-title"><span class="section-index coral">C2</span><div><h2>确认迁移计划</h2><p>默认只显示两类内容。点开选项名称，可以查看它会做什么。</p></div></div><div class="plan-summary"><span><b>${count}</b> 项已选</span><span><b>${plan.contains_secrets ? "含" : "不含"}</b> Wi‑Fi 密码</span></div><section class="module-list">${habitsGroup}${softwareGroup}</section><div class="plan-safety"><span class="status-glyph good">✓</span><span>确认后先保存迁移前快照；只处理你勾选的内容。</span></div><div class="action-row"><button class="secondary-button" data-action="home">取消计划</button><button class="primary-cta dark" data-action="apply" ${count ? "" : "disabled"}><span><b>确认并应用</b><small>${count} 项 · 先保存快照</small></span><i>→</i></button></div></section></div>${renderDetailModal(plan)}`, "Mac 端 · 计划", "", "", "");
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
  return renderShell(`<div class="mac-map subpage-map"><div>${renderMapRail(4)}</div><section class="report-content"><div class="section-title"><span class="section-index mint">R</span><div><h2>迁移变更报告</h2><p>只记录用户可理解的变化，不展示原始配置或秘密。</p></div></div><section class="report-sheet"><div class="report-meta"><span>MacWin v1.0.0</span><span>${escapeHtml(outcome.completed_at)}</span></div>${outcome.results.map((result) => `<div class="report-line"><div class="result-title"><strong>${escapeHtml(result.title)}</strong><span class="status-text">${escapeHtml(statusLabel(result.status))}</span></div><span>${escapeHtml(result.before)} <i>→</i> ${escapeHtml(result.after)}</span><small>原因：${escapeHtml(result.reason)}　收益：${escapeHtml(result.benefit)}${result.error_code ? `　错误码：${escapeHtml(result.error_code)}` : ""}</small></div>`).join("")}<div class="report-footnote">快照：${outcome.snapshot_available ? "已保存，可按模块恢复" : "未找到"} · 报告不包含 Wi‑Fi 密码、账号、路径、Token 或个人文件。</div></section><div class="action-row"><button class="secondary-button" data-action="complete">返回结果</button><button class="primary-cta dark" data-action="download-report"><span><b>保存 HTML 报告</b><small>本地文件</small></span><i>↗</i></button><button class="secondary-button" data-action="download-report-json">保存脱敏 JSON</button></div></section></div>`, "迁移后主页 · 报告", "", "", "");
}

function renderGuide(): string {
  const sections = state.outcome?.guide_sections ?? guideSections(true);
  return renderShell(`<div class="mac-map subpage-map"><div>${renderMapRail(4)}</div><section class="guide-content"><div class="section-title"><span class="section-index blue">G</span><div><h2>你的 Mac 使用指南</h2><p>只保留和这次选择、结果与恢复方式有关的说明。</p></div></div><section class="guide-list">${sections.map((section, index) => `<article><span class="guide-number">${String(index + 1).padStart(2, "0")}</span><div><h3>${escapeHtml(section.title)}</h3><p>${escapeHtml(section.body)}</p></div></article>`).join("")}</section><div class="action-row"><button class="secondary-button" data-action="complete">返回结果</button></div></section></div>`, "迁移后主页 · 指南", "", "", "");
}

function renderRestore(): string {
  const results = state.outcome?.results ?? [];
  const restorable = new Set(["finder_extensions", "keyboard_repeat", "keyboard_compatibility", "pointer_scroll", "wifi.personal"]);
  const canRestore = (result: ModuleResult) => restorable.has(result.module_id) && ["applied_verified", "failed_recoverable"].includes(result.status);
  const rows = results.map((result) => canRestore(result) ? `<div class="restore-row"><div><strong>${escapeHtml(result.title)}</strong><small>恢复到：${escapeHtml(result.before)}</small></div><button class="small-button" data-rollback="${escapeHtml(result.module_id)}">恢复</button></div>` : `<div class="restore-row"><div><strong>${escapeHtml(result.title)}</strong><small>${result.status === "rolled_back_verified" ? "已经恢复并验证" : "本次未修改系统，不提供恢复动作"}</small></div><span class="status-text">${escapeHtml(statusLabel(result.status))}</span></div>`).join("");
  return renderShell(`<div class="mac-map subpage-map"><div>${renderMapRail(4)}</div><section class="restore-content"><div class="section-title"><span class="section-index coral">↶</span><div><h2>恢复迁移前状态</h2><p>恢复针对这次快照，不是恢复出厂设置，也不会影响未参与迁移的设置。</p></div></div><section class="restore-list">${rows || `<p class="empty-line">没有可恢复的动作。</p>`}</section><div class="notice-line"><span class="status-glyph good">i</span><span>全部恢复会按依赖逆序处理；Wi‑Fi 快照不包含密码。</span></div><div class="action-row"><button class="secondary-button" data-action="complete">暂不恢复</button><button class="primary-cta dark" data-action="rollback-all" ${results.some(canRestore) ? "" : "disabled"}><span><b>全部恢复</b><small>只处理可恢复模块</small></span><i>↶</i></button></div></section></div>`, "迁移后主页 · 恢复", "", "", "");
}

let lastRenderedView: View | null = null;

function renderDiagnostics(): string {
  const diagnostics = state.diagnostics;
  if (!diagnostics) return renderShell(`<div class="activity-panel"><div class="activity-icon mint">✓</div><h2>正在生成设备自检</h2><p>只读取本机信息，不上传。</p></div>`, "设备自检", "", "", "");
  const devices = diagnostics.keyboard_devices.length ? diagnostics.keyboard_devices.map((device) => `<div class="device-line"><strong>${escapeHtml(device.name)}</strong><small>${device.kind === "built_in" ? "内置键盘" : "外接键盘"} · 脱敏标识 ${escapeHtml(device.redacted_id)} · ${device.recognized ? "可安全匹配" : "不会猜测"}</small></div>`).join("") : `<p class="empty-line">未发现可安全识别的键盘</p>`;
  const snapshot = diagnostics.snapshot.available ? `已保存${diagnostics.snapshot.created_at ? ` · ${escapeHtml(diagnostics.snapshot.created_at)}` : ""}` : diagnostics.snapshot.error ? `不可用 · ${escapeHtml(friendlyError(diagnostics.snapshot.error))}` : "未找到";
  const deleteButton = isTauri && diagnostics.snapshot.available ? `<button class="secondary-button" data-action="delete-snapshot">删除迁移前快照</button>` : "";
  return renderShell(`<section class="diagnostics-sheet"><div class="section-title"><span class="section-index mint">D</span><div><h2>设备自检</h2><p>检查当前设备边界，不读取用户名、完整路径、序列号或原始配置。</p></div></div><div class="diagnostic-grid"><div><span>应用</span><strong>${escapeHtml(diagnostics.app_version)}</strong></div><div><span>规则格式</span><strong>${escapeHtml(diagnostics.format_version)}</strong></div><div><span>系统</span><strong>${escapeHtml(diagnostics.runtime.os_version)} · ${escapeHtml(diagnostics.runtime.architecture)}</strong></div><div><span>Karabiner</span><strong>${diagnostics.karabiner.installed ? "已检测到" : "未检测到"}</strong><small>${escapeHtml(diagnostics.karabiner.permission)}</small></div><div><span>迁移前快照</span><strong>${snapshot}</strong><small>卸载应用不会自动删除</small></div></div><h3>键盘设备</h3>${devices}<h3>最近模块</h3><p class="muted">${diagnostics.recent_modules.length ? escapeHtml(diagnostics.recent_modules.join(" · ")) : "暂无执行记录"}</p><div class="notice-line"><span class="status-glyph good">i</span><span>${escapeHtml(diagnostics.privacy_note)}</span></div><div class="action-row"><button class="secondary-button" data-action="home">返回首页</button>${deleteButton}</div></section>`, "设备自检", "", "", "");
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

function recordError(error: unknown): void {
  if (!isTauri) return;
  const raw = String(error ?? "UNKNOWN_ERROR").toUpperCase();
  const code = raw.match(/[A-Z][A-Z0-9_-]{2,63}/)?.[0] ?? "UNKNOWN_ERROR";
  void invoke("record_error", { input: { code } }).catch(() => undefined);
}

async function runScan(): Promise<void> {
  if (state.runtime?.platform !== "windows" || state.runtime.supported !== true) { recordError("UNSUPPORTED_PLATFORM"); state = { ...state, error: "UNSUPPORTED_PLATFORM" }; render(); return; }
  state = { ...state, view: "scanning", busy: true, error: null }; render();
  try { const scan = await invokeOrPreview<WindowsScan>("scan_windows"); state = { ...state, scan, runtime: scan.runtime, view: "scan", busy: false }; }
  catch (error) { recordError(error); state = { ...state, view: "home", busy: false, error: String(error) }; }
  render();
}

async function exportPackage(): Promise<void> {
  if (!state.scan) return;
  setBusy(true);
  try {
    const path = isTauri ? await save({ defaultPath: "windows-habits.habitpack", filters: [{ name: "MacWin 迁移包", extensions: ["habitpack"] }] }) : null;
    if (!path && isTauri) { setBusy(false); return; }
    const receipt = await invokeOrPreview<ExportReceipt>("export_habitpack", { path, selection: state.selection });
    state = { ...state, receipt, view: "exported", busy: false };
  } catch (error) { recordError(error); state = { ...state, busy: false, error: String(error) }; }
  render();
}

async function importPackage(): Promise<void> {
  if (state.runtime?.platform !== "macos" || state.runtime.supported !== true) { recordError("UNSUPPORTED_PLATFORM"); state = { ...state, error: "UNSUPPORTED_PLATFORM" }; render(); return; }
  try {
    const path = isTauri ? await open({ multiple: false, directory: false, filters: [{ name: "MacWin 迁移包", extensions: ["habitpack"] }] }) : "preview.habitpack";
    if (!path && isTauri) return;
    setBusy(true);
    const importedPlan = await invokeOrPreview<ImportPlan>("import_habitpack", { path });
    const plan = normalizePlan(importedPlan);
    expandedPlanGroups = new Set();
    activeDetailModuleId = null;
    state = { ...state, plan, runtime: isTauri ? state.runtime : runtimeFor("macos"), view: "plan", busy: false, error: null };
  } catch (error) { recordError(error); state = { ...state, view: "home", busy: false, error: String(error) }; }
  render();
}

async function applyPlan(): Promise<void> {
  const plan = state.plan;
  if (!plan?.selected_module_ids.length) return;
  state = { ...state, view: "applying", busy: true, error: null }; render();
  try {
    const keyboard = plan.keyboard_compatibility;
    const selectedModuleIds = plan.selected_module_ids.filter((moduleId) => !hiddenPlanModuleIds.has(moduleId));
    const confirmedRaw = await invokeOrPreview<ImportPlan>("confirm_plan", { selected_module_ids: selectedModuleIds, keyboard_built_in: keyboard.built_in_enabled, keyboard_external: keyboard.external_enabled });
    const confirmed = normalizePlan({ ...confirmedRaw, selected_module_ids: selectedModuleIds });
    state = { ...state, plan: confirmed };
    const outcome = await invokeOrPreview<MigrationOutcome>("apply_plan", { keyboard_built_in: confirmed.keyboard_compatibility.built_in_enabled, keyboard_external: confirmed.keyboard_compatibility.external_enabled, selected_module_ids: confirmed.selected_module_ids, confirmation_token: confirmed.confirmation_token });
    state = { ...state, outcome, view: "complete", busy: false };
  } catch (error) { recordError(error); state = { ...state, view: "plan", busy: false, error: String(error) }; }
  render();
}

async function rollback(moduleId?: string): Promise<void> {
  state = { ...state, busy: true, error: null }; render();
  try { const outcome = await invokeOrPreview<MigrationOutcome>(moduleId ? "rollback_module" : "rollback_all", moduleId ? { module_id: moduleId } : undefined); state = { ...state, outcome, view: "complete", busy: false }; }
  catch (error) { recordError(error); state = { ...state, busy: false, error: String(error) }; }
  render();
}

async function runDiagnostics(): Promise<void> {
  state = { ...state, view: "diagnostics", busy: true, error: null }; render();
  try { const diagnostics = await invokeOrPreview<DeviceSelfCheck>("device_self_check"); state = { ...state, diagnostics, busy: false }; }
  catch (error) { recordError(error); state = { ...state, busy: false, error: String(error) }; }
  render();
}

async function deleteSnapshot(): Promise<void> {
  if (!isTauri || !state.diagnostics?.snapshot.available) return;
  if (!window.confirm("删除迁移前快照后，MacWin 将无法自动恢复这次迁移。确定删除吗？")) return;
  setBusy(true);
  try { const snapshot = await invoke<SnapshotStatus>("delete_snapshot", { request: { confirmed: true } }); state = { ...state, diagnostics: { ...state.diagnostics, snapshot }, busy: false }; }
  catch (error) { recordError(error); state = { ...state, busy: false, error: String(error) }; }
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
  window.history.replaceState({}, "", "?platform=macos&scenario=" + encodeURIComponent(state.preview.scenario));
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
  if (isTauri) { try { const receipt = await invoke<{ path: string; format: string }>("export_report", { format }); window.alert(`报告已保存：${receipt.path}`); } catch (error) { recordError(error); state = { ...state, error: String(error) }; render(); } return; }
  await navigator.clipboard?.writeText(text);
  window.alert(format === "html" ? "浏览器演示已复制报告文字；真实应用会保存 HTML 文件。" : "浏览器演示已复制脱敏报告文字；真实应用会保存 JSON 文件。");
}

async function checkUpdate(showResult: boolean): Promise<void> {
  if (!isTauri) { if (showResult) window.alert("浏览器演示不会联网检查更新。"); return; }
  try { const result = await invoke<{ status: string; version: string | null }>("check_update"); if (showResult && result.status === "available") { const confirmed = window.confirm(`发现新版本 ${result.version ?? ""}。MacWin 会先验证签名，再下载并安装。现在安装吗？`); if (confirmed) { const installed = await invoke<{ status: string; version: string | null }>("install_update", { request: { confirmed: true } }); window.alert(installed.status === "installed_restart_required" ? `版本 ${installed.version ?? ""} 已安装，重启 MacWin 后生效。` : "当前已是最新版本。"); } } else if (showResult) window.alert("当前已是最新版本。"); }
  catch (error) { if (showResult && !String(error).includes("UPDATE_NOT_CONFIGURED")) recordError(error); if (showResult) window.alert("暂时无法检查更新；离线时不影响本地迁移功能。"); }
}

async function loadRuntime(): Promise<void> {
  try { state = { ...state, runtime: await invokeOrPreview<RuntimeInfo>("runtime_info") }; }
  catch { state = { ...state, runtime: { platform: "unsupported", os_version: "无法读取", architecture: "unknown", supported: false, support_message: "无法确认当前设备是否受支持", alpha: false } }; }
  if (isTauri) void checkUpdate(false);
  render();
}

void loadRuntime();
