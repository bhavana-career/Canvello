'use client';

import React from 'react';

interface ArchitectureGraph {
  metadata: any;
  telemetry: any;
  clusters: any[];
  conduits: any[];
  nodes: any[];
  edges: any[];
  boundary_ports: any[];
}

export function GraphInspector({ graph }: { graph: ArchitectureGraph }) {
  if (!graph) return null;

  return (
    <div style={{ marginTop: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Telemetry Metrics Bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
        <div style={{ padding: '1rem', background: '#F3DCE5', borderRadius: '8px', border: '1px solid #C87A9A' }}>
          <div style={{ fontSize: '0.85rem', color: '#29152F' }}>Level 1 Clusters</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: '#29152F' }}>{graph.clusters.length}</div>
        </div>
        <div style={{ padding: '1rem', background: '#F3DCE5', borderRadius: '8px', border: '1px solid #C87A9A' }}>
          <div style={{ fontSize: '0.85rem', color: '#29152F' }}>Level 1 Conduits</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: '#29152F' }}>{graph.conduits.length}</div>
        </div>
        <div style={{ padding: '1rem', background: '#F3DCE5', borderRadius: '8px', border: '1px solid #C87A9A' }}>
          <div style={{ fontSize: '0.85rem', color: '#29152F' }}>Level 2 Nodes</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: '#29152F' }}>{graph.nodes.length}</div>
        </div>
        <div style={{ padding: '1rem', background: '#F3DCE5', borderRadius: '8px', border: '1px solid #C87A9A' }}>
          <div style={{ fontSize: '0.85rem', color: '#29152F' }}>Level 2 Edges</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: '#29152F' }}>{graph.edges.length}</div>
        </div>
        <div style={{ padding: '1rem', background: '#F3DCE5', borderRadius: '8px', border: '1px solid #C87A9A' }}>
          <div style={{ fontSize: '0.85rem', color: '#29152F' }}>Level 3 Ports</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: '#C81D4E' }}>{graph.boundary_ports.length}</div>
        </div>
      </div>

      {/* Clusters Overview */}
      <div>
        <h3 style={{ color: '#29152F' }}>Level 1 Architectural Clusters</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
          {graph.clusters.map((c) => (
            <div key={c.id} style={{ padding: '1rem', border: '1px solid #9B82C4', borderRadius: '8px', background: '#FFFFFF' }}>
              <div style={{ fontWeight: 'bold', color: '#29152F' }}>{c.label}</div>
              <div style={{ fontSize: '0.8rem', color: '#9B82C4', marginBottom: '0.5rem' }}>{c.description}</div>
              <div style={{ fontSize: '0.85rem', color: '#29152F' }}>Files: {c.file_count}</div>
              <div style={{ fontSize: '0.85rem', color: '#C81D4E' }}>Boundary Ports: {c.boundary_port_ids.length}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Raw JSON Accordion */}
      <details style={{ background: '#F8F9FA', padding: '1rem', borderRadius: '8px', border: '1px solid #E8DDF5' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 'bold', color: '#29152F' }}>
          Inspect Validated 3-Level Graph JSON Schema (Pydantic Output)
        </summary>
        <pre style={{ marginTop: '1rem', fontSize: '0.75rem', maxHeight: '400px', overflow: 'auto', background: '#29152F', color: '#F3DCE5', padding: '1rem', borderRadius: '6px' }}>
          {JSON.stringify(graph, null, 2)}
        </pre>
      </details>
    </div>
  );
}
