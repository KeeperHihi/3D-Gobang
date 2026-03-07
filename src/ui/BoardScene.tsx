import { useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Line, OrbitControls, Sparkles, Stars } from "@react-three/drei";
import type { Coordinate3D, MoveRecord } from "../network/protocol";
import { fromLinearIndex } from "../game/engine/board";
import { createCameraTarget, useCameraAssist } from "../game/interaction/cameraAssist";
import { pickCell } from "../game/interaction/pickCell";

const BOARD_SPACING = 1.4;

interface BoardSceneProps {
  board: number[];
  size: number;
  canPlace: boolean;
  lastMove: MoveRecord | null;
  winningLine: number[] | null;
  onPlace: (coordinate: Coordinate3D) => void;
}

interface CameraAssistControllerProps {
  size: number;
  lastMove: MoveRecord | null;
}

function CameraAssistController({ size, lastMove }: CameraAssistControllerProps) {
  const target = useMemo(
    () =>
      createCameraTarget(
        size,
        lastMove
          ? {
              x: lastMove.x,
              y: lastMove.y,
              z: lastMove.z
            }
          : null
      ),
    [size, lastMove]
  );
  useCameraAssist(target);
  return null;
}

function toWorldPosition(size: number, coordinate: Coordinate3D): [number, number, number] {
  const centerOffset = (size - 1) / 2;
  return [
    (coordinate.x - centerOffset) * BOARD_SPACING,
    (coordinate.y - centerOffset) * BOARD_SPACING,
    (coordinate.z - centerOffset) * BOARD_SPACING
  ];
}

export function BoardScene({
  board,
  size,
  canPlace,
  lastMove,
  winningLine,
  onPlace
}: BoardSceneProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const winningSet = useMemo(() => new Set(winningLine ?? []), [winningLine]);
  const linePoints = useMemo(() => {
    if (!winningLine) {
      return null;
    }
    return winningLine.map((index) => {
      const coordinate = fromLinearIndex(index, size);
      return toWorldPosition(size, coordinate);
    });
  }, [size, winningLine]);

  return (
    <div className="board-scene">
      <Canvas camera={{ position: [9, 8, 9], fov: 42 }}>
        <color attach="background" args={["#040713"]} />
        <fog attach="fog" args={["#040713", 12, 38]} />
        <ambientLight intensity={0.8} />
        <pointLight position={[9, 9, 6]} intensity={28} color="#40d9ff" />
        <pointLight position={[-8, -6, -10]} intensity={20} color="#ff45d4" />
        <Stars radius={80} depth={40} count={3000} factor={4.2} fade saturation={0} />
        <Sparkles count={160} scale={[20, 20, 20]} speed={0.35} size={2.2} color="#5fe9ff" />

        <CameraAssistController size={size} lastMove={lastMove} />
        <OrbitControls
          enablePan={false}
          minDistance={8}
          maxDistance={20}
          dampingFactor={0.09}
          rotateSpeed={0.58}
        />

        <group>
          <mesh>
            <boxGeometry
              args={[
                size * BOARD_SPACING + 0.9,
                size * BOARD_SPACING + 0.9,
                size * BOARD_SPACING + 0.9
              ]}
            />
            <meshStandardMaterial
              color="#5a90ff"
              emissive="#4f9fff"
              emissiveIntensity={0.35}
              wireframe
              transparent
              opacity={0.42}
            />
          </mesh>

          {board.map((value, index) => {
            const coordinate = fromLinearIndex(index, size);
            const isHovered = hoveredIndex === index;
            const isWinningCell = winningSet.has(index);
            const isEmpty = value === 0;
            const interactive = canPlace && isEmpty;
            const color = value === 1 ? "#64f6ff" : value === 2 ? "#ff69d0" : "#152446";
            const emissive = value === 1 ? "#48ffff" : value === 2 ? "#ff52da" : "#4f8eff";
            const opacity = isEmpty ? (isHovered ? 0.55 : 0.18) : 0.92;
            const emissiveIntensity = isWinningCell
              ? 2.4
              : isHovered && interactive
                ? 1.3
                : value === 0
                  ? 0.4
                  : 0.9;
            const scale = isHovered && interactive ? 1.12 : 1;

            return (
              <mesh
                key={index}
                position={toWorldPosition(size, coordinate)}
                userData={{ cell: coordinate }}
                scale={scale}
                onPointerOver={(event) => {
                  event.stopPropagation();
                  setHoveredIndex(index);
                }}
                onPointerOut={(event) => {
                  event.stopPropagation();
                  setHoveredIndex((current) => (current === index ? null : current));
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  if (!interactive) {
                    return;
                  }
                  const coordinateFromHit = pickCell(
                    event.intersections.find((intersection) => intersection.object === event.object)
                  );
                  if (!coordinateFromHit) {
                    return;
                  }
                  onPlace(coordinateFromHit);
                }}
              >
                <sphereGeometry args={[0.29, 32, 32]} />
                <meshStandardMaterial
                  color={color}
                  emissive={emissive}
                  emissiveIntensity={emissiveIntensity}
                  transparent
                  opacity={opacity}
                  roughness={0.17}
                  metalness={0.3}
                />
              </mesh>
            );
          })}

          {linePoints ? (
            <Line points={linePoints} color="#fff960" lineWidth={5.5} transparent opacity={0.95} />
          ) : null}
        </group>
      </Canvas>
    </div>
  );
}
