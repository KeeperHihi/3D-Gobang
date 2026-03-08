import { describe, expect, it } from "vitest";
import {
  DEFAULT_LAYER_HOTKEYS,
  resolveLayerHotkeyAction,
  sanitizeLayerHotkeys,
  shouldBlockGlobalSpaceHotkey
} from "./hotkey";

describe("shouldBlockGlobalSpaceHotkey", () => {
  it("returns false for null target", () => {
    expect(shouldBlockGlobalSpaceHotkey(null)).toBe(false);
  });

  it("blocks for typing fields", () => {
    const inputLike = {
      tagName: "INPUT"
    } as unknown as EventTarget;

    expect(shouldBlockGlobalSpaceHotkey(inputLike)).toBe(true);
  });

  it("blocks when target is inside interactive control", () => {
    const nestedInButton = {
      tagName: "SPAN",
      closest: (selector: string) => (selector.includes("button") ? {} : null)
    } as unknown as EventTarget;

    expect(shouldBlockGlobalSpaceHotkey(nestedInButton)).toBe(true);
  });

  it("blocks content editable elements", () => {
    const editable = {
      tagName: "DIV",
      isContentEditable: true
    } as unknown as EventTarget;

    expect(shouldBlockGlobalSpaceHotkey(editable)).toBe(true);
  });

  it("does not block neutral non-interactive targets", () => {
    const neutral = {
      tagName: "DIV",
      closest: () => null
    } as unknown as EventTarget;

    expect(shouldBlockGlobalSpaceHotkey(neutral)).toBe(false);
  });
});

describe("sanitizeLayerHotkeys", () => {
  it("returns defaults for empty input", () => {
    expect(sanitizeLayerHotkeys(null)).toEqual(DEFAULT_LAYER_HOTKEYS);
  });

  it("normalizes custom shortcuts as single lowercase characters", () => {
    expect(sanitizeLayerHotkeys({ up: " W ", down: "S" })).toEqual({
      up: "w",
      down: "s"
    });
  });

  it("resolves duplicated hotkeys with a distinct fallback", () => {
    expect(sanitizeLayerHotkeys({ up: "d", down: "d" })).toEqual({
      up: "d",
      down: "f"
    });
  });

  it("ignores invalid shortcuts", () => {
    expect(sanitizeLayerHotkeys({ up: "  ", down: "ab" })).toEqual(DEFAULT_LAYER_HOTKEYS);
  });
});

describe("resolveLayerHotkeyAction", () => {
  it("maps configured keys to layer navigation direction", () => {
    expect(resolveLayerHotkeyAction("d", DEFAULT_LAYER_HOTKEYS)).toBe(-1);
    expect(resolveLayerHotkeyAction("A", DEFAULT_LAYER_HOTKEYS)).toBe(1);
  });

  it("returns null for unconfigured keys", () => {
    expect(resolveLayerHotkeyAction("x", DEFAULT_LAYER_HOTKEYS)).toBeNull();
  });
});
