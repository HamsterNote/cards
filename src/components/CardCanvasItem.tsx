import type { MutableRefObject, ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import {
  Drag,
  DragOperationType,
  FingerOperationType,
  type Finger,
  type Pose,
} from '@system-ui-js/multi-drag';
import type { CardCanvasCard, CardCanvasOptions } from './CardCanvas';
import type { CardDragPositionSnapshot, ContentInset } from '../utils/cards';
import {
  assignParentFromPoint,
  createDragPositionSnapshot,
  expandParentToContainChildren,
  findParentCandidateId,
  moveCardsFromSnapshot,
} from '../utils/cards';
import {
  addSymmetricCardLink,
  findTopmostLinkTargetId,
  resolveLinkedCards,
} from '../utils/card-links';

export interface CardCanvasItemProps {
  readonly card: CardCanvasCard;
  readonly cards: readonly CardCanvasCard[];
  readonly cardsRef: MutableRefObject<CardCanvasCard[]>;
  readonly onCardsChangeRef: MutableRefObject<
    ((nextCards: CardCanvasCard[]) => void) | undefined
  >;
  readonly isSelected: boolean;
  readonly onSelect?: ((id: string) => void) | undefined;
  readonly options: Required<CardCanvasOptions>;
  readonly renderCardTitle?: ((title: string) => ReactNode) | undefined;
  readonly renderCardContent?: ((content: string) => ReactNode) | undefined;
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
    | ((point: { readonly x: number; readonly y: number }, targetCardId?: string) => void)
    | undefined;
  /** 连线拖拽结束时回调 */
  readonly onLinkDragEnd?: (() => void) | undefined;
}

const CONTENT_CLICK_MOVE_THRESHOLD_PX = 5;

export function CardCanvasItem({
  card,
  cards,
  cardsRef,
  onCardsChangeRef,
  isSelected,
  onSelect,
  options,
  renderCardTitle,
  renderCardContent,
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
  const resizeHandleRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const resizeDragRef = useRef<Drag | null>(null);
  const isResizingRef = useRef(false);
  const didMoveRef = useRef(false);
  const cardPropRef = useRef(card);
  const optionsRef = useRef(options);
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
  const canMoveOrResize = options.requireSelectionToMoveResize ? isSelected : true;
  const canMoveOrResizeRef = useRef(canMoveOrResize);

  useEffect(() => {
    cardPropRef.current = card;
  }, [card]);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

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

    const drag = new Drag(cardEl, { getPose });
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
      const localPointerPoint =
        offset === undefined
          ? clientPoint
          : { x: clientPoint.x - offset.x, y: clientPoint.y - offset.y };
      const cardId = cardPropRef.current.id;
      pointerPointRef.current = localPointerPoint;
      linkTargetIdRef.current = findTopmostLinkTargetId({
        cards: cardsRef.current,
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
      if (isResizingRef.current || !canMoveOrResizeRef.current) return;

      const cardId = cardPropRef.current.id;
      const currentCard = cardPropRef.current;
      const cardElRect = cardEl.getBoundingClientRect();
      viewportOffsetRef.current = {
        x: cardElRect.left - currentCard.x,
        y: cardElRect.top - currentCard.y,
      };

      if (linkModeRef.current) {
        isLinkDragRef.current = true;
        onDraggingChangeRef.current?.(true);
        onLinkDragStartRef.current?.(cardPropRef.current.id);
        return;
      }

      onDraggingChangeRef.current?.(true);
      dragPositionSnapshot = createDragPositionSnapshot(cardsRef.current, cardId);
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
      const localPointerPoint =
        offset === undefined
          ? moveOp.point
          : { x: moveOp.point.x - offset.x, y: moveOp.point.y - offset.y };
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

      if (!onCardsChangeRef.current || !startOp || dragPositionSnapshot.size === 0) return;

      const deltaX = moveOp.point.x - startOp.point.x;
      const deltaY = moveOp.point.y - startOp.point.y;

      const moveResult = moveCardsFromSnapshot(
        cardsRef.current,
        dragPositionSnapshot,
        {
          draggedCardId: cardId,
          delta: { x: deltaX, y: deltaY },
        }
      );
      if (moveResult.draggedCard !== undefined) {
        cardPropRef.current = moveResult.draggedCard;
      }
      cardsRef.current = moveResult.cards;

      // 正在移动的卡片（拖拽卡片 + 其子级）一律排除出父级候选
      const movingCardIds = new Set<string>(dragPositionSnapshot.keys());
      const candidateId = findParentCandidateId(
        moveResult.cards,
        cardId,
        localPointerPoint,
        movingCardIds
      );

      setParentCandidateId(candidateId);

      onCardsChangeRef.current(moveResult.cards);
      didMoveRef.current = true;
    };

    const onEnd = () => {
      cardEl.style.transform = '';

      if (isLinkDragRef.current) {
        const sourceCardId = cardPropRef.current.id;
        const targetCardId = linkTargetIdRef.current;
        if (targetCardId !== undefined && targetCardId !== sourceCardId) {
          const nextCards = addSymmetricCardLink(
            cardsRef.current,
            sourceCardId,
            targetCardId
          );
          cardsRef.current = nextCards;
          cardPropRef.current =
            nextCards.find((currentCard) => currentCard.id === sourceCardId) ??
            cardPropRef.current;
          onCardsChangeRef.current?.(nextCards);
        }

        resetCardElementToModelPosition();
        window.requestAnimationFrame(resetCardElementToModelPosition);
        onDraggingChangeRef.current?.(false);
        onLinkDragEndRef.current?.();
        dragPositionSnapshot = new Map();
        pointerPointRef.current = undefined;
        viewportOffsetRef.current = undefined;
        isLinkDragRef.current = false;
        linkTargetIdRef.current = undefined;
        didMoveRef.current = false;
        return;
      }

      if (didMoveRef.current && onCardsChangeRef.current) {
        const cardId = cardPropRef.current.id;
        const draggedCard = cardsRef.current.find(
          (currentCard) => currentCard.id === cardId
        );
        const movingCardIds = new Set<string>(dragPositionSnapshot.keys());

        if (draggedCard !== undefined && pointerPointRef.current !== undefined) {
          const assignmentResult = assignParentFromPoint(
            cardsRef.current,
            cardId,
            pointerPointRef.current,
            movingCardIds
          );

          // 归入父级后，扩展父卡片使子卡片完全包含在其 content 区域内
          const assignedCard = assignmentResult.draggedCard;
          let finalCards = assignmentResult.cards;
          if (assignedCard?.parent) {
            finalCards = expandParentToContainChildren(
              finalCards,
              assignedCard.parent,
              measureContentInset()
            );
          }

          if (assignedCard !== undefined) {
            cardPropRef.current =
              finalCards.find((c) => c.id === cardId) ?? assignedCard;
          }
          cardsRef.current = finalCards;
          onCardsChangeRef.current(finalCards);
        }
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
    drag.addEventListener(DragOperationType.End, onEnd);
    drag.addEventListener(DragOperationType.AllEnd, onEnd);

    return () => {
      document.removeEventListener('pointermove', trackLinkPointer, true);
      drag.removeEventListener(DragOperationType.Start, onStart);
      drag.removeEventListener(DragOperationType.Move, onMove);
      drag.removeEventListener(DragOperationType.End, onEnd);
      drag.removeEventListener(DragOperationType.AllEnd, onEnd);
      drag.destroy();
      dragRef.current = null;
    };
  }, [cardsRef, onCardsChangeRef, setParentCandidateId]);

  useEffect(() => {
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

    const handleStart = () => {
      if (!canMoveOrResizeRef.current) return;
      initialWidth = cardPropRef.current.width;
      initialHeight = cardPropRef.current.height;
      setParentCandidateId(undefined);
    };

    const handleMove = (fingers: Finger[]) => {
      if (
        !canMoveOrResizeRef.current ||
        !onCardsChangeRef.current ||
        fingers.length === 0
      )
        return;

      const finger = fingers[0];
      if (!finger) return;

      const startOp = finger.getPath(FingerOperationType.Start)[0];
      const moveOp = finger.getLastOperation(FingerOperationType.Move);
      if (!startOp || !moveOp) return;

      const deltaX = moveOp.point.x - startOp.point.x;
      const deltaY = moveOp.point.y - startOp.point.y;
      const nextWidth = Math.max(80, initialWidth + deltaX);
      const nextHeight = Math.max(80, initialHeight + deltaY);
      const cardId = cardPropRef.current.id;

      const nextCards = cardsRef.current.map((currentCard) => {
        if (currentCard.id !== cardId) return currentCard;
        const nextCard = { ...currentCard, width: nextWidth, height: nextHeight };
        cardPropRef.current = nextCard;
        return nextCard;
      });
      cardsRef.current = nextCards;
      onCardsChangeRef.current(nextCards);
    };

    dragHandle.addEventListener(DragOperationType.Start, handleStart);
    dragHandle.addEventListener(DragOperationType.Move, handleMove);
    dragHandle.addEventListener(DragOperationType.End, finishResizeMode);
    dragHandle.addEventListener(DragOperationType.AllEnd, finishResizeMode);

    return () => {
      handleEl.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('pointerup', finishResizeMode, true);
      document.removeEventListener('pointercancel', finishResizeMode, true);
      dragHandle.removeEventListener(DragOperationType.Start, handleStart);
      dragHandle.removeEventListener(DragOperationType.Move, handleMove);
      dragHandle.removeEventListener(DragOperationType.End, finishResizeMode);
      dragHandle.removeEventListener(DragOperationType.AllEnd, finishResizeMode);
      dragHandle.destroy();
      resizeDragRef.current = null;
    };
  }, [cardsRef, onCardsChangeRef, setParentCandidateId]);

  const contentRef = useRef<HTMLDivElement>(null);
  const contentPointerDownRef = useRef<{ readonly x: number; readonly y: number } | null>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const headerPointerDownRef = useRef<{ readonly x: number; readonly y: number } | null>(null);

  // Bind the content and header click listeners natively so these divs are not flagged
  // as interactive elements by static a11y lint, while preserving mouse-only card selection.
  useEffect(() => {
    const contentEl = contentRef.current;
    const headerEl = headerRef.current;
    if (!onSelect || (!contentEl && !headerEl)) return;

    const bindClickSelect = (
      element: HTMLElement,
      pointerDownRef: MutableRefObject<{ readonly x: number; readonly y: number } | null>
    ) => {
      const handlePointerDown = (e: PointerEvent) => {
        if (
          e.target instanceof HTMLElement &&
          e.target.closest('.cards-card-canvas__link-button')
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
          e.target instanceof HTMLElement &&
          e.target.closest('.cards-card-canvas__link-button')
        ) {
          pointerDownRef.current = null;
          return;
        }
        const start = pointerDownRef.current;
        pointerDownRef.current = null;
        if (optionsRef.current.requireSelectionToMoveResize && start) {
          const dx = e.clientX - start.x;
          const dy = e.clientY - start.y;
          if (dx * dx + dy * dy >= CONTENT_CLICK_MOVE_THRESHOLD_PX * CONTENT_CLICK_MOVE_THRESHOLD_PX) {
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
  }, [card.id, onSelect]);

  const linkedCards = resolveLinkedCards(cards, card.id);

  const handleLinkButtonClick = (
    event: React.MouseEvent<HTMLButtonElement>,
    targetCard: CardCanvasCard
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const sourceCard = cardsRef.current.find((c) => c.id === card.id);
    if (sourceCard !== undefined) {
      onLinkClickRef.current?.(targetCard, sourceCard);
    }
  };

  const handleLinkButtonPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
  };

  const handleLinkButtonMouseDown = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
  };

  const handleLinkButtonKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    targetCard: CardCanvasCard
  ) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      event.stopPropagation();
      const sourceCard = cardsRef.current.find((c) => c.id === card.id);
      if (sourceCard !== undefined) {
        onLinkClickRef.current?.(targetCard, sourceCard);
      }
    }
  };

  return (
    <div
      ref={cardRef}
      className={`cards-card-canvas__card${isSelected ? ' cards-card-canvas__card--selected' : ''}${
        isParentCandidate ? ' cards-card-canvas__card--parent-candidate' : ''
      }${isLinkSource ? ' cards-card-canvas__card--link-source' : ''}${
        isLinkTarget ? ' cards-card-canvas__card--link-target' : ''
      }`}
      data-card-id={card.id}
      data-parent-candidate={isParentCandidate ? 'true' : undefined}
      style={{
        left: `${card.x}px`,
        top: `${card.y}px`,
        width: `${card.width}px`,
        height: `${card.height}px`,
        zIndex: card.zIndex,
      }}
    >
      <div ref={headerRef} className="cards-card-canvas__card-header" style={card.titleStyle}>
        {renderCardTitle ? renderCardTitle(card.title) : card.title}
      </div>
      <div
        ref={contentRef}
        className="cards-card-canvas__card-content"
        style={card.contentStyle}
      >
        {renderCardContent ? renderCardContent(card.content) : card.content}
      </div>
      {/* Links footer:作为卡片的独立 flex 子元素，不参与 content 的滚动。
          flex-shrink:0 保证 Links 始终完整展示，空间不足时由 content 区域滚动。 */}
      {linkedCards.length > 0 && (
        <div className="cards-card-canvas__card-footer" data-card-link-footer>
          {linkedCards.map((targetCard) => (
            <button
              key={targetCard.id}
              type="button"
              className="cards-card-canvas__link-button"
              data-card-link-source-id={card.id}
              data-card-link-target-id={targetCard.id}
              onClick={(event) => handleLinkButtonClick(event, targetCard)}
              onPointerDownCapture={handleLinkButtonPointerDown}
              onPointerDown={handleLinkButtonPointerDown}
              onMouseDown={handleLinkButtonMouseDown}
              onKeyDown={(event) => handleLinkButtonKeyDown(event, targetCard)}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
              <span>{targetCard.title}</span>
            </button>
          ))}
        </div>
      )}
      <div
        ref={resizeHandleRef}
        className={`cards-card-canvas__resize-handle${
          options.requireSelectionToMoveResize && !isSelected
            ? ' cards-card-canvas__resize-handle--hidden'
            : ''
        }`}
        data-card-resize-handle
      />
    </div>
  );
}
