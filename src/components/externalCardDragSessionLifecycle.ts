import {
  type Drag,
  type Finger,
  FingerOperationType,
} from '@system-ui-js/multi-drag';
import type { RefObject } from 'react';
import { findParentCandidateId } from '../utils/cards';
import { placeExternalCandidateCard } from '../utils/external-card-placement';
import type { CardCanvasCard } from './CardCanvas';
import type {
  ExternalCardDragCompletion,
  ExternalCardDragSession,
  ExternalCardDragStartPreparation,
} from './ExternalCardDrag';
import {
  externalCanvasPoint,
  externalContentInset,
} from './externalCardDragGeometry';
import type { ExternalCardPreview } from './externalCardDragSessionTypes';

export type ExternalCardDragSessionState = {
  readonly card: CardCanvasCard;
  readonly drag: Drag;
  readonly finger: Finger;
  readonly removeListeners: () => void;
  readonly resolve: (completion: ExternalCardDragCompletion) => void;
  didMove: boolean;
  settled: boolean;
  parentCandidateId: string | undefined;
};

export type ExternalCardDragSessionEnvironment = {
  readonly getCards: () => CardCanvasCard[];
  readonly commitCards: (cards: CardCanvasCard[]) => void;
  readonly getCapabilities: () => {
    readonly editable: boolean;
    readonly canCommit: boolean;
    readonly onSelect: ((cardId: string) => void) | undefined;
  };
  readonly scaleRef: RefObject<number>;
  readonly wrapperRef: RefObject<HTMLDivElement | null>;
  readonly containerRef: RefObject<HTMLDivElement | null>;
  readonly onPlaced: (cardId: string) => void;
  readonly setPreview: (
    preview: ExternalCardPreview | undefined,
    id: string,
    publish?: boolean
  ) => void;
  readonly setSessionCandidate: (
    session: ExternalCardDragSessionState,
    parentId: string | undefined,
    publish?: boolean
  ) => void;
  readonly settle: (
    session: ExternalCardDragSessionState,
    completion: ExternalCardDragCompletion,
    publish?: boolean
  ) => void;
};

export function createExternalCardDragSession(
  preparation: ExternalCardDragStartPreparation,
  environment: ExternalCardDragSessionEnvironment
): {
  readonly publicSession: ExternalCardDragSession;
  readonly state: ExternalCardDragSessionState;
} {
  const { anchor, card, drag, finger } = preparation;
  let resolveCompletion: (
    completion: ExternalCardDragCompletion
  ) => void = () => {};
  const completion = new Promise<ExternalCardDragCompletion>((resolve) => {
    resolveCompletion = resolve;
  });
  const session: ExternalCardDragSessionState = {
    card,
    drag,
    finger,
    resolve: resolveCompletion,
    removeListeners: () => {
      finger.removeEventListener(FingerOperationType.Move, onMove);
      finger.removeEventListener(FingerOperationType.End, onEnd);
    },
    didMove: false,
    settled: false,
    parentCandidateId: undefined,
  };

  const pointAt = (point: { readonly x: number; readonly y: number }) =>
    externalCanvasPoint(
      point,
      environment.scaleRef.current,
      environment.wrapperRef,
      environment.containerRef
    );

  const updatePreview = (clientPoint: {
    readonly x: number;
    readonly y: number;
  }) => {
    const pointerPoint = pointAt(clientPoint);
    if (pointerPoint === undefined) {
      environment.setSessionCandidate(session, undefined);
      environment.setPreview(undefined, card.id);
      return;
    }
    const parentId = findParentCandidateId(
      environment.getCards(),
      card.id,
      pointerPoint,
      new Set([card.id])
    );
    environment.setSessionCandidate(session, parentId);
    environment.setPreview(
      {
        card,
        position: {
          x: pointerPoint.x - card.width * anchor.x,
          y: pointerPoint.y - card.height * anchor.y,
        },
      },
      card.id
    );
  };

  const onMove = (item: {
    readonly point: { readonly x: number; readonly y: number };
  }) => {
    session.didMove = true;
    updatePreview(item.point);
  };
  const onEnd = (item: {
    readonly point: { readonly x: number; readonly y: number };
    readonly event?: PointerEvent;
  }) => {
    if (item.event?.type === 'pointercancel') {
      environment.settle(session, {
        status: 'cancelled',
        reason: 'pointer-cancelled',
      });
      return;
    }
    const pointerPoint = session.didMove ? pointAt(item.point) : undefined;
    if (pointerPoint === undefined) {
      environment.settle(session, {
        status: 'cancelled',
        reason: 'released-outside-canvas',
      });
      return;
    }
    const capabilities = environment.getCapabilities();
    if (capabilities.editable !== true || capabilities.canCommit !== true) {
      environment.settle(session, {
        status: 'cancelled',
        reason: 'canvas-became-readonly',
      });
      return;
    }
    if (
      environment.getCards().some((currentCard) => currentCard.id === card.id)
    ) {
      environment.settle(session, {
        status: 'cancelled',
        reason: 'card-id-conflict',
      });
      return;
    }
    const placement = placeExternalCandidateCard({
      cards: environment.getCards(),
      candidate: card,
      pointerPoint,
      cardPosition: {
        x: pointerPoint.x - card.width * anchor.x,
        y: pointerPoint.y - card.height * anchor.y,
      },
      contentInset: externalContentInset(
        card.headless === true,
        environment.scaleRef.current,
        environment.containerRef
      ),
    });
    // Settling before host callbacks locks the completion and releases our
    // listeners. Host errors must not escape this Finger callback: multi-drag
    // destroys the Finger only after every End listener returns.
    environment.settle(session, { status: 'placed', card: placement.card });
    const reportAfterFingerCleanup = (error: unknown) => {
      queueMicrotask(() => {
        throw error;
      });
    };
    try {
      environment.commitCards(placement.cards);
    } catch (error) {
      reportAfterFingerCleanup(error);
    }
    try {
      environment.onPlaced(placement.card.id);
    } catch (error) {
      reportAfterFingerCleanup(error);
    }
    try {
      capabilities.onSelect?.(placement.card.id);
    } catch (error) {
      reportAfterFingerCleanup(error);
    }
  };

  finger.addEventListener(FingerOperationType.Move, onMove);
  finger.addEventListener(FingerOperationType.End, onEnd);
  return {
    state: session,
    publicSession: {
      completion,
      cancel: () =>
        environment.settle(session, {
          status: 'cancelled',
          reason: 'cancelled-by-host',
        }),
    },
  };
}
