import hashlib
from typing import Dict, List, Set, Tuple
import networkx as nx
from schemas.graph import (
    AggregatedConduit,
    AnalysisTelemetry,
    AnyGraphNode,
    BoundaryPort,
    ClusterGroup,
    DependencyEdge,
    DerivedRelationship,
    ExternalPackageNode,
    FileNode,
    FileRelationshipsResponse,
    NodeType,
    ResolutionType,
    UnresolvedTargetNode,
)
from services.parser_service import ParsedFileInfo
from services.resolver_service import ResolverService


class GraphService:
    def __init__(self):
        pass

    def build_architecture_graph(
        self,
        parsed_files: Dict[str, ParsedFileInfo],
        resolver: ResolverService,
        config_files: Dict[str, str] = None
    ) -> Tuple[List[ClusterGroup], List[AggregatedConduit], List[AnyGraphNode], List[DependencyEdge], List[BoundaryPort], AnalysisTelemetry]:
        """
        Constructs the 3-level architecture graph representation.
        """
        telemetry = AnalysisTelemetry()
        graph = nx.DiGraph()

        nodes_map: Dict[str, AnyGraphNode] = {}
        edges_list: List[DependencyEdge] = []
        cluster_file_map: Dict[str, List[str]] = {}

        # 1. Classify Files into Clusters
        for path, info in parsed_files.items():
            cluster_id, role, evidence = self._classify_file(path, info)
            is_config = path in (config_files or {})
            
            node = FileNode(
                id=path,
                name=path.split("/")[-1],
                path=path,
                extension="." + path.split(".")[-1] if "." in path else "",
                cluster_id=cluster_id,
                node_type=NodeType.CONFIGURATION if is_config else NodeType.SOURCE_FILE,
                loc=info.loc,
                symbols=info.symbols,
                exports=info.exports,
                inferred_role=role,
                is_inferred=True,
                evidence_tags=evidence,
            )
            nodes_map[path] = node
            graph.add_node(path, cluster_id=cluster_id)
            cluster_file_map.setdefault(cluster_id, []).append(path)
            if info.is_valid:
                telemetry.syntax_parse_count += 1

        # 2. Extract & Resolve Dependency Edges
        for path, info in parsed_files.items():
            source_node = nodes_map[path]
            for stmt_text, raw_import, is_dynamic in info.raw_imports:
                telemetry.extracted_imports_count += 1

                # Resolve target
                if path.endswith(".py"):
                    target_id, res_type, is_resolved, dyn = resolver.resolve_py_import(path, raw_import)
                else:
                    target_id, res_type, is_resolved, dyn = resolver.resolve_ts_import(path, raw_import)

                is_dynamic = is_dynamic or dyn
                edge_id = f"{path}->{target_id}:{hashlib.sha256(stmt_text.encode('utf-8')).hexdigest()[:8]}"

                # Ensure target node exists in nodes_map (every edge target MUST resolve to a declared node)
                if target_id not in nodes_map:
                    if target_id.startswith("pkg:"):
                        pkg_name = target_id[4:]
                        pkg_node = ExternalPackageNode(
                            id=target_id,
                            name=pkg_name,
                            node_type=NodeType.EXTERNAL_PACKAGE,
                            cluster_id="external_dependencies",
                            is_stdlib=(res_type == ResolutionType.PYTHON_STDLIB),
                        )
                        nodes_map[target_id] = pkg_node
                        graph.add_node(target_id, cluster_id="external_dependencies")
                        cluster_file_map.setdefault("external_dependencies", []).append(target_id)
                    elif target_id.startswith("unresolved:"):
                        unresolved_node = UnresolvedTargetNode(
                            id=target_id,
                            raw_import_string=raw_import,
                            importer_file_id=path,
                            node_type=NodeType.UNRESOLVED_TARGET,
                            cluster_id="unresolved",
                            is_dynamic=is_dynamic,
                        )
                        nodes_map[target_id] = unresolved_node
                        graph.add_node(target_id, cluster_id="unresolved")
                        cluster_file_map.setdefault("unresolved", []).append(target_id)

                edge = DependencyEdge(
                    id=edge_id,
                    source=path,
                    target=target_id,
                    import_statement=stmt_text,
                    is_resolved=is_resolved,
                    is_dynamic=is_dynamic,
                    resolution_type=res_type,
                )
                edges_list.append(edge)
                graph.add_edge(path, target_id, id=edge_id, edge_obj=edge)

                if is_resolved:
                    telemetry.resolved_dependencies_count += 1
                else:
                    telemetry.unresolved_dependencies_count += 1

        # Populate direct dependency and dependent counts on each FileNode
        for nid, node in nodes_map.items():
            if isinstance(node, FileNode):
                node.direct_dependency_count = graph.out_degree(nid) if graph.has_node(nid) else 0
                node.direct_dependent_count = graph.in_degree(nid) if graph.has_node(nid) else 0

        # 3. Build Level 1 Clusters
        clusters_list: List[ClusterGroup] = []
        cluster_labels = {
            "controllers": ("Controllers & API", "API routes, HTTP handlers, and controller endpoints"),
            "middleware": ("Middleware", "Request interceptors, authentication guards, and error filters"),
            "services": ("Business Services", "Core application logic and domain workflows"),
            "persistence": ("Persistence & Models", "Database repositories, models, schemas, and queries"),
            "configuration": ("Configuration", "Environment settings, tsconfig, and project manifests"),
            "testing": ("Test Suites", "Unit tests, integration specifications, and fixtures"),
            "utilities": ("Utilities & Helpers", "Shared helper functions, validators, and loggers"),
            "external_dependencies": ("External Dependencies", "Third-party libraries and standard modules"),
            "unresolved": ("Unresolved Imports", "Dynamic or missing import targets"),
            "unclassified": ("Unclassified", "Components with insufficient architectural signals"),
        }

        for cid, file_ids in sorted(cluster_file_map.items()):
            label, desc = cluster_labels.get(cid, (cid.capitalize(), f"Components in {cid}"))
            clusters_list.append(
                ClusterGroup(
                    id=cid,
                    label=label,
                    description=desc,
                    file_count=len(file_ids),
                    internal_file_ids=sorted(file_ids),
                    boundary_port_ids=[],
                )
            )

        # 4. Build Level 3 Boundary Ports & Level 1 Conduits
        conduits_map: Dict[Tuple[str, str], AggregatedConduit] = {}
        ports_map: Dict[str, BoundaryPort] = {}

        # Direct cross-cluster edges
        for edge in edges_list:
            src_cluster = nodes_map[edge.source].cluster_id
            tgt_cluster = nodes_map[edge.target].cluster_id

            if src_cluster != tgt_cluster:
                # Conduit
                conduit_key = (src_cluster, tgt_cluster)
                if conduit_key not in conduits_map:
                    conduits_map[conduit_key] = AggregatedConduit(
                        id=f"conduit:{src_cluster}->{tgt_cluster}",
                        source_cluster_id=src_cluster,
                        target_cluster_id=tgt_cluster,
                        direct_edge_count=0,
                        indirect_path_count=0,
                        direct_edge_ids=[],
                        indirect_paths=[],
                    )
                conduit = conduits_map[conduit_key]
                conduit.direct_edge_count += 1
                conduit.direct_edge_ids.append(edge.id)

                # Boundary Ports (Egress on source cluster, Ingress on target cluster)
                egress_port_id = f"port:{src_cluster}:{tgt_cluster}:egress"
                ingress_port_id = f"port:{tgt_cluster}:{src_cluster}:ingress"

                if egress_port_id not in ports_map:
                    ports_map[egress_port_id] = BoundaryPort(
                        id=egress_port_id,
                        cluster_id=src_cluster,
                        target_cluster_id=tgt_cluster,
                        port_type="egress",
                        associated_edge_ids=[],
                        internal_file_ids=[],
                        external_file_ids=[],
                        connection_count=0,
                    )
                egress_port = ports_map[egress_port_id]
                egress_port.associated_edge_ids.append(edge.id)
                if edge.source not in egress_port.internal_file_ids:
                    egress_port.internal_file_ids.append(edge.source)
                if edge.target not in egress_port.external_file_ids:
                    egress_port.external_file_ids.append(edge.target)
                egress_port.connection_count += 1

                if ingress_port_id not in ports_map:
                    ports_map[ingress_port_id] = BoundaryPort(
                        id=ingress_port_id,
                        cluster_id=tgt_cluster,
                        target_cluster_id=src_cluster,
                        port_type="ingress",
                        associated_edge_ids=[],
                        internal_file_ids=[],
                        external_file_ids=[],
                        connection_count=0,
                    )
                ingress_port = ports_map[ingress_port_id]
                ingress_port.associated_edge_ids.append(edge.id)
                if edge.target not in ingress_port.internal_file_ids:
                    ingress_port.internal_file_ids.append(edge.target)
                if edge.source not in ingress_port.external_file_ids:
                    ingress_port.external_file_ids.append(edge.source)
                ingress_port.connection_count += 1

        # 5. Deterministic Bounded Indirect Reachability (Max depth 3, max 10 paths per cluster pair)
        # Note: External packages are sinks and never originate paths
        internal_nodes = [nid for nid, n in nodes_map.items() if n.node_type in (NodeType.SOURCE_FILE, NodeType.CONFIGURATION)]
        internal_subgraph = graph.subgraph(internal_nodes)

        for src_cluster_obj in clusters_list:
            src_cid = src_cluster_obj.id
            if src_cid in ["external_dependencies", "unresolved"]:
                continue

            for tgt_cluster_obj in clusters_list:
                tgt_cid = tgt_cluster_obj.id
                if src_cid == tgt_cid or tgt_cid in ["external_dependencies", "unresolved"]:
                    continue

                conduit_key = (src_cid, tgt_cid)
                src_files = src_cluster_obj.internal_file_ids[:10]  # bounded sample
                tgt_files = set(tgt_cluster_obj.internal_file_ids)

                found_paths: List[List[str]] = []
                for sf in src_files:
                    if sf not in internal_subgraph:
                        continue
                    # Bounded BFS up to depth 3
                    try:
                        lengths = nx.single_source_shortest_path_length(internal_subgraph, sf, cutoff=3)
                        for dest, length in lengths.items():
                            if length >= 2 and dest in tgt_files:
                                # Found an indirect path
                                path = nx.shortest_path(internal_subgraph, sf, dest)
                                found_paths.append(path)
                                if len(found_paths) >= 10:
                                    break
                    except Exception:
                        pass
                    if len(found_paths) >= 10:
                        break

                if found_paths:
                    # Sort deterministically
                    found_paths.sort(key=lambda p: (len(p), p))
                    if conduit_key not in conduits_map:
                        conduits_map[conduit_key] = AggregatedConduit(
                            id=f"conduit:{src_cid}->{tgt_cid}",
                            source_cluster_id=src_cid,
                            target_cluster_id=tgt_cid,
                            direct_edge_count=0,
                            indirect_path_count=0,
                            direct_edge_ids=[],
                            indirect_paths=[],
                        )
                    conduits_map[conduit_key].indirect_path_count = len(found_paths)
                    conduits_map[conduit_key].indirect_paths = found_paths

        # Link boundary ports to cluster objects
        for port in ports_map.values():
            for c in clusters_list:
                if c.id == port.cluster_id and port.id not in c.boundary_port_ids:
                    c.boundary_port_ids.append(port.id)

        all_nodes: List[AnyGraphNode] = list(nodes_map.values())
        all_conduits: List[AggregatedConduit] = list(conduits_map.values())
        all_ports: List[BoundaryPort] = list(ports_map.values())

        return clusters_list, all_conduits, all_nodes, edges_list, all_ports, telemetry

    def extract_file_relationships(
        self,
        file_id: str,
        nodes: List[AnyGraphNode],
        edges: List[DependencyEdge],
        max_depth: int = 3,
        max_paths: int = 15,
    ) -> FileRelationshipsResponse:
        """
        Computes the file-centric dependency and dependent model for a selected file:
        - Direct dependencies (outgoing AST imports)
        - Direct dependents (incoming AST imports)
        - Bounded derived indirect dependencies (depth 2..3) with full edge ID trace
        - Bounded derived indirect dependents (depth 2..3) with full edge ID trace
        """
        nodes_dict = {n.id: n for n in nodes}
        if file_id not in nodes_dict:
            raise ValueError(f"File '{file_id}' not found in architecture graph")

        selected_node = nodes_dict[file_id]
        cluster_id = getattr(selected_node, "cluster_id", "unclassified")

        # 1. Direct dependencies (outgoing) and direct dependents (incoming)
        direct_deps: List[DependencyEdge] = []
        direct_dependents: List[DependencyEdge] = []
        edge_lookup: Dict[Tuple[str, str], List[str]] = {}

        for edge in edges:
            edge_lookup.setdefault((edge.source, edge.target), []).append(edge.id)
            if edge.source == file_id:
                direct_deps.append(edge)
            if edge.target == file_id:
                direct_dependents.append(edge)

        # 2. Reconstruct internal graph for bounded indirect path derivation
        graph = nx.DiGraph()
        for n in nodes:
            graph.add_node(n.id)
        for edge in edges:
            graph.add_edge(edge.source, edge.target, edge_id=edge.id)

        # Internal source subgraph (exclude external packages as intermediaries)
        internal_ids = [
            n.id for n in nodes
            if getattr(n, "node_type", None) in (NodeType.SOURCE_FILE, NodeType.CONFIGURATION)
        ]
        internal_subgraph = graph.subgraph(internal_ids)

        derived_indirect_deps: List[DerivedRelationship] = []
        derived_indirect_deps_targets: Set[str] = set()

        if file_id in internal_subgraph:
            # Shortest paths from selected file (forward reachability)
            try:
                lengths = nx.single_source_shortest_path_length(internal_subgraph, file_id, cutoff=max_depth)
                for dest, dist in sorted(lengths.items(), key=lambda x: (x[1], x[0])):
                    if dist >= 2:
                        path = nx.shortest_path(internal_subgraph, file_id, dest)
                        intermediates = path[1:-1]
                        edge_ids = []
                        for i in range(len(path) - 1):
                            u, v = path[i], path[i + 1]
                            edge_ids.extend(edge_lookup.get((u, v), []))

                        derived_indirect_deps.append(
                            DerivedRelationship(
                                source_id=file_id,
                                target_id=dest,
                                hop_count=dist,
                                intermediate_file_ids=intermediates,
                                full_path=path,
                                underlying_direct_edge_ids=edge_ids,
                            )
                        )
                        derived_indirect_deps_targets.add(dest)
                        if len(derived_indirect_deps) >= max_paths:
                            break
            except Exception:
                pass

        # 3. Derived indirect dependents (reverse reachability into selected file)
        derived_indirect_dependents: List[DerivedRelationship] = []
        if file_id in internal_subgraph:
            reversed_subgraph = internal_subgraph.reverse()
            try:
                rev_lengths = nx.single_source_shortest_path_length(reversed_subgraph, file_id, cutoff=max_depth)
                for src_node, dist in sorted(rev_lengths.items(), key=lambda x: (x[1], x[0])):
                    if dist >= 2:
                        # Path in original graph goes from src_node to file_id
                        path = nx.shortest_path(internal_subgraph, src_node, file_id)
                        intermediates = path[1:-1]
                        edge_ids = []
                        for i in range(len(path) - 1):
                            u, v = path[i], path[i + 1]
                            edge_ids.extend(edge_lookup.get((u, v), []))

                        derived_indirect_dependents.append(
                            DerivedRelationship(
                                source_id=src_node,
                                target_id=file_id,
                                hop_count=dist,
                                intermediate_file_ids=intermediates,
                                full_path=path,
                                underlying_direct_edge_ids=edge_ids,
                            )
                        )
                        if len(derived_indirect_dependents) >= max_paths:
                            break
            except Exception:
                pass

        return FileRelationshipsResponse(
            selected_file_id=file_id,
            cluster_id=cluster_id,
            direct_dependencies=direct_deps,
            direct_dependents=direct_dependents,
            derived_indirect_dependencies=derived_indirect_deps,
            derived_indirect_dependents=derived_indirect_dependents,
        )

    def _classify_file(self, path: str, info: ParsedFileInfo) -> Tuple[str, str, List[str]]:
        """
        Deterministic precedence hierarchy:
        Path prefix > Filename suffix > AST declarations > Import patterns > Fallback
        """
        p = path.lower()
        evidence: List[str] = []

        # STAGE 1: Explicit Path Prefix
        if any(p.startswith(x) or f"/{x}/" in f"/{p}" for x in ["controllers", "routes", "api", "endpoints"]):
            evidence.append("path_prefix:controllers_routes")
            return "controllers", "Controllers & API", evidence

        if any(p.startswith(x) or f"/{x}/" in f"/{p}" for x in ["models", "entities", "schemas", "repositories", "db", "database"]):
            evidence.append("path_prefix:persistence_models")
            return "persistence", "Persistence & Models", evidence

        if any(p.startswith(x) or f"/{x}/" in f"/{p}" for x in ["middleware", "guards", "interceptors"]):
            evidence.append("path_prefix:middleware")
            return "middleware", "Middleware", evidence

        if any(p.startswith(x) or f"/{x}/" in f"/{p}" for x in ["services", "usecases", "domain"]):
            evidence.append("path_prefix:services")
            return "services", "Business Services", evidence

        if any(p.startswith(x) or f"/{x}/" in f"/{p}" for x in ["config", "settings"]):
            evidence.append("path_prefix:configuration")
            return "configuration", "Configuration", evidence

        if any(p.startswith(x) or f"/{x}/" in f"/{p}" for x in ["tests", "__tests__", "spec", "fixtures"]):
            evidence.append("path_prefix:testing")
            return "testing", "Test Suites", evidence

        if any(p.startswith(x) or f"/{x}/" in f"/{p}" for x in ["utils", "helpers", "lib"]):
            evidence.append("path_prefix:utilities")
            return "utilities", "Utilities & Helpers", evidence

        # STAGE 2: Filename Convention Suffix
        if any(p.endswith(x) for x in [".controller.ts", ".controller.js", "_controller.py", ".routes.ts", ".routes.js"]):
            evidence.append("filename_suffix:controller_routes")
            return "controllers", "Controllers & API", evidence

        if any(p.endswith(x) for x in [".model.ts", ".model.js", "_model.py", ".schema.ts", "_schema.py", ".repository.ts"]):
            evidence.append("filename_suffix:persistence_model")
            return "persistence", "Persistence & Models", evidence

        if any(p.endswith(x) for x in [".middleware.ts", ".middleware.js", "_middleware.py"]):
            evidence.append("filename_suffix:middleware")
            return "middleware", "Middleware", evidence

        if any(p.endswith(x) for x in [".service.ts", ".service.js", "_service.py"]):
            evidence.append("filename_suffix:services")
            return "services", "Business Services", evidence

        if any(p.endswith(x) for x in [".test.ts", ".test.js", ".spec.ts", ".spec.js", "_test.py", "test_.py"]):
            evidence.append("filename_suffix:testing")
            return "testing", "Test Suites", evidence

        if any(p.endswith(x) for x in [".config.ts", ".config.js", "tsconfig.json", "package.json", "pyproject.toml"]):
            evidence.append("filename_suffix:configuration")
            return "configuration", "Configuration", evidence

        # STAGE 3: AST Declaration Signals
        for sym in info.symbols:
            s_lower = sym.lower()
            if "controller" in s_lower or "router" in s_lower:
                evidence.append(f"ast_symbol:{sym}")
                return "controllers", "Controllers & API", evidence
            if "model" in s_lower or "entity" in s_lower or "repository" in s_lower:
                evidence.append(f"ast_symbol:{sym}")
                return "persistence", "Persistence & Models", evidence
            if "service" in s_lower:
                evidence.append(f"ast_symbol:{sym}")
                return "services", "Business Services", evidence

        # STAGE 4: Fallback
        evidence.append("fallback:insufficient_signals")
        return "unclassified", "Unclassified", evidence
