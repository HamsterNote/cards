import type { Drag, Finger } from '@system-ui-js/multi-drag';
import type { CardCanvasCard } from './CardCanvas';

export interface CardCanvasHandle {
  startExternalDrag(input: ExternalCardDragInput): ExternalCardDragStartResult;
}

export interface ExternalCardDragInput {
  card: CardCanvasCard;
  drag: Drag;
  anchor?: ExternalCardDragAnchor;
}

export interface ExternalCardDragAnchor {
  readonly x: number;
  readonly y: number;
}

export type ExternalCardDragStartRejectReason =
  | 'not-editable'
  | 'missing-on-cards-change'
  | 'invalid-anchor'
  | 'invalid-card'
  | 'duplicate-card-id'
  | 'drag-already-active'
  | 'missing-active-pointer';

export type ExternalCardDragStartResult =
  | { readonly ok: true; readonly session: ExternalCardDragSession }
  | {
      readonly ok: false;
      readonly reason: ExternalCardDragStartRejectReason;
    };

export interface ExternalCardDragSession {
  cancel(): void;
  readonly completion: Promise<ExternalCardDragCompletion>;
}

export type ExternalCardDragCancelReason =
  | 'cancelled-by-host'
  | 'pointer-cancelled'
  | 'released-outside-canvas'
  | 'canvas-unmounted'
  | 'card-id-conflict'
  | 'canvas-became-readonly';

export type ExternalCardDragCompletion =
  | { readonly status: 'placed'; readonly card: CardCanvasCard }
  | {
      readonly status: 'cancelled';
      readonly reason: ExternalCardDragCancelReason;
    };

export interface ExternalCardDragStartupContext {
  readonly editable: boolean;
  readonly onCardsChange: ((nextCards: CardCanvasCard[]) => void) | undefined;
  readonly cards: readonly CardCanvasCard[];
  readonly activeCandidateCardIds: ReadonlySet<string>;
  readonly activeDrags: ReadonlySet<Drag>;
}

export interface ExternalCardDragStartPreparation {
  readonly anchor: ExternalCardDragAnchor;
  readonly card: CardCanvasCard;
  readonly finger: Finger;
}

export type ExternalCardDragPreparationResult =
  | {
      readonly ok: true;
      readonly preparation: ExternalCardDragStartPreparation;
    }
  | {
      readonly ok: false;
      readonly reason: ExternalCardDragStartRejectReason;
    };

type UnknownRecord = Record<string, unknown>;

const DEFAULT_EXTERNAL_CARD_DRAG_ANCHOR = { x: 0.5, y: 0.5 } as const;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null;
}

function isFinitePositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isValidExternalCardAnchor(
  anchor: ExternalCardDragAnchor | undefined
): anchor is ExternalCardDragAnchor {
  if (anchor === undefined) return true;

  const candidate: unknown = anchor;
  if (!isRecord(candidate)) return false;

  const x = candidate.x;
  const y = candidate.y;
  return (
    typeof x === 'number' &&
    Number.isFinite(x) &&
    x >= 0 &&
    x <= 1 &&
    typeof y === 'number' &&
    Number.isFinite(y) &&
    y >= 0 &&
    y <= 1
  );
}

function isValidExternalCard(card: CardCanvasCard): boolean {
  const candidate: unknown = card;
  if (!isRecord(candidate)) return false;

  return (
    typeof candidate.id === 'string' &&
    candidate.id.length > 0 &&
    isFinitePositiveNumber(candidate.width) &&
    isFinitePositiveNumber(candidate.height)
  );
}

function snapshotExternalCard(
  card: CardCanvasCard
): CardCanvasCard | undefined {
  try {
    return structuredClone(card);
  } catch {
    return undefined;
  }
}

export function selectFirstActiveExternalDragFinger(
  drag: Drag
): Finger | undefined {
  return drag.getFingers().find((finger) => !finger.getIsDestroyed());
}

export function prepareExternalCardDragStart(
  input: ExternalCardDragInput,
  context: ExternalCardDragStartupContext
): ExternalCardDragPreparationResult {
  if (context.editable !== true) {
    return { ok: false, reason: 'not-editable' };
  }

  if (context.onCardsChange === undefined) {
    return { ok: false, reason: 'missing-on-cards-change' };
  }

  if (!isValidExternalCardAnchor(input.anchor)) {
    return { ok: false, reason: 'invalid-anchor' };
  }

  if (!isValidExternalCard(input.card)) {
    return { ok: false, reason: 'invalid-card' };
  }

  const card = snapshotExternalCard(input.card);
  if (card === undefined) {
    return { ok: false, reason: 'invalid-card' };
  }

  if (
    context.cards.some((existingCard) => existingCard.id === card.id) ||
    context.activeCandidateCardIds.has(card.id)
  ) {
    return { ok: false, reason: 'duplicate-card-id' };
  }

  if (context.activeDrags.has(input.drag)) {
    return { ok: false, reason: 'drag-already-active' };
  }

  const finger = selectFirstActiveExternalDragFinger(input.drag);
  if (finger === undefined) {
    return { ok: false, reason: 'missing-active-pointer' };
  }

  return {
    ok: true,
    preparation: {
      anchor: input.anchor ?? DEFAULT_EXTERNAL_CARD_DRAG_ANCHOR,
      card,
      finger,
    },
  };
}
