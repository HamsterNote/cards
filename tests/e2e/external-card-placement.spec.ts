import { expect, test } from '@playwright/test';
import type { CardCanvasCard } from '../../src';
import { placeExternalCandidateCard } from '../../src/utils/external-card-placement';

const contentInset = {
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
} as const;

function makeCard(id: string): CardCanvasCard {
  return {
    id,
    title: `Title ${id}`,
    content: `Content ${id}`,
    x: 0,
    y: 0,
    width: 120,
    height: 80,
  };
}

function getCard(cards: readonly CardCanvasCard[], id: string): CardCanvasCard {
  const card = cards.find((candidate) => candidate.id === id);
  if (card === undefined) {
    throw new TypeError(`Expected card ${id} to exist`);
  }

  return card;
}

test.describe('external candidate first placement', () => {
  test('clears an incoming parent and uses the supplied pointer-derived position with no parent candidate', () => {
    // Given: a frozen candidate has stale placement data and no existing cards can contain the release point.
    const candidate = Object.freeze({
      ...makeCard('candidate'),
      parent: 'stale-parent',
      x: -400,
      y: -300,
      zIndex: 7,
    });
    const cards = Object.freeze<CardCanvasCard[]>([]);

    // When: first placement receives its final pointer-derived card position.
    const result = placeExternalCandidateCard({
      cards,
      candidate,
      pointerPoint: { x: 500, y: 600 },
      cardPosition: { x: 320, y: 240 },
      contentInset,
    });

    // Then: it appends one unparented card and preserves the non-placement fields.
    expect(result.cards).toEqual([
      {
        id: candidate.id,
        title: candidate.title,
        content: candidate.content,
        x: 320,
        y: 240,
        width: candidate.width,
        height: candidate.height,
        zIndex: candidate.zIndex,
      },
    ]);
    expect(Object.hasOwn(result.card, 'parent')).toBe(false);
    expect(result.cards[0]).toBe(result.card);
    expect(cards).toEqual([]);
    expect(candidate).toMatchObject({
      parent: 'stale-parent',
      x: -400,
      y: -300,
    });
  });

  test('places a locked candidate into a free parent before its lock becomes active', () => {
    // Given: frozen inputs whose locked candidate carries stale geometry and nested fields.
    const parent = Object.freeze({
      ...makeCard('free-parent'),
      width: 100,
      height: 100,
      zIndex: 5,
      childrenLayoutMode: 'free' as const,
    });
    const linkedCardIds = Object.freeze(['related-card']);
    const contentBlocks = Object.freeze([
      Object.freeze({
        id: 'candidate-p0',
        kind: 'paragraph' as const,
        text: 'Nested',
      }),
    ]);
    const comments = Object.freeze([
      Object.freeze({
        id: 'comment-1',
        content: 'Preserve me',
        createdAt: 1,
        parentId: null,
      }),
    ]);
    const titleStyle = Object.freeze({ color: 'tomato' });
    const contentStyle = Object.freeze({ background: '#fff' });
    const candidate = Object.freeze({
      ...makeCard('candidate'),
      parent: 'stale-parent',
      headless: true,
      x: -400,
      y: -300,
      width: 80,
      height: 60,
      zIndex: 2,
      lock: true,
      contentBlocks,
      linkedCardIds,
      titleStyle,
      contentStyle,
      themeColor: '#d43d8f',
      childrenLayoutMode: 'free' as const,
      comments,
    });
    const cards = Object.freeze([parent]);

    // When: first placement targets the free parent at the candidate's computed position.
    const result = placeExternalCandidateCard({
      cards,
      candidate,
      pointerPoint: { x: 99, y: 99 },
      cardPosition: { x: 90, y: 80 },
      contentInset,
    });

    // Then: first placement applies legacy parent, z-index, and containment behavior before restoring lock.
    const placed = getCard(result.cards, candidate.id);
    expect(result.cards).toHaveLength(2);
    expect(result.cards.at(-1)).toBe(placed);
    expect(result.card).toBe(placed);
    expect(placed).toEqual({
      ...candidate,
      parent: parent.id,
      x: 90,
      y: 80,
      zIndex: 6,
    });
    expect(placed.linkedCardIds).toBe(linkedCardIds);
    expect(placed.contentBlocks).toBe(contentBlocks);
    expect(placed.titleStyle).toBe(titleStyle);
    expect(placed.contentStyle).toBe(contentStyle);
    expect(placed.comments).toBe(comments);
    expect(getCard(result.cards, parent.id)).toMatchObject({
      width: 170,
      height: 140,
    });
    expect(cards).toEqual([parent]);
    expect(candidate).toMatchObject({
      parent: 'stale-parent',
      x: -400,
      y: -300,
      lock: true,
    });
  });

  test('normalizes a candidate under a mind-map-horizontal parent', () => {
    // Given: a frozen horizontal mind-map parent and an external candidate at stale coordinates.
    const parent = Object.freeze({
      ...makeCard('mind-map-parent'),
      x: 10,
      y: 20,
      width: 100,
      height: 80,
      zIndex: 5,
      childrenLayoutMode: 'mind-map-horizontal' as const,
    });
    const candidate = Object.freeze({
      ...makeCard('candidate'),
      x: -400,
      y: -300,
      width: 60,
      height: 40,
      zIndex: 1,
      lock: true,
    });

    // When: first placement hits the parent but receives an arbitrary pre-normalization position.
    const result = placeExternalCandidateCard({
      cards: Object.freeze([parent]),
      candidate,
      pointerPoint: { x: 50, y: 50 },
      cardPosition: { x: 400, y: 300 },
      contentInset,
    });

    // Then: mind-map layout overrides the candidate geometry while retaining the appended final card.
    const placed = getCard(result.cards, candidate.id);
    expect(result.cards.at(-1)).toBe(placed);
    expect(result.card).toBe(placed);
    expect(placed).toMatchObject({
      parent: parent.id,
      x: 158,
      y: 40,
      zIndex: 6,
      lock: true,
    });
  });

  test('inserts a candidate into arrange sibling order and normalizes the flow', () => {
    // Given: a frozen arrange parent has one sibling after the release point in flow order.
    const parent = Object.freeze({
      ...makeCard('arrange-parent'),
      width: 400,
      height: 120,
      zIndex: 5,
      childrenLayoutMode: 'arrange' as const,
    });
    const sibling = Object.freeze({
      ...makeCard('existing-child'),
      parent: parent.id,
      x: 125,
      y: 50,
      width: 100,
      height: 50,
    });
    const candidate = Object.freeze({
      ...makeCard('candidate'),
      parent: 'stale-parent',
      x: -400,
      y: -300,
      width: 60,
      height: 40,
      zIndex: 1,
    });
    const cards = Object.freeze([parent, sibling]);

    // When: first placement targets the parent at a pointer position before the existing sibling.
    const result = placeExternalCandidateCard({
      cards,
      candidate,
      pointerPoint: { x: 20, y: 20 },
      cardPosition: { x: 300, y: 300 },
      contentInset,
    });

    // Then: arrange reorders siblings by the pointer flow and returns the exact submitted card item.
    const placed = getCard(result.cards, candidate.id);
    expect(result.cards.map((card) => card.id)).toEqual([
      parent.id,
      candidate.id,
      sibling.id,
    ]);
    expect(result.card).toBe(placed);
    expect(result.cards[1]).toBe(placed);
    expect(placed).toMatchObject({
      parent: parent.id,
      x: 13,
      y: 50,
      zIndex: 6,
    });
    expect(getCard(result.cards, sibling.id)).toMatchObject({ x: 85, y: 50 });
    expect(cards).toEqual([parent, sibling]);
    expect(candidate.parent).toBe('stale-parent');
  });
});
