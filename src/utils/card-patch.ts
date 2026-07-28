import type { CardCanvasCard } from '../components/CardCanvas';

export function mergeCardPatch(
  card: CardCanvasCard,
  data: Partial<Omit<CardCanvasCard, 'id'>>
): CardCanvasCard {
  const mergedCard = { ...card, ...data };
  if (card.lock !== true) {
    return mergedCard;
  }

  const geometryPreservedCard = {
    ...mergedCard,
    x: card.x,
    y: card.y,
    width: card.width,
    height: card.height,
  };
  if (card.parent === undefined) {
    delete geometryPreservedCard.parent;
    return geometryPreservedCard;
  }

  return { ...geometryPreservedCard, parent: card.parent };
}
