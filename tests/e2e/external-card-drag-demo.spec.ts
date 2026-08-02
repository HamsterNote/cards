import { expect, test, type Page } from '@playwright/test';

const TEMPLATE_SELECTOR = '[data-external-card-template]';
const RESULT_SELECTOR = '[data-external-card-result]';
const PREVIEW_SELECTOR = '[data-external-card-preview]';

async function dragTemplateIntoCanvas(
  page: Page,
  pressOffset: { x: number; y: number },
  releaseOffset: { x: number; y: number }
) {
  await page.locator(TEMPLATE_SELECTOR).scrollIntoViewIfNeeded();
  const templateBox = await page.locator(TEMPLATE_SELECTOR).boundingBox();
  const canvasBox = await page.locator('[data-card-canvas]').boundingBox();
  if (templateBox === null || canvasBox === null) {
    throw new Error('Expected template and canvas bounds');
  }
  const pressX = templateBox.x + pressOffset.x;
  const pressY = templateBox.y + pressOffset.y;
  const releaseX = canvasBox.x + releaseOffset.x;
  const releaseY = canvasBox.y + releaseOffset.y;

  await page.mouse.move(pressX, pressY);
  await page.mouse.down();
  await page.mouse.move(releaseX, releaseY, { steps: 10 });
  await page.mouse.up();
  return { pressX, pressY, releaseX, releaseY };
}

test.describe('Demo external card drag-in template', () => {
  test('places two distinct cards from the reusable template and keeps it available', async ({
    page,
  }) => {
    // Given: the Demo with its external card template outside the canvas.
    await page.goto('/');
    await expect(page.locator(TEMPLATE_SELECTOR)).toBeVisible();
    await expect(page.locator('[data-card-id]')).toHaveCount(0);

    // When: the user presses away from the template center and releases inside the canvas.
    const first = await dragTemplateIntoCanvas(
      page,
      { x: 18, y: 24 },
      { x: 400, y: 180 }
    );

    // Then: exactly one inert preview tracked the pointer and the release placed the card.
    await expect(page.locator(RESULT_SELECTOR)).toHaveAttribute(
      'data-external-card-result-status',
      'placed'
    );
    await expect(page.locator(RESULT_SELECTOR)).toHaveAttribute(
      'data-external-card-result-card-id',
      'external-card-1'
    );
    await expect(page.locator(PREVIEW_SELECTOR)).toHaveCount(0);
    const firstCard = page.locator('[data-card-id="external-card-1"]');
    await expect(firstCard).toHaveCount(1);

    // Then: the off-center press anchor keeps the pointer at the same relative spot.
    const firstCardBox = await firstCard.boundingBox();
    if (firstCardBox === null) throw new Error('Expected placed card bounds');
    expect(firstCardBox.x).toBeCloseTo(first.releaseX - 18, 0);
    expect(firstCardBox.y).toBeCloseTo(first.releaseY - 24, 0);

    // When: the user drags from the same template a second time.
    await dragTemplateIntoCanvas(page, { x: 90, y: 60 }, { x: 620, y: 260 });

    // Then: a second distinct card is placed while the first remains.
    await expect(page.locator(RESULT_SELECTOR)).toHaveAttribute(
      'data-external-card-result-status',
      'placed'
    );
    await expect(page.locator(RESULT_SELECTOR)).toHaveAttribute(
      'data-external-card-result-card-id',
      'external-card-2'
    );
    await expect(page.locator('[data-card-id="external-card-2"]')).toHaveCount(
      1
    );
    await expect(firstCard).toHaveCount(1);
    await expect(page.locator(TEMPLATE_SELECTOR)).toBeVisible();
    await expect(page.locator('[data-card-data-content]')).toContainText(
      'external-card-1'
    );
    await expect(page.locator('[data-card-data-content]')).toContainText(
      'external-card-2'
    );
  });

  test('shows the inert preview during the drag and clears it after placement', async ({
    page,
  }) => {
    // Given: the Demo template.
    await page.goto('/');
    await page.locator(TEMPLATE_SELECTOR).scrollIntoViewIfNeeded();
    const templateBox = await page.locator(TEMPLATE_SELECTOR).boundingBox();
    const canvasBox = await page.locator('[data-card-canvas]').boundingBox();
    if (templateBox === null || canvasBox === null) {
      throw new Error('Expected template and canvas bounds');
    }

    // When: the pointer moves from the template into the canvas without releasing.
    await page.mouse.move(templateBox.x + 90, templateBox.y + 60);
    await page.mouse.down();
    await page.mouse.move(canvasBox.x + 300, canvasBox.y + 150, { steps: 8 });

    // Then: one non-interactive preview mirrors the template content.
    const preview = page.locator(PREVIEW_SELECTOR);
    await expect(preview).toHaveCount(1);
    await expect(preview).toHaveAttribute('aria-hidden', 'true');
    await expect(preview).not.toHaveAttribute('data-card-id', /.*/);

    // When: the pointer is released inside the canvas.
    await page.mouse.up();

    // Then: the preview is gone and one real card exists.
    await expect(preview).toHaveCount(0);
    await expect(page.locator('[data-card-id]')).toHaveCount(1);
  });

  test('ignores a second touch Start while the first template session is active', async ({
    page,
  }) => {
    await page.goto('/');
    await page.locator(TEMPLATE_SELECTOR).scrollIntoViewIfNeeded();
    const templateBox = await page.locator(TEMPLATE_SELECTOR).boundingBox();
    const canvasBox = await page.locator('[data-card-canvas]').boundingBox();
    if (templateBox === null || canvasBox === null) {
      throw new Error('Expected template and canvas bounds');
    }

    await page.evaluate(
      ({ first, second, target }) => {
        const template = document.querySelector<HTMLElement>(
          '[data-external-card-template]'
        );
        if (template === null) throw new Error('Expected template');
        const dispatch = (
          type: string,
          pointerId: number,
          point: { readonly x: number; readonly y: number }
        ) =>
          (type === 'pointerdown' ? template : document).dispatchEvent(
            new PointerEvent(type, {
              bubbles: true,
              button: 0,
              clientX: point.x,
              clientY: point.y,
              pointerId,
              pointerType: 'touch',
            })
          );
        dispatch('pointerdown', 701, first);
        dispatch('pointerdown', 702, second);
        dispatch('pointermove', 701, target);
        dispatch('pointerup', 701, target);
      },
      {
        first: { x: templateBox.x + 40, y: templateBox.y + 40 },
        second: { x: templateBox.x + 140, y: templateBox.y + 40 },
        target: { x: canvasBox.x + 300, y: canvasBox.y + 160 },
      }
    );

    await expect(page.locator(RESULT_SELECTOR)).toHaveAttribute(
      'data-external-card-result-status',
      'placed'
    );
    await expect(page.locator(RESULT_SELECTOR)).toHaveAttribute(
      'data-external-card-result-card-id',
      'external-card-1'
    );
    await expect(page.locator('[data-card-id="external-card-1"]')).toHaveCount(
      1
    );
  });

  test('reports a synchronous rejection when the canvas is not editable', async ({
    page,
  }) => {
    // Given: editing is disabled before the drag starts.
    await page.goto('/');
    await page.locator('[data-card-editable-toggle]').uncheck();

    // When: the user presses the template and moves into the canvas.
    await dragTemplateIntoCanvas(page, { x: 90, y: 60 }, { x: 400, y: 180 });

    // Then: the start rejection is reported and no preview or card appears.
    await expect(page.locator(RESULT_SELECTOR)).toHaveAttribute(
      'data-external-card-result-status',
      'rejected'
    );
    await expect(page.locator(RESULT_SELECTOR)).toHaveAttribute(
      'data-external-card-result-reason',
      'not-editable'
    );
    await expect(page.locator(PREVIEW_SELECTOR)).toHaveCount(0);
    await expect(page.locator('[data-card-id]')).toHaveCount(0);
  });

  test('reports an async cancellation when released outside the canvas', async ({
    page,
  }) => {
    // Given: an editable Demo canvas.
    await page.goto('/');
    await page.locator(TEMPLATE_SELECTOR).scrollIntoViewIfNeeded();
    const templateBox = await page.locator(TEMPLATE_SELECTOR).boundingBox();
    const canvasBox = await page.locator('[data-card-canvas]').boundingBox();
    if (templateBox === null || canvasBox === null) {
      throw new Error('Expected template and canvas bounds');
    }

    // When: the pointer enters the canvas and then leaves before release.
    await page.mouse.move(templateBox.x + 90, templateBox.y + 60);
    await page.mouse.down();
    await page.mouse.move(canvasBox.x + 300, canvasBox.y + 150, { steps: 6 });
    await expect(page.locator(PREVIEW_SELECTOR)).toHaveCount(1);
    await page.mouse.move(templateBox.x + 90, templateBox.y + 160, {
      steps: 6,
    });
    await page.mouse.up();

    // Then: the completion reports the outside release and nothing was placed.
    await expect(page.locator(RESULT_SELECTOR)).toHaveAttribute(
      'data-external-card-result-status',
      'cancelled'
    );
    await expect(page.locator(RESULT_SELECTOR)).toHaveAttribute(
      'data-external-card-result-reason',
      'released-outside-canvas'
    );
    await expect(page.locator(PREVIEW_SELECTOR)).toHaveCount(0);
    await expect(page.locator('[data-card-id]')).toHaveCount(0);
  });
});
