import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Line, OrbitControls, Sparkles, Stars } from "@react-three/drei";
import type { Mesh } from "three";
import type { Coordinate3D, PlayerMark } from "../network/protocol";
import { fromLinearIndex } from "../game/engine/board";
import type { HintPriority, MoveHint } from "../game/engine/moveHints";
import type { LayoutMode } from "../game/interaction/deviceMode";
import type { QualityProfile } from "../game/interaction/qualityProfile";
import { evaluateLayerTapAssist } from "../game/interaction/layerTapAssist";
import { pickCell } from "../game/interaction/pickCell";

const BOARD_SPACING = 1.4;

interface BoardSceneProps {
  layoutMode: LayoutMode;
  board: number[];
  size: number;
  canPlace: boolean;
  ambientEnabled: boolean;
  nonFocusLayerOpacity: number;
  qualityProfile: QualityProfile;
  opponentMoveCue: OpponentMoveCue | null;
  winningLine: number[] | null;
  winLineCinematicActive: boolean;
  focusLayer: number | null;
  hintMoves: MoveHint[];
  pendingMove: {
    coordinate: Coordinate3D;
    player: PlayerMark;
  } | null;
  onPlace: (coordinate: Coordinate3D) => void;
  onLayerWheel?: (deltaY: number) => boolean;
  onLayerSwipe?: (deltaY: number) => void;
  onUserRotate?: () => void;
}

interface OpponentMoveCue {
  coordinate: Coordinate3D;
  moveNumber: number;
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

interface OpponentMoveBlinkProps {
  position: [number, number, number];
}

function OpponentMoveBlink({ position }: OpponentMoveBlinkProps) {
  const ringRef = useRef<Mesh>(null);
  const glowRef = useRef<Mesh>(null);
  const startedAtSecondsRef = useRef<number | null>(null);

  useFrame(({ clock }) => {
    const ringMesh = ringRef.current;
    const glowMesh = glowRef.current;
    if (!ringMesh || !glowMesh) {
      return;
    }

    if (startedAtSecondsRef.current === null) {
      startedAtSecondsRef.current = clock.getElapsedTime();
    }
    const elapsed = clock.getElapsedTime() - startedAtSecondsRef.current;
    const flashPeriodSeconds = 0.28;
    const flashCount = 6;
    const maxDurationSeconds = flashPeriodSeconds * flashCount;

    if (elapsed >= maxDurationSeconds) {
      ringMesh.visible = false;
      glowMesh.visible = false;
      return;
    }

    const cycleProgress = (elapsed % flashPeriodSeconds) / flashPeriodSeconds;
    const cycleOn = cycleProgress < 0.52;
    const pulse = cycleOn ? 0.68 + (1 - cycleProgress / 0.52) * 0.32 : 0.1;
    ringMesh.visible = cycleOn;
    glowMesh.visible = true;
    ringMesh.scale.setScalar(1 + (1 - pulse) * 0.38);
    glowMesh.scale.setScalar(1 + (1 - pulse) * 0.18);

    const ringMaterial = ringMesh.material;
    const glowMaterial = glowMesh.material;
    if ("opacity" in ringMaterial) {
      ringMaterial.opacity = 0.18 + pulse * 0.72;
    }
    if ("opacity" in glowMaterial) {
      glowMaterial.opacity = 0.06 + pulse * 0.25;
    }
  });

  return (
    <group position={position}>
      <mesh ref={glowRef} scale={1.12}>
        <sphereGeometry args={[0.38, 28, 28]} />
        <meshBasicMaterial color="#ffe6a5" transparent opacity={0} />
      </mesh>
      <mesh ref={ringRef} scale={1.15}>
        <torusGeometry args={[0.48, 0.05, 18, 46]} />
        <meshBasicMaterial color="#fff19b" transparent opacity={0} />
      </mesh>
    </group>
  );
}

function layerToWorldZ(size: number, layer: number): number {
  const centerOffset = (size - 1) / 2;
  return (layer - centerOffset) * BOARD_SPACING;
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
  ambientEnabled,
  nonFocusLayerOpacity,
  qualityProfile,
  opponentMoveCue,
  winningLine,
  winLineCinematicActive,
  focusLayer,
  hintMoves,
  pendingMove,
  onPlace,
  onLayerWheel,
  onLayerSwipe,
  onUserRotate
}: BoardSceneProps) {
  const isMobileLayout = layoutMode === "mobile";
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [ambientReveal, setAmbientReveal] = useState(ambientEnabled ? 1 : 0);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const cellSegments = Math.max(10, qualityProfile.cellSegments);
  const visibleHintMoves = useMemo(
    () => hintMoves.slice(0, qualityProfile.maxHintPulseCount),
    [hintMoves, qualityProfile.maxHintPulseCount]
  );
  const visibleWinningPulseIndexes = useMemo(
    () => (winningLine ?? []).slice(0, qualityProfile.maxWinningPulseCount),
    [qualityProfile.maxWinningPulseCount, winningLine]
  );
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
    visibleHintMoves.forEach((hint, rank) => {
      map.set(hint.index, {
        priority: hint.priority,
        rank
      });
    });
    return map;
  }, [visibleHintMoves]);
  const linePoints = useMemo(() => {
    if (!winningLine) {
      return null;
    }
    return winningLine.map((index) => {
      const coordinate = fromLinearIndex(index, size);
      return toWorldPosition(size, coordinate);
    });
  }, [size, winningLine]);
  const winningPulsePoints = useMemo(() => {
    if (!winLineCinematicActive || visibleWinningPulseIndexes.length === 0) {
      return [] as [number, number, number][];
    }
    return visibleWinningPulseIndexes.map((index) => {
      const coordinate = fromLinearIndex(index, size);
      return toWorldPosition(size, coordinate);
    });
  }, [size, visibleWinningPulseIndexes, winLineCinematicActive]);
  const opponentMoveBlinkPosition = useMemo(() => {
    if (!opponentMoveCue) {
      return null;
    }
    return toWorldPosition(size, opponentMoveCue.coordinate);
  }, [opponentMoveCue, size]);
  const otherLayerOpacity = Math.max(0.02, Math.min(1, nonFocusLayerOpacity));

  useEffect(() => {
    if (canPlace) {
      return;
    }
    setHoveredIndex(null);
  }, [canPlace]);

  useEffect(() => {
    if (!ambientEnabled) {
      setAmbientReveal(0);
      return;
    }

    let rafId = 0;
    let stopped = false;

    const reveal = () => {
      setAmbientReveal((current) => {
        const next = Math.min(1, current + 0.08);
        if (next < 1 && !stopped) {
          rafId = window.requestAnimationFrame(reveal);
        }
        return next;
      });
    };

    rafId = window.requestAnimationFrame(reveal);
    return () => {
      stopped = true;
      window.cancelAnimationFrame(rafId);
    };
  }, [ambientEnabled]);

  const ambientMix = ambientEnabled ? ambientReveal : 0;
  const starsCount = Math.round(qualityProfile.starsCount * ambientMix);
  const sparklesCount = Math.round(qualityProfile.sparklesCount * ambientMix);

  return (
    <div
      className="board-scene"
      onWheel={(event) => {
        if (!onLayerWheel) {
          return;
        }
        if (event.deltaY === 0) {
          return;
        }
        const handled = onLayerWheel(event.deltaY);
        if (handled) {
          event.preventDefault();
        }
      }}
      onTouchStart={(event) => {
        const touch = event.changedTouches[0];
        if (!touch) {
          return;
        }
        touchStartRef.current = {
          x: touch.clientX,
          y: touch.clientY
        };
      }}
      onTouchEnd={(event) => {
        if (!onLayerSwipe || !touchStartRef.current) {
          touchStartRef.current = null;
          return;
        }
        const touch = event.changedTouches[0];
        if (!touch) {
          touchStartRef.current = null;
          return;
        }
        const start = touchStartRef.current;
        const deltaX = touch.clientX - start.x;
        const deltaY = touch.clientY - start.y;
        touchStartRef.current = null;
        if (Math.abs(deltaY) <= Math.abs(deltaX) * 1.1) {
          return;
        }
        onLayerSwipe(deltaY);
      }}
    >
      <Canvas camera={{ position: isMobileLayout ? [10.4, 9.3, 10.4] : [9, 8, 9], fov: 42 }}>
        <color attach="background" args={["#040713"]} />
        <fog attach="fog" args={["#040713", 12, qualityProfile.fogFar]} />
        <ambientLight intensity={0.72 + ambientMix * 0.08} />
        <pointLight position={[9, 9, 6]} intensity={16 + ambientMix * 12} color="#40d9ff" />
        <pointLight position={[-8, -6, -10]} intensity={12 + ambientMix * 8} color="#ff45d4" />
        {starsCount > 0 ? (
          <Stars radius={80} depth={40} count={starsCount} factor={4.2} fade saturation={0} />
        ) : null}
        {qualityProfile.sparklesEnabled && sparklesCount > 0 ? (
          <Sparkles
            count={sparklesCount}
            scale={[20, 20, 20]}
            speed={qualityProfile.sparklesSpeed}
            size={qualityProfile.sparklesSize}
            color="#5fe9ff"
          />
        ) : null}
        <OrbitControls
          enablePan={false}
          minDistance={isMobileLayout ? 9.5 : 8}
          maxDistance={isMobileLayout ? 22 : 20}
          dampingFactor={0.09}
          rotateSpeed={isMobileLayout ? 0.42 : 0.58}
          onStart={onUserRotate}
        />

        <group>
          {focusLayer !== null ? (
            <mesh position={[0, 0, layerToWorldZ(size, focusLayer)]}>
              <planeGeometry args={[size * BOARD_SPACING + 0.22, size * BOARD_SPACING + 0.22]} />
              <meshBasicMaterial color="#52dbff" transparent opacity={0.08} />
            </mesh>
          ) : null}

          {board.map((value, index) => {
            const coordinate = fromLinearIndex(index, size);
            const isHovered = hoveredIndex === index;
            const isWinningCell = winningSet.has(index);
            const isEmpty = value === 0;
            const inFocusLayer = focusLayer === null || coordinate.z === focusLayer;
            const interactive = canPlace && isEmpty && inFocusLayer;
            const hint = isEmpty ? hintMap.get(index) : undefined;
            const hintColor = hint ? colorForHintPriority(hint.priority) : null;
            const layerOpacityFactor = focusLayer === null ? 1 : inFocusLayer ? 1 : otherLayerOpacity;
            const color = value === 1 ? "#64f6ff" : value === 2 ? "#ff69d0" : "#182850";
            const emissiveBaseColor = value === 1 ? "#48ffff" : value === 2 ? "#ff52da" : "#4f8eff";
            const emissive = hintColor ?? emissiveBaseColor;
            const opacityBase = isEmpty
              ? (isHovered && interactive ? 0.65 : 0.24) * qualityProfile.emptyCellOpacityScale
              : 0.93;
            const opacity = opacityBase * layerOpacityFactor;
            const emissiveIntensityBase = isWinningCell
              ? winLineCinematicActive
                ? 2.9
                : 2.3
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

            const interactiveProps = interactive
              ? {
                  onPointerEnter: (event: { stopPropagation: () => void }) => {
                    event.stopPropagation();
                    setHoveredIndex(index);
                  },
                  onPointerMove: (event: { stopPropagation: () => void }) => {
                    event.stopPropagation();
                    setHoveredIndex(index);
                  },
                  onPointerLeave: (event: { stopPropagation: () => void }) => {
                    event.stopPropagation();
                    setHoveredIndex((current) => (current === index ? null : current));
                  },
                  onClick: (event: {
                    stopPropagation: () => void;
                    intersections: {
                      object: unknown;
                    }[];
                    object: unknown;
                  }) => {
                    event.stopPropagation();
                    const coordinateFromHit = pickCell(
                      event.intersections.find((intersection) => intersection.object === event.object)
                    );
                    if (!coordinateFromHit) {
                      return;
                    }
                    const tapAssistDecision = evaluateLayerTapAssist({
                      canPlace,
                      isEmpty,
                      inFocusLayer,
                      targetLayer: coordinateFromHit.z,
                      currentLayer: focusLayer
                    });
                    if (tapAssistDecision.action === "place") {
                      onPlace(coordinateFromHit);
                    }
                  }
                }
              : {};

            return (
              <mesh
                key={index}
                position={toWorldPosition(size, coordinate)}
                userData={{ cell: coordinate }}
                scale={scale}
                {...interactiveProps}
              >
                <sphereGeometry args={[0.29, cellSegments, cellSegments]} />
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

          {visibleHintMoves.map((hint, rank) => (
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
              <sphereGeometry args={[0.3, cellSegments, cellSegments]} />
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

          {winningPulsePoints.map((position, index) => (
            <HintPulse
              key={`win-pulse-${index}`}
              position={position}
              color="#fff48b"
              opacity={0.36 * qualityProfile.hintPulseOpacityScale}
              speed={Math.max(2.1, qualityProfile.hintPulseSpeed)}
              phase={index * 0.55}
            />
          ))}

          {opponentMoveBlinkPosition && opponentMoveCue ? (
            <OpponentMoveBlink
              key={`opponent-move-cue-${opponentMoveCue.moveNumber}`}
              position={opponentMoveBlinkPosition}
            />
          ) : null}

          {linePoints ? (
            <Line
              points={linePoints}
              color="#fff960"
              lineWidth={winLineCinematicActive ? 6.8 : 5.5}
              transparent
              opacity={winLineCinematicActive ? 1 : 0.95}
            />
          ) : null}
        </group>
      </Canvas>
    </div>
  );
}
