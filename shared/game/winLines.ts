import type { Coordinate3D } from "../network/protocol";
import { isCoordinateInsideBoard, toLinearIndex } from "./board";

export const DIRECTION_VECTORS_3D: ReadonlyArray<Coordinate3D> = [
  { x: 1, y: 0, z: 0 },
  { x: 0, y: 1, z: 0 },
  { x: 0, y: 0, z: 1 },
  { x: 1, y: 1, z: 0 },
  { x: 1, y: -1, z: 0 },
  { x: 1, y: 0, z: 1 },
  { x: 1, y: 0, z: -1 },
  { x: 0, y: 1, z: 1 },
  { x: 0, y: 1, z: -1 },
  { x: 1, y: 1, z: 1 },
  { x: 1, y: 1, z: -1 },
  { x: 1, y: -1, z: 1 },
  { x: 1, y: -1, z: -1 }
];

export interface WinLinesIndex {
  size: number;
  connect: number;
  lines: number[][];
  cellToLines: number[][];
}

export function createWinLinesIndex(size: number, connect: number): WinLinesIndex {
  const lines: number[][] = [];
  const cellToLines = Array.from({ length: size * size * size }, () => [] as number[]);

  for (let x = 0; x < size; x += 1) {
    for (let y = 0; y < size; y += 1) {
      for (let z = 0; z < size; z += 1) {
        const start = { x, y, z };
        for (const direction of DIRECTION_VECTORS_3D) {
          const end = {
            x: start.x + direction.x * (connect - 1),
            y: start.y + direction.y * (connect - 1),
            z: start.z + direction.z * (connect - 1)
          };

          if (!isCoordinateInsideBoard(end, size)) {
            continue;
          }

          const line: number[] = [];
          for (let step = 0; step < connect; step += 1) {
            const coordinate = {
              x: start.x + direction.x * step,
              y: start.y + direction.y * step,
              z: start.z + direction.z * step
            };
            line.push(toLinearIndex(coordinate, size));
          }

          const lineIndex = lines.push(line) - 1;
          for (const cellIndex of line) {
            cellToLines[cellIndex].push(lineIndex);
          }
        }
      }
    }
  }

  return {
    size,
    connect,
    lines,
    cellToLines
  };
}
