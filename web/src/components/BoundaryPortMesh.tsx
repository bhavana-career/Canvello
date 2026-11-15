'use client';

import React, { useMemo } from 'react';
import * as THREE from 'three';
import { BoundaryPortLayoutResult, PORT_SPHERE_RADIUS } from '@/lib/layoutEngine';

interface BoundaryPortMeshProps {
  port: BoundaryPortLayoutResult;
  isHighlighted: boolean;
  onHover: (id: string | null) => void;
  onClick: (id: string) => void;
}

export function BoundaryPortMesh({
  port,
  isHighlighted,
  onHover,
  onClick,
}: BoundaryPortMeshProps) {
  // Sphere geometry for port
  const geometry = useMemo(() => {
    return new THREE.SphereGeometry(PORT_SPHERE_RADIUS, 16, 16);
  }, []);

  // Ingress: Lavender (#9B82C4), Egress: Dusty Rose (#C87A9A), Highlighted: Cherry (#C81D4E)
  const portColor = useMemo(() => {
    if (isHighlighted) return new THREE.Color('#C81D4E');
    return port.portType === 'ingress'
      ? new THREE.Color('#9B82C4')
      : new THREE.Color('#C87A9A');
  }, [isHighlighted, port.portType]);

  return (
    <group position={port.position}>
      <mesh
        geometry={geometry}
        onClick={(e) => {
          e.stopPropagation();
          onClick(port.id);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHover(port.id);
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          onHover(null);
        }}
      >
        <meshStandardMaterial
          color={portColor}
          roughness={0.2}
          metalness={0.4}
        />
      </mesh>
    </group>
  );
}
