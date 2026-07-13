const CARD_CANVAS_INTERACTIVE_CLASS_NAMES = new Set([
  'cards-card-canvas__card',
  'cards-card-canvas__popover',
]);

export const CARD_CANVAS_POPOVER_OVERLAY_ATTRIBUTE =
  'data-card-canvas-popover-overlay';

const CARD_CANVAS_POPOVER_SELECTOR = '.cards-card-canvas__popover';
const CARD_CANVAS_PORTALED_POPOVER_OVERLAY_SELECTOR = `[${CARD_CANVAS_POPOVER_OVERLAY_ATTRIBUTE}]`;
const CARD_CANVAS_PORTALED_OVERLAY_ROLE_SELECTOR = [
  'dialog',
  'grid',
  'listbox',
  'menu',
  'menuitem',
  'option',
  'tree',
  'treeitem',
]
  .map((role) => `[role="${role}"]`)
  .join(', ');

function splitIdList(value: string | null): readonly string[] {
  return value?.split(/\s+/).filter(Boolean) ?? [];
}

function isCardCanvasElement(element: HTMLElement): boolean {
  return Array.from(CARD_CANVAS_INTERACTIVE_CLASS_NAMES).some((className) =>
    element.classList.contains(className)
  );
}

function pathContainsCardCanvasElement(path: readonly EventTarget[]): boolean {
  return path.some(
    (target) => target instanceof HTMLElement && isCardCanvasElement(target)
  );
}

function pathContainsMarkedPopoverOverlay(
  path: readonly EventTarget[]
): boolean {
  return path.some(
    (target) =>
      target instanceof HTMLElement &&
      target.closest(CARD_CANVAS_PORTALED_POPOVER_OVERLAY_SELECTOR) !== null
  );
}

function cardCanvasPopoverIsOpen(): boolean {
  return document.querySelector(CARD_CANVAS_POPOVER_SELECTOR) !== null;
}

function pathContainsCommonPortaledOverlay(
  path: readonly EventTarget[]
): boolean {
  if (!cardCanvasPopoverIsOpen()) {
    return false;
  }

  return path.some(
    (target) =>
      target instanceof HTMLElement &&
      target.closest(CARD_CANVAS_PORTALED_OVERLAY_ROLE_SELECTOR) !== null
  );
}

function popoverControlsElementId(elementId: string): boolean {
  const controllers = document.querySelectorAll<HTMLElement>(
    `${CARD_CANVAS_POPOVER_SELECTOR} [aria-controls], ${CARD_CANVAS_POPOVER_SELECTOR} [aria-owns]`
  );

  return Array.from(controllers).some((controller) => {
    const controlledIds = [
      ...splitIdList(controller.getAttribute('aria-controls')),
      ...splitIdList(controller.getAttribute('aria-owns')),
    ];

    return controlledIds.includes(elementId);
  });
}

function elementIsLabelledByPopover(element: HTMLElement): boolean {
  return splitIdList(element.getAttribute('aria-labelledby')).some(
    (labelId) => {
      const label = document.getElementById(labelId);
      return label?.closest(CARD_CANVAS_POPOVER_SELECTOR) !== null;
    }
  );
}

function pathContainsPopoverAssociatedOverlay(
  path: readonly EventTarget[]
): boolean {
  return path.some((target) => {
    if (!(target instanceof HTMLElement)) {
      return false;
    }

    // 常见 Select/Menu/Dialog 会把浮层 portal 到 body；只要浮层通过
    // aria-controls/aria-owns/aria-labelledby 关联到卡片 Popover 内的触发器，
    // 就应当视为 Popover 交互，而不是外部点击。
    return (
      (target.id !== '' && popoverControlsElementId(target.id)) ||
      elementIsLabelledByPopover(target)
    );
  });
}

export function isCardCanvasInteractivePointerTarget(
  event: PointerEvent
): boolean {
  const path = event.composedPath();

  return (
    pathContainsCardCanvasElement(path) ||
    pathContainsMarkedPopoverOverlay(path) ||
    pathContainsCommonPortaledOverlay(path) ||
    pathContainsPopoverAssociatedOverlay(path)
  );
}
