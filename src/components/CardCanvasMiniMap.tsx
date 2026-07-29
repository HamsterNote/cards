import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { CardCanvasCard } from './CardCanvas';
import type { CardCanvasViewport } from './CardCanvasVirtualPaper';
import {
  clipMiniMapIndicator,
  getMiniMapFit,
  resolveMiniMapSize,
} from './cardCanvasMiniMapGeometry';

export type CardCanvasMiniMapPosition =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right';

export type CardCanvasMiniMapOptions = {
  readonly enabled?: boolean;
  readonly width?: number;
  readonly height?: number;
  readonly position?: CardCanvasMiniMapPosition;
  readonly testID?: string;
};

type CardCanvasMiniMapProps = {
  readonly cards: readonly CardCanvasCard[];
  readonly contentRef: RefObject<HTMLDivElement | null>;
  readonly viewport: CardCanvasViewport;
  readonly onViewportChange: (viewport: CardCanvasViewport) => void;
  readonly onInteraction: () => void;
  readonly hostRef: RefObject<HTMLDivElement | null>;
  readonly options: CardCanvasMiniMapOptions;
};

export function CardCanvasMiniMap({
  cards,
  contentRef,
  viewport,
  onViewportChange,
  onInteraction,
  hostRef,
  options,
}: CardCanvasMiniMapProps) {
  const containerRef = useRef<HTMLButtonElement>(null);
  const pointerRef = useRef<
    | {
        readonly id: number;
        readonly x: number;
        readonly y: number;
        readonly viewport: CardCanvasViewport;
      }
    | undefined
  >(undefined);
  const viewportRef = useRef(viewport);
  const [hostGeometry, setHostGeometry] = useState({
    width: 0,
    height: 0,
    contentOriginX: 0,
    contentOriginY: 0,
  });
  const size = useMemo(() => resolveMiniMapSize(options), [options]);
  const fit = useMemo(() => getMiniMapFit(cards, size), [cards, size]);

  useLayoutEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (host === null) return;

    const updateSize = () => {
      const content = contentRef.current;
      if (content === null) return;
      const hostRect = host.getBoundingClientRect();
      const contentRect = content.getBoundingClientRect();
      const currentViewport = viewportRef.current;
      setHostGeometry({
        width: hostRect.width,
        height: hostRect.height,
        contentOriginX:
          (contentRect.left - hostRect.left - currentViewport.x) /
          currentViewport.scale,
        contentOriginY:
          (contentRect.top - hostRect.top - currentViewport.y) /
          currentViewport.scale,
      });
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(host);
    return () => observer.disconnect();
  }, [contentRef, hostRef]);

  const indicator = clipMiniMapIndicator(
    {
      x:
        (-viewport.x / viewport.scale - hostGeometry.contentOriginX) *
          fit.scale +
        fit.x,
      y:
        (-viewport.y / viewport.scale - hostGeometry.contentOriginY) *
          fit.scale +
        fit.y,
      width: (hostGeometry.width / viewport.scale) * fit.scale,
      height: (hostGeometry.height / viewport.scale) * fit.scale,
    },
    size
  );

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0))
      return;

    const container = containerRef.current;
    if (container === null || pointerRef.current !== undefined) return;
    container.setPointerCapture(event.pointerId);

    const rect = container.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    const clickedIndicator =
      event.target instanceof Element &&
      event.target.closest('[data-card-minimap-indicator]') !== null;
    const nextViewport = clickedIndicator
      ? viewport
      : {
          ...viewport,
          x:
            hostGeometry.width / 2 -
            (hostGeometry.contentOriginX + (localX - fit.x) / fit.scale) *
              viewport.scale,
          y:
            hostGeometry.height / 2 -
            (hostGeometry.contentOriginY + (localY - fit.y) / fit.scale) *
              viewport.scale,
        };
    if (!clickedIndicator) {
      onInteraction();
      onViewportChange(nextViewport);
    }
    pointerRef.current = {
      id: event.pointerId,
      x: localX,
      y: localY,
      viewport: nextViewport,
    };
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const pointer = pointerRef.current;
    if (pointer === undefined || pointer.id !== event.pointerId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const deltaX = event.clientX - rect.left - pointer.x;
    const deltaY = event.clientY - rect.top - pointer.y;
    onInteraction();
    onViewportChange({
      ...pointer.viewport,
      x: pointer.viewport.x - (deltaX * pointer.viewport.scale) / fit.scale,
      y: pointer.viewport.y - (deltaY * pointer.viewport.scale) / fit.scale,
    });
  };

  const handlePointerEnd = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (pointerRef.current?.id !== event.pointerId) return;
    pointerRef.current = undefined;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    const step = event.shiftKey ? 80 : 40;
    const offset = (() => {
      switch (event.key) {
        case 'ArrowLeft':
          return { x: step, y: 0 };
        case 'ArrowRight':
          return { x: -step, y: 0 };
        case 'ArrowUp':
          return { x: 0, y: step };
        case 'ArrowDown':
          return { x: 0, y: -step };
        default:
          return undefined;
      }
    })();
    if (offset === undefined) return;

    event.preventDefault();
    event.stopPropagation();
    onInteraction();
    onViewportChange({
      ...viewport,
      x: viewport.x + offset.x,
      y: viewport.y + offset.y,
    });
  };

  return (
    <button
      ref={containerRef}
      type="button"
      className={`cards-card-canvas__minimap cards-card-canvas__minimap--${options.position ?? 'bottom-right'}`}
      data-testid={options.testID ?? 'card-canvas-minimap'}
      aria-label="卡片画布 MiniMap"
      aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown"
      style={{ width: size.width, height: size.height }}
      onKeyDown={handleKeyDown}
      onPointerDownCapture={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
    >
      <svg aria-hidden="true" width={size.width} height={size.height}>
        {cards.map((card) => (
          <rect
            key={card.id}
            className="cards-card-canvas__minimap-card"
            x={card.x * fit.scale + fit.x}
            y={card.y * fit.scale + fit.y}
            width={Math.max(card.width * fit.scale, 2)}
            height={Math.max(card.height * fit.scale, 2)}
            style={card.themeColor ? { fill: card.themeColor } : undefined}
          />
        ))}
        <rect
          className="cards-card-canvas__minimap-indicator"
          data-card-minimap-indicator
          x={indicator.x}
          y={indicator.y}
          width={indicator.width}
          height={indicator.height}
        />
      </svg>
    </button>
  );
}
