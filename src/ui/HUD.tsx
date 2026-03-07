import type { PlayerMark, Winner } from "../network/protocol";

interface HUDProps {
  roomId: string;
  myMark: PlayerMark;
  turn: PlayerMark;
  winner: Winner;
  myConnected: boolean;
  opponentConnected: boolean;
  connectionStatus: "connecting" | "online" | "reconnecting" | "offline";
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
  myMark,
  turn,
  winner,
  myConnected,
  opponentConnected,
  connectionStatus,
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
        <div className="hud-actions">
          <button className="hud-button" type="button" onClick={onRematch} disabled={!canRematch}>
            再来一局
          </button>
          <button className="hud-button ghost" type="button" onClick={onLeave}>
            离开
          </button>
        </div>
      </div>
    </div>
  );
}
