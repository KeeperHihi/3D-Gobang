import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { Line, OrbitControls, Sparkles, Stars } from "@react-three/drei";
import { Object3D, type InstancedMesh, type Mesh } from "three";
import type { Coordinate3D, PlayerMark } from "../network/protocol";
import { fromLinearIndex } from "../game/engine/board";
import type { HintPriority, MoveHint } from "../game/engine/moveHints";
import type { LayoutMode } from "../game/interaction/deviceMode";
import type { QualityProfile } from "../game/interaction/qualityProfile";
import {
  buildBoardInstanceLayout,
  resolveBoardInstanceCell,
  type BoardInstanceBucket
} from "../game/interaction/boardInstancing";
import { evaluateLayerTapAssist } from "../game/interaction/layerTapAssist";

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
  color: string;
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

interface HoverCellOverlayProps {
  position: [number, number, number];
  color: string;
  emphasized: boolean;
}

function HoverCellOverlay({ position, color, emphasized }: HoverCellOverlayProps) {
  const ringRef = useRef<Mesh>(null);
  const ringScale = emphasized ? 1.19 : 1.12;
  const glowScale = emphasized ? 1.13 : 1.08;

  useFrame(({ clock }) => {
    const ringMesh = ringRef.current;
    if (!ringMesh) {
      return;
    }
    const pulse = 1 + Math.sin(clock.getElapsedTime() * 6.2) * 0.04;
    ringMesh.scale.setScalar(ringScale * pulse);
  });

  return (
    <group position={position}>
      <mesh scale={glowScale}>
        <sphereGeometry args={[0.31, 18, 18]} />
        <meshBasicMaterial color={color} transparent opacity={0.17} depthWrite={false} />
      </mesh>
      <mesh ref={ringRef} scale={ringScale}>
        <torusGeometry args={[0.44, 0.042, 16, 44]} />
        <meshBasicMaterial color={color} transparent opacity={0.78} depthWrite={false} />
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

interface InstancedBoardBucketProps {
  bucket: BoardInstanceBucket;
  size: number;
  cellSegments: number;
  onPointerEnter?: (event: ThreeEvent<PointerEvent>) => void;
  onPointerMove?: (event: ThreeEvent<PointerEvent>) => void;
  onPointerLeave?: (event: ThreeEvent<PointerEvent>) => void;
  onClick?: (event: ThreeEvent<MouseEvent>) => void;
}

function InstancedBoardBucket({
  bucket,
  size,
  cellSegments,
  onPointerEnter,
  onPointerMove,
  onPointerLeave,
  onClick
}: InstancedBoardBucketProps) {
  const meshRef = useRef<InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) {
      return;
    }

    const centerOffset = (size - 1) / 2;
    const dummy = new Object3D();
    bucket.instances.forEach((instance, instanceId) => {
      const { x, y, z } = instance.coordinate;
      dummy.position.set(
        (x - centerOffset) * BOARD_SPACING,
        (y - centerOffset) * BOARD_SPACING,
        (z - centerOffset) * BOARD_SPACING
      );
      dummy.scale.setScalar(bucket.style.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(instanceId, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [bucket.instances, bucket.style.scale, size]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, bucket.instances.length]}
      onPointerEnter={onPointerEnter}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      onClick={onClick}
    >
      <sphereGeometry args={[0.29, cellSegments, cellSegments]} />
      <meshStandardMaterial
        color={bucket.style.color}
        emissive={bucket.style.emissive}
        emissiveIntensity={bucket.style.emissiveIntensity}
        transparent
        opacity={bucket.style.opacity}
        roughness={0.17}
        metalness={0.3}
      />
    </instancedMesh>
  );
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
      const color = colorForHintPriority(hint.priority);
      map.set(hint.index, {
        priority: hint.priority,
        rank,
        color
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
  const hoveredOverlay = useMemo(() => {
    if (hoveredIndex === null || !canPlace) {
      return null;
    }
    if (board[hoveredIndex] !== 0) {
      return null;
    }
    const coordinate = fromLinearIndex(hoveredIndex, size);
    if (focusLayer !== null && coordinate.z !== focusLayer) {
      return null;
    }
    const hint = hintMap.get(hoveredIndex);
    return {
      position: toWorldPosition(size, coordinate),
      color: hint?.color ?? "#66e7ff",
      emphasized: hint?.rank === 0
    };
  }, [board, canPlace, focusLayer, hintMap, hoveredIndex, size]);
  const boardInstanceLayout = useMemo(
    () =>
      buildBoardInstanceLayout({
        board,
        size,
        canPlace,
        focusLayer,
        nonFocusLayerOpacity,
        emptyCellOpacityScale: qualityProfile.emptyCellOpacityScale,
        winningIndexes: winningSet,
        hintMap,
        winLineCinematicActive
      }),
    [
      board,
      size,
      canPlace,
      focusLayer,
      nonFocusLayerOpacity,
      qualityProfile.emptyCellOpacityScale,
      winningSet,
      hintMap,
      winLineCinematicActive
    ]
  );

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

          {boardInstanceLayout.buckets.map((bucket) => {
            const interactive = bucket.style.interactive;

            return (
              <InstancedBoardBucket
                key={bucket.id}
                bucket={bucket}
                size={size}
                cellSegments={cellSegments}
                onPointerEnter={
                  interactive
                    ? (event) => {
                        event.stopPropagation();
                        const hit = resolveBoardInstanceCell(bucket, event.instanceId);
                        if (!hit) {
                          return;
                        }
                        setHoveredIndex((current) =>
                          current === hit.boardIndex ? current : hit.boardIndex
                        );
                      }
                    : undefined
                }
                onPointerMove={
                  interactive
                    ? (event) => {
                        event.stopPropagation();
                        const hit = resolveBoardInstanceCell(bucket, event.instanceId);
                        if (!hit) {
                          return;
                        }
                        setHoveredIndex((current) =>
                          current === hit.boardIndex ? current : hit.boardIndex
                        );
                      }
                    : undefined
                }
                onPointerLeave={
                  interactive
                    ? (event) => {
                        event.stopPropagation();
                        setHoveredIndex((current) => {
                          if (current === null) {
                            return null;
                          }
                          const hit = resolveBoardInstanceCell(bucket, event.instanceId);
                          if (hit && hit.boardIndex === current) {
                            return null;
                          }
                          const currentLookup = boardInstanceLayout.indexToInstance.get(current);
                          if (currentLookup?.bucketId === bucket.id) {
                            return null;
                          }
                          return current;
                        });
                      }
                    : undefined
                }
                onClick={
                  interactive
                    ? (event) => {
                        event.stopPropagation();
                        const hit = resolveBoardInstanceCell(bucket, event.instanceId);
                        if (!hit) {
                          return;
                        }
                        const inFocusLayer = focusLayer === null || hit.coordinate.z === focusLayer;
                        const isEmpty = board[hit.boardIndex] === 0;
                        const tapAssistDecision = evaluateLayerTapAssist({
                          canPlace,
                          isEmpty,
                          inFocusLayer,
                          targetLayer: hit.coordinate.z,
                          currentLayer: focusLayer
                        });
                        if (tapAssistDecision.action === "place") {
                          onPlace(hit.coordinate);
                        }
                      }
                    : undefined
                }
              />
            );
          })}

          {hoveredOverlay ? (
            <HoverCellOverlay
              position={hoveredOverlay.position}
              color={hoveredOverlay.color}
              emphasized={hoveredOverlay.emphasized}
            />
          ) : null}

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
