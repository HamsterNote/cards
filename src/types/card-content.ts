/** Cards 自有的富文本协议，避免公开类型依赖构建期 Notes 包。 */
export type CardContentBlock =
  | {
      readonly id: string;
      readonly kind: 'heading';
      readonly level: 1 | 2 | 3 | 4 | 5;
      readonly text: string;
      readonly eyebrow?: string;
    }
  | {
      readonly id: string;
      readonly kind: 'paragraph';
      readonly text: string;
      readonly tone?: 'default' | 'muted' | 'accent';
    }
  | {
      readonly id: string;
      readonly kind: 'todo';
      readonly title: string;
      readonly items: readonly CardContentChecklistItem[];
    }
  | {
      readonly id: string;
      readonly kind: 'unorderedList' | 'orderedList';
      readonly text: string;
    }
  | {
      readonly id: string;
      readonly kind: 'quote';
      readonly text: string;
      readonly author?: string;
    }
  | {
      readonly id: string;
      readonly kind: 'code';
      readonly language: string;
      readonly filename?: string;
      readonly code: string;
    }
  | {
      readonly id: string;
      readonly kind: 'callout';
      readonly tone: 'info' | 'success' | 'warning';
      readonly title: string;
      readonly text: string;
    }
  | {
      readonly id: string;
      readonly kind: 'table';
      readonly rows: readonly (readonly string[])[];
    }
  | {
      readonly id: string;
      readonly kind: 'formula';
      readonly formula: string;
    }
  | {
      readonly id: string;
      readonly kind: 'picture';
      readonly url: string;
      readonly filename: string;
      readonly width?: number;
      readonly height?: number;
    }
  | {
      readonly id: string;
      readonly kind: 'card';
      readonly data: readonly CardContentEmbeddedCard[];
    }
  | {
      readonly id: string;
      readonly kind: 'drawing';
      readonly data: string;
    }
  | {
      readonly id: string;
      readonly kind: 'directory';
    }
  | {
      readonly id: string;
      readonly kind: 'checklist';
      readonly title: string;
      readonly items: readonly CardContentChecklistItem[];
    }
  | {
      readonly id: string;
      readonly kind: 'collapsible';
      readonly title: string;
      readonly collapsed: boolean;
      readonly blocks: readonly CardContentBlock[];
    };

type CardContentChecklistItem = {
  readonly id: string;
  readonly checked: boolean;
  readonly text: string;
};

type CardContentEmbeddedCard = {
  readonly id: string;
  readonly parent?: string;
  readonly title: string;
  readonly content: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly zIndex?: number;
  readonly childrenLayoutMode?: 'free' | 'mind-map-horizontal' | 'arrange';
  readonly linkedCardIds?: readonly string[];
};
