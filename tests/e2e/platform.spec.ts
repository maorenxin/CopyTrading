import { test, expect } from '@playwright/test';

test.describe('CopyTrading Platform', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/CopyTrading/');
    // Wait for traders to load
    await page.waitForSelector('table', { timeout: 10000 });
  });

  test('page loads and displays trader table', async ({ page }) => {
    // Default view is table
    const table = page.locator('table');
    await expect(table).toBeVisible();
    // Should have at least one data row
    const rows = page.locator('table tbody tr');
    await expect(rows.first()).toBeVisible();
  });

  test('view toggle switches between card and table', async ({ page }) => {
    // Default is table view
    await expect(page.locator('table')).toBeVisible();

    // Switch to card view
    const cardButton = page.getByRole('button', { name: /卡片视图|Card View/ });
    await cardButton.click();

    // Table should be gone, cards should appear
    await expect(page.locator('table')).not.toBeVisible();
    // Cards are rendered as divs with role="button"
    const cards = page.locator('[role="button"]').first();
    await expect(cards).toBeVisible();

    // Switch back to table
    const tableButton = page.getByRole('button', { name: /表格视图|Table View/ });
    await tableButton.click();
    await expect(page.locator('table')).toBeVisible();
  });

  test('sort control works in card view', async ({ page }) => {
    // Switch to card view
    const cardButton = page.getByRole('button', { name: /卡片视图|Card View/ });
    await cardButton.click();

    // Sort dropdown should be visible
    const sortTrigger = page.locator('button[role="combobox"]');
    await expect(sortTrigger).toBeVisible();

    // Click sort and select a different option
    await sortTrigger.click();
    const option = page.getByRole('option', { name: /夏普|Sharpe/ });
    await option.click();
  });

  test('copy trade button generates correct Hyperliquid URL', async ({ page }) => {
    // Listen for new tab/window
    const [newPage] = await Promise.all([
      page.context().waitForEvent('page'),
      // Click the first copy trade button in the table
      page.locator('table tbody tr').first().locator('button').click(),
    ]);

    const url = newPage.url();
    expect(url).toContain('app.hyperliquid.xyz/vaults/');
    expect(url).toContain('ref=COPYTRADING');
    await newPage.close();
  });

  test('language toggle switches between EN and CN', async ({ page }) => {
    // Default is CN — header should have Chinese text
    await expect(page.locator('header')).toContainText('保险库');

    // Click language toggle
    const langButton = page.getByRole('button', { name: /中文|EN/ });
    await langButton.click();

    // Should now show English
    await expect(page.locator('header')).toContainText('Vault');
  });

  test('trader detail modal opens', async ({ page }) => {
    // Click on a table row (not the copy trade button)
    const firstRow = page.locator('table tbody tr').first();
    // Click on the address cell (second column)
    await firstRow.locator('td').nth(1).click();

    // Sheet modal should appear
    const modal = page.locator('[role="dialog"]');
    await expect(modal).toBeVisible();
    await expect(modal).toContainText(/交易者详情|Trader Details/);
  });

  test('AI skill prompt is visible and copyable', async ({ page }) => {
    // AI skill banner should be visible
    const mcpBanner = page.locator('text=AI Agent');
    await expect(mcpBanner.first()).toBeVisible();

    // Skill prompt should contain key content
    const configBlock = page.locator('pre');
    await expect(configBlock).toContainText('Vault');
    await expect(configBlock).toContainText('traders.json');

    // Copy button should exist
    const copyBtn = page.getByRole('button', { name: /Copy|复制/ });
    await expect(copyBtn).toBeVisible();
  });

  test('color mode toggle works', async ({ page }) => {
    // Find the color mode switcher (has ↑/↓ arrows)
    const colorBtn = page.locator('button').filter({ hasText: '↑' }).first();
    await expect(colorBtn).toBeVisible();

    // Click it — should toggle without errors
    await colorBtn.click();
    // Still visible after toggle
    await expect(colorBtn).toBeVisible();
  });
});
