import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3 } from "three";
import type { Coordinate3D } from "../../network/protocol";

const BOARD_SPACING = 1.4;

export interface CameraTarget {
  position: Vector3;
  lookAt: Vector3;
}

function toWorldPosition(size: number, coordinate: Coordinate3D): Vector3 {
  const centerOffset = (size - 1) / 2;
  return new Vector3(
    (coordinate.x - centerOffset) * BOARD_SPACING,
    (coordinate.y - centerOffset) * BOARD_SPACING,
    (coordinate.z - centerOffset) * BOARD_SPACING
  );
}

export function createCameraTarget(size: number, focus: Coordinate3D | null): CameraTarget {
  const boardRadius = size * 1.8;
  if (!focus) {
    return {
      position: new Vector3(boardRadius, boardRadius * 0.95, boardRadius),
      lookAt: new Vector3(0, 0, 0)
    };
  }

  const focusWorld = toWorldPosition(size, focus);
  const xDirection = focusWorld.x >= 0 ? 1 : -1;
  const yDirection = focusWorld.y >= 0 ? 1 : -1;
  const zDirection = focusWorld.z >= 0 ? 1 : -1;

  const position = new Vector3(
    focusWorld.x + boardRadius * 0.55 * xDirection,
    focusWorld.y + boardRadius * 0.45 * yDirection,
    focusWorld.z + boardRadius * 0.55 * zDirection
  );

  return {
    position,
    lookAt: focusWorld
  };
}

export function useCameraAssist(target: CameraTarget, speed: number = 0.08) {
  const { camera } = useThree();
  const animatedLookAt = useRef(new Vector3(target.lookAt.x, target.lookAt.y, target.lookAt.z));
  const targetLookAt = useRef(new Vector3(target.lookAt.x, target.lookAt.y, target.lookAt.z));
  const targetPosition = useRef(new Vector3(target.position.x, target.position.y, target.position.z));

  useEffect(() => {
    targetPosition.current.copy(target.position);
    targetLookAt.current.copy(target.lookAt);
  }, [target]);

  useFrame(() => {
    camera.position.lerp(targetPosition.current, speed);
    animatedLookAt.current.lerp(targetLookAt.current, speed);
    camera.lookAt(animatedLookAt.current);
  });
}
