import type { Drag } from '@system-ui-js/multi-drag';
import {
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { CardCanvasCard } from './CardCanvas';
import {
  type CardCanvasHandle,
  type ExternalCardDragCompletion,
  type ExternalCardDragInput,
  type ExternalCardDragStartResult,
  prepareExternalCardDragStart,
} from './ExternalCardDrag';
import {
  createExternalCardDragSession,
  type ExternalCardDragSessionState,
} from './externalCardDragSessionLifecycle';
import type { ExternalCardPreview } from './externalCardDragSessionTypes';
import { useExternalCardDragParentCandidates } from './useExternalCardDragParentCandidates';

export type { ExternalCardPreview } from './externalCardDragSessionTypes';

export type UseExternalCardDragSessionsInput = {
  readonly editable: boolean;
  readonly canCommit: boolean;
  readonly getCards: () => CardCanvasCard[];
  readonly commitCards: (cards: CardCanvasCard[]) => void;
  readonly onPlaced: (cardId: string) => void;
  readonly onSelect: ((cardId: string) => void) | undefined;
  readonly scale: number;
  readonly wrapperRef: RefObject<HTMLDivElement | null>;
  readonly containerRef: RefObject<HTMLDivElement | null>;
};

export function useExternalCardDragSessions({
  editable,
  canCommit,
  getCards,
  commitCards,
  onPlaced,
  onSelect,
  scale,
  wrapperRef,
  containerRef,
}: UseExternalCardDragSessionsInput) {
  const latestRef = useRef({ editable, canCommit, onSelect, scale });
  const scaleRef = useRef(scale);
  const mountedRef = useRef(true);
  const sessionsRef = useRef(new Map<string, ExternalCardDragSessionState>());
  const dragsRef = useRef(new Set<Drag>());
  const [previews, setPreviews] = useState<
    ReadonlyMap<string, ExternalCardPreview>
  >(new Map());
  const previewUpdatesRef = useRef(
    new Map<string, ExternalCardPreview | undefined>()
  );
  const previewFlushTimeoutRef = useRef<number | undefined>(undefined);
  const {
    parentCandidateIds,
    setCardDragParentCandidate,
    setSessionCandidate,
  } = useExternalCardDragParentCandidates();

  useLayoutEffect(() => {
    latestRef.current = { editable, canCommit, onSelect, scale };
    scaleRef.current = scale;
  }, [canCommit, editable, onSelect, scale]);
  const getCapabilities = useCallback(() => latestRef.current, []);

  const setPreview = useCallback(
    (preview: ExternalCardPreview | undefined, id: string, publish = true) => {
      if (preview === undefined) {
        previewUpdatesRef.current.delete(id);
        if (!publish) return;
        setPreviews((current) => {
          if (!current.has(id)) return current;
          const next = new Map(current);
          next.delete(id);
          return next;
        });
        return;
      }
      if (!publish) return;
      previewUpdatesRef.current.set(id, preview);
      if (previewFlushTimeoutRef.current !== undefined) return;
      previewFlushTimeoutRef.current = window.setTimeout(() => {
        previewFlushTimeoutRef.current = undefined;
        const updates = previewUpdatesRef.current;
        previewUpdatesRef.current = new Map();
        setPreviews((current) => {
          const next = new Map(current);
          let changed = false;
          for (const [previewId, nextPreview] of updates) {
            const currentPreview = current.get(previewId);
            if (nextPreview === undefined) {
              changed = next.delete(previewId) || changed;
              continue;
            }
            if (
              currentPreview?.card === nextPreview.card &&
              currentPreview.position.x === nextPreview.position.x &&
              currentPreview.position.y === nextPreview.position.y
            ) {
              continue;
            }
            next.set(previewId, nextPreview);
            changed = true;
          }
          return changed ? next : current;
        });
      }, 16);
    },
    []
  );

  const settle = useCallback(
    (
      session: ExternalCardDragSessionState,
      completion: ExternalCardDragCompletion,
      publish = true
    ) => {
      if (session.settled) return;
      session.settled = true;
      session.removeListeners();
      sessionsRef.current.delete(session.card.id);
      dragsRef.current.delete(session.drag);
      setSessionCandidate(session, undefined, publish);
      setPreview(undefined, session.card.id, publish);
      session.resolve(completion);
    },
    [setPreview, setSessionCandidate]
  );

  const cancelAll = useCallback(
    (reason: 'canvas-became-readonly' | 'canvas-unmounted') => {
      for (const session of [...sessionsRef.current.values()]) {
        settle(session, { status: 'cancelled', reason });
      }
    },
    [settle]
  );

  useEffect(() => {
    if (!editable || !canCommit) cancelAll('canvas-became-readonly');
  }, [canCommit, cancelAll, editable]);

  useLayoutEffect(() => {
    mountedRef.current = true;
    const sessions = sessionsRef.current;
    return () => {
      mountedRef.current = false;
      for (const session of [...sessions.values()]) {
        settle(
          session,
          { status: 'cancelled', reason: 'canvas-unmounted' },
          false
        );
      }
      if (previewFlushTimeoutRef.current !== undefined) {
        window.clearTimeout(previewFlushTimeoutRef.current);
      }
    };
  }, [settle]);

  const startExternalDrag = useCallback(
    (input: ExternalCardDragInput): ExternalCardDragStartResult => {
      if (!mountedRef.current) return { ok: false, reason: 'not-editable' };
      const preparation = prepareExternalCardDragStart(input, {
        editable: latestRef.current.editable,
        onCardsChange: latestRef.current.canCommit ? commitCards : undefined,
        cards: getCards(),
        activeCandidateCardIds: new Set(sessionsRef.current.keys()),
        activeDrags: dragsRef.current,
      });
      if (!preparation.ok) return preparation;
      const createdSession = createExternalCardDragSession(
        preparation.preparation,
        {
          getCards,
          commitCards,
          getCapabilities,
          scaleRef,
          wrapperRef,
          containerRef,
          onPlaced,
          setPreview,
          setSessionCandidate,
          settle,
        }
      );
      sessionsRef.current.set(
        preparation.preparation.card.id,
        createdSession.state
      );
      dragsRef.current.add(preparation.preparation.drag);
      return { ok: true, session: createdSession.publicSession };
    },
    [
      containerRef,
      commitCards,
      getCapabilities,
      getCards,
      onPlaced,
      setPreview,
      setSessionCandidate,
      settle,
      wrapperRef,
    ]
  );

  const handle = useMemo<CardCanvasHandle>(
    () => ({ startExternalDrag }),
    [startExternalDrag]
  );
  return {
    handle,
    parentCandidateIds,
    previews,
    setCardDragParentCandidate,
  };
}
