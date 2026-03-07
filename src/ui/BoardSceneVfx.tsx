import { Line, Sparkles, Stars } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type { Mesh } from "three";
import type { QualityProfile } from "../game/interaction/qualityProfile";
import type { BoardSceneVfxStage } from "../game/interaction/vfxStage";

interface BoardSceneVfxProps {
  vfxStage: BoardSceneVfxStage;
  qualityProfile: QualityProfile;
  ambientMix: number;
  linePoints: [number, number, number][] | null;
  winLineCinematicActive: boolean;
  winningPulsePoints: [number, number, number][];
}

interface VfxPulseProps {
  position: [number, number, number];
  opacity: number;
  speed: number;
  phase: number;
}

function VfxPulse({ position, opacity, speed, phase }: VfxPulseProps) {
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
      <meshBasicMaterial color="#fff48b" transparent opacity={opacity} />
    </mesh>
  );
}

export function BoardSceneVfx({
  vfxStage,
  qualityProfile,
  ambientMix,
  linePoints,
  winLineCinematicActive,
  winningPulsePoints
}: BoardSceneVfxProps) {
  const starsCount = useMemo(
    () => Math.round(qualityProfile.starsCount * ambientMix),
    [ambientMix, qualityProfile.starsCount]
  );
  const sparklesCount = useMemo(() => {
    if (vfxStage !== "full") {
      return 0;
    }
    return Math.round(qualityProfile.sparklesCount * ambientMix);
  }, [ambientMix, qualityProfile.sparklesCount, vfxStage]);

  return (
    <>
      {starsCount > 0 ? (
        <Stars radius={80} depth={40} count={starsCount} factor={4.2} fade saturation={0} />
      ) : null}

      {vfxStage === "full" && qualityProfile.sparklesEnabled && sparklesCount > 0 ? (
        <Sparkles
          count={sparklesCount}
          scale={[20, 20, 20]}
          speed={qualityProfile.sparklesSpeed}
          size={qualityProfile.sparklesSize}
          color="#5fe9ff"
        />
      ) : null}

      {vfxStage === "full"
        ? winningPulsePoints.map((position, index) => (
            <VfxPulse
              key={`win-pulse-${index}`}
              position={position}
              opacity={0.36 * qualityProfile.hintPulseOpacityScale}
              speed={Math.max(2.1, qualityProfile.hintPulseSpeed)}
              phase={index * 0.55}
            />
          ))
        : null}

      {linePoints ? (
        <Line
          points={linePoints}
          color="#fff960"
          lineWidth={winLineCinematicActive ? 6.8 : 5.5}
          transparent
          opacity={winLineCinematicActive ? 1 : 0.95}
        />
      ) : null}
    </>
  );
}
