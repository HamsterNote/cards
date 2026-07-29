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
    x: -10,
    y: -20,
    width: 120,
    height: 80,
  };
}

test('preserves an earlier placement when the next placement receives current cards', () => {
  // Given: two frozen candidates and no initial cards.
  const firstCandidate = Object.freeze(makeCard('first'));
  const secondCandidate = Object.freeze(makeCard('second'));

  // When: the second placement receives the first result as its latest cards input.
  const firstPlacement = placeExternalCandidateCard({
    cards: Object.freeze<CardCanvasCard[]>([]),
    candidate: firstCandidate,
    pointerPoint: { x: 100, y: 100 },
    cardPosition: { x: 10, y: 20 },
    contentInset,
  });
  const secondPlacement = placeExternalCandidateCard({
    cards: firstPlacement.cards,
    candidate: secondCandidate,
    pointerPoint: { x: 200, y: 200 },
    cardPosition: { x: 30, y: 40 },
    contentInset,
  });

  // Then: both placed cards remain, and the second result is its submitted array item.
  expect(firstPlacement.cards.map((card) => card.id)).toEqual(['first']);
  expect(secondPlacement.cards.map((card) => card.id)).toEqual([
    'first',
    'second',
  ]);
  expect(secondPlacement.cards[1]).toBe(secondPlacement.card);
  expect(secondPlacement.card).toMatchObject({ x: 30, y: 40 });
});
