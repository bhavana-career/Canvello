/**
 * Deterministic Layout Engine for Canvello 3D Architecture Canvas
 * Implements:
 * - Level 1 All-Pairs Dynamic Orbital Radius (N=1, 2, >= 3)
 * - Level 2 Multi-Ring Concentric Placement (Chord capacity, sequential assignment)
 * - Level 2 Single-Orbit Boundary Port Placement (P=0, 1, >= 2 with dynamic radius expansion)
 * - Level 1 & Level 2 Conduit Curves
 */

export interface ClusterLayoutInput {
  id: string;
  label: string;
  file_count: number;
}

export interface ClusterLayoutResult {
  clusterId: string;
  label: string;
  fileCount: number;
  center: [number, number, number];
  radius: number;
}

export interface ConduitCurveData {
  id: string;
  sourceClusterId: string;
  targetClusterId: string;
  weight: number;
  curvePoints: [number, number, number][];
}

export interface NodeLayoutInput {
  id: string;
  name?: string;
  cluster_id: string;
  node_type?: string;
  loc?: number;
}

export interface NodeLayoutResult {
  id: string;
  clusterId: string;
  nodeType: string;
  ringIndex: number;
  position: [number, number, number];
  height: number;
  footprintRadius: number;
}

export interface BoundaryPortInput {
  id: string;
  cluster_id: string;
  target_cluster_id: string;
  port_type: 'ingress' | 'egress';
  associated_edge_ids?: string[];
}

export interface BoundaryPortLayoutResult {
  id: string;
  clusterId: string;
  targetClusterId: string;
  portType: 'ingress' | 'egress';
  position: [number, number, number];
  associatedEdgeIds: string[];
}

// Geometric Constants
export const NODE_RADIUS = 0.35;
export const NODE_SPACING_S = 1.25;
export const DELTA_RHO = 1.45;
export const PUCK_BOUNDARY_MARGIN = 1.25;
export const DEFAULT_CLEARANCE_MARGIN = 6.0;
export const MIN_GLOBAL_RADIUS = 26.0;
export const PORT_SPHERE_RADIUS = 0.22;
export const PORT_SPACING_S = 0.70;

/**
 * Exact chord-distance ring capacity formula:
 * C_k = floor(pi / asin(s / (2 * rho_k)))
 */
export function getRingCapacity(k: number): number {
  if (k <= 0) return 0;
  const rho_k = k * DELTA_RHO;
  if (2 * rho_k < NODE_SPACING_S) return 0;
  const halfAngle = Math.asin(NODE_SPACING_S / (2 * rho_k));
  return Math.floor(Math.PI / halfAngle);
}

/**
 * Calculates K(M): smallest positive integer K satisfying M <= sum_{k=1}^K C_k.
 * For M = 0, returns 0.
 */
export function getOutermostOccupiedRing(nodeCount: number): number {
  if (nodeCount <= 0) return 0;
  let remaining = nodeCount;
  let K = 1;
  while (remaining > 0) {
    const cap = getRingCapacity(K);
    if (remaining <= cap) return K;
    remaining -= cap;
    K++;
  }
  return K;
}

/**
 * Enclosing cluster puck radius calculation:
 * Encloses the outermost occupied ring K(M), node footprint radius, and boundary margin.
 * Preserves base aesthetic radius (2.5) and sqrt scaling.
 */
export function computeClusterPuckRadius(nodeCount: number): number {
  if (nodeCount <= 0) return 2.5;

  const K = getOutermostOccupiedRing(nodeCount);
  const baseRadius = 2.5;
  const sqrtRadius = 1.2 * Math.sqrt(nodeCount);
  const enclosureRadius = (K * DELTA_RHO) + NODE_RADIUS + PUCK_BOUNDARY_MARGIN;

  return Math.max(baseRadius, sqrtRadius, enclosureRadius);
}

/**
 * Level 1 All-Pairs Dynamic Orbital Radius and Centers:
 * Evaluates every unique pair (i, j) with its actual angular separation
 * to guarantee zero puck collisions regardless of cluster radius distribution.
 */
export function computeClusterPositions(
  clusters: ClusterLayoutInput[],
  clearanceMargin: number = DEFAULT_CLEARANCE_MARGIN,
  minRadius: number = MIN_GLOBAL_RADIUS
): Map<string, ClusterLayoutResult> {
  const sorted = [...clusters].sort((a, b) => a.id.localeCompare(b.id));
  const N = sorted.length;
  const results = new Map<string, ClusterLayoutResult>();

  if (N === 0) return results;

  if (N === 1) {
    const r = computeClusterPuckRadius(sorted[0].file_count);
    results.set(sorted[0].id, {
      clusterId: sorted[0].id,
      label: sorted[0].label,
      fileCount: sorted[0].file_count,
      center: [0, 0, 0],
      radius: r,
    });
    return results;
  }

  const radii = sorted.map((c) => computeClusterPuckRadius(c.file_count));

  if (N === 2) {
    const requiredR = Math.max(15.0, (radii[0] + radii[1] + clearanceMargin) / 2);
    results.set(sorted[0].id, {
      clusterId: sorted[0].id,
      label: sorted[0].label,
      fileCount: sorted[0].file_count,
      center: [-requiredR, 0, 0],
      radius: radii[0],
    });
    results.set(sorted[1].id, {
      clusterId: sorted[1].id,
      label: sorted[1].label,
      fileCount: sorted[1].file_count,
      center: [requiredR, 0, 0],
      radius: radii[1],
    });
    return results;
  }

  // N >= 3: evaluate all pairs (i, j)
  let maxRequiredR = minRadius;
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const angleDiff = Math.abs(i - j) * ((2 * Math.PI) / N);
      const deltaTheta = Math.min(angleDiff, 2 * Math.PI - angleDiff);
      const sinHalf = Math.sin(deltaTheta / 2);
      if (sinHalf > 1e-6) {
        const pairRequiredR = (radii[i] + radii[j] + clearanceMargin) / (2 * sinHalf);
        if (pairRequiredR > maxRequiredR) {
          maxRequiredR = pairRequiredR;
        }
      }
    }
  }

  for (let i = 0; i < N; i++) {
    const theta = i * ((2 * Math.PI) / N);
    results.set(sorted[i].id, {
      clusterId: sorted[i].id,
      label: sorted[i].label,
      fileCount: sorted[i].file_count,
      center: [
        maxRequiredR * Math.cos(theta),
        0,
        maxRequiredR * Math.sin(theta),
      ],
      radius: radii[i],
    });
  }

  return results;
}

/**
 * Level 2 Multi-Ring Node Layout inside a cluster:
 * Sorts nodes lexicographically by ID.
 * Assigns nodes to rings k = 1, 2, ... sequentially without exceeding C_k.
 * Applies golden-angle offset phi_offset(k) = (k * 0.381966) * 2pi.
 */
export function computeNodePositionsInCluster(
  clusterCenter: [number, number, number],
  nodesInCluster: NodeLayoutInput[]
): Map<string, NodeLayoutResult> {
  const sorted = [...nodesInCluster].sort((a, b) => a.id.localeCompare(b.id));
  const results = new Map<string, NodeLayoutResult>();
  const total = sorted.length;
  if (total === 0) return results;

  // Partition sorted nodes into rings
  const ringBuckets: NodeLayoutInput[][] = [];
  let remaining = [...sorted];
  let currentRing = 1;

  while (remaining.length > 0) {
    const cap = getRingCapacity(currentRing);
    const countForRing = Math.min(remaining.length, cap);
    const bucket = remaining.slice(0, countForRing);
    ringBuckets.push(bucket);
    remaining = remaining.slice(countForRing);
    currentRing++;
  }

  // Calculate 3D coordinates for each node
  for (let rIdx = 0; rIdx < ringBuckets.length; rIdx++) {
    const k = rIdx + 1;
    const bucket = ringBuckets[rIdx];
    const n_k = bucket.length;
    const rho_k = k * DELTA_RHO;
    const phi_offset = (k * 0.381966) * 2 * Math.PI;

    for (let j = 0; j < n_k; j++) {
      const node = bucket[j];
      const phi = phi_offset + j * ((2 * Math.PI) / n_k);
      const isExternal = node.node_type === 'external_package' || node.id.startsWith('pkg:');

      // Height calculation: LOC-scaled for files, compact fixed height for packages
      const height = isExternal
        ? 0.35
        : Math.min(2.2, Math.max(0.40, 0.40 + ((node.loc || 0) / 180) * 1.4));

      const x = clusterCenter[0] + rho_k * Math.cos(phi);
      const y = 0.15 + height / 2; // Rests on top of cluster puck (puck top is at y=0.15)
      const z = clusterCenter[2] + rho_k * Math.sin(phi);

      results.set(node.id, {
        id: node.id,
        clusterId: node.cluster_id,
        nodeType: isExternal ? 'external_package' : 'file',
        ringIndex: k,
        position: [x, y, z],
        height,
        footprintRadius: NODE_RADIUS,
      });
    }
  }

  return results;
}

/**
 * Level 2 Single-Orbit Boundary Port Placement:
 * Implements the approved single-orbit algorithm:
 * - P = 0: returns empty map
 * - P = 1: R = R0 at ideal target direction angle
 * - P >= 2: R = max(R0, s / (2 sin(pi / P)))
 * Assigns ports to equispaced angular slots starting from ideal base angle.
 */
export function computeBoundaryPortPositions(
  clusterCenter: [number, number, number],
  puckRadius: number,
  ports: BoundaryPortInput[],
  clusterPositions: Map<string, ClusterLayoutResult>
): Map<string, BoundaryPortLayoutResult> {
  const results = new Map<string, BoundaryPortLayoutResult>();
  const P = ports.length;
  if (P === 0) return results;

  const R0 = puckRadius + 0.25;

  if (P === 1) {
    const port = ports[0];
    const targetCluster = clusterPositions.get(port.target_cluster_id);
    let targetAngle = 0;
    if (targetCluster) {
      targetAngle = Math.atan2(
        targetCluster.center[2] - clusterCenter[2],
        targetCluster.center[0] - clusterCenter[0]
      );
    }
    const x = clusterCenter[0] + R0 * Math.cos(targetAngle);
    const z = clusterCenter[2] + R0 * Math.sin(targetAngle);

    results.set(port.id, {
      id: port.id,
      clusterId: port.cluster_id,
      targetClusterId: port.target_cluster_id,
      portType: port.port_type,
      position: [x, 0.20, z],
      associatedEdgeIds: port.associated_edge_ids || [],
    });
    return results;
  }

  // P >= 2: single-orbit dynamic radius
  const sinHalf = Math.sin(Math.PI / P);
  const minRequiredR = PORT_SPACING_S / (2 * sinHalf);
  const R_orbit = Math.max(R0, minRequiredR);

  // Deterministic sorting with ideal target angles
  interface PortWithAngle extends BoundaryPortInput {
    idealAngle: number;
  }

  const portsWithAngle: PortWithAngle[] = ports.map((p) => {
    const targetCluster = clusterPositions.get(p.target_cluster_id);
    let idealAngle = 0;
    if (targetCluster) {
      idealAngle = Math.atan2(
        targetCluster.center[2] - clusterCenter[2],
        targetCluster.center[0] - clusterCenter[0]
      );
    }
    return {
      ...p,
      idealAngle,
    };
  });

  // Sort by (idealAngle, target_cluster_id, port_type ingress before egress, id)
  portsWithAngle.sort((a, b) => {
    if (Math.abs(a.idealAngle - b.idealAngle) > 1e-4) {
      return a.idealAngle - b.idealAngle;
    }
    const targetCmp = a.target_cluster_id.localeCompare(b.target_cluster_id);
    if (targetCmp !== 0) return targetCmp;
    // Ingress precedes egress
    if (a.port_type !== b.port_type) {
      return a.port_type === 'ingress' ? -1 : 1;
    }
    return a.id.localeCompare(b.id);
  });

  // Assign equispaced angular slots starting from base angle
  const baseAngle = portsWithAngle[0].idealAngle;
  for (let k = 0; k < P; k++) {
    const port = portsWithAngle[k];
    const psi_k = baseAngle + k * ((2 * Math.PI) / P);
    const x = clusterCenter[0] + R_orbit * Math.cos(psi_k);
    const z = clusterCenter[2] + R_orbit * Math.sin(psi_k);

    results.set(port.id, {
      id: port.id,
      clusterId: port.cluster_id,
      targetClusterId: port.target_cluster_id,
      portType: port.port_type,
      position: [x, 0.20, z],
      associatedEdgeIds: port.associated_edge_ids || [],
    });
  }

  return results;
}

/**
 * Generates quadratic bezier curve control points for conduits between clusters.
 * Arcs upward in the Y axis proportional to distance so conduits never intersect ground pucks.
 */
export function computeConduitCurve(
  sourceCenter: [number, number, number],
  targetCenter: [number, number, number],
  sourceRadius: number,
  targetRadius: number,
  sourcePortPos?: [number, number, number],
  targetPortPos?: [number, number, number]
): [number, number, number][] {
  const dx = targetCenter[0] - sourceCenter[0];
  const dz = targetCenter[2] - sourceCenter[2];
  const distance = Math.sqrt(dx * dx + dz * dz);
  if (distance < 1e-4) return [sourceCenter, targetCenter];

  const nx = dx / distance;
  const nz = dz / distance;

  // Start point: use exact boundary port position if provided, else cluster perimeter rim
  const start: [number, number, number] = sourcePortPos
    ? [sourcePortPos[0], sourcePortPos[1], sourcePortPos[2]]
    : [sourceCenter[0] + nx * sourceRadius, 0.15, sourceCenter[2] + nz * sourceRadius];

  // End point: use exact boundary port position if provided, else cluster perimeter rim
  const end: [number, number, number] = targetPortPos
    ? [targetPortPos[0], targetPortPos[1], targetPortPos[2]]
    : [targetCenter[0] - nx * targetRadius, 0.15, targetCenter[2] - nz * targetRadius];

  // Arc midpoint lifted up in Y proportional to planar distance
  const chordDx = end[0] - start[0];
  const chordDz = end[2] - start[2];
  const chordDist = Math.sqrt(chordDx * chordDx + chordDz * chordDz);
  const arcHeight = Math.min(8.0, Math.max(2.5, chordDist * 0.18));
  const mid: [number, number, number] = [
    (start[0] + end[0]) / 2,
    arcHeight,
    (start[2] + end[2]) / 2,
  ];

  return [start, mid, end];
}
