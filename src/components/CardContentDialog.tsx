import { Button, Dialog, ThemeProvider } from '@hamster-note/components';
import { NoteContent } from '@hamster-note/notes';
import { useState } from 'react';
import {
  type CardsTheme,
  type CardsThemeAccent,
  getThemeAccentStyle,
} from '../theme';
import type { CardContentBlock } from '../types/card-content';
import {
  extractPlainTextFromBlocks,
  resolveCardContentBlocks,
} from '../utils/card-content-blocks';
import type { CardCanvasCard } from './CardCanvas';

export interface CardContentDialogProps {
  readonly card: CardCanvasCard;
  readonly theme: CardsTheme;
  readonly themeColor: CardsThemeAccent;
  readonly onClose: () => void;
  readonly onSave: (
    content: Pick<CardCanvasCard, 'content' | 'contentBlocks'>
  ) => void;
}

export function CardContentDialog({
  card,
  theme,
  themeColor,
  onClose,
  onSave,
}: CardContentDialogProps) {
  const [initialBlocks] = useState(() =>
    resolveCardContentBlocks(card.id, card.content, card.contentBlocks)
  );
  const [draftStarted, setDraftStarted] = useState(false);
  const [draftBlocks, setDraftBlocks] = useState<readonly CardContentBlock[]>();
  const blocks =
    draftBlocks ??
    (draftStarted
      ? initialBlocks
      : resolveCardContentBlocks(card.id, card.content, card.contentBlocks));

  return (
    <Dialog
      className="cards-card-canvas__content-dialog"
      data-theme={theme}
      description={`编辑“${card.title || '未命名卡片'}”的正文`}
      onClose={onClose}
      open
      style={getThemeAccentStyle(themeColor)}
      title="编辑卡片内容"
    >
      <ThemeProvider accent={themeColor} mode={theme}>
        <div
          className="cards-card-canvas__content-dialog-editor"
          data-card-content-dialog-editor
          onBeforeInputCapture={() => setDraftStarted(true)}
          onInputCapture={() => setDraftStarted(true)}
        >
          <NoteContent
            blocks={blocks}
            bottomPadding={0}
            editable
            onBlocksChange={(nextBlocks) => {
              setDraftStarted(true);
              setDraftBlocks(nextBlocks);
            }}
            theme={theme}
            title=""
            topPadding={0}
          />
        </div>
        <div className="cards-card-canvas__content-dialog-actions">
          <Button onClick={onClose} variant="ghost">
            取消
          </Button>
          <Button
            data-card-content-dialog-save
            onClick={() => {
              onSave({
                content: extractPlainTextFromBlocks(blocks),
                contentBlocks: blocks,
              });
              onClose();
            }}
            variant="primary"
          >
            保存
          </Button>
        </div>
      </ThemeProvider>
    </Dialog>
  );
}
