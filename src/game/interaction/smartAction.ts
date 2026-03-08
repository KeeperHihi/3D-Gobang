import type { Coordinate3D, PlayerMark, RoomSnapshot, Winner } from "../../network/protocol";
import type { MoveHint } from "../engine/moveHints";
import { evaluateConnectionGuidance } from "./connectionGuidance";

export type ConnectionStatus = "connecting" | "online" | "reconnecting" | "offline";
export type ContinueMatchReason = "opponentOffline" | "readyTimeout";

export type SmartActionType =
  | "win"
  | "block"
  | "suggest"
  | "enableAssist"
  | "pending"
  | "continuePending"
  | "manual"
  | "wait"
  | "continueMatch"
  | "rematch"
  | "readyWaiting"
  | "opponentReady"
  | "connection";

export interface SmartActionState {
  actionType: SmartActionType;
  label: string;
  enabled: boolean;
  reason: string;
  target: Coordinate3D | null;
}

interface SmartActionInput {
  snapshot: Pick<RoomSnapshot, "turn" | "winner">;
  myMark: PlayerMark;
  hints: MoveHint[];
  connectionStatus: ConnectionStatus;
  canObserveBoard: boolean;
  assistEnabled: boolean;
  hasPendingMove: boolean;
  canContinueMatch: boolean;
  continueMatchReason?: ContinueMatchReason | null;
  continueSubmitting?: boolean;
  myRematchReady: boolean;
  opponentRematchReady: boolean;
}

const OBSERVATION_HINT = "可点击棋盘切层观察";

function winnerReason(winner: Winner, myMark: PlayerMark): string {
  if (winner === "draw") {
    return "本局平局，点击开始下一局";
  }
  if (winner === myMark) {
    return "你已获胜，点击再来一局";
  }
  return "本局结束，点击再来一局";
}

function continueMatchActionReason(reason: ContinueMatchReason | null | undefined): string {
  if (reason === "readyTimeout") {
    return "等待对手确认超时，点击一键继续匹配";
  }
  if (reason === "opponentOffline") {
    return "对手掉线已结算，点击一键继续匹配";
  }
  return "当前可继续匹配，点击后自动为你寻找新对手";
}

export function createSmartActionState(input: SmartActionInput): SmartActionState {
  const {
    snapshot,
    myMark,
    hints,
    connectionStatus,
    canObserveBoard,
    assistEnabled,
    hasPendingMove,
    canContinueMatch,
    continueMatchReason,
    continueSubmitting,
    myRematchReady,
    opponentRematchReady
  } = input;

  if (connectionStatus !== "online") {
    const connectionGuidance = evaluateConnectionGuidance({
      connectionStatus,
      canObserveBoard
    });
    return {
      actionType: "connection",
      label: connectionGuidance.actionLabel,
      enabled: false,
      reason: connectionGuidance.primaryHint ?? "正在连接服务器",
      target: null
    };
  }

  if (snapshot.winner) {
    if (continueSubmitting) {
      return {
        actionType: "continuePending",
        label: "切换中...",
        enabled: false,
        reason: "正在切换到匹配队列，请稍候",
        target: null
      };
    }

    if (canContinueMatch) {
      return {
        actionType: "continueMatch",
        label: "继续匹配",
        enabled: true,
        reason: continueMatchActionReason(continueMatchReason),
        target: null
      };
    }

    if (myRematchReady) {
      return {
        actionType: "readyWaiting",
        label: opponentRematchReady ? "即将开始下一局" : "已准备，等待对手",
        enabled: false,
        reason: opponentRematchReady
          ? "双方已准备，下一局即将开始"
          : "你已确认再来一局，等待对手确认",
        target: null
      };
    }

    if (opponentRematchReady) {
      return {
        actionType: "opponentReady",
        label: "对手已准备，点击开始",
        enabled: true,
        reason: "对手已确认，点击后立即进入下一局",
        target: null
      };
    }

    return {
      actionType: "rematch",
      label: "再来一局",
      enabled: true,
      reason: winnerReason(snapshot.winner, myMark),
      target: null
    };
  }

  if (snapshot.turn !== myMark) {
    return {
      actionType: "wait",
      label: "等待对手",
      enabled: false,
      reason: `当前不是你的回合，${OBSERVATION_HINT}`,
      target: null
    };
  }

  if (hasPendingMove) {
    return {
      actionType: "pending",
      label: "提交中...",
      enabled: false,
      reason: `正在等待服务器确认本次落子，可先切层观察局面变化`,
      target: null
    };
  }

  if (!assistEnabled) {
    return {
      actionType: "enableAssist",
      label: "开启提示并推荐",
      enabled: true,
      reason: "点击后开启战术辅助；也可以直接在棋盘手动落子",
      target: null
    };
  }

  const primaryHint = hints[0];
  if (!primaryHint) {
    return {
      actionType: "manual",
      label: "请在棋盘落子",
      enabled: false,
      reason: "暂无建议点，请直接点击棋盘",
      target: null
    };
  }

  if (primaryHint.priority === "win") {
    return {
      actionType: "win",
      label: "一键制胜",
      enabled: true,
      reason: "检测到一步制胜点",
      target: primaryHint.coordinate
    };
  }

  if (primaryHint.priority === "block") {
    return {
      actionType: "block",
      label: "一键防守",
      enabled: true,
      reason: "检测到必须防守点",
      target: primaryHint.coordinate
    };
  }

  return {
    actionType: "suggest",
    label: "按建议落子",
    enabled: true,
    reason: "建议点已高亮，可直接执行",
    target: primaryHint.coordinate
  };
}
