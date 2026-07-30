import type { CardCanvasCard } from '../../src/components/CardCanvas';

export type CallbackMode =
  | 'normal'
  | 'throw-change'
  | 'reenter-cancel'
  | 'throw-select';

export type ProofApi = {
  readonly start: (id: string) => void;
  readonly move: (x: number, y: number) => void;
  readonly end: (x: number, y: number) => void;
  readonly completion: () => Promise<unknown> | undefined;
  readonly setCallbackMode: (mode: CallbackMode) => void;
  readonly metrics: () => {
    readonly renders: number;
    readonly stableHandle: boolean;
  };
  readonly activeElement: () => string | undefined;
  readonly clickPreviewControls: () => void;
  readonly activations: () => number;
  readonly interleave: (order: 'ordinary-first' | 'external-first') => void;
  readonly cards: () => readonly CardCanvasCard[];
  readonly candidateMutations: () => number;
  readonly moveAcrossMacrotasks: () => Promise<void>;
  readonly patchThenEnd: (
    title: string,
    content: string,
    x: number,
    y: number
  ) => void;
  readonly dispose: () => void;
};

declare global {
  interface Window {
    __externalDragProof: ProofApi | undefined;
  }
}
