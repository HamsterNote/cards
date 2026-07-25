/**
 * @hamster-note/virtual-paper 当前发布的 d.ts 为空；此声明仅覆盖 cards 使用的运行时导出。
 */
declare module '@hamster-note/virtual-paper' {
  import type * as React from 'react';

  export const VirtualPaperInteractionMode: {
    readonly MouseWheelZoom: 'MouseWheelZoom';
    readonly MouseDragPan: 'MouseDragPan';
    readonly TrackpadScrollPan: 'TrackpadScrollPan';
    readonly MouseWheelCtrlZoom: 'MouseWheelCtrlZoom';
    readonly TouchSingleFingerPan: 'TouchSingleFingerPan';
    readonly TouchTwoFingerPan: 'TouchTwoFingerPan';
    readonly TouchTwoFingerZoom: 'TouchTwoFingerZoom';
    readonly PenPan: 'PenPan';
  };

  export const VirtualPaperInitialPlacement: {
    readonly TopLeft: 'TopLeft';
    readonly Center: 'Center';
  };

  export const VirtualPaperRenderMode: {
    readonly Transform: 'Transform';
    readonly Scroll: 'Scroll';
  };

  export type VirtualPaperTransform = {
    readonly x: number;
    readonly y: number;
    readonly scale: number;
  };

  export type VirtualPaperProps = {
    readonly children?: React.ReactNode;
    readonly enabledInteractions?: readonly string[];
    readonly initialPlacement?: string;
    readonly renderMode?: string;
    readonly transform?: VirtualPaperTransform;
    readonly minScale?: number;
    readonly maxScale?: number;
    readonly onTransformChange?: (transform: VirtualPaperTransform) => void;
    readonly containerStyle?: React.CSSProperties;
    readonly wrapperProps?: Record<string, unknown>;
  };

  export const VirtualPaper: React.ComponentType<VirtualPaperProps>;
}
