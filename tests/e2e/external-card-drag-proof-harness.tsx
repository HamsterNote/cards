import { Drag } from '@system-ui-js/multi-drag';
import { Profiler, StrictMode, useCallback, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  CardCanvas,
  type CardCanvasCard,
} from '../../src/components/CardCanvas';
import type {
  CardCanvasHandle,
  ExternalCardDragSession,
} from '../../src/components/ExternalCardDrag';
import type { CallbackMode } from './external-card-drag-proof-types';
import { interleaveProofCardMovement } from './external-card-drag-proof-interleave';
import {
  clickProofPreviewControls,
  getProofActiveElement,
} from './external-card-drag-proof-preview-controls';

const PARENT: CardCanvasCard = {
  id: 'parent',
  title: 'Parent',
  content: 'Parent',
  x: 80,
  y: 80,
  width: 260,
  height: 220,
};

export async function installExternalDragProofHarness(): Promise<void> {
  window.__externalDragProof?.dispose();
  document.body.replaceChildren();
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;inset:100px;width:500px;height:400px';
  document.body.append(host);
  const source = document.createElement('div');
  document.body.append(source);
  const root = createRoot(host);
  let handle: CardCanvasHandle | null = null;
  let session: ExternalCardDragSession | undefined;
  let drag: Drag | undefined;
  let mode: CallbackMode = 'normal';
  let renders = 0;
  let firstHandle: CardCanvasHandle | undefined;
  let stableHandle = true;
  let activations = 0;
  let currentCards: readonly CardCanvasCard[] = [];
  let candidateMutations = 0;
  let disposed = false;
  let resolveReady: (() => void) | undefined;
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });

  function Harness() {
    const [cards, setCards] = useState<readonly CardCanvasCard[]>([
      PARENT,
      { ...PARENT, id: 'ordinary', x: 10, y: 10 },
    ]);
    const [selected, setSelected] = useState<readonly string[]>([]);
    currentCards = cards;
    const setHandle = useCallback((next: CardCanvasHandle | null) => {
      handle = next;
      if (next !== null) {
        firstHandle ??= next;
        stableHandle = stableHandle && firstHandle === next;
        resolveReady?.();
      }
    }, []);
    return (
      <Profiler id="external-proof" onRender={() => (renders += 1)}>
        <CardCanvas
          ref={setHandle}
          cards={[...cards]}
          selected={[...selected]}
          onCardsChange={(nextCards) => {
            setCards(nextCards);
            if (mode === 'reenter-cancel') session?.cancel();
            if (mode === 'throw-change') throw new Error('change failure');
          }}
          onSelect={(id) => {
            setSelected([id]);
            if (mode === 'throw-select') throw new Error('select failure');
          }}
          renderPopover={(_card, setCard) => (
            <button
              data-proof-patch-ordinary
              type="button"
              onClick={(event) =>
                setCard({
                  title: event.currentTarget.dataset.title ?? '',
                  content: event.currentTarget.dataset.content ?? '',
                })
              }
            >
              patch
            </button>
          )}
          renderCardTitle={() => (
            <button
              data-proof-title
              type="button"
              onClick={() => (activations += 1)}
            >
              title
            </button>
          )}
          renderCardContent={() => (
            <>
              <a
                data-proof-link
                href="https://example.com/proof"
                onClick={() => (activations += 1)}
              >
                link
              </a>
              <input data-proof-input onClick={() => (activations += 1)} />
              <button
                data-proof-tab-index
                type="button"
                ref={(element) => element?.setAttribute('tabindex', '3')}
                onClick={() => (activations += 1)}
                onKeyDown={() => {}}
              >
                tab
              </button>
            </>
          )}
        />
      </Profiler>
    );
  }

  root.render(
    <StrictMode>
      <Harness />
    </StrictMode>
  );
  await ready;
  const observer = new MutationObserver((records) => {
    candidateMutations += records.length;
  });
  observer.observe(host, {
    attributes: true,
    attributeFilter: ['data-parent-candidate'],
    subtree: true,
  });
  window.__externalDragProof = {
    start: (id) => {
      if (handle === null) throw new Error('Missing handle');
      const nextDrag = new Drag(source, { setPose: () => {} });
      drag = nextDrag;
      source.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          button: 0,
          pointerId: 901,
        })
      );
      const result = handle.startExternalDrag({
        card: { ...PARENT, id, title: id, content: id, width: 80, height: 60 },
        drag: nextDrag,
      });
      if (!result.ok) {
        nextDrag.destroy();
        throw new Error(result.reason);
      }
      session = result.session;
      void result.session.completion.then(() => nextDrag.destroy());
    },
    move: (x, y) =>
      document.dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          clientX: x,
          clientY: y,
          pointerId: 901,
        })
      ),
    end: (x, y) =>
      document.dispatchEvent(
        new PointerEvent('pointerup', {
          bubbles: true,
          clientX: x,
          clientY: y,
          pointerId: 901,
        })
      ),
    completion: () => session?.completion,
    setCallbackMode: (nextMode) => {
      mode = nextMode;
    },
    metrics: () => ({ renders, stableHandle }),
    activeElement: getProofActiveElement,
    clickPreviewControls: clickProofPreviewControls,
    activations: () => activations,
    cards: () => currentCards,
    candidateMutations: () => candidateMutations,
    moveAcrossMacrotasks: async () => {
      for (let offset = 0; offset < 12; offset += 1) {
        await new Promise<void>((resolve) => window.setTimeout(resolve));
        document.dispatchEvent(
          new PointerEvent('pointermove', {
            bubbles: true,
            clientX: 250 + offset,
            clientY: 250,
            pointerId: 901,
          })
        );
      }
    },
    patchThenEnd: (title, content, x, y) => {
      const patchButton = document.querySelector<HTMLButtonElement>(
        '[data-proof-patch-ordinary]'
      );
      if (patchButton === null)
        throw new Error('Missing ordinary patch button');
      patchButton.dataset.title = title;
      patchButton.dataset.content = content;
      patchButton.click();
      document.dispatchEvent(
        new PointerEvent('pointerup', {
          bubbles: true,
          clientX: x,
          clientY: y,
          pointerId: 901,
        })
      );
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      session?.cancel();
      drag?.destroy();
      observer.disconnect();
      root.unmount();
      host.remove();
      source.remove();
      window.__externalDragProof = undefined;
    },
    interleave: (order) => {
      interleaveProofCardMovement(
        host,
        () => {
          window.__externalDragProof?.end(350, 320);
        },
        order
      );
    },
  };
}
