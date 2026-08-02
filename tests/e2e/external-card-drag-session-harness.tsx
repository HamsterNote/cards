import { Drag } from '@system-ui-js/multi-drag';
import { StrictMode, useCallback, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  CardCanvas,
  type CardCanvasCard,
} from '../../src/components/CardCanvas';
import type { CardCanvasHandle } from '../../src/components/ExternalCardDrag';
import type { Session } from './external-card-drag-session-harness-types';

const PARENT: CardCanvasCard = {
  id: 'parent',
  title: 'Parent',
  content: 'Parent',
  x: 80,
  y: 80,
  width: 260,
  height: 220,
};

export async function installExternalDragHarness(options?: {
  readonly virtualPaper?: boolean;
}): Promise<void> {
  document.body.replaceChildren();
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;inset:100px;width:500px;height:400px';
  document.body.append(host);
  const sources = Array.from({ length: 10 }, (_, index) => {
    const source = document.createElement('div');
    source.style.cssText = `position:fixed;left:${index * 6}px;top:0;width:4px;height:4px`;
    document.body.append(source);
    return source;
  });
  const root = createRoot(host);
  const sessions: Record<string, Session> = {};
  let handle: CardCanvasHandle | null = null;
  let currentCards: readonly CardCanvasCard[] = [PARENT];
  let currentSelection: string | undefined;
  let overlay: HTMLDivElement | undefined;
  let resolveReady: (() => void) | undefined;
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });

  function Harness() {
    const [cards, setCards] = useState<readonly CardCanvasCard[]>([PARENT]);
    const [editable, setEditable] = useState(true);
    const [callbackEnabled, setCallbackEnabled] = useState(true);
    currentCards = cards;
    const setHandle = useCallback((nextHandle: CardCanvasHandle | null) => {
      handle = nextHandle;
      if (nextHandle !== null) resolveReady?.();
    }, []);
    window.__externalDragHarness = {
      start: (id, sourceIndex, pointerType = 'mouse') => {
        if (handle === null) throw new Error('CardCanvas handle is not ready');
        const source = sources[sourceIndex];
        if (source === undefined) throw new Error('Missing drag source');
        const pointerId = sourceIndex + 301;
        const drag = new Drag(source, { setPose: () => {} });
        source.dispatchEvent(
          new PointerEvent('pointerdown', {
            bubbles: true,
            button: 0,
            clientX: 2,
            clientY: 2,
            pointerId,
            pointerType,
          })
        );
        const result = handle.startExternalDrag({
          card: {
            id,
            title: id,
            content: id,
            x: 0,
            y: 0,
            width: 80,
            height: 60,
          },
          drag,
        });
        if (!result.ok) throw new Error(result.reason);
        sessions[id] = result.session;
        void result.session.completion.then(() => drag.destroy());
      },
      startResult: (id, sourceIndex, pointerType = 'mouse') => {
        if (handle === null) return 'not-editable';
        const source = sources[sourceIndex];
        if (source === undefined) return 'missing-active-pointer';
        const pointerId = sourceIndex + 301;
        const drag = new Drag(source, { setPose: () => {} });
        source.dispatchEvent(
          new PointerEvent('pointerdown', {
            bubbles: true,
            button: 0,
            clientX: 2,
            clientY: 2,
            pointerId,
            pointerType,
          })
        );
        const result = handle.startExternalDrag({
          card: {
            id,
            title: id,
            content: id,
            x: 0,
            y: 0,
            width: 80,
            height: 60,
          },
          drag,
        });
        if (!result.ok) drag.destroy();
        return result.ok ? 'started' : result.reason;
      },
      move: (pointerId, x, y, pointerType = 'mouse') =>
        document.dispatchEvent(
          new PointerEvent('pointermove', {
            bubbles: true,
            clientX: x,
            clientY: y,
            pointerId,
            pointerType,
          })
        ),
      end: (pointerId, x, y, pointerType = 'mouse') =>
        document.dispatchEvent(
          new PointerEvent('pointerup', {
            bubbles: true,
            clientX: x,
            clientY: y,
            pointerId,
            pointerType,
          })
        ),
      cancelPointer: (pointerId, x, y, pointerType = 'mouse') =>
        document.dispatchEvent(
          new PointerEvent('pointercancel', {
            bubbles: true,
            clientX: x,
            clientY: y,
            pointerId,
            pointerType,
          })
        ),
      completion: (id) => sessions[id]?.completion,
      cancel: (id) => sessions[id]?.cancel(),
      setEditable,
      setCallbackEnabled,
      addConflict: (id) =>
        setCards((current) => [
          ...current,
          {
            id,
            title: id,
            content: id,
            x: -200,
            y: -200,
            width: 20,
            height: 20,
          },
        ]),
      addOverlay: (kind = 'toolbar') => {
        const canvas = host.querySelector<HTMLElement>('[data-card-canvas]');
        if (canvas === null) throw new Error('Missing canvas surface');
        overlay = document.createElement('div');
        // 菜单浮层用 role="menu" 标记，命中测试应把它当作交互浮层排除。
        if (kind === 'toolbar') overlay.dataset.cardCanvasToolbar = 'true';
        else if (kind === 'marker') {
          overlay.dataset.cardCanvasPopoverOverlay = 'true';
        } else overlay.setAttribute('role', kind);
        overlay.dataset.externalTestOverlay = 'true';
        overlay.style.cssText =
          'position:absolute;left:140px;top:140px;width:80px;height:60px;z-index:9999';
        canvas.append(overlay);
      },
      removeOverlay: () => overlay?.remove(),
      unmount: () => root.unmount(),
      cards: () => currentCards,
      selected: () => currentSelection,
    };
    return (
      <CardCanvas
        ref={setHandle}
        cards={[...cards]}
        editable={editable}
        virtualPaper={options?.virtualPaper === true}
        {...(callbackEnabled
          ? {
              onCardsChange: (nextCards: CardCanvasCard[]) =>
                setCards(nextCards),
            }
          : {})}
        onSelect={(id) => {
          currentSelection = id;
        }}
      />
    );
  }

  root.render(
    <StrictMode>
      <Harness />
    </StrictMode>
  );
  await ready;
}
