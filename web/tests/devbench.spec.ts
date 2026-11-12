import { test, expect } from '@playwright/test';

test.describe('Canvello Phase 2 Dev Bench Verification', () => {
  test('should load page, initialize R3F WebGL, trigger analysis, and inspect selected file', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // 1. Navigate to dev bench
    await page.goto('http://localhost:3000');
    await expect(page).toHaveTitle(/Canvello/);
    await expect(page.locator('h1')).toContainText('Canvello Architecture Explorer');

    // 2. Verify R3F Canvas
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();

    // 3. Trigger analysis on demo/canvello-demo-express
    const analyzeButton = page.locator('button:has-text("Run Deterministic Analysis")');
    await expect(analyzeButton).toBeVisible();
    await analyzeButton.click();

    // 4. Wait for analysis completion message
    await expect(page.locator('text=Graph ready for Phase 3 visual canvas.')).toBeVisible({ timeout: 20000 });

    // 5. Verify Metric Badges
    await expect(page.locator('text=Level 1 Clusters')).toBeVisible();
    await expect(page.locator('text=Level 1 Conduits')).toBeVisible();
    await expect(page.locator('text=Level 2 Nodes')).toBeVisible();
    await expect(page.locator('text=Level 2 Edges')).toBeVisible();
    await expect(page.locator('text=Level 3 Ports')).toBeVisible();

    // 6. Inspect Selected File Relationships
    const selectDropdown = page.locator('select');
    await expect(selectDropdown).toBeVisible();
    await selectDropdown.selectOption('src/controllers/auth.controller.ts');

    const inspectBtn = page.locator('button:has-text("Inspect Selected File")');
    await inspectBtn.click();

    await expect(page.getByText(/^Direct Dependencies \(/)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/^Direct Dependents \(/)).toBeVisible();
    await expect(page.getByText(/^Derived Indirect Dependencies \(/)).toBeVisible();

    // Assert zero uncaught console errors
    expect(consoleErrors).toHaveLength(0);
  });
});
