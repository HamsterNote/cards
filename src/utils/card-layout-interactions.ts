import type { CardCanvasCard } from '../components/CardCanvas';
import {
  assignParentFromPoint,
  expandParentToContainChildren,
  findParentCandidateId,
  type ContentInset,
} from './cards';
import {
  getMindMapLayoutMode,
  MIND_MAP_DETACH_THRESHOLD,
  normalizeMindMapLayout,
} from './card-layout';

export type CardLayoutPoint = {
  readonly x: number;
  readonly y: number;
};

export type CardLayoutUpdateResult = {
  readonly cards: CardCanvasCard[];
  readonly draggedCard: CardCanvasCard | undefined;
};

export type AssignParentAtPointerOptions = {
  readonly contentInset: ContentInset;
};

export type FinalizeCardDragLayoutOptions = AssignParentAtPointerOptions & {
  readonly dragStartPosition: CardLayoutPoint | undefined;
};

export type CardResizeDimensions = {
  readonly width: number;
  readonly height: number;
};

export function assignParentAtPointer(
  cards: readonly CardCanvasCard[],
  cardId: string,
  pointerPoint: CardLayoutPoint,
  movingCardIds: ReadonlySet<string>,
  options: AssignParentAtPointerOptions
): CardLayoutUpdateResult {
  const assignmentResult = assignParentFromPoint(
    cards,
    cardId,
    pointerPoint,
    movingCardIds
  );
  const assignedCard = assignmentResult.draggedCard;
  let finalCards = assignmentResult.cards;

  if (assignedCard?.parent) {
    const parentCard = finalCards.find(
      (candidate) => candidate.id === assignedCard.parent
    );
    finalCards =
      parentCard !== undefined &&
      getMindMapLayoutMode(parentCard) === 'mind-map-horizontal'
        ? normalizeMindMapLayout(finalCards)
        : expandParentToContainChildren(
            finalCards,
            assignedCard.parent,
            options.contentInset
          );
  }

  return {
    cards: finalCards,
    draggedCard:
      assignedCard === undefined
        ? undefined
        : finalCards.find((candidate) => candidate.id === cardId) ?? assignedCard,
  };
}

export function finalizeCardDragLayout(
  cards: readonly CardCanvasCard[],
  cardId: string,
  pointerPoint: CardLayoutPoint,
  movingCardIds: ReadonlySet<string>,
  options: FinalizeCardDragLayoutOptions
): CardLayoutUpdateResult {
  const draggedCard = cards.find((currentCard) => currentCard.id === cardId);
  if (draggedCard === undefined) {
    return { cards: [...cards], draggedCard: undefined };
  }

  const parentCard =
    draggedCard.parent === undefined
      ? undefined
      : cards.find((candidate) => candidate.id === draggedCard.parent);
  const isManagedChild =
    draggedCard.parent !== undefined &&
    parentCard !== undefined &&
    getMindMapLayoutMode(parentCard) === 'mind-map-horizontal';
  const candidateId = findParentCandidateId(
    cards,
    cardId,
    pointerPoint,
    movingCardIds
  );

  if (!isManagedChild || candidateId !== undefined) {
    return assignParentAtPointer(cards, cardId, pointerPoint, movingCardIds, options);
  }

  const dragDistance =
    options.dragStartPosition === undefined
      ? MIND_MAP_DETACH_THRESHOLD
      : Math.hypot(
          draggedCard.x - options.dragStartPosition.x,
          draggedCard.y - options.dragStartPosition.y
        );
  const finalCards =
    dragDistance < MIND_MAP_DETACH_THRESHOLD
      ? normalizeMindMapLayout(cards)
      : normalizeMindMapLayout(
          cards.map((currentCard) => {
            if (currentCard.id !== cardId) return currentCard;

            const detachedCard = { ...currentCard };
            delete detachedCard.parent;
            return detachedCard;
          })
        );

  return {
    cards: finalCards,
    draggedCard: finalCards.find((candidate) => candidate.id === cardId) ?? draggedCard,
  };
}

export function resizeCardWithMindMapNormalization(
  cards: readonly CardCanvasCard[],
  cardId: string,
  dimensions: CardResizeDimensions
): CardLayoutUpdateResult {
  const nextCards = cards.map((currentCard) => {
    if (currentCard.id !== cardId) return currentCard;
    return { ...currentCard, width: dimensions.width, height: dimensions.height };
  });
  const resizedCard = nextCards.find((currentCard) => currentCard.id === cardId);
  const parentCard =
    resizedCard?.parent === undefined
      ? undefined
      : nextCards.find((currentCard) => currentCard.id === resizedCard.parent);
  const shouldNormalizeMindMapLayout =
    resizedCard !== undefined &&
    (getMindMapLayoutMode(resizedCard) === 'mind-map-horizontal' ||
      (parentCard !== undefined &&
        getMindMapLayoutMode(parentCard) === 'mind-map-horizontal'));
  const finalCards = shouldNormalizeMindMapLayout
    ? normalizeMindMapLayout(nextCards)
    : nextCards;

  return {
    cards: finalCards,
    draggedCard: finalCards.find((currentCard) => currentCard.id === cardId),
  };
}
