from datetime import datetime
from enum import Enum
from typing import Dict, List, Literal, Optional, Union
from pydantic import BaseModel, Field


class NodeType(str, Enum):
    SOURCE_FILE = "source_file"
    CONFIGURATION = "configuration"
    EXTERNAL_PACKAGE = "external_package"
    UNRESOLVED_TARGET = "unresolved_target"


class ResolutionType(str, Enum):
    RELATIVE = "relative"
    TSCONFIG_ALIAS = "tsconfig_alias"
    PYTHON_PACKAGE = "python_package"
    PYTHON_STDLIB = "python_stdlib"
    EXTERNAL = "external"
    DYNAMIC = "dynamic"
    UNRESOLVED = "unresolved"


class FileNode(BaseModel):
    """Level 2 Node: Source or Configuration file."""
    id: str = Field(..., description="Canonical path, e.g. 'src/auth/jwt.ts'")
    name: str = Field(..., description="File basename, e.g. 'jwt.ts'")
    path: str
    extension: str
    cluster_id: str
    node_type: Literal[NodeType.SOURCE_FILE, NodeType.CONFIGURATION] = NodeType.SOURCE_FILE
    loc: int = 0
    symbols: List[str] = Field(default_factory=list)
    exports: List[str] = Field(default_factory=list)
    inferred_role: str = "Unclassified"
    is_inferred: bool = True
    evidence_tags: List[str] = Field(default_factory=list)
    direct_dependency_count: int = 0
    direct_dependent_count: int = 0


class ExternalPackageNode(BaseModel):
    """Level 2 Node: External dependency package (Leaf sink)."""
    id: str = Field(..., description="e.g. 'pkg:express' or 'pkg:sys'")
    name: str
    node_type: Literal[NodeType.EXTERNAL_PACKAGE] = NodeType.EXTERNAL_PACKAGE
    cluster_id: str = "external_dependencies"
    is_stdlib: bool = False


class UnresolvedTargetNode(BaseModel):
    """Level 2 Node: Unresolved or ambiguous import target."""
    id: str = Field(..., description="e.g. 'unresolved:src/routes/auth.ts:./missing'")
    raw_import_string: str
    importer_file_id: str
    node_type: Literal[NodeType.UNRESOLVED_TARGET] = NodeType.UNRESOLVED_TARGET
    cluster_id: str = "unresolved"
    is_dynamic: bool = False


AnyGraphNode = Union[FileNode, ExternalPackageNode, UnresolvedTargetNode]


class DependencyEdge(BaseModel):
    """Level 2 Edge: Direct import statement relationship."""
    id: str = Field(..., description="{source}->{target}:{hash}")
    source: str
    target: str
    import_statement: str
    is_resolved: bool
    is_dynamic: bool = False
    resolution_type: ResolutionType


class BoundaryPort(BaseModel):
    """Level 3 Boundary Port: Inter-cluster interface connector."""
    id: str = Field(..., description="port:{cluster_id}:{target_cluster_id}:{ingress|egress}")
    cluster_id: str
    target_cluster_id: str
    port_type: Literal["ingress", "egress"]
    associated_edge_ids: List[str] = Field(default_factory=list)
    internal_file_ids: List[str] = Field(default_factory=list)
    external_file_ids: List[str] = Field(default_factory=list)
    connection_count: int = 0


class AggregatedConduit(BaseModel):
    """Level 1 Conduit: Aggregated connection between two clusters."""
    id: str = Field(..., description="conduit:{source_cluster}->{target_cluster}")
    source_cluster_id: str
    target_cluster_id: str
    direct_edge_count: int = 0
    indirect_path_count: int = 0
    direct_edge_ids: List[str] = Field(default_factory=list)
    indirect_paths: List[List[str]] = Field(default_factory=list)


class ClusterGroup(BaseModel):
    """Level 1 Cluster: Architectural group."""
    id: str
    label: str
    description: str
    file_count: int
    internal_file_ids: List[str] = Field(default_factory=list)
    boundary_port_ids: List[str] = Field(default_factory=list)


class AnalysisTelemetry(BaseModel):
    syntax_parse_count: int = 0
    extracted_imports_count: int = 0
    resolved_dependencies_count: int = 0
    unresolved_dependencies_count: int = 0
    parse_duration_ms: float = 0.0


class IngestionMetadata(BaseModel):
    repository_id: str
    commit_sha: str
    branch: str
    analyzed_at: datetime
    is_truncated: bool = False
    scanned_file_count: int = 0
    observed_byte_count: int = 0
    total_repository_file_count: Optional[int] = None
    language_breakdown: Dict[str, int] = Field(default_factory=dict)
    truncation_reason: Optional[str] = None


class ArchitectureGraphResponse(BaseModel):
    """Complete validated 3-Level Architecture Payload."""
    metadata: IngestionMetadata
    telemetry: AnalysisTelemetry
    clusters: List[ClusterGroup]
    conduits: List[AggregatedConduit]
    nodes: List[AnyGraphNode]
    edges: List[DependencyEdge]
    boundary_ports: List[BoundaryPort]


class DerivedRelationship(BaseModel):
    """
    Bounded, evidence-backed multi-hop indirect relationship between files.
    Always backed by concrete direct dependency edges.
    """
    source_id: str = Field(..., description="Source file ID")
    target_id: str = Field(..., description="Target file ID")
    hop_count: int = Field(..., ge=2, le=3, description="Distance in hops (2 or 3)")
    intermediate_file_ids: List[str] = Field(..., description="Intermediate file IDs traversed")
    full_path: List[str] = Field(..., description="Ordered file path from source to target")
    underlying_direct_edge_ids: List[str] = Field(..., description="Concrete direct DependencyEdge IDs for each hop")


class FileRelationshipsResponse(BaseModel):
    """
    Selected-file dependency and dependent model.
    Authoritatively distinguishes direct AST edges from derived indirect reachability.
    """
    selected_file_id: str
    cluster_id: str
    direct_dependencies: List[DependencyEdge] = Field(
        default_factory=list,
        description="Direct imports made by this file (outgoing AST edges)"
    )
    direct_dependents: List[DependencyEdge] = Field(
        default_factory=list,
        description="Files directly importing this file (incoming AST edges)"
    )
    derived_indirect_dependencies: List[DerivedRelationship] = Field(
        default_factory=list,
        description="Files reachable through 2-3 hops with evidence edge IDs"
    )
    derived_indirect_dependents: List[DerivedRelationship] = Field(
        default_factory=list,
        description="Files reaching this file through 2-3 hops with evidence edge IDs"
    )
