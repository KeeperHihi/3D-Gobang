import { describe, expect, it } from "vitest";
import { evaluateTurnNudgePermission } from "./turnNudgePermission";

function createDecision(overrides?: Partial<Parameters<typeof evaluateTurnNudgePermission>[0]>) {
  return evaluateTurnNudgePermission({
    enabled: true,
    permission: "default",
    dismissed: false,
    requestPending: false,
    lastRequestedAtMs: null,
    nowMs: 10_000,
    ...overrides
  });
}

describe("evaluateTurnNudgePermission", () => {
  it("shows CTA when permission is default", () => {
    const decision = createDecision();

    expect(decision.phase).toBe("prompt");
    expect(decision.showCta).toBe(true);
    expect(decision.canRequest).toBe(true);
  });

  it("does not show CTA while request is pending", () => {
    const decision = createDecision({
      requestPending: true
    });

    expect(decision.phase).toBe("prompt");
    expect(decision.showCta).toBe(true);
    expect(decision.canRequest).toBe(false);
  });

  it("applies request cooldown for repeated permission request", () => {
    const inCooldown = createDecision({
      lastRequestedAtMs: 9_000,
      nowMs: 10_500
    });
    const afterCooldown = createDecision({
      lastRequestedAtMs: 8_000,
      nowMs: 10_500
    });

    expect(inCooldown.canRequest).toBe(false);
    expect(afterCooldown.canRequest).toBe(true);
  });

  it("shows denied hint when browser blocks notifications", () => {
    const decision = createDecision({
      permission: "denied"
    });

    expect(decision.phase).toBe("denied");
    expect(decision.showDeniedHint).toBe(true);
    expect(decision.showCta).toBe(false);
  });

  it("stays hidden when dismissed or feature disabled", () => {
    const dismissed = createDecision({
      dismissed: true
    });
    const disabled = createDecision({
      enabled: false
    });

    expect(dismissed.phase).toBe("hidden");
    expect(disabled.phase).toBe("hidden");
  });

  it("does not show prompt when permission is granted or unsupported", () => {
    const granted = createDecision({
      permission: "granted"
    });
    const unsupported = createDecision({
      permission: "unsupported"
    });

    expect(granted.phase).toBe("granted");
    expect(unsupported.phase).toBe("unsupported");
    expect(granted.showCta).toBe(false);
    expect(unsupported.showCta).toBe(false);
  });
});
