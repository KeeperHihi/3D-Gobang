import { describe, expect, it } from "vitest";
import { validateContinueMatchRequest } from "./continueMatch";

describe("validateContinueMatchRequest", () => {
  it("rejects request when session is missing", () => {
    expect(
      validateContinueMatchRequest({
        hasSession: false,
        hasSnapshot: true,
        isConnected: true
      })
    ).toEqual({
      ok: false,
      reason: "missingContext"
    });
  });

  it("rejects request when snapshot is missing", () => {
    expect(
      validateContinueMatchRequest({
        hasSession: true,
        hasSnapshot: false,
        isConnected: true
      })
    ).toEqual({
      ok: false,
      reason: "missingContext"
    });
  });

  it("rejects request when socket is offline", () => {
    expect(
      validateContinueMatchRequest({
        hasSession: true,
        hasSnapshot: true,
        isConnected: false
      })
    ).toEqual({
      ok: false,
      reason: "offline"
    });
  });

  it("allows request when context exists and socket is online", () => {
    expect(
      validateContinueMatchRequest({
        hasSession: true,
        hasSnapshot: true,
        isConnected: true
      })
    ).toEqual({
      ok: true
    });
  });
});
