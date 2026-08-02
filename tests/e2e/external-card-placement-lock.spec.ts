import { expect, test } from '@playwright/test';
import type { CardCanvasCard } from '../../src';
import { finalizeCardDragLayout } from '../../src/utils/card-layout-interactions';
import { assignParentFromPoint } from '../../src/utils/cards';

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

function makeLockedDragFixture(): readonly [CardCanvasCard, CardCanvasCard] {
  return Object.freeze([
    Object.freeze({
      ...makeCard('locked-existing'),
      x: 200,
      y: 200,
      lock: true,
    }),
    Object.freeze({
      ...makeCard('parent'),
      width: 100,
      height: 100,
    }),
  ]);
}

test.describe('existing card drag lock boundaries', () => {
  test('does not reparent a locked existing card through assignParentFromPoint', () => {
    // Given: a frozen locked existing card and a parent containing the drop point.
    const [locked, parent] = makeLockedDragFixture();

    // When: regular existing-card parent assignment is invoked.
    const result = assignParentFromPoint([locked, parent], locked.id, {
      x: 50,
      y: 50,
    });

    // Then: its lock keeps the existing card and parent relation unchanged.
    expect(result.cards).toEqual([locked, parent]);
    expect(result.draggedCard).toBe(locked);
  });

  test('does not finalize a locked existing card through finalizeCardDragLayout', () => {
    // Given: a frozen locked existing card and a parent containing the drop point.
    const [locked, parent] = makeLockedDragFixture();

    // When: regular existing-card drag finalization is invoked.
    const result = finalizeCardDragLayout(
      [locked, parent],
      locked.id,
      { x: 50, y: 50 },
      new Set([locked.id]),
      { contentInset, dragStartPosition: { x: locked.x, y: locked.y } }
    );

    // Then: its lock keeps the existing card and parent relation unchanged.
    expect(result.cards).toEqual([locked, parent]);
    expect(result.draggedCard).toBe(locked);
  });
});
