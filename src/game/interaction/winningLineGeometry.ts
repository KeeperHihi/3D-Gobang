export type LinePoint3 = [number, number, number];

export function createWinningLinePositionBuffer(points: LinePoint3[] | null): Float32Array | null {
  if (!points || points.length < 2) {
    return null;
  }

  const flat = new Float32Array(points.length * 3);
  for (let index = 0; index < points.length; index += 1) {
    const [x, y, z] = points[index];
    const base = index * 3;
    flat[base] = x;
    flat[base + 1] = y;
    flat[base + 2] = z;
  }
  return flat;
}
