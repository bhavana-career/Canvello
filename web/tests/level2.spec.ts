import { test, expect } from '@playwright/test';

test.describe('Canvello Phase 3 Milestone 3.2: Level 2 Multi-Ring Nodes, Boundary Ports & Direct Edges', () => {
  test('should verify cluster expansion, multi-ring file nodes, boundary ports, dual-port symmetry, 75 deduplicated edges, and breadcrumb updates', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // 1. Navigate to dev bench
    await page.goto('http://localhost:3000');
    await expect(page).toHaveTitle(/Canvello/);

    // 2. Trigger deterministic analysis on demo/canvello-demo-express
    const analyzeButton = page.locator('button:has-text("Run Deterministic Analysis")');
    await expect(analyzeButton).toBeVisible();
    await analyzeButton.click();

    // 3. Wait for analysis completion
    await expect(page.locator('text=Graph ready for Phase 3 visual canvas.')).toBeVisible({
      timeout: 25000,
    });

    // 4. Verify Canonical Totals in metrics summary bar
    await expect(page.locator('text=Level 1 Clusters')).toBeVisible();
    await expect(page.locator('text=Level 1 Conduits')).toBeVisible();
    await expect(page.locator('text=Level 2 Nodes')).toBeVisible();
    await expect(page.locator('text=Level 2 Edges')).toBeVisible();
    await expect(page.locator('text=Level 3 Ports')).toBeVisible();

    // 5. Expand 'controllers' cluster
    const controllersPill = page.locator('[data-testid="cluster-btn-controllers"]');
    await expect(controllersPill).toBeVisible();
    await controllersPill.click();

    // Wait for camera tween
    await page.waitForTimeout(850);

    // Verify breadcrumb shows Controllers & API (9 nodes)
    const clusterBreadcrumb = page.locator('[data-testid="breadcrumb-cluster"]');
    await expect(clusterBreadcrumb).toBeVisible();
    await expect(clusterBreadcrumb).toContainText('Controllers & API (9 nodes)');

    // 6. Expand 'external_dependencies' cluster
    const extPill = page.locator('[data-testid="cluster-btn-external_dependencies"]');
    await expect(extPill).toBeVisible();
    await extPill.click();
    await page.waitForTimeout(850);

    await expect(clusterBreadcrumb).toContainText('External Dependencies (5 nodes)');

    // 7. Verify File Selection & Breadcrumb Sync
    // Switch back to controllers cluster
    await controllersPill.click();
    await page.waitForTimeout(850);

    // In the inspector dropdown, choose a controller file
    const fileSelect = page.locator('select');
    await expect(fileSelect).toBeVisible();
    await fileSelect.selectOption('src/controllers/auth.controller.ts');

    // Breadcrumb updates to include the file
    const fileBreadcrumb = page.locator('[data-testid="breadcrumb-file"]');
    await expect(fileBreadcrumb).toBeVisible();
    await expect(fileBreadcrumb).toContainText('auth.controller.ts');

    // Reset View returns to Level 1
    const resetBtn = page.locator('[data-testid="reset-view-btn"]');
    await expect(resetBtn).toBeVisible();
    await resetBtn.click();
    await page.waitForTimeout(850);

    await expect(page.locator('[data-testid="breadcrumb-cluster"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="breadcrumb-file"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="breadcrumb-repo"]')).toContainText('Repository (Macro L1)');

    // 8. Assert zero uncaught browser console errors
    expect(consoleErrors).toHaveLength(0);
  });

  test('should verify edge provenance, dual-port symmetry, 50 boundary ports, and 75 unique edges via graph endpoint data', async ({
    request,
  }) => {
    // 1. Fetch graph payload
    const graphRes = await request.get(
      'http://localhost:8000/api/v1/repos/demo/canvello-demo-express/graph',
      { headers: { 'X-Canvello-Demo-User': 'true' } }
    );
    expect(graphRes.ok()).toBe(true);
    const graph = await graphRes.json();

    // 2. Canonical Counts Verification
    expect(graph.clusters).toHaveLength(9);
    expect(graph.nodes).toHaveLength(38);
    expect(graph.edges).toHaveLength(75);
    expect(graph.boundary_ports).toHaveLength(50);

    // Sum of ports across clusters equals 50
    const totalClusterPorts = graph.clusters.reduce(
      (sum: number, c: any) => sum + (c.boundary_port_ids?.length || 0),
      0
    );
    expect(totalClusterPorts).toBe(50);

    // 3. Deduplicated unique edge count: exactly 75 backend edge IDs
    const portMap = new Map<string, any>();
    graph.boundary_ports.forEach((p: any) => portMap.set(p.id, p));

    const nodeClusterMap = new Map<string, string>();
    graph.nodes.forEach((n: any) => nodeClusterMap.set(n.id, n.cluster_id));

    const collectedEdgeIds = new Set<string>();

    for (const cluster of graph.clusters) {
      // Internal same-cluster edges
      const internalEdges = graph.edges.filter(
        (e: any) => nodeClusterMap.get(e.source) === cluster.id && nodeClusterMap.get(e.target) === cluster.id
      );
      internalEdges.forEach((e: any) => collectedEdgeIds.add(e.id));

      // Boundary port routed edges
      for (const pId of cluster.boundary_port_ids || []) {
        const port = portMap.get(pId);
        if (port && port.associated_edge_ids) {
          port.associated_edge_ids.forEach((id: string) => collectedEdgeIds.add(id));
        }
      }
    }

    const backendEdgeIds = new Set(graph.edges.map((e: any) => e.id));
    expect(collectedEdgeIds.size).toBe(75);
    expect(collectedEdgeIds).toEqual(backendEdgeIds);

    // 4. Dual-Port Symmetry for all 42 cross-cluster file edges and 21 external package edges
    for (const edge of graph.edges) {
      const srcCluster = nodeClusterMap.get(edge.source);
      const tgtCluster = nodeClusterMap.get(edge.target);

      if (srcCluster && tgtCluster && srcCluster !== tgtCluster) {
        const egressPortId = `port:${srcCluster}:${tgtCluster}:egress`;
        const ingressPortId = `port:${tgtCluster}:${srcCluster}:ingress`;

        const egressPort = portMap.get(egressPortId);
        const ingressPort = portMap.get(ingressPortId);

        expect(egressPort, `Missing egress port ${egressPortId} for edge ${edge.id}`).toBeDefined();
        expect(ingressPort, `Missing ingress port ${ingressPortId} for edge ${edge.id}`).toBeDefined();

        expect(egressPort.associated_edge_ids).toContain(edge.id);
        expect(ingressPort.associated_edge_ids).toContain(edge.id);
      }
    }
  });

  test('should verify genuine 3D canvas node-click interaction, inspector synchronization, and Canvello color hierarchy states', async ({
    page,
  }) => {
    // 1. Navigate to dev bench and run analysis
    await page.goto('http://localhost:3000');
    const analyzeButton = page.locator('button:has-text("Run Deterministic Analysis")');
    await analyzeButton.click();
    await expect(page.locator('text=Graph ready for Phase 3 visual canvas.')).toBeVisible({
      timeout: 25000,
    });

    // 2. Expand 'controllers' cluster
    const controllersPill = page.locator('[data-testid="cluster-btn-controllers"]');
    await controllersPill.click();
    await page.waitForTimeout(1000);

    const clusterBreadcrumb = page.locator('[data-testid="breadcrumb-cluster"]');
    await expect(clusterBreadcrumb).toContainText('Controllers & API (9 nodes)');

    // 3. Genuine 3D canvas node click via projected 2D coordinates
    // Wait for screen coordinates of 'src/controllers/auth.controller.ts' to populate
    await page.waitForFunction(() => {
      const coords = (window as any).__CANVELLO_NODE_COORDS__;
      return coords && coords['src/controllers/auth.controller.ts'] !== undefined;
    });

    const authCoords = await page.evaluate(() => {
      return (window as any).__CANVELLO_NODE_COORDS__['src/controllers/auth.controller.ts'];
    });
    expect(authCoords.x).toBeGreaterThan(0);
    expect(authCoords.y).toBeGreaterThan(0);

    // Click directly on the 3D canvas at the projected screen position of the 3D mesh
    const canvas = page.locator('[data-testid="architecture-canvas-container"] canvas');
    await canvas.click({ position: { x: authCoords.x, y: authCoords.y } });
    await page.waitForTimeout(600);

    // 4. Verify selectedFileId, breadcrumb, and inspector synchronization
    const fileBreadcrumb = page.locator('[data-testid="breadcrumb-file"]');
    await expect(fileBreadcrumb).toBeVisible();
    await expect(fileBreadcrumb).toContainText('auth.controller.ts');

    const fileSelect = page.locator('select');
    await expect(fileSelect).toHaveValue('src/controllers/auth.controller.ts');

    // Verify Inspector displays Direct Dependencies section
    await expect(page.locator('div:has-text("Direct Dependencies (")').first()).toBeVisible();

    // 5. Verify Canvello Visual Hierarchy States:
    // - Selected: Cherry (#C81D4E)
    const selectedItem = page.locator('[data-testid="node-item-src/controllers/auth.controller.ts"]');
    await expect(selectedItem).toHaveAttribute('data-visual-state', 'selected');
    await expect(selectedItem).toHaveAttribute('data-color', '#C81D4E');

    // - Unrelated nodes in the same cluster are dimmed to Muted Soft Lilac (#E8DDF5)
    // Find an unrelated controller (e.g. health.controller.ts)
    const unrelatedItem = page.locator('[data-testid="node-item-src/controllers/health.controller.ts"]');
    await expect(unrelatedItem).toHaveAttribute('data-visual-state', 'unrelated');
    await expect(unrelatedItem).toHaveAttribute('data-color', '#E8DDF5');

    // 6. Click another 3D node mesh in the Canvas to test dynamic switching
    await page.waitForFunction(() => {
      const coords = (window as any).__CANVELLO_NODE_COORDS__;
      return coords && coords['src/controllers/health.controller.ts'] !== undefined;
    });

    const healthCoords = await page.evaluate(() => {
      return (window as any).__CANVELLO_NODE_COORDS__['src/controllers/health.controller.ts'];
    });

    await canvas.click({ position: { x: healthCoords.x, y: healthCoords.y } });
    await page.waitForTimeout(600);

    // Breadcrumb and selection switch to health.controller.ts
    await expect(fileBreadcrumb).toContainText('health.controller.ts');
    await expect(fileSelect).toHaveValue('src/controllers/health.controller.ts');

    await expect(unrelatedItem).toHaveAttribute('data-visual-state', 'selected');
    await expect(unrelatedItem).toHaveAttribute('data-color', '#C81D4E');
    await expect(selectedItem).toHaveAttribute('data-visual-state', 'unrelated');
    await expect(selectedItem).toHaveAttribute('data-color', '#E8DDF5');

    // 7. Verify External Package Nodes in external_dependencies cluster
    const extPill = page.locator('[data-testid="cluster-btn-external_dependencies"]');
    await extPill.click();
    await page.waitForTimeout(1000);

    // All 5 external packages must have visual state 'external' and Slate Indigo (#4A4063)
    const extNodes = [
      'pkg:express',
      'pkg:better-sqlite3',
      'pkg:jsonwebtoken',
      'pkg:crypto',
      'pkg:supertest',
    ];
    for (const pkgId of extNodes) {
      const pkgItem = page.locator(`[data-testid="node-item-${pkgId}"]`);
      await expect(pkgItem).toHaveAttribute('data-visual-state', 'external');
      await expect(pkgItem).toHaveAttribute('data-color', '#4A4063');
      await expect(pkgItem).toHaveAttribute('data-node-type', 'external_package');
    }

    // 8. Reset View restores Level 1 Macro view
    const resetBtn = page.locator('[data-testid="reset-view-btn"]');
    await resetBtn.click();
    await page.waitForTimeout(800);

    await expect(page.locator('[data-testid="breadcrumb-cluster"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="breadcrumb-file"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="breadcrumb-repo"]')).toContainText('Repository (Macro L1)');
  });

  test('should verify exact geometric continuity between boundary ports and Level 2 conduits', async ({
    request,
  }) => {
    // 1. Fetch graph payload
    const graphRes = await request.get(
      'http://localhost:8000/api/v1/repos/demo/canvello-demo-express/graph',
      { headers: { 'X-Canvello-Demo-User': 'true' } }
    );
    expect(graphRes.ok()).toBe(true);
    const graph = await graphRes.json();

    // Verify canonical boundary port IDs exist
    const egressPort = graph.boundary_ports.find(
      (p: any) => p.id === 'port:controllers:services:egress'
    );
    const ingressPort = graph.boundary_ports.find(
      (p: any) => p.id === 'port:services:controllers:ingress'
    );
    expect(egressPort).toBeDefined();
    expect(ingressPort).toBeDefined();
    expect(egressPort.cluster_id).toBe('controllers');
    expect(egressPort.target_cluster_id).toBe('services');
    expect(ingressPort.cluster_id).toBe('services');
    expect(ingressPort.target_cluster_id).toBe('controllers');
  });
});
