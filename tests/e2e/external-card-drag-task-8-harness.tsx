import { Drag } from '@system-ui-js/multi-drag';
import { StrictMode, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
import {
  CardCanvas,
  type CardCanvasCard,
} from '../../src/components/CardCanvas';
import type { CardCanvasHandle } from '../../src/components/ExternalCardDrag';

type CallbackMode = 'normal' | 'throw-change' | 'throw-select';

type TaskEightApi = {
  readonly start: (id: string, portal: boolean) => string;
  readonly move: (x: number, y: number) => void;
  readonly end: (x: number, y: number) => void;
  readonly completion: () => Promise<unknown> | undefined;
  readonly fingers: () => number;
  readonly setCallbackMode: (mode: CallbackMode) => void;
  readonly activations: () => number;
  readonly dispose: () => void;
};

declare global {
  interface Window {
    __externalDragTaskEight: TaskEightApi | undefined;
  }
}

const CARD: CardCanvasCard = {
  id: 'ordinary',
  title: 'ordinary',
  content: 'ordinary',
  x: 20,
  y: 20,
  width: 100,
  height: 80,
};

export async function installExternalDragTaskEightHarness(): Promise<void> {
  window.__externalDragTaskEight?.dispose();
  document.body.replaceChildren();
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;inset:100px;width:500px;height:400px';
  const source = document.createElement('div');
  document.body.append(host, source);
  const drag = new Drag(source, { setPose: () => {} });
  const root = createRoot(host);
  let handle: CardCanvasHandle | null = null;
  let sessionCompletion: Promise<unknown> | undefined;
  let callbackMode: CallbackMode = 'normal';
  let activations = 0;
  let currentPortal = false;
  let disposed = false;
  let resolveReady: (() => void) | undefined;
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });

  function portalControl(kind: 'title' | 'content') {
    return createPortal(
      <>
        <button
          data-task-eight-portal={`${kind}-button`}
          type="button"
          onClick={() => (activations += 1)}
          onKeyDown={() => (activations += 1)}
        >
          portal button
        </button>
        <a
          data-task-eight-portal={`${kind}-link`}
          href={String('https://example.com/portal')}
          onClick={() => (activations += 1)}
        >
          portal link
        </a>
        <input
          data-task-eight-portal={`${kind}-input`}
          onClick={() => (activations += 1)}
        />
        <button
          data-task-eight-portal={`${kind}-tab`}
          tabIndex={Number('3')}
          type="button"
          onClick={() => (activations += 1)}
          onKeyDown={() => (activations += 1)}
        >
          portal tab
        </button>
      </>,
      document.body
    );
  }

  function OpaquePortalRenderer({
    kind,
  }: {
    readonly kind: 'title' | 'content';
  }) {
    return (
      <>
        <span data-task-eight-ordinary={kind}>ordinary {kind}</span>
        {portalControl(kind)}
      </>
    );
  }

  function Harness() {
    const [cards, setCards] = useState<readonly CardCanvasCard[]>([CARD]);
    const setCanvasHandle = useCallback((next: CardCanvasHandle | null) => {
      handle = next;
      if (next !== null) resolveReady?.();
    }, []);
    return (
      <CardCanvas
        ref={setCanvasHandle}
        cards={[...cards]}
        onCardsChange={(nextCards) => {
          setCards(nextCards);
          if (callbackMode === 'throw-change')
            throw new Error('change failure');
        }}
        onSelect={() => {
          if (callbackMode === 'throw-select')
            throw new Error('select failure');
        }}
        renderCardTitle={(title) =>
          currentPortal && title.startsWith('portal') ? (
            <OpaquePortalRenderer kind="title" />
          ) : (
            title
          )
        }
        renderCardContent={(content) =>
          currentPortal && content.startsWith('portal') ? (
            <OpaquePortalRenderer kind="content" />
          ) : (
            content
          )
        }
      />
    );
  }

  root.render(
    <StrictMode>
      <Harness />
    </StrictMode>
  );
  await ready;
  window.__externalDragTaskEight = {
    start: (id, portal) => {
      if (handle === null) throw new Error('Missing CardCanvas handle');
      currentPortal = portal;
      source.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          button: 0,
          pointerId: 971,
        })
      );
      const result = handle.startExternalDrag({
        card: {
          ...CARD,
          id,
          title: portal ? 'portal title' : id,
          content: portal ? 'portal content' : id,
        },
        drag,
      });
      if (!result.ok) return result.reason;
      sessionCompletion = result.session.completion;
      return 'started';
    },
    move: (x, y) =>
      document.dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          clientX: x,
          clientY: y,
          pointerId: 971,
        })
      ),
    end: (x, y) =>
      document.dispatchEvent(
        new PointerEvent('pointerup', {
          bubbles: true,
          clientX: x,
          clientY: y,
          pointerId: 971,
        })
      ),
    completion: () => sessionCompletion,
    fingers: () => drag.getFingers().length,
    setCallbackMode: (mode) => {
      callbackMode = mode;
    },
    activations: () => activations,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      drag.destroy();
      root.unmount();
      host.remove();
      source.remove();
      window.__externalDragTaskEight = undefined;
    },
  };
}
