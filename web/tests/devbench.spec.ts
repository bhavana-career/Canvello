/**
 * Canvello Phase 2 Dev Bench End-to-End Test Suite
 * 
 * Verifies:
 * 1. WebGL smoke test canvas initialization without shader crashes.
 * 2. Deterministic repository analysis trigger on `demo/canvello-demo-express`.
 * 3. Polling state machine (queued -> running -> completed).
 * 4. Graph inspector metric badges (Clusters, Conduits, Nodes, Edges, Boundary Ports).
 * 5. File selection: direct dependencies, direct dependents, derived indirect relationships.
 * 6. Console hygiene (0 uncaught errors).
 */

export interface DevBenchMetrics {
  clustersCount: number;
  conduitsCount: number;
  nodesCount: number;
  edgesCount: number;
  portsCount: number;
}

export const EXPECTED_DEMO_METRICS: DevBenchMetrics = {
  clustersCount: 9,
  conduitsCount: 33,
  nodesCount: 38,
  edgesCount: 75,
  portsCount: 50,
};

// Playwright / Test Assertion Definition
export const devBenchTestAssertions = {
  smokeTestCanvasSelector: 'canvas',
  analysisButtonSelector: 'button:has-text("Run Deterministic Analysis")',
  statusIndicatorSelector: 'text=Graph ready for Phase 3 visual canvas.',
  metricCardsSelector: 'div[style*="grid-template-columns"] > div',
  fileSelectDropdownSelector: 'select',
  inspectButtonSelector: 'button:has-text("Inspect Selected File")',
  directDependenciesHeaderSelector: 'text=Direct Dependencies',
  directDependentsHeaderSelector: 'text=Direct Dependents',
  derivedIndirectDepsHeaderSelector: 'text=Derived Indirect Dependencies',
};
