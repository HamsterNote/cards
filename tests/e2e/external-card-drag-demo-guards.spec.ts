import { expect, test, type Page } from '@playwright/test';

const TEMPLATE = '[data-external-card-template]';
const RESULT = '[data-external-card-result]';

async function dragTemplate(page: Page): Promise<void> {
  const template = page.locator(TEMPLATE);
  const canvas = page.locator('[data-card-canvas]');
  const source = await template.boundingBox();
  const target = await canvas.boundingBox();
  if (source === null || target === null)
    throw new Error('Expected drag bounds');
  await page.mouse.move(source.x + 90, source.y + 60);
  await page.mouse.down();
  await page.mouse.move(target.x + 300, target.y + 160, { steps: 5 });
  await page.mouse.up();
}

test('Demo ignores an active second touch without consuming IDs or overwriting status', async ({
  page,
}) => {
  await page.goto('/');
  const template = page.locator(TEMPLATE);
  await template.scrollIntoViewIfNeeded();
  const source = await template.boundingBox();
  const target = await page.locator('[data-card-canvas]').boundingBox();
  if (source === null || target === null)
    throw new Error('Expected drag bounds');
  await page.evaluate(
    ({ first, second }) => {
      const templateElement = document.querySelector<HTMLElement>(
        '[data-external-card-template]'
      );
      if (templateElement === null) throw new Error('Expected template');
      for (const [pointerId, point] of [
        [701, first],
        [702, second],
      ] as const) {
        templateElement.dispatchEvent(
          new PointerEvent('pointerdown', {
            bubbles: true,
            button: 0,
            clientX: point.x,
            clientY: point.y,
            pointerId,
            pointerType: 'touch',
          })
        );
      }
    },
    {
      first: { x: source.x + 40, y: source.y + 40 },
      second: { x: source.x + 140, y: source.y + 40 },
    }
  );
  await expect(page.locator(RESULT)).toHaveAttribute(
    'data-external-card-result-status',
    'idle'
  );
  await page.evaluate(
    (point) => {
      document.dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          clientX: point.x,
          clientY: point.y,
          pointerId: 701,
          pointerType: 'touch',
        })
      );
      document.dispatchEvent(
        new PointerEvent('pointerup', {
          bubbles: true,
          clientX: point.x,
          clientY: point.y,
          pointerId: 701,
          pointerType: 'touch',
        })
      );
    },
    { x: target.x + 300, y: target.y + 160 }
  );
  await expect(page.locator(RESULT)).toHaveAttribute(
    'data-external-card-result-card-id',
    'external-card-1'
  );
  await expect(page.locator('[data-card-id="external-card-1"]')).toHaveCount(1);
  await page.evaluate(
    (point) => {
      document.dispatchEvent(
        new PointerEvent('pointerup', {
          bubbles: true,
          clientX: point.x,
          clientY: point.y,
          pointerId: 702,
          pointerType: 'touch',
        })
      );
    },
    { x: source.x + 140, y: source.y + 40 }
  );
  await dragTemplate(page);
  await expect(page.locator(RESULT)).toHaveAttribute(
    'data-external-card-result-card-id',
    'external-card-2'
  );
  await expect(page.locator('[data-card-id]')).toHaveCount(2);
});
