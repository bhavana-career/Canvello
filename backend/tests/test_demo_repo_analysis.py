import os
import pytest
from services.github_service import GitHubService
from services.graph_service import GraphService
from services.parser_service import ParserService
from services.resolver_service import ResolverService


def test_full_demo_repo_deterministic_analysis():
    # Locate demo-repo path
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    demo_dir = os.path.join(base_dir, "demo-repo")
    assert os.path.exists(demo_dir), f"Demo repository missing at {demo_dir}"

    github_service = GitHubService()
    parser_service = ParserService()
    graph_service = GraphService()

    # 1. Ingest
    ingest_res = github_service.load_from_local_directory(demo_dir)
    assert ingest_res.scanned_file_count == 35, f"Expected 35 files, got {ingest_res.scanned_file_count}"
    assert "tsconfig.json" in ingest_res.config_files
    assert "package.json" in ingest_res.config_files

    # 2. Parse AST
    parsed_files = {}
    for path, content in ingest_res.source_files.items():
        parsed_files[path] = parser_service.parse_file(path, content)

    # 3. Resolve & Build Graph
    all_paths = set(ingest_res.source_files.keys()).union(set(ingest_res.config_files.keys()))
    resolver = ResolverService(all_paths, ingest_res.config_files)

    clusters, conduits, nodes, edges, ports, telemetry = graph_service.build_architecture_graph(
        parsed_files, resolver, ingest_res.config_files
    )

    # 4. Verify Assertions
    cluster_ids = {c.id for c in clusters}
    expected_clusters = {"controllers", "middleware", "persistence", "services", "configuration", "testing", "utilities"}
    for exp in expected_clusters:
        assert exp in cluster_ids, f"Expected cluster '{exp}' missing from {cluster_ids}"

    # Verify Level 1 Conduits exist
    assert len(conduits) > 0, "Expected conduits between clusters"
    conduit_pairs = {(c.source_cluster_id, c.target_cluster_id) for c in conduits}
    assert ("controllers", "services") in conduit_pairs or ("routes", "controllers") in conduit_pairs or ("controllers", "persistence") in conduit_pairs

    # Verify Level 2 Nodes & Edges
    assert len(nodes) >= 35
    assert len(edges) > 20
    assert telemetry.syntax_parse_count > 25
    assert telemetry.resolved_dependencies_count > 20

    # Verify Level 3 Boundary Ports
    assert len(ports) > 0, "Expected Level 3 boundary ports to be generated"
    for p in ports:
        assert len(p.associated_edge_ids) > 0, f"Port {p.id} has no associated edge IDs"

    # Verify all edge targets exist in nodes
    node_ids = {n.id for n in nodes}
    for edge in edges:
        assert edge.target in node_ids, f"Edge target {edge.target} is missing from declared nodes"
