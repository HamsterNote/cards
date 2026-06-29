import type { CardCanvasCard } from '../components/CardCanvas';

export type DeleteCardsMeta = {
  readonly hasChildren: boolean;
};

/**
 * 父卡片 content 区域（去掉 padding 后）相对于卡片左上角的偏移量。
 * 用于计算父卡片是否完全包含子卡片，以及需要扩展到多大。
 */
export interface ContentInset {
  /** content 内区域左边界相对卡片左上角的水平偏移（border + header + content-padding-left） */
  readonly left: number;
  /** content 内区域上边界相对卡片左上角的垂直偏移 */
  readonly top: number;
  /** 卡片右边界到 content 内区域右边界的距离（border + content-padding-right） */
  readonly right: number;
  /** 卡片底边界到 content 内区域底边界的距离（border + content-padding-bottom） */
  readonly bottom: number;
}

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
  point: CardPoint,
  excludeIds?: ReadonlySet<string>
): string | undefined {
  let candidateId: string | undefined;
  let candidateZIndex = Number.NEGATIVE_INFINITY;
  let candidateIndex = -1;

  for (const [index, card] of cards.entries()) {
    // 正在移动的卡片（拖拽卡片自身及其子级）一律不参与父级判定
    if (excludeIds?.has(card.id)) continue;

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
  point: CardPoint,
  excludeIds?: ReadonlySet<string>
): CardUpdateResult {
  const currentDraggedCard = cards.find((card) => card.id === draggedCardId);
  if (currentDraggedCard === undefined) {
    return { cards: [...cards], draggedCard: undefined };
  }

  const candidateId = findParentCandidateId(
    cards,
    draggedCardId,
    point,
    excludeIds
  );
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

/**
 * 扩展父卡片尺寸，使其 content 区域（去掉 padding 后）完全包含所有直接子卡片。
 * 仅向右/下方向扩展（增大 width/height），不会缩小或移动卡片位置。
 */
export function expandParentToContainChildren(
  cards: readonly CardCanvasCard[],
  parentId: string,
  inset: ContentInset
): CardCanvasCard[] {
  const parent = cards.find((card) => card.id === parentId);
  if (parent === undefined) return [...cards];

  const children = cards.filter((card) => card.parent === parentId);
  if (children.length === 0) return [...cards];

  let needWidth = parent.width;
  let needHeight = parent.height;

  for (const child of children) {
    const childRight = child.x + child.width;
    const childBottom = child.y + child.height;
    const requiredWidth = childRight - parent.x + inset.right;
    const requiredHeight = childBottom - parent.y + inset.bottom;
    if (requiredWidth > needWidth) needWidth = requiredWidth;
    if (requiredHeight > needHeight) needHeight = requiredHeight;
  }

  if (needWidth === parent.width && needHeight === parent.height) {
    return [...cards];
  }

  return cards.map((card) =>
    card.id === parentId
      ? { ...card, width: needWidth, height: needHeight }
      : card
  );
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
