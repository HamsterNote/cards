import { expect, test } from '@playwright/test';

// 主题切换 E2E 测试：
// 验证 CardCanvas 与 Button 都支持 theme prop，
// 通过 demo 页面的 "Dark theme" 开关在 light / dark 之间切换。
// 断言根元素 data-theme 属性以及关键 CSS 颜色随主题变化。

test.describe('Theme switching', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('CardCanvas defaults to light theme with white card background', async ({
    page,
  }) => {
    const wrapper = page.locator('.cards-card-canvas__wrapper');
    await expect(wrapper).toHaveAttribute('data-theme', 'light');

    // 添加一张卡片以断言卡片背景色
    await page.locator('[data-card-title-input]').fill('Theme Card');
    await page.locator('[data-card-content-input]').fill('Theme content');
    await page.getByRole('button', { name: 'Add Card' }).click();

    const card = page.locator('[data-card-id]').first();
    await expect(card).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  });

  test('CardCanvas switches to dark theme with dark card background', async ({
    page,
  }) => {
    await page.locator('[data-card-dark-theme-toggle]').check();

    const wrapper = page.locator('.cards-card-canvas__wrapper');
    await expect(wrapper).toHaveAttribute('data-theme', 'dark');

    await page.locator('[data-card-title-input]').fill('Theme Card');
    await page.locator('[data-card-content-input]').fill('Theme content');
    await page.getByRole('button', { name: 'Add Card' }).click();

    const card = page.locator('[data-card-id]').first();
    // 深色主题下卡片背景不应再是纯白
    await expect(card).not.toHaveCSS(
      'background-color',
      'rgb(255, 255, 255)'
    );
  });

  test('Button defaults to light theme with dark filled background', async ({
    page,
  }) => {
    const addButton = page.getByRole('button', { name: 'Add Card' });
    await expect(addButton).toHaveAttribute('data-theme', 'light');
    // filled 按钮在浅色主题下背景为接近黑色的 #0f0f0f
    await expect(addButton).toHaveCSS('background-color', 'rgb(15, 15, 15)');
  });

  test('Button switches to dark theme with inverted filled background', async ({
    page,
  }) => {
    await page.locator('[data-card-dark-theme-toggle]').check();

    const addButton = page.getByRole('button', { name: 'Add Card' });
    await expect(addButton).toHaveAttribute('data-theme', 'dark');
    // 深色主题下 filled 按钮背景反转为白色
    await expect(addButton).toHaveCSS(
      'background-color',
      'rgb(255, 255, 255)'
    );
  });
});
