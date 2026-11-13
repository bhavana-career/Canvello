'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import {
  computeClusterPositions,
  computeConduitCurve,
  ClusterLayoutResult,
  ConduitCurveData,
} from '@/lib/layoutEngine';
import { ClusterPuck } from './ClusterPuck';
import { ConduitRibbon } from './ConduitRibbon';
import { OrbitController, CameraTransitionTarget } from './OrbitController';

interface ClusterData {
  id: string;
  label: string;
  description?: string;
  file_count: number;
  internal_file_ids?: string[];
}

interface ConduitData {
  id: string;
  source_cluster_id: string;
  target_cluster_id: string;
  direct_edge_count?: number;
  edge_count?: number;
}

interface ArchitectureCanvasProps {
  clusters: ClusterData[];
  conduits: ConduitData[];
  selectedClusterId: string | null;
  onSelectCluster: (clusterId: string | null) => void;
}

export function ArchitectureCanvas({
  clusters,
  conduits,
  selectedClusterId,
  onSelectCluster,
}: ArchitectureCanvasProps) {
  const [hoveredClusterId, setHoveredClusterId] = useState<string | null>(null);
  const [webglError, setWebglError] = useState<string | null>(null);
  const [cameraTransition, setCameraTransition] = useState<CameraTransitionTarget | null>(null);

  // 1. WebGL capability check
  useEffect(() => {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (!gl) {
        setWebglError('WebGL is not supported or hardware acceleration is disabled in your browser.');
      }
    } catch (e: any) {
      setWebglError(`WebGL initialization failed: ${e.message}`);
    }
  }, []);

  // 2. Compute deterministic cluster layout (Level 1)
  const clusterLayouts = useMemo(() => {
    const input = clusters.map((c) => ({
      id: c.id,
      label: c.label || c.id,
      file_count: c.file_count,
    }));
    return computeClusterPositions(input);
  }, [clusters]);

  // 3. Compute conduit curves between cluster perimeters
  const conduitCurves = useMemo<ConduitCurveData[]>(() => {
    const list: ConduitCurveData[] = [];
    for (const c of conduits) {
      const source = clusterLayouts.get(c.source_cluster_id);
      const target = clusterLayouts.get(c.target_cluster_id);
      if (source && target) {
        const curvePoints = computeConduitCurve(
          source.center,
          target.center,
          source.radius,
          target.radius
        );
        const weight = Number.isFinite(c.direct_edge_count)
          ? (c.direct_edge_count as number)
          : Number.isFinite(c.edge_count)
          ? (c.edge_count as number)
          : 1;

        list.push({
          id: c.id,
          sourceClusterId: c.source_cluster_id,
          targetClusterId: c.target_cluster_id,
          weight: Math.max(1, weight),
          curvePoints,
        });
      }
    }
    return list;
  }, [conduits, clusterLayouts]);

  // 4. Handle cluster selection camera focus
  const handleClusterClick = useCallback((clusterId: string) => {
    const layout = clusterLayouts.get(clusterId);
    if (!layout) return;

    onSelectCluster(clusterId);

    // Focus camera on cluster center
    const [cx, cy, cz] = layout.center;
    const distance = layout.radius * 2.8;
    setCameraTransition({
      target: [cx, cy, cz],
      position: [cx, cy + distance * 0.9, cz + distance],
      durationMs: 750,
    });
  }, [clusterLayouts, onSelectCluster]);

  // Handle fly-out reset to Level 1
  const handleResetView = useCallback(() => {
    onSelectCluster(null);
    setCameraTransition({
      target: [0, 0, 0],
      position: [0, 48, 62],
      durationMs: 750,
    });
  }, [onSelectCluster]);

  if (webglError) {
    return (
      <div
        data-testid="webgl-fallback"
        style={{
          padding: '2rem',
          background: '#FFF5F5',
          border: '1px solid #C81D4E',
          borderRadius: '8px',
          color: '#78281F',
          textAlign: 'center',
        }}
      >
        <h3 style={{ margin: '0 0 0.5rem 0' }}>WebGL Rendering Unavailable</h3>
        <p style={{ margin: 0 }}>{webglError}</p>
        <p style={{ fontSize: '0.85rem', color: '#9B82C4', marginTop: '0.5rem' }}>
          Please use the accessible 2D Table View or verify browser WebGL settings.
        </p>
      </div>
    );
  }

  const activeCluster = selectedClusterId ? clusterLayouts.get(selectedClusterId) : null;

  return (
    <div style={{ position: 'relative', width: '100%', height: '620px', background: '#FBF9FE', borderRadius: '8px', overflow: 'hidden', border: '1px solid #E8DDF5' }}>
      {/* Level 1 / Level 2 Breadcrumb & Header Controls */}
      <div
        style={{
          position: 'absolute',
          top: '1rem',
          left: '1rem',
          zIndex: 10,
          background: 'rgba(255, 255, 255, 0.92)',
          backdropFilter: 'blur(8px)',
          padding: '0.5rem 1rem',
          borderRadius: '6px',
          boxShadow: '0 2px 8px rgba(41, 21, 47, 0.08)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          fontSize: '0.9rem',
        }}
      >
        <button
          onClick={handleResetView}
          style={{
            background: 'none',
            border: 'none',
            color: selectedClusterId ? '#C81D4E' : '#29152F',
            fontWeight: 'bold',
            cursor: 'pointer',
            padding: 0,
          }}
          data-testid="breadcrumb-repo"
        >
          Repository (Macro L1)
        </button>
        {selectedClusterId && activeCluster && (
          <>
            <span style={{ color: '#9B82C4' }}>&gt;</span>
            <span style={{ color: '#29152F', fontWeight: 600 }} data-testid="breadcrumb-cluster">
              {activeCluster.label} ({activeCluster.fileCount} files)
            </span>
            <button
              onClick={handleResetView}
              style={{
                marginLeft: '0.5rem',
                fontSize: '0.75rem',
                background: '#E8DDF5',
                color: '#29152F',
                border: 'none',
                borderRadius: '4px',
                padding: '2px 8px',
                cursor: 'pointer',
              }}
              data-testid="reset-view-btn"
            >
              Reset View
            </button>
          </>
        )}
      </div>

      {/* Cluster Quick Navigator Pills (Accessible Level 1 to Level 2 transition triggers) */}
      <div
        data-testid="cluster-navigator-bar"
        style={{
          position: 'absolute',
          top: '1rem',
          right: '1rem',
          zIndex: 10,
          background: 'rgba(255, 255, 255, 0.92)',
          backdropFilter: 'blur(8px)',
          padding: '0.4rem 0.6rem',
          borderRadius: '6px',
          boxShadow: '0 2px 8px rgba(41, 21, 47, 0.08)',
          display: 'flex',
          gap: '0.35rem',
          flexWrap: 'wrap',
          maxWidth: '520px',
        }}
      >
        {Array.from(clusterLayouts.values()).map((cluster) => {
          const isSelected = selectedClusterId === cluster.clusterId;
          const isHovered = hoveredClusterId === cluster.clusterId;
          return (
            <button
              key={cluster.clusterId}
              data-testid={`cluster-btn-${cluster.clusterId}`}
              onClick={() => handleClusterClick(cluster.clusterId)}
              onMouseEnter={() => setHoveredClusterId(cluster.clusterId)}
              onMouseLeave={() => setHoveredClusterId(null)}
              style={{
                fontSize: '0.75rem',
                padding: '3px 8px',
                background: isSelected ? '#C81D4E' : isHovered ? '#9B82C4' : '#E8DDF5',
                color: isSelected || isHovered ? '#FFFFFF' : '#29152F',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: isSelected ? 'bold' : 'normal',
                transition: 'all 0.15s ease',
              }}
            >
              {cluster.label}
            </button>
          );
        })}
      </div>

      {/* Cluster Hover Tooltip */}
      {hoveredClusterId && !selectedClusterId && (
        <div
          data-testid="cluster-hover-tooltip"
          style={{
            position: 'absolute',
            bottom: '1rem',
            left: '1rem',
            zIndex: 10,
            background: '#29152F',
            color: '#FFFFFF',
            padding: '0.6rem 1rem',
            borderRadius: '6px',
            fontSize: '0.85rem',
            pointerEvents: 'none',
          }}
        >
          <strong>{clusterLayouts.get(hoveredClusterId)?.label}</strong>
          <div style={{ color: '#E8DDF5', fontSize: '0.75rem' }}>
            {clusterLayouts.get(hoveredClusterId)?.fileCount} files • Click to focus
          </div>
        </div>
      )}

      {/* 3D React Three Fiber Canvas with frameloop="demand" for zero idle GPU draw */}
      <Canvas
        frameloop="demand"
        camera={{ position: [0, 48, 62], fov: 45 }}
        gl={{ antialias: true, alpha: false }}
        onPointerMissed={() => handleResetView()}
      >
        <color attach="background" args={['#FBF9FE']} />
        <ambientLight intensity={0.8} />
        <directionalLight position={[30, 50, 30]} intensity={1.2} />
        <directionalLight position={[-30, 40, -30]} intensity={0.4} />

        {/* OrbitControls with Camera Tweening */}
        <OrbitController transition={cameraTransition} onTransitionEnd={() => setCameraTransition(null)} />

        {/* Level 1 Cluster Pucks */}
        {Array.from(clusterLayouts.values()).map((cluster) => (
          <ClusterPuck
            key={cluster.clusterId}
            cluster={cluster}
            isHovered={hoveredClusterId === cluster.clusterId || selectedClusterId === cluster.clusterId}
            onHover={setHoveredClusterId}
            onClick={handleClusterClick}
          />
        ))}

        {/* Level 1 Conduits */}
        {conduitCurves.map((conduit) => {
          const isHighlighted =
            hoveredClusterId === conduit.sourceClusterId ||
            hoveredClusterId === conduit.targetClusterId ||
            selectedClusterId === conduit.sourceClusterId ||
            selectedClusterId === conduit.targetClusterId;
          return (
            <ConduitRibbon
              key={conduit.id}
              conduit={conduit}
              isHighlighted={isHighlighted}
            />
          );
        })}

        {/* Subtle ground reference grid */}
        <gridHelper args={[160, 40, '#E8DDF5', '#F3DCE5']} position={[0, -0.05, 0]} />
      </Canvas>
    </div>
  );
}
