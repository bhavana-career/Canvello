'use client';

import React, { useState } from 'react';

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
  const [selectedFileId, setSelectedFileId] = useState<string>(
    graph?.nodes?.find((n) => n.node_type === 'source_file')?.id || ''
  );
  const [relationships, setRelationships] = useState<any>(null);
  const [loadingRel, setLoadingRel] = useState<boolean>(false);

  if (!graph) return null;

  const sourceFiles = graph.nodes.filter(
    (n) => n.node_type === 'source_file' || n.node_type === 'configuration'
  );

  const fetchRelationships = async (fileId: string) => {
    setSelectedFileId(fileId);
    setLoadingRel(true);
    try {
      const res = await fetch(
        `http://localhost:8000/api/v1/repos/demo/canvello-demo-express/relationships?file_id=${encodeURIComponent(fileId)}`,
        { headers: { 'X-Canvello-Demo-User': 'true' } }
      );
      if (res.ok) {
        const data = await res.json();
        setRelationships(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingRel(false);
    }
  };

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

      {/* Selected File Dependency & Dependent Model */}
      <section style={{ padding: '1.5rem', background: '#FFFFFF', borderRadius: '8px', border: '2px solid #9B82C4' }}>
        <h3 style={{ margin: '0 0 0.5rem 0', color: '#29152F' }}>File-Centric Dependency & Relationship Inspector</h3>
        <p style={{ fontSize: '0.85rem', color: '#9B82C4', margin: '0 0 1rem 0' }}>
          Select a file to inspect direct dependencies/dependents and bounded, evidence-backed indirect relationships.
        </p>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1.5rem' }}>
          <select
            value={selectedFileId}
            onChange={(e) => fetchRelationships(e.target.value)}
            style={{ padding: '0.5rem 1rem', borderRadius: '6px', border: '1px solid #9B82C4', color: '#29152F', background: '#F8F9FA' }}
          >
            <option value="">-- Choose a file --</option>
            {sourceFiles.map((f) => (
              <option key={f.id} value={f.id}>
                {f.id} ({f.cluster_id})
              </option>
            ))}
          </select>
          <button
            onClick={() => selectedFileId && fetchRelationships(selectedFileId)}
            style={{ padding: '0.5rem 1rem', background: '#29152F', color: '#FFFFFF', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
          >
            {loadingRel ? 'Querying...' : 'Inspect Selected File'}
          </button>
        </div>

        {relationships && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
            {/* Direct Dependencies */}
            <div style={{ padding: '1rem', background: '#F8F9FA', borderRadius: '6px', border: '1px solid #E8DDF5' }}>
              <div style={{ fontWeight: 'bold', color: '#29152F', marginBottom: '0.5rem' }}>
                Direct Dependencies ({relationships.direct_dependencies.length})
              </div>
              <div style={{ fontSize: '0.75rem', color: '#9B82C4', marginBottom: '0.5rem' }}>Direct outgoing AST imports</div>
              {relationships.direct_dependencies.map((d: any) => (
                <div key={d.id} style={{ fontSize: '0.8rem', padding: '0.25rem 0', borderBottom: '1px solid #E8DDF5' }}>
                  <span style={{ color: '#C81D4E' }}>&rarr;</span> <code>{d.target}</code>
                </div>
              ))}
            </div>

            {/* Direct Dependents */}
            <div style={{ padding: '1rem', background: '#F8F9FA', borderRadius: '6px', border: '1px solid #E8DDF5' }}>
              <div style={{ fontWeight: 'bold', color: '#29152F', marginBottom: '0.5rem' }}>
                Direct Dependents ({relationships.direct_dependents.length})
              </div>
              <div style={{ fontSize: '0.75rem', color: '#9B82C4', marginBottom: '0.5rem' }}>Direct incoming AST imports</div>
              {relationships.direct_dependents.map((d: any) => (
                <div key={d.id} style={{ fontSize: '0.8rem', padding: '0.25rem 0', borderBottom: '1px solid #E8DDF5' }}>
                  <span style={{ color: '#29152F' }}>&larr;</span> <code>{d.source}</code>
                </div>
              ))}
            </div>

            {/* Derived Indirect Dependencies */}
            <div style={{ padding: '1rem', background: '#F8F9FA', borderRadius: '6px', border: '1px solid #E8DDF5' }}>
              <div style={{ fontWeight: 'bold', color: '#29152F', marginBottom: '0.5rem' }}>
                Derived Indirect Dependencies ({relationships.derived_indirect_dependencies.length})
              </div>
              <div style={{ fontSize: '0.75rem', color: '#9B82C4', marginBottom: '0.5rem' }}>Reachable via 2-3 hops</div>
              {relationships.derived_indirect_dependencies.map((ind: any, i: number) => (
                <div key={i} style={{ fontSize: '0.75rem', padding: '0.5rem 0', borderBottom: '1px solid #E8DDF5' }}>
                  <div style={{ fontWeight: 'bold', color: '#29152F' }}>{ind.full_path.join(' &rarr; ')}</div>
                  <div style={{ color: '#9B82C4' }}>Underlying edges: {ind.underlying_direct_edge_ids.length}</div>
                </div>
              ))}
            </div>

            {/* Derived Indirect Dependents */}
            <div style={{ padding: '1rem', background: '#F8F9FA', borderRadius: '6px', border: '1px solid #E8DDF5' }}>
              <div style={{ fontWeight: 'bold', color: '#29152F', marginBottom: '0.5rem' }}>
                Derived Indirect Dependents ({relationships.derived_indirect_dependents.length})
              </div>
              <div style={{ fontSize: '0.75rem', color: '#9B82C4', marginBottom: '0.5rem' }}>Reaching this file in 2-3 hops</div>
              {relationships.derived_indirect_dependents.map((ind: any, i: number) => (
                <div key={i} style={{ fontSize: '0.75rem', padding: '0.5rem 0', borderBottom: '1px solid #E8DDF5' }}>
                  <div style={{ fontWeight: 'bold', color: '#29152F' }}>{ind.full_path.join(' &rarr; ')}</div>
                  <div style={{ color: '#9B82C4' }}>Underlying edges: {ind.underlying_direct_edge_ids.length}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

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
