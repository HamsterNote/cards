import { confirm, Icon } from '@hamster-note/components';
import { type NoteBlock, NoteContent } from '@hamster-note/notes';
// notes 富文本编辑器样式：打进本库 dist/cards.css，使用方无需单独引入
import '@hamster-note/notes/styles.css';
import {
  Drag,
  DragOperationType,
  type Finger,
  FingerOperationType,
  type Pose,
} from '@system-ui-js/multi-drag';
import {
  type MutableRefObject,
  type ClipboardEvent as ReactClipboardEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import type { CardsTheme } from '../theme';
import { resolveCardContentBlocks } from '../utils/card-content-blocks';
import {
  getMindMapLayoutMode,
  MIND_MAP_DETACH_THRESHOLD,
  normalizeMindMapLayout,
} from '../utils/card-layout';
import {
  finalizeCardDragLayout,
  resizeCardWithMindMapNormalization,
} from '../utils/card-layout-interactions';
import {
  addSymmetricCardLink,
  findTopmostLinkTargetId,
  removeSymmetricCardLink,
  resolveLinkedCards,
} from '../utils/card-links';
import type { CardDragPositionSnapshot, ContentInset } from '../utils/cards';
import {
  createDragPositionSnapshot,
  findParentCandidateId,
  moveCardsFromSnapshot,
} from '../utils/cards';
import type { CardCanvasCard, CardCanvasOptions } from './CardCanvas';

function getReadableThemeColor(themeColor: string): '#000' | '#fff' {
  const hex = themeColor.slice(1);
  if (
    !themeColor.startsWith('#') ||
    (hex.length !== 3 && hex.length !== 6) ||
    !/^[\da-f]+$/i.test(hex)
  ) {
    return '#000';
  }

  const expanded =
    hex.length === 3
      ? `${hex.charAt(0).repeat(2)}${hex.charAt(1).repeat(2)}${hex.charAt(2).repeat(2)}`
      : hex;
  const channels = [0, 2, 4].map((offset) => {
    const value = Number.parseInt(expanded.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance =
    (channels[0] ?? 0) * 0.2126 +
    (channels[1] ?? 0) * 0.7152 +
    (channels[2] ?? 0) * 0.0722;

  return luminance > 0.179 ? '#000' : '#fff';
}

export interface CardCanvasItemProps {
  readonly card: CardCanvasCard;
  readonly cards: readonly CardCanvasCard[];
  readonly getCards: () => CardCanvasCard[];
  readonly commitCards?: ((nextCards: CardCanvasCard[]) => void) | undefined;
  readonly viewportScale: number;
  readonly isSelected: boolean;
  readonly onSelect?: ((id: string) => void) | undefined;
  /** 双击只读正文时，交由画布打开统一的正文编辑 Dialog。 */
  readonly onEditContent?: ((id: string) => void) | undefined;
  readonly options: Required<CardCanvasOptions>;
  readonly renderCardTitle?: ((title: string) => ReactNode) | undefined;
  readonly renderCardContent?: ((content: string) => ReactNode) | undefined;
  readonly editable: boolean;
  readonly focusTitle: boolean;
  /** 画布主题，透传给 NoteContent */
  readonly theme: CardsTheme;
  /** 将部分数据合并到当前卡片（与画布 Popover 的 set 同一路径，含导图布局归一化） */
  readonly onPatchCard: (data: Partial<Omit<CardCanvasCard, 'id'>>) => void;
  /** 将卡片容器回传给画布，用作选中 Popover 的定位锚点 */
  readonly onPopoverAnchorChange: (
    cardId: string,
    anchor: HTMLDivElement | null
  ) => void;
  readonly isParentCandidate: boolean;
  readonly setParentCandidateId: (id: string | undefined) => void;
  readonly linkMode: boolean;
  readonly onLinkClick?:
    | ((targetCard: CardCanvasCard, sourceCard: CardCanvasCard) => void)
    | undefined;
  readonly onDraggingChange?: ((isDragging: boolean) => void) | undefined;
  /** 当前卡片是否为连线拖拽的源头卡片 */
  readonly isLinkSource: boolean;
  /** 当前卡片是否为连线拖拽的目标卡片（悬停中） */
  readonly isLinkTarget: boolean;
  /** 连线拖拽开始时回调，参数为源头卡片 id */
  readonly onLinkDragStart?: ((sourceCardId: string) => void) | undefined;
  /** 连线拖拽过程中回调，参数为指针位置和目标卡片 id */
  readonly onLinkDragMove?:
    | ((
        point: { readonly x: number; readonly y: number },
        targetCardId?: string
      ) => void)
    | undefined;
  /** 连线拖拽结束时回调；linked 表示手势命中了有效目标。 */
  readonly onLinkDragEnd?: ((linked: boolean) => void) | undefined;
}

const CONTENT_CLICK_MOVE_THRESHOLD_PX = 5;
const CARD_INTERACTIVE_CONTROL_SELECTOR = [
  'a[href]',
  'button',
  'input',
  'select',
  'textarea',
  '[contenteditable="true"]',
  '[role="button"]',
  '[role="link"]',
].join(',');

export function CardCanvasItem({
  card,
  cards,
  getCards,
  commitCards,
  viewportScale,
  isSelected,
  onSelect,
  onEditContent,
  options,
  renderCardTitle,
  renderCardContent,
  editable,
  focusTitle,
  theme,
  onPatchCard,
  onPopoverAnchorChange,
  isParentCandidate,
  setParentCandidateId,
  linkMode,
  onLinkClick,
  onDraggingChange,
  isLinkSource,
  isLinkTarget,
  onLinkDragStart,
  onLinkDragMove,
  onLinkDragEnd,
}: CardCanvasItemProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const resizeHandleRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const resizeDragRef = useRef<Drag | null>(null);
  const isResizingRef = useRef(false);
  const didMoveRef = useRef(false);
  const cardPropRef = useRef(card);
  const optionsRef = useRef(options);
  const viewportScaleRef = useRef(viewportScale);
  const linkModeRef = useRef(linkMode);
  const onSelectRef = useRef(onSelect);
  const onLinkClickRef = useRef(onLinkClick);
  const onDraggingChangeRef = useRef(onDraggingChange);
  const onLinkDragStartRef = useRef(onLinkDragStart);
  const onLinkDragMoveRef = useRef(onLinkDragMove);
  const onLinkDragEndRef = useRef(onLinkDragEnd);
  const pointerPointRef = useRef<
    { readonly x: number; readonly y: number } | undefined
  >(undefined);
  const viewportOffsetRef = useRef<
    { readonly x: number; readonly y: number } | undefined
  >(undefined);
  const isLinkDragRef = useRef(false);
  const linkTargetIdRef = useRef<string | undefined>(undefined);
  const canMoveOrResize =
    card.lock !== true &&
    (options.requireSelectionToMoveResize ? isSelected : true);
  const canMoveOrResizeRef = useRef(canMoveOrResize);
  const isManagedChildDragRef = useRef(false);
  const hasDetachedRef = useRef(false);
  useEffect(() => {
    cardPropRef.current = card;
  }, [card]);

  useEffect(() => {
    onPopoverAnchorChange(card.id, cardRef.current);
    return () => onPopoverAnchorChange(card.id, null);
  }, [card.id, onPopoverAnchorChange]);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  useEffect(() => {
    viewportScaleRef.current = viewportScale;
  }, [viewportScale]);

  useEffect(() => {
    linkModeRef.current = linkMode;
  }, [linkMode]);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    onLinkClickRef.current = onLinkClick;
  }, [onLinkClick]);

  useEffect(() => {
    onDraggingChangeRef.current = onDraggingChange;
  }, [onDraggingChange]);

  useEffect(() => {
    onLinkDragStartRef.current = onLinkDragStart;
  }, [onLinkDragStart]);

  useEffect(() => {
    onLinkDragMoveRef.current = onLinkDragMove;
  }, [onLinkDragMove]);

  useEffect(() => {
    onLinkDragEndRef.current = onLinkDragEnd;
  }, [onLinkDragEnd]);

  useEffect(() => {
    canMoveOrResizeRef.current = canMoveOrResize;
    if (canMoveOrResize) {
      dragRef.current?.setEnabled();
      resizeDragRef.current?.setEnabled();
      return;
    }
    dragRef.current?.setDisabled();
    resizeDragRef.current?.setDisabled();
  }, [canMoveOrResize]);

  const handleCardPointerDownCapture = (
    event: ReactPointerEvent<HTMLDivElement>
  ) => {
    if (
      !(event.target instanceof Element) ||
      event.target.closest(CARD_INTERACTIVE_CONTROL_SELECTOR) === null
    ) {
      return;
    }

    dragRef.current?.setDisabled();
    const resumeDrag = () => {
      document.removeEventListener('pointerup', resumeDrag, true);
      document.removeEventListener('pointercancel', resumeDrag, true);
      if (canMoveOrResizeRef.current) {
        dragRef.current?.setEnabled();
      }
    };
    document.addEventListener('pointerup', resumeDrag, true);
    document.addEventListener('pointercancel', resumeDrag, true);
  };

  useEffect(() => {
    const cardEl = cardRef.current;
    if (!cardEl) return;

    const getPose = (): Pose => {
      const currentCard = cardPropRef.current;
      return {
        position: { x: currentCard.x, y: currentCard.y },
        width: currentCard.width,
        height: currentCard.height,
        rotation: 0,
        scale: 1,
      };
    };

    const drag = new Drag(cardEl, {
      getPose,
      // 卡片位置由 React 以画布坐标提交；禁止 multi-drag 再用屏幕坐标直接写入 left/top。
      setPose: () => {},
    });
    dragRef.current = drag;
    if (!canMoveOrResizeRef.current) {
      drag.setDisabled();
    }

    let dragPositionSnapshot: CardDragPositionSnapshot = new Map();

    // 测量卡片 content 区域（去掉 padding 后）相对卡片左上角的偏移量。
    // 所有卡片共用同一套 CSS，所以用拖拽卡片自身测量即可代表任意卡片的 inset。
    const measureContentInset = (): ContentInset => {
      if (!cardEl) return { left: 13, top: 50, right: 13, bottom: 13 };
      const contentEl = cardEl.querySelector<HTMLElement>(
        '.cards-card-canvas__card-content'
      );
      if (!contentEl) return { left: 13, top: 50, right: 13, bottom: 13 };
      const cardRect = cardEl.getBoundingClientRect();
      const contentRect = contentEl.getBoundingClientRect();
      const CONTENT_PADDING = 12;
      return {
        left: contentRect.left - cardRect.left + CONTENT_PADDING,
        top: contentRect.top - cardRect.top + CONTENT_PADDING,
        right: cardRect.right - contentRect.right + CONTENT_PADDING,
        bottom: cardRect.bottom - contentRect.bottom + CONTENT_PADDING,
      };
    };

    const updateLinkTargetFromClientPoint = (clientPoint: {
      readonly x: number;
      readonly y: number;
    }) => {
      const offset = viewportOffsetRef.current;
      const scale = viewportScaleRef.current;
      const localPointerPoint =
        offset === undefined
          ? clientPoint
          : {
              x: (clientPoint.x - offset.x) / scale,
              y: (clientPoint.y - offset.y) / scale,
            };
      const cardId = cardPropRef.current.id;
      pointerPointRef.current = localPointerPoint;
      linkTargetIdRef.current = findTopmostLinkTargetId({
        cards: getCards(),
        sourceCardId: cardId,
        point: localPointerPoint,
      });
    };

    const trackLinkPointer = (event: PointerEvent) => {
      if (!isLinkDragRef.current) return;
      updateLinkTargetFromClientPoint({ x: event.clientX, y: event.clientY });
    };

    const resetCardElementToModelPosition = () => {
      const currentCard = cardPropRef.current;
      cardEl.style.transform = '';
      cardEl.style.left = `${currentCard.x}px`;
      cardEl.style.top = `${currentCard.y}px`;
    };

    document.addEventListener('pointermove', trackLinkPointer, true);

    const onStart = () => {
      didMoveRef.current = false;
      dragPositionSnapshot = new Map();
      pointerPointRef.current = undefined;
      viewportOffsetRef.current = undefined;
      isLinkDragRef.current = false;
      linkTargetIdRef.current = undefined;
      isManagedChildDragRef.current = false;
      hasDetachedRef.current = false;
      if (isResizingRef.current || !canMoveOrResizeRef.current) return;

      const cardId = cardPropRef.current.id;
      const currentCard = cardPropRef.current;
      const cardElRect = cardEl.getBoundingClientRect();
      viewportOffsetRef.current = {
        x: cardElRect.left - currentCard.x * viewportScaleRef.current,
        y: cardElRect.top - currentCard.y * viewportScaleRef.current,
      };

      if (linkModeRef.current) {
        isLinkDragRef.current = true;
        onDraggingChangeRef.current?.(true);
        onLinkDragStartRef.current?.(cardPropRef.current.id);
        return;
      }

      onDraggingChangeRef.current?.(true);
      const currentCards = getCards();
      dragPositionSnapshot = createDragPositionSnapshot(currentCards, cardId);
      const parentCard =
        currentCard.parent !== undefined
          ? currentCards.find((c) => c.id === currentCard.parent)
          : undefined;
      // mind-map-horizontal 与 arrange 都是「受管控子卡片」：
      // 拖动距离 < 阈值时卡片保持原位（snap-back），>= 阈值时才真正 detach 出父级。
      // arrange 模式下 detach 后其他 sibling 会自动重排填补空位。
      const parentLayoutMode =
        parentCard !== undefined ? getMindMapLayoutMode(parentCard) : 'free';
      isManagedChildDragRef.current =
        currentCard.parent !== undefined &&
        parentCard !== undefined &&
        (parentLayoutMode === 'mind-map-horizontal' ||
          parentLayoutMode === 'arrange');
      if (isManagedChildDragRef.current) {
        cardEl.classList.add('cards-card-canvas__card--drag-pending-detach');
      }
    };

    const onMove = (fingers: Finger[]) => {
      if (
        isResizingRef.current ||
        !canMoveOrResizeRef.current ||
        fingers.length === 0
      )
        return;

      const finger = fingers[0];
      if (!finger) return;

      const startOp = finger.getPath(FingerOperationType.Start)[0];
      const moveOp = finger.getLastOperation(FingerOperationType.Move);
      if (!moveOp) return;

      const cardId = cardPropRef.current.id;
      const offset = viewportOffsetRef.current;
      const scale = viewportScaleRef.current;
      const localPointerPoint =
        offset === undefined
          ? moveOp.point
          : {
              x: (moveOp.point.x - offset.x) / scale,
              y: (moveOp.point.y - offset.y) / scale,
            };
      pointerPointRef.current = localPointerPoint;

      if (isLinkDragRef.current) {
        // 连线模式下卡片不跟随移动 — 立即重置 Drag 框架施加的 transform
        resetCardElementToModelPosition();
        updateLinkTargetFromClientPoint(moveOp.point);
        didMoveRef.current = true;
        // 通知画布更新圆圈和连线位置
        const dragPoint = pointerPointRef.current;
        if (dragPoint !== undefined) {
          onLinkDragMoveRef.current?.(dragPoint, linkTargetIdRef.current);
        }
        return;
      }

      if (
        commitCards === undefined ||
        !startOp ||
        dragPositionSnapshot.size === 0
      )
        return;

      const deltaX =
        (moveOp.point.x - startOp.point.x) / viewportScaleRef.current;
      const deltaY =
        (moveOp.point.y - startOp.point.y) / viewportScaleRef.current;

      if (isManagedChildDragRef.current && !hasDetachedRef.current) {
        const dragDistance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        if (dragDistance < MIND_MAP_DETACH_THRESHOLD) {
          didMoveRef.current = true;
          return;
        }
        hasDetachedRef.current = true;
        cardEl.classList.remove('cards-card-canvas__card--drag-pending-detach');
        const detachedCards = getCards().map((c) => {
          if (c.id !== cardId) return c;
          const detached = { ...c };
          delete detached.parent;
          return detached;
        });
        const normalizedCards = normalizeMindMapLayout(detachedCards);
        cardPropRef.current =
          normalizedCards.find((c) => c.id === cardId) ?? cardPropRef.current;
        commitCards(normalizedCards);
        dragPositionSnapshot = createDragPositionSnapshot(
          normalizedCards,
          cardId
        );
      }

      const moveResult = moveCardsFromSnapshot(
        getCards(),
        dragPositionSnapshot,
        {
          draggedCardId: cardId,
          delta: { x: deltaX, y: deltaY },
        }
      );
      if (moveResult.draggedCard !== undefined) {
        cardPropRef.current = moveResult.draggedCard;
      }
      commitCards(moveResult.cards);

      // 正在移动的卡片（拖拽卡片 + 其子级）一律排除出父级候选
      const movingCardIds = new Set<string>(dragPositionSnapshot.keys());
      const candidateId = findParentCandidateId(
        moveResult.cards,
        cardId,
        localPointerPoint,
        movingCardIds
      );

      setParentCandidateId(candidateId);

      didMoveRef.current = true;
    };

    const onEnd = () => {
      cardEl.style.transform = '';

      if (isLinkDragRef.current) {
        cardEl.classList.remove('cards-card-canvas__card--drag-pending-detach');
        const sourceCardId = cardPropRef.current.id;
        const targetCardId = linkTargetIdRef.current;
        const currentCards = getCards();
        const linked =
          targetCardId !== undefined &&
          targetCardId !== sourceCardId &&
          currentCards.some((currentCard) => currentCard.id === sourceCardId) &&
          currentCards.some((currentCard) => currentCard.id === targetCardId);
        if (linked) {
          const nextCards = addSymmetricCardLink(
            currentCards,
            sourceCardId,
            targetCardId
          );
          cardPropRef.current =
            nextCards.find((currentCard) => currentCard.id === sourceCardId) ??
            cardPropRef.current;
          commitCards?.(nextCards);
        }

        resetCardElementToModelPosition();
        window.requestAnimationFrame(resetCardElementToModelPosition);
        onDraggingChangeRef.current?.(false);
        onLinkDragEndRef.current?.(linked);
        dragPositionSnapshot = new Map();
        pointerPointRef.current = undefined;
        viewportOffsetRef.current = undefined;
        isLinkDragRef.current = false;
        linkTargetIdRef.current = undefined;
        didMoveRef.current = false;
        return;
      }

      if (didMoveRef.current && commitCards !== undefined) {
        const cardId = cardPropRef.current.id;
        const currentCards = getCards();
        const draggedCard = currentCards.find(
          (currentCard) => currentCard.id === cardId
        );
        const movingCardIds = new Set<string>(dragPositionSnapshot.keys());

        if (
          draggedCard !== undefined &&
          pointerPointRef.current !== undefined
        ) {
          const layoutResult = finalizeCardDragLayout(
            currentCards,
            cardId,
            pointerPointRef.current,
            movingCardIds,
            {
              contentInset: measureContentInset(),
              dragStartPosition: dragPositionSnapshot.get(cardId),
            }
          );
          const finalCards = layoutResult.cards;
          cardPropRef.current = layoutResult.draggedCard ?? draggedCard;
          commitCards(finalCards);
        }
      }

      if (isManagedChildDragRef.current && !hasDetachedRef.current) {
        resetCardElementToModelPosition();
        window.requestAnimationFrame(() => {
          resetCardElementToModelPosition();
          cardEl.classList.remove(
            'cards-card-canvas__card--drag-pending-detach'
          );
        });
      } else {
        cardEl.classList.remove('cards-card-canvas__card--drag-pending-detach');
      }

      setParentCandidateId(undefined);
      onDraggingChangeRef.current?.(false);
      dragPositionSnapshot = new Map();
      pointerPointRef.current = undefined;
      viewportOffsetRef.current = undefined;
      if (optionsRef.current.selectOnMoveEnd && didMoveRef.current) {
        onSelectRef.current?.(cardPropRef.current.id);
      }
      didMoveRef.current = false;
    };

    drag.addEventListener(DragOperationType.Start, onStart);
    drag.addEventListener(DragOperationType.Move, onMove);
    drag.addEventListener(DragOperationType.AllEnd, onEnd);

    return () => {
      document.removeEventListener('pointermove', trackLinkPointer, true);
      drag.removeEventListener(DragOperationType.Start, onStart);
      drag.removeEventListener(DragOperationType.Move, onMove);
      drag.removeEventListener(DragOperationType.AllEnd, onEnd);
      drag.destroy();
      dragRef.current = null;
    };
  }, [commitCards, getCards, setParentCandidateId]);

  useEffect(() => {
    if (card.lock === true) return;

    const handleEl = resizeHandleRef.current;
    if (!handleEl) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      if (!canMoveOrResizeRef.current) return;
      isResizingRef.current = true;
      dragRef.current?.setDisabled();
    };
    handleEl.addEventListener('pointerdown', handlePointerDown, true);

    const finishResizeMode = () => {
      isResizingRef.current = false;
      if (canMoveOrResizeRef.current) {
        dragRef.current?.setEnabled();
      }
      setParentCandidateId(undefined);
    };
    document.addEventListener('pointerup', finishResizeMode, true);
    document.addEventListener('pointercancel', finishResizeMode, true);

    const dragHandle = new Drag(handleEl, { setPose: () => {} });
    resizeDragRef.current = dragHandle;
    if (!canMoveOrResizeRef.current) {
      dragHandle.setDisabled();
    }

    let initialWidth = cardPropRef.current.width;
    let initialHeight = cardPropRef.current.height;
    // mindmap 管控子卡片（父卡片为 mind-map-horizontal 布局）在垂直方向居中排列，
    // resize 时高度变化会让上下边界同时移动（各 delta/2），底边实际只走了拖拽距离的一半。
    // 此标记用于在 handleMove 中将高度 delta x2，使底边跟手。
    let isManagedChildResize = false;

    const handleStart = () => {
      if (!canMoveOrResizeRef.current) return;
      initialWidth = cardPropRef.current.width;
      initialHeight = cardPropRef.current.height;
      // 判断被 resize 的卡片是否为 mindmap 管控子卡片
      const currentCard = cardPropRef.current;
      const currentCards = getCards();
      const parentCard =
        currentCard.parent !== undefined
          ? currentCards.find((c) => c.id === currentCard.parent)
          : undefined;
      isManagedChildResize =
        currentCard.parent !== undefined &&
        parentCard !== undefined &&
        getMindMapLayoutMode(parentCard) === 'mind-map-horizontal';
      setParentCandidateId(undefined);
    };

    const handleMove = (fingers: Finger[]) => {
      if (
        !canMoveOrResizeRef.current ||
        commitCards === undefined ||
        fingers.length === 0
      )
        return;

      const finger = fingers[0];
      if (!finger) return;

      const startOp = finger.getPath(FingerOperationType.Start)[0];
      const moveOp = finger.getLastOperation(FingerOperationType.Move);
      if (!startOp || !moveOp) return;

      const deltaX =
        (moveOp.point.x - startOp.point.x) / viewportScaleRef.current;
      const deltaY =
        (moveOp.point.y - startOp.point.y) / viewportScaleRef.current;
      const nextWidth = Math.max(80, initialWidth + deltaX);
      // 管控子卡片因垂直居中布局，高度变化会导致上下边界同时移动（各 delta/2），
      // 底边实际只走了 deltaY 的一半。将高度 delta x2 使底边跟手。
      const effectiveDeltaY = isManagedChildResize ? deltaY * 2 : deltaY;
      const nextHeight = Math.max(80, initialHeight + effectiveDeltaY);
      const cardId = cardPropRef.current.id;

      const layoutResult = resizeCardWithMindMapNormalization(
        getCards(),
        cardId,
        {
          width: nextWidth,
          height: nextHeight,
        }
      );
      const finalCards = layoutResult.cards;

      cardPropRef.current = layoutResult.draggedCard ?? cardPropRef.current;
      commitCards(finalCards);
    };

    dragHandle.addEventListener(DragOperationType.Start, handleStart);
    dragHandle.addEventListener(DragOperationType.Move, handleMove);
    dragHandle.addEventListener(DragOperationType.AllEnd, finishResizeMode);

    return () => {
      handleEl.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('pointerup', finishResizeMode, true);
      document.removeEventListener('pointercancel', finishResizeMode, true);
      dragHandle.removeEventListener(DragOperationType.Start, handleStart);
      dragHandle.removeEventListener(DragOperationType.Move, handleMove);
      dragHandle.removeEventListener(
        DragOperationType.AllEnd,
        finishResizeMode
      );
      dragHandle.destroy();
      resizeDragRef.current = null;
    };
  }, [card.lock, commitCards, getCards, setParentCandidateId]);

  const contentRef = useRef<HTMLDivElement>(null);
  const contentPointerDownRef = useRef<{
    readonly x: number;
    readonly y: number;
  } | null>(null);
  const headerPointerDownRef = useRef<{
    readonly x: number;
    readonly y: number;
  } | null>(null);

  // Bind the content and header click listeners natively so these divs are not flagged
  // as interactive elements by static a11y lint, while preserving mouse-only card selection.
  useEffect(() => {
    const contentEl = contentRef.current;
    const headerEl = card.headless === true ? null : headerRef.current;
    if (!onSelect || (!contentEl && !headerEl)) return;

    const bindClickSelect = (
      element: HTMLElement,
      pointerDownRef: MutableRefObject<{
        readonly x: number;
        readonly y: number;
      } | null>
    ) => {
      const handlePointerDown = (e: PointerEvent) => {
        if (
          e.target instanceof Element &&
          e.target.closest(CARD_INTERACTIVE_CONTROL_SELECTOR)
        ) {
          pointerDownRef.current = null;
          return;
        }
        if (e.button !== 0) {
          pointerDownRef.current = null;
          return;
        }
        pointerDownRef.current = { x: e.clientX, y: e.clientY };
      };

      const handlePointerCancel = () => {
        pointerDownRef.current = null;
      };

      const handleClick = (e: MouseEvent) => {
        if (
          e.target instanceof Element &&
          e.target.closest(CARD_INTERACTIVE_CONTROL_SELECTOR)
        ) {
          pointerDownRef.current = null;
          return;
        }
        const start = pointerDownRef.current;
        pointerDownRef.current = null;
        if (start) {
          const dx = e.clientX - start.x;
          const dy = e.clientY - start.y;
          if (
            dx * dx + dy * dy >=
            CONTENT_CLICK_MOVE_THRESHOLD_PX * CONTENT_CLICK_MOVE_THRESHOLD_PX
          ) {
            return;
          }
        }
        onSelect(card.id);
      };

      element.addEventListener('pointerdown', handlePointerDown);
      element.addEventListener('pointercancel', handlePointerCancel);
      element.addEventListener('click', handleClick);
      return () => {
        element.removeEventListener('pointerdown', handlePointerDown);
        element.removeEventListener('pointercancel', handlePointerCancel);
        element.removeEventListener('click', handleClick);
      };
    };

    const contentCleanup = contentEl
      ? bindClickSelect(contentEl, contentPointerDownRef)
      : undefined;
    const headerCleanup = headerEl
      ? bindClickSelect(headerEl, headerPointerDownRef)
      : undefined;
    return () => {
      contentCleanup?.();
      headerCleanup?.();
    };
  }, [card.headless, card.id, onSelect]);

  useEffect(() => {
    const contentEl = contentRef.current;
    if (contentEl === null || onEditContent === undefined) return;

    const handleDoubleClick = (event: MouseEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest(CARD_INTERACTIVE_CONTROL_SELECTOR)
      ) {
        return;
      }
      onEditContent(card.id);
    };

    contentEl.addEventListener('dblclick', handleDoubleClick);
    return () => contentEl.removeEventListener('dblclick', handleDoubleClick);
  }, [card.id, onEditContent]);

  const linkedCards = resolveLinkedCards(cards, card.id);

  const handleLinkButtonClick = (
    event: React.MouseEvent<HTMLButtonElement>,
    targetCard: CardCanvasCard
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const sourceCard = getCards().find((c) => c.id === card.id);
    if (sourceCard !== undefined) {
      onLinkClickRef.current?.(targetCard, sourceCard);
    }
    // 点击链接按钮时，选中链接指向的目标卡片
    onSelectRef.current?.(targetCard.id);
  };

  const handleLinkButtonPointerDown = (
    event: React.PointerEvent<HTMLButtonElement>
  ) => {
    event.stopPropagation();
  };

  const handleLinkButtonMouseDown = (
    event: React.MouseEvent<HTMLButtonElement>
  ) => {
    event.stopPropagation();
  };

  const handleLinkButtonKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    targetCard: CardCanvasCard
  ) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      event.stopPropagation();
      const sourceCard = getCards().find((c) => c.id === card.id);
      if (sourceCard !== undefined) {
        onLinkClickRef.current?.(targetCard, sourceCard);
      }
      // 键盘触发链接按钮时，同样选中目标卡片
      onSelectRef.current?.(targetCard.id);
    }
  };

  const handleDeleteLink = async (
    event: React.MouseEvent<HTMLButtonElement>,
    targetCard: CardCanvasCard
  ) => {
    event.preventDefault();
    event.stopPropagation();
    if (commitCards === undefined) return;
    const targetCardTitle = targetCard.title === '' ? '空' : targetCard.title;

    const confirmed = await confirm({
      title: '删除链接？',
      description: `确定要删除与${targetCardTitle}的链接吗？`,
      confirmText: '删除',
      cancelText: '取消',
      tone: 'danger',
    });
    if (!confirmed) return;

    commitCards(removeSymmetricCardLink(getCards(), card.id, targetCard.id));
  };

  // multi-drag 不识别 contentEditable/按钮等交互元素，指针进入编辑/菜单区域时
  // 禁用卡片拖拽，避免文本选择或按钮点击触发卡片移动；离开后按当前权限恢复。
  const suspendCardDrag = () => {
    dragRef.current?.setDisabled();
  };
  const resumeCardDrag = () => {
    if (canMoveOrResizeRef.current) {
      dragRef.current?.setEnabled();
    }
  };

  const titleEditRef = useRef<HTMLSpanElement>(null);
  const titleBeforeEditRef = useRef(card.title);
  const isCancellingTitleEditRef = useRef(false);

  useEffect(() => {
    const el = titleEditRef.current;
    if (el && document.activeElement !== el && el.textContent !== card.title) {
      el.textContent = card.title;
    }
  }, [card.title]);

  useEffect(() => {
    const titleEdit = titleEditRef.current;
    if (!editable || !focusTitle || titleEdit === null) return;

    titleEdit.focus();
    const selection = window.getSelection();
    if (selection === null) return;

    const range = document.createRange();
    range.selectNodeContents(titleEdit);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }, [editable, focusTitle]);

  const commitTitleEdit = () => {
    if (isCancellingTitleEditRef.current) {
      isCancellingTitleEditRef.current = false;
      return;
    }
    const el = titleEditRef.current;
    if (!el) return;
    const nextTitle = el.textContent ?? '';
    if (nextTitle !== card.title) {
      onPatchCard({ title: nextTitle });
    }
  };

  const handleTitleEditKeyDown = (
    event: ReactKeyboardEvent<HTMLSpanElement>
  ) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.currentTarget.blur();
      return;
    }
    if (event.key === 'Escape') {
      event.currentTarget.textContent = titleBeforeEditRef.current;
      onPatchCard({ title: titleBeforeEditRef.current });
      isCancellingTitleEditRef.current = true;
      event.currentTarget.blur();
    }
  };

  // 标题为纯文本编辑：粘贴时剥掉富文本格式，只插入 text/plain
  const handleTitleEditPaste = (
    event: ReactClipboardEvent<HTMLSpanElement>
  ) => {
    event.preventDefault();
    document.execCommand(
      'insertText',
      false,
      event.clipboardData.getData('text/plain')
    );
  };

  const showNoteContent =
    card.content !== '' || (card.contentBlocks?.length ?? 0) > 0;

  const noteBlocks = useMemo<readonly NoteBlock[]>(
    () => resolveCardContentBlocks(card.id, card.content, card.contentBlocks),
    [card.contentBlocks, card.id, card.content]
  );

  const titleStyle: React.CSSProperties = {
    ...(card.themeColor === undefined
      ? {}
      : {
          backgroundColor: card.themeColor,
          color: getReadableThemeColor(card.themeColor),
        }),
    ...card.titleStyle,
  };
  const contentStyle: React.CSSProperties = {
    ...(card.themeColor === undefined
      ? {}
      : {
          backgroundColor:
            theme === 'dark'
              ? `color-mix(in srgb, ${card.themeColor} 18%, black)`
              : `color-mix(in srgb, ${card.themeColor} 12%, white)`,
        }),
    ...card.contentStyle,
  };

  return (
    <div
      ref={cardRef}
      className={`cards-card-canvas__card${isSelected ? ' cards-card-canvas__card--selected' : ''}${
        isParentCandidate ? ' cards-card-canvas__card--parent-candidate' : ''
      }${isLinkSource ? ' cards-card-canvas__card--link-source' : ''}${
        isLinkTarget ? ' cards-card-canvas__card--link-target' : ''
      }${linkMode ? ' cards-card-canvas__card--link-mode' : ''}`}
      data-card-id={card.id}
      data-card-link-mode={linkMode ? 'true' : undefined}
      data-card-headless={card.headless ? 'true' : undefined}
      data-card-lock={card.lock ? 'true' : undefined}
      aria-disabled={card.lock ? true : undefined}
      onPointerDownCapture={handleCardPointerDownCapture}
      data-parent-candidate={isParentCandidate ? 'true' : undefined}
      style={{
        left: `${card.x}px`,
        top: `${card.y}px`,
        width: `${card.width}px`,
        height: `${card.height}px`,
        zIndex: card.zIndex,
      }}
    >
      {card.headless === true ? null : (
        <div
          ref={headerRef}
          className="cards-card-canvas__card-header"
          data-card-title-empty={card.title === '' ? 'true' : undefined}
          style={titleStyle}
        >
          {renderCardTitle ? (
            renderCardTitle(card.title)
          ) : editable ? (
            // biome-ignore lint/a11y/useSemanticElements: 标题需保持行内纯文本样式与自适应宽度，input/textarea 无法等同呈现
            <span
              ref={titleEditRef}
              className="cards-card-canvas__card-title-edit"
              data-card-title-edit
              contentEditable
              role="textbox"
              aria-label="卡片标题"
              aria-multiline={false}
              tabIndex={0}
              suppressContentEditableWarning
              spellCheck={false}
              onFocus={() => {
                titleBeforeEditRef.current = card.title;
              }}
              onInput={commitTitleEdit}
              onBlur={commitTitleEdit}
              onKeyDown={handleTitleEditKeyDown}
              onPaste={handleTitleEditPaste}
              onPointerEnter={suspendCardDrag}
              onPointerLeave={resumeCardDrag}
            />
          ) : (
            card.title
          )}
        </div>
      )}
      <div
        ref={contentRef}
        className="cards-card-canvas__card-content"
        style={contentStyle}
      >
        {renderCardContent ? (
          renderCardContent(card.content)
        ) : showNoteContent ? (
          <div
            className="cards-card-canvas__card-note cards-card-canvas__embedded-note"
            data-card-note-content
          >
            <NoteContent
              blocks={noteBlocks}
              title=""
              theme={theme}
              {...(card.themeColor === undefined
                ? {}
                : { themeColor: card.themeColor })}
              editable={false}
              topPadding={0}
              bottomPadding={0}
            />
          </div>
        ) : (
          card.content
        )}
      </div>
      {/* Links footer:作为卡片的独立 flex 子元素，不参与 content 的滚动。
          flex-shrink:0 保证 Links 始终完整展示，空间不足时由 content 区域滚动。 */}
      {linkedCards.length > 0 && (
        <div className="cards-card-canvas__card-footer" data-card-link-footer>
          {linkedCards.map((targetCard) => {
            const targetCardTitle =
              targetCard.title === '' ? '空' : targetCard.title;
            return (
              <div key={targetCard.id} className="cards-card-canvas__link-row">
                <button
                  type="button"
                  className="cards-card-canvas__link-button"
                  data-card-link-source-id={card.id}
                  data-card-link-target-id={targetCard.id}
                  onClick={(event) => handleLinkButtonClick(event, targetCard)}
                  onPointerDownCapture={handleLinkButtonPointerDown}
                  onPointerDown={handleLinkButtonPointerDown}
                  onMouseDown={handleLinkButtonMouseDown}
                  onKeyDown={(event) =>
                    handleLinkButtonKeyDown(event, targetCard)
                  }
                >
                  <Icon name="link" />
                  <span>{targetCardTitle}</span>
                </button>
                {commitCards === undefined ? null : (
                  <button
                    type="button"
                    className="cards-card-canvas__link-delete-button"
                    aria-label={`删除与 ${targetCardTitle} 的链接`}
                    data-card-link-delete-source-id={card.id}
                    data-card-link-delete-target-id={targetCard.id}
                    onClick={(event) => handleDeleteLink(event, targetCard)}
                    onPointerDownCapture={handleLinkButtonPointerDown}
                    onPointerDown={handleLinkButtonPointerDown}
                    onMouseDown={handleLinkButtonMouseDown}
                  >
                    <Icon name="delete" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
      {card.lock ? null : (
        <div
          ref={resizeHandleRef}
          className={`cards-card-canvas__resize-handle${
            options.requireSelectionToMoveResize && !isSelected
              ? ' cards-card-canvas__resize-handle--hidden'
              : ''
          }`}
          data-card-resize-handle
        />
      )}
    </div>
  );
}
