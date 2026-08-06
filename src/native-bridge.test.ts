import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import { invokeNative, parseNativeError } from "./native-bridge";

describe("native command boundary", () => {
  beforeEach(() => invokeMock.mockReset().mockResolvedValue({}));

  it("keeps the confirm_plan envelope required by the Rust command", async () => {
    const confirmation = {
      selected_module_ids: ["finder_extensions", "software.chrome"],
      keyboard_built_in: true,
      keyboard_external: false,
    };
    await invokeNative("confirm_plan", { confirmation });
    expect(invokeMock).toHaveBeenCalledWith("confirm_plan", { confirmation });
  });

  it("keeps apply and rollback fields at their Rust top-level names", async () => {
    await invokeNative("apply_plan", {
      keyboardBuiltIn: true,
      keyboardExternal: false,
      selectedModuleIds: ["finder_extensions"],
      confirmationToken: "token",
    });
    await invokeNative("rollback_module", { moduleId: "finder_extensions" });
    expect(invokeMock).toHaveBeenNthCalledWith(1, "apply_plan", {
      keyboardBuiltIn: true,
      keyboardExternal: false,
      selectedModuleIds: ["finder_extensions"],
      confirmationToken: "token",
    });
    expect(invokeMock).toHaveBeenNthCalledWith(2, "rollback_module", { moduleId: "finder_extensions" });
  });

  it("preserves nested payloads for logging, snapshot deletion and updates", async () => {
    await invokeNative("record_error", { input: { code: "TAURI_INVALID_ARGS" } });
    await invokeNative("delete_snapshot", { request: { confirmed: true } });
    await invokeNative("install_update", { request: { confirmed: true } });
    expect(invokeMock).toHaveBeenNthCalledWith(1, "record_error", { input: { code: "TAURI_INVALID_ARGS" } });
    expect(invokeMock).toHaveBeenNthCalledWith(2, "delete_snapshot", { request: { confirmed: true } });
    expect(invokeMock).toHaveBeenNthCalledWith(3, "install_update", { request: { confirmed: true } });
  });
});

describe("native error parsing", () => {
  it("maps Tauri missing-argument diagnostics to a stable code", () => {
    expect(parseNativeError("invalid args `confirmation` for command `confirm_plan`: command confirm_plan missing required key confirmation")).toBe("TAURI_INVALID_ARGS");
    expect(parseNativeError(new Error("missing required key request"))).toBe("TAURI_INVALID_ARGS");
  });

  it("extracts a full stable code instead of the first uppercase word", () => {
    expect(parseNativeError("Error: PLAN_NOT_CONFIRMED")).toBe("PLAN_NOT_CONFIRMED");
    expect(parseNativeError("invalid args: INVALID")).toBe("TAURI_INVALID_ARGS");
    expect(parseNativeError("a message with no stable code")).toBe("UNKNOWN_ERROR");
  });
});
