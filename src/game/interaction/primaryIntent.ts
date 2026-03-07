import type { SmartActionState } from "./smartAction";

export type PrimaryIntentSource = "smart-action";

export interface PrimaryIntentState extends SmartActionState {
  source: PrimaryIntentSource;
}

interface PrimaryIntentInput {
  smartAction: SmartActionState;
}

export function createPrimaryIntentState(input: PrimaryIntentInput): PrimaryIntentState {
  const { smartAction } = input;
  return {
    ...smartAction,
    source: "smart-action"
  };
}
