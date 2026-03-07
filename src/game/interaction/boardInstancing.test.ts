import { describe, expect, it } from "vitest";
import {
  buildBoardInstanceLayout,
  resolveBoardInstanceCell,
  type BuildBoardInstanceLayoutInput
} from "./boardInstancing";

function createInput(overrides?: Partial<BuildBoardInstanceLayoutInput>): BuildBoardInstanceLayoutInput {
  const size = 3;
  const board = Array.from({ length: size * size * size }, () => 0);
  board[1] = 1;
  board[9] = 2;

  return {
    board,
    size,
    canPlace: true,
    focusLayer: 1,
    hoveredIndex: 12,
    nonFocusLayerOpacity: 0.4,
    emptyCellOpacityScale: 1,
    winningIndexes: new Set([1, 12]),
    hintMap: new Map([
      [
        12,
        {
          rank: 0,
          color: "#ffe768"
        }
      ],
      [
        13,
        {
          rank: 1,
          color: "#ff8ca4"
        }
      ]
    ]),
    winLineCinematicActive: false,
    ...overrides
  };
}

function normalizeLayout(input: ReturnType<typeof buildBoardInstanceLayout>) {
  return input.buckets.map((bucket) => ({
    id: bucket.id,
    style: bucket.style,
    boardIndexes: bucket.instances.map((instance) => instance.boardIndex)
  }));
}

describe("buildBoardInstanceLayout", () => {
  it("creates reversible mapping between board index and instance id", () => {
    const input = createInput();
    const layout = buildBoardInstanceLayout(input);

    expect(layout.totalInstances).toBe(input.board.length);
    for (let boardIndex = 0; boardIndex < input.board.length; boardIndex += 1) {
      const lookup = layout.indexToInstance.get(boardIndex);
      expect(lookup).toBeDefined();
      const bucket = layout.buckets.find((candidate) => candidate.id === lookup?.bucketId);
      expect(bucket).toBeDefined();
      const resolved = resolveBoardInstanceCell(bucket!, lookup!.instanceId);
      expect(resolved?.boardIndex).toBe(boardIndex);
    }
  });

  it("returns null for invalid instance boundaries", () => {
    const layout = buildBoardInstanceLayout(createInput());
    const bucket = layout.buckets[0];
    expect(bucket).toBeDefined();

    expect(resolveBoardInstanceCell(bucket, -1)).toBeNull();
    expect(resolveBoardInstanceCell(bucket, bucket.instances.length)).toBeNull();
    expect(resolveBoardInstanceCell(bucket, undefined)).toBeNull();
  });

  it("keeps bucket output stable for same board snapshot", () => {
    const input = createInput({
      winningIndexes: new Set([1, 12]),
      hintMap: new Map([
        [
          12,
          {
            rank: 0,
            color: "#ffe768"
          }
        ],
        [
          13,
          {
            rank: 1,
            color: "#ff8ca4"
          }
        ]
      ])
    });

    const layoutA = buildBoardInstanceLayout(input);
    const layoutB = buildBoardInstanceLayout(createInput());

    expect(normalizeLayout(layoutA)).toEqual(normalizeLayout(layoutB));
  });

  it("only marks current focus layer empty cells as interactive", () => {
    const size = 4;
    const layout = buildBoardInstanceLayout(
      createInput({
        size,
        board: Array.from({ length: size * size * size }, () => 0),
        focusLayer: 2,
        hoveredIndex: null,
        hintMap: new Map(),
        winningIndexes: new Set()
      })
    );

    const interactiveEntries = layout.buckets
      .filter((bucket) => bucket.style.interactive)
      .flatMap((bucket) => bucket.instances);

    expect(interactiveEntries).toHaveLength(size * size);
    expect(interactiveEntries.every((entry) => entry.coordinate.z === 2)).toBe(true);
  });
});
