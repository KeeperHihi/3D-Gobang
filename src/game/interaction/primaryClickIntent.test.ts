import { describe, expect, it } from "vitest";
import {
  isQuickPrimaryClick,
  measurePointerTravel,
  QUICK_PRIMARY_CLICK_MAX_DURATION_MS,
  QUICK_PRIMARY_CLICK_MAX_TRAVEL_PX
} from "./primaryClickIntent";

describe("isQuickPrimaryClick", () => {
  it("accepts fast primary mouse clicks with small movement", () => {
    expect(
      isQuickPrimaryClick({
        pointerType: "mouse",
        button: 0,
        pressDurationMs: QUICK_PRIMARY_CLICK_MAX_DURATION_MS - 40,
        travelDistancePx: QUICK_PRIMARY_CLICK_MAX_TRAVEL_PX - 1
      })
    ).toBe(true);
  });

  it("rejects long mouse press", () => {
    expect(
      isQuickPrimaryClick({
        pointerType: "mouse",
        button: 0,
        pressDurationMs: QUICK_PRIMARY_CLICK_MAX_DURATION_MS + 1,
        travelDistancePx: 1
      })
    ).toBe(false);
  });

  it("rejects large pointer travel", () => {
    expect(
      isQuickPrimaryClick({
        pointerType: "mouse",
        button: 0,
        pressDurationMs: 120,
        travelDistancePx: QUICK_PRIMARY_CLICK_MAX_TRAVEL_PX + 0.5
      })
    ).toBe(false);
  });

  it("rejects non-primary mouse button", () => {
    expect(
      isQuickPrimaryClick({
        pointerType: "mouse",
        button: 2,
        pressDurationMs: 50,
        travelDistancePx: 0
      })
    ).toBe(false);
  });

  it("keeps touch interactions pass-through", () => {
    expect(
      isQuickPrimaryClick({
        pointerType: "touch",
        button: 0,
        pressDurationMs: 800,
        travelDistancePx: 18
      })
    ).toBe(true);
  });
});

describe("measurePointerTravel", () => {
  it("returns euclidean pointer distance", () => {
    expect(measurePointerTravel(0, 0, 3, 4)).toBe(5);
  });
});
