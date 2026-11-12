import asyncio
import time
import uuid
from datetime import datetime, timezone
from typing import Dict, Optional
from schemas.graph import ArchitectureGraphResponse, IngestionMetadata
from schemas.repository import JobStatusResponse
from services.github_service import GitHubService
from services.graph_service import GraphService
from services.parser_service import ParserService
from services.resolver_service import ResolverService


class AnalysisJob:
    def __init__(self, job_id: str, user_id: int, repository_id: str):
        self.job_id: str = job_id
        self.user_id: int = user_id
        self.repository_id: str = repository_id
        self.status: str = "queued"
        self.current_step: Optional[str] = "initialized"
        self.progress_percentage: int = 0
        self.error: Optional[str] = None
        self.created_at: datetime = datetime.now(timezone.utc)
        self.updated_at: datetime = datetime.now(timezone.utc)
        self.last_heartbeat: float = time.time()
        self.result_graph: Optional[ArchitectureGraphResponse] = None
        self.async_task: Optional[asyncio.Task] = None


class JobService:
    def __init__(self):
        self._jobs: Dict[str, AnalysisJob] = {}
        self.github_service = GitHubService()
        self.parser_service = ParserService()
        self.graph_service = GraphService()

    def create_job(self, user_id: int, repository_id: str) -> str:
        job_id = f"job_{uuid.uuid4().hex[:12]}"
        job = AnalysisJob(job_id, user_id, repository_id)
        self._jobs[job_id] = job
        return job_id

    def get_job(self, job_id: str, requesting_user_id: int) -> Optional[JobStatusResponse]:
        job = self._jobs.get(job_id)
        if not job:
            return None
        # Enforce user authorization (anti-enumeration)
        if job.user_id != requesting_user_id:
            return None

        # Watchdog: check for stalled worker
        if job.status == "running" and (time.time() - job.last_heartbeat > 30.0):
            job.status = "failed"
            job.error = "WORKER_HEARTBEAT_TIMEOUT: Execution exceeded 30s without progress"
            job.updated_at = datetime.now(timezone.utc)

        result_url = f"/api/v1/repos/{job.repository_id}/graph" if job.status == "completed" else None

        return JobStatusResponse(
            job_id=job.job_id,
            repository_id=job.repository_id,
            status=job.status,
            current_step=job.current_step,
            progress_percentage=job.progress_percentage,
            error=job.error,
            created_at=job.created_at,
            updated_at=job.updated_at,
            result_graph_url=result_url,
        )

    def cancel_job(self, job_id: str, requesting_user_id: int) -> bool:
        job = self._jobs.get(job_id)
        if not job or job.user_id != requesting_user_id:
            return False

        if job.status in ["queued", "running"]:
            job.status = "cancelled"
            job.error = "JOB_CANCELLED_BY_USER"
            job.updated_at = datetime.now(timezone.utc)
            if job.async_task and not job.async_task.done():
                job.async_task.cancel()
            return True
        return False

    def get_completed_graph(self, repository_id: str, requesting_user_id: int) -> Optional[ArchitectureGraphResponse]:
        # Find latest completed job for this repo and user
        matching_jobs = [
            j for j in self._jobs.values()
            if j.repository_id == repository_id and j.user_id == requesting_user_id and j.status == "completed"
        ]
        if not matching_jobs:
            return None
        matching_jobs.sort(key=lambda j: j.created_at, reverse=True)
        return matching_jobs[0].result_graph

    async def execute_job_task(
        self,
        job_id: str,
        owner: str,
        repo: str,
        ref: str = "HEAD",
        installation_token: Optional[str] = None,
        local_dir_override: Optional[str] = None
    ):
        job = self._jobs.get(job_id)
        if not job or job.status == "cancelled":
            return

        job.status = "running"
        job.current_step = "fetching_tree"
        job.progress_percentage = 15
        job.last_heartbeat = time.time()
        job.updated_at = datetime.now(timezone.utc)

        start_time = time.perf_counter()

        try:
            # 1. Ingest repository files
            if local_dir_override:
                ingest_res = self.github_service.load_from_local_directory(local_dir_override)
            else:
                ingest_res = await self.github_service.ingest_repository(owner, repo, ref=ref, token=installation_token)

            if job.status == "cancelled":
                job.result_graph = None
                return

            job.current_step = "parsing_ast"
            job.progress_percentage = 45
            job.last_heartbeat = time.time()
            job.updated_at = datetime.now(timezone.utc)

            # 2. Parse AST using Tree-sitter
            parsed_files = {}
            for path, raw_bytes in ingest_res.source_files.items():
                if job.status == "cancelled":
                    job.result_graph = None
                    return
                parsed_files[path] = self.parser_service.parse_file(path, raw_bytes)

            if job.status == "cancelled":
                job.result_graph = None
                return

            job.current_step = "building_graph"
            job.progress_percentage = 75
            job.last_heartbeat = time.time()
            job.updated_at = datetime.now(timezone.utc)

            # 3. Resolve imports and build Hybrid Graph
            all_paths = set(ingest_res.source_files.keys()).union(set(ingest_res.config_files.keys()))
            resolver = ResolverService(all_paths, ingest_res.config_files)

            clusters, conduits, nodes, edges, ports, telemetry = self.graph_service.build_architecture_graph(
                parsed_files, resolver, ingest_res.config_files
            )

            if job.status == "cancelled":
                job.result_graph = None
                return

            telemetry.parse_duration_ms = (time.perf_counter() - start_time) * 1000.0

            metadata = IngestionMetadata(
                repository_id=f"{owner}/{repo}",
                commit_sha=ingest_res.commit_sha,
                branch=ingest_res.branch,
                analyzed_at=datetime.now(timezone.utc),
                is_truncated=ingest_res.is_truncated,
                scanned_file_count=ingest_res.scanned_file_count,
                observed_byte_count=ingest_res.observed_byte_count,
                total_repository_file_count=ingest_res.total_repository_file_count,
                language_breakdown=ingest_res.language_breakdown,
                truncation_reason=ingest_res.truncation_reason,
            )

            if job.status == "cancelled":
                job.result_graph = None
                return

            job.result_graph = ArchitectureGraphResponse(
                metadata=metadata,
                telemetry=telemetry,
                clusters=clusters,
                conduits=conduits,
                nodes=nodes,
                edges=edges,
                boundary_ports=ports,
            )

            job.status = "completed"
            job.current_step = "done"
            job.progress_percentage = 100
            job.updated_at = datetime.now(timezone.utc)

        except asyncio.CancelledError:
            job.status = "cancelled"
            job.error = "JOB_CANCELLED_BY_USER"
            job.result_graph = None
            job.updated_at = datetime.now(timezone.utc)
        except Exception as e:
            job.status = "failed"
            job.error = str(e)
            job.updated_at = datetime.now(timezone.utc)
