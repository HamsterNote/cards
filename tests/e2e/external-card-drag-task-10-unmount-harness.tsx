import { Drag } from '@system-ui-js/multi-drag';
import { StrictMode, useCallback, useLayoutEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import {
  CardCanvas,
  type CardCanvasCard,
} from '../../src/components/CardCanvas';
import type {
  CardCanvasHandle,
  ExternalCardDragSession,
} from '../../src/components/ExternalCardDrag';

type UnmountAction = 'end-session' | 'start-stale';

type TaskTenUnmountApi = {
  readonly start: () => string;
  readonly move: () => void;
  readonly unmountDuringParentLayout: (action: UnmountAction) => void;
  readonly completion: () => Promise<unknown> | undefined;
  readonly completionCount: () => number;
  readonly staleStartResult: () => string | undefined;
  readonly dispose: () => void;
};

declare global {
  interface Window {
    __externalDragTaskTenUnmount: TaskTenUnmountApi | undefined;
  }
}

const CARD: CardCanvasCard = {
  id: 'task-ten-candidate',
  title: 'Task ten candidate',
  content: 'Task ten candidate',
  x: 0,
  y: 0,
  width: 100,
  height: 80,
};

export async function installExternalDragTaskTenUnmountHarness(): Promise<void> {
  window.__externalDragTaskTenUnmount?.dispose();
  document.body.replaceChildren();
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;inset:100px;width:500px;height:400px';
  const source = document.createElement('div');
  document.body.append(host, source);
  const drag = new Drag(source, { setPose: () => {} });
  const root = createRoot(host);
  let currentHandle: CardCanvasHandle | null = null;
  let staleHandle: CardCanvasHandle | null = null;
  let session: ExternalCardDragSession | undefined;
  let completionCount = 0;
  let staleStartResult: string | undefined;
  let runAfterUnmount: UnmountAction | undefined;
  let setCanvasVisible: ((visible: boolean) => void) | undefined;
  let readyResolve: (() => void) | undefined;
  const ready = new Promise<void>((resolve) => {
    readyResolve = resolve;
  });

  function Harness() {
    const [canvasVisible, updateCanvasVisible] = useState(true);
    setCanvasVisible = updateCanvasVisible;
    useLayoutEffect(() => {
      const action = runAfterUnmount;
      if (action === undefined) return;
      runAfterUnmount = undefined;
      if (action === 'end-session') {
        document.dispatchEvent(
          new PointerEvent('pointerup', {
            bubbles: true,
            clientX: 20,
            clientY: 20,
            pointerId: 1010,
          })
        );
        return;
      }
      const result = staleHandle?.startExternalDrag({ card: CARD, drag });
      staleStartResult = result?.ok === true ? 'started' : result?.reason;
    });
    const setHandle = useCallback((next: CardCanvasHandle | null) => {
      currentHandle = next;
      if (next !== null) {
        staleHandle = next;
        readyResolve?.();
      }
    }, []);
    return canvasVisible ? (
      <CardCanvas
        ref={setHandle}
        cards={[]}
        onCardsChange={() => {}}
        onSelect={() => {}}
      />
    ) : null;
  }

  root.render(
    <StrictMode>
      <Harness />
    </StrictMode>
  );
  await ready;
  window.__externalDragTaskTenUnmount = {
    start: () => {
      if (currentHandle === null) throw new Error('Missing CardCanvas handle');
      source.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          button: 0,
          pointerId: 1010,
        })
      );
      const result = currentHandle.startExternalDrag({ card: CARD, drag });
      if (!result.ok) return result.reason;
      session = result.session;
      void session.completion.then(() => {
        completionCount += 1;
      });
      return 'started';
    },
    move: () =>
      document.dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          clientX: 300,
          clientY: 300,
          pointerId: 1010,
        })
      ),
    unmountDuringParentLayout: (action) => {
      if (setCanvasVisible === undefined)
        throw new Error('Missing canvas setter');
      const updateCanvasVisible = setCanvasVisible;
      runAfterUnmount = action;
      flushSync(() => updateCanvasVisible(false));
    },
    completion: () => session?.completion,
    completionCount: () => completionCount,
    staleStartResult: () => staleStartResult,
    dispose: () => {
      session?.cancel();
      drag.destroy();
      root.unmount();
      host.remove();
      source.remove();
      window.__externalDragTaskTenUnmount = undefined;
    },
  };
}
