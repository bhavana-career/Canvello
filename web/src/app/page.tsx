'use client';

import React from 'react';
import dynamic from 'next/dynamic';

const R3FSmokeTest = dynamic(
  () => import('@/components/R3FSmokeTest').then((mod) => mod.R3FSmokeTest),
  {
    ssr: false,
    loading: () => <p style={{ color: '#9B82C4' }}>Loading 3D canvas harness...</p>,
  }
);

export default function HomePage() {
  return (
    <main style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1 style={{ color: '#29152F' }}>Canvello Architecture Explorer</h1>
      <p style={{ color: '#9B82C4' }}>Phase 2: Repository Connection & Analysis Dev Bench</p>
      <div style={{ marginTop: '1.5rem' }}>
        <R3FSmokeTest />
      </div>
    </main>
  );
}
