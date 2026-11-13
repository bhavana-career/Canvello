/**
 * Deterministic Layout Engine for Canvello 3D Architecture Canvas
 * Implements the approved all-pairs collision-free L1 orbit placement
 * and exact chord-distance L2 ring capacity formulas.
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

const NODE_RADIUS = 0.35;
const NODE_SPACING_S = 1.25;
const DELTA_RHO = 1.45;
const PUCK_BOUNDARY_MARGIN = 1.25;
const DEFAULT_CLEARANCE_MARGIN = 6.0;
const MIN_GLOBAL_RADIUS = 26.0;

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
 * Enclosing cluster puck radius calculation:
 * Ensures puck cleanly encloses outermost ring, file node radius, and boundary margin
 * while preserving base aesthetic radius and file-count scaling.
 */
export function computeClusterPuckRadius(fileCount: number): number {
  if (fileCount <= 0) return 2.5;

  let remaining = fileCount;
  let K = 1;
  while (remaining > 0) {
    const cap = getRingCapacity(K);
    if (remaining <= cap) break;
    remaining -= cap;
    K++;
  }

  const baseRadius = 2.5;
  const sqrtRadius = 1.2 * Math.sqrt(fileCount);
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
 * Generates quadratic bezier curve control points for conduits between clusters.
 * Arcs upward in the Y axis proportional to distance so conduits never intersect ground pucks.
 */
export function computeConduitCurve(
  sourceCenter: [number, number, number],
  targetCenter: [number, number, number],
  sourceRadius: number,
  targetRadius: number
): [number, number, number][] {
  const dx = targetCenter[0] - sourceCenter[0];
  const dz = targetCenter[2] - sourceCenter[2];
  const distance = Math.sqrt(dx * dx + dz * dz);
  if (distance < 1e-4) return [sourceCenter, targetCenter];

  const nx = dx / distance;
  const nz = dz / distance;

  // Perimeter points
  const start: [number, number, number] = [
    sourceCenter[0] + nx * sourceRadius,
    0.15,
    sourceCenter[2] + nz * sourceRadius,
  ];

  const end: [number, number, number] = [
    targetCenter[0] - nx * targetRadius,
    0.15,
    targetCenter[2] - nz * targetRadius,
  ];

  // Arc midpoint lifted up in Y
  const arcHeight = Math.min(8.0, Math.max(2.5, distance * 0.18));
  const mid: [number, number, number] = [
    (start[0] + end[0]) / 2,
    arcHeight,
    (start[2] + end[2]) / 2,
  ];

  return [start, mid, end];
}
