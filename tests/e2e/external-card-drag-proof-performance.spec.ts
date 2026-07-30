import { expect, test } from '@playwright/test';

const HARNESS_URL = '/tests/e2e/external-card-drag-proof-harness.tsx';

async function install(page: import('@playwright/test').Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.evaluate(async (url) => {
    const { installExternalDragProofHarness } = await import(url);
    await installExternalDragProofHarness();
  }, HARNESS_URL);
  return errors;
}

test.afterEach(async ({ page }) => {
  await page.evaluate(() => window.__externalDragProof?.dispose());
});

test('coalesces a same-frame Move burst and preserves handle identity', async ({
  page,
}) => {
  const errors = await install(page);
  await page.evaluate(() => {
    window.__externalDragProof?.start('burst');
    for (let offset = 0; offset < 12; offset += 1)
      window.__externalDragProof?.move(250 + offset, 250);
  });
  await expect(page.locator('[data-external-card-preview]')).toHaveCount(1);
  const metrics = await page.evaluate(() =>
    window.__externalDragProof?.metrics()
  );
  expect(metrics).toEqual(expect.objectContaining({ stableHandle: true }));
  expect(metrics?.renders).toBeLessThanOrEqual(4);
  expect(
    await page.evaluate(() => window.__externalDragProof?.candidateMutations())
  ).toBe(1);
  expect(errors).toEqual([]);
});

test('coalesces preview renders across separate Move macrotasks', async ({
  page,
}) => {
  const errors = await install(page);
  await page.evaluate(() => window.__externalDragProof?.start('cross-task'));
  const before = await page.evaluate(() =>
    window.__externalDragProof?.metrics()
  );
  await page.evaluate(() => window.__externalDragProof?.moveAcrossMacrotasks());
  const preview = page.locator('[data-external-card-preview]');
  await expect(preview).toHaveCount(1);
  await expect(preview).toHaveCSS('left', '121px');
  const after = await page.evaluate(() =>
    window.__externalDragProof?.metrics()
  );
  expect(after?.stableHandle).toBe(true);
  expect(after?.renders).toBeLessThanOrEqual((before?.renders ?? 0) + 5);
  expect(errors).toEqual([]);
});
