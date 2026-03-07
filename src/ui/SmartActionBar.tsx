import type { SmartActionState } from "../game/interaction/smartAction";
import type { LayoutMode } from "../game/interaction/deviceMode";

interface SmartActionBarProps {
  action: SmartActionState;
  onAction: () => void;
  layoutMode: LayoutMode;
}

function actionClassName(actionType: SmartActionState["actionType"]): string {
  if (actionType === "win") {
    return "smart-action-button win";
  }
  if (actionType === "block") {
    return "smart-action-button block";
  }
  if (actionType === "rematch") {
    return "smart-action-button rematch";
  }
  if (actionType === "continueMatch") {
    return "smart-action-button continue-match";
  }
  if (actionType === "continuePending") {
    return "smart-action-button pending";
  }
  if (actionType === "enableAssist") {
    return "smart-action-button enable-assist";
  }
  if (actionType === "readyWaiting") {
    return "smart-action-button ready-waiting";
  }
  if (actionType === "opponentReady") {
    return "smart-action-button opponent-ready";
  }
  if (actionType === "pending") {
    return "smart-action-button pending";
  }
  return "smart-action-button";
}

export function SmartActionBar({ action, onAction, layoutMode }: SmartActionBarProps) {
  const isMobile = layoutMode === "mobile";

  return (
    <div className={`smart-action-bar ${isMobile ? "dock" : ""}`}>
      <button
        className={`${actionClassName(action.actionType)} ${isMobile ? "dock" : ""}`}
        type="button"
        disabled={!action.enabled}
        onClick={onAction}
      >
        {action.label}
      </button>
      <div className="smart-action-hint">{action.reason}</div>
      {isMobile ? null : <div className="smart-action-hotkey">快捷键：Space</div>}
    </div>
  );
}
