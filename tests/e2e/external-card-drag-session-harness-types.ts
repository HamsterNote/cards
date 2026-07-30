import type { CardCanvasCard } from '../../src/components/CardCanvas';
import type { ExternalCardDragSession } from '../../src/components/ExternalCardDrag';

export type Session = ExternalCardDragSession | undefined;

export type PointerKind = 'mouse' | 'touch' | 'pen';

export type HarnessApi = {
  readonly start: (
    id: string,
    sourceIndex: number,
    pointerType?: PointerKind
  ) => void;
  readonly startResult: (
    id: string,
    sourceIndex: number,
    pointerType?: PointerKind
  ) => string;
  readonly move: (
    pointerId: number,
    x: number,
    y: number,
    pointerType?: PointerKind
  ) => void;
  readonly end: (
    pointerId: number,
    x: number,
    y: number,
    pointerType?: PointerKind
  ) => void;
  readonly cancelPointer: (
    pointerId: number,
    x: number,
    y: number,
    pointerType?: PointerKind
  ) => void;
  readonly completion: (id: string) => Promise<unknown> | undefined;
  readonly cancel: (id: string) => void;
  readonly setEditable: (editable: boolean) => void;
  readonly setCallbackEnabled: (enabled: boolean) => void;
  readonly addConflict: (id: string) => void;
  readonly addOverlay: (
    kind?: 'toolbar' | 'marker' | 'menu' | 'listbox' | 'tree'
  ) => void;
  readonly removeOverlay: () => void;
  readonly unmount: () => void;
  readonly cards: () => readonly CardCanvasCard[];
  readonly selected: () => string | undefined;
};

declare global {
  interface Window {
    __externalDragHarness: HarnessApi | undefined;
  }
}
