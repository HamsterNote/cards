import { expect, test } from '@playwright/test';

const HARNESS_URL = '/tests/e2e/external-card-drag-proof-harness.tsx';

async function installProofHarness(page: import('@playwright/test').Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/');
  await page.evaluate(async (url) => {
    const { installExternalDragProofHarness } = await import(url);
    await installExternalDragProofHarness();
  }, HARNESS_URL);
  await expect(page.locator('[data-card-canvas]')).toBeVisible();
  return errors;
}

async function disposeProofHarness(page: import('@playwright/test').Page) {
  await page.evaluate(() => window.__externalDragProof?.dispose());
}

async function proofCompletion(page: import('@playwright/test').Page) {
  return page.evaluate(async () => window.__externalDragProof?.completion());
}

test.describe('CardCanvas external drag final review proofs', () => {
  test.afterEach(async ({ page }) => {
    await disposeProofHarness(page);
  });

  test('keeps ordinary CardCanvas movement and external End in deterministic event order', async ({
    page,
  }) => {
    for (const order of ['ordinary-first', 'external-first'] as const) {
      const errors = await installProofHarness(page);
      await page.evaluate((id) => {
        window.__externalDragProof?.start(id);
        window.__externalDragProof?.move(300, 300);
      }, `external-${order}`);
      await expect(page.locator('[data-external-card-preview]')).toHaveCount(1);
      await page.evaluate(
        (currentOrder) => window.__externalDragProof?.interleave(currentOrder),
        order
      );
      await expect(await proofCompletion(page)).toEqual(
        expect.objectContaining({
          status: 'placed',
          card: expect.objectContaining({ id: `external-${order}` }),
        })
      );
      await expect
        .poll(() =>
          page.evaluate(() =>
            window.__externalDragProof?.cards().map((card) => card.id)
          )
        )
        .toEqual(['parent', 'ordinary', `external-${order}`]);
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              window.__externalDragProof
                ?.cards()
                .find((card) => card.id === 'ordinary')?.x
          )
        )
        .toBe(30);
      expect(errors).toEqual([]);
      await disposeProofHarness(page);
    }
  });

  test('preserves a title and content patch issued immediately before external Finger End', async ({
    page,
  }) => {
    // Given: an active external preview and a selected ordinary card Popover.
    const errors = await installProofHarness(page);
    await page.evaluate(() => {
      window.__externalDragProof?.start('external-after-patch');
      window.__externalDragProof?.move(300, 300);
    });
    await page.locator('[data-card-id="ordinary"]').click();
    await expect(page.locator('[data-proof-patch-ordinary]')).toBeVisible();

    // When: the Popover patch and the locked Finger End occur in one synchronous task.
    await page.evaluate(() =>
      window.__externalDragProof?.patchThenEnd(
        'patched title',
        'patched content',
        350,
        320
      )
    );

    // Then: both the patch and placement commit against the same authoritative card snapshot.
    await expect(await proofCompletion(page)).toEqual(
      expect.objectContaining({ status: 'placed' })
    );
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.__externalDragProof?.cards().map((card) => ({
            id: card.id,
            title: card.title,
            content: card.content,
          }))
        )
      )
      .toEqual(
        expect.arrayContaining([
          {
            id: 'ordinary',
            title: 'patched title',
            content: 'patched content',
          },
          expect.objectContaining({ id: 'external-after-patch' }),
        ])
      );
    expect(errors).toEqual([]);
    await disposeProofHarness(page);
  });

  test('disposes active sessions, Drag listeners, React roots, observers, and globals between installs', async ({
    page,
  }) => {
    // Given: an active session and mounted proof harness.
    await installProofHarness(page);
    await page.evaluate(() => {
      window.__externalDragProof?.start('cleanup-active');
      window.__externalDragProof?.move(300, 300);
    });
    await expect(page.locator('[data-external-card-preview]')).toHaveCount(1);

    // When: the harness is explicitly disposed twice.
    await disposeProofHarness(page);
    await disposeProofHarness(page);

    // Then: no harness-owned DOM/global/session reacts to a stale pointer event.
    await expect(page.locator('[data-card-canvas]')).toHaveCount(0);
    await expect(page.locator('[data-external-card-preview]')).toHaveCount(0);
    expect(
      await page.evaluate(() => window.__externalDragProof)
    ).toBeUndefined();
    await page.evaluate(() =>
      document.dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          clientX: 300,
          clientY: 300,
          pointerId: 901,
        })
      )
    );
    await expect(page.locator('[data-external-card-preview]')).toHaveCount(0);
  });

  test('locks placed completion before callback reentry or callback errors', async ({
    page,
  }) => {
    for (const mode of [
      'reenter-cancel',
      'throw-change',
      'throw-select',
    ] as const) {
      const errors = await installProofHarness(page);
      await page.evaluate((nextMode) => {
        window.__externalDragProof?.setCallbackMode(nextMode);
        window.__externalDragProof?.start(`placed-${nextMode}`);
        window.__externalDragProof?.move(300, 300);
      }, mode);
      await expect(page.locator('[data-external-card-preview]')).toHaveCount(1);
      await page.evaluate(() => window.__externalDragProof?.end(350, 320));
      await expect(await proofCompletion(page)).toEqual(
        expect.objectContaining({ status: 'placed' })
      );
      await expect(page.locator('[data-external-card-preview]')).toHaveCount(0);
      if (mode === 'reenter-cancel') expect(errors).toEqual([]);
      else
        expect(errors).toContain(
          mode === 'throw-change' ? 'change failure' : 'select failure'
        );
    }
  });

  test('makes interactive preview descendants inert to focus and activation', async ({
    page,
  }) => {
    const errors = await installProofHarness(page);
    await page.evaluate(() => {
      window.__externalDragProof?.start('inert-preview');
      window.__externalDragProof?.move(250, 250);
    });
    const preview = page.locator('[data-external-card-preview]');
    await expect(preview).toHaveCount(1);
    await expect(preview).toHaveAttribute('inert', '');
    const normalControl = page.locator(
      '[data-card-id="ordinary"] [data-proof-title]'
    );
    await normalControl.focus();
    await expect(normalControl).toBeFocused();
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    });
    await page.keyboard.press('Tab');
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document.activeElement?.closest('[data-external-card-preview]') !==
            null
        )
      )
      .toBe(false);
    const focusOutcome = await page.evaluate(() => {
      const controls = document.querySelectorAll<HTMLElement>(
        '[data-external-card-preview] [data-proof-title], [data-external-card-preview] [data-proof-link], [data-external-card-preview] [data-proof-input], [data-external-card-preview] [data-proof-tab-index]'
      );
      for (const control of controls) control.focus();
      return (
        document.activeElement?.closest('[data-external-card-preview]') !== null
      );
    });
    expect(focusOutcome).toBe(false);
    await page.evaluate(() =>
      window.__externalDragProof?.clickPreviewControls()
    );
    await page.evaluate(() => {
      document
        .querySelectorAll<HTMLElement>(
          '[data-external-card-preview] [data-proof-title], [data-external-card-preview] [data-proof-link], [data-external-card-preview] [data-proof-input], [data-external-card-preview] [data-proof-tab-index]'
        )
        .forEach((control) => {
          control.dispatchEvent(
            new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' })
          );
        });
    });
    await expect
      .poll(() =>
        page.evaluate(() => window.__externalDragProof?.activations())
      )
      .toBe(0);
    await page.screenshot({
      path: '.omo/evidence/task-6-final-review-inert-proof.png',
    });
    expect(errors).toEqual([]);
  });
});
