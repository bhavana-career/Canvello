'use client';

import React, { useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { ConduitCurveData } from '@/lib/layoutEngine';

interface ConduitRibbonProps {
  conduit: ConduitCurveData;
  isHighlighted: boolean;
}

export function ConduitRibbon({ conduit, isHighlighted }: ConduitRibbonProps) {
  const { invalidate } = useThree();

  useEffect(() => {
    invalidate();
  }, [isHighlighted, invalidate]);

  const curveGeometry = useMemo(() => {
    const pts = conduit.curvePoints.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
    const curve = new THREE.QuadraticBezierCurve3(pts[0], pts[1], pts[2]);
    // Create tube geometry along quadratic bezier curve
    // Tube radius scaled slightly by weight
    const radius = Math.min(0.22, 0.08 + conduit.weight * 0.015);
    return new THREE.TubeGeometry(curve, 32, radius, 8, false);
  }, [conduit]);

  const materialColor = useMemo(() => {
    return isHighlighted ? new THREE.Color('#C81D4E') : new THREE.Color('#9B82C4');
  }, [isHighlighted]);

  return (
    <mesh geometry={curveGeometry}>
      <meshStandardMaterial
        color={materialColor}
        roughness={0.5}
        metalness={0.2}
      />
    </mesh>
  );
}
