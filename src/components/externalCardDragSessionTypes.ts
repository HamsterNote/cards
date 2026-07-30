import type { CardCanvasCard } from './CardCanvas';

export type ExternalCardPreview = {
  readonly card: CardCanvasCard;
  readonly position: { readonly x: number; readonly y: number };
};
