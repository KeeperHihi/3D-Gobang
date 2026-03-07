import type { Coordinate3D, PlayerMark } from "../network/protocol";

export const DEFAULT_BOARD_SIZE = 8;
export const DEFAULT_CONNECT_COUNT = 5;

export type BoardCell = 0 | 1 | 2;

export const PLAYER_TO_BOARD_VALUE: Record<PlayerMark, BoardCell> = {
  X: 1,
  O: 2
};

export const BOARD_VALUE_TO_PLAYER: Record<BoardCell, PlayerMark | null> = {
  0: null,
  1: "X",
  2: "O"
};

export function boardVolume(size: number): number {
  return size * size * size;
}

export function createBoard(size: number = DEFAULT_BOARD_SIZE): BoardCell[] {
  return Array.from({ length: boardVolume(size) }, () => 0);
}

export function isCoordinateInsideBoard(coordinate: Coordinate3D, size: number): boolean {
  return (
    coordinate.x >= 0 &&
    coordinate.y >= 0 &&
    coordinate.z >= 0 &&
    coordinate.x < size &&
    coordinate.y < size &&
    coordinate.z < size
  );
}

export function toLinearIndex(coordinate: Coordinate3D, size: number): number {
  return coordinate.x + coordinate.y * size + coordinate.z * size * size;
}

export function fromLinearIndex(index: number, size: number): Coordinate3D {
  const layerSize = size * size;
  const z = Math.floor(index / layerSize);
  const rest = index - z * layerSize;
  const y = Math.floor(rest / size);
  const x = rest - y * size;
  return { x, y, z };
}

export function readCell(board: BoardCell[], coordinate: Coordinate3D, size: number): BoardCell {
  if (!isCoordinateInsideBoard(coordinate, size)) {
    return 0;
  }
  return board[toLinearIndex(coordinate, size)];
}

export function writeCell(
  board: BoardCell[],
  coordinate: Coordinate3D,
  player: PlayerMark,
  size: number
): boolean {
  if (!isCoordinateInsideBoard(coordinate, size)) {
    return false;
  }
  const index = toLinearIndex(coordinate, size);
  if (board[index] !== 0) {
    return false;
  }
  board[index] = PLAYER_TO_BOARD_VALUE[player];
  return true;
}

export function boardIsFull(board: BoardCell[]): boolean {
  return board.every((cell) => cell !== 0);
}
