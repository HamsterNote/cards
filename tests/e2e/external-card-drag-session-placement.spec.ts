import { expect, test } from '@playwright/test';
import {
  externalDragCompletion,
  installExternalDragSessionHarness,
} from './external-card-drag-session-setup';

test.describe('CardCanvas external card drag sessions: placement', () => {
  test('shows first-Move inert preview and places at final inside point without focus', async ({
    page,
  }) => {
    const errors = await installExternalDragSessionHarness(page);
    await page.evaluate(() => window.__externalDragHarness?.start('placed', 0));
    await page.evaluate(() =>
      window.__externalDragHarness?.move(301, 300, 300)
    );
    await expect(page.locator('[data-external-card-preview]')).toBeVisible();
    await expect(page.locator('[data-external-card-preview]')).toHaveCSS(
      'pointer-events',
      'none'
    );
    await page.screenshot({
      path: '.omo/evidence/task-3-external-card-drag-in.png',
    });
    await page.evaluate(() => window.__externalDragHarness?.end(301, 350, 320));
    await expect(page.locator('[data-external-card-preview]')).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.__externalDragHarness
            ?.cards()
            .some((card) => card.id === 'placed')
        )
      )
      .toBe(true);
    await expect
      .poll(() => page.evaluate(() => window.__externalDragHarness?.selected()))
      .toBe('placed');
    await expect
      .poll(() =>
        page.evaluate(() =>
          document.activeElement?.getAttribute('contenteditable')
        )
      )
      .not.toBe('true');
    await expect(await externalDragCompletion(page, 'placed')).toEqual(
      expect.objectContaining({ status: 'placed' })
    );
    expect(errors).toEqual([]);
  });

  test('places a card through a touch-compatible pointer session', async ({
    page,
  }) => {
    // Given: the session harness with an editable canvas.
    const errors = await installExternalDragSessionHarness(page);

    // When: a touch pointer presses the source, moves into the canvas, and lifts inside.
    await page.evaluate(() =>
      window.__externalDragHarness?.start('touch-placed', 0, 'touch')
    );
    await page.evaluate(() =>
      window.__externalDragHarness?.move(301, 300, 300, 'touch')
    );
    await expect(page.locator('[data-external-card-preview]')).toBeVisible();
    await page.evaluate(() =>
      window.__externalDragHarness?.end(301, 300, 300, 'touch')
    );

    // Then: the touch session settles exactly like a mouse session.
    await expect(page.locator('[data-external-card-preview]')).toHaveCount(0);
    await expect(await externalDragCompletion(page, 'touch-placed')).toEqual(
      expect.objectContaining({
        status: 'placed',
        card: expect.objectContaining({ id: 'touch-placed' }),
      })
    );
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.__externalDragHarness
            ?.cards()
            .some((card) => card.id === 'touch-placed')
        )
      )
      .toBe(true);
    await expect
      .poll(() => page.evaluate(() => window.__externalDragHarness?.selected()))
      .toBe('touch-placed');
    expect(errors).toEqual([]);
  });

  test('keeps the anchor and final world placement aligned after real pan and zoom', async ({
    page,
  }) => {
    const errors = await installExternalDragSessionHarness(page, true);
    const canvas = page.locator('[data-card-canvas]');
    const canvasBox = await canvas.boundingBox();
    if (canvasBox === null) throw new Error('Expected canvas bounds');
    await canvas.dispatchEvent('wheel', {
      deltaY: -240,
      ctrlKey: true,
      clientX: canvasBox.x + 250,
      clientY: canvasBox.y + 200,
    });
    await canvas.dispatchEvent('wheel', {
      deltaX: 80,
      deltaY: 40,
      clientX: canvasBox.x + 250,
      clientY: canvasBox.y + 200,
    });
    await page.evaluate(() => {
      window.__externalDragHarness?.start('zoomed', 0);
      window.__externalDragHarness?.move(301, 350, 300);
    });
    const preview = page.locator('[data-external-card-preview]');
    await expect(preview).toBeVisible();
    const previewBox = await preview.boundingBox();
    if (previewBox === null) throw new Error('Expected preview bounds');
    expect(Math.abs(previewBox.x + previewBox.width / 2 - 350)).toBeLessThan(3);
    expect(Math.abs(previewBox.y + previewBox.height / 2 - 300)).toBeLessThan(
      3
    );
    await page.evaluate(() => window.__externalDragHarness?.end(301, 350, 300));
    await expect(await externalDragCompletion(page, 'zoomed')).toEqual(
      expect.objectContaining({
        status: 'placed',
        card: expect.objectContaining({ id: 'zoomed' }),
      })
    );
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            window.__externalDragHarness
              ?.cards()
              .find((card) => card.id === 'zoomed')?.x
        )
      )
      .toBeGreaterThan(-1000);
    expect(errors).toEqual([]);
  });
});
