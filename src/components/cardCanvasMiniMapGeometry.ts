import type { CardCanvasCard } from './CardCanvas';

export type MiniMapSize = { readonly width: number; readonly height: number };

type Bounds = {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
};

export type MiniMapFit = {
  readonly scale: number;
  readonly x: number;
  readonly y: number;
};

export type MiniMapIndicator = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

const DEFAULT_SIZE: MiniMapSize = { width: 200, height: 150 };
const DEFAULT_BOUNDS: Bounds = {
  minX: -200,
  minY: -150,
  maxX: 200,
  maxY: 150,
};
export const MINIMAP_PADDING = 8;
const CONTENT_MARGIN = 50;

export function resolveMiniMapSize(options: {
  readonly width?: number;
  readonly height?: number;
}): MiniMapSize {
  return {
    width:
      options.width !== undefined && options.width > MINIMAP_PADDING * 2
        ? options.width
        : DEFAULT_SIZE.width,
    height:
      options.height !== undefined && options.height > MINIMAP_PADDING * 2
        ? options.height
        : DEFAULT_SIZE.height,
  };
}

function getCardBounds(cards: readonly CardCanvasCard[]): Bounds {
  if (cards.length === 0) return DEFAULT_BOUNDS;

  const minX = Math.min(...cards.map((card) => card.x));
  const minY = Math.min(...cards.map((card) => card.y));
  const maxX = Math.max(...cards.map((card) => card.x + card.width));
  const maxY = Math.max(...cards.map((card) => card.y + card.height));
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const halfWidth = Math.max((maxX - minX) / 2, 50) + CONTENT_MARGIN;
  const halfHeight = Math.max((maxY - minY) / 2, 50) + CONTENT_MARGIN;

  return {
    minX: centerX - halfWidth,
    minY: centerY - halfHeight,
    maxX: centerX + halfWidth,
    maxY: centerY + halfHeight,
  };
}

export function getMiniMapFit(
  cards: readonly CardCanvasCard[],
  size: MiniMapSize
): MiniMapFit {
  const bounds = getCardBounds(cards);
  const availableWidth = size.width - MINIMAP_PADDING * 2;
  const availableHeight = size.height - MINIMAP_PADDING * 2;
  const contentWidth = bounds.maxX - bounds.minX;
  const contentHeight = bounds.maxY - bounds.minY;
  const scale = Math.min(
    availableWidth / contentWidth,
    availableHeight / contentHeight
  );

  return {
    scale,
    x:
      MINIMAP_PADDING +
      (availableWidth - contentWidth * scale) / 2 -
      bounds.minX * scale,
    y:
      MINIMAP_PADDING +
      (availableHeight - contentHeight * scale) / 2 -
      bounds.minY * scale,
  };
}

export function clipMiniMapIndicator(
  indicator: MiniMapIndicator,
  size: MiniMapSize
): MiniMapIndicator {
  const x = Math.max(0, Math.min(indicator.x, size.width));
  const y = Math.max(0, Math.min(indicator.y, size.height));
  const right = Math.max(
    x,
    Math.min(indicator.x + indicator.width, size.width)
  );
  const bottom = Math.max(
    y,
    Math.min(indicator.y + indicator.height, size.height)
  );
  return { x, y, width: right - x, height: bottom - y };
}
