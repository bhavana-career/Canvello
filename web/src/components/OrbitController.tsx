'use client';

import { useEffect, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { OrbitControls as ThreeOrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as THREE from 'three';

export interface CameraTransitionTarget {
  target: [number, number, number];
  position: [number, number, number];
  durationMs?: number;
}

interface OrbitControllerProps {
  transition?: CameraTransitionTarget | null;
  onTransitionEnd?: () => void;
}

// Ease-out cubic formula
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function OrbitController({ transition, onTransitionEnd }: OrbitControllerProps) {
  const { camera, gl, invalidate } = useThree();
  const controlsRef = useRef<ThreeOrbitControls | null>(null);

  // Animation state
  const animRef = useRef<{
    startTime: number;
    duration: number;
    startPos: THREE.Vector3;
    endPos: THREE.Vector3;
    startTarget: THREE.Vector3;
    endTarget: THREE.Vector3;
    active: boolean;
  }>({
    startTime: 0,
    duration: 750,
    startPos: new THREE.Vector3(),
    endPos: new THREE.Vector3(),
    startTarget: new THREE.Vector3(),
    endTarget: new THREE.Vector3(),
    active: false,
  });

  useEffect(() => {
    const controls = new ThreeOrbitControls(camera, gl.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI / 2 - 0.02; // Keep slightly above horizon
    controls.minDistance = 5;
    controls.maxDistance = 250;

    const onChange = () => {
      invalidate();
    };

    controls.addEventListener('change', onChange);
    controlsRef.current = controls;

    return () => {
      controls.removeEventListener('change', onChange);
      controls.dispose();
    };
  }, [camera, gl, invalidate]);

  useEffect(() => {
    if (!transition || !controlsRef.current) return;

    const anim = animRef.current;
    anim.startTime = performance.now();
    anim.duration = transition.durationMs || 750;
    anim.startPos.copy(camera.position);
    anim.endPos.set(transition.position[0], transition.position[1], transition.position[2]);
    anim.startTarget.copy(controlsRef.current.target);
    anim.endTarget.set(transition.target[0], transition.target[1], transition.target[2]);
    anim.active = true;

    invalidate();
  }, [transition, camera, invalidate]);

  useFrame(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    const anim = animRef.current;
    if (anim.active) {
      const now = performance.now();
      const elapsed = now - anim.startTime;
      const progress = Math.min(1.0, elapsed / anim.duration);
      const eased = easeOutCubic(progress);

      camera.position.lerpVectors(anim.startPos, anim.endPos, eased);
      controls.target.lerpVectors(anim.startTarget, anim.endTarget, eased);
      controls.update();
      invalidate();

      if (progress >= 1.0) {
        anim.active = false;
        controls.update();
        if (onTransitionEnd) {
          onTransitionEnd();
        }
      }
    } else {
      // Normal damping update if controls moved
      const changed = controls.update();
      if (changed) {
        invalidate();
      }
    }
  });

  return null;
}
