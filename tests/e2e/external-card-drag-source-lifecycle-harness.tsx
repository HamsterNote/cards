import { StrictMode, useCallback, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  CardCanvas,
  type CardCanvasCard,
} from '../../src/components/CardCanvas';
import type { CardCanvasHandle } from '../../src/components/ExternalCardDrag';
import { ExternalCardDragSource } from '../../src/demo/ExternalCardDragSource';

type LifecycleApi = {
  readonly rotateCanvasRef: () => void;
  readonly drag: () => void;
};

declare global {
  interface Window {
    __externalDragLifecycle: LifecycleApi | undefined;
  }
}

export async function installExternalDragLifecycleHarness(): Promise<void> {
  document.body.replaceChildren();
  const rootElement = document.createElement('div');
  rootElement.style.cssText =
    'position:fixed;inset:100px;width:500px;height:400px';
  document.body.append(rootElement);
  const root = createRoot(rootElement);
  let rotate: (() => void) | undefined;
  let resolveReady: (() => void) | undefined;
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });
  function Harness() {
    const [cards, setCards] = useState<readonly CardCanvasCard[]>([]);
    const [handle, setHandle] = useState<CardCanvasHandle | null>(null);
    const [version, setVersion] = useState(0);
    const canvasRef = useMemo(
      () => ({ current: handle, version }),
      [handle, version]
    );
    const setCanvasHandle = useCallback((next: CardCanvasHandle | null) => {
      setHandle(next);
      if (next !== null) resolveReady?.();
    }, []);
    rotate = () => setVersion((current) => current + 1);
    return (
      <>
        <CardCanvas
          ref={setCanvasHandle}
          cards={[...cards]}
          onCardsChange={setCards}
        />
        <ExternalCardDragSource canvasRef={canvasRef} />
      </>
    );
  }
  root.render(
    <StrictMode>
      <Harness />
    </StrictMode>
  );
  await ready;
  window.__externalDragLifecycle = {
    rotateCanvasRef: () => rotate?.(),
    drag: () => {
      const template = document.querySelector<HTMLElement>(
        '[data-external-card-template]'
      );
      const canvas = document.querySelector<HTMLElement>('[data-card-canvas]');
      if (template === null || canvas === null)
        throw new Error('Missing source');
      const source = template.getBoundingClientRect();
      const target = canvas.getBoundingClientRect();
      template.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          button: 0,
          clientX: source.x + 90,
          clientY: source.y + 60,
          pointerId: 801,
        })
      );
      document.dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          clientX: target.x + 300,
          clientY: target.y + 160,
          pointerId: 801,
        })
      );
      document.dispatchEvent(
        new PointerEvent('pointerup', {
          bubbles: true,
          clientX: target.x + 300,
          clientY: target.y + 160,
          pointerId: 801,
        })
      );
    },
  };
}
