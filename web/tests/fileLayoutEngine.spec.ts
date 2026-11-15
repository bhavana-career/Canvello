import { test, expect } from '@playwright/test';
import {
  getRingCapacity,
  getOutermostOccupiedRing,
  computeClusterPuckRadius,
  computeNodePositionsInCluster,
  computeBoundaryPortPositions,
  computeClusterPositions,
  computeConduitCurve,
  NODE_RADIUS,
  NODE_SPACING_S,
  DELTA_RHO,
  PORT_SPHERE_RADIUS,
  PORT_SPACING_S,
} from '../src/lib/layoutEngine';

test.describe('Level 2 Multi-Ring Layout & Single-Orbit Boundary Port Math', () => {
  test('Ring capacity formula matches chord constraints and sequential capacity is never exceeded', () => {
    // Exact chord capacity formula
    expect(getRingCapacity(1)).toBe(7);
    expect(getRingCapacity(2)).toBe(14);
    expect(getRingCapacity(3)).toBe(21);
    expect(getRingCapacity(4)).toBe(29);

    // Verify sequential assignment for node counts M in 1..50
    for (let M = 1; M <= 50; M++) {
      const dummyNodes = Array.from({ length: M }, (_, i) => ({
        id: `node_${String(i).padStart(3, '0')}.ts`,
        cluster_id: 'test_cluster',
        loc: 50,
      }));

      const positions = computeNodePositionsInCluster([0, 0, 0], dummyNodes);
      expect(positions.size).toBe(M);

      // Verify that no ring k exceeds C_k
      const ringCounts = new Map<number, number>();
      for (const node of positions.values()) {
        ringCounts.set(node.ringIndex, (ringCounts.get(node.ringIndex) || 0) + 1);
      }

      for (const [k, count] of ringCounts.entries()) {
        expect(count).toBeLessThanOrEqual(getRingCapacity(k));
      }
    }
  });

  test('File node lateral clearance: all-pairs on same ring and between rings', () => {
    // 25 nodes (occupies Ring 1, 2, and 3)
    const dummyNodes = Array.from({ length: 25 }, (_, i) => ({
      id: `file_${String(i).padStart(2, '0')}.ts`,
      cluster_id: 'test_cluster',
      loc: 100,
    }));

    const positions = computeNodePositionsInCluster([10, 0, 20], dummyNodes);
    const posArray = Array.from(positions.values());

    for (let i = 0; i < posArray.length; i++) {
      for (let j = i + 1; j < posArray.length; j++) {
        const n1 = posArray[i];
        const n2 = posArray[j];

        const dx = n1.position[0] - n2.position[0];
        const dz = n1.position[2] - n2.position[2];
        const distXZ = Math.sqrt(dx * dx + dz * dz);

        if (n1.ringIndex === n2.ringIndex) {
          // Same ring: chord distance >= 1.25, wall gap >= 0.55
          expect(distXZ).toBeGreaterThanOrEqual(NODE_SPACING_S - 1e-4);
          const gap = distXZ - 2 * NODE_RADIUS;
          expect(gap).toBeGreaterThanOrEqual(0.55 - 1e-4);
        } else {
          // Different rings: distance >= delta_rho = 1.45, wall gap >= 0.75
          expect(distXZ).toBeGreaterThanOrEqual(DELTA_RHO - 1e-4);
          const gap = distXZ - 2 * NODE_RADIUS;
          expect(gap).toBeGreaterThanOrEqual(0.75 - 1e-4);
        }
      }
    }
  });

  test('External dependencies cluster: 5 package nodes occupy Ring 1 and puck encloses with margin', () => {
    const extPackages = [
      { id: 'pkg:express', cluster_id: 'external_dependencies', node_type: 'external_package' },
      { id: 'pkg:better-sqlite3', cluster_id: 'external_dependencies', node_type: 'external_package' },
      { id: 'pkg:jsonwebtoken', cluster_id: 'external_dependencies', node_type: 'external_package' },
      { id: 'pkg:crypto', cluster_id: 'external_dependencies', node_type: 'external_package' },
      { id: 'pkg:supertest', cluster_id: 'external_dependencies', node_type: 'external_package' },
    ];

    expect(getOutermostOccupiedRing(5)).toBe(1);

    const puckR = computeClusterPuckRadius(5);
    // Outermost ring is 1 * 1.45. Enclosure = (1 * 1.45) + 0.35 + 1.25 = 3.05
    expect(puckR).toBeGreaterThanOrEqual(3.05);

    const positions = computeNodePositionsInCluster([0, 0, 0], extPackages);
    expect(positions.size).toBe(5);

    for (const node of positions.values()) {
      expect(node.ringIndex).toBe(1);
      expect(node.nodeType).toBe('external_package');
      expect(node.height).toBe(0.35); // Fixed compact height

      // Radial distance from cluster center must be exactly rho_1 = 1.45
      const dist = Math.sqrt(node.position[0] ** 2 + node.position[2] ** 2);
      expect(Math.abs(dist - 1.45)).toBeLessThan(1e-4);

      // Node boundary must stay inside puck perimeter with clearance >= 1.25
      const clearanceToPuckWall = puckR - (dist + NODE_RADIUS);
      expect(clearanceToPuckWall).toBeGreaterThanOrEqual(1.25 - 1e-4);
    }
  });

  test('Boundary port single-orbit explicit cases: P=0, P=1, P=2, P=32, P=33', () => {
    const clusterPositions = computeClusterPositions([
      { id: 'c1', label: 'C1', file_count: 5 },
      { id: 'c2', label: 'C2', file_count: 5 },
      { id: 'c3', label: 'C3', file_count: 5 },
    ]);
    const center = clusterPositions.get('c1')!.center;
    const puckR = clusterPositions.get('c1')!.radius;

    // Case P = 0
    const ports0 = computeBoundaryPortPositions(center, puckR, [], clusterPositions);
    expect(ports0.size).toBe(0);

    // Case P = 1
    const ports1 = computeBoundaryPortPositions(
      center,
      puckR,
      [{ id: 'p1', cluster_id: 'c1', target_cluster_id: 'c2', port_type: 'egress' }],
      clusterPositions
    );
    expect(ports1.size).toBe(1);
    const p1 = ports1.get('p1')!;
    const dist1 = Math.sqrt((p1.position[0] - center[0]) ** 2 + (p1.position[2] - center[2]) ** 2);
    expect(Math.abs(dist1 - (puckR + 0.25))).toBeLessThan(1e-4);

    // Case P = 2
    const ports2 = computeBoundaryPortPositions(
      center,
      puckR,
      [
        { id: 'p1', cluster_id: 'c1', target_cluster_id: 'c2', port_type: 'egress' },
        { id: 'p2', cluster_id: 'c1', target_cluster_id: 'c3', port_type: 'ingress' },
      ],
      clusterPositions
    );
    expect(ports2.size).toBe(2);
    const [pA, pB] = Array.from(ports2.values());
    const dAB = Math.sqrt((pA.position[0] - pB.position[0]) ** 2 + (pA.position[2] - pB.position[2]) ** 2);
    expect(dAB).toBeGreaterThanOrEqual(PORT_SPACING_S);

    // Cases P = 32 and P = 33 (verifies single-orbit dynamic expansion and all-pairs clearance)
    for (const P of [32, 33]) {
      const dummyPorts = Array.from({ length: P }, (_, i) => ({
        id: `port_${P}_${i}`,
        cluster_id: 'c1',
        target_cluster_id: i % 2 === 0 ? 'c2' : 'c3',
        port_type: (i % 2 === 0 ? 'egress' : 'ingress') as 'egress' | 'ingress',
      }));

      const portLayouts = computeBoundaryPortPositions(center, puckR, dummyPorts, clusterPositions);
      expect(portLayouts.size).toBe(P);

      const portsArray = Array.from(portLayouts.values());
      for (let i = 0; i < portsArray.length; i++) {
        for (let j = i + 1; j < portsArray.length; j++) {
          const pt1 = portsArray[i];
          const pt2 = portsArray[j];
          const dist = Math.sqrt(
            (pt1.position[0] - pt2.position[0]) ** 2 + (pt1.position[2] - pt2.position[2]) ** 2
          );
          expect(dist).toBeGreaterThanOrEqual(PORT_SPACING_S - 1e-4);
          expect(Number.isFinite(dist)).toBe(true);
        }
      }
    }
  });

  test('Adversarial port crowding: 10 ports all targeting the same cluster', () => {
    const clusterPositions = computeClusterPositions([
      { id: 'c1', label: 'C1', file_count: 5 },
      { id: 'c2', label: 'C2', file_count: 5 },
    ]);
    const center = clusterPositions.get('c1')!.center;
    const puckR = clusterPositions.get('c1')!.radius;

    const crowdedPorts = Array.from({ length: 10 }, (_, i) => ({
      id: `crowded_port_${i}`,
      cluster_id: 'c1',
      target_cluster_id: 'c2', // All 10 face the exact same direction
      port_type: (i % 2 === 0 ? 'egress' : 'ingress') as 'egress' | 'ingress',
    }));

    const portLayouts = computeBoundaryPortPositions(center, puckR, crowdedPorts, clusterPositions);
    expect(portLayouts.size).toBe(10);

    const portsArray = Array.from(portLayouts.values());
    for (let i = 0; i < portsArray.length; i++) {
      for (let j = i + 1; j < portsArray.length; j++) {
        const pt1 = portsArray[i];
        const pt2 = portsArray[j];
        const dist = Math.sqrt(
          (pt1.position[0] - pt2.position[0]) ** 2 + (pt1.position[2] - pt2.position[2]) ** 2
        );
        expect(dist).toBeGreaterThanOrEqual(PORT_SPACING_S - 1e-4);
        expect(Number.isFinite(dist)).toBe(true);
        expect(Number.isNaN(dist)).toBe(false);
      }
    }

    // Deterministic position stability across repeated runs
    const portLayoutsRun2 = computeBoundaryPortPositions(center, puckR, crowdedPorts, clusterPositions);
    for (const [id, res1] of portLayouts.entries()) {
      const res2 = portLayoutsRun2.get(id)!;
      expect(res1.position[0]).toBeCloseTo(res2.position[0], 5);
      expect(res1.position[2]).toBeCloseTo(res2.position[2], 5);
    }
  });

  test('Cross-cluster geometric continuity: Level 2 conduit curves match boundary port coordinates with zero gap', () => {
    const clusterPositions = computeClusterPositions([
      { id: 'controllers', label: 'Controllers', file_count: 9 },
      { id: 'services', label: 'Services', file_count: 7 },
    ]);
    const ctrlLayout = clusterPositions.get('controllers')!;
    const srvLayout = clusterPositions.get('services')!;

    const ports = [
      {
        id: 'port:controllers:services:egress',
        cluster_id: 'controllers',
        target_cluster_id: 'services',
        port_type: 'egress' as const,
      },
      {
        id: 'port:services:controllers:ingress',
        cluster_id: 'services',
        target_cluster_id: 'controllers',
        port_type: 'ingress' as const,
      },
    ];

    const ctrlPorts = computeBoundaryPortPositions(
      ctrlLayout.center,
      ctrlLayout.radius,
      ports.filter((p) => p.cluster_id === 'controllers'),
      clusterPositions
    );
    const srvPorts = computeBoundaryPortPositions(
      srvLayout.center,
      srvLayout.radius,
      ports.filter((p) => p.cluster_id === 'services'),
      clusterPositions
    );

    const sourceEgress = ctrlPorts.get('port:controllers:services:egress')!;
    const targetIngress = srvPorts.get('port:services:controllers:ingress')!;

    expect(sourceEgress).toBeDefined();
    expect(targetIngress).toBeDefined();

    // 1. Level 1 Macro View: conduits connect puck perimeter to puck perimeter
    const macroCurve = computeConduitCurve(
      ctrlLayout.center,
      srvLayout.center,
      ctrlLayout.radius,
      srvLayout.radius
    );
    expect(macroCurve).toHaveLength(3);
    const macroStart = macroCurve[0];
    const macroEnd = macroCurve[2];

    // Verify macro start is at distance ctrlLayout.radius from center
    const dStartToCenter = Math.hypot(macroStart[0] - ctrlLayout.center[0], macroStart[2] - ctrlLayout.center[2]);
    expect(dStartToCenter).toBeCloseTo(ctrlLayout.radius, 4);

    // Verify macro end is at distance srvLayout.radius from center
    const dEndToCenter = Math.hypot(macroEnd[0] - srvLayout.center[0], macroEnd[2] - srvLayout.center[2]);
    expect(dEndToCenter).toBeCloseTo(srvLayout.radius, 4);

    // 2. Level 2 Expanded View: conduits connect directly to boundary ports
    const level2Curve = computeConduitCurve(
      ctrlLayout.center,
      srvLayout.center,
      ctrlLayout.radius,
      srvLayout.radius,
      sourceEgress.position,
      targetIngress.position
    );
    expect(level2Curve).toHaveLength(3);

    // Numerical endpoint comparison: start matches source egress exactly
    expect(level2Curve[0][0]).toBe(sourceEgress.position[0]);
    expect(level2Curve[0][1]).toBe(sourceEgress.position[1]);
    expect(level2Curve[0][2]).toBe(sourceEgress.position[2]);

    // Numerical endpoint comparison: end matches target ingress exactly
    expect(level2Curve[2][0]).toBe(targetIngress.position[0]);
    expect(level2Curve[2][1]).toBe(targetIngress.position[1]);
    expect(level2Curve[2][2]).toBe(targetIngress.position[2]);

    // Separation between port and conduit start is 0.000
    const sourceGap = Math.hypot(
      level2Curve[0][0] - sourceEgress.position[0],
      level2Curve[0][2] - sourceEgress.position[2]
    );
    expect(sourceGap).toBe(0);

    // Separation between port and conduit end is 0.000
    const targetGap = Math.hypot(
      level2Curve[2][0] - targetIngress.position[0],
      level2Curve[2][2] - targetIngress.position[2]
    );
    expect(targetGap).toBe(0);
  });
});
