import type {
  CardCanvasCard,
  CardChildrenLayoutMode,
} from '../components/CardCanvas';

export const MIND_MAP_HORIZONTAL_GAP = 48;
export const MIND_MAP_VERTICAL_GAP = 24;
export const MIND_MAP_DETACH_THRESHOLD = 48;

type CardPoint = {
  readonly x: number;
  readonly y: number;
};

type LayoutContext = {
  readonly cardById: Map<string, CardCanvasCard>;
  readonly childrenByParent: ReadonlyMap<string, readonly string[]>;
};

function normalizeParentId(parent: string | undefined): string | undefined {
  return parent === undefined || parent === '' ? undefined : parent;
}

export function getMindMapLayoutMode(
  card: CardCanvasCard
): CardChildrenLayoutMode {
  return card.childrenLayoutMode ?? 'free';
}

export function shouldNormalizeMindMapAfterCardUpdate(
  before: CardCanvasCard,
  after: CardCanvasCard,
  cards: readonly CardCanvasCard[]
): boolean {
  const hasLayoutChange =
    before.parent !== after.parent ||
    before.x !== after.x ||
    before.y !== after.y ||
    before.width !== after.width ||
    before.height !== after.height ||
    before.childrenLayoutMode !== after.childrenLayoutMode;
  if (!hasLayoutChange) {
    return false;
  }

  const previousParent =
    before.parent === undefined
      ? undefined
      : cards.find((card) => card.id === before.parent);
  const nextParent =
    after.parent === undefined
      ? undefined
      : cards.find((card) => card.id === after.parent);
  return (
    after.childrenLayoutMode === 'mind-map-horizontal' ||
    (previousParent !== undefined &&
      getMindMapLayoutMode(previousParent) === 'mind-map-horizontal') ||
    (nextParent !== undefined &&
      getMindMapLayoutMode(nextParent) === 'mind-map-horizontal')
  );
}

function buildDirectChildrenByParent(
  cards: readonly CardCanvasCard[]
): ReadonlyMap<string, readonly string[]> {
  const childrenByParent = new Map<string, string[]>();

  for (const card of cards) {
    const parentId = normalizeParentId(card.parent);
    if (parentId === undefined) {
      continue;
    }

    const childIds = childrenByParent.get(parentId) ?? [];
    childIds.push(card.id);
    childrenByParent.set(parentId, childIds);
  }

  return childrenByParent;
}

function getCardChildren(
  context: LayoutContext,
  parentId: string
): readonly string[] {
  return context.childrenByParent.get(parentId) ?? [];
}

function sumChildSubtreeHeights(
  context: LayoutContext,
  childIds: readonly string[],
  visitingIds: ReadonlySet<string>
): number {
  return childIds.reduce(
    (totalHeight, childId) =>
      totalHeight + calculateSubtreeHeight(context, childId, visitingIds),
    0
  );
}

function calculateChildrenBlockHeight(
  context: LayoutContext,
  childIds: readonly string[],
  visitingIds: ReadonlySet<string>
): number {
  if (childIds.length === 0) {
    return 0;
  }

  return (
    sumChildSubtreeHeights(context, childIds, visitingIds) +
    MIND_MAP_VERTICAL_GAP * (childIds.length - 1)
  );
}

function calculateSubtreeHeight(
  context: LayoutContext,
  cardId: string,
  visitingIds: ReadonlySet<string>
): number {
  const card = context.cardById.get(cardId);
  if (card === undefined || visitingIds.has(cardId)) {
    return 0;
  }

  if (getMindMapLayoutMode(card) === 'free') {
    return card.height;
  }

  const nextVisitingIds = new Set(visitingIds);
  nextVisitingIds.add(cardId);
  const childIds = getCardChildren(context, cardId);
  const descendantsHeight = calculateChildrenBlockHeight(
    context,
    childIds,
    nextVisitingIds
  );

  return Math.max(card.height, descendantsHeight);
}

function setCardPosition(
  context: LayoutContext,
  cardId: string,
  point: CardPoint
): void {
  const card = context.cardById.get(cardId);
  if (card === undefined || (card.x === point.x && card.y === point.y)) {
    return;
  }

  context.cardById.set(cardId, { ...card, x: point.x, y: point.y });
}

function moveCardTree(
  context: LayoutContext,
  cardId: string,
  delta: CardPoint
): void {
  const card = context.cardById.get(cardId);
  if (card === undefined) {
    return;
  }

  setCardPosition(context, cardId, {
    x: card.x + delta.x,
    y: card.y + delta.y,
  });

  for (const childId of getCardChildren(context, cardId)) {
    moveCardTree(context, childId, delta);
  }
}

function normalizeChildTree(
  context: LayoutContext,
  childId: string,
  target: CardPoint
): void {
  const child = context.cardById.get(childId);
  if (child === undefined) {
    return;
  }

  moveCardTree(context, childId, {
    x: target.x - child.x,
    y: target.y - child.y,
  });

  const movedChild = context.cardById.get(childId);
  if (
    movedChild !== undefined &&
    getMindMapLayoutMode(movedChild) === 'mind-map-horizontal'
  ) {
    normalizeParentLayout(context, childId, new Set([childId]));
  }
}

function normalizeParentLayout(
  context: LayoutContext,
  parentId: string,
  visitingIds: ReadonlySet<string>
): void {
  const parent = context.cardById.get(parentId);
  if (parent === undefined || getMindMapLayoutMode(parent) === 'free') {
    return;
  }

  const childIds = getCardChildren(context, parentId);
  if (childIds.length === 0) {
    return;
  }

  const blockHeight = calculateChildrenBlockHeight(
    context,
    childIds,
    visitingIds
  );
  let slotTop = parent.y + parent.height / 2 - blockHeight / 2;

  for (const childId of childIds) {
    if (visitingIds.has(childId)) {
      continue;
    }

    const child = context.cardById.get(childId);
    if (child === undefined) {
      continue;
    }

    const subtreeHeight = calculateSubtreeHeight(context, childId, visitingIds);
    normalizeChildTree(context, childId, {
      x: parent.x + parent.width + MIND_MAP_HORIZONTAL_GAP,
      y: slotTop + subtreeHeight / 2 - child.height / 2,
    });
    slotTop += subtreeHeight + MIND_MAP_VERTICAL_GAP;
  }
}

export function normalizeMindMapLayout(
  cards: readonly CardCanvasCard[]
): CardCanvasCard[] {
  const context: LayoutContext = {
    cardById: new Map(cards.map((card) => [card.id, card])),
    childrenByParent: buildDirectChildrenByParent(cards),
  };

  for (const card of cards) {
    if (getMindMapLayoutMode(card) === 'mind-map-horizontal') {
      normalizeParentLayout(context, card.id, new Set([card.id]));
    }
  }

  return cards.map((card) => context.cardById.get(card.id) ?? card);
}
