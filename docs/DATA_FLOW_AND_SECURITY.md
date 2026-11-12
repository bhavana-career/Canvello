# Canvello — Data Flow, Security & Privacy Specification

**Document Version:** 1.3.0 (Phase 1 Final Technical Refinement)  
**Status:** Architecture Baseline Under Review  

---

## 1. Data Artifact Taxonomy & Detailed Retention Policies

```
+-----------------------------------------------------------------------------------------------------------------------------------------------+
|                                            DATA ARTIFACT TAXONOMY & RETENTION POLICIES                                                        |
+--------------------------+-----------------------+-----------------------+-----------------------+---------------------+----------------------+
| Data Artifact            | Storage Location      | Lifetime / Retention  | Deletion Trigger      | Contains Code?      | Sensitivity Level    |
+--------------------------+-----------------------+-----------------------+-----------------------+---------------------+----------------------+
| Raw Source Files         | Backend Temporary RAM | Ephemeral (< 60s)     | Purged immediately on | YES: Complete       | HIGH: Full           |
| (Staged repo files)      | (`/tmp/canvello_*`)   | during AST parsing.   | graph generation.     | proprietary code.   | repository source.   |
+--------------------------+-----------------------+-----------------------+-----------------------+---------------------+----------------------+
| Source Snippets          | Backend RAM -> Sent   | Ephemeral during      | Never persisted in    | YES: Extracted      | MEDIUM-HIGH: Focused |
| (Functions, interfaces)  | to LLM context window | prompt execution.     | database storage.     | code blocks.        | code excerpts.       |
+--------------------------+-----------------------+-----------------------+-----------------------+---------------------+----------------------+
| Unified Diffs            | Supabase PostgreSQL   | Persistent with       | Deleted when user     | YES: Contains added | MEDIUM-HIGH: Modified|
| (Patch delta lines)      | (Encrypted at rest)   | experiment report.    | removes report.       | & removed code!     | proprietary lines.   |
+--------------------------+-----------------------+-----------------------+-----------------------+---------------------+----------------------+
| Experiment Patches       | Supabase PostgreSQL   | Persistent with       | Deleted when user     | YES: Structured     | MEDIUM: Target       |
| (Pydantic patch schema)  | (Encrypted at rest)   | experiment report.    | removes report.       | code replacements.  | interface changes.   |
+--------------------------+-----------------------+-----------------------+-----------------------+---------------------+----------------------+
| Test Execution Logs      | Supabase PostgreSQL   | Persistent with       | Deleted when user     | NO: Truncated stdout| MEDIUM: May reveal   |
| (stdout / stderr)        | (Sanitized & redacted)| experiment report.    | removes report.       | & assertion logs.   | paths or stack traces|
+--------------------------+-----------------------+-----------------------+-----------------------+---------------------+----------------------+
| Chat Messages & Citations| Supabase PostgreSQL   | Persistent across     | Deleted on user       | NO: Natural language| MEDIUM: User prompts |
| (Prompts & answers)      | (Encrypted at rest)   | user sessions.        | session deletion.     | dialogue + citations.| & discussion context.|
+--------------------------+-----------------------+-----------------------+-----------------------+---------------------+----------------------+
| Architecture Metadata    | Supabase PostgreSQL   | Cached until repo     | Purged on repo        | NO: Structural names| LOW: Graph topology  |
| (Nodes, edges, metrics)  | (Encrypted at rest)   | invalidation.         | re-analysis.          | & metrics only.     | & dependency schema. |
+--------------------------+-----------------------+-----------------------+-----------------------+---------------------+----------------------+
| Sandbox Filesystems      | MicroVM Scratch Disk  | Ephemeral (< 120s max)| Destroyed on microVM  | YES: Temporary full | HIGH: MicroVM disk   |
| (`/workspace`)           | (E2B Firecracker)     | during test run.      | shutdown/SIGKILL.     | repository clone.   | destroyed on exit.   |
+--------------------------+-----------------------+-----------------------+-----------------------+---------------------+----------------------+
```

### Critical Statement on Unified Diffs & Proprietary Code
*Explicit Disclosure*: While complete raw source files are never written to the Supabase database, **unified diffs stored in experiment records DO contain actual source code lines (the modified, added, and removed lines of code)**. Therefore, experiment reports must be treated as proprietary assets subject to database encryption and user-controlled deletion.

---

## 2. Test Output Sanitization, Redaction & Defense-in-Depth Precautions

Test logs, compiler errors, stack traces, and build outputs can inadvertently expose internal server paths, database connection strings, environment variables, or proprietary logic. Canvello enforces layered sanitization and secret-minimization precautions:

> [!WARNING]
> Regex-based secret redaction is a **defense-in-depth precaution, not an absolute guarantee**. Complex encodings, non-standard key formats, or obfuscated tokens can evade pattern matching. Canvello supplements pattern scanning with strict environment isolation, output filtering, and payload minimization.

1. **Automated Secret Redaction Pipeline**:
   - Before any `stdout` or `stderr` stream is saved to Supabase, presented in the UI, or passed to an LLM context window, it passes through an automated regex scrubber.
   - Patterns scanned and redacted:
     - API keys, bearer tokens, and JWTs (`[REDACTED_TOKEN]`).
     - Database connection URIs and credentials (`[REDACTED_DATABASE_URI]`).
     - Absolute local machine paths (`/home/user/...` $\rightarrow$ `[WORKSPACE]/...`).
     - Environment variable assignments containing `SECRET`, `PASSWORD`, `KEY`, or `AUTH`.
2. **Environment & Sandbox Credential Isolation**:
   - The execution sandbox environment is launched with an empty, restricted set of environment variables (`PATH`, `NODE_ENV`, `CI=true`). Host secrets and cloud provider tokens are strictly barred from the container environment.
3. **Pre-Ingestion Secret Scanning**:
   - Files matching known sensitive patterns (e.g., `.env*`, `*.pem`, `*.key`, `id_rsa`, `credentials.json`) are blocked from being ingested into prompt context or transferred to model providers.
4. **Strict Output-Size Caps**:
   - Compiler and test execution outputs are truncated to a maximum of **32 KB** per stream. Runaway logs or infinite loops are halted and appended with:
     `... [OUTPUT TRUNCATED: Exceeded 32KB Limit]`.

---

## 3. Database Security, Encryption & Access Boundaries

Relying on Row Level Security (RLS) alone does **not** provide complete data protection. Canvello implements layered database governance:

```
+─────────────────────────────────────────────────────────────────────────────────+
|                           DATABASE SECURITY ARCHITECTURE                        |
|                                                                                 |
|  [ Client Browser: Next.js ]                                                    |
|         │                                                                       |
|         │ HTTPS / TLS 1.3 (Scoped User JWT)                                     |
|         ▼                                                                       |
|  [ Supabase PostgreSQL ]                                                        |
|  ├── Encryption at Rest: AES-256 storage volume encryption                      |
|  ├── In-Transit: Enforced TLS 1.3 encryption for all connections                |
|  ├── Row Level Security (RLS): Policy `auth.uid() = user_id` restricts all      |
|  │   direct queries from client-side JWTs (prevents cross-tenant leaks)         |
|  └── Cascading Deletion: Deleting an account or repository session executes     |
|      `ON DELETE CASCADE`, purging all associated diffs, reports, and messages   |
|                                                                                 |
|  ══════════════════════ [ Privileged Boundary Isolation ] ═════════════════════  |
|                                                                                 |
|  [ Backend API Gateway ]                                                        |
|  • Privileged `service_role` administrative key is held ONLY in backend server  |
|    environment variables (never sent to client bundles or browser cookies)     |
|  • Backend access is restricted to system tasks (e.g., automated pruning)       |
+─────────────────────────────────────────────────────────────────────────────────+
```

---

## 4. Independent Two-Stage Consent Governance

For private repositories, Canvello enforces **two completely independent consent controls**. Users may accept one, both, or neither. Refusing one permission disables only the specific capability that requires it:

```
+─────────────────────────────────────────────────────────────────────────────────+
|                       INDEPENDENT TWO-STAGE CONSENT MATRIX                      |
+───────────────────+───────────────────+─────────────────────────────────────────+
| Gate 1: AI Cloud  | Gate 2: Sandbox   | Resulting Operational Behavior          |
| Snippets Consent  | Cloud Copy Consent|                                         |
+───────────────────+───────────────────+─────────────────────────────────────────+
| APPROVED          | APPROVED          | FULL SYSTEM: Grounded chat, dual file   |
|                   |                   | summaries, and sandboxed experiments.   |
+───────────────────+───────────────────+─────────────────────────────────────────+
| APPROVED          | DECLINED          | REPO CHAT & THEORETICAL DIFFS: Chat and |
|                   |                   | summaries active. Patches generated by  |
|                   |                   | AI but marked "UNVERIFIED (Sandbox Off)"|
|                   |                   | No code is sent to cloud sandbox.       |
+───────────────────+───────────────────+─────────────────────────────────────────+
| DECLINED          | APPROVED          | DETERMINISTIC SANDBOX ONLY: Zero AI.    |
|                   |                   | Sandbox operations are strictly user-   |
|                   |                   | initiated (e.g. running baseline tests  |
|                   |                   | or pre-defined presets). No autonomous  |
|                   |                   | AI-driven code modification permitted.  |
|                   |                   | Zero code sent to external LLMs.        |
+───────────────────+───────────────────+─────────────────────────────────────────+
| DECLINED          | DECLINED          | DETERMINISTIC-ONLY MODE: Zero external  |
|                   |                   | data leaves backend. Full 3D canvas,    |
|                   |                   | AST syntax facts, and graph navigation. |
+───────────────────+───────────────────+─────────────────────────────────────────+
```

### Deterministic-Only Mode Clarification
**Deterministic-Only Mode** means:
1. **Zero External LLM Processing**: No source snippets, identifiers, or prompts are transmitted to any cloud AI provider.
2. **Zero Cloud Sandbox Execution**: No repository archives or copies are transferred to cloud microVMs.
3. **Backend Analysis Retained**: Deterministic syntax parsing (Tree-sitter) and graph modeling (NetworkX) execute entirely on Canvello's cloud backend.
4. **Subject to User Permissions**: GitHub repository access remains strictly governed by the user's explicit GitHub App authorization and repository selection.

### User-Initiated Sandbox Constraint
When AI Consent is declined but Sandbox Consent is granted, **sandbox operations must remain explicitly user-initiated**. The user manually triggers test execution, baseline verification, or pre-configured experiment presets. **Autonomous AI-driven modifications are strictly disabled**.

- **Revocability**: Users can update or revoke either consent permission at any time via repository settings. Revocation halts further data transfer immediately.

---

## 5. Precise GitHub App Permissions & Token Isolation

```
+----------------------------------------------------------------------------------------------------+
|                                    GITHUB APP PERMISSION SPECIFICATION                             |
+--------------------------+-----------------------+-------------------------------------------------+
| Permission Name          | Access Level          | Justification & Operational Boundary            |
+--------------------------+-----------------------+-------------------------------------------------+
| Repository Metadata      | Read-Only (Mandatory) | Inspect repository name, owner, default branch, |
|                          |                       | and public/private status.                      |
+--------------------------+-----------------------+-------------------------------------------------+
| Repository Contents      | Read-Only             | Read directory trees, file contents, and commit |
|                          |                       | snapshots via REST/GraphQL. Zero write access.  |
+--------------------------+-----------------------+-------------------------------------------------+
| Repository Selection     | User Installation     | User explicitly selects "All repositories" or   |
|                          | Choice                | grants access to specific individual repos.     |
+--------------------------+-----------------------+-------------------------------------------------+
| FORBIDDEN / EXCLUDED     | NO Actions Access     | Canvello NEVER requests `actions:write`,        |
| PERMISSIONS              | NO Workflows Access   | `workflows:write`, `pull_requests:write`, or    |
|                          | NO Admin Access       | `administration:write` on user repositories.    |
+--------------------------+-----------------------+-------------------------------------------------+
```

- **Token Isolation**: GitHub App tokens reside exclusively in backend memory. The browser client receives only an encrypted, opaque, HTTP-only session cookie.
