# Canvello — System Architecture Specification

**Document Version:** 1.3.0 (Phase 1 Final Technical Refinement)  
**Status:** Architecture Baseline Under Review  
**Deployment Target:** Zero-Budget Cloud Infrastructure  

---

## 1. System Overview

Canvello is built as a **website-first, cloud-native distributed architecture**. The end user accesses the application entirely via a modern web browser. **No local runner daemon, Docker Desktop installation, or CLI setup is required** for repository exploration, visualization, chat, or cloud-sandboxed experimentation.

```
                      CANVELLO CLOUD-NATIVE ARCHITECTURE
                      
    [ End-User Web Browser: Modern WebGL Browser ]
           │
           │ HTTPS / WSS
           ▼
    ┌─────────────────────────────────────────────────────────────┐
    │ CLOUD FRONTEND TIER (Hosted on Cloudflare Pages / Vercel)   │
    │ • Next.js 14 / React 18 SPA (Moonlight White Theme)         │
    │ • React Three Fiber / Three.js 3D Canvas Engine             │
    │ • State Orchestrator (Zustand) & Bidirectional Spotlight Bus│
    └─────────────────────────────────────────────────────────────┘
           │
           │ HTTPS / JSON API
           ▼
    ┌─────────────────────────────────────────────────────────────┐
    │ CLOUD BACKEND API TIER (FastAPI / Python 3.11)              │
    │ • GitHub Ingestion & Rate-Limit Cache                       │
    │ • Tree-sitter Deterministic AST Parser Engine               │
    │ • NetworkX Hybrid Graph Computation Service                 │
    │ • Experimentation Orchestration Pipeline                    │
    └─────────────────────────────────────────────────────────────┘
           │                                 │
           │ Configurable Model Adapter      │ Isolated Dispatch
           ▼                                 ▼
    ┌─────────────────────────┐   ┌───────────────────────────────┐
    │ AI ADAPTER LAYER        │   │ ISOLATED CLOUD SANDBOX TIER   │
    │ • Provider-Independent  │   │ • Primary Candidate: E2B      │
    │ • Dynamic Quota Backoff │   │   MicroVMs (Subject to Bench) │
    │ • Configurable Models   │   │ • Controlled Demo Fallback:   │
    │   (Gemini, Groq, Anthr.)│   │   Pre-configured Actions VM   │
    │ • Zero Auto-Billing     │   │ • MicroVM-based Isolation     │
    └─────────────────────────┘   └───────────────────────────────┘
           │
           │ SQL via Supabase REST (TLS 1.3)
           ▼
    ┌─────────────────────────────────────────────────────────────┐
    │ PERSISTENCE TIER (Supabase PostgreSQL Free Tier)            │
    │ • User Profiles & GitHub OAuth Linkage                      │
    │ • Encrypted at Rest (AES-256)                               │
    │ • Repository Snapshot Cache & AST Metadata                  │
    │ • Session Chat History & Grounded Citations                 │
    │ • Experiment Reports & Diff Records                         │
    └─────────────────────────────────────────────────────────────┘
```

---

## 2. Infrastructure & Pricing Analysis

*All free-tier allowances are evaluated based on verified current policies. Promotional one-time credits are explicitly separated from recurring free quotas.*

```
+-----------------------------------------------------------------------------------------------------------------------------------------------+
|                                                    AUDITED ZERO-BUDGET INFRASTRUCTURE                                                         |
+-------------------+----------------------------+-----------+-------------+---------------+--------------------+-------------------------------+
| Provider & Tier   | Free Allowance             | Nature    | Credit Card?| Auto-Charges? | Behavior on Exhaust| Zero-Budget Suitability       |
+-------------------+----------------------------+-----------+-------------+---------------+--------------------+-------------------------------+
| Cloudflare Pages  | Unlimited requests, 500    | Recurring | NO          | NO            | Deployments fail;  | EXCELLENT. Permanent free     |
| (Static Frontend) | builds/mo, 100 custom dom. | Monthly   |             | (Hard cap)    | site remains live. | hosting for Next.js SPA.      |
+-------------------+----------------------------+-----------+-------------+---------------+--------------------+-------------------------------+
| Render            | 750 instance hours/month   | Recurring | NO          | NO            | Service suspended  | ACCEPTABLE FOR DEMO / DEV.    |
| (Free Web Service)| workspace-wide, 512MB RAM  | Monthly   |             | (Hard stop)   | until next month.  | 50s cold start after 15m idle;|
|                   | Spins down after 15m idle  |           |             |               |                    | no persistent disk.           |
+-------------------+----------------------------+-----------+-------------+---------------+--------------------+-------------------------------+
| Hugging Face      | 2 vCPU, 16GB RAM Docker    | Recurring | NO          | NO            | Suspended after    | ACCEPTABLE ALTERNATIVE.       |
| Spaces (CPU Free) | Space. Public endpoints.   | Continuous|             | (Hard stop)   | 48h idle unless    | Always on, but public by      |
|                   | Sleeps after 48h idle.     |           |             |               | pinged.            | default; requires token gate. |
+-------------------+----------------------------+-----------+-------------+---------------+--------------------+-------------------------------+
| Supabase          | 500MB PostgreSQL DB,       | Recurring | NO          | NO            | Pauses after 7     | EXCELLENT. Restores via       |
| (Free Tier)       | 2 free projects, 50k MAU   | Ongoing   |             | (Hard stop)   | days of inactivity.| query/dashboard; zero billing.|
+-------------------+----------------------------+-----------+-------------+---------------+--------------------+-------------------------------+
| Google AI Studio  | Account/Model-dependent.   | Recurring | NO          | NO            | HTTP 429 Rate      | EXCELLENT FOR PUBLIC REPOS.   |
| (Free Tier API)   | Terms vary by project tier | Daily/Min |             | (Hard cap)    | Limit. Never auto- | Must verify account limits;   |
|                   | & model identifier.        |           |             |               | bills.             | requires consent for private. |
+-------------------+----------------------------+-----------+-------------+---------------+--------------------+-------------------------------+
| E2B Sandboxes     | $100 one-time credit       | ONE-TIME  | NO (Hobby)  | NO            | Creation fails     | PRIMARY PROTOTYPE CANDIDATE.  |
| (Cloud Sandbox)   | (NOT recurring). Concurrency| PROMO    |             | (Blocks on $0)| with HTTP 402      | Subject to cost/reliability   |
|                   | capped at 20 microVMs.     |           |             |               | Payment Required.  | benchmarking.                 |
+-------------------+----------------------------+-----------+-------------+---------------+--------------------+-------------------------------+
| GitHub Actions    | 2,000 min/mo (private)     | Recurring | NO          | NO            | Workflow queuing   | CONTROLLED DEMO FALLBACK ONLY.|
| (Pre-configured)  | Unlimited min (public repos| Monthly   |             | (Hard stop)   | fails on limit.    | Limited to Canvello's own     |
|                   | 2-core CPU, 7GB RAM Ubuntu |           |             |               |                    | pre-configured demo repository.|
+-------------------+----------------------------+-----------+-------------+---------------+--------------------+-------------------------------+
```

---

## 3. Sandbox Strategy & MicroVM Security Responsibilities

### 3.1. Realistic MicroVM Security Isolation
E2B provides **microVM-based isolation** powered by the Firecracker hypervisor. While microVMs offer a substantially stronger security boundary than standard shared-kernel containers, **isolation is neither absolute nor invulnerable**. Security requires continuous defense-in-depth across both infrastructure and application layers:

```
+─────────────────────────────────────────────────────────────────────────────────+
|                          SHARED SECURITY RESPONSIBILITY MATRIX                  |
+────────────────────────────────────────┬────────────────────────────────────────+
| E2B Managed Infrastructure Duties      | Canvello Application Duties            |
+────────────────────────────────────────┼────────────────────────────────────────+
| • Hypervisor maintenance & patching    | • Pre-flight parameter & diff validation
| • Host kernel hardening & cgroup caps  | • Credential isolation (zero tokens)   |
| • MicroVM tenant boundary separation   | • Disabling network during test runs   |
| • Ephemeral microVM teardown on exit   | • Stage-specific execution timeouts    |
| • Host hardware resource enforcement   | • Sensitive secret & path redaction    |
+────────────────────────────────────────┴────────────────────────────────────────+
```

1. **Hypervisor & Kernel Hardening**: E2B manages hypervisor patches, host kernel seccomp filters, and cgroup resource isolation between concurrent tenant microVMs.
2. **Canvello Application Controls**:
   - Outbound network access is disabled during test suite execution.
   - The sandbox execution environment never receives GitHub access tokens, database credentials, or secret keys.
   - Resource limits (memory, CPU, process count) and strict stage-specific watchdog timeouts are enforced by Canvello.

### 3.2. Configurable Stage-Specific Execution Limits & Global Ceiling
Rather than an arbitrary single timeout, Canvello structures sandbox execution into discrete stages with configurable upper-bound limits governed by a strict global ceiling. 

> [!IMPORTANT]
> Stage limits represent configurable upper bounds and must **never** be interpreted as guaranteed execution durations. Because stages execute sequentially within an overall job, the **strict global ceiling (default: 120 seconds)** is authoritative: any running stage is immediately interrupted if the cumulative job duration reaches the global ceiling. All limit values are **provisional** and will be empirically benchmarked and calibrated with representative repositories during Phase 5.

```
+----------------------------------------------------------------------------------------------------+
|                                STAGE-SPECIFIC EXECUTION LIMITS (PROVISIONAL)                       |
+--------------------------+-----------------------+-------------------------------------------------+
| Execution Stage          | Configurable Bound    | Behavior on Limit Exceeded                      |
+--------------------------+-----------------------+-------------------------------------------------+
| 1. Dependency Preparation| 60 seconds max bound  | Stage marked TIMEOUT; skip to partial checks.   |
|    (`npm ci --ignore`)   |                       | Report: "Dependency install exceeded 60s".      |
+--------------------------+-----------------------+-------------------------------------------------+
| 2. Compilation / Typecheck| 30 seconds max bound | Stage marked TIMEOUT; record compiler stdout.   |
|    (`npx tsc --noEmit`)  |                       | Report: "Typecheck timed out".                  |
+--------------------------+-----------------------+-------------------------------------------------+
| 3. Test Suite Execution  | 30 seconds max bound  | Hard interrupt; capture partial assertion output|
|    (`npx jest --json`)   |                       | Report: "Test runner interrupted after 30s".    |
+--------------------------+-----------------------+-------------------------------------------------+
| 4. AST Diff & Analysis   | 15 seconds max bound  | Fallback to line-diff only; mark analysis AST   |
|                          |                       | as "Partial Diff".                              |
+--------------------------+-----------------------+-------------------------------------------------+
| AUTHORITATIVE CEILING    | 120 seconds absolute  | Immediate microVM destruction (`SIGKILL`);      |
| (Cumulative Overall Cap) | global maximum        | generate degraded risk card with partial logs.  |
+--------------------------+-----------------------+-------------------------------------------------+
```

### 3.3. Graceful Termination & Partial Reporting
When any stage limit or the global ceiling is reached:
- The execution supervisor gracefully terminates the running process and halts further steps.
- All captured partial `stdout` and `stderr` streams up to the point of termination are collected and sanitized.
- The Risk Assessment Card surfaces an explicit status:
  > *"Risk: HIGH (Inconclusive). Execution timed out during Test Stage (30s limit reached). Automated checks could not complete. 8 assertions passed, remaining assertions unverified."*

---

## 4. Configurable AI Model Adapter & Quota Strategy

The AI integration uses a provider-independent adapter that decouples application logic from specific vendor SDKs.

1. **Configurable Model Identifiers**:
   - Model strings are never hardcoded. They are declared via environment variables with modern examples:
     - `PRIMARY_MODEL_ID`: e.g., `gemini-3.8-flash` or `gemini-3.5-flash-lite`.
     - `FALLBACK_MODEL_ID`: e.g., `groq/llama-3.3-70b-versatile` or `anthropic/claude-3-5-sonnet`.
2. **No Guaranteed Free Quotas**:
   - Quota limits, rate limits, and model availability vary by account tier, geographic region, and provider terms. Canvello assumes no permanent free availability.
   - The adapter inspects provider response headers and gracefully handles `HTTP 429 Too Many Requests` via exponential backoff with jitter.
   - When quota is exhausted, Canvello transitions gracefully to **Deterministic-Only Mode** without service failure.
3. **No Automatic Billing Conversion**:
   - No payment methods are linked to the zero-budget project. Quota exhaustion results in graceful degradation, **never silent conversion to paid meters**.

---

## 5. Deterministic Analysis vs. Semantic Resolution Scope

Tree-sitter provides syntax parsing (CST/AST), **not complete semantic dependency resolution or static type checking**.

```
+----------------------------------------------------------------------------------------------------+
|                                DETERMINISTIC RESOLUTION SCOPE MATRIX                               |
+--------------------------+-----------------------+-------------------------------------------------+
| Import Pattern           | Support Status        | Resolution Strategy                             |
+--------------------------+-----------------------+-------------------------------------------------+
| Relative Imports         | Fully Supported       | Resolves canonical file path based on current   |
| (`./auth`, `../utils`)   | (Deterministic)       | file's directory and standard extensions (.ts,  |
|                          |                       | .tsx, .js, /index.ts).                          |
+--------------------------+-----------------------+-------------------------------------------------+
| Absolute Imports         | Partially Supported   | Resolves against `baseUrl` if defined in root   |
| (`src/components/Nav`)   | (Deterministic)       | `tsconfig.json`. Unresolved paths marked as     |
|                          |                       | external module candidates.                     |
+--------------------------+-----------------------+-------------------------------------------------+
| TypeScript Path Aliases  | Supported for Standard| Parses `compilerOptions.paths` in               |
| (`@/components/*`)       | Static Aliases        | `tsconfig.json`. Custom runtime Webpack/Vite    |
|                          |                       | plugins without tsconfig are unresolvable.      |
+--------------------------+-----------------------+-------------------------------------------------+
| External Packages        | Grouped Aggregates    | Mapped to special "External Dependencies"       |
| (`express`, `react`)     | (Deterministic)       | boundary group. Sub-packages collapsed into     |
|                          |                       | root package node (e.g., `@aws-sdk/s3` -> AWS). |
+--------------------------+-----------------------+-------------------------------------------------+
| Dynamic Imports          | Explicitly Identified | Detected via AST (`import(expression)`), but    |
| (`import(variable)`)     | As Unresolved         | target path cannot be resolved statically.      |
|                          | (No Guessing)         | Flagged as `Unresolved Dynamic Import`.         |
+--------------------------+-----------------------+-------------------------------------------------+
| Generated / Build Files  | Filtered Out          | Explicit ignore list: `node_modules`, `dist/`,  |
| (`.d.ts`, `build/`)      | (Pre-flight Gate)     | `.next/`, `build/`, `coverage/`, `.git/`.       |
+--------------------------+-----------------------+-------------------------------------------------+
```
