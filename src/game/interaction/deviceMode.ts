export type LayoutMode = "desktop" | "mobile";

export interface DeviceModeSignals {
  viewportWidth: number;
  viewportHeight: number;
  coarsePointer: boolean;
  hoverNone: boolean;
  maxTouchPoints: number;
}

export interface DeviceModeEnvironment {
  innerWidth: number;
  innerHeight: number;
  navigator?: {
    maxTouchPoints?: number;
  };
  matchMedia?: (query: string) => { matches: boolean };
}

export const MOBILE_WIDTH_BREAKPOINT_PX = 900;
export const TOUCH_WIDTH_BREAKPOINT_PX = 1180;
export const TOUCH_HEIGHT_BREAKPOINT_PX = 820;
const DEFAULT_DESKTOP_WIDTH_PX = 1366;
const DEFAULT_DESKTOP_HEIGHT_PX = 768;

function normalizeViewportSize(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.round(value);
}

function readQueryMatch(environment: DeviceModeEnvironment, query: string): boolean {
  if (!environment.matchMedia) {
    return false;
  }
  try {
    return Boolean(environment.matchMedia(query).matches);
  } catch {
    return false;
  }
}

export function resolveLayoutMode(signals: DeviceModeSignals): LayoutMode {
  const width = normalizeViewportSize(signals.viewportWidth);
  const height = normalizeViewportSize(signals.viewportHeight);

  if (width <= MOBILE_WIDTH_BREAKPOINT_PX) {
    return "mobile";
  }

  const likelyTouchDevice =
    signals.coarsePointer || signals.hoverNone || signals.maxTouchPoints > 0;
  if (!likelyTouchDevice) {
    return "desktop";
  }

  if (width <= TOUCH_WIDTH_BREAKPOINT_PX) {
    return "mobile";
  }

  if (height > 0 && height <= TOUCH_HEIGHT_BREAKPOINT_PX) {
    return "mobile";
  }

  return "desktop";
}

export function detectLayoutMode(environment?: DeviceModeEnvironment): LayoutMode {
  const resolvedEnvironment = (() => {
    if (environment) {
      return environment;
    }
    if (typeof window !== "undefined") {
      return window as unknown as DeviceModeEnvironment;
    }
    return {
      innerWidth: DEFAULT_DESKTOP_WIDTH_PX,
      innerHeight: DEFAULT_DESKTOP_HEIGHT_PX,
      navigator: {
        maxTouchPoints: 0
      }
    } satisfies DeviceModeEnvironment;
  })();

  return resolveLayoutMode({
    viewportWidth: resolvedEnvironment.innerWidth,
    viewportHeight: resolvedEnvironment.innerHeight,
    coarsePointer: readQueryMatch(resolvedEnvironment, "(pointer: coarse)"),
    hoverNone: readQueryMatch(resolvedEnvironment, "(hover: none)"),
    maxTouchPoints: resolvedEnvironment.navigator?.maxTouchPoints ?? 0
  });
}
