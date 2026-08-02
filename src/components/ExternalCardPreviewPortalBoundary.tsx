import { type ReactNode, useLayoutEffect, useRef } from 'react';

type Fiber = {
  readonly child?: unknown;
  readonly return?: unknown;
  readonly sibling?: unknown;
  readonly stateNode?: unknown;
  readonly tag?: unknown;
};

type PortalState = { readonly containerInfo?: unknown };

function isFiber(value: unknown): value is Fiber {
  return typeof value === 'object' && value !== null && 'return' in value;
}

function getFiber(element: Element): Fiber | undefined {
  const key = Reflect.ownKeys(element).find(
    (candidate): candidate is string =>
      typeof candidate === 'string' && candidate.startsWith('__reactFiber$')
  );
  const fiber = key === undefined ? undefined : Reflect.get(element, key);
  return isFiber(fiber) ? fiber : undefined;
}

function belongsTo(fiber: Fiber, boundary: Fiber): boolean {
  let current: Fiber | undefined = fiber;
  while (current !== undefined) {
    if (current === boundary) return true;
    const parent: unknown = current.return;
    current = isFiber(parent) ? parent : undefined;
  }
  return false;
}

function isPortalState(value: unknown): value is PortalState {
  return (
    typeof value === 'object' && value !== null && 'containerInfo' in value
  );
}

function portalContainers(boundary: Fiber): Node[] {
  const containers = new Set<Node>();
  const pending: Fiber[] = [boundary];
  const visited = new Set<Fiber>();
  while (pending.length > 0) {
    const fiber = pending.pop();
    if (fiber === undefined || visited.has(fiber)) continue;
    visited.add(fiber);
    const state = fiber.stateNode;
    if (
      fiber.tag === 4 &&
      isPortalState(state) &&
      state.containerInfo instanceof Node
    ) {
      containers.add(state.containerInfo);
    }
    const child = fiber.child;
    const sibling = fiber.sibling;
    if (isFiber(child)) pending.push(child);
    if (isFiber(sibling)) pending.push(sibling);
  }
  return [...containers];
}

function descendants(container: Node): Element[] {
  if (container instanceof Document) {
    return [...container.querySelectorAll('*')];
  }
  if (container instanceof Element || container instanceof DocumentFragment) {
    return [...container.querySelectorAll('*')];
  }
  return [];
}

export function ExternalCardPreviewPortalBoundary({
  children,
}: {
  readonly children: ReactNode;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    const boundary = element === null ? undefined : getFiber(element)?.return;
    if (!isFiber(boundary)) return;
    const cleanupBlocks: (() => void)[] = [];
    const quarantine = (node: Node) => {
      if (!(node instanceof Element)) return;
      if (node.closest('[data-external-preview-portal-boundary]') !== null)
        return;
      const fiber = getFiber(node);
      if (fiber === undefined || !belongsTo(fiber, boundary)) return;
      node.setAttribute('hidden', '');
      node.setAttribute('inert', '');
      node.setAttribute('aria-hidden', 'true');
      node.setAttribute('data-external-preview-portal', 'true');
      node.setAttribute(
        'style',
        `${node.getAttribute('style') ?? ''};display:none!important`
      );
      const block = (event: Event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
      };
      node.addEventListener('click', block, true);
      node.addEventListener('keydown', block, true);
      cleanupBlocks.push(() => {
        node.removeEventListener('click', block, true);
        node.removeEventListener('keydown', block, true);
      });
    };
    const observe = (container: Node) => {
      descendants(container).forEach(quarantine);
      const observer = new MutationObserver((records) => {
        records.forEach((record) => {
          record.addedNodes.forEach(quarantine);
          record.addedNodes.forEach((node) => {
            if (node instanceof Element)
              node.querySelectorAll('*').forEach(quarantine);
          });
        });
      });
      observer.observe(container, { childList: true, subtree: true });
      return observer;
    };
    const observers = [observe(document.documentElement)];
    portalContainers(boundary).forEach((container) => {
      if (
        container !== document.body &&
        container !== document.documentElement
      ) {
        observers.push(observe(container));
      }
    });
    const block = (event: Event) => {
      const path = event.composedPath();
      if (
        path.some(
          (target) =>
            target instanceof Element &&
            target.closest('[data-external-preview-portal]') !== null
        )
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    document.addEventListener('click', block, true);
    document.addEventListener('keydown', block, true);
    return () => {
      observers.forEach((observer) => {
        observer.disconnect();
      });
      cleanupBlocks.forEach((cleanup) => {
        cleanup();
      });
      document.removeEventListener('click', block, true);
      document.removeEventListener('keydown', block, true);
    };
  }, []);
  return (
    <span
      ref={ref}
      data-external-preview-portal-boundary
      style={{ display: 'contents' }}
    >
      {children}
    </span>
  );
}
