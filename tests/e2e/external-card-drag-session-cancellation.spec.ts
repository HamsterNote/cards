import { expect, test } from '@playwright/test';
import {
  externalDragCompletion,
  installExternalDragSessionHarness,
} from './external-card-drag-session-setup';

test.describe('CardCanvas external card drag sessions: cancellation', () => {
  test('cancels no-Move, outside, overlay, re-entry, and pointercancel with exact reasons', async ({
    page,
  }) => {
    const errors = await installExternalDragSessionHarness(page);
    await page.evaluate(() =>
      window.__externalDragHarness?.start('no-move', 0)
    );
    await page.evaluate(() => window.__externalDragHarness?.end(301, 250, 250));
    await expect(await externalDragCompletion(page, 'no-move')).toEqual({
      status: 'cancelled',
      reason: 'released-outside-canvas',
    });
    await page.evaluate(() =>
      window.__externalDragHarness?.start('outside', 1)
    );
    await page.evaluate(() =>
      window.__externalDragHarness?.move(302, 250, 250)
    );
    await page.evaluate(() => window.__externalDragHarness?.end(302, 10, 10));
    await expect(await externalDragCompletion(page, 'outside')).toEqual({
      status: 'cancelled',
      reason: 'released-outside-canvas',
    });
    await page.evaluate(() => {
      window.__externalDragHarness?.addOverlay();
      window.__externalDragHarness?.start('overlay', 2);
    });
    const overlayBox = await page
      .locator('[data-external-test-overlay]')
      .boundingBox();
    if (overlayBox === null) throw new Error('Expected overlay bounds');
    await page.evaluate(
      ({ x, y }) => window.__externalDragHarness?.move(303, x, y),
      { x: overlayBox.x + 10, y: overlayBox.y + 10 }
    );
    await expect(page.locator('[data-external-card-preview]')).toHaveCount(0);
    await page.evaluate(() => {
      window.__externalDragHarness?.removeOverlay();
      window.__externalDragHarness?.move(303, 250, 250);
    });
    await expect(page.locator('[data-external-card-preview]')).toHaveCount(1);
    await page.evaluate(() =>
      window.__externalDragHarness?.cancelPointer(303, 250, 250)
    );
    await expect(await externalDragCompletion(page, 'overlay')).toEqual({
      status: 'cancelled',
      reason: 'pointer-cancelled',
    });
    expect(errors).toEqual([]);
  });

  test('settles a touch pointercancel as pointer-cancelled', async ({
    page,
  }) => {
    // Given: a touch session whose preview is visible inside the canvas.
    const errors = await installExternalDragSessionHarness(page);
    await page.evaluate(() => {
      window.__externalDragHarness?.start('touch-cancel', 0, 'touch');
      window.__externalDragHarness?.move(301, 250, 250, 'touch');
    });
    await expect(page.locator('[data-external-card-preview]')).toHaveCount(1);

    // When: the touch pointer is cancelled instead of lifted.
    await page.evaluate(() =>
      window.__externalDragHarness?.cancelPointer(301, 250, 250, 'touch')
    );

    // Then: the session settles once as pointer-cancelled with no leftovers.
    await expect(await externalDragCompletion(page, 'touch-cancel')).toEqual({
      status: 'cancelled',
      reason: 'pointer-cancelled',
    });
    await expect(page.locator('[data-external-card-preview]')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('treats an in-canvas menu overlay as outside the canvas', async ({
    page,
  }) => {
    // Given: a session and an interactive menu overlay inside the canvas DOM.
    const errors = await installExternalDragSessionHarness(page);
    await page.evaluate(() => {
      window.__externalDragHarness?.addOverlay('menu');
      window.__externalDragHarness?.start('menu-overlay', 0);
    });
    const overlayBox = await page
      .locator('[data-external-test-overlay]')
      .boundingBox();
    if (overlayBox === null) throw new Error('Expected overlay bounds');

    // When: the pointer moves onto the menu overlay and lifts there.
    await page.evaluate(
      ({ x, y }) => window.__externalDragHarness?.move(301, x, y),
      { x: overlayBox.x + 10, y: overlayBox.y + 10 }
    );

    // Then: no preview is shown over the menu and the release cancels.
    await expect(page.locator('[data-external-card-preview]')).toHaveCount(0);
    await page.evaluate(
      ({ x, y }) => window.__externalDragHarness?.end(301, x, y),
      { x: overlayBox.x + 10, y: overlayBox.y + 10 }
    );
    await expect(await externalDragCompletion(page, 'menu-overlay')).toEqual({
      status: 'cancelled',
      reason: 'released-outside-canvas',
    });

    // Then: removing the overlay makes the same point a valid card surface again.
    await page.evaluate(() => {
      window.__externalDragHarness?.removeOverlay();
      window.__externalDragHarness?.start('menu-removed', 1);
      window.__externalDragHarness?.move(302, 250, 250);
    });
    await expect(page.locator('[data-external-card-preview]')).toHaveCount(1);
    await page.evaluate(() =>
      window.__externalDragHarness?.cancel('menu-removed')
    );
    expect(errors).toEqual([]);
  });

  test('treats the canonical overlay marker and interactive roles as outside', async ({
    page,
  }) => {
    const errors = await installExternalDragSessionHarness(page);
    for (const kind of ['marker', 'listbox', 'tree'] as const) {
      await page.evaluate((overlayKind) => {
        window.__externalDragHarness?.addOverlay(overlayKind);
        window.__externalDragHarness?.start(`overlay-${overlayKind}`, 0);
      }, kind);
      const overlayBox = await page
        .locator('[data-external-test-overlay]')
        .boundingBox();
      if (overlayBox === null) throw new Error('Expected overlay bounds');
      await page.evaluate(
        ({ pointerId, x, y }) =>
          window.__externalDragHarness?.move(pointerId, x, y),
        { pointerId: 301, x: overlayBox.x + 10, y: overlayBox.y + 10 }
      );
      await expect(page.locator('[data-external-card-preview]')).toHaveCount(0);
      await page.evaluate(
        ({ pointerId, x, y }) =>
          window.__externalDragHarness?.end(pointerId, x, y),
        { pointerId: 301, x: overlayBox.x + 10, y: overlayBox.y + 10 }
      );
      await expect(
        await externalDragCompletion(page, `overlay-${kind}`)
      ).toEqual({ status: 'cancelled', reason: 'released-outside-canvas' });
      await page.evaluate(() => window.__externalDragHarness?.removeOverlay());
    }
    expect(errors).toEqual([]);
  });

  test('cancels conflicts, idempotent host cancellation, and readonly transitions', async ({
    page,
  }) => {
    const errors = await installExternalDragSessionHarness(page);
    await page.evaluate(() => {
      window.__externalDragHarness?.start('conflict', 0);
      window.__externalDragHarness?.addConflict('conflict');
    });
    await expect(page.locator('[data-card-id="conflict"]')).toHaveCount(1);
    await page.evaluate(() => {
      window.__externalDragHarness?.move(301, 250, 250);
      window.__externalDragHarness?.end(301, 250, 250);
    });
    await expect(await externalDragCompletion(page, 'conflict')).toEqual({
      status: 'cancelled',
      reason: 'card-id-conflict',
    });
    await page.evaluate(() => {
      window.__externalDragHarness?.start('cancel', 1);
      window.__externalDragHarness?.cancel('cancel');
      window.__externalDragHarness?.cancel('cancel');
    });
    await expect(await externalDragCompletion(page, 'cancel')).toEqual({
      status: 'cancelled',
      reason: 'cancelled-by-host',
    });
    await page.evaluate(() => {
      window.__externalDragHarness?.start('readonly', 2);
      window.__externalDragHarness?.setEditable(false);
    });
    await expect(await externalDragCompletion(page, 'readonly')).toEqual({
      status: 'cancelled',
      reason: 'canvas-became-readonly',
    });
    expect(errors).toEqual([]);
  });

  test('removes live-Finger listeners when a host cancels an active session', async ({
    page,
  }) => {
    const errors = await installExternalDragSessionHarness(page);
    await page.evaluate(() => {
      window.__externalDragHarness?.start('live-finger', 0);
      window.__externalDragHarness?.move(301, 250, 250);
    });
    await expect(page.locator('[data-external-card-preview]')).toHaveCount(1);
    await page.evaluate(() => {
      window.__externalDragHarness?.cancel('live-finger');
      window.__externalDragHarness?.move(301, 300, 300);
    });
    await expect(await externalDragCompletion(page, 'live-finger')).toEqual({
      status: 'cancelled',
      reason: 'cancelled-by-host',
    });
    await expect(page.locator('[data-external-card-preview]')).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate(() => window.__externalDragHarness?.cards().length)
      )
      .toBe(1);
    expect(errors).toEqual([]);
  });
});
