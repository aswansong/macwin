import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { initialState, progressFor, setView, statusLabel } from "./app-state";
import type {
  ExportReceipt,
  DeviceSelfCheck,
  GuideSection,
  ImportPlan,
  MigrationOutcome,
  ModuleResult,
  RuntimeInfo,
  View,
  WindowsScan,
} from "./types";
import "./styles.css";

const root = document.querySelector<HTMLDivElement>("#app") as HTMLDivElement | null;
if (!root) throw new Error("MacWin root not found");
const appRoot: HTMLDivElement = root;

const isTauri = Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
let state = initialState(!isTauri);

const previewRuntime: RuntimeInfo = {
  platform: "macos",
  os_version: "15.0（预览）",
  architecture: "arm64",
  supported: true,
  support_message: "Apple 芯片 Mac · macOS 15/26",
  alpha: false,
};

const previewScan: WindowsScan = {
  runtime: {
    platform: "windows",
    os_version: "Windows 11（预览）",
    architecture: "x86_64",
    supported: true,
    support_message: "Windows 10/11 x64",
    alpha: false,
  },
  default_browser: "Chrome",
  software: [
    { id: "chrome", name: "Google Chrome", version: "126", installed: true, is_default_browser: true, mac_name: "Google Chrome", official_url: "https://www.google.com/chrome/", export_supported: true, category: "browser", install_mode: "official_manual", requires_homebrew: false, version_policy: "最新稳定版" },
    { id: "vscode", name: "Visual Studio Code", version: "1.92", installed: true, is_default_browser: false, mac_name: "Visual Studio Code", official_url: "https://code.visualstudio.com/", export_supported: true, category: "developer", install_mode: "official_manual", requires_homebrew: false, version_policy: "主版本匹配" },
    { id: "libreoffice", name: "LibreOffice", version: "24.2", installed: false, is_default_browser: false, mac_name: "LibreOffice", official_url: "https://www.libreoffice.org/", export_supported: true, category: "office", install_mode: "official_manual", requires_homebrew: false, version_policy: "最新稳定版" },
  ],
  input_languages: ["中文（简体）", "English (US)"],
  keyboard_layouts: ["00000804", "00000409"],
  keyboard_repeat_speed: 24,
  keyboard_repeat_delay: 1,
  mouse_scroll_direction: "windows_style",
  trackpad_scroll_direction: "windows_style",
  scanned_at: "2026-08-02T10:00:00Z",
};

const previewPlan: ImportPlan = {
  package_name: "windows-habits.habitpack",
  source_summary: "Windows 11 x64 → Apple 芯片 Mac",
  created_at: "2026-08-02T10:00:00Z",
  guide_requested: true,
  contains_secrets: false,
  software: previewScan.software,
  items: [
    { module_id: "finder_extensions", title: "显示文件扩展名", current_value: "隐藏（当前）", target_value: "显示", reason: "Windows 用户通常直接看到 .docx、.xlsx 等扩展名。", benefit: "打开文件时更容易确认真实类型。", verification: "重新读取 Finder 偏好", recovery: "恢复到迁移前值", requires_admin: false },
    { module_id: "keyboard_repeat", title: "键盘重复速度", current_value: "读取 Mac 当前值", target_value: "按 Windows 重复速度匹配", reason: "保留你熟悉的按键响应节奏。", benefit: "长按删除和移动光标时更接近原来的手感。", verification: "重新读取系统键盘偏好", recovery: "恢复迁移前值", requires_admin: false },
    { module_id: "keyboard_compatibility", title: "选择性 Ctrl 兼容", current_value: "未启用", target_value: "普通应用 Ctrl 组合转换", reason: "降低从 Windows 迁移后的快捷键落差。", benefit: "终端、远程桌面和虚拟机仍保留真实 Ctrl。", verification: "验证 MacWin 自己的规则", recovery: "只移除 MacWin 自己的规则", requires_admin: false },
  ],
  keyboard_compatibility: {
    built_in_enabled: true,
    external_enabled: true,
    devices: [
      { name: "MacBook 内置键盘（演示）", kind: "built_in", recognized: true, redacted_id: "kb-demo-01" },
      { name: "Windows 外接键盘（演示）", kind: "external", recognized: true, redacted_id: "kb-demo-02" },
    ],
    shortcuts: ["Ctrl+C → Command+C", "Ctrl+V → Command+V", "Ctrl+Z → Command+Z", "Ctrl+Y → Command+Y"],
    exceptions: ["Terminal", "远程桌面", "Parallels / VMware / UTM", "VS Code"],
    karabiner: { installed: false, version: null, config_present: false, permission: "演示数据；实际 Mac 上按系统提示授权", official_url: "https://karabiner-elements.pqrs.org/" },
    recovery: "只移除 MacWin 自己的规则",
  },
  confirmation_token: "preview-plan-confirmed-v1",
  pointer: { mouse_direction: "windows_style", trackpad_direction: "windows_style" },
  pointer_support: { linear_mouse_installed: false, linear_mouse_version: null, native_independent: false, permission: "浏览器演示数据；实际 Mac 按系统要求检查", official_url: "https://linearmouse.app/" },
  selected_module_ids: ["finder_extensions", "keyboard_repeat", "keyboard_compatibility"],
};

const previewDiagnostics: DeviceSelfCheck = {
  app_version: "1.0.0-rc.1",
  format_version: "1.0.0",
  runtime: previewRuntime,
  keyboard_devices: previewPlan.keyboard_compatibility.devices,
  karabiner: previewPlan.keyboard_compatibility.karabiner,
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
  };
  return messages[code] ?? (code || "发生未知错误，请查看报告中的错误码。");
}

function invokeOrPreview<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (isTauri) return invoke<T>(command, args);
  if (command === "runtime_info") return Promise.resolve(previewRuntime as T);
  if (command === "scan_windows") return Promise.resolve(previewScan as T);
  if (command === "import_habitpack") return Promise.resolve(previewPlan as T);
  if (command === "confirm_plan") return Promise.resolve({ ...previewPlan, selected_module_ids: (args?.selected_module_ids as string[] | undefined) ?? previewPlan.selected_module_ids } as T);
  if (command === "export_habitpack") return Promise.resolve({ path: "浏览器预览，不会写入文件", package_bytes: 0, modules: ["keyboard"], contains_secrets: false, validated: true } as T);
  if (command === "apply_plan") return Promise.resolve(previewOutcome() as T);
  if (command === "rollback_module") return Promise.resolve(previewRollback(args?.module_id as string) as T);
  if (command === "rollback_all") return Promise.resolve(previewRollback("all") as T);
  if (command === "device_self_check") return Promise.resolve(previewDiagnostics as T);
  if (command === "export_report") return Promise.resolve({ path: "浏览器预览，不会写入文件", format: args?.format ?? "html", bytes: 0 } as T);
  return Promise.reject(new Error("浏览器预览不支持此操作"));
}

function previewOutcome(): MigrationOutcome {
  return {
    outcome: "completed",
    completed_at: "2026-08-02T10:01:00Z",
    snapshot_available: true,
    results: [
      { module_id: "finder_extensions", title: "显示文件扩展名", before: "隐藏", after: "显示", reason: "让文件类型一眼可见。", benefit: "减少打开错误文件的机会。", recovery: "可恢复到迁移前值", status: "applied_verified", error_code: null },
      { module_id: "keyboard_repeat", title: "键盘重复速度", before: "Mac 当前值", after: "已匹配 Windows 节奏", reason: "减少换机后的手感差异。", benefit: "删除和移动文字更熟悉。", recovery: "可恢复到迁移前值", status: "applied_verified", error_code: null },
    ],
    guide_sections: guideSections(true),
  };
}

function previewRollback(moduleId: string): MigrationOutcome {
  const outcome = previewOutcome();
  outcome.outcome = "restored";
  outcome.results = outcome.results.map((result) => result.module_id === moduleId ? { ...result, after: result.before, status: "rolled_back_verified" as const } : result);
  return outcome;
}

function guideSections(keyboard: boolean): GuideSection[] {
  const sections: GuideSection[] = [
    { title: "Command、Option 和 Fn", body: "Command 是 Mac 最常用的编辑修饰键；Option 常表示替代操作或特殊字符；Fn 用于功能键和系统功能。MacWin 不会全局交换它们。" },
    { title: "Mac 适合你的地方", body: "如果你经常外出，Apple 芯片 MacBook 的能效、触控板和睡眠唤醒整合可能更省心。轻量 AI 编程也可以利用 macOS 的 Unix 工具链。" },
    { title: "Windows 仍然更合适的地方", body: "某些企业系统、专用 Windows 软件、游戏和特殊外设仍可能更适合留在 Windows；这不是一次迁移就能解决的差异。" },
  ];
  if (keyboard) sections.unshift({ title: "键盘重复速度", body: "MacWin 只调整了按键重复节奏，没有交换 Ctrl 和 Command，也没有改变终端、远程桌面或虚拟机中的真实 Ctrl。" });
  return sections;
}

function setBusy(busy: boolean, error: string | null = null): void {
  state = { ...state, busy, error };
  render();
}

function updateView(view: View): void {
  state = setView(state, view);
  render();
}

function renderProgress(): string {
  const progress = progressFor(state.view);
  const side = progress.side;
  const label = side === "windows" ? "Windows 端" : side === "mac" ? "Mac 端" : "准备开始";
  return `<div class="journey" aria-label="当前流程：${escapeHtml(label)}"><span class="journey-node windows ${side === "windows" ? "active" : ""}">W</span><span class="journey-line"></span><span class="journey-node mac ${side === "mac" ? "active" : ""}">M</span><span class="journey-label">${escapeHtml(label)} · ${progress.step ? `第 ${progress.step} 步` : "两台电脑，一条清晰路径"}</span></div>`;
}

function renderShell(content: string, eyebrow: string, title: string, description = ""): string {
  const platform = state.runtime?.platform === "windows" ? "Windows → Mac" : state.runtime?.platform === "macos" ? "Mac 目标端" : "离线、本地、可恢复";
  return `<div class="app-shell">
    <header class="topbar"><button class="brand-button" data-action="home" aria-label="回到首页"><span class="brand-mark">MW</span><span><strong>MacWin</strong><small>把 Windows 习惯带到 Mac</small></span></button><span class="alpha-pill">v1.0 · ${escapeHtml(platform)}</span></header>
    <main class="main-content"><div class="content-column">${renderProgress()}<div class="eyebrow">${escapeHtml(eyebrow)}</div><h1>${escapeHtml(title)}</h1>${description ? `<p class="lead">${escapeHtml(description)}</p>` : ""}${content}</div></main>
    <footer class="privacy-footer"><span class="privacy-dot"></span><span>${state.webPreview ? "浏览器演示数据 · 不会修改系统" : "全程本地处理 · 不搬个人文件 · 不上传扫描结果"}</span><span class="footer-spacer"></span><button class="text-button" data-action="diagnostics">设备自检</button><button class="text-button" data-action="check-update">检查更新</button><a class="text-button" href="https://github.com/aswansong/macwin/issues" target="_blank" rel="noreferrer">反馈问题 ↗</a><button class="text-button" data-action="alpha-info">支持范围与隐私</button></footer>
  </div>`;
}

function renderHome(): string {
  const runtime = state.runtime;
  const runtimeCopy = runtime ? `${runtime.os_version} · ${runtime.architecture}` : "正在读取当前平台…";
  const supported = runtime?.supported === true;
  const primary = runtime?.platform === "windows"
    ? `<button class="entry-button blue" data-action="start-scan"><span class="entry-icon">⌁</span><span><strong>开始检测</strong><small>读取白名单习惯，导出 .habitpack</small></span><span class="entry-arrow">↗</span></button>`
    : runtime?.platform === "macos"
      ? `<button class="entry-button coral" data-action="import"><span class="entry-icon">↘</span><span><strong>导入迁移包</strong><small>先看计划，再应用到这台 Mac</small></span><span class="entry-arrow">↗</span></button>`
      : `<div class="notice warning"><span>!</span><span>当前设备不在正式支持范围内，MacWin 不会修改系统。</span></div>`;
  return renderShell(`<section class="home-grid">
    <div class="home-intro"><div class="home-spark">W → M</div><p class="home-kicker">少一点重新适应，多一点直接开始</p><p>MacWin 只搬走你每天会用到的习惯和环境。你会在任何设置改变前看到计划，也能随时恢复。</p><div class="support-line"><span class="status-mark ${runtime?.supported === false ? "bad" : "good"}"></span><span>${escapeHtml(runtime?.support_message ?? "检查支持的 Windows / Mac 平台")}</span><small>${escapeHtml(runtimeCopy)}</small></div></div>
    <div class="entry-stack">${supported ? primary : `<div class="entry-secondary">帮助与支持：请确认你使用的是 Windows 10/11 x64 或 Apple 芯片 macOS 15/26。</div>`}</div>
  </section><section class="home-note"><strong>这不是整机搬家。</strong><span>不读取文件、浏览记录、密码、Cookie 或登录状态。</span></section>`, "欢迎使用", "把熟悉的节奏带到 Mac", "Windows 端导出，Mac 端接住。MacWin 会把复杂的系统差异压缩成几步清楚的选择。");
}

function renderScanning(): string {
  return renderShell(`<div class="loading-block"><div class="loader-orbit"><span></span></div><p class="loading-title">正在读取白名单设置</p><p class="muted">只读取系统版本、输入设置和已知软件。不会访问个人文件。</p><div class="scan-steps"><span class="done">✓ 平台兼容性</span><span class="active">● 输入与键盘节奏</span><span>○ 已知软件</span></div></div>`, "Windows 端 · 1 / 3", "先看看你的 Windows", "扫描只在本机进行，默认不需要管理员权限。");
}

function renderScan(): string {
  const scan = state.scan;
  if (!scan) return renderHome();
  const browser = scan.default_browser ? `<span class="inline-value">${escapeHtml(scan.default_browser)}</span>` : "未识别";
  const software = scan.software.filter((item) => item.installed).map((item) => `<label class="choice-row"><input type="checkbox" data-software="${escapeHtml(item.id)}" ${state.selection.software_ids.includes(item.id) ? "checked" : ""} ${item.export_supported ? "" : "disabled"}/><span><strong>${escapeHtml(item.name)}</strong><small>${item.export_supported ? `只迁移安装选择 · ${escapeHtml(item.version_policy)}` : "Mac 端提供官方入口"}</small></span></label>`).join("");
  return renderShell(`<section class="scan-summary"><div class="summary-row"><span>默认浏览器</span>${browser}</div><div class="summary-row"><span>输入语言</span><span class="inline-value">${escapeHtml(scan.input_languages.join(" · "))}</span></div><div class="summary-row"><span>键盘节奏</span><span class="inline-value">速度 ${scan.keyboard_repeat_speed} · 延迟 ${scan.keyboard_repeat_delay}</span></div></section><section class="selection-section"><div class="section-heading"><span>输入设备</span><small>键盘和滚动方向</small></div><label class="choice-row primary"><input type="checkbox" data-keyboard ${state.selection.include_keyboard ? "checked" : ""}/><span><strong>键盘重复速度与选择性 Ctrl</strong><small>保留节奏；普通应用支持 Ctrl+C/V/X/Z，不交换 Command</small></span></label><label class="choice-row primary"><input type="checkbox" data-pointer ${state.selection.include_pointer ? "checked" : ""}/><span><strong>鼠标与触控板滚动方向</strong><small>鼠标与触控板分别记录；Mac 端按设备验证，不会伪报成功</small></span></label><div class="section-heading compact"><span>软件与开发</span><small>只匹配安装选择，不搬运数据</small></div>${software || `<p class="empty-line">没有发现白名单软件</p>`}<div class="section-heading compact"><span>系统设置</span><small>安全、可恢复</small></div><label class="choice-row primary"><input type="checkbox" data-guide ${state.selection.guide_requested ? "checked" : ""}/><span><strong>个性化 Mac 使用指南</strong><small>解释 Command、Option、Fn、滚动方向和这次实际变化</small></span></label><div class="choice-row muted-row"><span><strong>Wi‑Fi</strong><small>第一版按网络逐项确认；密码始终单独提示风险</small></span></div></section><div class="notice soft"><span>i</span><span>浏览器书签、历史、密码、Cookie 和登录状态不会被读取。</span></div><div class="action-row"><button class="secondary-button" data-action="home">返回</button><button class="primary-button" data-action="export">生成迁移包 <span>→</span></button></div>`, "Windows 端 · 2 / 3", "发现了这些", "只勾选你真正想带走的习惯，每一行就是一个明确的变化。");
}

function renderExported(): string {
  const receipt = state.receipt;
  return renderShell(`<div class="success-banner"><span class="success-icon">✓</span><div><strong>迁移包已保存</strong><p>${escapeHtml(receipt?.path ?? "本地文件")}</p></div></div><section class="handoff"><div class="handoff-endpoint"><span class="endpoint-dot blue-dot">W</span><strong>Windows</strong><small>导出完成</small></div><span class="handoff-arrow">→</span><div class="handoff-endpoint"><span class="endpoint-dot coral-dot">M</span><strong>Mac</strong><small>把 .habitpack 带过去</small></div></section><div class="notice warning"><span>!</span><span>请用 U 盘或你信任的本地方式把这个文件带到 Mac。Mac 导入成功后，可以删除不再需要的副本。</span></div><div class="action-row"><button class="secondary-button" data-action="home">回到首页</button><button class="primary-button" data-action="home">稍后在 Mac 导入 <span>→</span></button></div>`, "Windows 端 · 3 / 3", "准备交给 Mac", "文件已经在本机保存。MacWin 不会替你上传或同步它。");
}

function renderPlan(): string {
  const plan = state.plan;
  if (!plan) return renderHome();
  const items = plan.items.map((item) => `<label class="plan-row"><input class="plan-check" type="checkbox" data-module="${escapeHtml(item.module_id)}" ${plan.selected_module_ids.includes(item.module_id) ? "checked" : ""}/><span class="plan-main"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.current_value)} <b>→</b> ${escapeHtml(item.target_value)}</span><small>${escapeHtml(item.benefit)} · ${escapeHtml(item.recovery)}</small></span><span class="plan-tag">${item.requires_admin ? "需要授权" : "可恢复"}</span></label>`).join("");
  const software = plan.software.filter((item) => item.installed).map((item) => `<div class="software-line"><span>${escapeHtml(item.name)} · ${escapeHtml(item.version_policy)}</span><span>${item.install_mode === "official_manual" ? "需在线确认" : "可验证自动安装"}</span><a href="${escapeHtml(item.official_url)}" target="_blank" rel="noreferrer">官方入口 ↗</a></div>`).join("");
  const keyboard = plan.keyboard_compatibility;
  const devices = keyboard.devices.length ? keyboard.devices.map((device) => `<div class="device-line"><label><input type="checkbox" data-keyboard-kind="${device.kind}" ${device.kind === "built_in" ? (keyboard.built_in_enabled ? "checked" : "") : (keyboard.external_enabled ? "checked" : "")} ${device.recognized ? "" : "disabled"}/><span><strong>${escapeHtml(device.name)}</strong><small>${device.kind === "built_in" ? "内置键盘" : "外接键盘"} · ${device.recognized ? "已识别（仅显示脱敏标识）" : "未能安全识别，默认不应用"}</small></span></label></div>`).join("") : `<p class="empty-line">未发现可安全识别的键盘；不会猜测设备。</p>`;
  const karabiner = keyboard.karabiner.installed ? `已检测到 Karabiner-Elements${keyboard.karabiner.version ? ` ${escapeHtml(keyboard.karabiner.version)}` : ""} · 应用时只合并 MacWin 规则` : `<span>未检测到 Karabiner-Elements · 应用将降级为“需要手动完成”</span> <a href="${escapeHtml(keyboard.karabiner.official_url)}" target="_blank" rel="noreferrer">官方入口 ↗</a>`;
  const pointer = plan.pointer ? `<section class="compat-box pointer-box"><div class="section-heading compact"><span>鼠标与触控板</span><small>两个设备独立显示</small></div><p class="compat-copy">鼠标：${escapeHtml(plan.pointer.mouse_direction ?? "未选择")} · 触控板：${escapeHtml(plan.pointer.trackpad_direction ?? "未选择")}</p><small>${escapeHtml(plan.pointer_support.permission)}</small>${plan.pointer_support.linear_mouse_installed ? `<div class="software-line"><span>已检测到 LinearMouse${plan.pointer_support.linear_mouse_version ? ` ${escapeHtml(plan.pointer_support.linear_mouse_version)}` : ""}</span><a href="${escapeHtml(plan.pointer_support.official_url)}" target="_blank" rel="noreferrer">官方说明 ↗</a></div>` : `<div class="software-line"><span>原生接口无法独立改变两个设备</span><a href="${escapeHtml(plan.pointer_support.official_url)}" target="_blank" rel="noreferrer">官方入口 ↗</a></div>`}</section>` : "";
  return renderShell(`<div class="plan-lock"><span class="lock-icon">◎</span><span>应用前必须确认这份计划</span></div><section class="plan-list">${items}</section><section class="compat-box"><div class="section-heading compact"><span>选择性 Ctrl 兼容</span><small>不做全局 Ctrl ↔ Command 交换</small></div><p class="compat-copy">普通应用中的 Ctrl+C/V/X/Z/Y/A/S/F/P/N/O/W/T/L/R 会转换为对应 Command；Terminal、远程桌面、虚拟机和 VS Code 集成终端保留真实 Ctrl。</p>${devices}<div class="compat-tool"><strong>Karabiner-Elements</strong><span>${karabiner}</span><small>${escapeHtml(keyboard.karabiner.permission)} · ${escapeHtml(keyboard.recovery)}</small></div></section>${pointer}${software ? `<section class="software-box"><div class="section-heading compact"><span>软件与开发</span><small>只提供可验证的官方入口</small></div>${software}</section>` : ""}<div class="notice soft"><span>i</span><span>计划确认后才会保存快照并应用；每个模块都会独立验证，拒绝权限不会影响不相关模块。</span></div><div class="action-row"><button class="secondary-button" data-action="home">取消</button><button class="primary-button" data-action="apply">确认并应用 <span>→</span></button></div>`, "Mac 端 · 2 / 3", "先看计划，再让它发生", `${escapeHtml(plan.source_summary)} · ${escapeHtml(plan.package_name)} · 迁移前快照会先保存`);
}

function renderApplying(): string {
  return renderShell(`<div class="loading-block"><div class="loader-orbit coral"><span></span></div><p class="loading-title">正在保存快照并应用设置</p><p class="muted">先保存迁移前状态，再逐项验证结果。请不要关闭 MacWin。</p><div class="scan-steps"><span class="done">✓ 迁移前快照</span><span class="active">● Finder 显示扩展名</span><span>○ 键盘重复速度</span></div></div>`, "Mac 端 · 2 / 3", "正在把计划变成实际变化", "每个设置都会在写入后重新读取确认。");
}

function resultRow(result: ModuleResult): string {
  return `<article class="result-row"><span class="result-mark ${result.status === "applied_verified" || result.status === "rolled_back_verified" ? "good" : "bad"}">${result.status === "applied_verified" || result.status === "rolled_back_verified" ? "✓" : "!"}</span><div><strong>${escapeHtml(result.title)}</strong><span>${escapeHtml(result.before)} <b>→</b> ${escapeHtml(result.after)}</span><small>${escapeHtml(statusLabel(result.status))} · ${escapeHtml(result.benefit)}</small></div></article>`;
}

function renderComplete(): string {
  const outcome = state.outcome;
  if (!outcome) return renderHome();
  const done = outcome.outcome === "completed";
  return renderShell(`<div class="completion-heading"><span class="completion-orb ${done ? "green" : "amber"}">${done ? "✓" : "!"}</span><div><p class="eyebrow">${done ? "迁移完成" : "部分完成"}</p><h2>${done ? "Mac 已经更像你的电脑了" : "有些项目需要你再看一眼"}</h2><p class="muted">设置已逐项验证。快照仍保留，随时可以恢复。</p></div></div><section class="result-list">${outcome.results.map(resultRow).join("")}</section><div class="action-grid"><button class="tile-button" data-action="report"><strong>查看变更报告</strong><small>之前、现在、原因和恢复方式</small></button><button class="tile-button" data-action="guide"><strong>打开我的 Mac 指南</strong><small>只解释这次真正发生的变化</small></button><button class="tile-button" data-action="restore"><strong>恢复一个设置</strong><small>回到迁移前状态</small></button></div><div class="action-row"><button class="secondary-button" data-action="home">回到主页</button></div>`, "Mac 端 · 3 / 3", done ? "好了，欢迎来到 Mac" : "完成了一部分", "MacWin 不会常驻后台。你可以关闭它，快照会留在应用之外。");
}

function renderReport(): string {
  const outcome = state.outcome;
  if (!outcome) return renderHome();
  return renderShell(`<section class="report-sheet"><div class="report-meta"><span>MacWin v1.0.0</span><span>${escapeHtml(outcome.completed_at)}</span></div><h2>本次变更</h2>${outcome.results.map((result) => `<div class="report-line"><strong>${escapeHtml(result.title)}</strong><span>${escapeHtml(result.before)} → ${escapeHtml(result.after)}</span><small>原因：${escapeHtml(result.reason)}　收益：${escapeHtml(result.benefit)}　状态：${escapeHtml(statusLabel(result.status))}${result.error_code ? ` · 错误码 ${escapeHtml(result.error_code)}` : ""}</small></div>`).join("")}<div class="report-footnote">快照：${outcome.snapshot_available ? "已保存，可按模块恢复" : "未找到"} · 报告不包含 Wi‑Fi、账号、路径或个人文件。</div></section><div class="action-row"><button class="secondary-button" data-action="complete">返回结果</button><button class="primary-button" data-action="download-report">保存 HTML 报告 <span>↗</span></button><button class="secondary-button" data-action="download-report-json">保存脱敏 JSON</button></div>`, "迁移后主页 · 报告", "你可以清楚看到改了什么", "这份报告只记录用户能理解的变化，不展示原始系统值。");
}

function renderDiagnostics(): string {
  const diagnostics = state.diagnostics;
  if (!diagnostics) return renderShell(`<div class="loading-block"><p class="loading-title">正在生成设备自检</p></div>`, "设备自检", "读取本机兼容状态", "只读取本机信息，不上传。",);
  const devices = diagnostics.keyboard_devices.length ? diagnostics.keyboard_devices.map((device) => `<div class="device-line"><strong>${escapeHtml(device.name)}</strong><small>${device.kind === "built_in" ? "内置键盘" : "外接键盘"} · 脱敏标识 ${escapeHtml(device.redacted_id)} · ${device.recognized ? "可安全匹配" : "不会猜测"}</small></div>`).join("") : `<p class="empty-line">未发现可安全识别的键盘</p>`;
  const snapshot = diagnostics.snapshot.available
    ? `已保存${diagnostics.snapshot.created_at ? ` · ${escapeHtml(diagnostics.snapshot.created_at)}` : ""}`
    : diagnostics.snapshot.error
      ? `不可用 · ${escapeHtml(friendlyError(diagnostics.snapshot.error))}`
      : "未找到";
  return renderShell(`<section class="diagnostics-sheet"><div class="diagnostic-grid"><div><span>应用</span><strong>${escapeHtml(diagnostics.app_version)}</strong></div><div><span>规则格式</span><strong>${escapeHtml(diagnostics.format_version)}</strong></div><div><span>系统</span><strong>${escapeHtml(diagnostics.runtime.os_version)} · ${escapeHtml(diagnostics.runtime.architecture)}</strong></div><div><span>Karabiner</span><strong>${diagnostics.karabiner.installed ? "已检测到" : "未检测到"}</strong><small>${escapeHtml(diagnostics.karabiner.permission)}</small></div><div><span>迁移前快照</span><strong>${snapshot}</strong><small>卸载应用不会自动删除</small></div></div><h3>键盘设备</h3>${devices}<h3>最近模块</h3><p class="muted">${diagnostics.recent_modules.length ? escapeHtml(diagnostics.recent_modules.join(" · ")) : "暂无执行记录"}</p><div class="notice soft"><span>i</span><span>${escapeHtml(diagnostics.privacy_note)}</span></div></section><div class="action-row"><button class="secondary-button" data-action="home">返回首页</button></div>`, "设备自检", "这台 Mac 目前能安全做什么", "结果只在本机生成；不会显示用户名、完整路径、序列号或原始配置。");
}

function renderGuide(): string {
  const sections = state.outcome?.guide_sections ?? guideSections(true);
  return renderShell(`<section class="guide-list">${sections.map((section) => `<article><span class="guide-number">${String(sections.indexOf(section) + 1).padStart(2, "0")}</span><div><h3>${escapeHtml(section.title)}</h3><p>${escapeHtml(section.body)}</p></div></article>`).join("")}</section><div class="action-row"><button class="secondary-button" data-action="complete">返回结果</button></div>`, "迁移后主页 · 指南", "你的 Mac 使用指南", "写给刚从 Windows 过来的你，只保留和这次选择有关的内容。");
}

function renderRestore(): string {
  const results = state.outcome?.results ?? [];
  return renderShell(`<section class="restore-list">${results.map((result) => `<div class="restore-row"><div><strong>${escapeHtml(result.title)}</strong><small>恢复到：${escapeHtml(result.before)}</small></div><button class="small-button" data-rollback="${escapeHtml(result.module_id)}">恢复</button></div>`).join("")}</section><div class="notice soft"><span>i</span><span>恢复只针对这次迁移保存的原值，不会恢复出厂，也不会影响其他设置。</span></div><div class="action-row"><button class="secondary-button" data-action="complete">暂不恢复</button><button class="primary-button" data-action="rollback-all">全部恢复 <span>→</span></button></div>`, "迁移后主页 · 恢复", "想回到迁移前？", "选择一个设置即可单独恢复，其他设置不会被碰到。");
}

function render(): void {
  const content = state.view === "home" ? renderHome() : state.view === "scanning" ? renderScanning() : state.view === "scan" ? renderScan() : state.view === "exported" ? renderExported() : state.view === "plan" ? renderPlan() : state.view === "applying" ? renderApplying() : state.view === "complete" ? renderComplete() : state.view === "report" ? renderReport() : state.view === "guide" ? renderGuide() : state.view === "restore" ? renderRestore() : renderDiagnostics();
  appRoot.innerHTML = state.busy ? `${content}<div class="busy-overlay" role="status">正在处理…</div>` : content;
  bindEvents();
}

function recordError(error: unknown): void {
  if (!isTauri) return;
  const raw = String(error ?? "UNKNOWN_ERROR").toUpperCase();
  const code = raw.match(/[A-Z][A-Z0-9_-]{2,63}/)?.[0] ?? "UNKNOWN_ERROR";
  void invoke("record_error", { input: { code } }).catch(() => undefined);
}

async function runScan(): Promise<void> {
  if (state.runtime?.platform !== "windows" || state.runtime.supported !== true) {
    recordError("UNSUPPORTED_PLATFORM");
    state = { ...state, error: "UNSUPPORTED_PLATFORM" };
    render();
    return;
  }
  state = { ...state, view: "scanning", busy: true, error: null };
  render();
  try {
    const scan = await invokeOrPreview<WindowsScan>("scan_windows");
    state = { ...state, scan, runtime: scan.runtime, view: "scan", busy: false };
  } catch (error) {
    recordError(error);
    state = { ...state, view: "home", busy: false, error: String(error) };
  }
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
  if (state.runtime?.platform !== "macos" || state.runtime.supported !== true) {
    recordError("UNSUPPORTED_PLATFORM");
    state = { ...state, error: "UNSUPPORTED_PLATFORM" };
    render();
    return;
  }
  try {
    const path = isTauri ? await open({ multiple: false, directory: false, filters: [{ name: "MacWin 迁移包", extensions: ["habitpack"] }] }) : "preview.habitpack";
    if (!path && isTauri) return;
    setBusy(true);
    const plan = await invokeOrPreview<ImportPlan>("import_habitpack", { path });
    state = { ...state, plan, runtime: isTauri ? state.runtime : previewRuntime, view: "plan", busy: false };
  } catch (error) { recordError(error); state = { ...state, busy: false, error: String(error) }; }
  render();
}

async function applyPlan(): Promise<void> {
  state = { ...state, view: "applying", busy: true, error: null };
  render();
  try {
    const keyboard = state.plan?.keyboard_compatibility;
    const selected_module_ids = state.plan?.selected_module_ids ?? [];
    const confirmed = await invokeOrPreview<ImportPlan>("confirm_plan", { selected_module_ids, keyboard_built_in: keyboard?.built_in_enabled ?? false, keyboard_external: keyboard?.external_enabled ?? false });
    state = { ...state, plan: confirmed };
    const outcome = await invokeOrPreview<MigrationOutcome>("apply_plan", { keyboard_built_in: confirmed.keyboard_compatibility.built_in_enabled, keyboard_external: confirmed.keyboard_compatibility.external_enabled, selected_module_ids: confirmed.selected_module_ids, confirmation_token: confirmed.confirmation_token });
    state = { ...state, outcome, view: "complete", busy: false };
  } catch (error) { recordError(error); state = { ...state, view: "plan", busy: false, error: String(error) }; }
  render();
}

async function rollback(moduleId?: string): Promise<void> {
  state = { ...state, busy: true, error: null };
  render();
  try {
    const outcome = await invokeOrPreview<MigrationOutcome>(moduleId ? "rollback_module" : "rollback_all", moduleId ? { module_id: moduleId } : undefined);
    state = { ...state, outcome, view: "complete", busy: false };
  } catch (error) { recordError(error); state = { ...state, busy: false, error: String(error) }; }
  render();
}

async function runDiagnostics(): Promise<void> {
  state = { ...state, view: "diagnostics", busy: true, error: null };
  render();
  try {
    const diagnostics = await invokeOrPreview<DeviceSelfCheck>("device_self_check");
    state = { ...state, diagnostics, view: "diagnostics", busy: false };
  } catch (error) { recordError(error); state = { ...state, busy: false, error: String(error) }; }
  render();
}

function bindEvents(): void {
  appRoot.querySelectorAll<HTMLElement>("[data-action]").forEach((element) => element.addEventListener("click", () => {
    const action = element.dataset.action;
    if (action === "home") { state = initialState(!isTauri); void loadRuntime(); }
    else if (action === "start-scan") void runScan();
    else if (action === "import") void importPackage();
    else if (action === "export") void exportPackage();
    else if (action === "apply") void applyPlan();
    else if (action === "complete") updateView("complete");
    else if (action === "report") updateView("report");
    else if (action === "guide") updateView("guide");
    else if (action === "restore") updateView("restore");
    else if (action === "rollback-all") void rollback();
    else if (action === "diagnostics") void runDiagnostics();
    else if (action === "check-update") void checkUpdate(true);
    else if (action === "alpha-info") window.alert("MacWin 只迁移白名单习惯与环境，不读取个人文件、浏览器历史/密码/Cookie、账号、Token 或项目代码；除版本检查外不联网。所有真实变化前必须确认计划，快照保留到你主动删除。");
    else if (action === "download-report") void saveReport("html");
    else if (action === "download-report-json") void saveReport("json");
  }));
  appRoot.querySelectorAll<HTMLInputElement>("input[data-keyboard]").forEach((input) => input.addEventListener("change", () => { state = { ...state, selection: { ...state.selection, include_keyboard: input.checked } }; }));
  appRoot.querySelectorAll<HTMLInputElement>("input[data-pointer]").forEach((input) => input.addEventListener("change", () => { state = { ...state, selection: { ...state.selection, include_pointer: input.checked } }; }));
  appRoot.querySelectorAll<HTMLInputElement>("input[data-guide]").forEach((input) => input.addEventListener("change", () => { state = { ...state, selection: { ...state.selection, guide_requested: input.checked } }; }));
  appRoot.querySelectorAll<HTMLInputElement>("input[data-keyboard-kind]").forEach((input) => input.addEventListener("change", () => {
    const kind = input.dataset.keyboardKind;
    if (!state.plan?.keyboard_compatibility || (kind !== "built_in" && kind !== "external")) return;
    const keyboard = { ...state.plan.keyboard_compatibility, ...(kind === "built_in" ? { built_in_enabled: input.checked } : { external_enabled: input.checked }) };
    state = { ...state, plan: { ...state.plan, keyboard_compatibility: keyboard } };
  }));
  appRoot.querySelectorAll<HTMLInputElement>("input[data-module]").forEach((input) => input.addEventListener("change", () => {
    if (!state.plan) return;
    const moduleId = input.dataset.module ?? "";
    const selected = input.checked ? [...state.plan.selected_module_ids, moduleId] : state.plan.selected_module_ids.filter((value) => value !== moduleId);
    state = { ...state, plan: { ...state.plan, selected_module_ids: [...new Set(selected)] } };
    render();
  }));
  appRoot.querySelectorAll<HTMLInputElement>("input[data-software]").forEach((input) => input.addEventListener("change", () => { const id = input.dataset.software ?? ""; const ids = input.checked ? [...state.selection.software_ids, id] : state.selection.software_ids.filter((value) => value !== id); state = { ...state, selection: { ...state.selection, software_ids: ids } }; }));
  appRoot.querySelectorAll<HTMLElement>("[data-rollback]").forEach((element) => element.addEventListener("click", () => void rollback(element.dataset.rollback)));
  if (state.error) { const error = document.createElement("div"); error.className = "error-toast"; error.textContent = `没有完成：${friendlyError(state.error)}`; appRoot.append(error); }
}

async function saveReport(format: "html" | "json"): Promise<void> {
  const text = state.outcome?.results.map((result) => `${result.title}：${result.before} → ${result.after}（${statusLabel(result.status)}）`).join("\n") ?? "";
  if (isTauri) {
    try {
      const receipt = await invoke<{ path: string; format: string }>("export_report", { format });
      window.alert(`报告已保存：${receipt.path}`);
    } catch (error) {
      recordError(error);
      state = { ...state, error: String(error) };
      render();
    }
    return;
  }
  await navigator.clipboard?.writeText(text);
  window.alert(format === "html" ? "浏览器演示已复制报告文字；真实应用会保存 HTML 文件。" : "浏览器演示已复制脱敏报告文字；真实应用会保存 JSON 文件。");
}

async function checkUpdate(showResult: boolean): Promise<void> {
  if (!isTauri) {
    if (showResult) window.alert("浏览器演示不会联网检查更新。");
    return;
  }
  try {
    const result = await invoke<{ status: string; version: string | null }>("check_update");
    if (showResult) window.alert(result.status === "available" ? `发现新版本 ${result.version}` : "当前已是最新版本。");
  } catch (error) {
    if (showResult && !String(error).includes("UPDATE_NOT_CONFIGURED")) recordError(error);
    if (showResult) window.alert("暂时无法检查更新；离线时不影响本地迁移功能。");
  }
}

async function loadRuntime(): Promise<void> {
  try { state = { ...state, runtime: await invokeOrPreview<RuntimeInfo>("runtime_info") }; } catch { state = { ...state, runtime: { platform: "unsupported", os_version: "无法读取", architecture: "unknown", supported: false, support_message: "无法确认当前设备是否受支持", alpha: false } }; }
  if (isTauri) void checkUpdate(false);
  render();
}

void loadRuntime();
