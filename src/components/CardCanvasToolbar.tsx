import { Button, Icon, Popover } from '@hamster-note/components';
import type { CardsTheme } from '../theme';

export type CardCanvasToolbarProps = {
  readonly addEnabled: boolean;
  readonly linkMode: boolean;
  readonly linkModeEnabled: boolean;
  readonly minimapEnabled: boolean;
  readonly minimapToggleEnabled: boolean;
  readonly theme: CardsTheme;
  readonly onAddCard: () => void;
  readonly onLinkModeChange: (enabled: boolean) => void;
  readonly onMiniMapChange: (enabled: boolean) => void;
};

export function CardCanvasToolbar({
  addEnabled,
  linkMode,
  linkModeEnabled,
  minimapEnabled,
  minimapToggleEnabled,
  theme,
  onAddCard,
  onLinkModeChange,
  onMiniMapChange,
}: CardCanvasToolbarProps) {
  return (
    <Popover
      className="cards-card-canvas__toolbar"
      data-card-canvas-toolbar
      edge="bottom"
      edgeOffset={16}
      orientation="horizontal"
      relative
      theme={theme}
    >
      <Button
        aria-label="添加卡片"
        data-card-canvas-add-button
        disabled={!addEnabled}
        size="small"
        type="button"
        variant="ghost"
        onClick={onAddCard}
      >
        <Icon name="add" />
        <span className="cards-card-canvas__action-label">添加卡片</span>
      </Button>
      <Button
        aria-label={linkMode ? '关闭链接模式' : '开启链接模式'}
        aria-pressed={linkMode}
        data-card-canvas-link-mode-button
        disabled={!linkModeEnabled}
        size="small"
        type="button"
        variant={linkMode ? 'primary' : 'ghost'}
        onClick={() => onLinkModeChange(!linkMode)}
      >
        <Icon name="link" />
        <span className="cards-card-canvas__action-label">链接模式</span>
      </Button>
      <Button
        aria-label="缩略图"
        aria-pressed={minimapEnabled}
        data-card-canvas-minimap-button
        disabled={!minimapToggleEnabled}
        size="small"
        type="button"
        variant={minimapEnabled ? 'primary' : 'ghost'}
        onClick={() => onMiniMapChange(!minimapEnabled)}
      >
        <Icon name="minimap" />
        <span className="cards-card-canvas__action-label">缩略图</span>
      </Button>
    </Popover>
  );
}
