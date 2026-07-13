import type { CardCanvasCard } from '../components/CardCanvas';

export type CardPoint = {
  readonly x: number;
  readonly y: number;
};

export type CardLinkPair = {
  readonly fromId: string;
  readonly toId: string;
};

export type LinkTargetLookup = {
  readonly cards: readonly CardCanvasCard[];
  readonly sourceCardId: string;
  readonly point: CardPoint;
  readonly movingCardIds?: ReadonlySet<string>;
};

const EMPTY_LINKED_CARD_IDS: readonly string[] = [];

export function normalizeLinkedCardIds(
  card: Pick<CardCanvasCard, 'linkedCardIds'>
): readonly string[] {
  return card.linkedCardIds ?? EMPTY_LINKED_CARD_IDS;
}

function uniqueLinkIdsWith(
  card: CardCanvasCard,
  requiredTargetId: string
): readonly string[] {
  return Array.from(
    new Set([...normalizeLinkedCardIds(card), requiredTargetId])
  );
}

export function addSymmetricCardLink(
  cards: readonly CardCanvasCard[],
  sourceCardId: string,
  targetCardId: string
): CardCanvasCard[] {
  if (sourceCardId === targetCardId) {
    return [...cards];
  }

  const hasSource = cards.some((card) => card.id === sourceCardId);
  const hasTarget = cards.some((card) => card.id === targetCardId);
  if (!hasSource || !hasTarget) {
    return [...cards];
  }

  return cards.map((card) => {
    if (card.id === sourceCardId) {
      return { ...card, linkedCardIds: uniqueLinkIdsWith(card, targetCardId) };
    }

    if (card.id === targetCardId) {
      return { ...card, linkedCardIds: uniqueLinkIdsWith(card, sourceCardId) };
    }

    return card;
  });
}

export function resolveLinkedCards(
  cards: readonly CardCanvasCard[],
  sourceCardId: string
): CardCanvasCard[] {
  const sourceCard = cards.find((card) => card.id === sourceCardId);
  if (sourceCard === undefined) {
    return [];
  }

  const cardsById = new Map(cards.map((card) => [card.id, card]));
  return normalizeLinkedCardIds(sourceCard).flatMap((linkedCardId) => {
    const linkedCard = cardsById.get(linkedCardId);
    return linkedCard === undefined ? [] : [linkedCard];
  });
}

function pairKey(pair: CardLinkPair): string {
  return `${pair.fromId}\u0000${pair.toId}`;
}

export function buildCardLinkPairs(
  cards: readonly CardCanvasCard[]
): CardLinkPair[] {
  const cardIndexById = new Map(cards.map((card, index) => [card.id, index]));
  const seenPairs = new Set<string>();

  return cards.flatMap((card, cardIndex) =>
    normalizeLinkedCardIds(card).flatMap((linkedCardId) => {
      const linkedCardIndex = cardIndexById.get(linkedCardId);
      if (linkedCardId === card.id || linkedCardIndex === undefined) {
        return [];
      }

      const pair =
        cardIndex < linkedCardIndex
          ? { fromId: card.id, toId: linkedCardId }
          : { fromId: linkedCardId, toId: card.id };
      const key = pairKey(pair);
      if (seenPairs.has(key)) {
        return [];
      }

      seenPairs.add(key);
      return [pair];
    })
  );
}

function containsPoint(card: CardCanvasCard, point: CardPoint): boolean {
  return (
    point.x >= card.x &&
    point.x <= card.x + card.width &&
    point.y >= card.y &&
    point.y <= card.y + card.height
  );
}

export function findTopmostLinkTargetId({
  cards,
  sourceCardId,
  point,
  movingCardIds,
}: LinkTargetLookup): string | undefined {
  let candidateId: string | undefined;
  let candidateZIndex = Number.NEGATIVE_INFINITY;
  let candidateIndex = -1;

  for (const [index, card] of cards.entries()) {
    if (card.id === sourceCardId || movingCardIds?.has(card.id)) {
      continue;
    }

    const zIndex = card.zIndex ?? 0;
    const isBetterCandidate =
      zIndex > candidateZIndex ||
      (zIndex === candidateZIndex && index > candidateIndex);

    if (containsPoint(card, point) && isBetterCandidate) {
      candidateId = card.id;
      candidateZIndex = zIndex;
      candidateIndex = index;
    }
  }

  return candidateId;
}
