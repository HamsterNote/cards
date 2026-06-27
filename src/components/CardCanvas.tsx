import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import {
  Drag,
  DragOperationType,
  FingerOperationType,
  type Pose,
  type Finger,
} from '@system-ui-js/multi-drag';
import './CardCanvas.css';

/** 卡片数据模型 */
export interface CardCanvasCard {
  /** 唯一标识 */
  id: string;
  /** 卡片标题 */
  title: string;
  /** 卡片内容 */
  content: string;
  /** X轴坐标 */
  x: number;
  /** Y轴坐标 */
  y: number;
  /** 卡片宽度 */
  width: number;
  /** 卡片高度 */
  height: number;
  /** 标题区域自定义样式 */
  titleStyle?: CSSProperties;
  /** 内容区域自定义样式 */
  contentStyle?: CSSProperties;
}

/** 画布组件属性 */
export interface CardCanvasProps {
  /** 卡片列表 */
  cards: CardCanvasCard[];
  /** 卡片变更回调 */
  onCardsChange?: (nextCards: CardCanvasCard[]) => void;
  /** 自定义类名 */
  className?: string;
  /** 子节点（如需叠加其他内容） */
  children?: ReactNode;
}

export function CardCanvas({
  cards,
  onCardsChange,
  className = '',
  children,
}: CardCanvasProps) {
  // Use a ref to hold the latest onCardsChange to avoid stale closures in event listeners
  const onCardsChangeRef = useRef(onCardsChange);
  useEffect(() => {
    onCardsChangeRef.current = onCardsChange;
  }, [onCardsChange]);

  // Ref to hold the current cards prop for event handlers
  const cardsRef = useRef(cards);
  useEffect(() => {
    cardsRef.current = cards;
  }, [cards]);

  return (
    <div className={`cards-card-canvas__wrapper ${className}`}>
      <div className="cards-card-canvas__container">
        {cards.map((card) => (
          <CardItem
            key={card.id}
            card={card}
            cardsRef={cardsRef}
            onCardsChangeRef={onCardsChangeRef}
          />
        ))}
        {children}
      </div>
    </div>
  );
}

interface CardItemProps {
  card: CardCanvasCard;
  cardsRef: React.MutableRefObject<CardCanvasCard[]>;
  onCardsChangeRef: React.MutableRefObject<
    ((nextCards: CardCanvasCard[]) => void) | undefined
  >;
}

function CardItem({ card, cardsRef, onCardsChangeRef }: CardItemProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const resizeHandleRef = useRef<HTMLDivElement>(null);

  // Use refs to store drag instances for cleanup
  const dragRef = useRef<Drag | null>(null);
  const resizeDragRef = useRef<Drag | null>(null);

  // Track whether the user is currently resizing so the card-level drag can be ignored.
  const isResizingRef = useRef(false);

  // Ref to hold the current card prop for event handlers without triggering re-renders
  const cardPropRef = useRef(card);
  useEffect(() => {
    cardPropRef.current = card;
  }, [card]);

  useEffect(() => {
    const cardEl = cardRef.current;
    if (!cardEl) return;

    // getPose returns the current layout state (from props). We don't override setPose,
    // so multi-drag applies the visual transform natively.
    const getPose = (): Pose => {
      const c = cardPropRef.current;
      return {
        position: { x: c.x, y: c.y },
        width: c.width,
        height: c.height,
        rotation: 0,
        scale: 1,
      };
    };

    // Initialize drag on the card
    const drag = new Drag(cardEl, {
      getPose,
    });
    dragRef.current = drag;

    let initialX = cardPropRef.current.x;
    let initialY = cardPropRef.current.y;

    const onStart = () => {
      if (isResizingRef.current) return;
      initialX = cardPropRef.current.x;
      initialY = cardPropRef.current.y;
    };

    const onMove = (fingers: Finger[]) => {
      if (
        isResizingRef.current ||
        !onCardsChangeRef.current ||
        fingers.length === 0
      )
        return;
      const finger = fingers[0];
      if (!finger) return;

      const startOp = finger.getPath(FingerOperationType.Start)[0];
      const moveOp = finger.getLastOperation(FingerOperationType.Move);

      if (startOp && moveOp) {
        const deltaX = moveOp.point.x - startOp.point.x;
        const deltaY = moveOp.point.y - startOp.point.y;

        const nextCards = cardsRef.current.map((c) => {
          if (c.id === cardPropRef.current.id) {
            return {
              ...c,
              x: initialX + deltaX,
              y: initialY + deltaY,
            };
          }
          return c;
        });
        onCardsChangeRef.current(nextCards);
      }
    };

    // When drag ends, clear the inline transform so React's left/top takes over
    const onEnd = () => {
      cardEl.style.transform = '';
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

    // Disable the card-level drag as soon as the resize handle is pressed.
    // A native capture listener runs before the card's native bubble-phase
    // pointerdown listener can start a move, while still allowing the resize
    // handle's own drag instance to receive the event.
    const handlePointerDown = (event: PointerEvent) => {
      // Match multi-drag's own filtering: only the primary mouse button starts a drag.
      if (event.pointerType === 'mouse' && event.button !== 0) return;

      isResizingRef.current = true;
      dragRef.current?.setDisabled();
    };
    handleEl.addEventListener('pointerdown', handlePointerDown, true);

    // Safety net: if a pointer is released without the resize Drag firing End
    // (e.g. the gesture was cancelled or filtered), always re-enable card drag.
    const finishResizeMode = () => {
      isResizingRef.current = false;
      dragRef.current?.setEnabled();
    };
    document.addEventListener('pointerup', finishResizeMode, true);
    document.addEventListener('pointercancel', finishResizeMode, true);

    const dragHandle = new Drag(handleEl, {
      setPose: () => {},
    });
    resizeDragRef.current = dragHandle;

    let initialWidth = cardPropRef.current.width;
    let initialHeight = cardPropRef.current.height;

    const handleStart = () => {
      initialWidth = cardPropRef.current.width;
      initialHeight = cardPropRef.current.height;
    };

    const handleMove = (fingers: Finger[]) => {
      if (!onCardsChangeRef.current || fingers.length === 0) return;
      const finger = fingers[0];
      if (!finger) return;

      const startOp = finger.getPath(FingerOperationType.Start)[0];
      const moveOp = finger.getLastOperation(FingerOperationType.Move);

      if (startOp && moveOp) {
        const deltaX = moveOp.point.x - startOp.point.x;
        const deltaY = moveOp.point.y - startOp.point.y;

        const nextWidth = Math.max(80, initialWidth + deltaX);
        const nextHeight = Math.max(80, initialHeight + deltaY);

        const nextCards = cardsRef.current.map((c) => {
          if (c.id === cardPropRef.current.id) {
            return {
              ...c,
              width: nextWidth,
              height: nextHeight,
            };
          }
          return c;
        });
        onCardsChangeRef.current(nextCards);
      }
    };

    const handleEnd = () => {
      finishResizeMode();
    };

    dragHandle.addEventListener(DragOperationType.Start, handleStart);
    dragHandle.addEventListener(DragOperationType.Move, handleMove);
    dragHandle.addEventListener(DragOperationType.End, handleEnd);
    dragHandle.addEventListener(DragOperationType.AllEnd, handleEnd);

    return () => {
      handleEl.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('pointerup', finishResizeMode, true);
      document.removeEventListener('pointercancel', finishResizeMode, true);
      dragHandle.removeEventListener(DragOperationType.Start, handleStart);
      dragHandle.removeEventListener(DragOperationType.Move, handleMove);
      dragHandle.removeEventListener(DragOperationType.End, handleEnd);
      dragHandle.removeEventListener(DragOperationType.AllEnd, handleEnd);
      dragHandle.destroy();
      resizeDragRef.current = null;
    };
  }, [cardsRef, onCardsChangeRef]);

  return (
    <div
      ref={cardRef}
      className="cards-card-canvas__card"
      data-card-id={card.id}
      style={{
        left: `${card.x}px`,
        top: `${card.y}px`,
        width: `${card.width}px`,
        height: `${card.height}px`,
      }}
    >
      <div
        className="cards-card-canvas__card-header"
        style={card.titleStyle}
      >
        {card.title}
      </div>
      <div
        className="cards-card-canvas__card-content"
        style={card.contentStyle}
      >
        {card.content}
      </div>
      <div
        ref={resizeHandleRef}
        className="cards-card-canvas__resize-handle"
        data-card-resize-handle
      />
    </div>
  );
}
