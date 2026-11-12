# Canvello — 7-Phase Engineering Roadmap & Execution Plan

**Document Version:** 1.3.0 (Phase 1 Final Technical Refinement)  
**Status:** Architecture Baseline Under Review  

---

## 1. The Approved 7 Engineering Phases

The development of Canvello is strictly partitioned into seven sequential phases. Each phase requires explicit verification and user approval before proceeding to the next.

```
+─────────────────────────────────────────────────────────────────────────────────+
|                           CANVELLO 7-PHASE ROADMAP                              |
+─────────+──────────────────────────────────────────────+────────────────────────+
| Phase   | Official Phase Title                         | Core Deliverable Focus |
+─────────+──────────────────────────────────────────────+────────────────────────+
| Phase 1 | Project Audit and Architecture Realignment   | Architecture Baseline, |
|         | (CURRENT PHASE - UNDER REVIEW)               | PRD, Threat Model,     |
|         |                                              | Infrastructure Audit   |
+─────────+──────────────────────────────────────────────+────────────────────────+
| Phase 2 | Repository Connection and Analysis           | GitHub App Integration,|
|         |                                              | Tree-sitter AST Parser,|
|         |                                              | NetworkX Hybrid Graph  |
+─────────+──────────────────────────────────────────────+────────────────────────+
| Phase 3 | Interactive Architecture Visualization       | React Three Fiber 3D   |
|         |                                              | Canvas, 3-Level Nav,   |
|         |                                              | Moonlight White UI     |
+─────────+──────────────────────────────────────────────+────────────────────────+
| Phase 4 | Repository Intelligence                      | Configurable AI Adapter|
|         |                                              | Grounded Chat Citations|
|         |                                              | 3D Canvas Spotlighting |
+─────────+──────────────────────────────────────────────+────────────────────────+
| Phase 5 | Agent and Cloud Sandbox                      | E2B MicroVM Sandbox    |
|         |                                              | Pipeline & Validation, |
|         |                                              | Hardened Execution     |
+─────────+──────────────────────────────────────────────+────────────────────────+
| Phase 6 | Architecture Experimentation                 | Targeted Patch Engine, |
|         |                                              | Baseline/Test Diffs,   |
|         |                                              | Evidence Risk Cards    |
+─────────+──────────────────────────────────────────────+────────────────────────+
| Phase 7 | Integration, Security, and Demo Readiness    | End-to-End Hardening,  |
|         |                                              | Empirical Benchmarks,  |
|         |                                              | Offline Golden Demo    |
+─────────+──────────────────────────────────────────────+────────────────────────+
```

---

## 2. Phase 1 Deliverables & Acceptance Checklist

To consider **Phase 1: Project Audit and Architecture Realignment** officially complete, all criteria below must be verified:

- [x] **Project Audit & History**: Workspace status accurately documented (Git tracking uninitialized, application code untouched, four documentation files created and refined).
- [x] **Infrastructure Audit**: Free-tier allowances audited; promotional one-time credits ($100 E2B credit) clearly separated from recurring free quotas.
- [x] **Sandbox Strategy**: E2B microVMs designated as primary prototype candidate subject to benchmarking; Firecracker isolation realistically framed; stage-specific execution limits defined.
- [x] **AI Model Adapter**: Model identifiers made configurable (e.g. Gemini 3.8 Flash, Gemini 3.5 Flash-Lite as examples); dynamic rate-limiting and zero auto-billing enforced.
- [x] **Privacy & Retention**: Exact data artifact taxonomy defined; test log redaction and 32KB cap established; unified diff proprietary code content explicitly stated; independent two-stage consent gates defined.
- [x] **GitHub Security**: Dedicated GitHub App with least-privilege read-only permissions (`Metadata: Read-Only`, `Contents: Read-Only`); server-side token isolation and opaque session cookies defined.
- [x] **Deterministic Scope**: Tree-sitter syntax parsing differentiated from semantic resolution; import handling strategies defined; benchmark targets explicitly noted as aspirational.
- [x] **Master Planning Documentation**:
  - `docs/PRODUCT_REQUIREMENTS.md` (Product vision, personas, hybrid grouping, feature scope).
  - `docs/SYSTEM_ARCHITECTURE.md` (Infrastructure audit, microVM shared responsibilities, stage timeouts).
  - `docs/DATA_FLOW_AND_SECURITY.md` (Artifact taxonomy, log redaction, independent consent gates).
  - `docs/ROADMAP_AND_PHASING.md` (Standardized 7-phase sequence and deliverables).
- [x] **Zero Code/Feature Boundaries**: No application features implemented, no premature dependencies installed, Git remains uninitialized.

---

## 3. Scope & Deliverables for Phase 2: Repository Connection and Analysis

Phase 2 focuses exclusively on the repository connection, file ingestion, deterministic parsing, and hybrid architecture graph generation. Phase 2 produces validated hierarchical graph JSON; interactive 3D WebGL visualization, camera controls, and node physics belong strictly to Phase 3.

### Phase 2 Core Milestones:
1. **GitHub App Connection Service**:
   - GitHub App installation flow and repository selection ("All" vs "Selected").
   - Server-side installation access token management via RS256 JWT exchange (1h TTL).
   - Opaque, encrypted HTTP-only session cookies in the browser.
   - Read-only `Metadata` and `Contents` permissions (zero write access).
   - Immutable snapshot consistency: resolving branch heads to a fixed commit SHA.
   - Paginated Git Data Trees API retrieval with rate-limit tracking (`X-RateLimit-Remaining`).
   - Exclusion filters: binaries, symlinks, submodules, lockfiles, and generated build artifacts.
2. **Deterministic AST Parsing Engine (Tree-sitter)**:
   - Grammars for TypeScript/JavaScript and Python.
   - Extracts imports, exports, functions, classes, and decorators.
   - Resolves relative paths (`./`, `../`) and `tsconfig.json` paths (`@/*`).
   - Explicitly flags dynamic imports (`import(...)`) and unsupported resolution patterns as unresolved.
   - Measurable parser telemetry: parsed syntax count, extracted imports, resolved dependencies, and unresolved/ambiguous dependencies.
3. **Hybrid Architecture Grouping & NetworkX Graph Engine**:
   - Deterministic classification precedence: explicit folder name > naming convention > AST declaration > import pattern.
   - Fallback `Unclassified` category for ambiguous components. Inferred roles labeled with evidence tags.
   - NetworkX graph generation: Level 1 architectural clusters, Level 2 internal nodes, and Level 3 boundary ports/conduits.
4. **Reference Demo & Edge-Case Test Fixtures**:
   - Curated 35-file reference TypeScript + Express + SQLite repository (`canvello-demo-express`) with passing Jest tests.
   - Synthetic test fixtures: circular dependencies, unresolved imports, dynamic imports, malformed source files, duplicate filenames across directories, deep folder hierarchies, and Python relative imports.
5. **Minimal Development & Inspection UI**:
   - Minimal Next.js dev bench to test GitHub connection, select repositories, trigger parsing, and inspect the raw hierarchical graph JSON and telemetry tables. (No 3D canvas or node physics; reserved for Phase 3).
6. **Dependency Hardening & Security Standards**:
   - Pinned stable package versions with lockfiles.
   - Automated vulnerability scanning (`pip-audit`, `npm audit`).
   - Policy: Zero unresolved CRITICAL vulnerabilities; explicit documentation and review of any HIGH findings.
