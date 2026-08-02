import { useCallback, useRef, useState } from 'react';

type ParentCandidateSession = {
  readonly card: { readonly id: string };
  parentCandidateId: string | undefined;
};

export function useExternalCardDragParentCandidates() {
  const candidatesRef = useRef(new Map<string, Set<string>>());
  const cardDragCandidateRef = useRef<string | undefined>(undefined);
  const [parentCandidateIds, setParentCandidateIds] = useState<
    ReadonlySet<string>
  >(new Set());

  const refreshCandidates = useCallback((publish = true) => {
    if (!publish) return;
    const parentIds = new Set<string>();
    if (cardDragCandidateRef.current !== undefined) {
      parentIds.add(cardDragCandidateRef.current);
    }
    for (const [parentId, sources] of candidatesRef.current) {
      if (sources.size > 0) parentIds.add(parentId);
    }
    setParentCandidateIds(parentIds);
  }, []);

  const setCardDragParentCandidate = useCallback(
    (parentId: string | undefined) => {
      if (cardDragCandidateRef.current === parentId) return;
      cardDragCandidateRef.current = parentId;
      refreshCandidates();
    },
    [refreshCandidates]
  );

  const setSessionCandidate = useCallback(
    (
      session: ParentCandidateSession,
      parentId: string | undefined,
      publish = true
    ) => {
      if (session.parentCandidateId === parentId) return;
      if (session.parentCandidateId !== undefined) {
        const sources = candidatesRef.current.get(session.parentCandidateId);
        sources?.delete(session.card.id);
        if (sources?.size === 0) {
          candidatesRef.current.delete(session.parentCandidateId);
        }
      }
      if (parentId !== undefined) {
        const sources =
          candidatesRef.current.get(parentId) ?? new Set<string>();
        sources.add(session.card.id);
        candidatesRef.current.set(parentId, sources);
      }
      session.parentCandidateId = parentId;
      refreshCandidates(publish);
    },
    [refreshCandidates]
  );

  return {
    parentCandidateIds,
    setCardDragParentCandidate,
    setSessionCandidate,
  };
}
