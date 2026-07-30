import {
  Drag,
  DragOperationType,
  FingerOperationType,
} from '@system-ui-js/multi-drag';
import { useEffect, useRef, useState, type RefObject } from 'react';
import type {
  CardCanvasCard,
  CardCanvasHandle,
  ExternalCardDragAnchor,
  ExternalCardDragCompletion,
  ExternalCardDragSession,
  ExternalCardDragStartRejectReason,
} from '../index';

// 外部拖入模板与画布新建的卡片保持同一尺寸，保证锚点在模板与预览间一一对应。
const EXTERNAL_TEMPLATE_SIZE = { width: 180, height: 120 } as const;
const DEFAULT_ANCHOR: ExternalCardDragAnchor = { x: 0.5, y: 0.5 };

type ExternalDragSourceResult =
  | {
      readonly kind: 'rejected';
      readonly reason: ExternalCardDragStartRejectReason;
    }
  | {
      readonly kind: 'completed';
      readonly completion: ExternalCardDragCompletion;
    };

export type ExternalCardDragSourceProps = {
  readonly canvasRef: RefObject<CardCanvasHandle | null>;
};

// 根据主指针相对模板 DOM 的按下位置计算归一化锚点。
function resolveTemplateAnchor(
  template: HTMLElement,
  drag: Drag
): ExternalCardDragAnchor {
  const finger = drag.getFingers().find((item) => !item.getIsDestroyed());
  const pressPoint = finger?.getLastOperation(FingerOperationType.Start)?.point;
  const rect = template.getBoundingClientRect();
  if (pressPoint === undefined || rect.width === 0 || rect.height === 0) {
    return DEFAULT_ANCHOR;
  }
  return {
    x: (pressPoint.x - rect.left) / rect.width,
    y: (pressPoint.y - rect.top) / rect.height,
  };
}

function formatResultText(result: ExternalDragSourceResult): string {
  if (result.kind === 'rejected') {
    return `rejected: ${result.reason}`;
  }
  const { completion } = result;
  if (completion.status === 'placed') {
    const { card } = completion;
    return `placed: ${card.id} @ (${Math.round(card.x)}, ${Math.round(card.y)})`;
  }
  return `cancelled: ${completion.reason}`;
}

export function ExternalCardDragSource({
  canvasRef,
}: ExternalCardDragSourceProps) {
  const templateRef = useRef<HTMLDivElement | null>(null);
  const sessionRef = useRef<ExternalCardDragSession | null>(null);
  const dragGestureActiveRef = useRef(false);
  const completionTokenRef = useRef(0);
  const mountedRef = useRef(true);
  const nextCardNumberRef = useRef(1);
  const [result, setResult] = useState<ExternalDragSourceResult | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    dragGestureActiveRef.current = false;
    const template = templateRef.current;
    if (template === null) return;

    // 宿主持有的 Drag：setPose 置空使模板自身永不移动，保持默认单指限制。
    const drag = new Drag(template, { setPose: () => {} });

    const handleStart = () => {
      if (dragGestureActiveRef.current) return;
      dragGestureActiveRef.current = true;

      const handle = canvasRef.current;
      if (handle === null) return;

      const cardNumber = nextCardNumberRef.current;
      nextCardNumberRef.current += 1;
      const card: CardCanvasCard = {
        id: `external-card-${cardNumber}`,
        title: `External card ${cardNumber}`,
        content: `Dragged in from the external template (#${cardNumber}).`,
        x: 0,
        y: 0,
        width: EXTERNAL_TEMPLATE_SIZE.width,
        height: EXTERNAL_TEMPLATE_SIZE.height,
        zIndex: cardNumber,
      };

      const startResult = handle.startExternalDrag({
        card,
        drag,
        anchor: resolveTemplateAnchor(template, drag),
      });
      if (!startResult.ok) {
        setResult({ kind: 'rejected', reason: startResult.reason });
        return;
      }

      const session = startResult.session;
      sessionRef.current = session;
      const completionToken = completionTokenRef.current;
      void session.completion.then((completion) => {
        if (
          !mountedRef.current ||
          completionToken !== completionTokenRef.current ||
          sessionRef.current !== session
        )
          return;
        sessionRef.current = null;
        setResult({ kind: 'completed', completion });
      });
    };
    const handleAllEnd = () => {
      dragGestureActiveRef.current = false;
    };
    drag.addEventListener(DragOperationType.Start, handleStart);
    drag.addEventListener(DragOperationType.AllEnd, handleAllEnd);
    return () => {
      mountedRef.current = false;
      dragGestureActiveRef.current = false;
      drag.removeEventListener(DragOperationType.Start, handleStart);
      drag.removeEventListener(DragOperationType.AllEnd, handleAllEnd);
      completionTokenRef.current += 1;
      sessionRef.current?.cancel();
      sessionRef.current = null;
      drag.destroy();
    };
  }, [canvasRef]);

  const status =
    result === null
      ? 'idle'
      : result.kind === 'rejected'
        ? 'rejected'
        : result.completion.status;
  const reason =
    result === null
      ? undefined
      : result.kind === 'rejected'
        ? result.reason
        : result.completion.status === 'cancelled'
          ? result.completion.reason
          : undefined;
  const placedCardId =
    result?.kind === 'completed' && result.completion.status === 'placed'
      ? result.completion.card.id
      : undefined;

  return (
    <div className="card-canvas-demo-external">
      <h3 className="demo__data-display-title">External drag-in template</h3>
      <div
        ref={templateRef}
        className="card-canvas-demo-external__template"
        data-external-card-template
      >
        <div className="card-canvas-demo-external__template-title">
          External template
        </div>
        <div className="card-canvas-demo-external__template-body">
          Drag me into the canvas
        </div>
      </div>
      <div
        className="demo__data-display-content card-canvas-demo-external__result"
        data-external-card-result
        role="status"
        data-external-card-result-status={status}
        {...(reason === undefined
          ? {}
          : { 'data-external-card-result-reason': reason })}
        {...(placedCardId === undefined
          ? {}
          : { 'data-external-card-result-card-id': placedCardId })}
      >
        {result === null ? 'No drag yet' : formatResultText(result)}
      </div>
    </div>
  );
}
