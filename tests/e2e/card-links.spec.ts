import { expect, test } from '@playwright/test';
import type { CardCanvasCard } from '../../src';
import {
  addSymmetricCardLink,
  buildCardLinkPairs,
  findTopmostLinkTargetId,
  normalizeLinkedCardIds,
  resolveLinkedCards,
} from '../../src/utils/card-links';

function makeCard(
  id: string,
  links?: readonly string[]
): CardCanvasCard {
  const baseCard = {
    id,
    title: `Title ${id}`,
    content: `Content ${id}`,
    x: 0,
    y: 0,
    width: 120,
    height: 80,
  };

  if (links === undefined) {
    return baseCard;
  }

  return { ...baseCard, linkedCardIds: links };
}

function freezeCards(cards: CardCanvasCard[]): CardCanvasCard[] {
  for (const card of cards) {
    const linkedCardIds = card.linkedCardIds;
    if (linkedCardIds !== undefined) {
      Object.freeze(linkedCardIds);
    }
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

test.describe('card link utilities', () => {
  test('normalizes missing linkedCardIds to a readonly empty array', () => {
    // Given: a card without link storage.
    const card = Object.freeze(makeCard('source'));

    // When: link ids are normalized.
    const result = normalizeLinkedCardIds(card);

    // Then: callers receive an empty readonly list.
    expect(result).toEqual([]);
  });

  test('adds a symmetric link without mutating frozen card inputs', () => {
    // Given: two immutable cards without existing links.
    const cards = freezeCards([makeCard('alpha'), makeCard('beta')]);
    const before = snapshotCards(cards);

    // When: alpha is linked to beta.
    const result = addSymmetricCardLink(cards, 'alpha', 'beta');

    // Then: both cards reference each other and the original fixtures are untouched.
    expect(result).not.toBe(cards);
    expect(result.find((card) => card.id === 'alpha')?.linkedCardIds).toEqual([
      'beta',
    ]);
    expect(result.find((card) => card.id === 'beta')?.linkedCardIds).toEqual([
      'alpha',
    ]);
    expectCardsUnchanged(cards, before);
  });

  test('deduplicates an existing symmetric link', () => {
    // Given: cards already contain duplicate link ids on both sides.
    const cards = freezeCards([
      makeCard('alpha', ['beta', 'beta']),
      makeCard('beta', ['alpha', 'alpha']),
    ]);

    // When: the same link is added again.
    const result = addSymmetricCardLink(cards, 'alpha', 'beta');

    // Then: each side keeps exactly one link to the other side.
    expect(result.find((card) => card.id === 'alpha')?.linkedCardIds).toEqual([
      'beta',
    ]);
    expect(result.find((card) => card.id === 'beta')?.linkedCardIds).toEqual([
      'alpha',
    ]);
  });

  test('treats a self-link request as a no-op', () => {
    // Given: an immutable card that has no links.
    const cards = freezeCards([makeCard('alpha')]);
    const before = snapshotCards(cards);

    // When: the card is asked to link to itself.
    const result = addSymmetricCardLink(cards, 'alpha', 'alpha');

    // Then: no self-link is introduced and input data is untouched.
    expect(result).not.toBe(cards);
    expect(result).toEqual(cards);
    expectCardsUnchanged(cards, before);
  });

  test('resolves linked cards while filtering missing targets', () => {
    // Given: a source links to two existing targets and one missing id.
    const beta = makeCard('beta');
    const gamma = makeCard('gamma');
    const cards = freezeCards([
      makeCard('alpha', ['beta', 'missing', 'gamma']),
      beta,
      gamma,
    ]);

    // When: alpha links are resolved against the current cards.
    const result = resolveLinkedCards(cards, 'alpha');

    // Then: only existing linked target cards are returned in link order.
    expect(result).toEqual([beta, gamma]);
  });

  test('builds unique undirected connector pairs without duplicates or self pairs', () => {
    // Given: duplicated symmetric links, a one-way link, a self-link, and a missing target.
    const cards = freezeCards([
      makeCard('alpha', ['beta', 'beta', 'alpha', 'missing']),
      makeCard('beta', ['alpha']),
      makeCard('gamma', ['alpha']),
    ]);

    // When: connector pairs are derived from the current card graph.
    const result = buildCardLinkPairs(cards);

    // Then: every unordered existing relationship appears once.
    expect(result).toEqual([
      { fromId: 'alpha', toId: 'beta' },
      { fromId: 'alpha', toId: 'gamma' },
    ]);
  });

  test('finds the topmost link target by zIndex and then later array order', () => {
    // Given: overlapping target candidates under the same pointer position.
    const source = { ...makeCard('source'), x: 200, y: 200 };
    const lower = { ...makeCard('lower'), x: 0, y: 0, zIndex: 1 };
    const earlierTie = { ...makeCard('earlier-tie'), x: 0, y: 0, zIndex: 3 };
    const laterTie = { ...makeCard('later-tie'), x: 0, y: 0, zIndex: 3 };
    const cards = freezeCards([source, lower, earlierTie, laterTie]);

    // When: the pointer is inside every target candidate.
    const result = findTopmostLinkTargetId({
      cards,
      sourceCardId: 'source',
      point: { x: 60, y: 60 },
    });

    // Then: highest zIndex wins, and later array order breaks ties.
    expect(result).toBe('later-tie');
  });

  test('excludes the source card and moving cards from link target hit-testing', () => {
    // Given: source and moving cards overlap the pointer above a valid target.
    const source = { ...makeCard('source'), x: 0, y: 0, zIndex: 100 };
    const moving = { ...makeCard('moving'), x: 0, y: 0, zIndex: 90 };
    const target = { ...makeCard('target'), x: 0, y: 0, zIndex: 1 };
    const cards = freezeCards([target, source, moving]);

    // When: link target lookup excludes the moving card ids.
    const result = findTopmostLinkTargetId({
      cards,
      sourceCardId: 'source',
      point: { x: 60, y: 60 },
      movingCardIds: new Set(['moving']),
    });

    // Then: the valid non-moving target is selected.
    expect(result).toBe('target');
  });
});
