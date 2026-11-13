'use client';

import React, { useRef, useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { useThree, useFrame } from '@react-three/fiber';
import { ClusterLayoutResult } from '@/lib/layoutEngine';

interface ClusterPuckProps {
  cluster: ClusterLayoutResult;
  isHovered: boolean;
  onHover: (id: string | null) => void;
  onClick: (id: string) => void;
}

export function ClusterPuck({ cluster, isHovered, onHover, onClick }: ClusterPuckProps) {
  const { invalidate } = useThree();
  const meshRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.LineLoop>(null);

  // Palette colors
  const puckColor = useMemo(() => {
    return isHovered ? new THREE.Color('#9B82C4') : new THREE.Color('#29152F');
  }, [isHovered]);

  const ringColor = useMemo(() => {
    return isHovered ? new THREE.Color('#C81D4E') : new THREE.Color('#9B82C4');
  }, [isHovered]);

  useEffect(() => {
    invalidate();
  }, [isHovered, invalidate]);

  // Puck cylinder geometry: height 0.3, radius as computed by layoutEngine
  const geometry = useMemo(() => {
    return new THREE.CylinderGeometry(cluster.radius, cluster.radius, 0.3, 48);
  }, [cluster.radius]);

  // Outer boundary accent ring
  const ringGeometry = useMemo(() => {
    const points: THREE.Vector3[] = [];
    const segments = 64;
    for (let i = 0; i <= segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      points.push(new THREE.Vector3(Math.cos(theta) * (cluster.radius + 0.15), 0.16, Math.sin(theta) * (cluster.radius + 0.15)));
    }
    return new THREE.BufferGeometry().setFromPoints(points);
  }, [cluster.radius]);

  return (
    <group position={cluster.center}>
      <mesh
        ref={meshRef}
        geometry={geometry}
        position={[0, 0.15, 0]}
        onClick={(e) => {
          e.stopPropagation();
          onClick(cluster.clusterId);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHover(cluster.clusterId);
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          onHover(null);
        }}
      >
        <meshStandardMaterial
          color={puckColor}
          roughness={0.4}
          metalness={0.1}
        />
      </mesh>

      <lineLoop ref={ringRef} geometry={ringGeometry}>
        <lineBasicMaterial color={ringColor} linewidth={2} />
      </lineLoop>
    </group>
  );
}
