import { expect, test } from '@playwright/test';
import {
  externalDragCompletion,
  installExternalDragSessionHarness,
} from './external-card-drag-session-setup';

test.describe('CardCanvas external card drag sessions: lifecycle', () => {
  test('keeps shared parent highlighting until both concurrent sessions settle', async ({
    page,
  }) => {
    const errors = await installExternalDragSessionHarness(page);
    await page.evaluate(() => {
      window.__externalDragHarness?.start('first', 0);
      window.__externalDragHarness?.start('second', 1);
      window.__externalDragHarness?.move(301, 250, 250);
      window.__externalDragHarness?.move(302, 260, 260);
    });
    await expect(page.locator('[data-external-card-preview]')).toHaveCount(2);
    await expect(page.locator('[data-card-id="parent"]')).toHaveAttribute(
      'data-parent-candidate',
      'true'
    );
    await page.evaluate(() =>
      window.__externalDragHarness?.cancelPointer(301, 250, 250)
    );
    await expect(page.locator('[data-card-id="parent"]')).toHaveAttribute(
      'data-parent-candidate',
      'true'
    );
    await page.evaluate(() =>
      window.__externalDragHarness?.cancelPointer(302, 260, 260)
    );
    await expect(page.locator('[data-external-card-preview]')).toHaveCount(0);
    await expect(page.locator('[data-card-id="parent"]')).not.toHaveAttribute(
      'data-parent-candidate',
      'true'
    );
    await expect(await externalDragCompletion(page, 'first')).toEqual({
      status: 'cancelled',
      reason: 'pointer-cancelled',
    });
    await expect(await externalDragCompletion(page, 'second')).toEqual({
      status: 'cancelled',
      reason: 'pointer-cancelled',
    });
    expect(errors).toEqual([]);
  });

  test('rejects startup when callback disappears and keeps stale handles inert after unmount', async ({
    page,
  }) => {
    const errors = await installExternalDragSessionHarness(page);
    await page.evaluate(() =>
      window.__externalDragHarness?.start('callback-transition', 2)
    );
    await page.evaluate(() =>
      window.__externalDragHarness?.setCallbackEnabled(false)
    );
    await expect(
      await externalDragCompletion(page, 'callback-transition')
    ).toEqual({ status: 'cancelled', reason: 'canvas-became-readonly' });
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.__externalDragHarness?.startResult('missing-callback', 0)
        )
      )
      .toBe('missing-on-cards-change');
    await page.evaluate(() => window.__externalDragHarness?.unmount());
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.__externalDragHarness?.startResult('stale', 1)
        )
      )
      .toBe('not-editable');
    expect(errors).toEqual([]);
  });

  test('settles unmount and rejects its stale handle', async ({ page }) => {
    const errors = await installExternalDragSessionHarness(page);
    await page.evaluate(() => {
      window.__externalDragHarness?.start('unmounted', 0);
      window.__externalDragHarness?.move(301, 250, 250);
      window.__externalDragHarness?.unmount();
    });
    await expect(await externalDragCompletion(page, 'unmounted')).toEqual({
      status: 'cancelled',
      reason: 'canvas-unmounted',
    });
    await expect(page.locator('[data-external-card-preview]')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});
