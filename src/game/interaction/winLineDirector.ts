import type { Coordinate3D, Winner } from "../../network/protocol";
import { fromLinearIndex } from "../engine/board";

export type WinLineType =
  | "same-layer-straight"
  | "same-layer-diagonal"
  | "cross-layer-straight"
  | "cross-layer-diagonal"
  | "space-diagonal"
  | "unknown";

export interface WinLineDirectorInput {
  winningLine: number[] | null;
  size: number;
  preferReducedMotion?: boolean;
}

export interface WinLineDirectorRoundKeyInput {
  roomId: string;
  winner: Winner;
  lastMoveNumber: number | null;
  lastMoveTimestamp: number | null;
}

export interface WinLineDirectorDecision {
  lineType: WinLineType;
  lineLabel: string;
  focusCoordinate: Coordinate3D;
  shouldAnimate: boolean;
}

function toStep(from: Coordinate3D, to: Coordinate3D): Coordinate3D {
  return {
    x: Math.sign(to.x - from.x),
    y: Math.sign(to.y - from.y),
    z: Math.sign(to.z - from.z)
  };
}

function isSameStep(step: Coordinate3D, candidate: Coordinate3D): boolean {
  return step.x === candidate.x && step.y === candidate.y && step.z === candidate.z;
}

function classifyLineType(coordinates: Coordinate3D[]): WinLineType {
  if (coordinates.length < 2) {
    return "unknown";
  }
  const baseStep = toStep(coordinates[0], coordinates[1]);
  if (baseStep.x === 0 && baseStep.y === 0 && baseStep.z === 0) {
    return "unknown";
  }

  for (let index = 2; index < coordinates.length; index += 1) {
    const currentStep = toStep(coordinates[index - 1], coordinates[index]);
    if (!isSameStep(baseStep, currentStep)) {
      return "unknown";
    }
  }

  const axisCount =
    (baseStep.x !== 0 ? 1 : 0) + (baseStep.y !== 0 ? 1 : 0) + (baseStep.z !== 0 ? 1 : 0);
  if (axisCount === 1) {
    return baseStep.z === 0 ? "same-layer-straight" : "cross-layer-straight";
  }
  if (axisCount === 2) {
    return baseStep.z === 0 ? "same-layer-diagonal" : "cross-layer-diagonal";
  }
  if (axisCount === 3) {
    return "space-diagonal";
  }
  return "unknown";
}

function centerCoordinate(coordinates: Coordinate3D[]): Coordinate3D {
  if (coordinates.length === 0) {
    return { x: 0, y: 0, z: 0 };
  }

  const total = coordinates.reduce(
    (acc, coordinate) => ({
      x: acc.x + coordinate.x,
      y: acc.y + coordinate.y,
      z: acc.z + coordinate.z
    }),
    { x: 0, y: 0, z: 0 }
  );

  return {
    x: total.x / coordinates.length,
    y: total.y / coordinates.length,
    z: total.z / coordinates.length
  };
}

export function describeWinLineType(lineType: WinLineType): string {
  if (lineType === "same-layer-straight") {
    return "同层直线五连";
  }
  if (lineType === "same-layer-diagonal") {
    return "同层斜线五连";
  }
  if (lineType === "cross-layer-straight") {
    return "跨层直线五连";
  }
  if (lineType === "cross-layer-diagonal") {
    return "跨层斜线五连";
  }
  if (lineType === "space-diagonal") {
    return "空间对角线五连";
  }
  return "五连胜线";
}

export function createWinLineDirectorRoundKey(input: WinLineDirectorRoundKeyInput): string {
  return `${input.roomId}:${input.winner ?? "ongoing"}:${input.lastMoveNumber ?? 0}:${input.lastMoveTimestamp ?? 0}`;
}

export function evaluateWinLineDirector(input: WinLineDirectorInput): WinLineDirectorDecision | null {
  if (!input.winningLine || input.winningLine.length === 0) {
    return null;
  }

  const coordinates = input.winningLine.map((index) => fromLinearIndex(index, input.size));
  const lineType = classifyLineType(coordinates);

  return {
    lineType,
    lineLabel: describeWinLineType(lineType),
    focusCoordinate: centerCoordinate(coordinates),
    shouldAnimate: !input.preferReducedMotion && lineType !== "unknown" && coordinates.length >= 3
  };
}
