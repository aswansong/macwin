import type { AppState, View } from "./types";

export const initialState = (webPreview: boolean): AppState => ({
  view: "home",
  runtime: null,
  scan: null,
  plan: null,
  outcome: null,
  receipt: null,
  diagnostics: null,
  busy: false,
  error: null,
  webPreview,
  preview: {
    scenario: "normal",
    wifiPasswordSelected: false,
    linearMouseConfirmed: false,
  },
  selection: {
    include_keyboard: true,
    include_pointer: true,
    software_ids: [],
    guide_requested: true,
  },
});

export function canNavigate(state: AppState, next: View): boolean {
  if (next === "home") return true;
  if (next === "diagnostics") return true;
  if (next === "scan") return Boolean(state.scan);
  if (next === "exported") return Boolean(state.receipt);
  if (next === "export") return Boolean(state.scan);
  if (next === "plan") return Boolean(state.plan);
  if (["complete", "report", "guide", "restore", "diagnostics"].includes(next)) {
    return Boolean(state.outcome);
  }
  return next === "scanning" || next === "applying";
}

export function setView(state: AppState, next: View): AppState {
  return canNavigate(state, next) ? { ...state, view: next, error: null } : state;
}

export function progressFor(view: View): { side: "windows" | "mac" | "home"; step: number } {
  if (["scanning", "scan", "export", "exported"].includes(view)) {
    return { side: "windows", step: view === "scanning" ? 1 : view === "scan" ? 2 : 3 };
  }
  if (["plan", "applying", "complete", "report", "guide", "restore", "diagnostics"].includes(view)) {
    return { side: "mac", step: view === "plan" ? 2 : view === "applying" ? 2 : 3 };
  }
  return { side: "home", step: 0 };
}

export function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    applied_verified: "已验证",
    failed_recoverable: "失败，可恢复",
    rolled_back_verified: "已恢复并验证",
    manual_action_required: "需要手动完成",
    skipped_permission: "已跳过（权限）",
    unknown_requires_review: "状态未知，需要检查",
    unchanged: "未更改",
    skipped: "已跳过（按计划）",
  };
  return labels[status] ?? "需要检查";
}
