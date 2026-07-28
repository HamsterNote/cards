import {
  Button,
  Dialog,
  ThemeProvider,
  type ThemeAccent,
} from '@hamster-note/components';
import { type NoteBlock, NoteContent } from '@hamster-note/notes';
import { useState } from 'react';
import { getThemeAccentStyle, type CardsTheme } from '../theme';
import {
  extractPlainTextFromBlocks,
  resolveCardContentBlocks,
} from '../utils/card-content-blocks';
import type { CardCanvasCard } from './CardCanvas';

export interface CardContentDialogProps {
  readonly card: CardCanvasCard;
  readonly theme: CardsTheme;
  readonly themeColor: ThemeAccent;
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
  const [draftBlocks, setDraftBlocks] = useState<readonly NoteBlock[]>();
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
