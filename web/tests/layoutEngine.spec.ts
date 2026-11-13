import { test, expect } from '@playwright/test';
import {
  getRingCapacity,
  computeClusterPuckRadius,
  computeClusterPositions,
  computeConduitCurve,
} from '../src/lib/layoutEngine';

test.describe('Layout Engine Deterministic Math', () => {
  test('Ring capacity matches chord distance formula', () => {
    // Ring 1: rho=1.45, capacity 7
    expect(getRingCapacity(1)).toBe(7);
    // Ring 2: rho=2.90, capacity 14
    expect(getRingCapacity(2)).toBe(14);
    // Ring 3: rho=4.35, capacity 21
    expect(getRingCapacity(3)).toBe(21);
    // Ring 4: rho=5.80, capacity 29
    expect(getRingCapacity(4)).toBe(29);
  });

  test('Cluster puck radius encloses outermost ring', () => {
    const rSmall = computeClusterPuckRadius(3); // fits in ring 1
    expect(rSmall).toBeGreaterThanOrEqual(2.5);
    expect(rSmall).toBeGreaterThanOrEqual(1.45 + 0.35 + 1.25); // >= 3.05

    const rMed = computeClusterPuckRadius(20); // requires ring 2 (7 + 13)
    expect(rMed).toBeGreaterThanOrEqual(2.90 + 0.35 + 1.25); // >= 4.50
  });

  test('All-pairs collision prevention guarantees chord clearance for all pairs', () => {
    const clusters = [
      { id: 'controllers', label: 'Controllers', file_count: 5 },
      { id: 'services', label: 'Services', file_count: 8 },
      { id: 'persistence', label: 'Persistence', file_count: 6 },
      { id: 'middleware', label: 'Middleware', file_count: 3 },
      { id: 'configuration', label: 'Config', file_count: 2 },
      { id: 'testing', label: 'Testing', file_count: 7 },
      { id: 'utilities', label: 'Utils', file_count: 2 },
      { id: 'ext:express', label: 'Express', file_count: 0 },
      { id: 'ext:sqlite3', label: 'SQLite', file_count: 0 },
    ];

    const clearance = 6.0;
    const positions = computeClusterPositions(clusters, clearance);
    expect(positions.size).toBe(9);

    const clusterArray = Array.from(positions.values());
    for (let i = 0; i < clusterArray.length; i++) {
      for (let j = i + 1; j < clusterArray.length; j++) {
        const c1 = clusterArray[i];
        const c2 = clusterArray[j];
        const dx = c1.center[0] - c2.center[0];
        const dz = c1.center[2] - c2.center[2];
        const dist = Math.sqrt(dx * dx + dz * dz);
        const minAllowed = c1.radius + c2.radius + clearance;
        expect(dist).toBeGreaterThanOrEqual(minAllowed - 1e-4);
      }
    }
  });

  test('Handles N=1 and N=2 safely', () => {
    const p1 = computeClusterPositions([{ id: 'c1', label: 'C1', file_count: 4 }]);
    expect(p1.get('c1')?.center).toEqual([0, 0, 0]);

    const p2 = computeClusterPositions([
      { id: 'c1', label: 'C1', file_count: 4 },
      { id: 'c2', label: 'C2', file_count: 4 },
    ]);
    expect(p2.size).toBe(2);
    const pos1 = p2.get('c1')!;
    const pos2 = p2.get('c2')!;
    const dx = pos1.center[0] - pos2.center[0];
    const dist = Math.abs(dx);
    expect(dist).toBeGreaterThanOrEqual(pos1.radius + pos2.radius + 6.0);
  });
});
