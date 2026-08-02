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

type TaskNineApi = {
  readonly start: (id: string) => string;
  readonly move: () => void;
  readonly end: () => void;
  readonly flushAndEnd: () => void;
  readonly setReentry: (value: 'change' | 'select' | undefined) => void;
  readonly completion: () => Promise<unknown> | undefined;
  readonly cards: () => readonly CardCanvasCard[];
  readonly callbacks: () => readonly number[];
  readonly rejection: () => string | undefined;
  readonly fingers: () => number;
  readonly dispose: () => void;
};

declare global {
  interface Window {
    __externalDragTaskNine: TaskNineApi | undefined;
  }
}

const CARD: CardCanvasCard = {
  id: 'base',
  title: 'base',
  content: 'base',
  x: 0,
  y: 0,
  width: 80,
  height: 60,
};

export async function installExternalDragTaskNineHarness(): Promise<void> {
  window.__externalDragTaskNine?.dispose();
  document.body.replaceChildren();
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;inset:100px;width:500px;height:400px';
  const source = document.createElement('div');
  document.body.append(host, source);
  const drag = new Drag(source, { setPose: () => {} });
  const root = createRoot(host);
  let handle: CardCanvasHandle | null = null;
  let session: ExternalCardDragSession | undefined;
  let cards: readonly CardCanvasCard[] = [];
  let replaceCards: ((next: readonly CardCanvasCard[]) => void) | undefined;
  let replaceVersion: ((next: number) => void) | undefined;
  let endAfterLayout = false;
  let reentry: 'change' | 'select' | undefined;
  let rejection: string | undefined;
  let callbacks: number[] = [];
  let readyResolve: (() => void) | undefined;
  const ready = new Promise<void>((resolve) => {
    readyResolve = resolve;
  });
  function Harness() {
    const [controlledCards, setControlledCards] = useState<
      readonly CardCanvasCard[]
    >([CARD]);
    const [version, setVersion] = useState(1);
    cards = controlledCards;
    replaceCards = setControlledCards;
    replaceVersion = setVersion;
    useLayoutEffect(() => {
      if (!endAfterLayout) return;
      endAfterLayout = false;
      document.dispatchEvent(
        new PointerEvent('pointerup', {
          bubbles: true,
          clientX: 320,
          clientY: 320,
          pointerId: 999,
        })
      );
    });
    const setRef = useCallback((next: CardCanvasHandle | null) => {
      handle = next;
      if (next !== null) readyResolve?.();
    }, []);
    const startReentry = () => {
      if (handle === null) return;
      const result = handle.startExternalDrag({
        card: { ...CARD, id: 'reentered' },
        drag,
      });
      rejection = result.ok ? 'started' : result.reason;
    };
    return (
      <CardCanvas
        ref={setRef}
        cards={[...controlledCards]}
        onCardsChange={(next) => {
          callbacks = [...callbacks, version];
          setControlledCards(next);
          if (reentry === 'change') startReentry();
        }}
        onSelect={() => {
          if (reentry === 'select') startReentry();
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
  const start = (id: string) => {
    if (handle === null) throw new Error('Missing handle');
    source.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        button: 0,
        pointerId: 999,
      })
    );
    const result = handle.startExternalDrag({ card: { ...CARD, id }, drag });
    if (!result.ok) return result.reason;
    session = result.session;
    return 'started';
  };
  const move = () =>
    document.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        clientX: 300,
        clientY: 300,
        pointerId: 999,
      })
    );
  const end = () =>
    document.dispatchEvent(
      new PointerEvent('pointerup', {
        bubbles: true,
        clientX: 320,
        clientY: 320,
        pointerId: 999,
      })
    );
  window.__externalDragTaskNine = {
    start,
    move,
    end,
    flushAndEnd: () => {
      if (replaceCards === undefined || replaceVersion === undefined)
        throw new Error('Missing state setters');
      const setCards = replaceCards;
      const setVersion = replaceVersion;
      endAfterLayout = true;
      flushSync(() => {
        setCards([...cards, { ...CARD, id: 'host' }]);
        setVersion(2);
      });
    },
    setReentry: (next) => {
      reentry = next;
    },
    completion: () => session?.completion,
    cards: () => cards,
    callbacks: () => callbacks,
    rejection: () => rejection,
    fingers: () => drag.getFingers().length,
    dispose: () => {
      session?.cancel();
      drag.destroy();
      root.unmount();
      host.remove();
      source.remove();
      window.__externalDragTaskNine = undefined;
    },
  };
}
