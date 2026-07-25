import {
  VirtualPaper,
  VirtualPaperInitialPlacement,
  VirtualPaperInteractionMode,
  VirtualPaperRenderMode,
  type VirtualPaperProps,
  type VirtualPaperTransform,
} from '@hamster-note/virtual-paper';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';

export type CardCanvasVirtualPaperInteraction =
  | 'mouseWheelZoom'
  | 'mouseDragPan'
  | 'trackpadScrollPan'
  | 'mouseWheelCtrlZoom'
  | 'touchSingleFingerPan'
  | 'touchTwoFingerPan'
  | 'touchTwoFingerZoom'
  | 'penPan';

export type CardCanvasVirtualPaperOptions = {
  readonly enabled?: boolean;
  readonly initialPlacement?: 'top-left' | 'center';
  readonly minScale?: number;
  readonly maxScale?: number;
  readonly enabledInteractions?: readonly CardCanvasVirtualPaperInteraction[];
};

const DEFAULT_INTERACTIONS = [
  'trackpadScrollPan',
  'mouseWheelCtrlZoom',
  'touchSingleFingerPan',
  'touchTwoFingerZoom',
] as const satisfies readonly CardCanvasVirtualPaperInteraction[];

const INTERACTION_MODE_BY_OPTION = {
  mouseWheelZoom: VirtualPaperInteractionMode.MouseWheelZoom,
  mouseDragPan: VirtualPaperInteractionMode.MouseDragPan,
  trackpadScrollPan: VirtualPaperInteractionMode.TrackpadScrollPan,
  mouseWheelCtrlZoom: VirtualPaperInteractionMode.MouseWheelCtrlZoom,
  touchSingleFingerPan: VirtualPaperInteractionMode.TouchSingleFingerPan,
  touchTwoFingerPan: VirtualPaperInteractionMode.TouchTwoFingerPan,
  touchTwoFingerZoom: VirtualPaperInteractionMode.TouchTwoFingerZoom,
  penPan: VirtualPaperInteractionMode.PenPan,
} as const satisfies Record<
  CardCanvasVirtualPaperInteraction,
  (typeof VirtualPaperInteractionMode)[keyof typeof VirtualPaperInteractionMode]
>;

type CardCanvasViewport = {
  readonly scale: number;
  readonly x: number;
  readonly y: number;
};

const DEFAULT_VIEWPORT: CardCanvasViewport = { scale: 1, x: 0, y: 0 };

export type CardCanvasVirtualPaperProps = {
  readonly virtualPaper?: boolean | CardCanvasVirtualPaperOptions | undefined;
  readonly onScaleChange: (scale: number) => void;
  readonly containerStyle: CSSProperties;
  readonly children: ReactNode;
};

function isEnabled(
  virtualPaper: boolean | CardCanvasVirtualPaperOptions | undefined
): boolean {
  if (virtualPaper === true) return true;
  if (virtualPaper === false || virtualPaper === undefined) return false;
  return virtualPaper.enabled !== false;
}

function isFiniteNumber(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function toVirtualPaperProps(
  options: CardCanvasVirtualPaperOptions,
  viewport: CardCanvasViewport,
  onViewportChange: (viewport: CardCanvasViewport) => void
): VirtualPaperProps {
  const interactions = options.enabledInteractions ?? DEFAULT_INTERACTIONS;

  return {
    renderMode: VirtualPaperRenderMode.Transform,
    enabledInteractions: interactions.map(
      (interaction) => INTERACTION_MODE_BY_OPTION[interaction]
    ),
    ...toInitialPlacementProp(options.initialPlacement),
    ...(isFiniteNumber(options.minScale) ? { minScale: options.minScale } : {}),
    ...(isFiniteNumber(options.maxScale) ? { maxScale: options.maxScale } : {}),
    transform: viewport satisfies VirtualPaperTransform,
    onTransformChange: (transform) => onViewportChange(transform),
  };
}

function toInitialPlacementProp(
  initialPlacement: CardCanvasVirtualPaperOptions['initialPlacement']
): Pick<VirtualPaperProps, 'initialPlacement'> {
  switch (initialPlacement) {
    case 'top-left':
      return { initialPlacement: VirtualPaperInitialPlacement.TopLeft };
    case 'center':
      return { initialPlacement: VirtualPaperInitialPlacement.Center };
    case undefined:
      return {};
  }
}

export function CardCanvasVirtualPaper({
  virtualPaper,
  onScaleChange,
  containerStyle,
  children,
}: CardCanvasVirtualPaperProps) {
  const [viewport, setViewport] = useState(DEFAULT_VIEWPORT);
  const enabled = isEnabled(virtualPaper);

  useEffect(() => {
    onScaleChange(enabled ? viewport.scale : DEFAULT_VIEWPORT.scale);
  }, [enabled, onScaleChange, viewport.scale]);

  if (!enabled) {
    return children;
  }

  const options = typeof virtualPaper === 'object' ? virtualPaper : {};
  return (
    <VirtualPaper
      {...toVirtualPaperProps(options, viewport, (nextViewport) => {
        setViewport(nextViewport);
      })}
      containerStyle={containerStyle}
      wrapperProps={{
        'data-card-virtual-paper': 'true',
        style: { overflow: 'visible' },
      }}
    >
      {children}
    </VirtualPaper>
  );
}
