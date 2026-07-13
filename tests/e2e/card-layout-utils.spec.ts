import { expect, test } from '@playwright/test';
import type { CardCanvasCard } from '../../src';
import {
  getMindMapLayoutMode,
  normalizeMindMapLayout,
  shouldNormalizeMindMapAfterCardUpdate,
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
      {
        ...makeCard('grandchild', 'child'),
        x: -500,
        y: 900,
        width: 120,
        height: 70,
      },
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
      {
        ...makeCard('free-child', 'root'),
        x: 500,
        y: 500,
        width: 100,
        height: 80,
      },
      {
        ...makeCard('descendant', 'free-child'),
        x: 530,
        y: 560,
        width: 90,
        height: 60,
      },
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
    // Given: no cards and a free-mode hierarchy.
    const freeCards = freezeCards([
      { ...makeCard('root'), x: 10, y: 20 },
      { ...makeCard('child', 'root'), x: 30, y: 40 },
    ]);

    // When: normalization has no mind-map parent to process.
    const emptyResult = normalizeMindMapLayout([]);
    const freeResult = normalizeMindMapLayout(freeCards);

    // Then: no coordinate changes are introduced.
    expect(emptyResult).toEqual([]);
    expect(freeResult).toEqual(freeCards);
  });

  test('normalizes missing child layout mode to free', () => {
    // Given: cards with absent and explicit layout modes.
    const missingModeCard = makeCard('missing');
    const freeModeCard = {
      ...makeCard('free'),
      childrenLayoutMode: 'free',
    } satisfies CardCanvasCard;
    const mindMapCard = {
      ...makeCard('mind-map'),
      childrenLayoutMode: 'mind-map-horizontal',
    } satisfies CardCanvasCard;

    // When / Then: the helper returns the effective mode.
    expect(getMindMapLayoutMode(missingModeCard)).toBe('free');
    expect(getMindMapLayoutMode(freeModeCard)).toBe('free');
    expect(getMindMapLayoutMode(mindMapCard)).toBe('mind-map-horizontal');
  });

  test('normalizes card patches only when layout fields change', () => {
    // Given: a mind-map parent receives either content-only or geometric updates.
    const before = {
      ...makeCard('parent'),
      childrenLayoutMode: 'mind-map-horizontal',
    } satisfies CardCanvasCard;

    // When / Then: display data does not reflow the tree, while geometry does.
    expect(
      shouldNormalizeMindMapAfterCardUpdate(
        before,
        { ...before, title: 'Updated title' },
        [before]
      )
    ).toBe(false);
    expect(
      shouldNormalizeMindMapAfterCardUpdate(
        before,
        { ...before, width: before.width + 40 },
        [before]
      )
    ).toBe(true);

    // And: switching to free mode intentionally preserves existing child positions.
    expect(
      shouldNormalizeMindMapAfterCardUpdate(
        before,
        { ...before, childrenLayoutMode: 'free' },
        [before]
      )
    ).toBe(false);

    // And: resizing a managed child reflows its mind-map siblings.
    const child = { ...makeCard('child', before.id), width: 100 };
    expect(
      shouldNormalizeMindMapAfterCardUpdate(child, { ...child, width: 140 }, [
        before,
        child,
      ])
    ).toBe(true);

    // And: explicit free mode does not exempt a child managed by a mind-map parent.
    const explicitFreeChild = {
      ...child,
      childrenLayoutMode: 'free',
    } satisfies CardCanvasCard;
    expect(
      shouldNormalizeMindMapAfterCardUpdate(
        explicitFreeChild,
        { ...explicitFreeChild, height: 120 },
        [before, explicitFreeChild]
      )
    ).toBe(true);

    // And: removing a child still reflows its previous mind-map siblings.
    expect(
      shouldNormalizeMindMapAfterCardUpdate(
        child,
        { ...child, parent: undefined },
        [before, child]
      )
    ).toBe(true);
  });
});
