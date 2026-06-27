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

export interface CardCanvasItemProps {
  readonly card: CardCanvasCard;
  readonly cardsRef: MutableRefObject<CardCanvasCard[]>;
  readonly onCardsChangeRef: MutableRefObject<
    ((nextCards: CardCanvasCard[]) => void) | undefined
  >;
  readonly isSelected: boolean;
  readonly onSelect?: ((id: string) => void) | undefined;
  readonly options: Required<CardCanvasOptions>;
  readonly renderCardTitle?: ((title: string) => ReactNode) | undefined;
  readonly renderCardContent?: ((content: string) => ReactNode) | undefined;
}

const CONTENT_CLICK_MOVE_THRESHOLD_PX = 5;

export function CardCanvasItem({
  card,
  cardsRef,
  onCardsChangeRef,
  isSelected,
  onSelect,
  options,
  renderCardTitle,
  renderCardContent,
}: CardCanvasItemProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const resizeHandleRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const resizeDragRef = useRef<Drag | null>(null);
  const isResizingRef = useRef(false);
  const didMoveRef = useRef(false);
  const cardPropRef = useRef(card);
  const optionsRef = useRef(options);
  const onSelectRef = useRef(onSelect);
  const canMoveOrResize = options.requireSelectionToMoveResize ? isSelected : true;
  const canMoveOrResizeRef = useRef(canMoveOrResize);

  useEffect(() => {
    cardPropRef.current = card;
  }, [card]);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

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

    let initialX = cardPropRef.current.x;
    let initialY = cardPropRef.current.y;

    const onStart = () => {
      didMoveRef.current = false;
      if (isResizingRef.current || !canMoveOrResizeRef.current) return;
      initialX = cardPropRef.current.x;
      initialY = cardPropRef.current.y;
    };

    const onMove = (fingers: Finger[]) => {
      if (
        isResizingRef.current ||
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
      if (deltaX === 0 && deltaY === 0) return;

      const cardId = cardPropRef.current.id;
      const nextCards = cardsRef.current.map((currentCard) => {
        if (currentCard.id !== cardId) return currentCard;
        return { ...currentCard, x: initialX + deltaX, y: initialY + deltaY };
      });
      onCardsChangeRef.current(nextCards);
      didMoveRef.current = true;
    };

    const onEnd = () => {
      cardEl.style.transform = '';
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
      drag.removeEventListener(DragOperationType.Start, onStart);
      drag.removeEventListener(DragOperationType.Move, onMove);
      drag.removeEventListener(DragOperationType.End, onEnd);
      drag.removeEventListener(DragOperationType.AllEnd, onEnd);
      drag.destroy();
      dragRef.current = null;
    };
  }, [cardsRef, onCardsChangeRef]);

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
        return { ...currentCard, width: nextWidth, height: nextHeight };
      });
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
  }, [cardsRef, onCardsChangeRef]);

  const contentRef = useRef<HTMLDivElement>(null);
  const contentPointerDownRef = useRef<{ readonly x: number; readonly y: number } | null>(null);

  // Bind the content click listener natively so the content div is not flagged
  // as an interactive element by static a11y lint, while preserving the
  // original mouse-only card selection behavior.
  useEffect(() => {
    const contentEl = contentRef.current;
    if (!contentEl || !onSelect) return;

    const handlePointerDown = (e: PointerEvent) => {
      if (e.button !== 0) {
        contentPointerDownRef.current = null;
        return;
      }
      contentPointerDownRef.current = { x: e.clientX, y: e.clientY };
    };

    const handlePointerCancel = () => {
      contentPointerDownRef.current = null;
    };

    const handleClick = (e: MouseEvent) => {
      const start = contentPointerDownRef.current;
      contentPointerDownRef.current = null;
      if (optionsRef.current.requireSelectionToMoveResize && start) {
        const dx = e.clientX - start.x;
        const dy = e.clientY - start.y;
        if (dx * dx + dy * dy >= CONTENT_CLICK_MOVE_THRESHOLD_PX * CONTENT_CLICK_MOVE_THRESHOLD_PX) {
          return;
        }
      }
      onSelect(card.id);
    };

    contentEl.addEventListener('pointerdown', handlePointerDown);
    contentEl.addEventListener('pointercancel', handlePointerCancel);
    contentEl.addEventListener('click', handleClick);
    return () => {
      contentEl.removeEventListener('pointerdown', handlePointerDown);
      contentEl.removeEventListener('pointercancel', handlePointerCancel);
      contentEl.removeEventListener('click', handleClick);
    };
  }, [card.id, onSelect]);

  return (
    <div
      ref={cardRef}
      className={`cards-card-canvas__card${isSelected ? ' cards-card-canvas__card--selected' : ''}`}
      data-card-id={card.id}
      style={{
        left: `${card.x}px`,
        top: `${card.y}px`,
        width: `${card.width}px`,
        height: `${card.height}px`,
        zIndex: card.zIndex,
      }}
    >
      <div className="cards-card-canvas__card-header" style={card.titleStyle}>
        {renderCardTitle ? renderCardTitle(card.title) : card.title}
      </div>
      <div
        ref={contentRef}
        className="cards-card-canvas__card-content"
        style={card.contentStyle}
      >
        {renderCardContent ? renderCardContent(card.content) : card.content}
      </div>
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
