import time
import pytest
import httpx
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives import serialization
from config import settings
from services.github_service import (
    GitHubService,
    GitHubAuthError,
    GitHubInstallationRevokedError,
    GitHubRateLimitExhaustedError,
    GitHubReauthorizationRequiredError,
)


@pytest.fixture(autouse=True)
def setup_test_github_keys(monkeypatch):
    """Generate ephemeral RSA private key for testing JWT and tokens."""
    private_key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=2048,
    )
    pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode("utf-8")

    monkeypatch.setattr(settings, "GITHUB_APP_PRIVATE_KEY", pem)
    monkeypatch.setattr(settings, "GITHUB_APP_ID", "123456")
    monkeypatch.setattr(settings, "GITHUB_APP_CLIENT_ID", "Iv1.test_client_id")
    monkeypatch.setattr(settings, "GITHUB_APP_CLIENT_SECRET", "test_client_secret")


@pytest.mark.anyio
async def test_app_jwt_generation():
    service = GitHubService()
    token = service.generate_app_jwt()
    assert isinstance(token, str)
    assert len(token.split(".")) == 3  # Header.Payload.Signature


@pytest.mark.anyio
async def test_installation_token_scope_and_caching(monkeypatch):
    service = GitHubService()

    call_counts = {"repo1": 0, "repo2": 0}

    async def mock_post(self, url, **kwargs):
        json_data = kwargs.get("json", {})
        repos = json_data.get("repositories", ["all"])
        target = repos[0]
        req = httpx.Request("POST", url)
        if target == "repo1":
            call_counts["repo1"] += 1
            return httpx.Response(
                201,
                json={"token": "ghs_token_repo1", "expires_at": "2030-01-01T00:00:00Z"},
                headers={"x-ratelimit-remaining": "4999"},
                request=req,
            )
        else:
            call_counts["repo2"] += 1
            return httpx.Response(
                201,
                json={"token": "ghs_token_repo2", "expires_at": "2030-01-01T00:00:00Z"},
                headers={"x-ratelimit-remaining": "4998"},
                request=req,
            )

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)

    # 1. Fetch token for owner/repo1
    token1 = await service.get_installation_access_token(999, "owner/repo1")
    assert token1 == "ghs_token_repo1"
    assert call_counts["repo1"] == 1

    # 2. Fetch token for owner/repo1 again (MUST hit cache, no network call)
    token1_cached = await service.get_installation_access_token(999, "owner/repo1")
    assert token1_cached == "ghs_token_repo1"
    assert call_counts["repo1"] == 1

    # 3. Fetch token for owner/repo2 (MUST NOT reuse repo1 token, scope isolation)
    token2 = await service.get_installation_access_token(999, "owner/repo2")
    assert token2 == "ghs_token_repo2"
    assert call_counts["repo2"] == 1
    assert token1 != token2


@pytest.mark.anyio
async def test_installation_token_expiry_renewal(monkeypatch):
    service = GitHubService()
    calls = 0

    async def mock_post(self, url, **kwargs):
        nonlocal calls
        calls += 1
        req = httpx.Request("POST", url)
        from datetime import datetime, timezone, timedelta
        exp = datetime.now(timezone.utc) + timedelta(seconds=200)
        return httpx.Response(
            201,
            json={"token": f"ghs_token_{calls}", "expires_at": exp.isoformat()},
            headers={"x-ratelimit-remaining": "4999"},
            request=req,
        )

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)

    t1 = await service.get_installation_access_token(888, "owner/repo")
    assert t1 == "ghs_token_1"
    assert calls == 1

    # Second call should renew because remaining TTL < 300s
    t2 = await service.get_installation_access_token(888, "owner/repo")
    assert t2 == "ghs_token_2"
    assert calls == 2


@pytest.mark.anyio
async def test_installation_revoked_error(monkeypatch):
    service = GitHubService()

    async def mock_post(self, url, **kwargs):
        return httpx.Response(404, text="Not Found", request=httpx.Request("POST", url))

    async def mock_get(self, url, **kwargs):
        return httpx.Response(404, text="Installation Deleted", request=httpx.Request("GET", url))

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)
    monkeypatch.setattr(httpx.AsyncClient, "get", mock_get)

    with pytest.raises(GitHubInstallationRevokedError) as exc_info:
        await service.get_installation_access_token(777, "owner/repo")
    assert "INSTALLATION_REVOKED" in str(exc_info.value)


@pytest.mark.anyio
async def test_rate_limit_exhausted_error(monkeypatch):
    service = GitHubService()

    async def mock_post(self, url, **kwargs):
        return httpx.Response(
            403,
            headers={"x-ratelimit-remaining": "0"},
            text="Rate limit exceeded",
            request=httpx.Request("POST", url),
        )

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)

    with pytest.raises(GitHubRateLimitExhaustedError) as exc_info:
        await service.get_installation_access_token(666, "owner/repo")
    assert "GITHUB_RATE_LIMIT_EXHAUSTED" in str(exc_info.value)


@pytest.mark.anyio
async def test_oauth_exchange_and_user_token_refresh(monkeypatch):
    service = GitHubService()

    async def mock_post(self, url, **kwargs):
        json_data = kwargs.get("json", {})
        req = httpx.Request("POST", url)
        if json_data.get("grant_type") == "refresh_token":
            return httpx.Response(
                200,
                json={"access_token": "ghu_refreshed", "refresh_token": "ghr_new"},
                request=req,
            )
        return httpx.Response(
            200,
            json={"access_token": "ghu_initial", "refresh_token": "ghr_initial"},
            request=req,
        )

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)

    token_data = await service.exchange_oauth_code_for_user_token("temp_code_123")
    assert token_data["access_token"] == "ghu_initial"
    assert token_data["refresh_token"] == "ghr_initial"

    refreshed = await service.refresh_user_access_token("ghr_initial")
    assert refreshed["access_token"] == "ghu_refreshed"


@pytest.mark.anyio
async def test_installation_ownership_verification(monkeypatch):
    service = GitHubService()

    async def mock_get(self, url, **kwargs):
        return httpx.Response(
            200,
            json={"installations": [{"id": 1111}, {"id": 2222}]},
            request=httpx.Request("GET", url),
        )

    monkeypatch.setattr(httpx.AsyncClient, "get", mock_get)

    assert await service.verify_installation_ownership("ghu_valid", 1111) is True
    assert await service.verify_installation_ownership("ghu_valid", 9999) is False


@pytest.mark.anyio
async def test_tree_truncation_recovery(monkeypatch):
    service = GitHubService()

    async def mock_get(self, url, **kwargs):
        req = httpx.Request("GET", url)
        if "commits/HEAD" in url:
            return httpx.Response(200, json={"sha": "c0ffee"}, request=req)
        if "trees/c0ffee?recursive=1" in url:
            # First attempt returns truncated = True
            return httpx.Response(200, json={"truncated": True, "tree": []}, request=req)
        if "trees/c0ffee" in url:
            # Root tree fetch returns 1 directory tree item
            return httpx.Response(200, json={"tree": [{"path": "src", "type": "tree", "sha": "tree_src_sha"}]}, request=req)
        if "trees/tree_src_sha" in url:
            # Subtree returns 1 blob
            return httpx.Response(200, json={"tree": [{"path": "index.ts", "type": "blob", "sha": "blob_idx_sha"}]}, request=req)
        if "blobs/blob_idx_sha" in url:
            import base64
            encoded = base64.b64encode(b"export const msg = 'hello';").decode("utf-8")
            return httpx.Response(200, json={"content": encoded}, request=req)
        return httpx.Response(404, request=req)

    monkeypatch.setattr(httpx.AsyncClient, "get", mock_get)

    res = await service.ingest_repository("owner", "repo", ref="HEAD", token="test_token")
    assert res.is_truncated is True
    assert "src/index.ts" in res.source_files
    assert res.source_files["src/index.ts"] == b"export const msg = 'hello';"
