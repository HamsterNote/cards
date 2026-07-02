import type {
  CardCanvasCard,
  CardChildrenLayoutMode,
} from '../components/CardCanvas';

export const MIND_MAP_HORIZONTAL_GAP = 48;
export const MIND_MAP_VERTICAL_GAP = 24;
export const MIND_MAP_DETACH_THRESHOLD = 48;

// arrange（排列）布局相关常量
// 子卡片之间的水平间距
export const ARRANGE_HORIZONTAL_GAP = 12;
// 行间距（换行后的垂直间距）
export const ARRANGE_VERTICAL_GAP = 12;
// 父卡片 content 区域相对左上角的 inset 默认值
// （实际运行时由 measureContentInset 测量得到，此处仅用作归一化的静态默认值）
const ARRANGE_CONTENT_LEFT = 13;
const ARRANGE_CONTENT_TOP = 50;
const ARRANGE_CONTENT_RIGHT = 13;
const ARRANGE_CONTENT_BOTTOM = 13;

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
  // 默认布局模式为 'arrange'（排列），子卡片在父卡内容区内流式排列
  return card.childrenLayoutMode ?? 'arrange';
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

  const blockHeight = calculateChildrenBlockHeight(context, childIds, visitingIds);
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

function normalizeArrangeParentLayout(
  context: LayoutContext,
  parentId: string,
  visitingIds: ReadonlySet<string>
): void {
  const parent = context.cardById.get(parentId);
  if (parent === undefined || getMindMapLayoutMode(parent) !== 'arrange') {
    return;
  }

  const childIds = getCardChildren(context, parentId);
  if (childIds.length === 0) {
    return;
  }

  const contentLeft = parent.x + ARRANGE_CONTENT_LEFT;
  const contentTop = parent.y + ARRANGE_CONTENT_TOP;
  const contentRight = parent.x + parent.width - ARRANGE_CONTENT_RIGHT;

  let cursorX = contentLeft;
  let cursorY = contentTop;
  let rowMaxHeight = 0;
  let maxBottom = contentTop;

  for (const childId of childIds) {
    if (visitingIds.has(childId)) {
      continue;
    }

    const child = context.cardById.get(childId);
    if (child === undefined) {
      continue;
    }

    // 当前行放不下且当前行已有卡片 → 换行到下一行
    if (cursorX + child.width > contentRight && cursorX > contentLeft) {
      cursorX = contentLeft;
      cursorY += rowMaxHeight + ARRANGE_VERTICAL_GAP;
      rowMaxHeight = 0;
    }

    // 移动子卡片及其后代到目标位置（保持后代相对偏移不变）
    const targetX = cursorX;
    const targetY = cursorY;
    const deltaX = targetX - child.x;
    const deltaY = targetY - child.y;
    if (deltaX !== 0 || deltaY !== 0) {
      moveCardTree(context, childId, { x: deltaX, y: deltaY });
    }

    // 递归归一化子卡片的布局（如果子卡片本身也是 arrange 或 mind-map parent）
    const movedChild = context.cardById.get(childId);
    if (movedChild !== undefined) {
      const nextVisitingIds = new Set(visitingIds);
      nextVisitingIds.add(childId);
      if (getMindMapLayoutMode(movedChild) === 'arrange') {
        normalizeArrangeParentLayout(context, childId, nextVisitingIds);
      } else if (getMindMapLayoutMode(movedChild) === 'mind-map-horizontal') {
        normalizeParentLayout(context, childId, nextVisitingIds);
      }
    }

    cursorX += child.width + ARRANGE_HORIZONTAL_GAP;
    rowMaxHeight = Math.max(rowMaxHeight, child.height);
    if (cursorY + rowMaxHeight > maxBottom) {
      maxBottom = cursorY + rowMaxHeight;
    }
  }

  // 扩展父卡片：高度按子卡片占据空间向下扩展；宽度按最宽单卡扩展
  const requiredHeight = maxBottom + ARRANGE_CONTENT_BOTTOM - parent.y;
  let maxWidth = 0;
  for (const childId of childIds) {
    const child = context.cardById.get(childId);
    if (child !== undefined && child.width > maxWidth) {
      maxWidth = child.width;
    }
  }
  const requiredWidth = maxWidth + ARRANGE_CONTENT_LEFT + ARRANGE_CONTENT_RIGHT;
  if (requiredHeight > parent.height || requiredWidth > parent.width) {
    context.cardById.set(parentId, {
      ...parent,
      width: Math.max(parent.width, requiredWidth),
      height: Math.max(parent.height, requiredHeight),
    });
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

  for (const card of cards) {
    if (getMindMapLayoutMode(card) === 'arrange') {
      normalizeArrangeParentLayout(context, card.id, new Set([card.id]));
    }
  }

  return cards.map((card) => context.cardById.get(card.id) ?? card);
}
