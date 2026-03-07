import type { Coordinate3D } from "../../network/protocol";
import type { Intersection } from "three";

export function pickCell(intersection: Intersection | undefined): Coordinate3D | null {
  if (!intersection) {
    return null;
  }
  const cell = intersection.object.userData.cell as Coordinate3D | undefined;
  if (!cell) {
    return null;
  }
  return {
    x: cell.x,
    y: cell.y,
    z: cell.z
  };
}
