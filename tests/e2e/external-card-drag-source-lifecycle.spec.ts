import { expect, test } from '@playwright/test';

const HARNESS_URL =
  '/tests/e2e/external-card-drag-source-lifecycle-harness.tsx';

test('stale Demo completion cannot overwrite result after effect cleanup rotates the canvas ref', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(async (url) => {
    const { installExternalDragLifecycleHarness } = await import(url);
    await installExternalDragLifecycleHarness();
  }, HARNESS_URL);
  await page.evaluate(() => {
    const template = document.querySelector<HTMLElement>(
      '[data-external-card-template]'
    );
    if (template === null) throw new Error('Missing template');
    const source = template.getBoundingClientRect();
    template.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        button: 0,
        clientX: source.x + 90,
        clientY: source.y + 60,
        pointerId: 800,
      })
    );
    window.__externalDragLifecycle?.rotateCanvasRef();
  });
  await expect(page.locator('[data-external-card-result]')).toHaveAttribute(
    'data-external-card-result-status',
    'idle'
  );
  await page.evaluate(() => window.__externalDragLifecycle?.drag());
  await expect(page.locator('[data-external-card-result]')).toHaveAttribute(
    'data-external-card-result-card-id',
    'external-card-2'
  );
  await expect(page.locator('[data-card-id="external-card-2"]')).toHaveCount(1);
});
