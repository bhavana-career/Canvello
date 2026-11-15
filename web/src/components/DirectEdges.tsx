'use client';

import React, { useMemo } from 'react';
import * as THREE from 'three';

export interface RenderedEdge {
  id: string;
  source: string;
  target: string;
  start: [number, number, number];
  end: [number, number, number];
  edgeType: 'same_cluster' | 'cross_egress' | 'cross_ingress';
  isHighlighted: boolean;
  isDimmed: boolean;
}

interface DirectEdgesProps {
  edges: RenderedEdge[];
}

export function DirectEdges({ edges }: DirectEdgesProps) {
  // Build line segments geometry and colors
  const { geometry, coneMeshes } = useMemo(() => {
    const points: number[] = [];
    const colors: number[] = [];

    // Direction cones
    const cones: { position: [number, number, number]; rotation: [number, number, number]; color: string }[] = [];

    for (const edge of edges) {
      points.push(edge.start[0], edge.start[1], edge.start[2]);
      points.push(edge.end[0], edge.end[1], edge.end[2]);

      // Palette colors
      const color = edge.isHighlighted
        ? new THREE.Color('#C81D4E') // Cherry for highlighted direct relations
        : edge.isDimmed
        ? new THREE.Color('#E8DDF5') // Muted soft lilac for unrelated
        : edge.edgeType === 'same_cluster'
        ? new THREE.Color('#29152F') // Deep plum for internal direct AST
        : new THREE.Color('#9B82C4'); // Lavender for boundary port connections

      colors.push(color.r, color.g, color.b);
      colors.push(color.r, color.g, color.b);

      // Add directional arrowhead cone at 70% along edge
      const dx = edge.end[0] - edge.start[0];
      const dy = edge.end[1] - edge.start[1];
      const dz = edge.end[2] - edge.start[2];
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (dist > 0.5) {
        const conePos: [number, number, number] = [
          edge.start[0] + dx * 0.7,
          edge.start[1] + dy * 0.7,
          edge.start[2] + dz * 0.7,
        ];

        // Rotation vector toward target
        const dir = new THREE.Vector3(dx, dy, dz).normalize();
        const up = new THREE.Vector3(0, 1, 0);
        const quat = new THREE.Quaternion().setFromUnitVectors(up, dir);
        const euler = new THREE.Euler().setFromQuaternion(quat);

        cones.push({
          position: conePos,
          rotation: [euler.x, euler.y, euler.z],
          color: edge.isHighlighted ? '#C81D4E' : edge.isDimmed ? '#E8DDF5' : '#9B82C4',
        });
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    return { geometry: geo, coneMeshes: cones };
  }, [edges]);

  return (
    <group>
      <lineSegments geometry={geometry}>
        <lineBasicMaterial vertexColors linewidth={1} />
      </lineSegments>

      {/* Render directional cone markers */}
      {coneMeshes.map((cone, idx) => (
        <mesh key={idx} position={cone.position} rotation={cone.rotation}>
          <coneGeometry args={[0.08, 0.22, 6]} />
          <meshStandardMaterial color={cone.color} roughness={0.4} />
        </mesh>
      ))}
    </group>
  );
}
