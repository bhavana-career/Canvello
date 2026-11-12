import pytest
from fastapi.testclient import TestClient
from main import app, _session_db, hash_token

client = TestClient(app)


def test_health_check_endpoint():
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "service" in data


def test_session_endpoint_with_no_store():
    response = client.get("/api/v1/auth/session", headers={"X-Canvello-Demo-User": "true"})
    assert response.status_code == 200
    assert "no-store" in response.headers.get("Cache-Control", "")
    data = response.json()
    assert "csrf_token" in data
    assert data["user"]["login"] == "canvello-demo-architect"


def test_csrf_rejection_on_mutation():
    # Attempt analyze without CSRF header
    response = client.post(
        "/api/v1/repos/analyze",
        json={"owner": "demo", "repo": "canvello-demo-express"},
        headers={"X-Canvello-Demo-User": "true"},
    )
    assert response.status_code == 403
    assert "CSRF validation failed" in response.json()["detail"]


def test_end_to_end_asynchronous_analysis_flow():
    # 1. Fetch CSRF token from session
    session_resp = client.get("/api/v1/auth/session", headers={"X-Canvello-Demo-User": "true"})
    assert session_resp.status_code == 200
    csrf_token = session_resp.json()["csrf_token"]

    # 2. Trigger asynchronous analysis
    analyze_resp = client.post(
        "/api/v1/repos/analyze",
        json={"owner": "demo", "repo": "canvello-demo-express"},
        headers={
            "X-Canvello-Demo-User": "true",
            "X-Canvello-CSRF": csrf_token,
        },
    )
    assert analyze_resp.status_code == 202
    job_id = analyze_resp.json()["job_id"]
    assert job_id.startswith("job_")

    # 3. Poll job status
    poll_resp = client.get(
        f"/api/v1/jobs/{job_id}",
        headers={"X-Canvello-Demo-User": "true"},
    )
    assert poll_resp.status_code == 200
    job_status = poll_resp.json()["status"]
    assert job_status in ["queued", "running", "completed"]

    # In test synchronous execution or small delay, wait for completion
    import time
    for _ in range(20):
        if job_status == "completed":
            break
        time.sleep(0.2)
        poll_resp = client.get(
            f"/api/v1/jobs/{job_id}",
            headers={"X-Canvello-Demo-User": "true"},
        )
        job_status = poll_resp.json()["status"]

    assert job_status == "completed"

    # 4. Fetch the completed 3-Level Architecture Graph
    graph_resp = client.get(
        "/api/v1/repos/demo/canvello-demo-express/graph",
        headers={"X-Canvello-Demo-User": "true"},
    )
    assert graph_resp.status_code == 200
    graph_data = graph_resp.json()

    assert "clusters" in graph_data
    assert "conduits" in graph_data
    assert "nodes" in graph_data
    assert "edges" in graph_data
    assert "boundary_ports" in graph_data
    assert "metadata" in graph_data
    assert "telemetry" in graph_data

    # Verify Level 1 clusters & conduits
    assert len(graph_data["clusters"]) >= 5
    assert len(graph_data["conduits"]) >= 1

    # Verify Level 2 nodes & edges
    assert len(graph_data["nodes"]) >= 35
    assert len(graph_data["edges"]) >= 20

    # Verify Level 3 boundary ports
    assert len(graph_data["boundary_ports"]) >= 1


def test_job_authorization_anti_enumeration():
    # User B cannot access User A's job
    from main import job_service
    fake_job_id = job_service.create_job(user_id=11111, repository_id="secret/repo")

    # Query job using demo user (user_id = 999999)
    resp = client.get(
        f"/api/v1/jobs/{fake_job_id}",
        headers={"X-Canvello-Demo-User": "true"},
    )
    assert resp.status_code == 404
    assert resp.json()["detail"] == "Job not found"


def test_job_cancellation_lifecycle():
    from main import job_service
    # 1. Acquire CSRF
    session_resp = client.get("/api/v1/auth/session", headers={"X-Canvello-Demo-User": "true"})
    csrf_token = session_resp.json()["csrf_token"]

    # 2. Create job in queued state
    job_id = job_service.create_job(user_id=999999, repository_id="demo/cancel-test")
    assert job_service._jobs[job_id].status == "queued"

    # 3. Cancel queued job
    cancel_resp = client.post(
        f"/api/v1/jobs/{job_id}/cancel",
        headers={
            "X-Canvello-Demo-User": "true",
            "X-Canvello-CSRF": csrf_token,
        },
    )
    assert cancel_resp.status_code == 200
    assert cancel_resp.json()["status"] == "cancelled"

    # Verify status is cancelled and cannot complete
    status_resp = client.get(f"/api/v1/jobs/{job_id}", headers={"X-Canvello-Demo-User": "true"})
    assert status_resp.json()["status"] == "cancelled"


@pytest.mark.anyio
async def test_actively_running_job_cancellation():
    """
    Verifies cancellation while a job is actively executing (running state).
    Ensures async task is cancelled, partial state cleaned up, and late-running task
    CANNOT overwrite 'cancelled' with 'completed'.
    """
    import asyncio
    from main import job_service

    job_id = job_service.create_job(user_id=999999, repository_id="demo/running-cancel-test")
    job = job_service._jobs[job_id]

    async def simulated_running_task():
        job.status = "running"
        job.current_step = "parsing_ast"
        try:
            await asyncio.sleep(2.0)
            if job.status != "cancelled":
                job.status = "completed"
        except asyncio.CancelledError:
            job.status = "cancelled"
            job.error = "JOB_CANCELLED_BY_USER"
            job.result_graph = None

    task = asyncio.create_task(simulated_running_task())
    job.async_task = task

    # Allow task to enter running state
    await asyncio.sleep(0.05)
    assert job.status == "running"

    # Cancel while running
    cancelled = job_service.cancel_job(job_id, requesting_user_id=999999)
    assert cancelled is True
    assert job.status == "cancelled"

    # Await cancellation completion
    try:
        await task
    except asyncio.CancelledError:
        pass

    # Ensure late task completion did NOT overwrite cancelled status
    assert job.status == "cancelled"
    assert job.error == "JOB_CANCELLED_BY_USER"
    assert job.result_graph is None


def test_token_encryption_at_rest():
    from services.token_encryption import encrypt_token_at_rest, decrypt_token_at_rest
    raw_user_token = "ghu_1234567890abcdefABCDEF_sample_token"
    encrypted = encrypt_token_at_rest(raw_user_token)
    assert encrypted != raw_user_token
    assert len(encrypted) > len(raw_user_token)
    decrypted = decrypt_token_at_rest(encrypted)
    assert decrypted == raw_user_token


def test_origin_validation_on_mutation():
    session_resp = client.get("/api/v1/auth/session", headers={"X-Canvello-Demo-User": "true"})
    csrf_token = session_resp.json()["csrf_token"]

    # Request with untrusted origin rejected with 403
    evil_resp = client.post(
        "/api/v1/repos/analyze",
        json={"owner": "demo", "repo": "canvello-demo-express"},
        headers={
            "X-Canvello-Demo-User": "true",
            "X-Canvello-CSRF": csrf_token,
            "Origin": "https://malicious-phishing.com",
        },
    )
    assert evil_resp.status_code == 403
    assert "Origin validation failed" in evil_resp.json()["detail"]

    # Request with trusted origin accepted with 202
    trusted_resp = client.post(
        "/api/v1/repos/analyze",
        json={"owner": "demo", "repo": "canvello-demo-express"},
        headers={
            "X-Canvello-Demo-User": "true",
            "X-Canvello-CSRF": csrf_token,
            "Origin": "http://localhost:3000",
        },
    )
    assert trusted_resp.status_code == 202


def test_selected_file_relationships_endpoint():
    # Ensure demo repo graph is built first
    session_resp = client.get("/api/v1/auth/session", headers={"X-Canvello-Demo-User": "true"})
    csrf_token = session_resp.json()["csrf_token"]

    analyze_resp = client.post(
        "/api/v1/repos/analyze",
        json={"owner": "demo", "repo": "canvello-demo-express"},
        headers={"X-Canvello-Demo-User": "true", "X-Canvello-CSRF": csrf_token},
    )
    job_id = analyze_resp.json()["job_id"]
    import time
    for _ in range(20):
        poll = client.get(f"/api/v1/jobs/{job_id}", headers={"X-Canvello-Demo-User": "true"}).json()
        if poll["status"] == "completed":
            break
        time.sleep(0.1)

    # Test selecting auth.controller.ts
    rel_resp = client.get(
        "/api/v1/repos/demo/canvello-demo-express/relationships?file_id=src/controllers/auth.controller.ts",
        headers={"X-Canvello-Demo-User": "true"},
    )
    assert rel_resp.status_code == 200
    rel_data = rel_resp.json()

    assert rel_data["selected_file_id"] == "src/controllers/auth.controller.ts"
    assert rel_data["cluster_id"] == "controllers"

    # Direct dependencies (auth.controller imports auth.service, logger, validator)
    direct_dep_targets = [d["target"] for d in rel_data["direct_dependencies"]]
    assert "src/services/auth.service.ts" in direct_dep_targets

    # Direct dependents (auth.routes imports auth.controller)
    direct_dependent_sources = [d["source"] for d in rel_data["direct_dependents"]]
    assert "src/routes/auth.routes.ts" in direct_dependent_sources

    # Derived indirect dependencies (e.g. auth.controller -> auth.service -> user.repository)
    derived_deps = rel_data["derived_indirect_dependencies"]
    assert len(derived_deps) > 0
    # Verify underlying direct edge IDs exist for derived relationship
    first_derived = derived_deps[0]
    assert first_derived["hop_count"] >= 2
    assert len(first_derived["underlying_direct_edge_ids"]) >= 2
    assert len(first_derived["full_path"]) >= 3


def test_oauth_state_validation():
    # 1. Login sets cookie and redirect
    login_resp = client.get("/api/v1/auth/github/login", follow_redirects=False)
    assert login_resp.status_code == 307
    assert "canvello_oauth_state" in login_resp.cookies
    state = login_resp.cookies["canvello_oauth_state"]

    # 2. Callback with mismatched state rejected
    mismatch_resp = client.get(
        "/api/v1/auth/github/callback?code=test_code&state=invalid_state_token",
        cookies={"canvello_oauth_state": state},
    )
    assert mismatch_resp.status_code == 400
    assert "state mismatch" in mismatch_resp.json()["detail"]

    # 3. Valid callback succeeds and clears cookie
    valid_resp = client.get(
        f"/api/v1/auth/github/callback?code=test_code&state={state}",
        cookies={"canvello_oauth_state": state},
        follow_redirects=False,
    )
    assert valid_resp.status_code == 307
    assert "canvello_session" in valid_resp.cookies

    # 4. State is single-use: replay attack rejected
    replay_resp = client.get(
        f"/api/v1/auth/github/callback?code=test_code&state={state}",
        cookies={"canvello_oauth_state": state},
    )
    assert replay_resp.status_code == 400
    assert "expired or reused" in replay_resp.json()["detail"]

