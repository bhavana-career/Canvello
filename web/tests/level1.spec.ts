import { test, expect } from '@playwright/test';

test.describe('Canvello Phase 3 Milestone 3.1: Level 1 Interactive 3D Canvas', () => {
  test('should verify 9 clusters, 33 conduits, hover tooltip, camera transition, and reset view', async ({ page }) => {
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

    // 2. Trigger deterministic analysis on demo/canvello-demo-express
    const analyzeButton = page.locator('button:has-text("Run Deterministic Analysis")');
    await expect(analyzeButton).toBeVisible();
    await analyzeButton.click();

    // 3. Wait for analysis completion message
    await expect(page.locator('text=Graph ready for Phase 3 visual canvas.')).toBeVisible({ timeout: 25000 });

    // 4. Verify Level 1 Overview Header & Verified Badges (9 Clusters, 33 Conduits)
    await expect(page.locator('text=Level 1: 3D Repository Overview')).toBeVisible();
    await expect(page.locator('text=9 Clusters')).toBeVisible();
    await expect(page.locator('text=33 Conduits')).toBeVisible();

    // 5. Verify R3F Canvas Mount
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();

    // 6. Verify Level 1 Base Breadcrumb
    const repoBreadcrumb = page.locator('[data-testid="breadcrumb-repo"]');
    await expect(repoBreadcrumb).toBeVisible();
    await expect(repoBreadcrumb).toContainText('Repository (Macro L1)');
    await expect(page.locator('[data-testid="reset-view-btn"]')).toHaveCount(0);

    // 7. Verify Cluster Navigator Bar has all 9 cluster pills
    const navBar = page.locator('[data-testid="cluster-navigator-bar"]');
    await expect(navBar).toBeVisible();
    await expect(page.locator('[data-testid^="cluster-btn-"]')).toHaveCount(9);

    // 8. Hover over a cluster pill (e.g. controllers) and verify tooltip appears
    const controllersBtn = page.locator('[data-testid="cluster-btn-controllers"]');
    await expect(controllersBtn).toBeVisible();
    await controllersBtn.hover();

    const hoverTooltip = page.locator('[data-testid="cluster-hover-tooltip"]');
    await expect(hoverTooltip).toBeVisible();
    await expect(hoverTooltip).toContainText('Controllers & API');
    await expect(hoverTooltip).toContainText('files • Click to focus');

    // 9. Click to trigger camera transition and enter Level 2 cluster focus
    await controllersBtn.click();
    await page.waitForTimeout(800); // Wait for easeOutCubic camera tween

    // 10. Verify Breadcrumb Transition to focused cluster
    const clusterBreadcrumb = page.locator('[data-testid="breadcrumb-cluster"]');
    await expect(clusterBreadcrumb).toBeVisible();
    await expect(clusterBreadcrumb).toContainText('Controllers & API');

    // 11. Verify Reset View Control appears
    const resetBtn = page.locator('[data-testid="reset-view-btn"]');
    await expect(resetBtn).toBeVisible();

    // 12. Click Reset View and verify return to Level 1 Repository overview
    await resetBtn.click();
    await page.waitForTimeout(800); // Wait for easeOutCubic return tween

    await expect(page.locator('[data-testid="breadcrumb-cluster"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="reset-view-btn"]')).toHaveCount(0);
    await expect(repoBreadcrumb).toBeVisible();

    // 13. Assert zero uncaught browser console errors
    expect(consoleErrors).toHaveLength(0);
  });
});
