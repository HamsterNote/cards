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

  test('dark theme paints the full demo page background', async ({ page }) => {
    // Given / When: demo 切换到深色主题
    await page.locator('[data-card-dark-theme-toggle]').check();

    // Then: 页面容器自身提供深色背景，不依赖 body 的浅色底色
    await expect(page.locator('.demo')).toHaveCSS(
      'background-color',
      'rgb(17, 24, 39)'
    );
  });

  test('default card colors follow theme changes without light inline overrides', async ({
    page,
  }) => {
    // Given: 在浅色主题下使用默认颜色创建卡片
    await page.locator('[data-card-title-input]').fill('Theme Card');
    await page.locator('[data-card-content-input]').fill('Theme content');
    await page.getByRole('button', { name: 'Add Card' }).click();

    // When: 已有卡片切换到深色主题
    await page.locator('[data-card-dark-theme-toggle]').check();

    // Then: 标题和正文都采用 CardCanvas 的深色主题变量
    const card = page.locator('[data-card-id]').first();
    await expect(card.locator('.cards-card-canvas__card-header')).toHaveCSS(
      'background-color',
      'rgb(55, 65, 81)'
    );
    await expect(
      card.locator('.cards-card-canvas__card-content')
    ).not.toHaveCSS('background-color', 'rgb(255, 255, 255)');
  });

  test('dark card header color does not inherit a dark host color', async ({
    page,
  }) => {
    // Given: 深色 CardCanvas 位于一个使用深色文字的宿主页面中
    await page.locator('[data-card-title-input]').fill('Theme Card');
    await page.locator('[data-card-content-input]').fill('Theme content');
    await page.getByRole('button', { name: 'Add Card' }).click();
    await page.locator('[data-card-dark-theme-toggle]').check();
    await page.locator('.demo').evaluate((element) => {
      element.style.color = '#0f0f0f';
    });

    // Then: 标题仍由组件主题提供可读的浅色前景色
    const header = page
      .locator('[data-card-id]')
      .first()
      .locator('.cards-card-canvas__card-header');
    await expect(header).toHaveCSS('color', 'rgb(229, 231, 235)');
  });

  test('custom card colors remain explicit theme overrides', async ({
    page,
  }) => {
    // Given: 用户明确选择自定义标题和正文背景色
    await page.locator('[data-card-title-bg-input]').fill('#123456');
    await page.locator('[data-card-content-bg-input]').fill('#654321');
    await page.locator('[data-card-title-input]').fill('Custom Card');
    await page.locator('[data-card-content-input]').fill('Custom content');

    // When: 创建卡片并切换到深色主题
    await page.getByRole('button', { name: 'Add Card' }).click();
    await page.locator('[data-card-dark-theme-toggle]').check();

    // Then: 明确选择的自定义色继续覆盖主题默认值
    const card = page.locator('[data-card-id]').first();
    await expect(card.locator('.cards-card-canvas__card-header')).toHaveCSS(
      'background-color',
      'rgb(18, 52, 86)'
    );
    await expect(card.locator('.cards-card-canvas__card-content')).toHaveCSS(
      'background-color',
      'rgb(101, 67, 33)'
    );
  });

  test('CardCanvas stage stays inside a narrow viewport', async ({ page }) => {
    // Given: demo 运行在常见手机宽度
    await page.setViewportSize({ width: 375, height: 812 });

    // When: 用户首次查看 CardCanvas demo
    const stage = page.locator('.card-canvas-demo-stage');

    // Then: 画布区域不会被固定宽度设置栏横向挤出视口
    const box = await stage.boundingBox();
    expect(box).not.toBeNull();
    expect(box?.x).toBeGreaterThanOrEqual(0);
    expect(box?.width).toBeGreaterThanOrEqual(240);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(375);
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
