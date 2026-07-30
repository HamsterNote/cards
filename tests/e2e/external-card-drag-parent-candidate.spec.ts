import { expect, test } from '@playwright/test';
const HARNESS_URL =
  '/tests/e2e/external-card-drag-parent-candidate-harness.tsx';

test('does not republish stable parent candidates across macrotasks', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(async (url) => {
    const { installExternalCandidateHarness } = await import(url);
    await installExternalCandidateHarness();
  }, HARNESS_URL);
  const before = await page.evaluate(() =>
    window.__externalCandidateHarness?.renders()
  );
  if (before === undefined) throw new Error('Missing candidate render count');
  const initialRenders = before;
  await page.evaluate(() =>
    window.__externalCandidateHarness?.publishAcrossTasks()
  );
  await expect(page.locator('[data-parent-ids]')).toHaveAttribute(
    'data-parent-ids',
    'parent'
  );
  expect(
    await page.evaluate(() => window.__externalCandidateHarness?.renders())
  ).toBe(initialRenders + 1);
});
