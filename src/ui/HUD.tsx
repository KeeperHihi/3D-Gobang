import type { PlayerMark, Winner } from "../network/protocol";
import {
  qualityLevelLabel,
  qualityModeLabel,
  type QualityLevel,
  type QualityMode
} from "../game/interaction/qualityProfile";
import type { SmartActionState } from "../game/interaction/smartAction";
import { SmartActionBar } from "./SmartActionBar";

interface HUDProps {
  roomId: string;
  boardSize: number;
  myMark: PlayerMark;
  turn: PlayerMark;
  winner: Winner;
  assistEnabled: boolean;
  focusLayer: number;
  focusMode: "auto" | "manual";
  smartAction: SmartActionState;
  advancedOpen: boolean;
  qualityMode: QualityMode;
  qualityLevel: QualityLevel;
  averageFps: number | null;
  myConnected: boolean;
  opponentConnected: boolean;
  connectionStatus: "connecting" | "online" | "reconnecting" | "offline";
  onPrimaryAction: () => void;
  onToggleAdvanced: () => void;
  onLayerStep: (step: -1 | 1) => void;
  onAutoFocus: () => void;
  onToggleAssist: () => void;
  onQualityModeChange: (mode: QualityMode) => void;
  onRematch: () => void;
  onLeave: () => void;
}

function connectionLabel(status: HUDProps["connectionStatus"]): string {
  if (status === "online") {
    return "在线";
  }
  if (status === "reconnecting") {
    return "重连中";
  }
  if (status === "connecting") {
    return "连接中";
  }
  return "离线";
}

function winnerText(winner: Winner, myMark: PlayerMark): string {
  if (!winner) {
    return "继续战斗";
  }
  if (winner === "draw") {
    return "平局";
  }
  if (winner === myMark) {
    return "你赢了";
  }
  return "对手胜利";
}

export function HUD({
  roomId,
  boardSize,
  myMark,
  turn,
  winner,
  assistEnabled,
  focusLayer,
  focusMode,
  smartAction,
  advancedOpen,
  qualityMode,
  qualityLevel,
  averageFps,
  myConnected,
  opponentConnected,
  connectionStatus,
  onPrimaryAction,
  onToggleAdvanced,
  onLayerStep,
  onAutoFocus,
  onToggleAssist,
  onQualityModeChange,
  onRematch,
  onLeave
}: HUDProps) {
  const canRematch = Boolean(winner);
  const turnText = winner
    ? winnerText(winner, myMark)
    : turn === myMark
      ? "轮到你落子"
      : "等待对手落子";

  return (
    <div className="hud-root">
      <div className="hud-card">
        <div className="hud-title">NEBULA CUBE</div>
        <div className="hud-row">
          <span>房间</span>
          <span>{roomId}</span>
        </div>
        <div className="hud-row">
          <span>你的棋子</span>
          <span>{myMark}</span>
        </div>
        <div className="hud-row">
          <span>网络</span>
          <span>{connectionLabel(connectionStatus)}</span>
        </div>
        <div className="hud-row">
          <span>你</span>
          <span>{myConnected ? "在线" : "掉线"}</span>
        </div>
        <div className="hud-row">
          <span>对手</span>
          <span>{opponentConnected ? "在线" : "掉线"}</span>
        </div>
        <div className="hud-turn">{turnText}</div>
        <SmartActionBar action={smartAction} onAction={onPrimaryAction} />
        <div className="hud-actions">
          <button className="hud-button ghost" type="button" onClick={onToggleAdvanced}>
            {advancedOpen ? "收起高级操作" : "展开高级操作"}
          </button>
        </div>
        {advancedOpen ? (
          <div className="hud-advanced-panel">
            <div className="hud-row">
              <span>聚焦层</span>
              <span>
                L{focusLayer + 1}/{boardSize} · {focusMode === "auto" ? "自动" : "手动"}
              </span>
            </div>
            <div className="hud-row">
              <span>渲染档位</span>
              <span>{qualityLevelLabel(qualityLevel)}</span>
            </div>
            <div className="hud-row">
              <span>渲染模式</span>
              <span>{qualityModeLabel(qualityMode)}</span>
            </div>
            <div className="hud-row">
              <span>实时帧率</span>
              <span>{averageFps === null ? "采样中..." : `${Math.round(averageFps)} FPS`}</span>
            </div>
            <div className="hud-actions">
              <button
                className={`hud-mini-button ${qualityMode === "auto" ? "active" : ""}`}
                type="button"
                onClick={() => onQualityModeChange("auto")}
              >
                自动
              </button>
              <button
                className={`hud-mini-button ${qualityMode === "quality" ? "active" : ""}`}
                type="button"
                onClick={() => onQualityModeChange("quality")}
              >
                画质优先
              </button>
              <button
                className={`hud-mini-button ${qualityMode === "smooth" ? "active" : ""}`}
                type="button"
                onClick={() => onQualityModeChange("smooth")}
              >
                流畅优先
              </button>
            </div>
            <div className="hud-actions">
              <button
                className="hud-mini-button"
                type="button"
                onClick={() => onLayerStep(-1)}
                disabled={focusLayer <= 0}
              >
                上一层
              </button>
              <button
                className="hud-mini-button"
                type="button"
                onClick={() => onLayerStep(1)}
                disabled={focusLayer >= boardSize - 1}
              >
                下一层
              </button>
              <button
                className="hud-mini-button"
                type="button"
                onClick={onAutoFocus}
                disabled={focusMode === "auto"}
              >
                自动聚焦
              </button>
            </div>
            <div className="hud-actions">
              <button className="hud-button ghost" type="button" onClick={onToggleAssist}>
                战术辅助：{assistEnabled ? "开" : "关"}
              </button>
              <button className="hud-button" type="button" onClick={onRematch} disabled={!canRematch}>
                再来一局
              </button>
            </div>
            <div className="hud-actions">
              <button className="hud-button ghost" type="button" onClick={onLeave}>
                离开
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
