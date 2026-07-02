import type { CardCanvasCard } from '../components/CardCanvas';
import {
  assignParentFromPoint,
  expandParentToContainChildren,
  findParentCandidateId,
  type ContentInset,
} from './cards';
import {
  getMindMapLayoutMode,
  MIND_MAP_DETACH_THRESHOLD,
  normalizeMindMapLayout,
} from './card-layout';

export type CardLayoutPoint = {
  readonly x: number;
  readonly y: number;
};

export type CardLayoutUpdateResult = {
  readonly cards: CardCanvasCard[];
  readonly draggedCard: CardCanvasCard | undefined;
};

export type AssignParentAtPointerOptions = {
  readonly contentInset: ContentInset;
};

export type FinalizeCardDragLayoutOptions = AssignParentAtPointerOptions & {
  readonly dragStartPosition: CardLayoutPoint | undefined;
};

export type CardResizeDimensions = {
  readonly width: number;
  readonly height: number;
};

export function assignParentAtPointer(
  cards: readonly CardCanvasCard[],
  cardId: string,
  pointerPoint: CardLayoutPoint,
  movingCardIds: ReadonlySet<string>,
  options: AssignParentAtPointerOptions
): CardLayoutUpdateResult {
  const assignmentResult = assignParentFromPoint(
    cards,
    cardId,
    pointerPoint,
    movingCardIds
  );
  const assignedCard = assignmentResult.draggedCard;
  let finalCards = assignmentResult.cards;

  if (assignedCard?.parent) {
    const parentCard = finalCards.find(
      (candidate) => candidate.id === assignedCard.parent
    );
    const parentMode =
      parentCard !== undefined ? getMindMapLayoutMode(parentCard) : 'free';

    if (parentMode === 'mind-map-horizontal') {
      finalCards = normalizeMindMapLayout(finalCards);
    } else if (parentMode === 'arrange') {
      // arrange 模式：先把拖拽卡片插入到 siblings 中正确的数组位置（重排），再归一化布局
      finalCards = normalizeMindMapLayout(
        reorderArrangeChild(finalCards, cardId, pointerPoint)
      );
    } else {
      finalCards = expandParentToContainChildren(
        finalCards,
        assignedCard.parent,
        options.contentInset
      );
    }
  }

  return {
    cards: finalCards,
    draggedCard:
      assignedCard === undefined
        ? undefined
        : finalCards.find((candidate) => candidate.id === cardId) ?? assignedCard,
  };
}

/**
 * 把拖拽卡片插入到 arrange 父卡片中正确的数组位置。
 * 根据当前指针位置与兄弟卡片当前位置（已按流式布局排序）比较，
 * 计算指针应该落在哪个 sibling 之前/之后，然后将拖拽卡片移到该数组位置。
 * 仅调整 cards 数组中 sibling 子集的相对顺序，不改变卡片数据本身的坐标——
 * 之后由 normalizeMindMapLayout 重新计算归一化位置。
 */
export function reorderArrangeChild(
  cards: readonly CardCanvasCard[],
  cardId: string,
  pointerPoint: CardLayoutPoint
): readonly CardCanvasCard[] {
  const draggedCard = cards.find((card) => card.id === cardId);
  if (draggedCard === undefined || draggedCard.parent === undefined) {
    return cards;
  }
  const parentId = draggedCard.parent;

  // 收集所有 sibling（不含拖拽卡片），保持 cards 数组顺序
  const otherIds: string[] = [];
  for (const card of cards) {
    if (card.parent === parentId && card.id !== cardId) {
      otherIds.push(card.id);
    }
  }

  if (otherIds.length === 0) {
    return cards;
  }

  const cardById = new Map(cards.map((card) => [card.id, card]));

  // 流式 key：y 主、x 次（rows 大于 100000 像素以保证 row 之间不交叉）
  const flowKey = (id: string): number => {
    const card = cardById.get(id);
    if (card === undefined) return Number.MAX_SAFE_INTEGER;
    return card.y * 100000 + card.x;
  };

  // 按 flow 顺序排序兄弟卡片
  otherIds.sort((a, b) => flowKey(a) - flowKey(b));

  // 用指针的 flow key 与兄弟卡片的 flow key 比较，定位插入位置
  const pointerFlowKey = pointerPoint.y * 100000 + pointerPoint.x;
  let insertionIndex = otherIds.length;
  for (let i = 0; i < otherIds.length; i++) {
    if (pointerFlowKey < flowKey(otherIds[i]!)) {
      insertionIndex = i;
      break;
    }
  }

  // 构建带拖拽卡片的新 sibling 顺序
  const newSiblingIds = [
    ...otherIds.slice(0, insertionIndex),
    cardId,
    ...otherIds.slice(insertionIndex),
  ];

  // 找到原 sibling 在 cards 数组中的索引位置（按数组升序）
  const siblingArrayIndices: number[] = [];
  for (const [i, card] of cards.entries()) {
    if (card.parent === parentId) {
      siblingArrayIndices.push(i);
    }
  }

  // 将新顺序的 sibling 填回这些数组位置
  const nextCards = [...cards];
  for (
    let i = 0;
    i < newSiblingIds.length && i < siblingArrayIndices.length;
    i++
  ) {
    const cardToPlace = cardById.get(newSiblingIds[i]!);
    if (cardToPlace !== undefined) {
      nextCards[siblingArrayIndices[i]!] = cardToPlace;
    }
  }

  return nextCards;
}

export function finalizeCardDragLayout(
  cards: readonly CardCanvasCard[],
  cardId: string,
  pointerPoint: CardLayoutPoint,
  movingCardIds: ReadonlySet<string>,
  options: FinalizeCardDragLayoutOptions
): CardLayoutUpdateResult {
  const draggedCard = cards.find((currentCard) => currentCard.id === cardId);
  if (draggedCard === undefined) {
    return { cards: [...cards], draggedCard: undefined };
  }

  const parentCard =
    draggedCard.parent === undefined
      ? undefined
      : cards.find((candidate) => candidate.id === draggedCard.parent);
  const parentMode =
    parentCard !== undefined ? getMindMapLayoutMode(parentCard) : 'free';
  // mind-map-horizontal 与 arrange 子卡片都属于「受管控」子卡片，
  // 它们的位置由父卡片布局模式决定而非自由摆放
  const isManagedChild =
    draggedCard.parent !== undefined &&
    parentCard !== undefined &&
    (parentMode === 'mind-map-horizontal' || parentMode === 'arrange');
  const candidateId = findParentCandidateId(
    cards,
    cardId,
    pointerPoint,
    movingCardIds
  );

  if (!isManagedChild || candidateId !== undefined) {
    return assignParentAtPointer(cards, cardId, pointerPoint, movingCardIds, options);
  }

  const dragDistance =
    options.dragStartPosition === undefined
      ? MIND_MAP_DETACH_THRESHOLD
      : Math.hypot(
          draggedCard.x - options.dragStartPosition.x,
          draggedCard.y - options.dragStartPosition.y
        );
  const finalCards =
    dragDistance < MIND_MAP_DETACH_THRESHOLD
      ? normalizeMindMapLayout(cards)
      : normalizeMindMapLayout(
          cards.map((currentCard) => {
            if (currentCard.id !== cardId) return currentCard;

            const detachedCard = { ...currentCard };
            delete detachedCard.parent;
            return detachedCard;
          })
        );

  return {
    cards: finalCards,
    draggedCard: finalCards.find((candidate) => candidate.id === cardId) ?? draggedCard,
  };
}

export function resizeCardWithMindMapNormalization(
  cards: readonly CardCanvasCard[],
  cardId: string,
  dimensions: CardResizeDimensions
): CardLayoutUpdateResult {
  const nextCards = cards.map((currentCard) => {
    if (currentCard.id !== cardId) return currentCard;
    return { ...currentCard, width: dimensions.width, height: dimensions.height };
  });
  const resizedCard = nextCards.find((currentCard) => currentCard.id === cardId);
  const parentCard =
    resizedCard?.parent === undefined
      ? undefined
      : nextCards.find((currentCard) => currentCard.id === resizedCard.parent);
  const shouldNormalizeMindMapLayout =
    resizedCard !== undefined &&
    (getMindMapLayoutMode(resizedCard) === 'mind-map-horizontal' ||
      getMindMapLayoutMode(resizedCard) === 'arrange' ||
      (parentCard !== undefined &&
        (getMindMapLayoutMode(parentCard) === 'mind-map-horizontal' ||
          getMindMapLayoutMode(parentCard) === 'arrange')));
  const finalCards = shouldNormalizeMindMapLayout
    ? normalizeMindMapLayout(nextCards)
    : nextCards;

  return {
    cards: finalCards,
    draggedCard: finalCards.find((currentCard) => currentCard.id === cardId),
  };
}
