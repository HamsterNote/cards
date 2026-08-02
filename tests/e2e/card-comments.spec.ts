import { expect, test } from '@playwright/test';

test('each comment label focuses its own input when multiple panels render', async ({
  page,
}) => {
  // Given: two independent comment panels rendered by the real source component.
  await page.goto('/tests/e2e/card-comments-harness.html');

  const panels = page.locator('[data-card-comment-panel]');
  await expect(panels).toHaveCount(2);

  // When: the second panel's visible label is clicked.
  await panels.nth(1).getByText('添加评论', { exact: true }).click();

  // Then: IDs are unique and focus remains inside the second panel.
  const inputIds = await panels
    .locator('[data-card-comment-input]')
    .evaluateAll((inputs) => inputs.map((input) => input.id));
  expect(new Set(inputIds).size).toBe(2);
  await expect(
    panels.nth(1).locator('[data-card-comment-input]')
  ).toBeFocused();
});
