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
