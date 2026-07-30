import type { RefObject } from 'react';
import type { ContentInset } from '../utils/cards';
import { CARD_CANVAS_COORDINATE_OVERLAY_SELECTOR } from '../utils/card-popover-interactions';

export function externalCanvasPoint(
  point: { readonly x: number; readonly y: number },
  scale: number,
  wrapperRef: RefObject<HTMLDivElement | null>,
  containerRef: RefObject<HTMLDivElement | null>
) {
  const wrapper = wrapperRef.current;
  const container = containerRef.current;
  if (wrapper === null || container === null) return undefined;
  const bounds = wrapper.getBoundingClientRect();
  if (
    point.x < bounds.left ||
    point.x > bounds.right ||
    point.y < bounds.top ||
    point.y > bounds.bottom
  )
    return undefined;
  const hit = document.elementFromPoint(point.x, point.y);
  // 有效区域是整个未变换放置视口（含未被卡片容器覆盖的画布背景）；
  // 交互浮层（工具栏、MiniMap、Popover、Menu、Dialog）通过选择器排除。
  if (
    hit === null ||
    !wrapper.contains(hit) ||
    hit.closest(CARD_CANVAS_COORDINATE_OVERLAY_SELECTOR) !== null
  )
    return undefined;
  const rect = container.getBoundingClientRect();
  return { x: (point.x - rect.left) / scale, y: (point.y - rect.top) / scale };
}

export function externalContentInset(
  headless: boolean,
  scale: number,
  containerRef: RefObject<HTMLDivElement | null>
): ContentInset {
  const card = containerRef.current?.querySelector<HTMLElement>(
    '.cards-card-canvas__card:not([data-external-card-preview])'
  );
  const content = card?.querySelector<HTMLElement>(
    '.cards-card-canvas__card-content'
  );
  if (
    card === undefined ||
    card === null ||
    content === undefined ||
    content === null
  )
    return { left: 13, top: headless ? 13 : 50, right: 13, bottom: 13 };
  const cardRect = card.getBoundingClientRect();
  const contentRect = content.getBoundingClientRect();
  return {
    left: (contentRect.left - cardRect.left) / scale + 12,
    top: (contentRect.top - cardRect.top) / scale + 12,
    right: (cardRect.right - contentRect.right) / scale + 12,
    bottom: (cardRect.bottom - contentRect.bottom) / scale + 12,
  };
}
