import { describe, expect, it } from "vitest";
import { shouldBlockGlobalSpaceHotkey } from "./hotkey";

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
