export type ContinueMatchValidationFailureReason = "missingContext" | "offline";

export type ContinueMatchValidationResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      reason: ContinueMatchValidationFailureReason;
    };

interface ContinueMatchValidationInput {
  hasSession: boolean;
  hasSnapshot: boolean;
  isConnected: boolean;
}

export function validateContinueMatchRequest(
  input: ContinueMatchValidationInput
): ContinueMatchValidationResult {
  if (!input.hasSession || !input.hasSnapshot) {
    return {
      ok: false,
      reason: "missingContext"
    };
  }

  if (!input.isConnected) {
    return {
      ok: false,
      reason: "offline"
    };
  }

  return {
    ok: true
  };
}
