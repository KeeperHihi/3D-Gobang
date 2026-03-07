export type OnboardingStep = "intro" | "rotate" | "place" | "done";

export interface OnboardingProgress {
  introAcknowledged: boolean;
  hasRotated: boolean;
  hasPlaced: boolean;
  skipped: boolean;
}

export interface OnboardingGuideInput {
  enabled: boolean;
  canUsePrimaryAction: boolean;
  progress: OnboardingProgress;
}

export interface OnboardingGuideState {
  step: OnboardingStep;
  visible: boolean;
  completed: boolean;
  stepIndex: number;
  totalSteps: number;
  title: string;
  detail: string;
  primaryActionLabel: string | null;
}

const TOTAL_STEPS = 3;

export function createDefaultOnboardingProgress(): OnboardingProgress {
  return {
    introAcknowledged: false,
    hasRotated: false,
    hasPlaced: false,
    skipped: false
  };
}

export function isOnboardingCompletedByPlayer(progress: OnboardingProgress): boolean {
  return progress.skipped || progress.hasPlaced;
}

function doneState(): OnboardingGuideState {
  return {
    step: "done",
    visible: false,
    completed: true,
    stepIndex: TOTAL_STEPS,
    totalSteps: TOTAL_STEPS,
    title: "",
    detail: "",
    primaryActionLabel: null
  };
}

export function createOnboardingGuideState(input: OnboardingGuideInput): OnboardingGuideState {
  const { enabled, canUsePrimaryAction, progress } = input;
  if (!enabled || progress.skipped || progress.hasPlaced) {
    return doneState();
  }

  if (!progress.introAcknowledged) {
    return {
      step: "intro",
      visible: true,
      completed: false,
      stepIndex: 1,
      totalSteps: TOTAL_STEPS,
      title: "首局 30 秒上手",
      detail: "我会分步带你完成第一次操作，全程可跳过。",
      primaryActionLabel: "开始引导"
    };
  }

  if (!progress.hasRotated) {
    return {
      step: "rotate",
      visible: true,
      completed: false,
      stepIndex: 2,
      totalSteps: TOTAL_STEPS,
      title: "先旋转看看立方体",
      detail: "按住并拖动棋盘，任意角度连成 5 子都算胜利。",
      primaryActionLabel: null
    };
  }

  return {
    step: "place",
    visible: true,
    completed: false,
    stepIndex: 3,
    totalSteps: TOTAL_STEPS,
    title: "完成第一手落子",
    detail: canUsePrimaryAction
      ? "点击主按钮即可按建议落子，几乎不用思考。"
      : "轮到你时，点击主按钮按建议落子，或直接点棋盘高亮点。",
    primaryActionLabel: null
  };
}
