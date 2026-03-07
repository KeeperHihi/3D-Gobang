import { describe, expect, it } from "vitest";
import {
  detectLayoutMode,
  MOBILE_WIDTH_BREAKPOINT_PX,
  resolveLayoutMode,
  TOUCH_HEIGHT_BREAKPOINT_PX,
  TOUCH_WIDTH_BREAKPOINT_PX
} from "./deviceMode";

describe("resolveLayoutMode", () => {
  it("returns mobile for narrow viewports", () => {
    expect(
      resolveLayoutMode({
        viewportWidth: MOBILE_WIDTH_BREAKPOINT_PX,
        viewportHeight: 844,
        coarsePointer: false,
        hoverNone: false,
        maxTouchPoints: 0
      })
    ).toBe("mobile");
  });

  it("returns mobile for touch devices under touch-width breakpoint", () => {
    expect(
      resolveLayoutMode({
        viewportWidth: TOUCH_WIDTH_BREAKPOINT_PX,
        viewportHeight: 900,
        coarsePointer: true,
        hoverNone: true,
        maxTouchPoints: 5
      })
    ).toBe("mobile");
  });

  it("returns mobile for short touch viewports", () => {
    expect(
      resolveLayoutMode({
        viewportWidth: 1280,
        viewportHeight: TOUCH_HEIGHT_BREAKPOINT_PX,
        coarsePointer: true,
        hoverNone: false,
        maxTouchPoints: 2
      })
    ).toBe("mobile");
  });

  it("returns desktop for desktop pointer and wide viewport", () => {
    expect(
      resolveLayoutMode({
        viewportWidth: 1440,
        viewportHeight: 900,
        coarsePointer: false,
        hoverNone: false,
        maxTouchPoints: 0
      })
    ).toBe("desktop");
  });

  it("keeps large touchscreen laptops as desktop", () => {
    expect(
      resolveLayoutMode({
        viewportWidth: 1366,
        viewportHeight: 900,
        coarsePointer: true,
        hoverNone: false,
        maxTouchPoints: 10
      })
    ).toBe("desktop");
  });

  it("falls back to desktop when browser globals are unavailable", () => {
    expect(detectLayoutMode()).toBe("desktop");
  });
});
