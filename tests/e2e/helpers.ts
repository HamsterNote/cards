import { expect, type Locator, type Page } from '@playwright/test';
import type { CardChildrenLayoutMode } from '../../src';

export type DragDelta = {
  readonly x: number;
  readonly y: number;
};

export type DragPoint = {
  readonly x: number;
  readonly y: number;
};

export type CardDragLocators = {
  readonly card: Locator;
  readonly handle: Locator;
};

export type CardDataSnapshot = {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly parent?: string;
  readonly childrenLayoutMode?: CardChildrenLayoutMode;
  readonly linkedCardIds?: readonly string[];
};

export async function addCard(
  page: Page,
  title = 'Test Card',
  content = 'Test content'
): Promise<void> {
  const cardCount = await page.locator('[data-card-id]').count();
  await page.locator('[data-card-title-input]').fill(title);
  await page.locator('[data-card-content-input]').fill(content);
  await page.getByRole('button', { name: 'Add Card' }).click();
  await expect(page.locator('[data-card-id]')).toHaveCount(cardCount + 1);
}

export async function addCardWithParent(
  page: Page,
  parentId: string,
  title = 'Test Card',
  content = 'Test content'
): Promise<void> {
  const cardCount = await page.locator('[data-card-id]').count();
  await page.locator('[data-card-title-input]').fill(title);
  await page.locator('[data-card-content-input]').fill(content);
  await page.locator('[data-card-parent-input]').fill(parentId);
  await page.getByRole('button', { name: 'Add Card' }).click();
  await expect(page.locator('[data-card-id]')).toHaveCount(cardCount + 1);
  await page.locator('[data-card-parent-input]').fill('');
}

export async function getRequiredBox(locator: Locator): Promise<{
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}> {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  if (box === null) {
    throw new Error('Expected locator to have a bounding box');
  }
  return box;
}

export async function dragLocatorBy(
  page: Page,
  locator: Locator,
  delta: DragDelta
): Promise<void> {
  await locator.scrollIntoViewIfNeeded();
  const box = await getRequiredBox(locator);
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + delta.x, startY + delta.y, { steps: 12 });
  await page.mouse.up();
}

export async function dragCardCenterToPoint(
  page: Page,
  locators: CardDragLocators,
  target: DragPoint
): Promise<void> {
  await locators.handle.scrollIntoViewIfNeeded();
  const cardBox = await getRequiredBox(locators.card);
  const handleBox = await getRequiredBox(locators.handle);
  const cardCenter = {
    x: cardBox.x + cardBox.width / 2,
    y: cardBox.y + cardBox.height / 2,
  };
  const handleCenter = {
    x: handleBox.x + handleBox.width / 2,
    y: handleBox.y + handleBox.height / 2,
  };

  await page.mouse.move(handleCenter.x, handleCenter.y);
  await page.mouse.down();
  await page.mouse.move(
    handleCenter.x + target.x - cardCenter.x,
    handleCenter.y + target.y - cardCenter.y,
    { steps: 20 }
  );
  await page.mouse.up();
}

export async function dragHandleToPoint(
  page: Page,
  handle: Locator,
  target: DragPoint
): Promise<void> {
  const handleBox = await getRequiredBox(handle);
  const handleCenter = {
    x: handleBox.x + handleBox.width / 2,
    y: handleBox.y + handleBox.height / 2,
  };

  await page.mouse.move(handleCenter.x, handleCenter.y);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 20 });
  await page.mouse.up();
}

export async function enableOption(page: Page, selector: string): Promise<void> {
  const option = page.locator(selector);
  await expect(option).toBeVisible();
  await option.check();
  await expect(option).toBeChecked();
}

export async function disableOption(page: Page, selector: string): Promise<void> {
  const option = page.locator(selector);
  await expect(option).toBeVisible();
  await option.uncheck();
  await expect(option).not.toBeChecked();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isCardChildrenLayoutMode(
  value: unknown
): value is CardChildrenLayoutMode {
  return value === 'free' || value === 'mind-map-horizontal' || value === 'arrange';
}

function isCardDataSnapshot(value: unknown): value is CardDataSnapshot {
  if (!isRecord(value)) return false;

  const parent = value.parent;
  const childrenLayoutMode = value.childrenLayoutMode;
  const linkedCardIds = value.linkedCardIds;
  return (
    typeof value.id === 'string' &&
    typeof value.x === 'number' &&
    typeof value.y === 'number' &&
    typeof value.width === 'number' &&
    typeof value.height === 'number' &&
    (parent === undefined || typeof parent === 'string') &&
    (childrenLayoutMode === undefined ||
      isCardChildrenLayoutMode(childrenLayoutMode)) &&
    (linkedCardIds === undefined || isStringArray(linkedCardIds))
  );
}

function parseCardData(text: string): CardDataSnapshot[] {
  const parsed: unknown = JSON.parse(text);
  if (!Array.isArray(parsed) || !parsed.every(isCardDataSnapshot)) {
    throw new Error('Expected Current Cards Data to contain card snapshots');
  }

  return parsed;
}

export async function getCardData(page: Page): Promise<CardDataSnapshot[]> {
  return parseCardData(await page.locator('[data-card-data-content]').innerText());
}

export function getCardDataById(
  cards: readonly CardDataSnapshot[],
  id: string
): CardDataSnapshot {
  const card = cards.find((candidate) => candidate.id === id);
  if (card === undefined) {
    throw new Error(`Expected card data for ${id}`);
  }

  return card;
}

export function expectCardMovedBy(
  before: CardDataSnapshot,
  after: CardDataSnapshot,
  delta: DragDelta
): void {
  expect(after.x).toBeCloseTo(before.x + delta.x, 5);
  expect(after.y).toBeCloseTo(before.y + delta.y, 5);
}

export function expectCardPositionUnchanged(
  before: CardDataSnapshot,
  after: CardDataSnapshot
): void {
  expect(after.x).toBeCloseTo(before.x, 5);
  expect(after.y).toBeCloseTo(before.y, 5);
}

export function expectNoParent(card: CardDataSnapshot): void {
  expect(Object.hasOwn(card, 'parent')).toBe(false);
}

export function cardCenter(card: CardDataSnapshot): DragPoint {
  return {
    x: card.x + card.width / 2,
    y: card.y + card.height / 2,
  };
}

export function cardLocatorSelector(cardId: string): string {
  return `[data-card-id="${cardId}"]`;
}

export function linkedIds(card: CardDataSnapshot): readonly string[] {
  return card.linkedCardIds ?? [];
}

export async function linkDragHeaderToCard(
  page: Page,
  sourceId: string,
  targetId: string
): Promise<void> {
  const sourceHeader = page.locator(`${cardLocatorSelector(sourceId)} .cards-card-canvas__card-header`);
  await sourceHeader.scrollIntoViewIfNeeded();
  const targetBox = await getRequiredBox(page.locator(cardLocatorSelector(targetId)));
  await dragHandleToPoint(page, sourceHeader, {
    x: targetBox.x + targetBox.width / 2,
    y: targetBox.y + targetBox.height / 2,
  });
}

export function parseRequiredNumber(value: string | null, label: string): number {
  if (value === null) throw new Error(`Expected ${label} attribute to be present`);
  return Number.parseFloat(value);
}

export async function connectorEndpoints(page: Page): Promise<{
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}> {
  const line = page.locator('[data-card-link-connector]');
  await expect(line).toHaveCount(1);
  return {
    x1: parseRequiredNumber(await line.getAttribute('x1'), 'x1'),
    y1: parseRequiredNumber(await line.getAttribute('y1'), 'y1'),
    x2: parseRequiredNumber(await line.getAttribute('x2'), 'x2'),
    y2: parseRequiredNumber(await line.getAttribute('y2'), 'y2'),
  };
}

export async function expectConnectorMatchesCardCenters(
  page: Page,
  sourceId: string,
  targetId: string
): Promise<void> {
  const cards = await getCardData(page);
  const sourceCenter = cardCenter(getCardDataById(cards, sourceId));
  const targetCenter = cardCenter(getCardDataById(cards, targetId));
  const endpoints = await connectorEndpoints(page);

  expect(endpoints.x1).toBeCloseTo(sourceCenter.x, 5);
  expect(endpoints.y1).toBeCloseTo(sourceCenter.y, 5);
  expect(endpoints.x2).toBeCloseTo(targetCenter.x, 5);
  expect(endpoints.y2).toBeCloseTo(targetCenter.y, 5);
}

export async function waitForAnimationFrame(page: Page): Promise<void> {
  await page.evaluate(
    () => new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
  );
}
