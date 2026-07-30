import { Drag } from '@system-ui-js/multi-drag';
import { StrictMode, useCallback, type ReactNode, useState } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
import {
  CardCanvas,
  type CardCanvasCard,
} from '../../src/components/CardCanvas';
import type {
  CardCanvasHandle,
  ExternalCardDragSession,
} from '../../src/components/ExternalCardDrag';

type TaskTenPortalApi = {
  readonly start: () => string;
  readonly move: () => void;
  readonly endOutside: () => void;
  readonly completion: () => Promise<unknown> | undefined;
  readonly activateOwned: () => void;
  readonly activationCount: () => number;
  readonly fragmentState: () => {
    readonly count: number;
    readonly hidden: boolean;
    readonly inert: boolean;
    readonly ariaHidden: string | null;
  };
  readonly dispose: () => void;
};

declare global {
  interface Window {
    __externalDragTaskTenPortal: TaskTenPortalApi | undefined;
  }
}

const CARD: CardCanvasCard = {
  id: 'task-ten-portal',
  title: 'portal title',
  content: 'portal content',
  x: 0,
  y: 0,
  width: 100,
  height: 80,
};

function isHtmlElement(value: Element | null): value is HTMLElement {
  return value instanceof HTMLElement;
}

export async function installExternalDragTaskTenPortalHarness(): Promise<void> {
  window.__externalDragTaskTenPortal?.dispose();
  document.body.replaceChildren();
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;inset:100px;width:500px;height:400px';
  const source = document.createElement('div');
  const shadowHost = document.createElement('div');
  const shadowRoot = shadowHost.attachShadow({ mode: 'open' });
  const fragment = document.createDocumentFragment();
  document.body.append(host, source, shadowHost);
  const drag = new Drag(source, { setPose: () => {} });
  const root = createRoot(host);
  let handle: CardCanvasHandle | null = null;
  let session: ExternalCardDragSession | undefined;
  let activations = 0;
  let readyResolve: (() => void) | undefined;
  const ready = new Promise<void>((resolve) => {
    readyResolve = resolve;
  });
  const activate = () => {
    activations += 1;
  };
  const portalButton = (attribute: string): ReactNode => (
    <button
      data-task-ten-owned={attribute}
      type="button"
      onClick={activate}
      onKeyDown={activate}
    >
      owned portal
    </button>
  );

  function OpaquePortalRenderer() {
    return (
      <>
        <span data-task-ten-ordinary-title>ordinary title</span>
        {createPortal(
          <svg data-task-ten-owned-svg>
            <title>owned svg portal</title>
            <a data-task-ten-owned="svg-link" href="#owned" tabIndex={0}>
              owned svg portal
            </a>
          </svg>,
          document.body
        )}
        {createPortal(portalButton('shadow-button'), shadowRoot)}
        {createPortal(portalButton('fragment-button'), fragment)}
      </>
    );
  }

  function HostPortal() {
    return createPortal(
      <button data-task-ten-unrelated type="button" onClick={activate}>
        unrelated host portal
      </button>,
      document.body
    );
  }

  function Harness() {
    const [cards, setCards] = useState<readonly CardCanvasCard[]>([]);
    const setHandle = useCallback((next: CardCanvasHandle | null) => {
      handle = next;
      if (next !== null) readyResolve?.();
    }, []);
    return (
      <>
        <CardCanvas
          ref={setHandle}
          cards={[...cards]}
          onCardsChange={setCards}
          renderCardTitle={() => <OpaquePortalRenderer />}
          renderCardContent={() => (
            <span data-task-ten-ordinary-content>ordinary content</span>
          )}
        />
        <HostPortal />
      </>
    );
  }

  root.render(
    <StrictMode>
      <Harness />
    </StrictMode>
  );
  await ready;
  window.__externalDragTaskTenPortal = {
    start: () => {
      if (handle === null) throw new Error('Missing CardCanvas handle');
      source.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          button: 0,
          pointerId: 1011,
        })
      );
      const result = handle.startExternalDrag({ card: CARD, drag });
      if (!result.ok) return result.reason;
      session = result.session;
      return 'started';
    },
    move: () =>
      document.dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          clientX: 300,
          clientY: 300,
          pointerId: 1011,
        })
      ),
    endOutside: () =>
      document.dispatchEvent(
        new PointerEvent('pointerup', {
          bubbles: true,
          clientX: 20,
          clientY: 20,
          pointerId: 1011,
        })
      ),
    completion: () => session?.completion,
    activateOwned: () => {
      const svg = document.querySelector<SVGElement>(
        '[data-task-ten-owned-svg]'
      );
      const shadowButton = shadowRoot.querySelector<HTMLButtonElement>(
        '[data-task-ten-owned="shadow-button"]'
      );
      const fragmentButton = fragment.querySelector<HTMLButtonElement>(
        '[data-task-ten-owned="fragment-button"]'
      );
      svg?.focus();
      svg?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      shadowButton?.focus();
      shadowButton?.click();
      shadowButton?.dispatchEvent(
        new KeyboardEvent('keydown', {
          bubbles: true,
          composed: true,
          key: 'Enter',
        })
      );
      fragmentButton?.focus();
      fragmentButton?.click();
      fragmentButton?.dispatchEvent(
        new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' })
      );
    },
    activationCount: () => activations,
    fragmentState: () => {
      const fragmentButton = fragment.querySelector('[data-task-ten-owned]');
      return {
        count: fragment.querySelectorAll('[data-task-ten-owned]').length,
        hidden: isHtmlElement(fragmentButton) && fragmentButton.hidden === true,
        inert: fragmentButton?.hasAttribute('inert') ?? false,
        ariaHidden: fragmentButton?.getAttribute('aria-hidden') ?? null,
      };
    },
    dispose: () => {
      session?.cancel();
      drag.destroy();
      root.unmount();
      host.remove();
      source.remove();
      shadowHost.remove();
      window.__externalDragTaskTenPortal = undefined;
    },
  };
}
