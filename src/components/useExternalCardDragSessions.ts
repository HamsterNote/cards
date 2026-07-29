import { FingerOperationType, type Drag, type Finger } from '@system-ui-js/multi-drag';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { placeExternalCandidateCard } from '../utils/external-card-placement';
import { findParentCandidateId, type ContentInset } from '../utils/cards';
import type { CardCanvasCard } from './CardCanvas';
import {
  type CardCanvasHandle,
  type ExternalCardDragCompletion,
  type ExternalCardDragInput,
  type ExternalCardDragSession,
  type ExternalCardDragStartResult,
  prepareExternalCardDragStart,
} from './ExternalCardDrag';

export type ExternalCardPreview = {
  readonly card: CardCanvasCard;
  readonly position: { readonly x: number; readonly y: number };
};

type Session = {
  readonly card: CardCanvasCard;
  readonly drag: Drag;
  readonly finger: Finger;
  readonly removeListeners: () => void;
  readonly resolve: (completion: ExternalCardDragCompletion) => void;
  didMove: boolean;
  settled: boolean;
  parentCandidateId: string | undefined;
};

export type UseExternalCardDragSessionsInput = {
  readonly cards: readonly CardCanvasCard[];
  readonly editable: boolean;
  readonly onCardsChange: ((cards: CardCanvasCard[]) => void) | undefined;
  readonly onPlaced: (cardId: string) => void;
  readonly onSelect: ((cardId: string) => void) | undefined;
  readonly scale: number;
  readonly wrapperRef: RefObject<HTMLDivElement | null>;
  readonly containerRef: RefObject<HTMLDivElement | null>;
};

export function useExternalCardDragSessions({
  cards,
  editable,
  onCardsChange,
  onPlaced,
  onSelect,
  scale,
  wrapperRef,
  containerRef,
}: UseExternalCardDragSessionsInput) {
  const cardsRef = useRef(cards);
  const editableRef = useRef(editable);
  const onCardsChangeRef = useRef(onCardsChange);
  const onSelectRef = useRef(onSelect);
  const scaleRef = useRef(scale);
  const mountedRef = useRef(true);
  const sessionsRef = useRef(new Map<string, Session>());
  const dragsRef = useRef(new Set<Drag>());
  const candidatesRef = useRef(new Map<string, Set<string>>());
  const cardDragCandidateRef = useRef<string | undefined>(undefined);
  const [previews, setPreviews] = useState<ReadonlyMap<string, ExternalCardPreview>>(
    new Map()
  );
  const [parentCandidateIds, setParentCandidateIds] = useState<ReadonlySet<string>>(
    new Set()
  );

  useEffect(() => {
    cardsRef.current = cards;
    editableRef.current = editable;
    onCardsChangeRef.current = onCardsChange;
    onSelectRef.current = onSelect;
    scaleRef.current = scale;
  }, [cards, editable, onCardsChange, onSelect, scale]);

  const refreshCandidates = useCallback(() => {
    const parentIds = new Set<string>();
    if (cardDragCandidateRef.current !== undefined) {
      parentIds.add(cardDragCandidateRef.current);
    }
    for (const [parentId, sources] of candidatesRef.current) {
      if (sources.size > 0) parentIds.add(parentId);
    }
    setParentCandidateIds(parentIds);
  }, []);

  const setCardDragParentCandidate = useCallback((parentId: string | undefined) => {
    cardDragCandidateRef.current = parentId;
    refreshCandidates();
  }, [refreshCandidates]);

  const setSessionCandidate = useCallback((session: Session, parentId: string | undefined) => {
    if (session.parentCandidateId === parentId) return;
    if (session.parentCandidateId !== undefined) {
      const sources = candidatesRef.current.get(session.parentCandidateId);
      sources?.delete(session.card.id);
      if (sources?.size === 0) candidatesRef.current.delete(session.parentCandidateId);
    }
    if (parentId !== undefined) {
      const sources = candidatesRef.current.get(parentId) ?? new Set<string>();
      sources.add(session.card.id);
      candidatesRef.current.set(parentId, sources);
    }
    session.parentCandidateId = parentId;
    refreshCandidates();
  }, [refreshCandidates]);

  const getCanvasPoint = useCallback((point: { readonly x: number; readonly y: number }) => {
    const wrapper = wrapperRef.current;
    const container = containerRef.current;
    if (wrapper === null || container === null) return undefined;
    const bounds = wrapper.getBoundingClientRect();
    if (point.x < bounds.left || point.x > bounds.right || point.y < bounds.top || point.y > bounds.bottom) return undefined;
    const hit = document.elementFromPoint(point.x, point.y);
    if (
      hit === null ||
      !container.contains(hit) ||
      hit.closest('[data-card-canvas-toolbar], .cards-card-canvas__minimap, .cards-card-canvas__popover, [role="dialog"]') !== null
    ) return undefined;
    const rect = container.getBoundingClientRect();
    return { x: (point.x - rect.left) / scaleRef.current, y: (point.y - rect.top) / scaleRef.current };
  }, [containerRef, wrapperRef]);

  const getContentInset = useCallback((headless: boolean): ContentInset => {
    const cardElement = containerRef.current?.querySelector<HTMLElement>('.cards-card-canvas__card:not([data-external-card-preview])');
    const contentElement = cardElement?.querySelector<HTMLElement>('.cards-card-canvas__card-content');
    if (
      cardElement === undefined ||
      cardElement === null ||
      contentElement === undefined ||
      contentElement === null
    ) {
      return { left: 13, top: headless ? 13 : 50, right: 13, bottom: 13 };
    }
    const cardRect = cardElement.getBoundingClientRect();
    const contentRect = contentElement.getBoundingClientRect();
    return {
      left: (contentRect.left - cardRect.left) / scaleRef.current + 12,
      top: (contentRect.top - cardRect.top) / scaleRef.current + 12,
      right: (cardRect.right - contentRect.right) / scaleRef.current + 12,
      bottom: (cardRect.bottom - contentRect.bottom) / scaleRef.current + 12,
    };
  }, [containerRef]);

  const settle = useCallback((session: Session, completion: ExternalCardDragCompletion) => {
    if (session.settled) return;
    session.settled = true;
    session.removeListeners();
    sessionsRef.current.delete(session.card.id);
    dragsRef.current.delete(session.drag);
    setSessionCandidate(session, undefined);
    setPreviews((current) => {
      const next = new Map(current);
      next.delete(session.card.id);
      return next;
    });
    session.resolve(completion);
  }, [setSessionCandidate]);

  const cancelAll = useCallback((reason: 'canvas-became-readonly' | 'canvas-unmounted') => {
    for (const session of sessionsRef.current.values()) {
      settle(session, { status: 'cancelled', reason });
    }
  }, [settle]);

  useEffect(() => {
    if (!editable || onCardsChange === undefined) cancelAll('canvas-became-readonly');
  }, [cancelAll, editable, onCardsChange]);

  useEffect(() => () => {
    mountedRef.current = false;
    cancelAll('canvas-unmounted');
  }, [cancelAll]);

  const startExternalDrag = useCallback((input: ExternalCardDragInput): ExternalCardDragStartResult => {
    if (!mountedRef.current) return { ok: false, reason: 'not-editable' };
    const preparation = prepareExternalCardDragStart(input, {
      editable: editableRef.current,
      onCardsChange: onCardsChangeRef.current,
      cards: cardsRef.current,
      activeCandidateCardIds: new Set(sessionsRef.current.keys()),
      activeDrags: dragsRef.current,
    });
    if (!preparation.ok) return preparation;
    const { anchor, card, finger } = preparation.preparation;
    let resolveCompletion: (completion: ExternalCardDragCompletion) => void = () => {};
    const completion = new Promise<ExternalCardDragCompletion>((resolve) => { resolveCompletion = resolve; });
    const session: Session = {
      card,
      drag: input.drag,
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
    const updatePreview = (clientPoint: { readonly x: number; readonly y: number }) => {
      const pointerPoint = getCanvasPoint(clientPoint);
      if (pointerPoint === undefined) {
        setSessionCandidate(session, undefined);
        setPreviews((current) => { const next = new Map(current); next.delete(card.id); return next; });
        return false;
      }
      const parentId = findParentCandidateId(cardsRef.current, card.id, pointerPoint, new Set([card.id]));
      setSessionCandidate(session, parentId);
      setPreviews((current) => new Map(current).set(card.id, {
        card,
        position: { x: pointerPoint.x - card.width * anchor.x, y: pointerPoint.y - card.height * anchor.y },
      }));
      return true;
    };
    const onMove = (item: { readonly point: { readonly x: number; readonly y: number } }) => {
      session.didMove = true;
      updatePreview(item.point);
    };
    const onEnd = (item: { readonly point: { readonly x: number; readonly y: number }; readonly event?: PointerEvent }) => {
      if (item.event?.type === 'pointercancel') {
        settle(session, { status: 'cancelled', reason: 'pointer-cancelled' });
        return;
      }
      const pointerPoint = session.didMove ? getCanvasPoint(item.point) : undefined;
      if (pointerPoint === undefined) {
        settle(session, { status: 'cancelled', reason: 'released-outside-canvas' });
        return;
      }
      if (cardsRef.current.some((currentCard) => currentCard.id === card.id)) {
        settle(session, { status: 'cancelled', reason: 'card-id-conflict' });
        return;
      }
      const placement = placeExternalCandidateCard({
        cards: cardsRef.current,
        candidate: card,
        pointerPoint,
        cardPosition: { x: pointerPoint.x - card.width * anchor.x, y: pointerPoint.y - card.height * anchor.y },
        contentInset: getContentInset(card.headless === true),
      });
      cardsRef.current = placement.cards;
      onPlaced(placement.card.id);
      onCardsChangeRef.current?.(placement.cards);
      onSelectRef.current?.(placement.card.id);
      settle(session, { status: 'placed', card: placement.card });
    };
    finger.addEventListener(FingerOperationType.Move, onMove);
    finger.addEventListener(FingerOperationType.End, onEnd);
    sessionsRef.current.set(card.id, session);
    dragsRef.current.add(input.drag);
    const publicSession: ExternalCardDragSession = {
      completion,
      cancel: () => settle(session, { status: 'cancelled', reason: 'cancelled-by-host' }),
    };
    return { ok: true, session: publicSession };
  }, [getCanvasPoint, getContentInset, onPlaced, setSessionCandidate, settle]);

  const handle: CardCanvasHandle = { startExternalDrag };
  return { handle, parentCandidateIds, previews, setCardDragParentCandidate };
}
