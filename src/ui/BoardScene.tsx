import { useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Line, OrbitControls, Sparkles, Stars } from "@react-three/drei";
import type { Mesh } from "three";
import type { Coordinate3D, MoveRecord, PlayerMark } from "../network/protocol";
import { fromLinearIndex } from "../game/engine/board";
import type { HintPriority, MoveHint } from "../game/engine/moveHints";
import type { LayoutMode } from "../game/interaction/deviceMode";
import type { QualityProfile } from "../game/interaction/qualityProfile";
import { createCameraTarget, useCameraAssist } from "../game/interaction/cameraAssist";
import { pickCell } from "../game/interaction/pickCell";

const BOARD_SPACING = 1.4;

interface BoardSceneProps {
  layoutMode: LayoutMode;
  board: number[];
  size: number;
  canPlace: boolean;
  qualityProfile: QualityProfile;
  lastMove: MoveRecord | null;
  winningLine: number[] | null;
  focusLayer: number | null;
  hintMoves: MoveHint[];
  pendingMove: {
    coordinate: Coordinate3D;
    player: PlayerMark;
  } | null;
  onPlace: (coordinate: Coordinate3D) => void;
}

interface CameraAssistControllerProps {
  size: number;
  lastMove: MoveRecord | null;
  canPlace: boolean;
  hintFocus: Coordinate3D | null;
}

interface HintMeta {
  priority: HintPriority;
  rank: number;
}

interface HintPulseProps {
  position: [number, number, number];
  color: string;
  opacity: number;
  speed: number;
  phase: number;
}

function colorForHintPriority(priority: HintPriority): string {
  if (priority === "win") {
    return "#ffe768";
  }
  if (priority === "block") {
    return "#ff8ca4";
  }
  return "#5cf0ff";
}

function HintPulse({ position, color, opacity, speed, phase }: HintPulseProps) {
  const pulseRef = useRef<Mesh>(null);

  useFrame(({ clock }) => {
    const pulseMesh = pulseRef.current;
    if (!pulseMesh) {
      return;
    }
    const progress = clock.getElapsedTime() * speed + phase;
    const scale = 1 + Math.sin(progress) * 0.22;
    pulseMesh.scale.set(scale, scale, scale);
  });

  return (
    <mesh ref={pulseRef} position={position}>
      <sphereGeometry args={[0.43, 18, 18]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} />
    </mesh>
  );
}

function layerToWorldZ(size: number, layer: number): number {
  const centerOffset = (size - 1) / 2;
  return (layer - centerOffset) * BOARD_SPACING;
}

function CameraAssistController({ size, lastMove, canPlace, hintFocus }: CameraAssistControllerProps) {
  const focusedCoordinate = canPlace
    ? hintFocus ?? (lastMove ? { x: lastMove.x, y: lastMove.y, z: lastMove.z } : null)
    : lastMove
      ? { x: lastMove.x, y: lastMove.y, z: lastMove.z }
      : null;

  const target = useMemo(
    () => createCameraTarget(size, focusedCoordinate),
    [canPlace, focusedCoordinate, hintFocus, lastMove, size]
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
  layoutMode,
  board,
  size,
  canPlace,
  qualityProfile,
  lastMove,
  winningLine,
  focusLayer,
  hintMoves,
  pendingMove,
  onPlace
}: BoardSceneProps) {
  const isMobileLayout = layoutMode === "mobile";
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const winningSet = useMemo(() => new Set(winningLine ?? []), [winningLine]);
  const pendingCellPosition = useMemo(() => {
    if (!pendingMove) {
      return null;
    }
    return toWorldPosition(size, pendingMove.coordinate);
  }, [pendingMove, size]);
  const pendingCellIndex = useMemo(() => {
    if (!pendingMove) {
      return null;
    }
    const { x, y, z } = pendingMove.coordinate;
    return x + y * size + z * size * size;
  }, [pendingMove, size]);
  const pendingCellStillEmpty = pendingCellIndex !== null ? board[pendingCellIndex] === 0 : false;
  const hintMap = useMemo(() => {
    const map = new Map<number, HintMeta>();
    hintMoves.forEach((hint, rank) => {
      map.set(hint.index, {
        priority: hint.priority,
        rank
      });
    });
    return map;
  }, [hintMoves]);
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
      <Canvas camera={{ position: isMobileLayout ? [10.4, 9.3, 10.4] : [9, 8, 9], fov: 42 }}>
        <color attach="background" args={["#040713"]} />
        <fog attach="fog" args={["#040713", 12, qualityProfile.fogFar]} />
        <ambientLight intensity={0.8} />
        <pointLight position={[9, 9, 6]} intensity={28} color="#40d9ff" />
        <pointLight position={[-8, -6, -10]} intensity={20} color="#ff45d4" />
        <Stars radius={80} depth={40} count={qualityProfile.starsCount} factor={4.2} fade saturation={0} />
        <Sparkles
          count={qualityProfile.sparklesCount}
          scale={[20, 20, 20]}
          speed={qualityProfile.sparklesSpeed}
          size={qualityProfile.sparklesSize}
          color="#5fe9ff"
        />

        <CameraAssistController
          size={size}
          lastMove={lastMove}
          canPlace={canPlace}
          hintFocus={hintMoves[0]?.coordinate ?? null}
        />
        <OrbitControls
          enablePan={false}
          minDistance={isMobileLayout ? 9.5 : 8}
          maxDistance={isMobileLayout ? 22 : 20}
          dampingFactor={0.09}
          rotateSpeed={isMobileLayout ? 0.42 : 0.58}
        />

        <group>
          {focusLayer !== null ? (
            <mesh position={[0, 0, layerToWorldZ(size, focusLayer)]}>
              <planeGeometry args={[size * BOARD_SPACING + 0.22, size * BOARD_SPACING + 0.22]} />
              <meshBasicMaterial color="#52dbff" transparent opacity={0.08} />
            </mesh>
          ) : null}
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
            const inFocusLayer = focusLayer === null || coordinate.z === focusLayer;
            const interactive = canPlace && isEmpty && inFocusLayer;
            const hint = isEmpty ? hintMap.get(index) : undefined;
            const hintColor = hint ? colorForHintPriority(hint.priority) : null;
            const layerOpacityFactor = focusLayer === null ? 1 : inFocusLayer ? 1 : 0.22;
            const color = value === 1 ? "#64f6ff" : value === 2 ? "#ff69d0" : "#182850";
            const emissiveBaseColor = value === 1 ? "#48ffff" : value === 2 ? "#ff52da" : "#4f8eff";
            const emissive = hintColor ?? emissiveBaseColor;
            const opacityBase = isEmpty
              ? (isHovered && interactive ? 0.65 : 0.24) * qualityProfile.emptyCellOpacityScale
              : 0.93;
            const opacity = opacityBase * layerOpacityFactor;
            const emissiveIntensityBase = isWinningCell
              ? 2.4
              : hint
                ? hint.rank === 0
                  ? 2.05
                  : 1.35
                : isHovered && interactive
                ? 1.3
                : value === 0
                  ? 0.4
                  : 0.9;
            const emissiveIntensity = emissiveIntensityBase * (inFocusLayer ? 1 : 0.5);
            const scale = hint?.rank === 0 ? 1.16 : isHovered && interactive ? 1.12 : 1;

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

          {hintMoves.map((hint, rank) => (
            <HintPulse
              key={hint.index}
              position={toWorldPosition(size, hint.coordinate)}
              color={colorForHintPriority(hint.priority)}
              opacity={(rank === 0 ? 0.45 : 0.25) * qualityProfile.hintPulseOpacityScale}
              speed={qualityProfile.hintPulseSpeed}
              phase={rank * 0.75}
            />
          ))}

          {pendingCellPosition && pendingMove && pendingCellStillEmpty ? (
            <mesh position={pendingCellPosition} scale={1.08}>
              <sphereGeometry args={[0.3, 32, 32]} />
              <meshStandardMaterial
                color={pendingMove.player === "X" ? "#74fdff" : "#ffa0dd"}
                emissive={pendingMove.player === "X" ? "#66ffff" : "#ff88de"}
                emissiveIntensity={1.45}
                transparent
                opacity={0.52}
                roughness={0.24}
                metalness={0.26}
              />
            </mesh>
          ) : null}

          {linePoints ? (
            <Line points={linePoints} color="#fff960" lineWidth={5.5} transparent opacity={0.95} />
          ) : null}
        </group>
      </Canvas>
    </div>
  );
}
