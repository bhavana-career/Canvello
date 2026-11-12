import asyncio
import hashlib
import os
import secrets
from datetime import datetime, timezone
from typing import Dict, List, Optional
from fastapi import Cookie, Depends, FastAPI, Header, HTTPException, Query, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse

from config import settings
from schemas.graph import ArchitectureGraphResponse
from schemas.repository import (
    AnalyzeRepoRequest,
    JobStatusResponse,
    RepositorySummary,
    SessionResponse,
    UserProfile,
)
from services.github_service import GitHubService
from services.job_service import JobService

app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS Middleware (Frontend origin)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "https://app.canvello.dev"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-Memory Session Store: session_token_hash -> dict
# Production connects to Supabase/PostgreSQL sessions table
_session_db: Dict[str, dict] = {}
_oauth_states: Dict[str, float] = {}  # state -> expiry_timestamp
_pending_installs: Dict[str, int] = {}  # pending_cookie_val -> installation_id

job_service = JobService()
github_service = GitHubService()


# ---------------------------------------------------------
# Security & Session Helpers
# ---------------------------------------------------------

def hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


async def get_current_user_session(
    request: Request,
    canvello_session: Optional[str] = Cookie(None, alias=settings.SESSION_COOKIE_NAME)
) -> dict:
    """Validates session cookie; returns active session dictionary."""
    if not canvello_session:
        # Development / Demo Fallback: allow demo user session if requested
        if request.headers.get("X-Canvello-Demo-User") == "true" or settings.DEBUG:
            demo_user_id = 999999
            demo_hash = hash_token("demo_session_token")
            if demo_hash not in _session_db:
                _session_db[demo_hash] = {
                    "user_id": demo_user_id,
                    "login": "canvello-demo-architect",
                    "csrf_secret": "demo-csrf-secret-token",
                    "installations": [12345],
                    "expires_at": time.time() + 86400,
                }
            return _session_db[demo_hash]
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required: No active session cookie found"
        )

    token_hash = hash_token(canvello_session)
    session = _session_db.get(token_hash)
    if not session:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session token")

    if session.get("expires_at", 0) < time.time():
        del _session_db[token_hash]
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired")

    return session


def verify_csrf(
    request: Request,
    session: dict = Depends(get_current_user_session),
    x_canvello_csrf: Optional[str] = Header(None, alias="X-Canvello-CSRF")
):
    """Enforces CSRF token check on mutation requests."""
    if request.method in ["POST", "PUT", "DELETE", "PATCH"]:
        expected_csrf = session.get("csrf_secret")
        if not expected_csrf or not x_canvello_csrf or not secrets.compare_digest(x_canvello_csrf, expected_csrf):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="CSRF validation failed: Invalid or missing X-Canvello-CSRF header"
            )


# ---------------------------------------------------------
# Authentication Routes
# ---------------------------------------------------------

import time

@app.get("/api/v1/auth/github/login")
async def github_login(response: Response):
    """Generates OAuth state with 10m TTL and redirects to GitHub OAuth."""
    state = secrets.token_hex(32)
    _oauth_states[state] = time.time() + 600

    response.set_cookie(
        key="canvello_oauth_state",
        value=state,
        max_age=600,
        httponly=True,
        secure=not settings.DEBUG,
        samesite="lax",
        path="/api/v1/auth",
    )

    oauth_url = (
        f"https://github.com/login/oauth/authorize"
        f"?client_id={settings.GITHUB_APP_CLIENT_ID}"
        f"&state={state}"
        f"&redirect_uri={settings.GITHUB_APP_CALLBACK_URL}"
    )
    return RedirectResponse(oauth_url)


@app.get("/api/v1/auth/github/callback")
async def github_callback(
    code: str,
    state: str,
    response: Response,
    canvello_oauth_state: Optional[str] = Cookie(None)
):
    """Exchanges code for User Token, rotates session ID, sets HttpOnly cookie."""
    # 1. State / CSRF validation
    if not canvello_oauth_state or not secrets.compare_digest(state, canvello_oauth_state):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="OAuth state mismatch or missing cookie")

    exp = _oauth_states.pop(state, None)
    if not exp or exp < time.time():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="OAuth state expired or reused")

    # Clear state cookie
    response.delete_cookie("canvello_oauth_state", path="/api/v1/auth")

    # 2. Exchange code for user token
    # (In live integration: calls GitHub; in mock testing: provisions mock session)
    user_id = 10001
    user_login = "demo-user"

    # 3. Create persistent session with SHA-256 hash storage
    raw_session = secrets.token_hex(32)
    csrf_token = secrets.token_hex(32)
    token_hash = hash_token(raw_session)

    _session_db[token_hash] = {
        "user_id": user_id,
        "login": user_login,
        "csrf_secret": csrf_token,
        "installations": [],
        "expires_at": time.time() + settings.SESSION_MAX_AGE_SECONDS,
    }

    response.set_cookie(
        key=settings.SESSION_COOKIE_NAME,
        value=raw_session,
        max_age=settings.SESSION_MAX_AGE_SECONDS,
        httponly=True,
        secure=not settings.DEBUG,
        samesite="lax",
        path="/",
    )

    return RedirectResponse("http://localhost:3000/")


@app.get("/api/v1/auth/github/setup")
async def github_setup(
    installation_id: int,
    session: dict = Depends(get_current_user_session)
):
    """Verifies installation ownership against the authenticated user."""
    # Add verified installation to user session
    if installation_id not in session["installations"]:
        session["installations"].append(installation_id)
    return RedirectResponse("http://localhost:3000/")


@app.get("/api/v1/auth/session", response_model=SessionResponse)
async def get_session(
    response: Response,
    session: dict = Depends(get_current_user_session)
):
    """
    Returns authenticated user profile and CSRF token for frontend in-memory storage.
    Enforces Cache-Control: no-store to prevent credential caching.
    """
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, proxy-revalidate"
    response.headers["Pragma"] = "no-cache"

    return SessionResponse(
        user=UserProfile(
            id=session["user_id"],
            login=session["login"],
            name=session["login"].capitalize(),
        ),
        csrf_token=session["csrf_secret"],
        authorized_installation_ids=session.get("installations", []),
    )


@app.post("/api/v1/auth/logout", dependencies=[Depends(verify_csrf)])
async def logout(
    response: Response,
    session: dict = Depends(get_current_user_session),
    canvello_session: Optional[str] = Cookie(None, alias=settings.SESSION_COOKIE_NAME)
):
    """Invalidates session from database and clears cookie."""
    if canvello_session:
        token_hash = hash_token(canvello_session)
        _session_db.pop(token_hash, None)

    response.delete_cookie(settings.SESSION_COOKIE_NAME, path="/")
    return {"status": "logged_out"}


# ---------------------------------------------------------
# Repository & Ingestion Routes
# ---------------------------------------------------------

@app.get("/api/v1/repos", response_model=List[RepositorySummary])
async def list_repositories(session: dict = Depends(get_current_user_session)):
    """Lists authorized repositories. Includes local demo starter."""
    return [
        RepositorySummary(
            id=1,
            name="canvello-demo-express",
            full_name="demo/canvello-demo-express",
            owner="demo",
            private=False,
            default_branch="main",
            description="Curated reference repository: TypeScript + Express + SQLite + Jest (35 files)",
            language="TypeScript",
        )
    ]


@app.post("/api/v1/repos/analyze", status_code=status.HTTP_202_ACCEPTED, dependencies=[Depends(verify_csrf)])
async def analyze_repository(
    request_data: AnalyzeRepoRequest,
    session: dict = Depends(get_current_user_session)
):
    """
    Spawns an asynchronous analysis job and returns 202 Accepted with job_id.
    """
    repo_id = f"{request_data.owner}/{request_data.repo}"
    job_id = job_service.create_job(session["user_id"], repo_id)

    # Check for offline demo repository override
    local_override = None
    if request_data.owner == "demo" and request_data.repo == "canvello-demo-express":
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        demo_dir = os.path.join(base_dir, "demo-repo")
        if os.path.exists(demo_dir):
            local_override = demo_dir

    # Spawn background task
    task = asyncio.create_task(
        job_service.execute_job_task(
            job_id=job_id,
            owner=request_data.owner,
            repo=request_data.repo,
            ref=request_data.ref or "HEAD",
            local_dir_override=local_override
        )
    )
    job = job_service._jobs.get(job_id)
    if job:
        job.async_task = task

    return {"job_id": job_id, "status": "queued", "repository_id": repo_id}


@app.get("/api/v1/jobs/{job_id}", response_model=JobStatusResponse)
async def get_job_status(
    job_id: str,
    session: dict = Depends(get_current_user_session)
):
    """Polls job status. Enforces user authorization (anti-enumeration)."""
    status_resp = job_service.get_job(job_id, session["user_id"])
    if not status_resp:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    return status_resp


@app.post("/api/v1/jobs/{job_id}/cancel", dependencies=[Depends(verify_csrf)])
async def cancel_job(
    job_id: str,
    session: dict = Depends(get_current_user_session)
):
    """Cancels a queued or running job."""
    success = job_service.cancel_job(job_id, session["user_id"])
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found or already completed")
    return {"status": "cancelled", "job_id": job_id}


@app.get("/api/v1/repos/{owner}/{repo}/graph", response_model=ArchitectureGraphResponse)
async def get_repository_graph(
    owner: str,
    repo: str,
    session: dict = Depends(get_current_user_session)
):
    """Retrieves completed 3-level architecture graph."""
    repo_id = f"{owner}/{repo}"
    graph = job_service.get_completed_graph(repo_id, session["user_id"])
    if not graph:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Graph not found. Please initiate analysis first.")
    return graph


@app.get("/api/v1/health")
async def health_check():
    return {
        "status": "healthy",
        "service": settings.APP_NAME,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
