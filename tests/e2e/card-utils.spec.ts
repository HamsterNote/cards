import { expect, test } from '@playwright/test';
import type { CardCanvasCard } from '../../src';
import {
  assignParentFromPoint,
  deleteCards,
  findParentCandidateId,
} from '../../src/utils/cards';

class CallbackRejectedError extends Error {
  constructor() {
    super('callback rejected');
    this.name = 'CallbackRejectedError';
  }
}

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

function cardIds(cards: readonly CardCanvasCard[]): string[] {
  return cards.map((card) => card.id);
}

test.describe('deleteCards utility', () => {
  test('deletes a leaf card while preserving surviving object identity', async () => {
    // Given: three immutable sibling cards.
    const root = makeCard('root');
    const leaf = makeCard('leaf');
    const sibling = makeCard('sibling');
    const cards = freezeCards([root, leaf, sibling]);
    const before = snapshotCards(cards);

    // When: the leaf card is deleted.
    const result = await deleteCards(cards, ['leaf']);

    // Then: only the requested leaf is removed and inputs are untouched.
    expect(cardIds(result)).toEqual(['root', 'sibling']);
    expect(result).toContain(root);
    expect(result).toContain(sibling);
    expectCardsUnchanged(cards, before);
  });

  test('recursively deletes parent, child, and grandchild cards', async () => {
    // Given: a three-level hierarchy plus one unrelated sibling.
    const root = makeCard('root');
    const child = makeCard('child', 'root');
    const grandchild = makeCard('grandchild', 'child');
    const sibling = makeCard('sibling');
    const cards = freezeCards([root, child, grandchild, sibling]);

    // When: the root parent is deleted.
    const result = await deleteCards(cards, ['root']);

    // Then: recursive descendants are deleted with the parent.
    expect(cardIds(result)).toEqual(['sibling']);
    expect(result).toContain(sibling);
  });

  test('proceeds without a callback', async () => {
    // Given: a single card and no callback.
    const cards = freezeCards([makeCard('leaf')]);

    // When: the card is deleted.
    const result = await deleteCards(cards, ['leaf']);

    // Then: deletion proceeds.
    expect(result).toEqual([]);
  });

  test('aborts when callback returns false and returns the original cards reference', async () => {
    // Given: an immutable parent hierarchy.
    const cards = freezeCards([makeCard('root'), makeCard('child', 'root')]);
    const before = snapshotCards(cards);

    // When: the callback rejects the deletion by returning false.
    const result = await deleteCards(cards, ['root'], async () => false);

    // Then: the original array reference and card objects are preserved.
    expect(result).toBe(cards);
    expectCardsUnchanged(cards, before);
  });

  test('proceeds when callback returns true', async () => {
    // Given: a card guarded by a confirming callback.
    const cards = freezeCards([makeCard('leaf')]);

    // When: the callback allows deletion.
    const result = await deleteCards(cards, ['leaf'], async () => true);

    // Then: deletion proceeds.
    expect(result).toEqual([]);
  });

  test('passes normalized requested ids and hasChildren metadata to the callback', async () => {
    // Given: duplicate requested ids for a parent that has recursive descendants.
    const cards = freezeCards([
      makeCard('root'),
      makeCard('child', 'root'),
      makeCard('grandchild', 'child'),
    ]);
    const callbackInputs: {
      readonly ids: readonly string[];
      readonly hasChildren: boolean;
      readonly cardsReference: readonly CardCanvasCard[];
    }[] = [];

    // When: deletion is confirmed by the callback.
    const result = await deleteCards(
      cards,
      ['root', 'root'],
      async (callbackCards, ids, meta) => {
        callbackInputs.push({
          ids,
          hasChildren: meta.hasChildren,
          cardsReference: callbackCards,
        });
        return true;
      }
    );

    // Then: callback receives original normalized ids, not descendant-expanded ids.
    expect(result).toEqual([]);
    expect(callbackInputs).toHaveLength(1);
    expect(callbackInputs[0]?.ids).toEqual(['root']);
    expect(callbackInputs[0]?.hasChildren).toBe(true);
    expect(callbackInputs[0]?.cardsReference).toBe(cards);
  });

  test('handles duplicate requested delete ids once', async () => {
    // Given: duplicate parent and child ids in the delete request.
    const cards = freezeCards([
      makeCard('root'),
      makeCard('child', 'root'),
      makeCard('sibling'),
    ]);
    const callbackIds: string[][] = [];

    // When: deletion is requested with duplicates.
    const result = await deleteCards(
      cards,
      ['root', 'root', 'child', 'child'],
      async (_callbackCards, ids) => {
        callbackIds.push([...ids]);
        return true;
      }
    );

    // Then: callback sees each requested existing id once and deletion is not duplicated.
    expect(callbackIds).toEqual([['root', 'child']]);
    expect(cardIds(result)).toEqual(['sibling']);
  });

  test('returns original cards reference for empty or nonexistent ids without callback', async () => {
    // Given: an immutable card collection and a callback that must not run for no-op requests.
    const cards = freezeCards([makeCard('root')]);
    let callbackCalls = 0;

    // When: delete requests contain no existing ids.
    const emptyResult = await deleteCards(cards, [], async () => {
      callbackCalls += 1;
      return true;
    });
    const missingResult = await deleteCards(cards, ['missing'], async () => {
      callbackCalls += 1;
      return true;
    });

    // Then: both operations are no-ops and do not ask for confirmation.
    expect(emptyResult).toBe(cards);
    expect(missingResult).toBe(cards);
    expect(callbackCalls).toBe(0);
  });

  test('rejects when callback rejects and leaves input unchanged', async () => {
    // Given: an immutable parent hierarchy and a rejecting callback.
    const cards = freezeCards([makeCard('root'), makeCard('child', 'root')]);
    const before = snapshotCards(cards);

    // When / Then: the callback rejection propagates and input data is unchanged.
    await expect(
      deleteCards(cards, ['root'], async () => {
        throw new CallbackRejectedError();
      })
    ).rejects.toBeInstanceOf(CallbackRejectedError);
    expectCardsUnchanged(cards, before);
  });

  test('treats parent empty string as no parent', async () => {
    // Given: a card with parent: '' that should behave as a root card.
    const root = makeCard('root');
    const emptyParent = makeCard('empty-parent', '');
    const child = makeCard('child', 'root');
    const cards = freezeCards([root, emptyParent, child]);

    // When: the real root is deleted.
    const result = await deleteCards(cards, ['root']);

    // Then: the empty-string parent card is not treated as a descendant.
    expect(cardIds(result)).toEqual(['empty-parent']);
    expect(result).toContain(emptyParent);
  });
});

test.describe('findParentCandidateId utility', () => {
  test('returns the containing card id for a simple valid parent candidate', () => {
    // Given: a dragged card center inside a separate parent card.
    const dragged = { ...makeCard('dragged'), x: 200, y: 200 };
    const parent = {
      ...makeCard('parent'),
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    };

    // When: candidate lookup runs for a point inside the parent bounds.
    const result = findParentCandidateId([dragged, parent], 'dragged', {
      x: 50,
      y: 50,
    });

    // Then: the parent is selected as the candidate.
    expect(result).toBe('parent');
  });

  test('excludes the dragged card itself', () => {
    // Given: the dragged card contains its own center point.
    const dragged = {
      ...makeCard('dragged'),
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    };

    // When: candidate lookup runs for a point inside the dragged card.
    const result = findParentCandidateId([dragged], 'dragged', {
      x: 50,
      y: 50,
    });

    // Then: self cannot become a parent candidate.
    expect(result).toBeUndefined();
  });

  test('excludes recursive descendants to prevent cycles', () => {
    // Given: child is already a descendant of root.
    const root = { ...makeCard('root'), x: 200, y: 200 };
    const child = {
      ...makeCard('child', 'root'),
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    };
    const grandchild = makeCard('grandchild', 'child');

    // When: root is dragged over its child.
    const result = findParentCandidateId([root, child, grandchild], 'root', {
      x: 50,
      y: 50,
    });

    // Then: descendant cards are invalid candidates.
    expect(result).toBeUndefined();
  });

  test('chooses the highest zIndex candidate when cards overlap', () => {
    // Given: two valid parent cards overlap at the same point.
    const dragged = { ...makeCard('dragged'), x: 200, y: 200 };
    const lower = { ...makeCard('lower'), x: 0, y: 0, zIndex: 1 };
    const higher = { ...makeCard('higher'), x: 0, y: 0, zIndex: 2 };

    // When: candidate lookup runs inside both cards.
    const result = findParentCandidateId([dragged, higher, lower], 'dragged', {
      x: 60,
      y: 60,
    });

    // Then: zIndex wins over array order.
    expect(result).toBe('higher');
  });

  test('chooses the later array item when overlapping candidates tie by zIndex', () => {
    // Given: two valid parent cards overlap with equal zIndex.
    const dragged = { ...makeCard('dragged'), x: 200, y: 200 };
    const earlier = { ...makeCard('earlier'), x: 0, y: 0, zIndex: 3 };
    const later = { ...makeCard('later'), x: 0, y: 0, zIndex: 3 };

    // When: candidate lookup runs inside both cards.
    const result = findParentCandidateId([dragged, earlier, later], 'dragged', {
      x: 60,
      y: 60,
    });

    // Then: later array order breaks the tie.
    expect(result).toBe('later');
  });
});

test.describe('assignParentFromPoint utility', () => {
  test('raises the entire dragged subtree above its new parent', () => {
    // Given: a subtree descendant is below both its root and the new parent.
    const dragged = { ...makeCard('dragged'), x: 200, zIndex: 10 };
    const descendant = { ...makeCard('descendant', 'dragged'), zIndex: 1 };
    const parent = {
      ...makeCard('parent'),
      width: 100,
      height: 100,
      zIndex: 20,
    };

    // When: the subtree root is assigned to the new parent.
    const result = assignParentFromPoint(
      [dragged, descendant, parent],
      'dragged',
      { x: 50, y: 50 }
    );

    // Then: every card in the subtree remains above the new parent.
    const nextDragged = result.cards.find((card) => card.id === 'dragged');
    const nextDescendant = result.cards.find(
      (card) => card.id === 'descendant'
    );
    expect(nextDragged?.parent).toBe('parent');
    expect(nextDragged?.zIndex).toBeGreaterThan(parent.zIndex);
    expect(nextDescendant?.zIndex).toBeGreaterThan(parent.zIndex);
  });
});
