import type { NoteBlock } from '@hamster-note/notes';

/**
 * 卡片富文本内容（contentBlocks）与纯文本 content 之间的桥接工具。
 *
 * 数据约定：
 * - contentBlocks 是富文本真相源（@hamster-note/notes 的 NoteBlock 数组）。
 * - content 字符串始终保留为纯文本镜像，供搜索、序列化与未启用富文本的消费者使用。
 */

/** 把纯文本按行拆成段落块，作为没有 contentBlocks 时的兜底渲染数据。 */
export function createParagraphBlocksFromText(
  cardId: string,
  text: string
): NoteBlock[] {
  const lines = text.split('\n');
  // 可编辑状态下至少保留一个空段落，保证 NoteContent 有可聚焦的编辑区域
  const effectiveLines = lines.length > 0 ? lines : [''];
  return effectiveLines.map((line, index) => ({
    id: `${cardId}-p${index}`,
    kind: 'paragraph',
    text: line,
  }));
}

/** 从单个块中提取纯文本；无文本字段的块（图片/卡片/绘图等）返回 undefined。 */
function blockPlainText(block: NoteBlock): string | undefined {
  if ('text' in block && typeof block.text === 'string') {
    return block.text;
  }
  if ('title' in block && typeof block.title === 'string') {
    return block.title;
  }
  return undefined;
}

/** 把 blocks 压平成纯文本（按块换行拼接），用于同步 card.content 镜像。 */
export function extractPlainTextFromBlocks(
  blocks: readonly NoteBlock[]
): string {
  return blocks
    .map(blockPlainText)
    .filter((text): text is string => text !== undefined)
    .join('\n');
}
