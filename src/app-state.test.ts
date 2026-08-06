import { describe, expect, it } from "vitest";
import { canNavigate, initialState, progressFor, setView, statusLabel } from "./app-state";

describe("v1 flow guards", () => {
  it("does not allow bypassing the migration plan", () => {
    const state = initialState(false);
    expect(canNavigate(state, "complete")).toBe(false);
    expect(setView(state, "complete").view).toBe("home");
  });

  it("keeps both sides to three visible stages", () => {
    expect(progressFor("scan")).toEqual({ side: "windows", step: 2 });
    expect(progressFor("export")).toEqual({ side: "windows", step: 3 });
    expect(progressFor("plan")).toEqual({ side: "mac", step: 2 });
    expect(progressFor("complete")).toEqual({ side: "mac", step: 3 });
  });

  it("never labels an unknown result as success", () => {
    expect(statusLabel("something_new")).toBe("需要检查");
    expect(statusLabel("applied_verified")).toBe("已验证");
    expect(statusLabel("skipped")).toBe("已跳过（按计划）");
  });

  it("starts with the safe pointer module selected", () => {
    expect(initialState(true).selection.include_pointer).toBe(true);
    expect(initialState(true).preview.wifiPasswordSelected).toBe(false);
  });
});
