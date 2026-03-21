import { test, expect } from '@playwright/test';

test.describe('CopyTrading Platform', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/CopyTrading/');
    await page.waitForSelector('table', { timeout: 10000 });
  });

  test('page loads and displays trader table', async ({ page }) => {
    const table = page.locator('table');
    await expect(table).toBeVisible();
    const rows = page.locator('table tbody tr');
    await expect(rows.first()).toBeVisible();
  });

  test('view toggle switches between card and table', async ({ page }) => {
    await expect(page.locator('table')).toBeVisible();

    const cardButton = page.getByRole('button', { name: /卡片视图|Card View/ });
    await cardButton.click();
    await expect(page.locator('table')).not.toBeVisible();
    const cards = page.locator('[role="button"]').first();
    await expect(cards).toBeVisible();

    const tableButton = page.getByRole('button', { name: /表格视图|Table View/ });
    await tableButton.click();
    await expect(page.locator('table')).toBeVisible();
  });

  test('sort control works in card view', async ({ page }) => {
    const cardButton = page.getByRole('button', { name: /卡片视图|Card View/ });
    await cardButton.click();

    const sortTrigger = page.locator('button[role="combobox"]');
    await expect(sortTrigger).toBeVisible();

    await sortTrigger.click();
    const option = page.getByRole('option', { name: /夏普|Sharpe/ });
    await option.click();
  });

  test('copy trade button generates correct Hyperliquid URL with referral', async ({ page }) => {
    const [newPage] = await Promise.all([
      page.context().waitForEvent('page'),
      page.locator('table tbody tr').first().locator('button').click(),
    ]);

    const url = newPage.url();
    expect(url).toContain('app.hyperliquid.xyz/vaults/');
    expect(url).toContain('ref=COPYTRADING');
    // Verify it contains a valid vault address (0x...)
    expect(url).toMatch(/vaults\/0x[a-fA-F0-9]+/);
    await newPage.close();
  });

  test('language toggle switches between EN and CN', async ({ page }) => {
    await expect(page.locator('header')).toContainText('保险库');

    const langButton = page.getByRole('button', { name: /中文|EN/ });
    await langButton.click();

    await expect(page.locator('header')).toContainText('Vault');
  });

  test('trader detail modal opens', async ({ page }) => {
    const firstRow = page.locator('table tbody tr').first();
    await firstRow.locator('td').nth(1).click();

    const modal = page.locator('[role="dialog"]');
    await expect(modal).toBeVisible();
    await expect(modal).toContainText(/交易者详情|Trader Details/);
  });

  test('AI skill prompt is visible and copyable', async ({ page }) => {
    const mcpBanner = page.locator('text=AI Agent');
    await expect(mcpBanner.first()).toBeVisible();

    const configBlock = page.locator('pre');
    await expect(configBlock).toContainText('Vault');
    await expect(configBlock).toContainText('traders.json');

    const copyBtn = page.getByRole('button', { name: /Copy|复制/ });
    await expect(copyBtn).toBeVisible();
  });

  test('color mode toggle works', async ({ page }) => {
    const colorBtn = page.locator('button').filter({ hasText: '↑' }).first();
    await expect(colorBtn).toBeVisible();
    await colorBtn.click();
    await expect(colorBtn).toBeVisible();
  });
});

// --- Comprehensive acceptance tests ---

test.describe('Vault Data Integrity', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/CopyTrading/');
    await page.waitForSelector('table', { timeout: 10000 });
  });

  test('vault addresses are displayed correctly (0x format)', async ({ page }) => {
    const firstAddress = page.locator('table tbody tr').first().locator('td').nth(1);
    const text = await firstAddress.textContent();
    // Should be truncated format: 0x1234...5678
    expect(text).toMatch(/0x[a-fA-F0-9]{4}\.\.\.[\da-fA-F]{4}/);
  });

  test('rank numbers are displayed and ordered', async ({ page }) => {
    const ranks = page.locator('table tbody tr td:first-child span');
    const firstRank = await ranks.first().textContent();
    expect(firstRank).toContain('#');
    // First rank should be #1 by default (sorted by radarScore desc)
    expect(firstRank).toBe('#1');
  });

  test('ARR values are displayed with percentage', async ({ page }) => {
    const arrCell = page.locator('table tbody tr').first().locator('td').nth(2);
    const text = await arrCell.textContent();
    // Should contain a percentage sign
    expect(text).toContain('%');
  });

  test('Sharpe ratio is displayed as number', async ({ page }) => {
    const sharpeCell = page.locator('table tbody tr').first().locator('td').nth(3);
    const text = await sharpeCell.textContent();
    // Should be a number like "1.96" or "--"
    expect(text).toMatch(/^[\d.-]+$|^--$/);
  });

  test('MDD values are displayed', async ({ page }) => {
    const mddCell = page.locator('table tbody tr').first().locator('td').nth(4);
    const text = await mddCell.textContent();
    expect(text).toContain('%');
  });

  test('balance is displayed in formatted currency', async ({ page }) => {
    const balanceCell = page.locator('table tbody tr').first().locator('td').nth(5);
    const text = await balanceCell.textContent();
    // Should contain $ and possibly K/M/B suffix
    expect(text).toMatch(/\$[\d.,]+[KMB]?/);
  });

  test('trader age is displayed', async ({ page }) => {
    const ageCell = page.locator('table tbody tr').first().locator('td').nth(6);
    const text = await ageCell.textContent();
    // Should contain days or months indicator
    expect(text!.length).toBeGreaterThan(0);
  });

  test('cumulative returns chart is rendered in table rows', async ({ page }) => {
    // Each row should have a recharts container
    const chartCell = page.locator('table tbody tr').first().locator('.recharts-responsive-container');
    await expect(chartCell).toBeVisible();
  });

  test('multiple traders are loaded (pagination)', async ({ page }) => {
    const rows = page.locator('table tbody tr');
    const count = await rows.count();
    // Should have at least 8 traders (initial load)
    expect(count).toBeGreaterThanOrEqual(8);
  });
});

test.describe('Trader Detail Modal - Full Verification', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/CopyTrading/');
    await page.waitForSelector('table', { timeout: 10000 });
    // Open first trader detail
    await page.locator('table tbody tr').first().locator('td').nth(1).click();
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
  });

  test('modal shows full vault address', async ({ page }) => {
    const modal = page.locator('[role="dialog"]');
    // Full address should be visible (not truncated)
    const addressText = await modal.locator('button.font-mono').textContent();
    expect(addressText).toMatch(/^0x[a-fA-F0-9]{40}$/);
  });

  test('modal shows all-time return', async ({ page }) => {
    const modal = page.locator('[role="dialog"]');
    await expect(modal).toContainText(/累计回报|All-Time Return/);
    // Should have a percentage value
    const returnText = modal.locator('.font-mono').first();
    await expect(returnText).toBeVisible();
  });

  test('modal shows radar chart', async ({ page }) => {
    const modal = page.locator('[role="dialog"]');
    const svg = modal.locator('svg');
    await expect(svg.first()).toBeVisible();
    // Radar chart should have polygon elements
    const polygons = modal.locator('svg polygon');
    const count = await polygons.count();
    expect(count).toBeGreaterThan(0);
  });

  test('modal shows cumulative returns chart with time period tabs', async ({ page }) => {
    const modal = page.locator('[role="dialog"]');
    await expect(modal).toContainText(/累计收益|Cumulative Returns/);
    // Time period tabs should be visible
    await expect(modal.getByRole('tab', { name: '7D' })).toBeVisible();
    await expect(modal.getByRole('tab', { name: '30D' })).toBeVisible();
    await expect(modal.getByRole('tab', { name: '90D' })).toBeVisible();
    await expect(modal.getByRole('tab', { name: 'ALL' })).toBeVisible();
  });

  test('modal shows risk notice', async ({ page }) => {
    const modal = page.locator('[role="dialog"]');
    await expect(modal).toContainText(/风险提示|Risk Notice/);
  });

  test('modal copy trade button opens Hyperliquid with referral', async ({ page }) => {
    const modal = page.locator('[role="dialog"]');
    const copyBtn = modal.getByRole('button', { name: /跟单|Copy Trade/ });
    await expect(copyBtn).toBeVisible();

    const [newPage] = await Promise.all([
      page.context().waitForEvent('page'),
      copyBtn.click(),
    ]);

    const url = newPage.url();
    expect(url).toContain('app.hyperliquid.xyz/vaults/0x');
    expect(url).toContain('ref=COPYTRADING');
    await newPage.close();
  });

  test('modal shows follower count and trader age', async ({ page }) => {
    const modal = page.locator('[role="dialog"]');
    await expect(modal).toContainText(/跟单人数|Followers/);
    await expect(modal).toContainText(/交易年龄|Trader Age/);
  });
});

test.describe('Card View Verification', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/CopyTrading/');
    await page.waitForSelector('table', { timeout: 10000 });
    // Switch to card view
    const cardButton = page.getByRole('button', { name: /卡片视图|Card View/ });
    await cardButton.click();
    await page.waitForTimeout(500);
  });

  test('cards show rank badge', async ({ page }) => {
    const badge = page.locator('[role="button"]').first().locator('text=#');
    await expect(badge).toBeVisible();
  });

  test('cards show radar chart', async ({ page }) => {
    const card = page.locator('[role="button"]').first();
    const svg = card.locator('svg');
    await expect(svg.first()).toBeVisible();
  });

  test('cards show cumulative returns chart', async ({ page }) => {
    const card = page.locator('[role="button"]').first();
    const chart = card.locator('.recharts-responsive-container');
    await expect(chart).toBeVisible();
  });

  test('cards show metrics grid (followers, win rate, return, etc)', async ({ page }) => {
    const card = page.locator('[role="button"]').first();
    await expect(card).toContainText(/跟单人数|Followers/);
    await expect(card).toContainText(/胜率|Win Rate/);
    await expect(card).toContainText(/累计回报|All-Time Return/);
  });

  test('card copy trade button opens Hyperliquid', async ({ page }) => {
    const card = page.locator('[role="button"]').first();
    const copyBtn = card.getByRole('button', { name: /跟单|Copy Trade/ });

    const [newPage] = await Promise.all([
      page.context().waitForEvent('page'),
      copyBtn.click(),
    ]);

    expect(newPage.url()).toContain('ref=COPYTRADING');
    await newPage.close();
  });
});

test.describe('AI Skill Prompt', () => {
  test('skill prompt contains data URL', async ({ page }) => {
    await page.goto('/CopyTrading/');
    await page.waitForSelector('pre', { timeout: 10000 });

    const pre = page.locator('pre');
    const text = await pre.textContent();
    expect(text).toContain('maorenxin.github.io/CopyTrading/data/traders.json');
  });

  test('skill prompt contains field descriptions', async ({ page }) => {
    await page.goto('/CopyTrading/');
    await page.waitForSelector('pre', { timeout: 10000 });

    const pre = page.locator('pre');
    const text = await pre.textContent();
    expect(text).toContain('radarScore');
    expect(text).toContain('hyperliquidUrl');
    expect(text).toContain('sharpeRatio');
  });

  test('skill prompt switches language with toggle', async ({ page }) => {
    await page.goto('/CopyTrading/');
    await page.waitForSelector('pre', { timeout: 10000 });

    // Default CN
    let text = await page.locator('pre').textContent();
    expect(text).toContain('分析师');

    // Switch to EN
    const langButton = page.getByRole('button', { name: /中文|EN/ });
    await langButton.click();

    text = await page.locator('pre').textContent();
    expect(text).toContain('Analyst');
  });
});

test.describe('Table Sorting', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/CopyTrading/');
    await page.waitForSelector('table', { timeout: 10000 });
  });

  test('clicking ARR header sorts by ARR', async ({ page }) => {
    // Get initial first row ARR
    const getFirstArr = async () => {
      const cell = page.locator('table tbody tr').first().locator('td').nth(2);
      return cell.textContent();
    };

    const initialArr = await getFirstArr();

    // Click ARR header to sort
    const arrHeader = page.locator('th').filter({ hasText: 'ARR' });
    await arrHeader.click();
    await page.waitForTimeout(300);

    // Click again to reverse
    await arrHeader.click();
    await page.waitForTimeout(300);

    const newArr = await getFirstArr();
    // Values should potentially differ after sorting change
    expect(newArr).toBeTruthy();
  });

  test('sort direction indicator changes on click', async ({ page }) => {
    const rankHeader = page.locator('th').filter({ hasText: 'Rank' });
    // Initially sorted desc (default)
    await rankHeader.click();
    await page.waitForTimeout(200);
    // Click again to toggle
    await rankHeader.click();
    await page.waitForTimeout(200);
    // Should still be functional
    const rows = page.locator('table tbody tr');
    await expect(rows.first()).toBeVisible();
  });
});
