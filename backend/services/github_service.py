import os
import time
from datetime import datetime, timezone
from typing import Dict, List, Optional, Set, Tuple
import httpx
import jwt
from config import settings


class GitHubAuthError(Exception):
    """Base exception for GitHub API authentication/authorization failures."""
    pass


class GitHubInstallationRevokedError(GitHubAuthError):
    """Raised when an installation ID has been deleted or uninstalled."""
    pass


class GitHubRateLimitExhaustedError(GitHubAuthError):
    """Raised when GitHub API rate limits have been completely exhausted."""
    pass


class GitHubReauthorizationRequiredError(GitHubAuthError):
    """Raised when user credentials/tokens are expired, revoked, or insufficient."""
    pass


class GitHubIngestionResult:
    def __init__(self):
        self.commit_sha: str = ""
        self.branch: str = "main"
        self.source_files: Dict[str, bytes] = {}  # canonical path -> raw bytes
        self.config_files: Dict[str, str] = {}    # canonical path -> decoded text
        self.is_truncated: bool = False
        self.truncation_reason: Optional[str] = None
        self.scanned_file_count: int = 0
        self.observed_byte_count: int = 0
        self.total_repository_file_count: Optional[int] = None
        self.language_breakdown: Dict[str, int] = {}


class GitHubService:
    def __init__(self):
        self._token_cache: Dict[str, Tuple[str, float]] = {}  # cache_key -> (token, expires_at_timestamp)

    def generate_app_jwt(self) -> str:
        """Mints an RS256 JWT using the GitHub App's private key."""
        if not settings.GITHUB_APP_PRIVATE_KEY:
            raise ValueError("GITHUB_APP_PRIVATE_KEY is not configured")

        now = int(time.time())
        payload = {
            "iat": now - 60,       # 60s in past for clock skew
            "exp": now + (10 * 60), # 10 minutes TTL
            "iss": settings.GITHUB_APP_ID,
        }
        return jwt.encode(payload, settings.GITHUB_APP_PRIVATE_KEY, algorithm="RS256")

    async def exchange_oauth_code_for_user_token(self, code: str) -> Dict[str, str]:
        """
        Exchanges GitHub OAuth authorization code for a user access token and optional refresh token.
        """
        url = "https://github.com/login/oauth/access_token"
        headers = {"Accept": "application/json"}
        payload = {
            "client_id": settings.GITHUB_APP_CLIENT_ID,
            "client_secret": settings.GITHUB_APP_CLIENT_SECRET,
            "code": code,
            "redirect_uri": settings.GITHUB_APP_CALLBACK_URL,
        }
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, headers=headers, json=payload)
            resp.raise_for_status()
            data = resp.json()
            if "error" in data:
                raise GitHubAuthError(f"OAuth code exchange failed: {data.get('error_description', data['error'])}")
            return data

    async def refresh_user_access_token(self, refresh_token: str) -> Dict[str, str]:
        """
        Refreshes an expiring user-to-server access token using GitHub's refresh_token grant.
        """
        url = "https://github.com/login/oauth/access_token"
        headers = {"Accept": "application/json"}
        payload = {
            "client_id": settings.GITHUB_APP_CLIENT_ID,
            "client_secret": settings.GITHUB_APP_CLIENT_SECRET,
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
        }
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, headers=headers, json=payload)
            resp.raise_for_status()
            data = resp.json()
            if "error" in data:
                raise GitHubReauthorizationRequiredError(f"User token refresh failed: {data.get('error_description', data['error'])}")
            return data

    async def verify_installation_ownership(self, user_access_token: str, installation_id: int) -> bool:
        """
        Verifies that the provided installation ID is owned by or authorized for the authenticated user.
        Queries /user/installations with user Bearer token to prevent cross-account installation hijacking.
        """
        url = "https://api.github.com/user/installations"
        headers = {
            "Authorization": f"Bearer {user_access_token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, headers=headers)
            if resp.status_code == 401:
                raise GitHubReauthorizationRequiredError("User access token invalid or expired during installation verification")
            if resp.status_code != 200:
                return False

            data = resp.json()
            installations = data.get("installations", [])
            for inst in installations:
                if inst.get("id") == installation_id:
                    return True
        return False

    async def get_installation_access_token(self, installation_id: int, repository_target: Optional[str] = None) -> str:
        """
        Retrieves or renews a scope-aware installation access token.
        Cache key includes repository_target to ensure scope isolation.
        """
        cache_key = f"inst_token:{installation_id}:{repository_target or 'all'}"
        now = time.time()

        if cache_key in self._token_cache:
            token, exp = self._token_cache[cache_key]
            if exp - now > 300:  # 5 minutes safety margin
                return token

        app_jwt = self.generate_app_jwt()
        url = f"https://api.github.com/app/installations/{installation_id}/access_tokens"
        headers = {
            "Authorization": f"Bearer {app_jwt}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }
        body = {}
        if repository_target:
            repo_name = repository_target.split("/")[-1]
            body["repositories"] = [repo_name]
            body["permissions"] = {"metadata": "read", "contents": "read"}

        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, headers=headers, json=body)
            if resp.headers.get("x-ratelimit-remaining") == "0":
                raise GitHubRateLimitExhaustedError("GITHUB_RATE_LIMIT_EXHAUSTED: Rate limit remaining is 0")

            if resp.status_code in [404, 401]:
                # Independent verification before declaring revoked
                verify_resp = await client.get(
                    f"https://api.github.com/app/installations/{installation_id}",
                    headers=headers
                )
                if verify_resp.status_code in [404, 401]:
                    raise GitHubInstallationRevokedError(f"INSTALLATION_REVOKED: Installation {installation_id} is deleted or inaccessible")
                raise GitHubAuthError(f"GITHUB_AUTH_FAILED: {resp.text}")

            resp.raise_for_status()
            data = resp.json()
            token = data["token"]
            expires_at_str = data["expires_at"]
            # Parse ISO 8601 timestamp
            dt = datetime.fromisoformat(expires_at_str.replace("Z", "+00:00"))
            exp_timestamp = dt.timestamp()

            self._token_cache[cache_key] = (token, exp_timestamp)
            return token

    async def ingest_repository(
        self,
        owner: str,
        repo: str,
        ref: str = "HEAD",
        token: Optional[str] = None
    ) -> GitHubIngestionResult:
        """
        Fetches repository trees and files using Git Data Trees API.
        Falls back to iterative non-recursive subtree traversal if truncated.
        """
        result = GitHubIngestionResult()
        headers = {
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }
        if token:
            headers["Authorization"] = f"Bearer {token}"

        async with httpx.AsyncClient(timeout=30.0) as client:
            # 1. Resolve commit SHA
            commit_resp = await client.get(f"https://api.github.com/repos/{owner}/{repo}/commits/{ref}", headers=headers)
            commit_resp.raise_for_status()
            commit_data = commit_resp.json()
            result.commit_sha = commit_data["sha"]
            result.branch = ref if ref != "HEAD" else "main"

            # 2. Attempt recursive tree fetch
            tree_url = f"https://api.github.com/repos/{owner}/{repo}/git/trees/{result.commit_sha}?recursive=1"
            tree_resp = await client.get(tree_url, headers=headers)
            tree_resp.raise_for_status()
            tree_data = tree_resp.json()

            is_truncated = tree_data.get("truncated", False)
            if not is_truncated:
                # Direct full recovery
                raw_items = tree_data.get("tree", [])
                await self._process_tree_items(client, owner, repo, raw_items, headers, result)
            else:
                # Subtree recovery pipeline
                result.is_truncated = True
                await self._recover_subtrees_iteratively(client, owner, repo, result.commit_sha, headers, result)

        return result

    async def _recover_subtrees_iteratively(
        self,
        client: httpx.AsyncClient,
        owner: str,
        repo: str,
        commit_sha: str,
        headers: Dict[str, str],
        result: GitHubIngestionResult
    ):
        """Iterative non-recursive BFS traversal subject to explicit budgets."""
        start_time = time.time()
        http_requests_count = 0
        MAX_REQUESTS = settings.MAX_INGESTION_FILES // 15
        MAX_TIME = settings.MAX_INGESTION_TIME_SECONDS

        # 1. Fetch root tree non-recursively
        root_resp = await client.get(f"https://api.github.com/repos/{owner}/{repo}/git/trees/{commit_sha}", headers=headers)
        http_requests_count += 1
        root_data = root_resp.json()
        directory_queue: List[Tuple[str, str]] = []  # (dir_path, dir_sha)

        for item in root_data.get("tree", []):
            if item["type"] == "tree" and not self._is_ignored_directory(item["path"]):
                directory_queue.append((item["path"], item["sha"]))
            elif item["type"] == "blob":
                await self._handle_single_blob(client, owner, repo, item["path"], item["sha"], headers, result)

        # 2. BFS Traverse Subtrees
        while directory_queue:
            if http_requests_count >= MAX_REQUESTS:
                result.truncation_reason = "EXCEEDED_HTTP_REQUEST_BUDGET"
                break
            if time.time() - start_time >= MAX_TIME:
                result.truncation_reason = "EXCEEDED_TIME_BUDGET"
                break
            if result.scanned_file_count >= settings.MAX_INGESTION_FILES:
                result.truncation_reason = "EXCEEDED_MAX_FILE_BUDGET"
                break

            current_dir_path, current_dir_sha = directory_queue.pop(0)
            subtree_resp = await client.get(
                f"https://api.github.com/repos/{owner}/{repo}/git/trees/{current_dir_sha}",
                headers=headers
            )
            http_requests_count += 1

            if subtree_resp.status_code == 200:
                sub_data = subtree_resp.json()
                for sub_item in sub_data.get("tree", []):
                    rel_path = f"{current_dir_path}/{sub_item['path']}"
                    if sub_item["type"] == "tree" and not self._is_ignored_directory(sub_item["path"]):
                        directory_queue.append((rel_path, sub_item["sha"]))
                    elif sub_item["type"] == "blob":
                        await self._handle_single_blob(client, owner, repo, rel_path, sub_item["sha"], headers, result)

    async def _process_tree_items(self, client, owner, repo, items, headers, result):
        for item in items:
            if item.get("type") != "blob":
                continue
            # Filter mode: 160000 = submodule, 120000 = symlink
            if item.get("mode") in ["160000", "120000"]:
                continue
            path = item.get("path", "")
            sha = item.get("sha", "")
            await self._handle_single_blob(client, owner, repo, path, sha, headers, result)

    async def _handle_single_blob(self, client, owner, repo, path, sha, headers, result):
        clean_path = path.replace("\\", "/").strip()
        if self._is_ignored_path(clean_path):
            return

        result.scanned_file_count += 1
        ext = "." + clean_path.split(".")[-1].lower() if "." in clean_path else ""

        # Language breakdown tracking
        if ext:
            result.language_breakdown[ext] = result.language_breakdown.get(ext, 0) + 1

        is_source = ext in [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py"]
        is_config = self._is_config_allowlist(clean_path)

        if not (is_source or is_config):
            return

        # Fetch blob content
        try:
            blob_resp = await client.get(
                f"https://api.github.com/repos/{owner}/{repo}/git/blobs/{sha}",
                headers=headers
            )
            if blob_resp.status_code == 200:
                import base64
                bdata = blob_resp.json()
                raw_bytes = base64.b64decode(bdata.get("content", ""))
                result.observed_byte_count += len(raw_bytes)

                if is_source:
                    result.source_files[clean_path] = raw_bytes
                if is_config:
                    try:
                        result.config_files[clean_path] = raw_bytes.decode("utf-8")
                    except Exception:
                        pass
        except Exception:
            pass

    def load_from_local_directory(self, local_dir_path: str) -> GitHubIngestionResult:
        """
        Loads repository files directly from local filesystem for offline demo / unit testing.
        Uses identical filtering logic as the remote GitHub ingestion client.
        """
        result = GitHubIngestionResult()
        result.commit_sha = "local-snapshot-sha-000000000000000000"
        result.branch = "main"

        for root, dirs, files in os.walk(local_dir_path):
            dirs[:] = [d for d in dirs if not self._is_ignored_directory(d)]
            for file in files:
                abs_path = os.path.join(root, file)
                rel_path = os.path.relpath(abs_path, local_dir_path).replace("\\", "/")

                if self._is_ignored_path(rel_path):
                    continue

                result.scanned_file_count += 1
                ext = "." + rel_path.split(".")[-1].lower() if "." in rel_path else ""
                if ext:
                    result.language_breakdown[ext] = result.language_breakdown.get(ext, 0) + 1

                is_source = ext in [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py"]
                is_config = self._is_config_allowlist(rel_path)

                if is_source or is_config:
                    try:
                        with open(abs_path, "rb") as f:
                            raw_bytes = f.read()
                        result.observed_byte_count += len(raw_bytes)
                        if is_source:
                            result.source_files[rel_path] = raw_bytes
                        if is_config:
                            result.config_files[rel_path] = raw_bytes.decode("utf-8", errors="replace")
                    except Exception:
                        pass

        return result

    @staticmethod
    def _is_ignored_directory(name: str) -> bool:
        return name in [
            "node_modules", ".git", ".next", "dist", "build", "coverage",
            "__pycache__", ".venv", "venv", ".idea", ".vscode"
        ]

    @staticmethod
    def _is_ignored_path(path: str) -> bool:
        p = path.lower()
        if any(seg in p.split("/") for seg in ["node_modules", ".git", ".next", "dist", "build", "coverage", "__pycache__", ".venv", "venv"]):
            return True
        ext = "." + p.split(".")[-1] if "." in p else ""
        if ext in [".png", ".jpg", ".jpeg", ".gif", ".ico", ".svg", ".wasm", ".zip", ".tar", ".gz", ".exe", ".pdf", ".lock"]:
            return True
        if p.endswith("package-lock.json") or p.endswith("yarn.lock") or p.endswith("pnpm-lock.yaml"):
            return True
        return False

    @staticmethod
    def _is_config_allowlist(path: str) -> bool:
        basename = path.split("/")[-1].lower()
        return basename in [
            "tsconfig.json", "tsconfig.base.json", "package.json",
            "pyproject.toml", "setup.py", "setup.cfg", "requirements.txt"
        ]
