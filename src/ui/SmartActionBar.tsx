import type { SmartActionState } from "../game/interaction/smartAction";

interface SmartActionBarProps {
  action: SmartActionState;
  onAction: () => void;
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
  if (actionType === "pending") {
    return "smart-action-button pending";
  }
  return "smart-action-button";
}

export function SmartActionBar({ action, onAction }: SmartActionBarProps) {
  return (
    <div className="smart-action-bar">
      <button
        className={actionClassName(action.actionType)}
        type="button"
        disabled={!action.enabled}
        onClick={onAction}
      >
        {action.label}
      </button>
      <div className="smart-action-hint">{action.reason}</div>
      <div className="smart-action-hotkey">快捷键：Space</div>
    </div>
  );
}
