const HOTKEY_BLOCK_SELECTOR =
  "input, textarea, select, button, a, [contenteditable='true'], [role='button'], [role='link']";

interface HotkeyTargetLike {
  tagName?: string;
  isContentEditable?: boolean;
  closest?: (selector: string) => unknown;
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
