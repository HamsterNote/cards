import type { CardCanvasCard } from '../components/CardCanvas';

export type DeleteCardsMeta = {
  readonly hasChildren: boolean;
};

export type DeleteCardsCallback = (
  cards: readonly CardCanvasCard[],
  deleteIds: readonly string[],
  meta: DeleteCardsMeta
) => boolean | Promise<boolean>;

type CardPoint = {
  readonly x: number;
  readonly y: number;
};

type CardDragMove = {
  readonly draggedCardId: string;
  readonly delta: CardPoint;
};

type CardUpdateResult = {
  readonly cards: CardCanvasCard[];
  readonly draggedCard: CardCanvasCard | undefined;
};

export type CardDragPositionSnapshot = ReadonlyMap<string, CardPoint>;

function normalizeParentId(parent: string | undefined): string | undefined {
  return parent === undefined || parent === '' ? undefined : parent;
}

function buildChildrenByParent(
  cards: readonly CardCanvasCard[]
): Map<string, readonly string[]> {
  const mutableChildrenByParent = new Map<string, string[]>();

  for (const card of cards) {
    const parentId = normalizeParentId(card.parent);
    if (parentId === undefined) {
      continue;
    }

    const children = mutableChildrenByParent.get(parentId) ?? [];
    children.push(card.id);
    mutableChildrenByParent.set(parentId, children);
  }

  return mutableChildrenByParent;
}

export function getDescendantIds(
  cards: readonly CardCanvasCard[],
  parentId: string
): string[] {
  const childrenByParent = buildChildrenByParent(cards);
  const descendantIds: string[] = [];
  const visitedIds = new Set<string>([parentId]);
  const pendingIds = [...(childrenByParent.get(parentId) ?? [])];

  while (pendingIds.length > 0) {
    const childId = pendingIds.shift();
    if (childId === undefined || visitedIds.has(childId)) {
      continue;
    }

    visitedIds.add(childId);
    descendantIds.push(childId);

    for (const nextChildId of childrenByParent.get(childId) ?? []) {
      pendingIds.push(nextChildId);
    }
  }

  return descendantIds;
}

export function wouldCreateCycle(
  cards: readonly CardCanvasCard[],
  childId: string,
  parentId: string | undefined
): boolean {
  const normalizedParentId = normalizeParentId(parentId);
  if (normalizedParentId === undefined) {
    return false;
  }

  return (
    normalizedParentId === childId ||
    getDescendantIds(cards, childId).includes(normalizedParentId)
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

export function findParentCandidateId(
  cards: readonly CardCanvasCard[],
  draggedCardId: string,
  point: CardPoint
): string | undefined {
  let candidateId: string | undefined;
  let candidateZIndex = Number.NEGATIVE_INFINITY;
  let candidateIndex = -1;

  for (const [index, card] of cards.entries()) {
    const zIndex = card.zIndex ?? 0;
    const isBetterCandidate =
      zIndex > candidateZIndex ||
      (zIndex === candidateZIndex && index > candidateIndex);

    if (
      containsPoint(card, point) &&
      isBetterCandidate &&
      !wouldCreateCycle(cards, draggedCardId, card.id)
    ) {
      candidateId = card.id;
      candidateZIndex = zIndex;
      candidateIndex = index;
    }
  }

  return candidateId;
}

export function createDragPositionSnapshot(
  cards: readonly CardCanvasCard[],
  draggedCardId: string
): CardDragPositionSnapshot {
  const movingCardIds = new Set([
    draggedCardId,
    ...getDescendantIds(cards, draggedCardId),
  ]);

  return new Map(
    cards
      .filter((card) => movingCardIds.has(card.id))
      .map((card) => [card.id, { x: card.x, y: card.y }])
  );
}

export function moveCardsFromSnapshot(
  cards: readonly CardCanvasCard[],
  snapshot: CardDragPositionSnapshot,
  move: CardDragMove
): CardUpdateResult {
  let draggedCard: CardCanvasCard | undefined;
  const nextCards = cards.map((card) => {
    const startPosition = snapshot.get(card.id);
    if (startPosition === undefined) return card;

    const nextCard = {
      ...card,
      x: startPosition.x + move.delta.x,
      y: startPosition.y + move.delta.y,
    };

    if (card.id === move.draggedCardId) {
      draggedCard = nextCard;
    }

    return nextCard;
  });

  return { cards: nextCards, draggedCard };
}

export function assignParentFromPoint(
  cards: readonly CardCanvasCard[],
  draggedCardId: string,
  point: CardPoint
): CardUpdateResult {
  const currentDraggedCard = cards.find((card) => card.id === draggedCardId);
  if (currentDraggedCard === undefined) {
    return { cards: [...cards], draggedCard: undefined };
  }

  const candidateId = findParentCandidateId(cards, draggedCardId, point);
  let draggedCard: CardCanvasCard | undefined;
  const nextCards = cards.map((card) => {
    if (card.id !== draggedCardId) return card;

    if (candidateId === undefined) {
      const cardWithoutParent = { ...card };
      delete cardWithoutParent.parent;
      draggedCard = cardWithoutParent;
      return cardWithoutParent;
    }

    if (card.parent === candidateId) {
      draggedCard = card;
      return card;
    }

    const nextCard = { ...card, parent: candidateId };
    draggedCard = nextCard;
    return nextCard;
  });

  return { cards: nextCards, draggedCard };
}

function normalizeDeleteIds(
  cards: readonly CardCanvasCard[],
  deleteIds: readonly string[]
): string[] {
  const existingIds = new Set(cards.map((card) => card.id));
  const seenDeleteIds = new Set<string>();
  const normalizedDeleteIds: string[] = [];

  for (const deleteId of deleteIds) {
    if (
      deleteId === '' ||
      seenDeleteIds.has(deleteId) ||
      !existingIds.has(deleteId)
    ) {
      continue;
    }

    seenDeleteIds.add(deleteId);
    normalizedDeleteIds.push(deleteId);
  }

  return normalizedDeleteIds;
}

function expandDeleteIds(
  cards: readonly CardCanvasCard[],
  requestedDeleteIds: readonly string[]
): Set<string> {
  const expandedDeleteIds = new Set<string>();

  for (const deleteId of requestedDeleteIds) {
    expandedDeleteIds.add(deleteId);
    for (const descendantId of getDescendantIds(cards, deleteId)) {
      expandedDeleteIds.add(descendantId);
    }
  }

  return expandedDeleteIds;
}

function hasRequestedChildren(
  cards: readonly CardCanvasCard[],
  requestedDeleteIds: readonly string[]
): boolean {
  return requestedDeleteIds.some(
    (deleteId) => getDescendantIds(cards, deleteId).length > 0
  );
}

export async function deleteCards(
  cards: CardCanvasCard[],
  deleteIds: readonly string[],
  callback?: DeleteCardsCallback
): Promise<CardCanvasCard[]>;
export async function deleteCards(
  cards: readonly CardCanvasCard[],
  deleteIds: readonly string[],
  callback?: DeleteCardsCallback
): Promise<readonly CardCanvasCard[]>;
export async function deleteCards(
  cards: readonly CardCanvasCard[],
  deleteIds: readonly string[],
  callback?: DeleteCardsCallback
): Promise<readonly CardCanvasCard[]> {
  const normalizedDeleteIds = normalizeDeleteIds(cards, deleteIds);
  if (normalizedDeleteIds.length === 0) {
    return cards;
  }

  const hasChildren = hasRequestedChildren(cards, normalizedDeleteIds);
  const shouldDelete =
    callback === undefined
      ? true
      : await callback(cards, normalizedDeleteIds, { hasChildren });

  if (!shouldDelete) {
    return cards;
  }

  const expandedDeleteIds = expandDeleteIds(cards, normalizedDeleteIds);
  return cards.filter((card) => !expandedDeleteIds.has(card.id));
}
