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

  const { curveGeometry, coneMesh } = useMemo(() => {
    const pts = conduit.curvePoints.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
    const curve = new THREE.QuadraticBezierCurve3(pts[0], pts[1], pts[2]);
    // Create tube geometry along quadratic bezier curve
    // Tube radius scaled slightly by weight
    const radius = Math.min(0.22, 0.08 + conduit.weight * 0.015);
    const tubeGeo = new THREE.TubeGeometry(curve, 32, radius, 8, false);

    // Direction cone at 65% along curve pointing source -> target
    const coneT = 0.65;
    const pt = curve.getPoint(coneT);
    const tangent = curve.getTangent(coneT).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const quat = new THREE.Quaternion().setFromUnitVectors(up, tangent);
    const euler = new THREE.Euler().setFromQuaternion(quat);

    return {
      curveGeometry: tubeGeo,
      coneMesh: {
        position: [pt.x, pt.y, pt.z] as [number, number, number],
        rotation: [euler.x, euler.y, euler.z] as [number, number, number],
        radius: radius * 2.2,
        height: radius * 3.8,
      },
    };
  }, [conduit]);

  const materialColor = useMemo(() => {
    return isHighlighted ? new THREE.Color('#C81D4E') : new THREE.Color('#9B82C4');
  }, [isHighlighted]);

  return (
    <group>
      <mesh geometry={curveGeometry}>
        <meshStandardMaterial
          color={materialColor}
          roughness={0.5}
          metalness={0.2}
        />
      </mesh>
      {coneMesh && (
        <mesh position={coneMesh.position} rotation={coneMesh.rotation}>
          <coneGeometry args={[coneMesh.radius, coneMesh.height, 8]} />
          <meshStandardMaterial
            color={materialColor}
            roughness={0.4}
            metalness={0.2}
          />
        </mesh>
      )}
    </group>
  );
}
