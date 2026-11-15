'use client';

import React, { useMemo } from 'react';
import * as THREE from 'three';
import { NodeLayoutResult } from '@/lib/layoutEngine';

interface NodeMeshProps {
  node: NodeLayoutResult;
  isSelected: boolean;
  isDirectDep: boolean;
  isDirectDependent: boolean;
  isAnySelected: boolean;
  isHovered: boolean;
  onHover: (id: string | null) => void;
  onClick: (id: string) => void;
}

export function NodeMesh({
  node,
  isSelected,
  isDirectDep,
  isDirectDependent,
  isAnySelected,
  isHovered,
  onHover,
  onClick,
}: NodeMeshProps) {
  const isExternal = node.nodeType === 'external_package';

  // Geometry: Hexagonal prism (6 radial segments) for external packages, smooth cylinder (32 segments) for files
  const geometry = useMemo(() => {
    const segments = isExternal ? 6 : 32;
    return new THREE.CylinderGeometry(
      node.footprintRadius,
      node.footprintRadius,
      node.height,
      segments
    );
  }, [node.footprintRadius, node.height, isExternal]);

  // Approved Canvello Visual Hierarchy (Strictly Opaque RGB, No Alpha):
  // - Selected: Cherry (#C81D4E)
  // - Direct Dependency (outgoing): Deep Plum (#29152F)
  // - Direct Dependent (incoming): Lavender (#9B82C4)
  // - Hovered (when not selected): Soft Lilac / Plum accent
  // - External Package default: Slate Indigo (#4A4063)
  // - Unrelated (when selection active): Muted Soft Lilac (#E8DDF5)
  // - File default: Deep Plum (#29152F)
  const materialColor = useMemo(() => {
    if (isSelected) return new THREE.Color('#C81D4E');
    if (isDirectDep) return new THREE.Color('#29152F');
    if (isDirectDependent) return new THREE.Color('#9B82C4');
    if (isHovered) return new THREE.Color('#C81D4E');
    if (isAnySelected) return new THREE.Color('#E8DDF5');
    if (isExternal) return new THREE.Color('#4A4063');
    return new THREE.Color('#29152F');
  }, [isSelected, isDirectDep, isDirectDependent, isHovered, isAnySelected, isExternal]);

  return (
    <group position={node.position}>
      <mesh
        geometry={geometry}
        onClick={(e) => {
          e.stopPropagation();
          onClick(node.id);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHover(node.id);
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          onHover(null);
        }}
      >
        <meshStandardMaterial
          color={materialColor}
          roughness={isExternal ? 0.6 : 0.3}
          metalness={isExternal ? 0.3 : 0.1}
        />
      </mesh>
    </group>
  );
}
