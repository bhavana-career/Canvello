import pytest
from schemas.graph import NodeType, ResolutionType
from services.graph_service import GraphService
from services.parser_service import ParsedFileInfo
from services.resolver_service import ResolverService


def test_circular_dependency_graph():
    graph_service = GraphService()

    file_a = ParsedFileInfo("src/a.ts")
    file_a.raw_imports = [("import { b } from './b'", "./b", False)]
    file_a.loc = 5

    file_b = ParsedFileInfo("src/b.ts")
    file_b.raw_imports = [("import { a } from './a'", "./a", False)]
    file_b.loc = 5

    parsed_files = {"src/a.ts": file_a, "src/b.ts": file_b}
    resolver = ResolverService(set(parsed_files.keys()))

    clusters, conduits, nodes, edges, ports, telemetry = graph_service.build_architecture_graph(
        parsed_files, resolver
    )

    assert len(nodes) == 2
    assert len(edges) == 2
    # Verify no infinite loop; both nodes exist
    node_ids = {n.id for n in nodes}
    assert "src/a.ts" in node_ids
    assert "src/b.ts" in node_ids


def test_boundary_ports_and_conduits_created():
    graph_service = GraphService()

    controller = ParsedFileInfo("src/controllers/auth.controller.ts")
    controller.raw_imports = [("import { UserModel } from '../models/user.model'", "../models/user.model", False)]
    controller.loc = 20

    model = ParsedFileInfo("src/models/user.model.ts")
    model.loc = 15

    parsed_files = {
        "src/controllers/auth.controller.ts": controller,
        "src/models/user.model.ts": model,
    }
    resolver = ResolverService(set(parsed_files.keys()))

    clusters, conduits, nodes, edges, ports, telemetry = graph_service.build_architecture_graph(
        parsed_files, resolver
    )

    cluster_ids = {c.id for c in clusters}
    assert "controllers" in cluster_ids
    assert "persistence" in cluster_ids

    # Conduit from controllers -> persistence
    assert len(conduits) == 1
    assert conduits[0].source_cluster_id == "controllers"
    assert conduits[0].target_cluster_id == "persistence"
    assert conduits[0].direct_edge_count == 1

    # Ports: 1 egress on controllers, 1 ingress on persistence
    port_types = {(p.cluster_id, p.port_type) for p in ports}
    assert ("controllers", "egress") in port_types
    assert ("persistence", "ingress") in port_types


def test_external_and_unresolved_targets_declared():
    graph_service = GraphService()

    app_file = ParsedFileInfo("src/app.ts")
    app_file.raw_imports = [
        ("import express from 'express'", "express", False),
        ("import { ghost } from './ghost'", "./ghost", False),
    ]

    parsed_files = {"src/app.ts": app_file}
    resolver = ResolverService({"src/app.ts"})

    clusters, conduits, nodes, edges, ports, telemetry = graph_service.build_architecture_graph(
        parsed_files, resolver
    )

    node_types = {n.node_type for n in nodes}
    assert NodeType.SOURCE_FILE in node_types
    assert NodeType.EXTERNAL_PACKAGE in node_types
    assert NodeType.UNRESOLVED_TARGET in node_types

    # Ensure EVERY edge target is in nodes list
    node_ids = {n.id for n in nodes}
    for e in edges:
        assert e.target in node_ids, f"Edge target {e.target} missing from nodes list!"
