'use client';

import React from 'react';
import { Canvas } from '@react-three/fiber';

export function R3FSmokeTest() {
  return (
    <div data-testid="r3f-container" style={{ width: '400px', height: '300px', background: '#F3DCE5' }}>
      <Canvas>
        <ambientLight intensity={0.7} />
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial color="#9B82C4" />
        </mesh>
      </Canvas>
    </div>
  );
}
