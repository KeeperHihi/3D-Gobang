import type { PlayerMark, Winner } from "../network/protocol";
import type { LayoutMode } from "../game/interaction/deviceMode";
import {
  qualityLevelLabel,
  qualityModeLabel,
  type QualityLevel,
  type QualityMode
} from "../game/interaction/qualityProfile";
import type { SmartActionState } from "../game/interaction/smartAction";
import { SmartActionBar } from "./SmartActionBar";

interface HUDProps {
  layoutMode: LayoutMode;
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
  opponentReconnectRemainingMs: number | null;
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
  layoutMode,
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
  opponentReconnectRemainingMs,
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
  const isMobileLayout = layoutMode === "mobile";
  const canRematch = Boolean(winner) && opponentConnected;
  const turnText = winner
    ? winnerText(winner, myMark)
    : turn === myMark
      ? "轮到你落子"
      : "等待对手落子";
  const reconnectDeadlineSeconds =
    opponentReconnectRemainingMs === null ? null : Math.max(0, Math.ceil(opponentReconnectRemainingMs / 1000));
  const showReconnectDeadline = !winner && reconnectDeadlineSeconds !== null && !opponentConnected;
  const reconnectUrgent = reconnectDeadlineSeconds !== null && reconnectDeadlineSeconds <= 10;
  const advancedToggleLabel = advancedOpen
    ? "收起操作面板"
    : isMobileLayout
      ? "更多操作"
      : "展开高级操作";

  return (
    <div className={`hud-root ${isMobileLayout ? "mobile" : "desktop"}`}>
      <div className="hud-card">
        <div className="hud-title">NEBULA CUBE</div>
        {!isMobileLayout ? (
          <>
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
          </>
        ) : null}
        <div className="hud-turn">{turnText}</div>
        {showReconnectDeadline ? (
          <div className={`hud-reconnect-banner ${reconnectUrgent ? "urgent" : ""}`}>
            对手掉线，{reconnectDeadlineSeconds}s 内重连，否则自动判负
          </div>
        ) : null}
        <SmartActionBar action={smartAction} onAction={onPrimaryAction} layoutMode={layoutMode} />
        <div className="hud-actions">
          <button className="hud-button ghost" type="button" onClick={onToggleAdvanced}>
            {advancedToggleLabel}
          </button>
        </div>
        {advancedOpen ? (
          <div className="hud-advanced-panel">
            {isMobileLayout ? (
              <>
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
              </>
            ) : null}
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
