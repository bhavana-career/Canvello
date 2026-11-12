from datetime import datetime
from typing import Dict, List, Optional
from pydantic import BaseModel, Field


class UserProfile(BaseModel):
    id: int
    login: str
    avatar_url: Optional[str] = None
    name: Optional[str] = None


class SessionResponse(BaseModel):
    user: UserProfile
    csrf_token: str
    authorized_installation_ids: List[int] = Field(default_factory=list)


class RepositorySummary(BaseModel):
    id: int
    name: str
    full_name: str
    owner: str
    private: bool
    default_branch: str
    description: Optional[str] = None
    language: Optional[str] = None


class AnalyzeRepoRequest(BaseModel):
    owner: str = Field(..., description="Repository owner/organization")
    repo: str = Field(..., description="Repository name")
    ref: Optional[str] = Field("HEAD", description="Branch name or commit SHA")


class JobStatusResponse(BaseModel):
    job_id: str
    repository_id: str
    status: str  # "queued" | "running" | "completed" | "failed" | "cancelled"
    current_step: Optional[str] = None  # "fetching_tree" | "parsing_ast" | "building_graph"
    progress_percentage: int = 0
    error: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    result_graph_url: Optional[str] = None
