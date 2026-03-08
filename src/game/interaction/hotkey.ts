const HOTKEY_BLOCK_SELECTOR =
  "input, textarea, select, button, a, [contenteditable='true'], [role='button'], [role='link']";

const LAYER_HOTKEY_FALLBACKS = ["d", "f", "g", "h"];

interface HotkeyTargetLike {
  tagName?: string;
  isContentEditable?: boolean;
  closest?: (selector: string) => unknown;
}

export interface LayerHotkeys {
  up: string;
  down: string;
}

export const DEFAULT_LAYER_HOTKEYS: LayerHotkeys = {
  up: "a",
  down: "d"
};

function normalizeSingleHotkey(value: string | undefined): string | null {
  const normalized = (value ?? "").trim().toLowerCase();
  if (!normalized || normalized.length !== 1) {
    return null;
  }
  if (/\s/.test(normalized)) {
    return null;
  }
  return normalized;
}

function resolveDistinctDownHotkey(
  preferred: string | null,
  upHotkey: string
): string {
  if (preferred && preferred !== upHotkey) {
    return preferred;
  }
  for (const fallback of LAYER_HOTKEY_FALLBACKS) {
    if (fallback !== upHotkey) {
      return fallback;
    }
  }
  return "j";
}

export function sanitizeLayerHotkeys(
  candidate: Partial<LayerHotkeys> | null | undefined
): LayerHotkeys {
  const up = normalizeSingleHotkey(candidate?.up) ?? DEFAULT_LAYER_HOTKEYS.up;
  const preferredDown = normalizeSingleHotkey(candidate?.down) ?? DEFAULT_LAYER_HOTKEYS.down;
  const down = resolveDistinctDownHotkey(preferredDown, up);
  return {
    up,
    down
  };
}

export function resolveLayerHotkeyAction(
  key: string,
  hotkeys: LayerHotkeys
): -1 | 1 | null {
  const normalizedKey = normalizeSingleHotkey(key);
  if (!normalizedKey) {
    return null;
  }
  if (normalizedKey === hotkeys.up) {
    return -1;
  }
  if (normalizedKey === hotkeys.down) {
    return 1;
  }
  return null;
}

export function shouldBlockGlobalSpaceHotkey(eventTarget: EventTarget | null): boolean {
  const element = eventTarget as HotkeyTargetLike | null;
  if (!element) {
    return false;
  }

  if (element.isContentEditable) {
    return true;
  }

  if (typeof element.closest === "function" && element.closest(HOTKEY_BLOCK_SELECTOR)) {
    return true;
  }

  const tagName = element.tagName?.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select";
}
