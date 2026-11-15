'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import {
  computeClusterPositions,
  computeNodePositionsInCluster,
  computeBoundaryPortPositions,
  computeConduitCurve,
  ClusterLayoutResult,
  NodeLayoutResult,
  BoundaryPortLayoutResult,
  ConduitCurveData,
} from '@/lib/layoutEngine';
import { ClusterPuck } from './ClusterPuck';
import { ConduitRibbon } from './ConduitRibbon';
import { NodeMesh } from './NodeMesh';
import { BoundaryPortMesh } from './BoundaryPortMesh';
import { DirectEdges, RenderedEdge } from './DirectEdges';
import { OrbitController, CameraTransitionTarget } from './OrbitController';

interface ClusterData {
  id: string;
  label: string;
  description?: string;
  file_count: number;
  internal_file_ids?: string[];
  boundary_port_ids?: string[];
}

interface ConduitData {
  id: string;
  source_cluster_id: string;
  target_cluster_id: string;
  direct_edge_count?: number;
  edge_count?: number;
}

interface GraphNodeData {
  id: string;
  name?: string;
  cluster_id: string;
  node_type?: string;
  loc?: number;
  symbols?: string[];
  exports?: string[];
}

interface DependencyEdgeData {
  id: string;
  source: string;
  target: string;
  import_statement?: string;
  is_resolved?: boolean;
}

interface BoundaryPortData {
  id: string;
  cluster_id: string;
  target_cluster_id: string;
  port_type: 'ingress' | 'egress';
  associated_edge_ids?: string[];
}

interface ArchitectureCanvasProps {
  clusters: ClusterData[];
  conduits: ConduitData[];
  nodes?: GraphNodeData[];
  edges?: DependencyEdgeData[];
  boundary_ports?: BoundaryPortData[];
  selectedClusterId: string | null;
  selectedFileId?: string | null;
  onSelectCluster: (clusterId: string | null) => void;
  onSelectFile?: (fileId: string | null) => void;
}

function ScreenCoordinateTracker({
  nodePositions,
}: {
  nodePositions: Map<string, NodeLayoutResult>;
}) {
  const { camera, size } = useThree();

  useFrame(() => {
    if (typeof window === 'undefined') return;
    const coords: Record<string, { x: number; y: number }> = {};
    const vec = new THREE.Vector3();
    nodePositions.forEach((node, id) => {
      vec.set(node.position[0], node.position[1], node.position[2]);
      vec.project(camera);
      // Normalized device coordinates [-1, 1] to screen pixel coordinates
      const x = ((vec.x + 1) / 2) * size.width;
      const y = ((-vec.y + 1) / 2) * size.height;
      coords[id] = { x: Math.round(x), y: Math.round(y) };
    });
    (window as any).__CANVELLO_NODE_COORDS__ = coords;
  });

  return null;
}

export function ArchitectureCanvas({
  clusters,
  conduits,
  nodes = [],
  edges = [],
  boundary_ports = [],
  selectedClusterId,
  selectedFileId,
  onSelectCluster,
  onSelectFile,
}: ArchitectureCanvasProps) {
  const [hoveredClusterId, setHoveredClusterId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [hoveredPortId, setHoveredPortId] = useState<string | null>(null);
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

  // 2. Compute Level 1 deterministic cluster layout
  const clusterLayouts = useMemo(() => {
    const input = clusters.map((c) => {
      // Calculate true total rendered node count M for puck sizing (including package nodes)
      const count = nodes.filter((n) => n.cluster_id === c.id).length || c.file_count;
      return {
        id: c.id,
        label: c.label || c.id,
        file_count: count,
      };
    });
    return computeClusterPositions(input);
  }, [clusters, nodes]);

  // 3. Precompute Level 2 single-orbit boundary port positions across all clusters
  const allBoundaryPortPositions = useMemo(() => {
    const map = new Map<string, BoundaryPortLayoutResult>();
    for (const [clusterId, layout] of clusterLayouts.entries()) {
      const clusterPorts = boundary_ports.filter((p) => p.cluster_id === clusterId);
      const portLayouts = computeBoundaryPortPositions(
        layout.center,
        layout.radius,
        clusterPorts,
        clusterLayouts
      );
      portLayouts.forEach((val, key) => map.set(key, val));
    }
    return map;
  }, [boundary_ports, clusterLayouts]);

  // 4. Compute conduit curves between cluster perimeters (or boundary ports in Level 2)
  const conduitCurves = useMemo<ConduitCurveData[]>(() => {
    const list: ConduitCurveData[] = [];
    for (const c of conduits) {
      const source = clusterLayouts.get(c.source_cluster_id);
      const target = clusterLayouts.get(c.target_cluster_id);
      if (source && target) {
        // In Level 2 (when a cluster is expanded), geometrically anchor conduits to the exact boundary ports
        const sourcePortId = `port:${c.source_cluster_id}:${c.target_cluster_id}:egress`;
        const targetPortId = `port:${c.target_cluster_id}:${c.source_cluster_id}:ingress`;
        const sourcePort = selectedClusterId ? allBoundaryPortPositions.get(sourcePortId) : undefined;
        const targetPort = selectedClusterId ? allBoundaryPortPositions.get(targetPortId) : undefined;

        const curvePoints = computeConduitCurve(
          source.center,
          target.center,
          source.radius,
          target.radius,
          sourcePort?.position,
          targetPort?.position
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
  }, [conduits, clusterLayouts, selectedClusterId, allBoundaryPortPositions]);

  // 5. Compute Level 2 multi-ring node positions for selected cluster
  const activeClusterLayout = selectedClusterId ? clusterLayouts.get(selectedClusterId) : null;

  const nodePositions = useMemo(() => {
    if (!selectedClusterId || !activeClusterLayout) return new Map<string, NodeLayoutResult>();
    const clusterNodes = nodes.filter((n) => n.cluster_id === selectedClusterId);
    return computeNodePositionsInCluster(activeClusterLayout.center, clusterNodes);
  }, [selectedClusterId, activeClusterLayout, nodes]);

  // 6. Filter boundary ports belonging to the active selected cluster
  const boundaryPortPositions = useMemo(() => {
    if (!selectedClusterId) return new Map<string, BoundaryPortLayoutResult>();
    const map = new Map<string, BoundaryPortLayoutResult>();
    allBoundaryPortPositions.forEach((port, id) => {
      if (port.clusterId === selectedClusterId) {
        map.set(id, port);
      }
    });
    return map;
  }, [selectedClusterId, allBoundaryPortPositions]);

  // 6. Direct dependency relations for active selection / hover
  const activeNodeId = selectedFileId || hoveredNodeId;

  const directDependenciesSet = useMemo(() => {
    if (!activeNodeId) return new Set<string>();
    const deps = new Set<string>();
    for (const e of edges) {
      if (e.source === activeNodeId) deps.add(e.target);
    }
    return deps;
  }, [activeNodeId, edges]);

  const directDependentsSet = useMemo(() => {
    if (!activeNodeId) return new Set<string>();
    const dependents = new Set<string>();
    for (const e of edges) {
      if (e.target === activeNodeId) dependents.add(e.source);
    }
    return dependents;
  }, [activeNodeId, edges]);

  // 7. Compute Level 2 direct edges to render
  const renderedEdges = useMemo<RenderedEdge[]>(() => {
    if (!selectedClusterId || !activeClusterLayout) return [];
    const list: RenderedEdge[] = [];

    // Map ports by (target_cluster, port_type) for quick lookup
    const egressPortMap = new Map<string, BoundaryPortLayoutResult>();
    const ingressPortMap = new Map<string, BoundaryPortLayoutResult>();

    boundaryPortPositions.forEach((port) => {
      if (port.portType === 'egress') {
        egressPortMap.set(port.targetClusterId, port);
      } else {
        ingressPortMap.set(port.targetClusterId, port);
      }
    });

    // Create lookup for which cluster each node belongs to
    const nodeClusterMap = new Map<string, string>();
    nodes.forEach((n) => nodeClusterMap.set(n.id, n.cluster_id));

    for (const edge of edges) {
      const srcCluster = nodeClusterMap.get(edge.source);
      const tgtCluster = nodeClusterMap.get(edge.target);

      const isInternal = srcCluster === selectedClusterId && tgtCluster === selectedClusterId;
      const isCrossEgress = srcCluster === selectedClusterId && tgtCluster !== selectedClusterId;
      const isCrossIngress = tgtCluster === selectedClusterId && srcCluster !== selectedClusterId;

      if (!isInternal && !isCrossEgress && !isCrossIngress) continue;

      const isRelatedToActive =
        activeNodeId && (edge.source === activeNodeId || edge.target === activeNodeId);
      const isDimmed = activeNodeId ? !isRelatedToActive : false;
      const isHighlighted = Boolean(isRelatedToActive);

      if (isInternal) {
        const srcNode = nodePositions.get(edge.source);
        const tgtNode = nodePositions.get(edge.target);
        if (srcNode && tgtNode) {
          list.push({
            id: edge.id,
            source: edge.source,
            target: edge.target,
            start: [srcNode.position[0], srcNode.position[1], srcNode.position[2]],
            end: [tgtNode.position[0], tgtNode.position[1], tgtNode.position[2]],
            edgeType: 'same_cluster',
            isHighlighted,
            isDimmed,
          });
        }
      } else if (isCrossEgress && tgtCluster) {
        const srcNode = nodePositions.get(edge.source);
        const egressPort = egressPortMap.get(tgtCluster);
        if (srcNode && egressPort) {
          list.push({
            id: edge.id,
            source: edge.source,
            target: edge.target,
            start: [srcNode.position[0], srcNode.position[1], srcNode.position[2]],
            end: [egressPort.position[0], egressPort.position[1], egressPort.position[2]],
            edgeType: 'cross_egress',
            isHighlighted,
            isDimmed,
          });
        }
      } else if (isCrossIngress && srcCluster) {
        const tgtNode = nodePositions.get(edge.target);
        const ingressPort = ingressPortMap.get(srcCluster);
        if (tgtNode && ingressPort) {
          list.push({
            id: edge.id,
            source: edge.source,
            target: edge.target,
            start: [ingressPort.position[0], ingressPort.position[1], ingressPort.position[2]],
            end: [tgtNode.position[0], tgtNode.position[1], tgtNode.position[2]],
            edgeType: 'cross_ingress',
            isHighlighted,
            isDimmed,
          });
        }
      }
    }

    return list;
  }, [
    selectedClusterId,
    activeClusterLayout,
    nodePositions,
    boundaryPortPositions,
    edges,
    nodes,
    activeNodeId,
  ]);

  // 8. Handle cluster selection camera focus
  const handleClusterClick = useCallback(
    (clusterId: string) => {
      const layout = clusterLayouts.get(clusterId);
      if (!layout) return;

      onSelectCluster(clusterId);
      if (onSelectFile) onSelectFile(null);

      // Focus camera on cluster center
      const [cx, cy, cz] = layout.center;
      const distance = layout.radius * 2.8;
      setCameraTransition({
        target: [cx, cy, cz],
        position: [cx, cy + distance * 0.9, cz + distance],
        durationMs: 750,
      });
    },
    [clusterLayouts, onSelectCluster, onSelectFile]
  );

  // Handle node selection in Level 2
  const handleNodeClick = useCallback(
    (nodeId: string) => {
      if (onSelectFile) {
        onSelectFile(nodeId);
      }
    },
    [onSelectFile]
  );

  // Handle fly-out reset to Level 1
  const handleResetView = useCallback(() => {
    onSelectCluster(null);
    if (onSelectFile) onSelectFile(null);
    setCameraTransition({
      target: [0, 0, 0],
      position: [0, 48, 62],
      durationMs: 750,
    });
  }, [onSelectCluster, onSelectFile]);

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
  const activeFileNode = selectedFileId ? nodes.find((n) => n.id === selectedFileId) : null;

  return (
    <div
      data-testid="architecture-canvas-container"
      style={{
        position: 'relative',
        width: '100%',
        height: '620px',
        background: '#FBF9FE',
        borderRadius: '8px',
        overflow: 'hidden',
        border: '1px solid #E8DDF5',
      }}
    >
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
            <button
              onClick={() => onSelectFile && onSelectFile(null)}
              style={{
                background: 'none',
                border: 'none',
                color: selectedFileId ? '#C81D4E' : '#29152F',
                fontWeight: 600,
                cursor: 'pointer',
                padding: 0,
              }}
              data-testid="breadcrumb-cluster"
            >
              {activeCluster.label} ({activeCluster.fileCount} nodes)
            </button>
          </>
        )}
        {selectedFileId && activeFileNode && (
          <>
            <span style={{ color: '#9B82C4' }}>&gt;</span>
            <span style={{ color: '#29152F', fontWeight: 'bold' }} data-testid="breadcrumb-file">
              {activeFileNode.name || activeFileNode.id.split('/').pop()}
            </span>
          </>
        )}
        {selectedClusterId && (
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
        )}
      </div>

      {/* Cluster Quick Navigator Pills */}
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

      {/* Cluster Hover Tooltip (L1) */}
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

      {/* Node Hover Tooltip (L2) */}
      {hoveredNodeId && (
        <div
          data-testid="node-hover-tooltip"
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
          <strong>{hoveredNodeId}</strong>
          {nodes.find((n) => n.id === hoveredNodeId)?.loc !== undefined && (
            <div style={{ color: '#E8DDF5', fontSize: '0.75rem' }}>
              {nodes.find((n) => n.id === hoveredNodeId)?.loc} LOC • Click to select
            </div>
          )}
        </div>
      )}

      {/* Boundary Port Hover Tooltip (L2) */}
      {hoveredPortId && (
        <div
          data-testid="port-hover-tooltip"
          style={{
            position: 'absolute',
            bottom: '1rem',
            right: '1rem',
            zIndex: 10,
            background: '#29152F',
            color: '#FFFFFF',
            padding: '0.6rem 1rem',
            borderRadius: '6px',
            fontSize: '0.85rem',
            pointerEvents: 'none',
          }}
        >
          <strong>{boundaryPortPositions.get(hoveredPortId)?.portType.toUpperCase()} Port</strong>
          <div style={{ color: '#E8DDF5', fontSize: '0.75rem' }}>
            To/From: {boundaryPortPositions.get(hoveredPortId)?.targetClusterId} •{' '}
            {boundaryPortPositions.get(hoveredPortId)?.associatedEdgeIds.length} edges
          </div>
        </div>
      )}

      {/* Testable Node Visual States for Automated Verification */}
      {selectedClusterId && (
        <div
          data-testid="cluster-nodes-visual-states"
          style={{
            position: 'absolute',
            width: '1px',
            height: '1px',
            padding: 0,
            margin: '-1px',
            overflow: 'hidden',
            clip: 'rect(0, 0, 0, 0)',
            whiteSpace: 'nowrap',
            border: 0,
          }}
        >
          {Array.from(nodePositions.values()).map((node) => {
            const isSelected = selectedFileId === node.id;
            const isDirectDep = directDependenciesSet.has(node.id);
            const isDirectDependent = directDependentsSet.has(node.id);
            const isExternal = node.nodeType === 'external_package';

            let visualState:
              | 'selected'
              | 'direct_dependency'
              | 'direct_dependent'
              | 'unrelated'
              | 'external'
              | 'default';
            let colorHex: string;

            if (isSelected) {
              visualState = 'selected';
              colorHex = '#C81D4E';
            } else if (isDirectDep) {
              visualState = 'direct_dependency';
              colorHex = '#29152F';
            } else if (isDirectDependent) {
              visualState = 'direct_dependent';
              colorHex = '#9B82C4';
            } else if (selectedFileId) {
              visualState = 'unrelated';
              colorHex = '#E8DDF5';
            } else if (isExternal) {
              visualState = 'external';
              colorHex = '#4A4063';
            } else {
              visualState = 'default';
              colorHex = '#29152F';
            }

            return (
              <div
                key={node.id}
                data-testid={`node-item-${node.id}`}
                data-node-id={node.id}
                data-visual-state={visualState}
                data-color={colorHex}
                data-node-type={node.nodeType}
                onClick={() => handleNodeClick(node.id)}
              >
                {node.id}
              </div>
            );
          })}
        </div>
      )}

      {/* 3D React Three Fiber Canvas */}
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

        {/* Screen coordinates tracker for 3D canvas testing */}
        {selectedClusterId && nodePositions.size > 0 && (
          <ScreenCoordinateTracker nodePositions={nodePositions} />
        )}

        {/* OrbitControls with Camera Tweening */}
        <OrbitController
          transition={cameraTransition}
          onTransitionEnd={() => setCameraTransition(null)}
        />

        {/* Level 1 Cluster Pucks */}
        {Array.from(clusterLayouts.values()).map((cluster) => (
          <ClusterPuck
            key={cluster.clusterId}
            cluster={cluster}
            isHovered={
              hoveredClusterId === cluster.clusterId || selectedClusterId === cluster.clusterId
            }
            onHover={setHoveredClusterId}
            onClick={handleClusterClick}
          />
        ))}

        {/* Level 1 Conduits (Visible in L1, or background context in L2) */}
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

        {/* Level 2 Concentric Nodes (Rendered when cluster is selected) */}
        {selectedClusterId &&
          Array.from(nodePositions.values()).map((node) => (
            <NodeMesh
              key={node.id}
              node={node}
              isSelected={selectedFileId === node.id}
              isDirectDep={directDependenciesSet.has(node.id)}
              isDirectDependent={directDependentsSet.has(node.id)}
              isAnySelected={Boolean(selectedFileId)}
              isHovered={hoveredNodeId === node.id}
              onHover={setHoveredNodeId}
              onClick={handleNodeClick}
            />
          ))}

        {/* Level 2 Single-Orbit Boundary Ports (Rendered for selected cluster) */}
        {selectedClusterId &&
          Array.from(boundaryPortPositions.values()).map((port) => (
            <BoundaryPortMesh
              key={port.id}
              port={port}
              isHighlighted={hoveredPortId === port.id}
              onHover={setHoveredPortId}
              onClick={() => {}}
            />
          ))}

        {/* Level 2 Direct Dependency Edges & Port Connections */}
        {selectedClusterId && renderedEdges.length > 0 && (
          <DirectEdges edges={renderedEdges} />
        )}

        {/* Subtle ground reference grid */}
        <gridHelper args={[160, 40, '#E8DDF5', '#F3DCE5']} position={[0, -0.05, 0]} />
      </Canvas>
    </div>
  );
}
