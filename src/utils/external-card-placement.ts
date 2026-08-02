import type { CardCanvasCard } from '../components/CardCanvas';
import {
  assignParentAtPointer,
  type CardLayoutPoint,
} from './card-layout-interactions';
import type { ContentInset } from './cards';

export type ExternalCardPlacementInput = {
  readonly cards: readonly CardCanvasCard[];
  readonly candidate: CardCanvasCard;
  readonly pointerPoint: CardLayoutPoint;
  readonly cardPosition: CardLayoutPoint;
  readonly contentInset: ContentInset;
};

export type ExternalCardPlacementResult = {
  readonly cards: CardCanvasCard[];
  readonly card: CardCanvasCard;
};

export function placeExternalCandidateCard({
  cards,
  candidate,
  pointerPoint,
  cardPosition,
  contentInset,
}: ExternalCardPlacementInput): ExternalCardPlacementResult {
  const positionedCandidate = {
    ...candidate,
    x: cardPosition.x,
    y: cardPosition.y,
  };
  delete positionedCandidate.parent;

  const candidateForFirstPlacement = { ...positionedCandidate };
  if (candidateForFirstPlacement.lock === true) {
    delete candidateForFirstPlacement.lock;
  }

  const placement = assignParentAtPointer(
    [...cards, candidateForFirstPlacement],
    candidate.id,
    pointerPoint,
    new Set([candidate.id]),
    { contentInset }
  );
  const finalCards =
    candidate.lock === true
      ? placement.cards.map((card) =>
          card.id === candidate.id ? { ...card, lock: true } : card
        )
      : placement.cards;
  const card = finalCards.find(
    (currentCard) => currentCard.id === candidate.id
  );

  if (card === undefined) {
    throw new TypeError('First placement must retain its candidate card');
  }

  return { cards: finalCards, card };
}
