import { expect, test } from '@playwright/test';
import type { CardCanvasCard } from '../../src';
import {
  getMindMapLayoutMode,
  normalizeMindMapLayout,
} from '../../src/utils/card-layout';

function makeCard(id: string, parent?: string): CardCanvasCard {
  const baseCard = {
    id,
    title: `Title ${id}`,
    content: `Content ${id}`,
    x: 0,
    y: 0,
    width: 120,
    height: 80,
  };

  if (parent === undefined) {
    return baseCard;
  }

  return { ...baseCard, parent };
}

function freezeCards(cards: CardCanvasCard[]): CardCanvasCard[] {
  for (const card of cards) {
    Object.freeze(card);
  }
  Object.freeze(cards);
  return cards;
}

function snapshotCards(cards: readonly CardCanvasCard[]): string {
  return JSON.stringify(cards);
}

function expectCardsUnchanged(
  cards: readonly CardCanvasCard[],
  snapshot: string
): void {
  expect(JSON.stringify(cards)).toBe(snapshot);
}

test.describe('normalizeMindMapLayout utility', () => {
  test('positions two direct children with the deterministic horizontal formula', () => {
    // Given: a mind-map parent with two direct children in array order.
    const parent = {
      ...makeCard('parent'),
      width: 180,
      height: 120,
      childrenLayoutMode: 'mind-map-horizontal',
    } satisfies CardCanvasCard;
    const firstChild = { ...makeCard('c1', 'parent'), height: 80 };
    const secondChild = { ...makeCard('c2', 'parent'), height: 100 };
    const cards = freezeCards([parent, firstChild, secondChild]);

    // When: the pure layout normalizer runs.
    const result = normalizeMindMapLayout(cards);

    // Then: child positions exactly match the documented formula.
    expect(result.find((card) => card.id === 'c1')).toMatchObject({
      x: 228,
      y: -42,
    });
    expect(result.find((card) => card.id === 'c2')).toMatchObject({
      x: 228,
      y: 62,
    });
  });

  test('recursively normalizes nested mind-map descendants after moving their parent', () => {
    // Given: root and child both own horizontal mind-map children.
    const cards = freezeCards([
      {
        ...makeCard('root'),
        x: 10,
        y: -20,
        width: 180,
        height: 120,
        childrenLayoutMode: 'mind-map-horizontal',
      },
      {
        ...makeCard('child', 'root'),
        x: -200,
        y: 300,
        width: 160,
        height: 80,
        childrenLayoutMode: 'mind-map-horizontal',
      },
      { ...makeCard('grandchild', 'child'), x: -500, y: 900, width: 120, height: 70 },
    ]);

    // When: normalization repositions root's subtree.
    const result = normalizeMindMapLayout(cards);

    // Then: child is placed from root, and grandchild is placed from child's new position.
    expect(result.find((card) => card.id === 'child')).toMatchObject({
      x: 238,
      y: 0,
    });
    expect(result.find((card) => card.id === 'grandchild')).toMatchObject({
      x: 446,
      y: 5,
    });
  });

  test('moves a free-mode child subtree by child delta without laying out descendants', () => {
    // Given: a free-mode child has an offset descendant under a mind-map parent.
    const cards = freezeCards([
      {
        ...makeCard('root'),
        width: 180,
        height: 120,
        childrenLayoutMode: 'mind-map-horizontal',
      },
      // 显式指定 free 模式，否则默认 arrange 会重新排列后代卡片
      { ...makeCard('free-child', 'root'), x: 500, y: 500, width: 100, height: 80, childrenLayoutMode: 'free' as const },
      { ...makeCard('descendant', 'free-child'), x: 530, y: 560, width: 90, height: 60 },
    ]);

    // When: the free-mode child is moved into its canonical slot.
    const result = normalizeMindMapLayout(cards);

    // Then: descendant keeps the same relative offset from the child.
    expect(result.find((card) => card.id === 'free-child')).toMatchObject({
      x: 228,
      y: 20,
    });
    expect(result.find((card) => card.id === 'descendant')).toMatchObject({
      x: 258,
      y: 80,
    });
  });

  test('supports negative parent coordinates without rounding', () => {
    // Given: a mind-map parent with negative coordinates and one child.
    const cards = freezeCards([
      {
        ...makeCard('root'),
        x: -100.5,
        y: -50.25,
        width: 180,
        height: 121,
        childrenLayoutMode: 'mind-map-horizontal',
      },
      { ...makeCard('child', 'root'), height: 80 },
    ]);

    // When: layout uses pure number arithmetic.
    const result = normalizeMindMapLayout(cards);

    // Then: halves are preserved as JS numbers.
    expect(result.find((card) => card.id === 'child')?.x).toBeCloseTo(127.5);
    expect(result.find((card) => card.id === 'child')?.y).toBeCloseTo(-29.75);
  });

  test('does not mutate frozen input cards', () => {
    // Given: frozen cards that require coordinate updates.
    const cards = freezeCards([
      {
        ...makeCard('root'),
        width: 180,
        height: 120,
        childrenLayoutMode: 'mind-map-horizontal',
      },
      { ...makeCard('child', 'root'), x: 999, y: 999 },
    ]);
    const before = snapshotCards(cards);

    // When: normalization returns updated card copies.
    const result = normalizeMindMapLayout(cards);

    // Then: inputs are unchanged, while output contains canonical coordinates.
    expectCardsUnchanged(cards, before);
    expect(result).not.toBe(cards);
    expect(result.find((card) => card.id === 'child')).toMatchObject({
      x: 228,
      y: 20,
    });
  });

  test('centers a single child beside its parent', () => {
    // Given: one direct child under a horizontal mind-map parent.
    const cards = freezeCards([
      {
        ...makeCard('root'),
        x: 40,
        y: 30,
        width: 180,
        height: 120,
        childrenLayoutMode: 'mind-map-horizontal',
      },
      { ...makeCard('child', 'root'), width: 100, height: 80 },
    ]);

    // When: normalization runs.
    const result = normalizeMindMapLayout(cards);

    // Then: the child is horizontally offset and vertically centered.
    expect(result.find((card) => card.id === 'child')).toMatchObject({
      x: 268,
      y: 50,
    });
  });

  test('returns equivalent coordinates for empty and free-mode collections', () => {
    // Given: no cards and a free-mode hierarchy (explicit 'free' to test non-default mode).
    const freeCards = freezeCards([
      { ...makeCard('root'), x: 10, y: 20, childrenLayoutMode: 'free' },
      { ...makeCard('child', 'root'), x: 30, y: 40 },
    ]);

    // When: normalization has no mind-map parent to process.
    const emptyResult = normalizeMindMapLayout([]);
    const freeResult = normalizeMindMapLayout(freeCards);

    // Then: no coordinate changes are introduced.
    expect(emptyResult).toEqual([]);
    expect(freeResult).toEqual(freeCards);
  });

  test('normalizes missing child layout mode to arrange', () => {
    // Given: cards with absent and explicit layout modes.
    const missingModeCard = makeCard('missing');
    const freeModeCard = { ...makeCard('free'), childrenLayoutMode: 'free' } satisfies CardCanvasCard;
    const mindMapCard = {
      ...makeCard('mind-map'),
      childrenLayoutMode: 'mind-map-horizontal',
    } satisfies CardCanvasCard;
    const arrangeModeCard = {
      ...makeCard('arrange'),
      childrenLayoutMode: 'arrange',
    } satisfies CardCanvasCard;

    // When / Then: the helper returns the effective mode.
    expect(getMindMapLayoutMode(missingModeCard)).toBe('arrange');
    expect(getMindMapLayoutMode(freeModeCard)).toBe('free');
    expect(getMindMapLayoutMode(mindMapCard)).toBe('mind-map-horizontal');
    expect(getMindMapLayoutMode(arrangeModeCard)).toBe('arrange');
  });
});

test.describe('normalizeMindMapLayout — arrange mode', () => {
  test('places a single child at content-area top-left and expands parent height', () => {
    // Given: an arrange parent with one child.
    const cards = freezeCards([
      {
        ...makeCard('root'),
        x: 0,
        y: 0,
        width: 180,
        height: 120,
        childrenLayoutMode: 'arrange',
      },
      { ...makeCard('c1', 'root'), width: 120, height: 80 },
    ]);

    // When: normalization runs.
    const result = normalizeMindMapLayout(cards);

    // Then: child is at (contentLeft=13, contentTop=50) and parent height grows.
    expect(result.find((c) => c.id === 'c1')).toMatchObject({ x: 13, y: 50 });
    expect(result.find((c) => c.id === 'root')?.height).toBe(143);
  });

  test('places two children side by side in array order', () => {
    // Given: a wide arrange parent with two children.
    const cards = freezeCards([
      {
        ...makeCard('root'),
        x: 0,
        y: 0,
        width: 400,
        height: 120,
        childrenLayoutMode: 'arrange',
      },
      { ...makeCard('c1', 'root'), width: 120, height: 80 },
      { ...makeCard('c2', 'root'), width: 120, height: 80 },
    ]);

    const result = normalizeMindMapLayout(cards);

    // c1 at (13, 50); c2 at (13+120+12=145, 50)
    expect(result.find((c) => c.id === 'c1')).toMatchObject({ x: 13, y: 50 });
    expect(result.find((c) => c.id === 'c2')).toMatchObject({ x: 145, y: 50 });
  });

  test('wraps third child to a new row when it exceeds content width', () => {
    // Given: a narrow arrange parent (width=300 → contentRight=287) with three children.
    const cards = freezeCards([
      {
        ...makeCard('root'),
        x: 0,
        y: 0,
        width: 300,
        height: 120,
        childrenLayoutMode: 'arrange',
      },
      { ...makeCard('c1', 'root'), width: 120, height: 80 },
      { ...makeCard('c2', 'root'), width: 120, height: 80 },
      { ...makeCard('c3', 'root'), width: 120, height: 80 },
    ]);

    const result = normalizeMindMapLayout(cards);

    // c1 (13,50), c2 (145,50); c3 wraps to (13, 50+80+12=142)
    expect(result.find((c) => c.id === 'c1')).toMatchObject({ x: 13, y: 50 });
    expect(result.find((c) => c.id === 'c2')).toMatchObject({ x: 145, y: 50 });
    expect(result.find((c) => c.id === 'c3')).toMatchObject({ x: 13, y: 142 });
    // parent height expands to 235
    expect(result.find((c) => c.id === 'root')?.height).toBe(235);
  });

  test('appends a new child after existing children when added to array end', () => {
    // Given: an arrange parent with one already-normalized child.
    const initial = normalizeMindMapLayout(
      freezeCards([
        {
          ...makeCard('root'),
          x: 0,
          y: 0,
          width: 400,
          height: 120,
          childrenLayoutMode: 'arrange',
        },
        { ...makeCard('c1', 'root'), width: 120, height: 80 },
      ])
    );

    // When: a new child is appended to the end of the array and normalized.
    const newCard = { ...makeCard('c2', 'root'), width: 120, height: 80 };
    const result = normalizeMindMapLayout([...initial, newCard]);

    // Then: c1 stays at its slot and c2 is placed after c1.
    expect(result.find((c) => c.id === 'c1')).toMatchObject({ x: 13, y: 50 });
    expect(result.find((c) => c.id === 'c2')).toMatchObject({ x: 145, y: 50 });
  });

  test('does not mutate frozen input cards', () => {
    // Given: frozen arrange cards.
    const cards = freezeCards([
      {
        ...makeCard('root'),
        x: 0,
        y: 0,
        width: 180,
        height: 120,
        childrenLayoutMode: 'arrange',
      },
      { ...makeCard('c1', 'root'), x: 999, y: 999, width: 120, height: 80 },
    ]);
    const before = snapshotCards(cards);

    const result = normalizeMindMapLayout(cards);

    expectCardsUnchanged(cards, before);
    expect(result).not.toBe(cards);
    expect(result.find((c) => c.id === 'c1')).toMatchObject({ x: 13, y: 50 });
  });

  test('uses a nested arrange child final size when placing its next sibling', () => {
    // Given: the first child expands vertically while arranging its own children.
    const cards = freezeCards([
      {
        ...makeCard('root'),
        width: 300,
        height: 120,
        childrenLayoutMode: 'arrange',
      },
      {
        ...makeCard('nested', 'root'),
        width: 120,
        height: 80,
        childrenLayoutMode: 'arrange',
      },
      { ...makeCard('sibling', 'root'), width: 120, height: 80 },
      { ...makeCard('nested-child', 'nested'), width: 120, height: 160 },
    ]);

    // When: both arrange levels are normalized.
    const result = normalizeMindMapLayout(cards);

    // Then: the sibling wraps below the expanded nested card instead of overlapping it.
    expect(result.find((card) => card.id === 'nested')).toMatchObject({
      x: 13,
      y: 50,
      height: 223,
    });
    expect(result.find((card) => card.id === 'sibling')).toMatchObject({
      x: 13,
      y: 285,
    });
  });

  test('wraps a nested arrange child after its own layout expands its width', () => {
    // Given: a preceding sibling leaves enough room for the nested card's stale width only.
    const cards = freezeCards([
      {
        ...makeCard('root'),
        width: 400,
        height: 120,
        childrenLayoutMode: 'arrange',
      },
      { ...makeCard('first', 'root'), width: 120, height: 80 },
      {
        ...makeCard('nested', 'root'),
        width: 120,
        height: 80,
        childrenLayoutMode: 'arrange',
      },
      { ...makeCard('nested-child', 'nested'), width: 300, height: 80 },
    ]);

    // When: nested layout expands the second child's width during normalization.
    const result = normalizeMindMapLayout(cards);

    // Then: the expanded child wraps in the same pass and stays inside root content bounds.
    expect(result.find((card) => card.id === 'nested')).toMatchObject({
      x: 13,
      y: 142,
      width: 326,
    });
  });

  test('leaves free-mode and empty collections unchanged', () => {
    // Given: no cards and a free-mode hierarchy (explicit 'free' to test non-default mode).
    const freeCards = freezeCards([
      { ...makeCard('root'), x: 10, y: 20, childrenLayoutMode: 'free' },
      { ...makeCard('child', 'root'), x: 30, y: 40 },
    ]);

    const emptyResult = normalizeMindMapLayout([]);
    const freeResult = normalizeMindMapLayout(freeCards);

    expect(emptyResult).toEqual([]);
    expect(freeResult).toEqual(freeCards);
  });
});
