import { expect, test } from '@playwright/test';
import type { CardCanvasCard } from '../../src/components/CardCanvas';

const MULTI_DRAG_MODULE_URL =
  '/node_modules/.vite/deps/@system-ui-js_multi-drag.js';
const REACT_MODULE_URL = '/node_modules/.vite/deps/react.js';
const REACT_DOM_CLIENT_MODULE_URL =
  '/node_modules/.vite/deps/react-dom_client.js';
const CARD_CANVAS_MODULE_URL = '/src/components/CardCanvas.tsx';

test.describe('CardCanvas external card drag sessions', () => {
  test('shows an inert preview on the first Move and places at the final End point', async ({
    page,
  }) => {
    // Given: a real host-owned Drag has started outside a mounted, controlled canvas.
    await page.goto('/');
    await page.evaluate(
      async ({
        cardCanvasModuleUrl,
        multiDragModuleUrl,
        reactDomClientModuleUrl,
        reactModuleUrl,
      }) => {
        const [{ CardCanvas }, { Drag }, reactModule, reactDomClientModule] =
          await Promise.all([
            import(cardCanvasModuleUrl),
            import(multiDragModuleUrl),
            import(reactModuleUrl),
            import(reactDomClientModuleUrl),
          ]);
        const React = reactModule.t();
        const { createRoot } = reactDomClientModule.default;
        const host = document.createElement('div');
        const source = document.createElement('div');
        host.style.cssText =
          'position:fixed;inset:100px;width:500px;height:400px';
        source.style.cssText =
          'position:fixed;left:10px;top:10px;width:30px;height:30px';
        document.body.replaceChildren(host, source);

        const root = createRoot(host);
        const canvasRef = React.createRef();
        root.render(
          React.createElement(CardCanvas, {
            ref: canvasRef,
            cards: [],
            editable: true,
            onCardsChange: (cards: unknown) => {
              window.__externalDragCards = cards;
            },
            onSelect: (id: unknown) => {
              window.__externalDragSelection = id;
            },
          })
        );
        await new Promise((resolve) => requestAnimationFrame(resolve));
        await new Promise((resolve) => requestAnimationFrame(resolve));

        if (canvasRef.current === null) {
          throw new Error('Expected CardCanvas ref after mount');
        }

        const drag = new Drag(source, { setPose: () => {} });
        source.dispatchEvent(
          new PointerEvent('pointerdown', {
            bubbles: true,
            button: 0,
            clientX: 20,
            clientY: 20,
            pointerId: 91,
            pointerType: 'mouse',
          })
        );
        const result = canvasRef.current.startExternalDrag({
          card: {
            id: 'external-card',
            title: 'External title',
            content: 'External content',
            x: 0,
            y: 0,
            width: 120,
            height: 80,
          },
          drag,
        });
        if (!result.ok) {
          throw new Error(
            `Expected session startup, received ${result.reason}`
          );
        }
        window.__externalDragSession = result.session;
      },
      {
        cardCanvasModuleUrl: CARD_CANVAS_MODULE_URL,
        multiDragModuleUrl: MULTI_DRAG_MODULE_URL,
        reactDomClientModuleUrl: REACT_DOM_CLIENT_MODULE_URL,
        reactModuleUrl: REACT_MODULE_URL,
      }
    );

    // When: the locked pointer first enters the canvas, then releases at another point.
    await page.evaluate(() => {
      document.dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          clientX: 300,
          clientY: 300,
          pointerId: 91,
          pointerType: 'mouse',
        })
      );
    });
    await expect(page.locator('[data-external-card-preview]')).toBeVisible();
    await expect(page.locator('[data-external-card-preview]')).toHaveCSS(
      'pointer-events',
      'none'
    );
    await expect(
      page.locator('[data-external-card-preview][data-card-id]')
    ).toHaveCount(0);
    await page.screenshot({
      path: '.omo/evidence/task-3-external-card-drag-in.png',
    });
    await page.evaluate(() => {
      document.dispatchEvent(
        new PointerEvent('pointerup', {
          bubbles: true,
          clientX: 350,
          clientY: 320,
          pointerId: 91,
          pointerType: 'mouse',
        })
      );
    });

    // Then: the preview is removed, one final card is committed and selected without an editor focus.
    await expect(page.locator('[data-external-card-preview]')).toHaveCount(0);
    await expect
      .poll(() => page.evaluate(() => window.__externalDragCards))
      .toEqual([expect.objectContaining({ id: 'external-card' })]);
    await expect
      .poll(() => page.evaluate(() => window.__externalDragSelection))
      .toBe('external-card');
    await expect
      .poll(() =>
        page.evaluate(async () => window.__externalDragSession.completion)
      )
      .toEqual({
        status: 'placed',
        card: expect.objectContaining({ id: 'external-card' }),
      });
  });

  test('settles cancellation, concurrency, overlays, conflicts, lifecycle, and zoom through observable DOM contracts', async ({
    page,
  }) => {
    // Given: a controlled canvas, two independent host drags, and a parent card.
    await page.goto('/');
    await page.evaluate(
      async ({
        cardCanvasModuleUrl,
        multiDragModuleUrl,
        reactDomClientModuleUrl,
        reactModuleUrl,
      }) => {
        const [{ CardCanvas }, { Drag }, reactModule, reactDomClientModule] =
          await Promise.all([
            import(cardCanvasModuleUrl),
            import(multiDragModuleUrl),
            import(reactModuleUrl),
            import(reactDomClientModuleUrl),
          ]);
        const React = reactModule.t();
        const { createRoot } = reactDomClientModule.default;
        const host = document.createElement('div');
        host.style.cssText =
          'position:fixed;inset:100px;width:500px;height:400px';
        document.body.replaceChildren(host);
        const sources = [0, 1, 2, 3, 4, 5, 6].map((index) => {
          const source = document.createElement('div');
          source.style.cssText = `position:fixed;left:${index * 5}px;top:0;width:4px;height:4px`;
          document.body.append(source);
          return source;
        });
        const root = createRoot(host);
        const canvasRef = React.createRef();
        const Harness = () => {
          const [cards, setCards] = React.useState([
            {
              id: 'parent',
              title: 'Parent',
              content: 'Parent',
              x: 80,
              y: 80,
              width: 260,
              height: 220,
            },
          ]);
          const [editable, setEditable] = React.useState(true);
          const [withCallback, setWithCallback] = React.useState(true);
          window.__sessionHarness = {
            addConflict: () =>
              setCards((current: CardCanvasCard[]) => [
                ...current,
                {
                  id: 'conflict',
                  title: 'Conflict',
                  content: 'Conflict',
                  x: -200,
                  y: -200,
                  width: 20,
                  height: 20,
                },
              ]),
            setEditable,
            setWithCallback,
            unmount: () => root.unmount(),
            sessions: {},
          };
          return React.createElement(CardCanvas, {
            ref: canvasRef,
            cards,
            editable,
            virtualPaper: true,
            onCardsChange: withCallback
              ? (nextCards: CardCanvasCard[]) => setCards(nextCards)
              : undefined,
          });
        };
        root.render(React.createElement(Harness));
        for (let frame = 0; frame < 10 && canvasRef.current === null; frame += 1) {
          await new Promise((resolve) => requestAnimationFrame(resolve));
        }
        if (canvasRef.current === null)
          throw new Error('Expected canvas handle');
        const makeDrag = (index: number) => {
          const drag = new Drag(sources[index], { setPose: () => {} });
          sources[index].dispatchEvent(
            new PointerEvent('pointerdown', {
              bubbles: true,
              button: 0,
              clientX: 2,
              clientY: 2,
              pointerId: index + 201,
              pointerType: 'mouse',
            })
          );
          return drag;
        };
        window.__sessionHarness.start = (id: string, index: number) => {
          const result = canvasRef.current.startExternalDrag({
            card: {
              id,
              title: id,
              content: id,
              x: 0,
              y: 0,
              width: 80,
              height: 60,
            },
            drag: makeDrag(index),
          });
          if (!result.ok) throw new Error(result.reason);
          window.__sessionHarness.sessions[id] = result.session;
          return result.session;
        };
        window.__sessionHarness.sessionResult = async (key: string) =>
          window.__sessionHarness.sessions[key]?.completion;
      },
      {
        cardCanvasModuleUrl: CARD_CANVAS_MODULE_URL,
        multiDragModuleUrl: MULTI_DRAG_MODULE_URL,
        reactDomClientModuleUrl: REACT_DOM_CLIENT_MODULE_URL,
        reactModuleUrl: REACT_MODULE_URL,
      }
    );

    // When: two candidates enter the same parent and one leaves.
    const move = (
      pointerId: number,
      type: 'pointermove' | 'pointerup' | 'pointercancel',
      x: number,
      y: number
    ) =>
      page.evaluate(
        ({ pointerId, type, x, y }) =>
          document.dispatchEvent(
            new PointerEvent(type, {
              bubbles: true,
              clientX: x,
              clientY: y,
              pointerId,
              pointerType: 'mouse',
            })
          ),
        { pointerId, type, x, y }
      );
    await page.evaluate(() => window.__sessionHarness.start?.('first', 0));
    await page.evaluate(() => window.__sessionHarness.start?.('second', 1));
    await move(201, 'pointermove', 250, 250);
    await move(202, 'pointermove', 260, 260);
    await expect(page.locator('[data-external-card-preview]')).toHaveCount(2);
    await expect(page.locator('[data-card-id="parent"]')).toHaveAttribute(
      'data-parent-candidate',
      'true'
    );
    await move(201, 'pointermove', 30, 30);
    await expect(page.locator('[data-card-id="parent"]')).toHaveAttribute(
      'data-parent-candidate',
      'true'
    );
    await move(202, 'pointercancel', 260, 260);

    // Then: pointercancel settles once and shared parent highlighting clears only after the final source leaves.
    await expect(page.locator('[data-external-card-preview]')).toHaveCount(0);
    await expect(page.locator('[data-card-id="parent"]')).not.toHaveAttribute(
      'data-parent-candidate',
      'true'
    );
    await expect
      .poll(() =>
        page.evaluate(async () =>
          window.__sessionHarness.sessionResult?.('second')
        )
      )
      .toEqual({ status: 'cancelled', reason: 'pointer-cancelled' });

    // Given: direct session references are retained only for observable completion outcomes.
    await page.evaluate(() => {
      window.__sessionHarness.sessions = {
        noMove: window.__sessionHarness.start?.('no-move', 2),
        outside: window.__sessionHarness.start?.('outside', 3),
        conflict: window.__sessionHarness.start?.('conflict', 4),
        cancel: window.__sessionHarness.start?.('cancel', 5),
        readonly: window.__sessionHarness.start?.('readonly', 6),
      };
      window.__sessionHarness.sessionResult = async (key: string) =>
        window.__sessionHarness.sessions[key]?.completion;
    });
    await move(203, 'pointerup', 250, 250);
    await move(204, 'pointermove', 250, 250);
    await move(204, 'pointerup', 30, 30);
    await page.evaluate(() => window.__sessionHarness.addConflict());
    await move(205, 'pointermove', 250, 250);
    await move(205, 'pointerup', 250, 250);
    await page.evaluate(() => {
      window.__sessionHarness.sessions.cancel?.cancel();
      window.__sessionHarness.sessions.cancel?.cancel();
      window.__sessionHarness.setEditable(false);
    });
    await expect
      .poll(() =>
        page.evaluate(async () =>
          window.__sessionHarness.sessionResult?.('noMove')
        )
      )
      .toEqual({ status: 'cancelled', reason: 'released-outside-canvas' });
    await expect
      .poll(() =>
        page.evaluate(async () =>
          window.__sessionHarness.sessionResult?.('outside')
        )
      )
      .toEqual({ status: 'cancelled', reason: 'released-outside-canvas' });
    await expect
      .poll(() =>
        page.evaluate(async () =>
          window.__sessionHarness.sessionResult?.('conflict')
        )
      )
      .toEqual({ status: 'cancelled', reason: 'card-id-conflict' });
    await expect
      .poll(() =>
        page.evaluate(async () =>
          window.__sessionHarness.sessionResult?.('cancel')
        )
      )
      .toEqual({ status: 'cancelled', reason: 'cancelled-by-host' });
    await expect
      .poll(() =>
        page.evaluate(async () =>
          window.__sessionHarness.sessionResult?.('readonly')
        )
      )
      .toEqual({ status: 'cancelled', reason: 'canvas-became-readonly' });
  });
});

declare global {
  interface Window {
    __externalDragCards: unknown;
    __externalDragSelection: unknown;
    __externalDragSession: {
      readonly completion: Promise<unknown>;
    };
    __sessionHarness: {
      addConflict: () => void;
      setEditable: (editable: boolean) => void;
      setWithCallback: (withCallback: boolean) => void;
      unmount: () => void;
      start?: (
        id: string,
        index: number
      ) => { readonly completion: Promise<unknown>; cancel(): void };
      sessions: Record<
        string,
        { readonly completion: Promise<unknown>; cancel(): void } | undefined
      >;
      sessionResult?: (key: string) => Promise<unknown>;
    };
  }
}
