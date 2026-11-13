'use client';

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import { GraphInspector } from '@/components/GraphInspector';

const R3FSmokeTest = dynamic(
  () => import('@/components/R3FSmokeTest').then((mod) => mod.R3FSmokeTest),
  {
    ssr: false,
    loading: () => <p style={{ color: '#9B82C4' }}>Loading 3D canvas harness...</p>,
  }
);

const ArchitectureCanvas = dynamic(
  () => import('@/components/ArchitectureCanvas').then((mod) => mod.ArchitectureCanvas),
  {
    ssr: false,
    loading: () => <p style={{ color: '#9B82C4', padding: '2rem' }}>Loading 3D Architecture Canvas...</p>,
  }
);

export default function HomePage() {
  const [analyzing, setAnalyzing] = useState(false);
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const [graphData, setGraphData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);

  const runDemoAnalysis = async () => {
    setAnalyzing(true);
    setError(null);
    setJobStatus('Initiating analysis on canvello-demo-express...');

    try {
      // 1. Fetch Session & CSRF
      const sessionRes = await fetch('http://localhost:8000/api/v1/auth/session', {
        headers: { 'X-Canvello-Demo-User': 'true' },
      });
      if (!sessionRes.ok) throw new Error('Failed to acquire session');
      const sessionData = await sessionRes.json();
      const csrfToken = sessionData.csrf_token;

      // 2. Trigger Asynchronous Analysis
      const analyzeRes = await fetch('http://localhost:8000/api/v1/repos/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Canvello-Demo-User': 'true',
          'X-Canvello-CSRF': csrfToken,
        },
        body: JSON.stringify({ owner: 'demo', repo: 'canvello-demo-express', ref: 'HEAD' }),
      });
      if (!analyzeRes.ok) throw new Error('Failed to start analysis job');
      const analyzeData = await analyzeRes.json();
      const jobId = analyzeData.job_id;

      // 3. Poll Job
      let completed = false;
      for (let i = 0; i < 20; i++) {
        setJobStatus(`Job ${jobId}: In progress (attempt ${i + 1})...`);
        const pollRes = await fetch(`http://localhost:8000/api/v1/jobs/${jobId}`, {
          headers: { 'X-Canvello-Demo-User': 'true' },
        });
        const pollData = await pollRes.json();
        if (pollData.status === 'completed') {
          completed = true;
          setJobStatus('Analysis completed! Fetching graph schema...');
          break;
        } else if (pollData.status === 'failed') {
          throw new Error(pollData.error || 'Job failed');
        }
        await new Promise((r) => setTimeout(r, 250));
      }

      if (!completed) throw new Error('Analysis polling timed out');

      // 4. Fetch Completed Graph
      const graphRes = await fetch('http://localhost:8000/api/v1/repos/demo/canvello-demo-express/graph', {
        headers: { 'X-Canvello-Demo-User': 'true' },
      });
      if (!graphRes.ok) throw new Error('Failed to fetch graph data');
      const data = await graphRes.json();
      setGraphData(data);
      setJobStatus('Graph ready for Phase 3 visual canvas.');
    } catch (err: any) {
      setError(err.message || 'Error occurred');
      setJobStatus(null);
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <main style={{ padding: '2.5rem', maxWidth: '1200px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <header style={{ borderBottom: '1px solid #E8DDF5', paddingBottom: '1.5rem', marginBottom: '2rem' }}>
        <h1 style={{ color: '#29152F', fontSize: '2rem', margin: '0 0 0.5rem 0' }}>Canvello Architecture Explorer</h1>
        <p style={{ color: '#9B82C4', margin: 0 }}>Phase 2: Repository Connection & Analysis Dev Bench</p>
      </header>

      {/* Milestone 3.1: Interactive Level 1 Repository Overview */}
      {graphData && (
        <section style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <h2 style={{ margin: 0, color: '#29152F', fontSize: '1.25rem' }}>Level 1: 3D Repository Overview</h2>
              <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: '#9B82C4' }}>
                All-pairs collision-free layout • Demand-driven rendering (0 idle FPS) • OrbitControls navigation
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.85rem' }}>
              <span style={{ padding: '4px 10px', background: '#E8DDF5', borderRadius: '4px', color: '#29152F' }}>
                {graphData.clusters?.length || 0} Clusters
              </span>
              <span style={{ padding: '4px 10px', background: '#E8DDF5', borderRadius: '4px', color: '#29152F' }}>
                {graphData.conduits?.length || 0} Conduits
              </span>
            </div>
          </div>

          <ArchitectureCanvas
            clusters={graphData.clusters || []}
            conduits={graphData.conduits || []}
            selectedClusterId={selectedClusterId}
            onSelectCluster={setSelectedClusterId}
          />
        </section>
      )}

      {/* R3F Harness Verification Box */}
      <section style={{ marginBottom: '2rem', padding: '1.5rem', background: '#FFFFFF', border: '1px solid #E8DDF5', borderRadius: '8px' }}>
        <h3 style={{ margin: '0 0 0.5rem 0', color: '#29152F' }}>R3F WebGL Smoke Test Harness</h3>
        <p style={{ fontSize: '0.85rem', color: '#9B82C4', margin: '0 0 1rem 0' }}>
          Verifies Next.js 16 + React 19 + Three.js r173 + @react-three/fiber v9 compatibility.
        </p>
        <R3FSmokeTest />
      </section>

      {/* Repository Analysis Trigger */}
      <section style={{ padding: '1.5rem', background: '#F8F9FA', borderRadius: '8px', border: '1px solid #E8DDF5' }}>
        <h3 style={{ margin: '0 0 0.5rem 0', color: '#29152F' }}>Deterministic Repository Ingestion</h3>
        <p style={{ fontSize: '0.85rem', color: '#9B82C4', margin: '0 0 1rem 0' }}>
          Target: <code>demo/canvello-demo-express</code> (35 files: Express, TypeScript, SQLite, Jest).
        </p>
        <button
          onClick={runDemoAnalysis}
          disabled={analyzing}
          style={{
            padding: '0.75rem 1.5rem',
            background: analyzing ? '#9B82C4' : '#C81D4E',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: '6px',
            fontWeight: 'bold',
            cursor: analyzing ? 'not-allowed' : 'pointer',
          }}
        >
          {analyzing ? 'Analyzing Repository...' : 'Run Deterministic Analysis'}
        </button>

        {jobStatus && (
          <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#E8DDF5', borderRadius: '6px', color: '#29152F', fontSize: '0.9rem' }}>
            {jobStatus}
          </div>
        )}

        {error && (
          <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#FADBD8', borderRadius: '6px', color: '#78281F', fontSize: '0.9rem' }}>
            Error: {error}
          </div>
        )}
      </section>

      {/* Graph Schema Inspector */}
      {graphData && <GraphInspector graph={graphData} />}
    </main>
  );
}
